/**
 * "Plan my day" heuristic: groups the day's unscheduled jobs into rounds by
 * direction from the depot (a sweep), keeps each round within the capacity of
 * the largest available vehicle and a stop limit, then gives every round the
 * smallest vehicle that fits and a driver licensed to drive it.
 * The dispatcher can then adjust by dragging stops between runs.
 */
import { bearingDegrees, hasCoords, type LatLng } from "../geo";
import { checkFit, licenceCovers, smallestFittingVehicle, sumLoads, vehicleClass, type VehicleLike } from "../vehicles";
import { estimateMatrix } from "../routing/fallback";
import { computeSchedule, suggestStart, type Schedule } from "../routing/schedule";
import { legsForOrder, solveOrder } from "../routing/solver";

export type PlannerJob = {
  id: string;
  lat: number | null;
  lng: number | null;
  volumeM3: number;
  weightKg: number;
  serviceMinutes: number;
  windowStart: Date | null;
  windowEnd: Date | null;
};

export type PlannerDriver = { id: string; name: string; licenceCategories: string; existingRuns: number };

export type PlannerResult = {
  runs: { driverId: string; vehicleId: string; jobIds: string[] }[];
  unassigned: { jobId: string; reason: string }[];
};

export type PlannerOptions = {
  depot: LatLng;
  jobs: PlannerJob[];
  drivers: PlannerDriver[];
  vehicles: VehicleLike[];
  maxStopsPerRun: number;
  /** Earliest a van can leave the depot and latest it should be back. */
  earliestStart: Date;
  dayEnd: Date;
  /** Longest a single run may take door to door. */
  maxRunSeconds: number;
};

const LATE_TOLERANCE_S = 5 * 60;

/** Rough timetable for a candidate round, using estimated travel times. */
function evaluateGroup(opts: PlannerOptions, group: PlannerJob[]): Schedule {
  const matrix = estimateMatrix([opts.depot, ...group.map((j) => ({ lat: j.lat as number, lng: j.lng as number }))]);
  const order = solveOrder(opts.earliestStart, group, matrix);
  const stops = order.map((i) => group[i - 1]);
  const legs = legsForOrder(matrix, order);
  const start = suggestStart({ earliest: opts.earliestStart, latest: opts.dayEnd, dayEnd: opts.dayEnd, stops, legs, bufferMinutes: 0 });
  return computeSchedule(start, stops, legs);
}

export function autoPlan(opts: PlannerOptions): PlannerResult {
  const unassigned: PlannerResult["unassigned"] = [];
  const vehicles = opts.vehicles.filter((v) => v.active !== false);
  const drivers = [...opts.drivers].sort((a, b) => a.existingRuns - b.existingRuns);
  if (!vehicles.length || !drivers.length) {
    return { runs: [], unassigned: opts.jobs.map((j) => ({ jobId: j.id, reason: !vehicles.length ? "No active vehicles" : "No available drivers" })) };
  }
  const biggest = vehicles.reduce((a, b) => (b.capacityVolumeM3 > a.capacityVolumeM3 ? b : a));

  // Jobs we cannot place: no location, or too big for any vehicle.
  const placeable: PlannerJob[] = [];
  for (const j of opts.jobs) {
    if (!hasCoords(j)) {
      unassigned.push({ jobId: j.id, reason: "No map location (check the address)" });
      continue;
    }
    if (!smallestFittingVehicle(vehicles, j)) {
      unassigned.push({ jobId: j.id, reason: "Too big for any vehicle in the fleet; split the order or add a vehicle" });
      continue;
    }
    placeable.push(j);
  }

  // Sweep: order by bearing from the depot, starting from the largest angular gap
  // so a cluster is not split across the 0/360 boundary.
  const withBearing = placeable.map((j) => ({ j, b: bearingDegrees(opts.depot, { lat: j.lat as number, lng: j.lng as number }) })).sort((a, b) => a.b - b.b);
  if (withBearing.length > 1) {
    let gapIdx = 0;
    let gapSize = -1;
    for (let i = 0; i < withBearing.length; i++) {
      const next = withBearing[(i + 1) % withBearing.length].b + (i + 1 === withBearing.length ? 360 : 0);
      const gap = next - withBearing[i].b;
      if (gap > gapSize) {
        gapSize = gap;
        gapIdx = (i + 1) % withBearing.length;
      }
    }
    withBearing.push(...withBearing.splice(0, gapIdx));
  }

  // Build rounds: keep adding the next job around the sweep until the round would
  // overload the biggest vehicle, exceed the stop limit, miss a delivery slot, or
  // run past the end of the day.
  const groups: PlannerJob[][] = [];
  let current: PlannerJob[] = [];
  for (const { j } of withBearing) {
    if (current.length) {
      const candidate = [...current, j];
      const load = sumLoads(candidate);
      const tooBig = !checkFit(biggest, load).fits;
      const tooMany = current.length >= opts.maxStopsPerRun;
      let tooLate = false;
      let tooLong = false;
      if (!tooBig && !tooMany) {
        const sched = evaluateGroup(opts, candidate);
        tooLate = sched.totalLateS > LATE_TOLERANCE_S;
        tooLong = sched.totalSeconds > opts.maxRunSeconds || sched.end.getTime() > opts.dayEnd.getTime();
      }
      if (tooBig || tooMany || tooLate || tooLong) {
        groups.push(current);
        current = [];
      }
    }
    current.push(j);
  }
  if (current.length) groups.push(current);

  // Assign vehicles and drivers, biggest groups first so they get first pick.
  const usedVehicles = new Set<string>();
  const usedDrivers = new Set<string>();
  const runs: PlannerResult["runs"] = [];
  const sortedGroups = [...groups].sort((a, b) => sumLoads(b).volumeM3 - sumLoads(a).volumeM3);
  for (const group of sortedGroups) {
    const load = sumLoads(group);
    const vehicle = smallestFittingVehicle(vehicles, load, usedVehicles);
    if (!vehicle) {
      for (const j of group) unassigned.push({ jobId: j.id, reason: "No free vehicle big enough for this round" });
      continue;
    }
    const driver = drivers.find((d) => !usedDrivers.has(d.id) && licenceCovers(d.licenceCategories, vehicle.licenceRequired));
    if (!driver) {
      const needs = vehicleClass(vehicle.vehicleClass).licence;
      for (const j of group) unassigned.push({ jobId: j.id, reason: needs !== "B" ? `No free driver with a ${needs} licence` : "No free driver" });
      continue;
    }
    usedVehicles.add(vehicle.id);
    usedDrivers.add(driver.id);
    runs.push({ driverId: driver.id, vehicleId: vehicle.id, jobIds: group.map((j) => j.id) });
  }
  return { runs, unassigned };
}
