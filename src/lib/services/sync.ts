/**
 * Pulls confirmed orders from Current RMS (or the demo catalogue) and turns
 * them into jobs. Safe to run repeatedly: jobs are matched on the opportunity
 * id, and dispatcher edits (run, notes, load overrides) are preserved.
 */
import type { Job } from "@prisma/client";
import { config } from "../config";
import { CurrentRmsClient } from "../currentrms/client";
import { demoJobs } from "../currentrms/demo";
import { opportunityToJobs, type MapperSettings } from "../currentrms/mapper";
import type { ImportedJob } from "../currentrms/types";
import { prisma } from "../db";
import { geocodeAddress } from "../routing/google";
import { estimateLoad, requiredVehicleClass } from "../vehicles";
import { jobAddress } from "./jobs";
import { replanRun } from "./runs";
import { getSettings } from "./settings";

export type SyncSummary = { source: "CURRENT_RMS" | "DEMO"; created: number; updated: number; skipped: number; cancelled: number; geocoded: number; errors: string[]; message: string };

async function fetchImportedJobs(from: string, to: string, mapper: MapperSettings, errors: string[]): Promise<{ source: SyncSummary["source"]; jobs: ImportedJob[]; seenOpportunityIds: Set<number> }> {
  const client = CurrentRmsClient.fromEnv();
  if (!client) {
    return { source: "DEMO", jobs: demoJobs(from, to, mapper.timezone), seenOpportunityIds: new Set() };
  }
  const opportunities = await client.listOpportunities(from, to);
  const jobs: ImportedJob[] = [];
  const seen = new Set<number>();
  for (const opp of opportunities) {
    seen.add(opp.id);
    try {
      const items = await client.listOpportunityItems(opp.id);
      const organisation = opp.member_id ? await client.getMember(opp.member_id) : null;
      const contact = opp.contact_id ? await client.getMember(opp.contact_id) : null;
      const people = organisation && (organisation.member_type_name ?? "").toLowerCase() !== "person" ? await client.listOrganisationPeople(organisation.id) : [];
      const owner = opp.owner?.email ? opp.owner : opp.owned_by ? await client.getUser(opp.owned_by) : (opp.owner ?? null);
      jobs.push(...opportunityToJobs({ opportunity: opp, items, organisation, contact, people, owner }, mapper, { from, to }));
    } catch (e) {
      errors.push(`Opportunity ${opp.number ?? opp.id}: ${(e as Error).message}`);
    }
  }
  return { source: "CURRENT_RMS", jobs, seenOpportunityIds: seen };
}

