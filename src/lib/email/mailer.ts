/**
 * Sends email through SMTP when configured; otherwise stores a preview so the
 * dispatcher can still see exactly what would have gone out.
 */
import nodemailer from "nodemailer";
import { config } from "../config";
import { prisma } from "../db";

export type OutgoingEmail = {
  kind: string;
  to: string | string[];
  cc?: string[];
  subject: string;
  html: string;
  text?: string;
  runId?: string | null;
  jobId?: string | null;
};

export function emailConfigured(): boolean {
  const s = config.smtp();
  return Boolean(s.host && s.user);
}

function normaliseList(v: string | string[] | undefined): string[] {
  const arr = Array.isArray(v) ? v : v ? [v] : [];
  return [...new Set(arr.map((s) => s.trim()).filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)))];
}

export async function sendEmail(mail: OutgoingEmail): Promise<{ status: "SENT" | "PREVIEW" | "FAILED" | "SKIPPED"; id?: string; error?: string }> {
  const to = normaliseList(mail.to);
  const cc = normaliseList(mail.cc);
  if (!to.length) {
    return { status: "SKIPPED", error: "No valid recipient address" };
  }
  const recipient = [...to, ...cc.map((c) => `cc:${c}`)].join(", ");
  if (!emailConfigured()) {
    const log = await prisma.notificationLog.create({
      data: { kind: mail.kind, recipient, subject: mail.subject, body: mail.html, status: "PREVIEW", runId: mail.runId ?? null, jobId: mail.jobId ?? null },
    });
    return { status: "PREVIEW", id: log.id };
  }
  const s = config.smtp();
  const transport = nodemailer.createTransport({ host: s.host, port: s.port, secure: s.secure, auth: { user: s.user, pass: s.pass } });
  try {
    await transport.sendMail({ from: s.from, to, cc: cc.length ? cc : undefined, subject: mail.subject, html: mail.html, text: mail.text });
    const log = await prisma.notificationLog.create({
      data: { kind: mail.kind, recipient, subject: mail.subject, body: mail.html, status: "SENT", runId: mail.runId ?? null, jobId: mail.jobId ?? null },
    });
    return { status: "SENT", id: log.id };
  } catch (e) {
    const error = (e as Error).message;
    const log = await prisma.notificationLog.create({
      data: { kind: mail.kind, recipient, subject: mail.subject, body: mail.html, status: "FAILED", error, runId: mail.runId ?? null, jobId: mail.jobId ?? null },
    });
    return { status: "FAILED", id: log.id, error };
  }
}

export async function emailPing(): Promise<{ ok: boolean; message: string }> {
  if (!emailConfigured()) return { ok: false, message: "SMTP not configured" };
  const s = config.smtp();
  try {
    const transport = nodemailer.createTransport({ host: s.host, port: s.port, secure: s.secure, auth: { user: s.user, pass: s.pass } });
    await transport.verify();
    return { ok: true, message: `Connected to ${s.host}` };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}
