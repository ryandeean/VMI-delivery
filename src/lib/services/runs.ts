/**
 * Everything the dispatch board does to runs: create, assign stops, reorder,
 * re-plan the route, publish (calendar + emails) and plan a whole day.
 */
import type { Driver, Job, Prisma, Settings, Vehicle } from "@prisma/client";
import { prisma } from "../db";
import { driverAvailability } from "../availability";
import { calendarConfigured, deleteRunEvent, upsertRunEvent } from "../google/calendar";
import { sendEmail } from "../email/mailer";
import { calendarDescription, clientNotice, driverRunSheet, handlerSummary, type RunView, type StopView } from "../email/templates";
import { autoPlan } from "../planner/autoPlan";
import { planRoute } from "../routing";
import { addMinutes, zonedDateTime } from "../time";
import { checkFit, licenceCovers, sumLoads } from "../vehicles";
import { companyView, runInclude, runView, type RunWithRelations } from "./views";
import { depotOf, getSettings } from "./settings";
import { config } from "../config";

export class RunError extends Error {}

const ACTIVE_STOP_STATUSES = ["SCHEDULED", "EN_ROUTE", "ARRIVED", "COMPLETED", "FAILED"];

async function loadRun(runId: string): Promise<RunWithRelations> {
  const run = await prisma.run.findUnique({ where: { id: runId }, include: runInclude });
  if (!run) throw new RunError("Run not found");
  return run;
}

function dayBounds(date: string, settings: Settings) {
  const earliestStart = zonedDateTime(date, settings.dayStart, settings.timezone);
  const dayEnd = zonedDateTime(date, settings.dayEnd, settings.timezone);
  const latestStart = addMinutes(dayEnd, -60);
  return { earliestStart, dayEnd, latestStart };
}

/* ----------------------------- mutations ------------------------------- */

export async function createRun(date: string, driverId?: string | null, vehicleId?: string | null): Promise<RunWithRelations> {
  const run = await prisma.run.create({ data: { date, driverId: driverId || null, vehicleId: vehicleId || null }, include: runInclude });
  return run;
}

export async function deleteRun(runId: string): Promise<void> {
  const run = await loadRun(runId);
  await prisma.job.updateMany({ where: { runId }, data: { runId: null, sequence: 0, status: "UNSCHEDULED", plannedArrival: null, plannedDeparture: null, legDistanceM: 0, legDurationS: 0, waitS: 0, lateS: 0 } });
  if (run.calendarEventId && calendarConfigured()) {
    try {
      await deleteRunEvent(run.calendarEventId);
    } catch {
      // The run is being removed anyway; a stale calendar entry is reported on the board.
    }
  }
  await prisma.run.delete({ where: { id: runId } });
}

export async function updateRun(runId: string, input: { driverId?: string | null; vehicleId?: string | null; startTime?: string | null; startLocked?: boolean; notes?: string }): Promise<RunWithRelations> {
  const settings = await getSettings();
  const run = await loadRun(runId);
  const data: Prisma.RunUpdateInput = {};
  if (input.driverId !== undefined) data.driver = input.driverId ? { connect: { id: input.driverId } } : { disconnect: true };
  if (input.vehicleId !== undefined) data.vehicle = input.vehicleId ? { connect: { id: input.vehicleId } } : { disconnect: true };
  if (input.notes !== undefined) data.notes = input.notes;
  if (input.startTime !== undefined) {
    if (input.startTime) {
      data.plannedStart = zonedDateTime(run.date, input.startTime, settings.timezone);
      data.startLocked = true;
    } else {
      data.startLocked = false;
    }
  }
  if (input.startLocked !== undefined) data.startLocked = input.startLocked;
  await prisma.run.update({ where: { id: runId }, data });
  if (input.startTime !== undefined || input.startLocked !== undefined) return replanRun(runId);
  return loadRun(runId);
}

export async function assignJob(jobId: string, runId: string, position?: number): Promise<RunWithRelations> {
  const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
  const run = await loadRun(runId);
  if (job.date !== run.date) throw new RunError("This job is on a different day to the run");
  if (["COMPLETED", "CANCELLED"].includes(job.status)) throw new RunError("This job is finished and cannot be moved");
  const others = run.jobs.filter((j) => j.id !== jobId).sort((a, b) => a.sequence - b.sequence);
  const idx = position === undefined || position < 0 || position > others.length ? others.length : position;
  const ordered = [...others.slice(0, idx), job, ...others.slice(idx)];
  await prisma.$transaction([
    ...ordered.map((j, i) => prisma.job.update({ where: { id: j.id }, data: { runId, sequence: i + 1, status: j.status === "UNSCHEDULED" || j.status === "SKIPPED" ? "SCHEDULED" : j.status } })),
    prisma.run.update({ where: { id: runId }, data: { manualOrder: position !== undefined ? true : run.manualOrder } }),
  ]);
  if (job.runId && job.runId !== runId) await replanRun(job.runId);
  return replanRun(runId);
}

