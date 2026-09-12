import { notFound } from "next/navigation";
import JobForm from "@/components/JobForm";
import { BackLink, PageHeader } from "@/components/ui";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/services/settings";
import { formatDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function EditJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [job, settings] = await Promise.all([prisma.job.findUnique({ where: { id }, include: { run: { include: { driver: true } }, notifications: { orderBy: { createdAt: "desc" }, take: 10 } } }), getSettings()]);
  if (!job) notFound();
  return (
    <div className="mx-auto max-w-5xl">
      <BackLink href={`/?date=${job.date}`}>Back to the board</BackLink>
      <PageHeader title={`${job.type === "DELIVERY" ? "Delivery" : "Collection"}: ${job.clientName}`} subtitle={job.run ? `On ${job.run.driver?.name ?? "a run"}'s run, stop ${job.sequence}.` : "Not on a run yet."} />
      {job.notifications.length > 0 && (
        <div className="card mb-4 p-3 text-xs text-slate-600">
          <b>Emails about this job:</b>
          <ul className="mt-1 list-disc pl-5">{job.notifications.map((n) => <li key={n.id}>{formatDateTime(n.createdAt, settings.timezone)} · {n.subject} → {n.recipient} ({n.status.toLowerCase()})</li>)}</ul>
        </div>
      )}
      {job.podName || job.podNotes ? <div className="card mb-4 p-3 text-sm"><b>Driver&apos;s report:</b> {job.podName ? `received by ${job.podName}. ` : ""}{job.podNotes}</div> : null}
      <JobForm job={job} date={job.date} tz={settings.timezone} defaultServiceMinutes={settings.defaultServiceMinutes} />
    </div>
  );
}
