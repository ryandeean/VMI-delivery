import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { emailConfigured } from "@/lib/email/mailer";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/services/settings";
import { formatDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";

const KIND: Record<string, string> = {
  DRIVER_RUN_SHEET: "Driver run sheet",
  HANDLER_SUMMARY: "Account handler plan",
  CLIENT_OUT_FOR_DELIVERY: "Client: out for delivery",
  CLIENT_ON_THE_WAY: "Client: driver on the way",
  CLIENT_COMPLETED: "Client: delivered / collected",
  PROBLEM_ALERT: "Problem alert",
  DRIVER_PORTAL_LINK: "Driver phone link",
};

export default async function NotificationsPage() {
  const [logs, syncs, settings] = await Promise.all([
    prisma.notificationLog.findMany({ orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.syncLog.findMany({ orderBy: { startedAt: "desc" }, take: 10 }),
    getSettings(),
  ]);
  const tz = settings.timezone;
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Emails sent" subtitle={emailConfigured() ? "Every email the system has sent." : "Email is not configured yet, so messages are saved here as previews instead of being sent. Click one to see exactly what the recipient would get."} />
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="px-3 py-2">When</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">To</th><th className="px-3 py-2">Subject</th><th className="px-3 py-2">Status</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-500">Nothing sent yet. Publish a run from the board to see emails here.</td></tr>}
            {logs.map((l) => (
              <tr key={l.id} className="hover:bg-slate-50">
                <td className="px-3 py-2 whitespace-nowrap text-xs">{formatDateTime(l.createdAt, tz)}</td>
                <td className="px-3 py-2 text-xs">{KIND[l.kind] ?? l.kind}</td>
                <td className="px-3 py-2 text-xs">{l.recipient}</td>
                <td className="px-3 py-2"><Link href={`/notifications/${l.id}`} className="text-blue-700 hover:underline">{l.subject}</Link></td>
                <td className="px-3 py-2"><span className={`badge ${l.status === "SENT" ? "bg-emerald-100 text-emerald-800" : l.status === "FAILED" ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-700"}`}>{l.status === "PREVIEW" ? "Preview" : l.status.toLowerCase()}</span>{l.error && <div className="text-xs text-red-600">{l.error}</div>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mb-2 mt-8 text-lg font-bold">Order imports</h2>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2">When</th><th className="px-3 py-2">Result</th><th className="px-3 py-2">Details</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {syncs.length === 0 && <tr><td colSpan={3} className="px-3 py-6 text-center text-slate-500">No imports yet.</td></tr>}
            {syncs.map((sy) => (
              <tr key={sy.id}><td className="px-3 py-2 whitespace-nowrap text-xs">{formatDateTime(sy.startedAt, tz)}</td><td className="px-3 py-2 text-xs">{sy.status}</td><td className="whitespace-pre-line px-3 py-2 text-xs">{sy.message}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