export async function unassignJob(jobId: string): Promise<RunWithRelations | null> {
  const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
  await prisma.job.update({ where: { id: jobId }, data: { runId: null, sequence: 0, status: job.status === "COMPLETED" ? job.status : "UNSCHEDULED", plannedArrival: null, plannedDeparture: null, legDistanceM: 0, legDurationS: 0, waitS: 0, lateS: 0 } });
  return job.runId ? replanRun(job.runId) : null;
}

export async function reorderRun(runId: string, jobIds: string[]): Promise<RunWithRelations> {
  const run = await loadRun(runId);
  const known = new Set(run.jobs.map((j) => j.id));
  const ordered = jobIds.filter((id) => known.has(id));
  for (const j of run.jobs) if (!ordered.includes(j.id)) ordered.push(j.id);
  await prisma.$transaction([
    ...ordered.map((id, i) => prisma.job.update({ where: { id }, data: { sequence: i + 1 } })),
    prisma.run.update({ where: { id: runId }, data: { manualOrder: true } }),
  ]);
  return replanRun(runId);
}

/** Re-plan with the best stop order (drops any hand ordering). */
export async function optimiseRun(runId: string): Promise<{ run: RunWithRelations; warnings: string[] }> {
  await prisma.run.update({ where: { id: runId }, data: { manualOrder: false } });
  return replanRunWithWarnings(runId);
}

export async function replanRun(runId: string): Promise<RunWithRelations> {
  return (await replanRunWithWarnings(runId)).run;
}

/**
 * Recalculate the timetable for a run: order (unless hand-ordered), departure
 * time, ETAs for every stop, distance and the map line.
 */
export async function replanRunWithWarnings(runId: string): Promise<{ run: RunWithRelations; warnings: string[] }> {
  const settings = await getSettings();
  const run = await loadRun(runId);
  const depot = depotOf(settings);
  const stops = run.jobs.filter((j) => j.status !== "CANCELLED" && j.status !== "SKIPPED").sort((a, b) => a.sequence - b.sequence);
  if (!stops.length) {
    await prisma.run.update({ where: { id: runId }, data: { plannedEnd: null, totalDistanceM: 0, totalDurationS: 0, polyline: "", optimisedAt: new Date(), routeSource: "" } });
    return { run: await loadRun(runId), warnings: [] };
  }
  if (!depot) {
    return { run, warnings: ["Set the depot address in Settings before planning routes."] };
  }
  const { earliestStart, latestStart, dayEnd } = dayBounds(run.date, settings);
  // Stops already visited keep their place at the front; only the rest is re-ordered.
  const done = stops.filter((j) => ["COMPLETED", "FAILED", "ARRIVED", "EN_ROUTE"].includes(j.status));
  const keepOrder = run.manualOrder || done.length > 0;
  const result = await planRoute({
    depot,
    stops: stops.map((j) => ({ id: j.id, lat: j.lat, lng: j.lng, windowStart: j.windowStart, windowEnd: j.windowEnd, serviceMinutes: j.serviceMinutes })),
    earliestStart,
    latestStart,
    dayEnd,
    bufferMinutes: settings.startBufferMinutes,
    keepOrder,
    fixedStart: run.startLocked && run.plannedStart ? run.plannedStart : run.status !== "DRAFT" && run.status !== "PUBLISHED" && run.plannedStart ? run.plannedStart : null,
  });
  const byId = new Map(result.schedule.stops.map((s) => [s.id, s]));
  await prisma.$transaction([
    ...result.order.map((id, i) => {
      const s = byId.get(id)!;
      return prisma.job.update({
        where: { id },
        data: { sequence: i + 1, plannedArrival: s.arrival, plannedDeparture: s.departure, legDurationS: s.legSeconds, legDistanceM: s.legMeters, waitS: s.waitS, lateS: s.lateS },
      });
    }),
    prisma.run.update({
      where: { id: runId },
      data: {
        plannedStart: result.schedule.start,
        plannedEnd: result.schedule.end,
        totalDistanceM: result.schedule.totalMeters,
        totalDurationS: result.schedule.totalSeconds,
        polyline: result.polyline,
        routeSource: result.source,
        optimisedAt: new Date(),
      },
    }),
  ]);
  return { run: await loadRun(runId), warnings: result.warnings.map((w) => humaniseWarning(w, stops)) };
}

