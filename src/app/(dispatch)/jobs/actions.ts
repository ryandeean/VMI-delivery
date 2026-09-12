"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { createJob, deleteJob, setJobStatus, updateJob, type JobInput } from "@/lib/services/jobs";
import { replanRun } from "@/lib/services/runs";
import { syncJobs } from "@/lib/services/sync";
import { addDays, isValidDateString, todayString } from "@/lib/time";
import { parseContactLines, parseItemLines } from "@/lib/services/parse";

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function num(fd: FormData, key: string): number | undefined {
  const v = str(fd, key);
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function inputFromForm(fd: FormData): JobInput {
  return {
    type: str(fd, "type") === "COLLECTION" ? "COLLECTION" : "DELIVERY",
    date: isValidDateString(str(fd, "date")) ? str(fd, "date") : todayString(),
    clientName: str(fd, "clientName"),
    subject: str(fd, "subject"),
    opportunityNumber: str(fd, "opportunityNumber"),
    contactName: str(fd, "contactName"),
    contactPhone: str(fd, "contactPhone"),
    contactEmail: str(fd, "contactEmail"),
    secondaryContacts: parseContactLines(str(fd, "secondaryContacts")),
    accountHandlerName: str(fd, "accountHandlerName"),
    accountHandlerEmail: str(fd, "accountHandlerEmail"),
    addressLine1: str(fd, "addressLine1"),
    addressLine2: str(fd, "addressLine2"),
    city: str(fd, "city"),
    postcode: str(fd, "postcode"),
    country: str(fd, "country") || "United Kingdom",
    lat: str(fd, "lat") ? num(fd, "lat") ?? null : undefined,
    lng: str(fd, "lng") ? num(fd, "lng") ?? null : undefined,
    windowStartTime: str(fd, "windowStartTime") || null,
    windowEndTime: str(fd, "windowEndTime") || null,
    serviceMinutes: num(fd, "serviceMinutes"),
    items: parseItemLines(str(fd, "items")),
    loadOverride: fd.get("loadOverride") === "on",
    volumeM3: num(fd, "volumeM3"),
    weightKg: num(fd, "weightKg"),
    notes: str(fd, "notes"),
    driverNotes: str(fd, "driverNotes"),
    clientNotify: fd.get("clientNotify") === "on",
  };
}

export async function saveJobAction(formData: FormData) {
  const id = str(formData, "id");
  const input = inputFromForm(formData);
  let job;
  if (id) {
    job = await updateJob(id, input);
    if (job.runId) await replanRun(job.runId);
  } else {
    job = await createJob(input);
  }
  revalidatePath("/");
  revalidatePath("/jobs");
  redirect(`/?date=${job.date}`);
}

export async function deleteJobAction(formData: FormData) {
  const id = str(formData, "id");
  const job = await prisma.job.findUnique({ where: { id } });
  if (job) {
    await deleteJob(id);
    if (job.runId) await replanRun(job.runId);
  }
  revalidatePath("/");
  redirect(job ? `/?date=${job.date}` : "/jobs");
}

export async function skipJobAction(formData: FormData) {
  const id = str(formData, "id");
  const job = await prisma.job.findUnique({ where: { id } });
  if (job) {
    const runId = job.runId;
    await setJobStatus(id, job.status === "SKIPPED" ? "UNSCHEDULED" : "SKIPPED");
    if (runId) await replanRun(runId);
  }
  revalidatePath("/");
  redirect(job ? `/?date=${job.date}` : "/jobs");
}

export async function importJobsAction(formData: FormData) {
  const from = isValidDateString(str(formData, "from")) ? str(formData, "from") : todayString();
  const to = isValidDateString(str(formData, "to")) ? str(formData, "to") : addDays(from, 7);
  const summary = await syncJobs(from, to);
  revalidatePath("/");
  revalidatePath("/jobs");
  const text = [summary.message, ...summary.errors].join("\n");
  redirect(`/jobs?from=${from}&to=${to}&msg=${encodeURIComponent(text)}&ok=${summary.errors.length ? 0 : 1}`);
}
