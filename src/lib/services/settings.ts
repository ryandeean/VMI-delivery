import type { Settings } from "@prisma/client";
import { prisma } from "../db";
import { DEMO_DEPOT } from "../currentrms/demo";

export type { Settings };

/** The single settings row, created with sensible defaults on first use. */
export async function getSettings(): Promise<Settings> {
  const existing = await prisma.settings.findUnique({ where: { id: 1 } });
  if (existing) return existing;
  return prisma.settings.create({
    data: { id: 1, depotName: DEMO_DEPOT.name, depotAddress: DEMO_DEPOT.address, depotLat: DEMO_DEPOT.lat, depotLng: DEMO_DEPOT.lng },
  });
}

export function depotOf(settings: Settings): { lat: number; lng: number } | null {
  if (typeof settings.depotLat === "number" && typeof settings.depotLng === "number") return { lat: settings.depotLat, lng: settings.depotLng };
  return null;
}