function humaniseWarning(w: string, stops: Job[]): string {
  return w.replace(/Stop ([a-z0-9]+)/, (_m, id) => {
    const j = stops.find((s) => s.id === id);
    return j ? `${j.clientName}` : "A stop";
  });
}

/* ----------------------------- publishing ------------------------------ */

export type PublishResult = {
  run: RunWithRelations;
  calendar: { status: "UPDATED" | "CREATED" | "SKIPPED" | "FAILED"; message: string };
  emails: { kind: string; to: string; status: string }[];
  warnings: string[];
};

/** Write the run to Google Calendar and email the driver and account handlers. */
export async function publishRun(runId: string, opts: { emailClients?: boolean } = {}): Promise<PublishResult> {
  const settings = await getSettings();
  const planned = await replanRunWithWarnings(runId);
  const warnings = planned.warnings;
  let run = planned.run;
  if (!run.driver) throw new RunError("Choose a driver before publishing");
  if (!run.vehicle) throw new RunError("Choose a vehicle before publishing");
  if (!run.jobs.length) throw new RunError("Add at least one stop before publishing");
  const company = companyView(settings);
  const view = runView(run);
  const emails: PublishResult["emails"] = [];

  // Calendar
  let calendar: PublishResult["calendar"] = { status: "SKIPPED", message: "Google Calendar is not connected" };
  if (calendarConfigured() && run.plannedStart && run.plannedEnd) {
    try {
      const res = await upsertRunEvent({
        eventId: run.calendarEventId || undefined,
        summary: `${run.driver.name}: ${view.stops.length} stop${view.stops.length === 1 ? "" : "s"} in ${run.vehicle.name}`,
        description: calendarDescription(view, company),
        location: settings.depotAddress,
        start: addMinutes(run.plannedStart, -settings.loadingMinutes),
        end: run.plannedEnd,
        timezone: settings.timezone,
        attendees: run.driver.email ? [run.driver.email] : [],
      });
      calendar = { status: run.calendarEventId ? "UPDATED" : "CREATED", message: res.attendeesInvited ? `Calendar event ${run.calendarEventId ? "updated" : "created"} and ${run.driver.name} invited` : `Calendar event ${run.calendarEventId ? "updated" : "created"} on the shared calendar` };
      if (res.eventId && res.eventId !== run.calendarEventId) await prisma.run.update({ where: { id: runId }, data: { calendarEventId: res.eventId } });
    } catch (e) {
      calendar = { status: "FAILED", message: `Calendar update failed: ${(e as Error).message}` };
    }
  }

  // Driver run sheet
  const sheet = driverRunSheet(view, company);
  const isUpdate = Boolean(run.publishedAt);
  const driverRes = await sendEmail({ kind: "DRIVER_RUN_SHEET", to: run.driver.email, cc: settings.dispatchEmail ? [settings.dispatchEmail] : [], subject: isUpdate ? `Updated: ${sheet.subject}` : sheet.subject, html: sheet.html, text: sheet.text, runId });
  emails.push({ kind: "Driver run sheet", to: run.driver.email || "(no email on driver)", status: driverRes.status });

  // Account handler summaries (one per handler)
  const byHandler = new Map<string, { name: string; stops: StopView[] }>();
  for (const s of view.stops) {
    const key = s.accountHandlerEmail.toLowerCase();
    if (!key) continue;
    const entry = byHandler.get(key) ?? { name: s.accountHandlerName, stops: [] };
    entry.stops.push(s);
    byHandler.set(key, entry);
  }
  for (const [email, entry] of byHandler) {
    const content = handlerSummary(entry.name, run.date, entry.stops.map((stop) => ({ stop, run: view })), company);
    const res = await sendEmail({ kind: "HANDLER_SUMMARY", to: email, subject: isUpdate ? `Updated: ${content.subject}` : content.subject, html: content.html, text: content.text, runId });
    emails.push({ kind: `Account handler (${entry.name || email})`, to: email, status: res.status });
  }

  await prisma.run.update({ where: { id: runId }, data: { status: run.status === "DRAFT" ? "PUBLISHED" : run.status, publishedAt: new Date() } });
  await prisma.job.updateMany({ where: { runId, status: "UNSCHEDULED" }, data: { status: "SCHEDULED" } });

  if (opts.emailClients) {
    const client = await notifyClients(runId);
    emails.push(...client.emails);
  }
  run = await loadRun(runId);
  return { run, calendar, emails, warnings };
}

