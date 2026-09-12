import { notFound } from "next/navigation";
import { BackLink, PageHeader } from "@/components/ui";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/services/settings";
import { formatDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function NotificationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [log, settings] = await Promise.all([prisma.notificationLog.findUnique({ where: { id } }), getSettings()]);
  if (!log) notFound();
  return (
    <div className="mx-auto max-w-4xl">
      <BackLink href="/notifications">All emails</BackLink>
      <PageHeader title={log.subject} subtitle={`To ${log.recipient} · ${formatDateTime(log.createdAt, settings.timezone)} · ${log.status === "PREVIEW" ? "preview only (email not configured)" : log.status.toLowerCase()}`} />
      {log.error && <p className="mb-3 rounded-md bg-red-50 p-2 text-sm text-red-700">{log.error}</p>}
      <iframe title="Email preview" srcDoc={log.body} sandbox="" className="h-[75vh] w-full rounded-lg border border-slate-200 bg-white" />
    </div>
  );
}