export async function syncJobs(from: string, to: string): Promise<SyncSummary> {
  const settings = await getSettings();
  const log = await prisma.syncLog.create({ data: {} });
  const errors: string[] = [];
  const c = config.currentRms();
  const profiles = await prisma.productProfile.findMany();
  const mapper: MapperSettings = {
    timezone: settings.timezone,
    dayStart: settings.dayStart,
    dayEnd: settings.dayEnd,
    importStates: c.importStates,
    deliveryField: c.deliveryField,
    deliveryValues: c.deliveryValues,
    volumeField: c.volumeField,
    weightField: c.weightField,
    productProfiles: new Map(profiles.map((p) => [p.currentItemId, { volumeM3: p.volumeM3, weightKg: p.weightKg }])),
  };
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let cancelled = 0;
  let geocoded = 0;
  let source: SyncSummary["source"] = "DEMO";
  const runsToReplan = new Set<string>();
  try {
    const fetched = await fetchImportedJobs(from, to, mapper, errors);
    source = fetched.source;
    const importedIds = new Set(fetched.jobs.map((j) => j.externalId));

    for (const imp of fetched.jobs) {
      const load = estimateLoad(imp.items, settings);
      const existing = await prisma.job.findUnique({ where: { externalId: imp.externalId } });
      const contactData = {
        clientName: imp.clientName,
        contactName: imp.contactName,
        contactPhone: imp.contactPhone,
        contactEmail: imp.contactEmail,
        secondaryContacts: JSON.stringify(imp.secondaryContacts),
        accountHandlerName: imp.accountHandlerName,
        accountHandlerEmail: imp.accountHandlerEmail,
        subject: imp.subject,
        opportunityNumber: imp.opportunityNumber,
      };
      const addressData = { addressLine1: imp.addressLine1, addressLine2: imp.addressLine2, city: imp.city, postcode: imp.postcode, country: imp.country };
      if (!existing) {
        const job = await prisma.job.create({
          data: {
            ...contactData,
            ...addressData,
            externalId: imp.externalId,
            opportunityId: imp.opportunityId,
            type: imp.type,
            source: source === "DEMO" ? "DEMO" : "CURRENT_RMS",
            lat: imp.lat,
            lng: imp.lng,
            date: imp.date,
            windowStart: imp.windowStart,
            windowEnd: imp.windowEnd,
            serviceMinutes: settings.defaultServiceMinutes,
            items: JSON.stringify(imp.items),
            notes: imp.notes,
            ...load,
            requiredVehicleClass: requiredVehicleClass(load),
          },
        });
        created++;
        if (await ensureGeocoded(job)) geocoded++;
        continue;
      }
      if (["COMPLETED", "FAILED"].includes(existing.status)) {
        skipped++;
        continue;
      }
      const addressChanged = Object.entries(addressData).some(([k, v]) => (existing as unknown as Record<string, unknown>)[k] !== v);
      const dateChanged = existing.date !== imp.date;
      const data: Record<string, unknown> = {
        ...contactData,
        ...addressData,
        windowStart: imp.windowStart,
        windowEnd: imp.windowEnd,
        date: imp.date,
        items: JSON.stringify(imp.items),
        status: existing.status === "CANCELLED" ? "UNSCHEDULED" : existing.status,
      };
      if (!existing.loadOverride) Object.assign(data, load, { requiredVehicleClass: requiredVehicleClass(load) });
      if (addressChanged) {
        data.lat = imp.lat;
        data.lng = imp.lng;
      }
      if (dateChanged && existing.runId) {
        runsToReplan.add(existing.runId);
        Object.assign(data, { runId: null, sequence: 0, status: "UNSCHEDULED", plannedArrival: null, plannedDeparture: null });
        errors.push(`${imp.clientName} (${imp.type.toLowerCase()}) moved from ${existing.date} to ${imp.date} in Current and was taken off its run.`);
      } else if (existing.runId && (addressChanged || existing.windowStart?.getTime() !== imp.windowStart?.getTime() || existing.windowEnd?.getTime() !== imp.windowEnd?.getTime())) {
        runsToReplan.add(existing.runId);
      }
      const job = await prisma.job.update({ where: { id: existing.id }, data });
      updated++;
      if (await ensureGeocoded(job)) geocoded++;
    }

    // Orders that were imported before but are no longer confirmed in Current.
    if (source === "CURRENT_RMS") {
      const stale = await prisma.job.findMany({
        where: { source: "CURRENT_RMS", date: { gte: from, lte: to }, status: { notIn: ["COMPLETED", "FAILED", "CANCELLED"] }, opportunityId: { in: [...fetched.seenOpportunityIds] } },
      });
      for (const job of stale) {
        if (job.externalId && !importedIds.has(job.externalId)) {
          if (job.runId) runsToReplan.add(job.runId);
          await prisma.job.update({ where: { id: job.id }, data: { status: "CANCELLED", runId: null, sequence: 0, plannedArrival: null, plannedDeparture: null } });
          cancelled++;
        }
      }
      // Remember product sizes we learned from the API.
      for (const imp of fetched.jobs) {
        for (const it of imp.items) {
          if (!it.currentItemId || (it.volumeM3 == null && it.weightKg == null)) continue;
          await prisma.productProfile.upsert({
            where: { currentItemId: it.currentItemId },
            create: { currentItemId: it.currentItemId, name: it.name, volumeM3: it.volumeM3 ?? null, weightKg: it.weightKg ?? null },
            update: {},
          });
        }
      }
    }
    for (const runId of runsToReplan) {
      try {
        await replanRun(runId);
      } catch (e) {
        errors.push(`Could not re-plan run: ${(e as Error).message}`);
      }
    }
    const message = source === "DEMO" ? `Demo mode: ${created} sample jobs added, ${updated} refreshed.` : `${created} new, ${updated} refreshed, ${cancelled} cancelled, ${skipped} finished jobs left alone.`;
    await prisma.syncLog.update({ where: { id: log.id }, data: { finishedAt: new Date(), status: errors.length ? "WARN" : "OK", message: [message, ...errors].join("\n"), created, updated, skipped } });
    return { source, created, updated, skipped, cancelled, geocoded, errors, message };
  } catch (e) {
    const message = (e as Error).message;
    await prisma.syncLog.update({ where: { id: log.id }, data: { finishedAt: new Date(), status: "FAILED", message, created, updated, skipped } });
    return { source, created, updated, skipped, cancelled, geocoded, errors: [message, ...errors], message: `Sync failed: ${message}` };
  }
}

async function ensureGeocoded(job: Job): Promise<boolean> {
  if (job.lat !== null && job.lng !== null) return false;
  const address = jobAddress(job);
  if (!address.trim()) return false;
  try {
    const r = await geocodeAddress(address, job.postcode);
    if (!r) return false;
    await prisma.job.update({ where: { id: job.id }, data: { lat: r.lat, lng: r.lng } });
    return true;
  } catch {
    return false;
  }
}
