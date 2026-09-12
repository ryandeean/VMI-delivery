/**
 * Thin wrappers around the Google Routes API (route matrix + directions with
 * traffic) and Geocoding. Callers decide what to do when a key is missing.
 */
import { config } from "../config";
import type { LatLng } from "../geo";
import type { Matrix } from "./solver";

const ROUTES_MATRIX_URL = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";
const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";

export function googleRoutingAvailable(): boolean {
  return Boolean(config.googleMapsKey());
}

function waypoint(p: LatLng) {
  return { location: { latLng: { latitude: p.lat, longitude: p.lng } } };
}

/** Google refuses departure times in the past; we plan against "now" in that case. */
function departureTimeField(departure?: Date | null): { departureTime?: string } {
  if (!departure) return {};
  const minFuture = Date.now() + 90_000;
  if (departure.getTime() < minFuture) return {};
  return { departureTime: departure.toISOString() };
}

function parseDuration(d: string | undefined): number {
  if (!d) return 0;
  return Math.round(Number(String(d).replace(/s$/, "")) || 0);
}

async function post<T>(url: string, fieldMask: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": config.googleMapsKey(),
      "X-Goog-FieldMask": fieldMask,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google Routes API ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

type MatrixElement = {
  originIndex: number;
  destinationIndex: number;
  duration?: string;
  staticDuration?: string;
  distanceMeters?: number;
  condition?: string;
};

/** Traffic-aware travel time matrix for the given departure time. Points[0] should be the depot. */
export async function googleRouteMatrix(points: LatLng[], departure?: Date | null): Promise<Matrix> {
  const n = points.length;
  const seconds: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const meters: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  if (n < 2) return { seconds, meters };
  const elements = await post<MatrixElement[]>(
    ROUTES_MATRIX_URL,
    "originIndex,destinationIndex,duration,staticDuration,distanceMeters,condition",
    {
      origins: points.map((p) => ({ waypoint: waypoint(p) })),
      destinations: points.map((p) => ({ waypoint: waypoint(p) })),
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
      ...departureTimeField(departure),
    },
  );
  for (const el of elements) {
    if (el.condition && el.condition !== "ROUTE_EXISTS") continue;
    seconds[el.originIndex][el.destinationIndex] = parseDuration(el.duration ?? el.staticDuration);
    meters[el.originIndex][el.destinationIndex] = el.distanceMeters ?? 0;
  }
  return { seconds, meters };
}

export type GoogleRoute = {
  polyline: string;
  legs: { seconds: number; meters: number }[];
  totalSeconds: number;
  totalMeters: number;
};

type RoutesResponse = {
  routes?: {
    duration?: string;
    distanceMeters?: number;
    polyline?: { encodedPolyline?: string };
    legs?: { duration?: string; staticDuration?: string; distanceMeters?: number }[];
  }[];
};

/** Full route depot -> stops (in the given order) -> depot, with a drawable polyline. */
export async function googleComputeRoute(depot: LatLng, stops: LatLng[], departure?: Date | null): Promise<GoogleRoute> {
  const body = {
    origin: waypoint(depot),
    destination: waypoint(depot),
    intermediates: stops.map(waypoint),
    travelMode: "DRIVE",
    // Best traffic model allows up to 10 intermediates; fall back to the standard model above that.
    routingPreference: stops.length <= 10 ? "TRAFFIC_AWARE_OPTIMAL" : "TRAFFIC_AWARE",
    polylineQuality: "OVERVIEW",
    languageCode: "en-GB",
    units: "IMPERIAL",
    ...departureTimeField(departure),
  };
  const data = await post<RoutesResponse>(
    ROUTES_URL,
    "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.duration,routes.legs.staticDuration,routes.legs.distanceMeters",
    body,
  );
  const route = data.routes?.[0];
  if (!route) throw new Error("Google returned no route");
  const legs = (route.legs ?? []).map((l) => ({ seconds: parseDuration(l.duration ?? l.staticDuration), meters: l.distanceMeters ?? 0 }));
  return {
    polyline: route.polyline?.encodedPolyline ?? "",
    legs,
    totalSeconds: parseDuration(route.duration),
    totalMeters: route.distanceMeters ?? 0,
  };
}

export type GeocodeResult = { lat: number; lng: number; formatted: string; source: "GOOGLE" | "POSTCODES_IO" };

/**
 * Turn an address into coordinates. Uses Google when a key exists; otherwise
 * falls back to the free postcodes.io service (UK postcodes only).
 */
export async function geocodeAddress(address: string, postcode?: string): Promise<GeocodeResult | null> {
  const key = config.googleMapsKey();
  if (key && address.trim()) {
    const url = `${GEOCODE_URL}?address=${encodeURIComponent(address)}&region=gb&key=${key}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = (await res.json()) as { status: string; results?: { formatted_address: string; geometry: { location: { lat: number; lng: number } } }[] };
      const r = data.results?.[0];
      if (r) return { lat: r.geometry.location.lat, lng: r.geometry.location.lng, formatted: r.formatted_address, source: "GOOGLE" };
    }
  }
  const pc = (postcode || extractUkPostcode(address) || "").replace(/\s+/g, "");
  if (pc) {
    const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`);
    if (res.ok) {
      const data = (await res.json()) as { result?: { latitude: number; longitude: number; postcode: string } };
      if (data.result) return { lat: data.result.latitude, lng: data.result.longitude, formatted: data.result.postcode, source: "POSTCODES_IO" };
    }
  }
  return null;
}

export function extractUkPostcode(text: string): string | null {
  const m = text.toUpperCase().match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/);
  return m ? m[1] : null;
}
