/**
 * Pure ETA arithmetic: given a start time, an ordered list of stops and the
 * travel time of each leg, work out arrival/departure at every stop, waiting
 * time (arrived before the slot opens) and lateness (arrived after it closes).
 */

export type StopForSchedule = {
  id: string;
  windowStart: Date | null;
  windowEnd: Date | null;
  serviceMinutes: number;
};

export type LegTime = { seconds: number; meters: number };

export type ScheduledStop = {
  id: string;
  arrival: Date;
  departure: Date;
  waitS: number;
  lateS: number;
  legSeconds: number;
  legMeters: number;
};

export type Schedule = {
  start: Date;
  end: Date;
  stops: ScheduledStop[];
  totalSeconds: number;
  totalMeters: number;
  totalLateS: number;
  totalWaitS: number;
  driveSeconds: number;
};

/** legs[i] is the travel from the previous point to stop i; legs[n] is the trip back to the depot. */
export function computeSchedule(start: Date, stops: StopForSchedule[], legs: LegTime[]): Schedule {
  const out: ScheduledStop[] = [];
  let t = start.getTime();
  let meters = 0;
  let late = 0;
  let wait = 0;
  let drive = 0;
  stops.forEach((s, i) => {
    const leg = legs[i] ?? { seconds: 0, meters: 0 };
    drive += leg.seconds;
    meters += leg.meters;
    const arrivalMs = t + leg.seconds * 1000;
    let waitS = 0;
    let lateS = 0;
    let startService = arrivalMs;
    if (s.windowStart && arrivalMs < s.windowStart.getTime()) {
      waitS = Math.round((s.windowStart.getTime() - arrivalMs) / 1000);
      startService = s.windowStart.getTime();
    }
    if (s.windowEnd && arrivalMs > s.windowEnd.getTime()) {
      lateS = Math.round((arrivalMs - s.windowEnd.getTime()) / 1000);
    }
    const departureMs = startService + Math.max(0, s.serviceMinutes) * 60_000;
    out.push({ id: s.id, arrival: new Date(arrivalMs), departure: new Date(departureMs), waitS, lateS, legSeconds: leg.seconds, legMeters: leg.meters });
    wait += waitS;
    late += lateS;
    t = departureMs;
  });
  const back = legs[stops.length] ?? { seconds: 0, meters: 0 };
  drive += back.seconds;
  meters += back.meters;
  const end = new Date(t + back.seconds * 1000);
  return {
    start,
    end,
    stops: out,
    totalSeconds: Math.round((end.getTime() - start.getTime()) / 1000),
    totalMeters: meters,
    totalLateS: late,
    totalWaitS: wait,
    driveSeconds: drive,
  };
}

/**
 * Pick a sensible departure time: as late as possible without making any stop
 * later than it would be leaving at the earliest time, minus a safety buffer.
 * That stops drivers sitting outside a client's door at 07:30 for a 10:00 slot.
 */
export function suggestStart(opts: {
  earliest: Date;
  latest: Date;
  dayEnd: Date;
  stops: StopForSchedule[];
  legs: LegTime[];
  bufferMinutes: number;
}): Date {
  const { earliest, latest, dayEnd, stops, legs, bufferMinutes } = opts;
  const base = computeSchedule(earliest, stops, legs);
  const maxShiftMin = Math.max(0, Math.floor((latest.getTime() - earliest.getTime()) / 60_000));
  const ok = (shiftMin: number) => {
    const s = computeSchedule(new Date(earliest.getTime() + shiftMin * 60_000), stops, legs);
    if (s.totalLateS > base.totalLateS) return false;
    if (base.end.getTime() <= dayEnd.getTime() && s.end.getTime() > dayEnd.getTime()) return false;
    return true;
  };
  // Binary search the largest acceptable shift (feasibility is monotone in the shift).
  let lo = 0;
  let hi = maxShiftMin;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ok(mid)) lo = mid;
    else hi = mid - 1;
  }
  const shift = Math.max(0, lo - bufferMinutes);
  return new Date(earliest.getTime() + shift * 60_000);
}
