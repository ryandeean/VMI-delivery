/**
 * Vehicle classes and the "how big a van does this order need" logic.
 */

export type VehicleClassCode = "CAR" | "SMALL_VAN" | "MEDIUM_VAN" | "LARGE_VAN" | "LUTON" | "TRUCK_7_5T";

export type VehicleClassInfo = {
  code: VehicleClassCode;
  label: string;
  shortLabel: string;
  example: string;
  /** Typical usable load space, used to rate jobs before a real vehicle is chosen. */
  typicalVolumeM3: number;
  typicalWeightKg: number;
  licence: string;
  rank: number;
};

export const VEHICLE_CLASSES: VehicleClassInfo[] = [
  { code: "CAR", label: "Car / estate", shortLabel: "Car", example: "Estate car, small SUV", typicalVolumeM3: 1.5, typicalWeightKg: 350, licence: "B", rank: 0 },
  { code: "SMALL_VAN", label: "Small van", shortLabel: "Small van", example: "VW Caddy, Ford Transit Connect", typicalVolumeM3: 3.5, typicalWeightKg: 650, licence: "B", rank: 1 },
  { code: "MEDIUM_VAN", label: "Medium van", shortLabel: "Medium van", example: "Transit Custom, Mercedes Vito", typicalVolumeM3: 6.5, typicalWeightKg: 1000, licence: "B", rank: 2 },
  { code: "LARGE_VAN", label: "Large van", shortLabel: "Large van", example: "LWB Sprinter, Transit L3H3", typicalVolumeM3: 13, typicalWeightKg: 1200, licence: "B", rank: 3 },
  { code: "LUTON", label: "Luton van", shortLabel: "Luton", example: "3.5t Luton with tail lift", typicalVolumeM3: 20, typicalWeightKg: 1000, licence: "B", rank: 4 },
  { code: "TRUCK_7_5T", label: "7.5 tonne truck", shortLabel: "7.5t truck", example: "Box truck with tail lift", typicalVolumeM3: 40, typicalWeightKg: 3000, licence: "C1", rank: 5 },
];

export function vehicleClass(code: string): VehicleClassInfo {
  return VEHICLE_CLASSES.find((c) => c.code === code) ?? VEHICLE_CLASSES[1];
}

export function vehicleClassLabel(code: string): string {
  return vehicleClass(code).shortLabel;
}

export type JobItem = {
  name: string;
  quantity: number;
  volumeM3?: number | null;
  weightKg?: number | null;
  /** Services / labour lines take no space. */
  isService?: boolean;
};

export type LoadEstimate = { volumeM3: number; weightKg: number; itemCount: number };

export type SizingSettings = {
  packingFactor: number;
  defaultItemVolumeM3: number;
  defaultItemWeightKg: number;
};

/** Add up an order's items into a total load, using defaults for products with no dimensions. */
export function estimateLoad(items: JobItem[], settings: SizingSettings): LoadEstimate {
  let volume = 0;
  let weight = 0;
  let count = 0;
  for (const it of items) {
    if (it.isService) continue;
    const qty = Math.max(0, Number(it.quantity) || 0);
    if (!qty) continue;
    const v = typeof it.volumeM3 === "number" && it.volumeM3 > 0 ? it.volumeM3 : settings.defaultItemVolumeM3;
    const w = typeof it.weightKg === "number" && it.weightKg > 0 ? it.weightKg : settings.defaultItemWeightKg;
    volume += v * qty;
    weight += w * qty;
    count += qty;
  }
  return {
    volumeM3: round2(volume * settings.packingFactor),
    weightKg: round2(weight),
    itemCount: count,
  };
}

/** Smallest vehicle class whose typical capacity carries the load. */
export function requiredVehicleClass(load: { volumeM3: number; weightKg: number }): VehicleClassCode {
  for (const c of VEHICLE_CLASSES) {
    if (c.code === "CAR") continue; // we never plan on cars unless the fleet only has them
    if (load.volumeM3 <= c.typicalVolumeM3 && load.weightKg <= c.typicalWeightKg) return c.code;
  }
  return "TRUCK_7_5T";
}

export type VehicleLike = {
  id: string;
  name: string;
  vehicleClass: string;
  capacityVolumeM3: number;
  capacityWeightKg: number;
  licenceRequired: string;
  active?: boolean;
};

export type FitResult = {
  fits: boolean;
  volumePct: number;
  weightPct: number;
  reason?: string;
};

/** Does this load fit this actual vehicle? Percentages are shown as capacity bars. */
export function checkFit(vehicle: VehicleLike, load: { volumeM3: number; weightKg: number }): FitResult {
  const volumePct = vehicle.capacityVolumeM3 > 0 ? (load.volumeM3 / vehicle.capacityVolumeM3) * 100 : 0;
  const weightPct = vehicle.capacityWeightKg > 0 ? (load.weightKg / vehicle.capacityWeightKg) * 100 : 0;
  if (volumePct > 100) return { fits: false, volumePct, weightPct, reason: `Load space: ${load.volumeM3.toFixed(1)} m³ needed, ${vehicle.capacityVolumeM3} m³ available` };
  if (weightPct > 100) return { fits: false, volumePct, weightPct, reason: `Weight: ${Math.round(load.weightKg)} kg needed, ${vehicle.capacityWeightKg} kg allowed` };
  return { fits: true, volumePct, weightPct };
}

/** Smallest active vehicle from the fleet that carries the load (and is not already in use). */
export function smallestFittingVehicle<V extends VehicleLike>(vehicles: V[], load: { volumeM3: number; weightKg: number }, exclude: Set<string> = new Set()): V | undefined {
  return [...vehicles]
    .filter((v) => v.active !== false && !exclude.has(v.id))
    .sort((a, b) => vehicleClass(a.vehicleClass).rank - vehicleClass(b.vehicleClass).rank || a.capacityVolumeM3 - b.capacityVolumeM3)
    .find((v) => checkFit(v, load).fits);
}

export function sumLoads(loads: { volumeM3: number; weightKg: number }[]): { volumeM3: number; weightKg: number } {
  return {
    volumeM3: round2(loads.reduce((s, l) => s + (l.volumeM3 || 0), 0)),
    weightKg: round2(loads.reduce((s, l) => s + (l.weightKg || 0), 0)),
  };
}

export function licenceCovers(driverCategories: string, required: string): boolean {
  const have = driverCategories.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  const need = (required || "B").trim().toUpperCase();
  if (have.includes(need)) return true;
  // Higher categories include lower ones.
  const order = ["B", "C1", "C"];
  const needIdx = order.indexOf(need);
  return needIdx >= 0 && have.some((h) => order.indexOf(h) > needIdx);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
