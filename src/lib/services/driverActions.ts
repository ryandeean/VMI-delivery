/**
 * What a driver can do from their phone: start the run, say they are on the
 * way (client gets a live ETA), mark arrival, complete a stop, report a problem.
 */
import type { Driver, Job } from "@prisma/client";
import { prisma } from "../db";
import { sendEmail } from "../email/mailer";
import { clientNotice, problemAlert } from "../email/templates";
import { hasCoords } from "../geo";
import { liveLeg } from "../routing";
import { todayString } from "../time";
import { notifyClients } from "./runs";
import { depotOf, getSettings } from "./settings";
import { companyView, runInclude, runView, stopView, type RunWithRelations } from "./views";

export class DriverActionError extends Error {}

export async function driverByToken(token: string): Promise<Driver | null> {
  if (!token) return null;
  return prisma.driver.findUnique({ where: { portalToken: token } });
}

/** Runs the driver can see: today's and the next few days (published or later). */
export async function driverRuns(driverId: string, date?: string): Promise<RunWithRelations[]> {
  const settings = await getSettings();
  const today = date ?? todayString(settings.timezone);
  return prisma.run.findMany({
    where: { driverId, date: { gte: today }, status: { in: ["PUBLISHED", "IN_PROGRESS", "COMPLETED"] } },
    include: runInclude,
    orderBy: [{ date: "asc" }, { plannedStart: "asc" }],
    take: 10,
  });
}

async function assertDriverOwnsJob(token: string, jobId: string): Promise<{ job: Job; run: RunWithRelations; driver: Driver }> {
  const driver = await driverByToken(token);
  if (!driver) throw new DriverActionError("This link is not valid any more. Ask the office for a new one.");
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job || !job.runId) throw new DriverActionError("Stop not found");
  const run = await prisma.run.findUnique({ where: { id: job.runId }, include: runInclude });
  if (!run || run.driverId !== driver.id) throw new DriverActionError("This stop is not on your run");
  return { job, run, driver };
}

export async function startRun(token: string, runId: string): Promise<{ emails: number }> {
  const driver = await driverByToken(token);
  if (!driver) throw new DriverActionError("This link is not valid any more.");
  const run = await prisma.run.findUnique({ where: { id: runId } });
  if (!run || run.driverId !== driver.id) throw new DriverActionError("Run not found");
  if (run.status === "PUBLISHED" || run.status === "DRAFT") {
    await prisma.run.update({ where: { id: runId }, data: { status: "IN_PROGRESS", startedAt: new Date() } });
  }
  const res = await notifyClients(runId);
  return { emails: res.emails.filter((e) => e.status === "SENT" || e.status === "PREVIEW").length };
}

/** Driver taps "On my way": work out a live ETA and tell the client. */
export async function onMyWay(token: string, jobId: string): Promise<{ eta: Date | null; emailed: boolean }> {
  const { job, run } = await assertDriverOwnsJob(token, jobId);
  const settings = await getSettings();
  const now = new Date();
  // Where is the driver leaving from? The last finished stop, otherwise the depot.
  const previous = run.jobs.filter((j) => j.sequence < job.sequence && j.completedAt).sort((a, b) => b.sequence - a.sequence)[0];
  const from = previous && hasCoords(previous) ? { lat: previous.lat, lng: previous.lng } : depotOf(settings);
  let eta: Date | null = job.plannedArrival;
  if (from && hasCoords(job)) {
    const leg = await liveLeg(from, { lat: job.lat, lng: job.lng });
    eta = new Date(now.getTime() + leg.seconds * 1000);
  } else if (job.plannedArrival && job.plannedArrival < now) {
    eta = new Date(now.getTime() + 15 * 60_000);
  }
  await prisma.job.update({ where: { id: jobId }, data: { status: "EN_ROUTE", enRouteAt: now, liveEta: eta } });
  if (run.status !== "IN_PROGRESS") await prisma.run.update({ where: { id: run.id }, data: { status: "IN_PROGRESS", startedAt: run.startedAt ?? now } });
  await reflowLaterStops(run, job.sequence, eta ?? now, job.serviceMinutes);

  let emailed = false;
  if (job.clientNotify && job.contactEmail) {
    const fresh = await prisma.run.findUniqueOrThrow({ where: { id: run.id }, include: runInclude });
    const content = clientNotice("ON_THE_WAY", stopView(job), runView(fresh), companyView(settings), { eta });
    const res = await sendEmail({ kind: "CLIENT_ON_THE_WAY", to: job.contactEmail, subject: content.subject, html: content.html, text: content.text, runId: run.id, jobId });
    emailed = res.status === "SENT" || res.status === "PREVIEW";
    if (emailed) await prisma.job.update({ where: { id: jobId }, data: { lastClientEmailAt: now } });
  }
  return { eta, emailed };
}

