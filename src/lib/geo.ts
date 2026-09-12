export type LatLng = { lat: number; lng: number };

const R = 6_371_000; // metres

export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Bearing in degrees (0..360) from a to b. Used for "sweep" clustering. */
export function bearingDegrees(a: LatLng, b: LatLng): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLng);
  const deg = (Math.atan2(y, x) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/**
 * Rough road-travel estimate when Google is not configured: straight-line
 * distance inflated for real roads, at speeds that fall with distance
 * (city crawl for short hops, faster on longer legs).
 */
export function estimateLegSeconds(a: LatLng, b: LatLng): { meters: number; seconds: number } {
  const straight = haversineMeters(a, b);
  const meters = Math.round(straight * 1.35);
  const km = meters / 1000;
  const speedKmh = km < 5 ? 18 : km < 20 ? 28 : km < 60 ? 45 : 70;
  const seconds = Math.round((km / speedKmh) * 3600) + 120; // + 2 min for parking / manoeuvring
  return { meters, seconds };
}

export function hasCoords(p: { lat: number | null | undefined; lng: number | null | undefined }): p is { lat: number; lng: number } {
  return typeof p.lat === "number" && typeof p.lng === "number" && !Number.isNaN(p.lat) && !Number.isNaN(p.lng);
}