/** "Out for delivery today, expect us between X and Y" to every client on the run. */
export async function notifyClients(runId: string, opts: { force?: boolean } = {}): Promise<{ emails: PublishResult["emails"] }> {
  const settings = await getSettings();
  const run = await loadRun(runId);
  const company = companyView(settings);
  const view = runView(run);
  const emails: PublishResult["emails"] = [];
  for (const stop of view.stops) {
    const job = run.jobs.find((j) => j.id === stop.id)!;
    if (!job.clientNotify) continue;
    if (["COMPLETED", "FAILED", "CANCELLED", "SKIPPED"].includes(job.status)) continue;
    if (!job.contactEmail) {
      emails.push({ kind: `Client (${stop.clientName})`, to: "", status: "SKIPPED: no email" });
      continue;
    }
    if (!opts.force) {
      const already = await prisma.notificationLog.findFirst({ where: { jobId: job.id, kind: "CLIENT_OUT_FOR_DELIVERY", status: { in: ["SENT", "PREVIEW"] } } });
      if (already) {
        emails.push({ kind: `Client (${stop.clientName})`, to: job.contactEmail, status: "SKIPPED: already told" });
        continue;
      }
    }
    const content = clientNotice("OUT_FOR_DELIVERY", stop, view, company);
    const res = await sendEmail({ kind: "CLIENT_OUT_FOR_DELIVERY", to: job.contactEmail, cc: settings.dispatchEmail ? [settings.dispatchEmail] : [], subject: content.subject, html: content.html, text: content.text, runId, jobId: job.id });
    if (res.status === "SENT" || res.status === "PREVIEW") await prisma.job.update({ where: { id: job.id }, data: { lastClientEmailAt: new Date() } });
    emails.push({ kind: `Client (${stop.clientName})`, to: job.contactEmail, status: res.status });
  }
  return { emails };
}

/* ----------------------------- auto plan ------------------------------- */

export type AutoPlanSummary = { created: number; assigned: number; unassigned: { jobId: string; clientName: string; reason: string }[]; warnings: string[] };

/** Build runs for every unscheduled job on a date using the available drivers and vehicles. */
export async function autoPlanDay(date: string): Promise<AutoPlanSummary> {
  const settings = await getSettings();
  const depot = depotOf(settings);
  if (!depot) throw new RunError("Set the depot address in Settings first");
  const [jobs, drivers, vehicles, absences, runs] = await Promise.all([
    prisma.job.findMany({ where: { date, status: "UNSCHEDULED", runId: null } }),
    prisma.driver.findMany({ where: { active: true } }),
    prisma.vehicle.findMany({ where: { active: true } }),
    prisma.driverAbsence.findMany({ where: { startDate: { lte: date }, endDate: { gte: date } } }),
    prisma.run.findMany({ where: { date } }),
  ]);
  const usedVehicleIds = new Set(runs.map((r) => r.vehicleId).filter(Boolean) as string[]);
  const availableDrivers = drivers
    .map((d) => ({ d, a: driverAvailability(d, date, absences, runs) }))
    .filter(({ a }) => a.status === "AVAILABLE")
    .map(({ d }) => ({ id: d.id, name: d.name, licenceCategories: d.licenceCategories, existingRuns: 0 }));
  const { earliestStart, dayEnd } = dayBounds(date, settings);
  const result = autoPlan({
    depot,
    jobs: jobs.map((j) => ({ id: j.id, lat: j.lat, lng: j.lng, volumeM3: j.volumeM3, weightKg: j.weightKg, serviceMinutes: j.serviceMinutes, windowStart: j.windowStart, windowEnd: j.windowEnd })),
    drivers: availableDrivers,
    vehicles: vehicles.filter((v) => !usedVehicleIds.has(v.id)),
    maxStopsPerRun: settings.maxStopsPerRun,
    earliestStart,
    dayEnd,
    maxRunSeconds: settings.maxRunHours * 3600,
  });
  const warnings: string[] = [];
  let assigned = 0;
  for (const planned of result.runs) {
    const run = await prisma.run.create({ data: { date, driverId: planned.driverId, vehicleId: planned.vehicleId } });
    await prisma.$transaction(planned.jobIds.map((id, i) => prisma.job.update({ where: { id }, data: { runId: run.id, sequence: i + 1, status: "SCHEDULED" } })));
    assigned += planned.jobIds.length;
    const { warnings: w } = await replanRunWithWarnings(run.id);
    warnings.push(...w);
  }
  const byId = new Map(jobs.map((j) => [j.id, j]));
  return {
    created: result.runs.length,
    assigned,
    unassigned: result.unassigned.map((u) => ({ jobId: u.jobId, clientName: byId.get(u.jobId)?.clientName ?? "", reason: u.reason })),
    warnings,
  };
}