/** Push the planned times of later stops along when a stop is running early or late. */
async function reflowLaterStops(run: RunWithRelations, fromSequence: number, arrival: Date, serviceMinutes: number): Promise<void> {
  const later = run.jobs.filter((j) => j.sequence > fromSequence && !["COMPLETED", "FAILED", "CANCELLED", "SKIPPED"].includes(j.status)).sort((a, b) => a.sequence - b.sequence);
  let t = arrival.getTime() + serviceMinutes * 60_000;
  for (const j of later) {
    const eta = new Date(t + j.legDurationS * 1000);
    await prisma.job.update({ where: { id: j.id }, data: { liveEta: eta } });
    const serviceStart = j.windowStart && eta < j.windowStart ? j.windowStart.getTime() : eta.getTime();
    t = serviceStart + j.serviceMinutes * 60_000;
  }
}

export async function arrived(token: string, jobId: string): Promise<void> {
  await assertDriverOwnsJob(token, jobId);
  await prisma.job.update({ where: { id: jobId }, data: { status: "ARRIVED", arrivedAt: new Date() } });
}

export async function completeStop(token: string, jobId: string, input: { podName?: string; notes?: string }): Promise<{ emailed: boolean; runFinished: boolean }> {
  const { job, run } = await assertDriverOwnsJob(token, jobId);
  const settings = await getSettings();
  const now = new Date();
  await prisma.job.update({ where: { id: jobId }, data: { status: "COMPLETED", completedAt: now, outcome: "OK", podName: input.podName ?? "", podNotes: input.notes ?? "", liveEta: null } });
  let emailed = false;
  if (job.clientNotify && job.contactEmail) {
    const content = clientNotice("COMPLETED", stopView(job), runView(run), companyView(settings), { eta: now, podName: input.podName, message: input.notes });
    const res = await sendEmail({ kind: "CLIENT_COMPLETED", to: job.contactEmail, subject: content.subject, html: content.html, text: content.text, runId: run.id, jobId });
    emailed = res.status === "SENT" || res.status === "PREVIEW";
  }
  const remaining = await prisma.job.count({ where: { runId: run.id, status: { notIn: ["COMPLETED", "FAILED", "CANCELLED", "SKIPPED"] } } });
  let runFinished = false;
  if (remaining === 0) {
    await prisma.run.update({ where: { id: run.id }, data: { status: "COMPLETED", completedAt: now } });
    runFinished = true;
  }
  return { emailed, runFinished };
}

export async function reportProblem(token: string, jobId: string, message: string, markFailed: boolean): Promise<{ alerted: string[] }> {
  const { job, run } = await assertDriverOwnsJob(token, jobId);
  const settings = await getSettings();
  await prisma.job.update({ where: { id: jobId }, data: { outcome: "PROBLEM", podNotes: message, ...(markFailed ? { status: "FAILED", completedAt: new Date(), liveEta: null } : {}) } });
  const content = problemAlert(stopView(job), runView(run), companyView(settings), message);
  const recipients = [job.accountHandlerEmail, settings.dispatchEmail].filter(Boolean);
  const alerted: string[] = [];
  if (recipients.length) {
    const res = await sendEmail({ kind: "PROBLEM_ALERT", to: recipients, subject: content.subject, html: content.html, text: content.text, runId: run.id, jobId });
    if (res.status === "SENT" || res.status === "PREVIEW") alerted.push(...recipients);
  }
  if (markFailed) {
    const remaining = await prisma.job.count({ where: { runId: run.id, status: { notIn: ["COMPLETED", "FAILED", "CANCELLED", "SKIPPED"] } } });
    if (remaining === 0) await prisma.run.update({ where: { id: run.id }, data: { status: "COMPLETED", completedAt: new Date() } });
  }
  return { alerted };
}

export async function undoStop(token: string, jobId: string): Promise<void> {
  await assertDriverOwnsJob(token, jobId);
  await prisma.job.update({ where: { id: jobId }, data: { status: "SCHEDULED", enRouteAt: null, arrivedAt: null, completedAt: null, outcome: "", podName: "", podNotes: "", liveEta: null } });
}
