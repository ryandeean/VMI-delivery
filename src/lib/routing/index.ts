/**
 * planRoute: the one function the rest of the app calls to turn a run's stops
 * into an ordered, timed route. Uses Google (traffic) when configured and a
 * distance estimate otherwise, so planning always works.
 */
import { hasCoords, type LatLng } from "../geo";
import { estimateMatrix } from "./fallback";
import { googleComputeRoute, googleRouteMatrix, googleRoutingAvailable } from "./google";
import { computeSchedule, suggestStart, type LegTime, type Schedule, type StopForSchedule } from "./schedule";
import { legsForOrder, solveOrder, type Matrix } from "./solver";

export type RouteStopInput = StopForSchedule & { lat: number | null; lng: number | null };

export type PlanRouteParams = {
  depot: LatLng;
  stops: RouteStopInput[];
  earliestStart: Date;
  latestStart: Date;
  dayEnd: Date;
  bufferMinutes: number;
  /** Keep the stops in the order given (dispatcher dragged them by hand). */
  keepOrder?: boolean;
  /** Dispatcher fixed the departure time. */
  fixedStart?: Date | null;
  useGoogle?: boolean;
};

export type PlanRouteResult = {
  order: string[];
  schedule: Schedule;
  polyline: string;
  source: "GOOGLE" | "ESTIMATE";
  warnings: string[];
};

export async function planRoute(params: PlanRouteParams): Promise<PlanRouteResult> {
  const warnings: string[] = [];
  const useGoogle = params.useGoogle ?? googleRoutingAvailable();
  const located = params.stops.filter((s) => hasCoords(s));
  const unlocated = params.stops.filter((s) => !hasCoords(s));
  for (const s of unlocated) warnings.push(`Stop ${s.id} has no map location; it is placed last with no travel time.`);

  const points: LatLng[] = [params.depot, ...located.map((s) => ({ lat: s.lat as number, lng: s.lng as number }))];
  const seedStart = params.fixedStart ?? params.earliestStart;

  let matrix: Matrix;
  let source: "GOOGLE" | "ESTIMATE" = "ESTIMATE";
  if (useGoogle && located.length) {
    try {
      matrix = await googleRouteMatrix(points, seedStart);
      source = "GOOGLE";
    } catch (e) {
      warnings.push(`Google travel times unavailable, using estimates (${(e as Error).message})`);
      matrix = estimateMatrix(points);
    }
  } else {
    matrix = estimateMatrix(points);
  }

  const orderIdx = params.keepOrder ? located.map((_, i) => i + 1) : solveOrder(seedStart, located, matrix);
  const orderedStops = orderIdx.map((i) => located[i - 1]);
  let legs: LegTime[] = legsForOrder(matrix, orderIdx);

  const start =
    params.fixedStart ??
    suggestStart({
      earliest: params.earliestStart,
      latest: params.latestStart,
      dayEnd: params.dayEnd,
      stops: orderedStops,
      legs,
      bufferMinutes: params.bufferMinutes,
    });

  let polyline = "";
  if (source === "GOOGLE" && orderedStops.length) {
    try {
      const route = await googleComputeRoute(
        params.depot,
        orderedStops.map((s) => ({ lat: s.lat as number, lng: s.lng as number })),
        start,
      );
      if (route.legs.length === orderedStops.length + 1) legs = route.legs;
      polyline = route.polyline;
    } catch (e) {
      warnings.push(`Could not fetch the final route from Google (${(e as Error).message}); times are from the matrix.`);
    }
  }

  const allStops: StopForSchedule[] = [...orderedStops, ...unlocated];
  const allLegs: LegTime[] = [...legs.slice(0, orderedStops.length), ...unlocated.map(() => ({ seconds: 0, meters: 0 })), legs[orderedStops.length] ?? { seconds: 0, meters: 0 }];
  const schedule = computeSchedule(start, allStops, allLegs);
  for (const s of schedule.stops) {
    if (s.lateS > 0) warnings.push(`Stop ${s.id} is planned ${Math.round(s.lateS / 60)} min after its slot closes.`);
  }
  if (schedule.end.getTime() > params.dayEnd.getTime()) {
    warnings.push(`Run finishes after the end of the working day (${Math.round((schedule.end.getTime() - params.dayEnd.getTime()) / 60_000)} min over).`);
  }
  return { order: allStops.map((s) => s.id), schedule, polyline, source, warnings };
}

/** Live travel time from one point to another, leaving now (used for "driver on the way" emails). */
export async function liveLeg(from: LatLng, to: LatLng): Promise<{ seconds: number; meters: number; source: "GOOGLE" | "ESTIMATE" }> {
  if (googleRoutingAvailable()) {
    try {
      const m = await googleRouteMatrix([from, to], new Date());
      if (m.seconds[0][1] > 0) return { seconds: m.seconds[0][1], meters: m.meters[0][1], source: "GOOGLE" };
    } catch {
      // fall through to the estimate
    }
  }
  const e = estimateMatrix([from, to]);
  return { seconds: e.seconds[0][1], meters: e.meters[0][1], source: "ESTIMATE" };
}