/* ----------------------------- day state ------------------------------- */

export type JobDTO = Omit<Job, "windowStart" | "windowEnd" | "plannedArrival" | "plannedDeparture" | "liveEta" | "enRouteAt" | "arrivedAt" | "completedAt" | "lastClientEmailAt" | "createdAt" | "updatedAt" | "secondaryContacts" | "items"> & {
  windowStart: string | null;
  windowEnd: string | null;
  plannedArrival: string | null;
  plannedDeparture: string | null;
  liveEta: string | null;
  enRouteAt: string | null;
  arrivedAt: string | null;
  completedAt: string | null;
  lastClientEmailAt: string | null;
  createdAt: string;
  updatedAt: string;
  secondaryContacts: { name: string; phone: string; email: string; role?: string }[];
  items: { name: string; quantity: number; volumeM3?: number | null; weightKg?: number | null; isService?: boolean }[];
  address: string;
};

export type RunDTO = {
  id: string;
  date: string;
  status: string;
  driverId: string | null;
  vehicleId: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  startLocked: boolean;
  manualOrder: boolean;
  totalDistanceM: number;
  totalDurationS: number;
  polyline: string;
  routeSource: string;
  calendarEventId: string;
  optimisedAt: string | null;
  publishedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  notes: string;
  stops: JobDTO[];
  load: { volumeM3: number; weightKg: number };
  fit: { fits: boolean; volumePct: number; weightPct: number; reason?: string } | null;
  issues: string[];
};

export type DriverDTO = Pick<Driver, "id" | "name" | "email" | "phone" | "licenceCategories" | "workingDays" | "active" | "portalToken"> & { availability: { status: string; label: string; canAssign: boolean } };
export type VehicleDTO = Pick<Vehicle, "id" | "name" | "registration" | "vehicleClass" | "capacityVolumeM3" | "capacityWeightKg" | "licenceRequired" | "active"> & { inUseByRunId: string | null };

export type DayState = {
  date: string;
  settings: { companyName: string; timezone: string; depotName: string; depotAddress: string; depotLat: number | null; depotLng: number | null; dayStart: string; dayEnd: string; loadingMinutes: number; clientEtaWindowMinutes: number };
  jobs: JobDTO[];
  runs: RunDTO[];
  drivers: DriverDTO[];
  vehicles: VehicleDTO[];
  integrations: { current: boolean; maps: boolean; calendar: boolean; email: boolean; mapBrowserKey: string; mapId: string };
};

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function jobDTO(j: Job): JobDTO {
  const { secondaryContacts, items, ...rest } = j;
  return {
    ...rest,
    windowStart: iso(j.windowStart),
    windowEnd: iso(j.windowEnd),
    plannedArrival: iso(j.plannedArrival),
    plannedDeparture: iso(j.plannedDeparture),
    liveEta: iso(j.liveEta),
    enRouteAt: iso(j.enRouteAt),
    arrivedAt: iso(j.arrivedAt),
    completedAt: iso(j.completedAt),
    lastClientEmailAt: iso(j.lastClientEmailAt),
    createdAt: j.createdAt.toISOString(),
    updatedAt: j.updatedAt.toISOString(),
    secondaryContacts: JSON.parse(secondaryContacts || "[]"),
    items: JSON.parse(items || "[]"),
    address: [j.addressLine1, j.addressLine2, j.city, j.postcode].filter(Boolean).join(", "),
  };
}

