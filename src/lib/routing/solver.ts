/**
 * Orders the stops of one run. Google's waypoint optimisation ignores delivery
 * slots, so we solve the order ourselves on top of a (traffic-aware) travel
 * time matrix: nearest-neighbour seeded by urgency, then 2-opt / relocate
 * improvements scored on total time with heavy penalties for lateness.
 */
import { computeSchedule, type LegTime, type StopForSchedule } from "./schedule";

export type Matrix = { seconds: number[][]; meters: number[][] }; // index 0 = depot, 1..n = stops

const LATE_PENALTY = 20; // one minute late costs as much as twenty minutes of driving
const WAIT_PENALTY = 0.5;

export function legsForOrder(matrix: Matrix, order: number[]): LegTime[] {
  const legs: LegTime[] = [];
  let prev = 0;
  for (const idx of order) {
    legs.push({ seconds: matrix.seconds[prev][idx], meters: matrix.meters[prev][idx] });
    prev = idx;
  }
  legs.push({ seconds: matrix.seconds[prev][0], meters: matrix.meters[prev][0] });
  return legs;
}

function cost(start: Date, stops: StopForSchedule[], matrix: Matrix, order: number[]): number {
  const s = computeSchedule(
    start,
    order.map((i) => stops[i - 1]),
    legsForOrder(matrix, order),
  );
  return s.driveSeconds + s.totalWaitS * WAIT_PENALTY + s.totalLateS * LATE_PENALTY;
}

/** Returns stop indexes (1-based into the matrix) in visiting order. */
export function solveOrder(start: Date, stops: StopForSchedule[], matrix: Matrix): number[] {
  const n = stops.length;
  if (n <= 1) return stops.map((_, i) => i + 1);

  // 1. Greedy construction.
  const remaining = new Set<number>(stops.map((_, i) => i + 1));
  const order: number[] = [];
  let cur = 0;
  let t = start.getTime();
  while (remaining.size) {
    let best = -1;
    let bestScore = Infinity;
    for (const idx of remaining) {
      const s = stops[idx - 1];
      const travel = matrix.seconds[cur][idx];
      const arrival = t + travel * 1000;
      const wait = s.windowStart ? Math.max(0, s.windowStart.getTime() - arrival) / 1000 : 0;
      const late = s.windowEnd ? Math.max(0, arrival - s.windowEnd.getTime()) / 1000 : 0;
      // Urgency: how soon does this slot close? Sooner deadlines pull ahead.
      const slack = s.windowEnd ? Math.max(0, (s.windowEnd.getTime() - arrival) / 1000) : 6 * 3600;
      const score = travel + wait * WAIT_PENALTY + late * LATE_PENALTY + slack * 0.15;
      if (score < bestScore) {
        bestScore = score;
        best = idx;
      }
    }
    order.push(best);
    remaining.delete(best);
    const s = stops[best - 1];
    const arrival = t + matrix.seconds[cur][best] * 1000;
    const serviceStart = s.windowStart ? Math.max(arrival, s.windowStart.getTime()) : arrival;
    t = serviceStart + s.serviceMinutes * 60_000;
    cur = best;
  }

  // 2. Local search: 2-opt segment reversal and single-stop relocation.
  let bestOrder = order;
  let bestCost = cost(start, stops, matrix, bestOrder);
  let improved = true;
  let guard = 0;
  while (improved && guard++ < 50) {
    improved = false;
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const candidate = [...bestOrder.slice(0, i), ...bestOrder.slice(i, j + 1).reverse(), ...bestOrder.slice(j + 1)];
        const c = cost(start, stops, matrix, candidate);
        if (c < bestCost - 1) {
          bestCost = c;
          bestOrder = candidate;
          improved = true;
        }
      }
    }
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const candidate = [...bestOrder];
        const [item] = candidate.splice(i, 1);
        candidate.splice(j, 0, item);
        const c = cost(start, stops, matrix, candidate);
        if (c < bestCost - 1) {
          bestCost = c;
          bestOrder = candidate;
          improved = true;
        }
      }
    }
  }
  return bestOrder;
}
