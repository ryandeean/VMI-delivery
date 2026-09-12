import { describe, expect, it } from "vitest";
import { computeSchedule, suggestStart } from "@/lib/routing/schedule";
import { solveOrder, legsForOrder } from "@/lib/routing/solver";
import { estimateMatrix } from "@/lib/routing/fallback";
import { zonedDateTime, formatTime, toDateString, isoWeekday } from "@/lib/time";

const day = "2026-09-14";
const t = (hhmm: string) => zonedDateTime(day, hhmm);

describe("time helpers", () => {
  it("converts London wall-clock times to instants and back (BST)", () => {
    const d = t("09:30");
    expect(d.toISOString()).toBe("2026-09-14T08:30:00.000Z");
    expect(formatTime(d)).toBe("09:30");
    expect(toDateString(d)).toBe(day);
    expect(isoWeekday(day)).toBe(1);
  });
  it("handles GMT dates", () => {
    expect(zonedDateTime("2026-01-10", "09:30").toISOString()).toBe("2026-01-10T09:30:00.000Z");
  });
});

describe("computeSchedule", () => {
  it("adds waiting time before a slot opens and lateness after it closes", () => {
    const stops = [
      { id: "a", windowStart: t("09:00"), windowEnd: t("10:00"), serviceMinutes: 20 },
      { id: "b", windowStart: t("09:30"), windowEnd: t("09:45"), serviceMinutes: 10 },
    ];
    const legs = [
      { seconds: 30 * 60, meters: 10000 },
      { seconds: 20 * 60, meters: 5000 },
      { seconds: 40 * 60, meters: 12000 },
    ];
    const s = computeSchedule(t("08:00"), stops, legs);
    expect(formatTime(s.stops[0].arrival)).toBe("08:30");
    expect(s.stops[0].waitS).toBe(30 * 60);
    expect(formatTime(s.stops[0].departure)).toBe("09:20");
    expect(formatTime(s.stops[1].arrival)).toBe("09:40");
    expect(s.stops[1].lateS).toBe(0);
    expect(formatTime(s.stops[1].departure)).toBe("09:50");
    expect(formatTime(s.end)).toBe("10:30");
    expect(s.totalMeters).toBe(27000);

    const late = computeSchedule(t("09:00"), stops, legs);
    expect(late.stops[1].lateS).toBe(25 * 60);
  });
});

describe("suggestStart", () => {
  it("leaves as late as possible without being late, minus a buffer", () => {
    const stops = [{ id: "a", windowStart: t("10:00"), windowEnd: t("11:00"), serviceMinutes: 15 }];
    const legs = [
      { seconds: 45 * 60, meters: 1 },
      { seconds: 45 * 60, meters: 1 },
    ];
    const start = suggestStart({ earliest: t("07:00"), latest: t("16:00"), dayEnd: t("19:00"), stops, legs, bufferMinutes: 15 });
    // Latest arrival within slot is 11:00 -> leave 10:15; minus 15 min buffer -> 10:00
    expect(formatTime(start)).toBe("10:00");
  });
  it("never starts earlier than the earliest time", () => {
    const stops = [{ id: "a", windowStart: t("07:00"), windowEnd: t("07:30"), serviceMinutes: 15 }];
    const legs = [
      { seconds: 60 * 60, meters: 1 },
      { seconds: 60 * 60, meters: 1 },
    ];
    const start = suggestStart({ earliest: t("07:00"), latest: t("16:00"), dayEnd: t("19:00"), stops, legs, bufferMinutes: 15 });
    expect(formatTime(start)).toBe("07:00");
  });
});

describe("solveOrder", () => {
  const depot = { lat: 51.5074, lng: -0.1278 }; // central London
  it("visits geographically sensible order when there are no slots", () => {
    // Three stops: east, further east, and west.
    const pts = [depot, { lat: 51.51, lng: -0.05 }, { lat: 51.515, lng: 0.02 }, { lat: 51.505, lng: -0.2 }];
    const matrix = estimateMatrix(pts);
    const stops = pts.slice(1).map((_, i) => ({ id: String(i + 1), windowStart: null, windowEnd: null, serviceMinutes: 10 }));
    const order = solveOrder(t("08:00"), stops, matrix);
    // West stop should not sit between the two east stops.
    expect(order.indexOf(3) === 1).toBe(false);
  });
  it("puts a stop with an early slot first even if it is further away", () => {
    const pts = [depot, { lat: 51.51, lng: -0.11 }, { lat: 51.55, lng: -0.3 }];
    const matrix = estimateMatrix(pts);
    const stops = [
      { id: "near", windowStart: t("11:00"), windowEnd: t("12:00"), serviceMinutes: 10 },
      { id: "far-early", windowStart: t("08:30"), windowEnd: t("09:30"), serviceMinutes: 10 },
    ];
    const order = solveOrder(t("08:00"), stops, matrix);
    expect(order[0]).toBe(2);
    const legs = legsForOrder(matrix, order);
    const s = computeSchedule(t("08:00"), order.map((i) => stops[i - 1]), legs);
    expect(s.totalLateS).toBe(0);
  });
});
