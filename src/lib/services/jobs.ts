import type { Job, Settings } from "@prisma/client";
import { prisma } from "../db";
import { geocodeAddress } from "../routing/google";
import { estimateLoad, requiredVehicleClass } from "../vehicles";
import { getSettings } from "./settings";
import { parseItems } from "./json";
import { zonedDateTime } from "../time";

export const JOB_STATUSES = ["UNSCHEDULED", "SCHEDULED", "EN_ROUTE", "ARRIVED", "COMPLETED", "FAILED", "SKIPPED", "CANCELLED"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export function jobAddress(job: Pick<Job, "addressLine1" | "addressLine2" | "city" | "postcode" | "country">): string {
  return [job.addressLine1, job.addressLine2, job.city, job.postcode, job.country].filter(Boolean).join(", ");
}

/** Work out volume / weight / vehicle class from the item list (unless the dispatcher overrode it). */
export function loadFields(job: Pick<Job, "items" | "loadOverride" | "volumeM3" | "weightKg">, settings: Settings) {
  if (job.loadOverride) {
    return { volumeM3: job.volumeM3, weightKg: job.weightKg, itemCount: parseItems(job.items).filter((i) => !i.isService).reduce((s, i) => s + (i.quantity || 0), 0), requiredVehicleClass: requiredVehicleClass(job) };
  }
  const load = estimateLoad(parseItems(job.items), settings);
  return { ...load, requiredVehicleClass: requiredVehicleClass(load) };
}

export async function geocodeJob(jobId: string): Promise<Job> {
  const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
  const result = await geocodeAddress(jobAddress(job), job.postcode);
  if (!result) return job;
  return prisma.job.update({ where: { id: jobId }, data: { lat: result.lat, lng: result.lng } });
}

export type JobInput = {
  type: "DELIVERY" | "COLLECTION";
  date: string;
  clientName: string;
  subject?: string;
  opportunityNumber?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  secondaryContacts?: { name: string; phone?: string; email?: string; role?: string }[];
  accountHandlerName?: string;
  accountHandlerEmail?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  postcode?: string;
  country?: string;
  lat?: number | null;
  lng?: number | null;
  windowStartTime?: string | null; // "HH:mm"
  windowEndTime?: string | null;
  serviceMinutes?: number;
  items?: { name: string; quantity: number; volumeM3?: number | null; weightKg?: number | null; isService?: boolean }[];
  loadOverride?: boolean;
  volumeM3?: number;
  weightKg?: number;
  notes?: string;
  driverNotes?: string;
  clientNotify?: boolean;
};

function windowsFromInput(input: JobInput, settings: Settings) {
  const ws = input.windowStartTime ? zonedDateTime(input.date, input.windowStartTime, settings.timezone) : zonedDateTime(input.date, settings.dayStart, settings.timezone);
  const we = input.windowEndTime ? zonedDateTime(input.date, input.windowEndTime, settings.timezone) : zonedDateTime(input.date, settings.dayEnd, settings.timezone);
  return { windowStart: ws, windowEnd: we > ws ? we : zonedDateTime(input.date, settings.dayEnd, settings.timezone) };
}

export async function createJob(input: JobInput): Promise<Job> {
  const settings = await getSettings();
  const items = JSON.stringify(input.items ?? []);
  const base = {
    type: input.type,
    source: "MANUAL",
    date: input.date,
    clientName: input.clientName.trim() || "Unknown client",
    subject: input.subject ?? "",
    opportunityNumber: input.opportunityNumber ?? "",
    contactName: input.contactName ?? "",
    contactPhone: input.contactPhone ?? "",
    contactEmail: input.contactEmail ?? "",
    secondaryContacts: JSON.stringify(input.secondaryContacts ?? []),
    accountHandlerName: input.accountHandlerName ?? "",
    accountHandlerEmail: input.accountHandlerEmail ?? "",
    addressLine1: input.addressLine1 ?? "",
    addressLine2: input.addressLine2 ?? "",
    city: input.city ?? "",
    postcode: input.postcode ?? "",
    country: input.country || "United Kingdom",
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    serviceMinutes: input.serviceMinutes ?? settings.defaultServiceMinutes,
    items,
    loadOverride: Boolean(input.loadOverride),
    volumeM3: input.volumeM3 ?? 0,
    weightKg: input.weightKg ?? 0,
    notes: input.notes ?? "",
    driverNotes: input.driverNotes ?? "",
    clientNotify: input.clientNotify ?? true,
    ...windowsFromInput(input, settings),
  };
  const load = loadFields(base, settings);
  const job = await prisma.job.create({ data: { ...base, ...load } });
  if (job.lat === null || job.lng === null) return geocodeJob(job.id);
  return job;
}

export async function updateJob(id: string, input: Partial<JobInput>): Promise<Job> {
  const settings = await getSettings();
  const existing = await prisma.job.findUniqueOrThrow({ where: { id } });
  const merged = { ...existing };
  const data: Record<string, unknown> = {};
  const simple: (keyof JobInput)[] = ["type", "date", "clientName", "subject", "opportunityNumber", "contactName", "contactPhone", "contactEmail", "accountHandlerName", "accountHandlerEmail", "addressLine1", "addressLine2", "city", "postcode", "country", "serviceMinutes", "notes", "driverNotes", "clientNotify", "loadOverride", "volumeM3", "weightKg"];
  for (const k of simple) if (input[k] !== undefined) (data as Record<string, unknown>)[k] = input[k];
  if (input.secondaryContacts) data.secondaryContacts = JSON.stringify(input.secondaryContacts);
  if (input.items) data.items = JSON.stringify(input.items);
  if (input.lat !== undefined) data.lat = input.lat;
  if (input.lng !== undefined) data.lng = input.lng;
  Object.assign(merged, data);
  const date = (data.date as string) ?? existing.date;
  if (input.windowStartTime !== undefined || input.windowEndTime !== undefined || input.date) {
    const w = windowsFromInput({ ...input, type: merged.type as "DELIVERY", date, clientName: merged.clientName, windowStartTime: input.windowStartTime ?? hhmm(existing.windowStart, settings.timezone), windowEndTime: input.windowEndTime ?? hhmm(existing.windowEnd, settings.timezone) }, settings);
    data.windowStart = w.windowStart;
    data.windowEnd = w.windowEnd;
  }
  Object.assign(data, loadFields({ items: merged.items, loadOverride: merged.loadOverride, volumeM3: merged.volumeM3, weightKg: merged.weightKg }, settings));
  const addressChanged = ["addressLine1", "addressLine2", "city", "postcode", "country"].some((k) => data[k] !== undefined && data[k] !== (existing as Record<string, unknown>)[k]);
  if (addressChanged && input.lat === undefined) {
    data.lat = null;
    data.lng = null;
  }
  // Moving a job to another day takes it off its run.
  if (data.date && data.date !== existing.date && existing.runId) {
    data.runId = null;
    data.sequence = 0;
    data.status = "UNSCHEDULED";
    data.plannedArrival = null;
    data.plannedDeparture = null;
  }
  const job = await prisma.job.update({ where: { id }, data });
  if (job.lat === null || job.lng === null) return geocodeJob(job.id);
  return job;
}

function hhmm(d: Date | null, tz: string): string | null {
  if (!d) return null;
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return fmt.format(d);
}

export async function setJobStatus(id: string, status: JobStatus): Promise<Job> {
  const data: Record<string, unknown> = { status };
  if (status === "SKIPPED" || status === "CANCELLED" || status === "UNSCHEDULED") {
    data.runId = null;
    data.sequence = 0;
    data.plannedArrival = null;
    data.plannedDeparture = null;
  }
  return prisma.job.update({ where: { id }, data });
}

export async function deleteJob(id: string): Promise<void> {
  await prisma.job.delete({ where: { id } });
}
