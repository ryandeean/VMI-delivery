"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email/mailer";
import { esc } from "@/lib/email/templates";
import { getSettings } from "@/lib/services/settings";
import { portalUrl } from "@/lib/services/views";
import { isValidDateString } from "@/lib/time";

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function driverData(fd: FormData) {
  const days = [1, 2, 3, 4, 5, 6, 7].filter((d) => fd.get(`day${d}`) === "on");
  const licences = ["B", "C1", "C"].filter((l) => fd.get(`lic${l}`) === "on");
  return {
    name: str(fd, "name"),
    email: str(fd, "email").toLowerCase(),
    phone: str(fd, "phone"),
    workingDays: (days.length ? days : [1, 2, 3, 4, 5]).join(","),
    licenceCategories: (licences.length ? licences : ["B"]).join(","),
    notes: str(fd, "notes"),
  };
}

export async function addDriverAction(formData: FormData) {
  const driver = await prisma.driver.create({ data: driverData(formData) });
  revalidatePath("/drivers");
  redirect(`/drivers/${driver.id}`);
}

export async function updateDriverAction(formData: FormData) {
  const id = str(formData, "id");
  await prisma.driver.update({ where: { id }, data: { ...driverData(formData), active: formData.get("active") === "on" } });
  revalidatePath("/drivers");
  revalidatePath(`/drivers/${id}`);
  redirect(`/drivers/${id}?saved=1`);
}

export async function deleteDriverAction(formData: FormData) {
  const id = str(formData, "id");
  await prisma.driver.delete({ where: { id } });
  revalidatePath("/drivers");
  redirect("/drivers");
}

export async function addAbsenceAction(formData: FormData) {
  const driverId = str(formData, "driverId");
  const startDate = str(formData, "startDate");
  const endDate = str(formData, "endDate") || startDate;
  if (isValidDateString(startDate) && isValidDateString(endDate)) {
    await prisma.driverAbsence.create({ data: { driverId, startDate, endDate: endDate < startDate ? startDate : endDate, reason: str(formData, "reason") } });
  }
  revalidatePath(`/drivers/${driverId}`);
  redirect(`/drivers/${driverId}`);
}

export async function deleteAbsenceAction(formData: FormData) {
  const id = str(formData, "id");
  const a = await prisma.driverAbsence.findUnique({ where: { id } });
  if (a) await prisma.driverAbsence.delete({ where: { id } });
  if (a) redirect(`/drivers/${a.driverId}`);
}

export async function newPortalLinkAction(formData: FormData) {
  const id = str(formData, "id");
  await prisma.driver.update({ where: { id }, data: { portalToken: crypto.randomUUID().replace(/-/g, "") } });
  redirect(`/drivers/${id}?saved=1`);
}

export async function emailPortalLinkAction(formData: FormData) {
  const id = str(formData, "id");
  const driver = await prisma.driver.findUniqueOrThrow({ where: { id } });
  const settings = await getSettings();
  const url = portalUrl(driver);
  const res = await sendEmail({
    kind: "DRIVER_PORTAL_LINK",
    to: driver.email,
    subject: `Your ${settings.companyName} deliveries link`,
    html: `<p>Hi ${esc(driver.name.split(" ")[0])},</p><p>Save this link on your phone. It shows your runs for the day with every stop, contact and address, and lets you tell clients you are on the way:</p><p><a href="${esc(url)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 18px;border-radius:6px;font-weight:bold;">Open my runs</a></p><p style="color:#64748b;font-size:12px;">${esc(url)}<br>Keep it private: anyone with the link can see your runs.</p>`,
    text: `Your runs: ${url}`,
  });
  redirect(`/drivers/${id}?linksent=${res.status}`);
}
