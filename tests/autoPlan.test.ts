import { describe, expect, it } from "vitest";
import { autoPlan } from "@/lib/planner/autoPlan";
import { zonedDateTime } from "@/lib/time";

const day = "2026-09-14";
const t = (hhmm: string) => zonedDateTime(day, hhmm);
const depot = { lat: 51.5074, lng: -0.1278 };
const vehicles = [
  { id: "small", name: "Caddy", vehicleClass: "SMALL_VAN", capacityVolumeM3: 3.5, capacityWeightKg: 600, licenceRequired: "B", active: true },
  { id: "large", name: "Sprinter", vehicleClass: "LARGE_VAN", capacityVolumeM3: 13, capacityWeightKg: 1200, licenceRequired: "B", active: true },
  { id: "truck", name: "7.5t", vehicleClass: "TRUCK_7_5T", capacityVolumeM3: 40, capacityWeightKg: 3000, licenceRequired: "C1", active: true },
];
const drivers = [
  { id: "d1", name: "Sam", licenceCategories: "B", existingRuns: 0 },
  { id: "d2", name: "Alex", licenceCategories: "B,C1", existingRuns: 0 },
];
const base = { depot, drivers, vehicles, maxStopsPerRun: 10, earliestStart: t("07:00"), dayEnd: t("19:00"), maxRunSeconds: 9 * 3600 };
const job = (id: string, lat: number, lng: number, volumeM3 = 1, weightKg = 50, windowStart: Date | null = null, windowEnd: Date | null = null) => ({
  id, lat, lng, volumeM3, weightKg, serviceMinutes: 15, windowStart, windowEnd,
});

describe("autoPlan", () => {
  it("uses one van when one driver can do everything comfortably", () => {
    const jobs = [job("e1", 51.51, -0.05), job("e2", 51.515, 0.0), job("e3", 51.52, 0.03), job("w1", 51.5, -0.25), job("w2", 51.49, -0.3, 8)];
    const r = autoPlan({ ...base, jobs });
    expect(r.unassigned).toHaveLength(0);
    expect(r.runs).toHaveLength(1);
    expect(r.runs[0].jobIds).toHaveLength(5);
    expect(r.runs[0].vehicleId).toBe("large");
  });

  it("splits into rounds by direction when delivery slots make one van impossible", () => {
    const w = [t("08:00"), t("09:30")] as const;
    const jobs = [
      job("e1", 51.51, -0.05, 1, 50, ...w), job("e2", 51.515, 0.0, 1, 50, ...w), job("e3", 51.52, 0.03, 1, 50, ...w),
      job("w1", 51.5, -0.25, 1, 50, ...w), job("w2", 51.49, -0.3, 8, 50, ...w),
    ];
    const r = autoPlan({ ...base, jobs });
    expect(r.unassigned).toHaveLength(0);
    expect(r.runs).toHaveLength(2);
    const east = r.runs.find((run) => run.jobIds.includes("e1"))!;
    const west = r.runs.find((run) => run.jobIds.includes("w1"))!;
    expect([...east.jobIds].sort()).toEqual(["e1", "e2", "e3"]);
    expect([...west.jobIds].sort()).toEqual(["w1", "w2"]);
    expect(west.vehicleId).toBe("large");
    expect(east.vehicleId).toBe("small");
    expect(new Set(r.runs.map((x) => x.driverId)).size).toBe(2);
  });

  it("only gives the truck to a driver with a C1 licence", () => {
    const jobs = [job("big", 51.6, -0.1, 30, 2000)];
    const r = autoPlan({ ...base, jobs });
    expect(r.runs[0].vehicleId).toBe("truck");
    expect(r.runs[0].driverId).toBe("d2");
  });

  it("reports jobs it cannot place with a plain-English reason", () => {
    const jobs = [job("huge", 51.6, -0.1, 90, 100), { ...job("lost", 0, 0), lat: null, lng: null }];
    const r = autoPlan({ ...base, jobs });
    expect(r.runs).toHaveLength(0);
    expect(r.unassigned.find((u) => u.jobId === "huge")?.reason).toContain("Too big");
    expect(r.unassigned.find((u) => u.jobId === "lost")?.reason).toContain("No map location");
  });

  it("splits a round when it exceeds the stop limit", () => {
    const jobs = Array.from({ length: 6 }, (_, i) => job(`j${i}`, 51.51 + i * 0.002, -0.05 + i * 0.002));
    const r = autoPlan({ ...base, jobs, maxStopsPerRun: 4 });
    expect(r.runs).toHaveLength(2);
    expect(r.runs.map((x) => x.jobIds.length).sort()).toEqual([2, 4]);
  });

  it("leaves jobs unassigned when drivers run out", () => {
    const jobs = Array.from({ length: 6 }, (_, i) => job(`j${i}`, 51.51 + i * 0.01, -0.05 + i * 0.01));
    const r = autoPlan({ ...base, jobs, maxStopsPerRun: 2 });
    expect(r.runs).toHaveLength(2);
    expect(r.unassigned).toHaveLength(2);
    expect(r.unassigned[0].reason).toContain("No free driver");
  });
});