export function runDTO(run: RunWithRelations, drivers: Driver[], absences: { driverId: string; startDate: string; endDate: string; reason: string }[]): RunDTO {
  const stops = [...run.jobs].sort((a, b) => a.sequence - b.sequence);
  const load = sumLoads(stops.filter((j) => !["CANCELLED", "SKIPPED"].includes(j.status)));
  const fit = run.vehicle ? checkFit(run.vehicle, load) : null;
  const issues: string[] = [];
  if (!run.driverId) issues.push("No driver chosen");
  if (!run.vehicleId) issues.push("No vehicle chosen");
  if (fit && !fit.fits) issues.push(fit.reason ?? "Vehicle too small for this load");
  if (run.driver && run.vehicle && !licenceCovers(run.driver.licenceCategories, run.vehicle.licenceRequired)) issues.push(`${run.driver.name} does not hold a ${run.vehicle.licenceRequired} licence for ${run.vehicle.name}`);
  if (run.driver) {
    const a = driverAvailability(run.driver, run.date, absences, []);
    if (!a.canAssign) issues.push(`${run.driver.name}: ${a.label}`);
  }
  const late = stops.filter((j) => j.lateS > 0);
  if (late.length) issues.push(`${late.length} stop${late.length > 1 ? "s" : ""} planned after the slot closes (${late.map((j) => j.clientName).join(", ")})`);
  if (stops.some((j) => j.lat === null || j.lng === null)) issues.push("A stop has no map location; check its address");
  return {
    id: run.id,
    date: run.date,
    status: run.status,
    driverId: run.driverId,
    vehicleId: run.vehicleId,
    plannedStart: iso(run.plannedStart),
    plannedEnd: iso(run.plannedEnd),
    startLocked: run.startLocked,
    manualOrder: run.manualOrder,
    totalDistanceM: run.totalDistanceM,
    totalDurationS: run.totalDurationS,
    polyline: run.polyline,
    routeSource: run.routeSource,
    calendarEventId: run.calendarEventId,
    optimisedAt: iso(run.optimisedAt),
    publishedAt: iso(run.publishedAt),
    startedAt: iso(run.startedAt),
    completedAt: iso(run.completedAt),
    notes: run.notes,
    stops: stops.map(jobDTO),
    load,
    fit,
    issues,
  };
}

export async function getDayState(date: string): Promise<DayState> {
  const settings = await getSettings();
  const [jobs, runs, drivers, vehicles, absences] = await Promise.all([
    prisma.job.findMany({ where: { date }, orderBy: [{ windowStart: "asc" }, { clientName: "asc" }] }),
    prisma.run.findMany({ where: { date }, include: runInclude, orderBy: { createdAt: "asc" } }),
    prisma.driver.findMany({ orderBy: { name: "asc" } }),
    prisma.vehicle.findMany({ orderBy: [{ capacityVolumeM3: "asc" }, { name: "asc" }] }),
    prisma.driverAbsence.findMany({ where: { startDate: { lte: date }, endDate: { gte: date } } }),
  ]);
  const cal = calendarConfigured();
  const smtp = config.smtp();
  const current = config.currentRms();
  return {
    date,
    settings: {
      companyName: settings.companyName,
      timezone: settings.timezone,
      depotName: settings.depotName,
      depotAddress: settings.depotAddress,
      depotLat: settings.depotLat,
      depotLng: settings.depotLng,
      dayStart: settings.dayStart,
      dayEnd: settings.dayEnd,
      loadingMinutes: settings.loadingMinutes,
      clientEtaWindowMinutes: settings.clientEtaWindowMinutes,
    },
    jobs: jobs.map(jobDTO),
    runs: runs.map((r) => runDTO(r, drivers, absences)),
    drivers: drivers.map((d) => ({ id: d.id, name: d.name, email: d.email, phone: d.phone, licenceCategories: d.licenceCategories, workingDays: d.workingDays, active: d.active, portalToken: d.portalToken, availability: driverAvailability(d, date, absences, runs) })),
    vehicles: vehicles.map((v) => ({ id: v.id, name: v.name, registration: v.registration, vehicleClass: v.vehicleClass, capacityVolumeM3: v.capacityVolumeM3, capacityWeightKg: v.capacityWeightKg, licenceRequired: v.licenceRequired, active: v.active, inUseByRunId: runs.find((r) => r.vehicleId === v.id)?.id ?? null })),
    integrations: { current: Boolean(current.subdomain && current.apiKey), maps: Boolean(config.googleMapsKey()), calendar: cal, email: Boolean(smtp.host && smtp.user), mapBrowserKey: config.googleMapsBrowserKey(), mapId: process.env.NEXT_PUBLIC_GOOGLE_MAP_ID ?? "" },
  };
}

export { ACTIVE_STOP_STATUSES };
export type { RunView };
