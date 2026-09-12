import { describe, expect, it } from "vitest";
import { checkFit, estimateLoad, licenceCovers, requiredVehicleClass, smallestFittingVehicle } from "@/lib/vehicles";

const sizing = { packingFactor: 1.3, defaultItemVolumeM3: 0.05, defaultItemWeightKg: 5 };

describe("estimateLoad", () => {
  it("adds up items, applies packing factor and ignores services", () => {
    const load = estimateLoad(
      [
        { name: "Camera body", quantity: 2, volumeM3: 0.1, weightKg: 4 },
        { name: "Tripod", quantity: 1, volumeM3: 0.2, weightKg: 8 },
        { name: "Delivery", quantity: 1, isService: true },
      ],
      sizing,
    );
    expect(load.itemCount).toBe(3);
    expect(load.volumeM3).toBeCloseTo((0.2 + 0.2) * 1.3, 2);
    expect(load.weightKg).toBe(16);
  });

  it("uses defaults for products without dimensions", () => {
    const load = estimateLoad([{ name: "Mystery", quantity: 4 }], sizing);
    expect(load.volumeM3).toBeCloseTo(4 * 0.05 * 1.3, 2);
    expect(load.weightKg).toBe(20);
  });
});

describe("requiredVehicleClass", () => {
  it("picks the smallest class that carries the load", () => {
    expect(requiredVehicleClass({ volumeM3: 1, weightKg: 100 })).toBe("SMALL_VAN");
    expect(requiredVehicleClass({ volumeM3: 5, weightKg: 300 })).toBe("MEDIUM_VAN");
    expect(requiredVehicleClass({ volumeM3: 10, weightKg: 300 })).toBe("LARGE_VAN");
    expect(requiredVehicleClass({ volumeM3: 2, weightKg: 1150 })).toBe("LARGE_VAN");
    expect(requiredVehicleClass({ volumeM3: 18, weightKg: 900 })).toBe("LUTON");
    expect(requiredVehicleClass({ volumeM3: 60, weightKg: 900 })).toBe("TRUCK_7_5T");
  });
});

describe("fleet fit", () => {
  const fleet = [
    { id: "a", name: "Caddy", vehicleClass: "SMALL_VAN", capacityVolumeM3: 3.5, capacityWeightKg: 600, licenceRequired: "B", active: true },
    { id: "b", name: "Sprinter", vehicleClass: "LARGE_VAN", capacityVolumeM3: 13, capacityWeightKg: 1200, licenceRequired: "B", active: true },
    { id: "c", name: "Luton", vehicleClass: "LUTON", capacityVolumeM3: 20, capacityWeightKg: 1000, licenceRequired: "B", active: false },
  ];
  it("reports overloads with a reason", () => {
    const r = checkFit(fleet[0], { volumeM3: 4, weightKg: 100 });
    expect(r.fits).toBe(false);
    expect(r.reason).toContain("Load space");
    expect(checkFit(fleet[0], { volumeM3: 1, weightKg: 700 }).reason).toContain("Weight");
  });
  it("chooses the smallest active vehicle that fits, skipping used ones", () => {
    expect(smallestFittingVehicle(fleet, { volumeM3: 2, weightKg: 100 })?.id).toBe("a");
    expect(smallestFittingVehicle(fleet, { volumeM3: 2, weightKg: 100 }, new Set(["a"]))?.id).toBe("b");
    expect(smallestFittingVehicle(fleet, { volumeM3: 15, weightKg: 100 })).toBeUndefined();
  });
  it("understands licence categories", () => {
    expect(licenceCovers("B", "B")).toBe(true);
    expect(licenceCovers("B", "C1")).toBe(false);
    expect(licenceCovers("B,C1", "C1")).toBe(true);
    expect(licenceCovers("C", "C1")).toBe(true);
  });
});
