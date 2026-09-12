/**
 * Converts database rows into the plain view objects used by emails, the
 * calendar and the UI. Dates stay as Date objects here; DTOs for the browser
 * are serialised separately.
 */
import type { Driver, Job, Run, Settings, Vehicle } from "@prisma/client";
import { config } from "../config";
import type { CompanyView, RunView, StopView } from "../email/templates";
import { parseContacts, parseItems } from "./json";

export type RunWithRelations = Run & { driver: Driver | null; vehicle: Vehicle | null; jobs: Job[] };

export function companyView(s: Settings): CompanyView {
  return {
    companyName: s.companyName,
    timezone: s.timezone,
    depotName: s.depotName,
    depotAddress: s.depotAddress,
    dispatchEmail: s.dispatchEmail,
    dispatchPhone: s.dispatchPhone,
    loadingMinutes: s.loadingMinutes,
    clientEtaWindowMinutes: s.clientEtaWindowMinutes,
  };
}

export function stopView(job: Job, sequence?: number): StopView {
  return {
    id: job.id,
    sequence: sequence ?? job.sequence,
    type: job.type as StopView["type"],
    clientName: job.clientName,
    contactName: job.contactName,
    contactPhone: job.contactPhone,
    contactEmail: job.contactEmail,
    secondaryContacts: parseContacts(job.secondaryContacts),
    addressLine1: job.addressLine1,
    addressLine2: job.addressLine2,
    city: job.city,
    postcode: job.postcode,
    subject: job.subject,
    opportunityNumber: job.opportunityNumber,
    items: parseItems(job.items),
    windowStart: job.windowStart,
    windowEnd: job.windowEnd,
    plannedArrival: job.plannedArrival,
    plannedDeparture: job.plannedDeparture,
    serviceMinutes: job.serviceMinutes,
    driverNotes: job.driverNotes,
    accountHandlerName: job.accountHandlerName,
    accountHandlerEmail: job.accountHandlerEmail,
    volumeM3: job.volumeM3,
    weightKg: job.weightKg,
  };
}

export function portalUrl(driver: Driver | null): string {
  return driver ? `${config.appUrl()}/driver/${driver.portalToken}` : `${config.appUrl()}/driver`;
}

export function runView(run: RunWithRelations): RunView {
  const stops = [...run.jobs].sort((a, b) => a.sequence - b.sequence).map((j, i) => stopView(j, i + 1));
  return {
    id: run.id,
    date: run.date,
    driverName: run.driver?.name ?? "Unassigned driver",
    driverPhone: run.driver?.phone ?? "",
    driverEmail: run.driver?.email ?? "",
    vehicleName: run.vehicle?.name ?? "Vehicle TBC",
    vehicleRegistration: run.vehicle?.registration ?? "",
    plannedStart: run.plannedStart,
    plannedEnd: run.plannedEnd,
    totalDistanceM: run.totalDistanceM,
    totalDurationS: run.totalDurationS,
    stops,
    portalUrl: portalUrl(run.driver),
  };
}

export const runInclude = { driver: true, vehicle: true, jobs: true } as const;
