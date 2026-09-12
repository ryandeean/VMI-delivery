"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { CurrentRmsClient } from "@/lib/currentrms/client";
import { emailPing } from "@/lib/email/mailer";
import { calendarConfigured, calendarPing } from "@/lib/google/calendar";
import { geocodeAddress } from "@/lib/routing/google";
import { config } from "@/lib/config";

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}
function num(fd: FormData, key: string, fallback: number): number {
  const n = Number(str(fd, key));
  return Number.isFinite(n) && str(fd, key) !== "" ? n : fallback;
}

export async function saveSettingsAction(formData: FormData) {
  const current = await prisma.settings.findUniqueOrThrow({ where: { id: 1 } });
  const depotAddress = str(formData, "depotAddress");
  let depotLat: number | null = str(formData, "depotLat") ? Number(str(formData, "depotLat")) : null;
  let depotLng: number | null = str(formData, "depotLng") ? Number(str(formData, "depotLng")) : null;
  if ((depotAddress !== current.depotAddress || depotLat === null || depotLng === null) && depotAddress) {
    const found = await geocodeAddress(depotAddress);
    if (found && (depotAddress !== current.depotAddress || depotLat === null)) {
      depotLat = found.lat;
      depotLng = found.lng;
    }
  }
  await prisma.settings.update({
    where: { id: 1 },
    data: {
      companyName: str(formData, "companyName") || current.companyName,
      timezone: str(formData, "timezone") || current.timezone,
      depotName: str(formData, "depotName") || current.depotName,
      depotAddress,
      depotLat,
      depotLng,
      dayStart: str(formData, "dayStart") || current.dayStart,
      dayEnd: str(formData, "dayEnd") || current.dayEnd,
      loadingMinutes: num(formData, "loadingMinutes", current.loadingMinutes),
      defaultServiceMinutes: num(formData, "defaultServiceMinutes", current.defaultServiceMinutes),
      startBufferMinutes: num(formData, "startBufferMinutes", current.startBufferMinutes),
      packingFactor: num(formData, "packingFactor", current.packingFactor),
      defaultItemVolumeM3: num(formData, "defaultItemVolumeM3", current.defaultItemVolumeM3),
      defaultItemWeightKg: num(formData, "defaultItemWeightKg", current.defaultItemWeightKg),
      clientEtaWindowMinutes: num(formData, "clientEtaWindowMinutes", current.clientEtaWindowMinutes),
      maxStopsPerRun: num(formData, "maxStopsPerRun", current.maxStopsPerRun),
      maxRunHours: num(formData, "maxRunHours", current.maxRunHours),
      dispatchEmail: str(formData, "dispatchEmail"),
      dispatchPhone: str(formData, "dispatchPhone"),
    },
  });
  revalidatePath("/settings");
  revalidatePath("/");
  redirect(`/settings?saved=1${depotAddress && depotLat === null ? "&warn=depot" : ""}`);
}

export async function testIntegrationAction(formData: FormData) {
  const kind = str(formData, "kind");
  let result = "";
  if (kind === "current") {
    const client = CurrentRmsClient.fromEnv();
    result = client ? await client.ping().then((r) => (r.ok ? `Current RMS: ${r.message}` : `Current RMS: ${r.message}`)) : "Current RMS: subdomain and API key are not set in .env";
  } else if (kind === "calendar") {
    result = calendarConfigured() ? await calendarPing().then((r) => `Google Calendar: ${r.message}`) : "Google Calendar: credentials or GOOGLE_CALENDAR_ID not set in .env";
  } else if (kind === "email") {
    result = await emailPing().then((r) => `Email: ${r.message}`);
  } else if (kind === "maps") {
    if (!config.googleMapsKey()) result = "Google Maps: GOOGLE_MAPS_API_KEY not set (using estimates and postcodes.io)";
    else {
      const r = await geocodeAddress("10 Downing Street, London SW1A 2AA").catch((e) => ({ error: (e as Error).message }));
      result = r && "lat" in r ? `Google Maps: geocoding works (${r.source})` : `Google Maps: geocoding failed ${"error" in (r ?? {}) ? (r as { error: string }).error : ""}`;
    }
  }
  redirect(`/settings?test=${encodeURIComponent(result)}`);
}
