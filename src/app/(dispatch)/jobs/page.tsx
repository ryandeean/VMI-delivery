import Link from "next/link";
import { Notice, PageHeader } from "@/components/ui";
import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { getSettings } from "@/lib/services/settings";
import { addDays, formatTime, isValidDateString, todayString } from "@/lib/time";
import { vehicleClassLabel } from "@/lib/vehicles";
import { importJobsAction } from "./actions";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { UNSCHEDULED: "To schedule", SCHEDULED: "Scheduled", EN_ROUTE: "On the way", ARRIVED: "Arrived", COMPLETED: "Done", FAILED: "Problem", SKIPPED: "Not needed", CANCELLED: "Cancelled" };

export default async function JobsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; status?: string; msg?: string; ok?: string; q?: string }> }) {
  const sp = await searchParams;
  const settings = await getSettings();
  const tz = settings.timezone;
  const from = isValidDateString(sp.from) ? sp.from : todayString(tz);
  const to = isValidDateString(sp.to) ? sp.to : addDays(from, 7);
  const q = (sp.q ?? "").trim();
  const jobs = await prisma.job.findMany({
    where: {
      date: { gte: from, lte: to },
      ...(sp.status ? { status: sp.status } : {}),
      ...(q ? { OR: [{ clientName: { contains: q } }, { subject: { contains: q } }, { opportunityNumber: { contains: q } }, { postcode: { contains: q } }] } : {}),
    },
    include: { run: { include: { driver: true } } },
    orderBy: [{ date: "asc" }, { windowStart: "asc" }],
  });
  const current = config.currentRms();
  const connected = Boolean(current.subdomain && current.apiKey);
  return (
    <div>
      <PageHeader title="Jobs" subtitle="Every delivery and collection, from Current RMS or added by hand." action={<Link href={`/jobs/new?date=${from}`} className="btn-primary">+ Add job</Link>} />
      {sp.msg && <Notice kind={sp.ok === "1" ? "success" : "info"}>{sp.msg}</Notice>}

      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        <form className="card flex flex-wrap items-end gap-2 p-3" method="get">
          <label className="text-sm">From<input type="date" name="from" className="input mt-1" defaultValue={from} /></label>
          <label className="text-sm">To<input type="date" name="to" className="input mt-1" defaultValue={to} /></label>
          <label className="text-sm">Status
            <select name="status" className="input mt-1" defaultValue={sp.status ?? ""}>
              <option value="">Any</option>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="text-sm">Search<input name="q" className="input mt-1" placeholder="client, order no, postcode" defaultValue={q} /></label>
          <button className="btn-secondary" type="submit">Show</button>
        </form>
        <form action={importJobsAction} className="card flex flex-wrap items-end gap-2 p-3">
          <div className="w-full text-sm font-semibold">{connected ? `Import from Current RMS (${current.subdomain})` : "Load sample orders (Current RMS not connected yet)"}</div>
          <label className="text-sm">From<input type="date" name="from" className="input mt-1" defaultValue={from} /></label>
          <label className="text-sm">To<input type="date" name="to" className="input mt-1" defaultValue={to} /></label>
          <button className="btn-primary" type="submit">{connected ? "Import orders" : "Load samples"}</button>
          <p className="w-full text-xs text-slate-500">Confirmed orders become a delivery on the day the hire starts and a collection when it ends. Re-importing refreshes details without losing your planning.</p>
        </form>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Slot</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Client</th>
              <th className="px-3 py-2">Where</th>
              <th className="px-3 py-2">Size</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Driver</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {jobs.length === 0 && <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-500">No jobs in this range. Import from Current or add one.</td></tr>}
            {jobs.map((j) => (
              <tr key={j.id} className="hover:bg-slate-50">
                <td className="px-3 py-2 whitespace-nowrap"><Link href={`/?date=${j.date}`} className="text-blue-700 hover:underline">{j.date}</Link></td>
                <td className="px-3 py-2 whitespace-nowrap">{j.windowStart && j.windowEnd ? `${formatTime(j.windowStart, tz)}–${formatTime(j.windowEnd, tz)}` : ""}</td>
                <td className="px-3 py-2">{j.type === "DELIVERY" ? "Delivery" : "Collection"}</td>
                <td className="px-3 py-2"><div className="font-semibold">{j.clientName}</div><div className="text-xs text-slate-500">{j.subject}{j.opportunityNumber ? ` · #${j.opportunityNumber}` : ""}</div></td>
                <td className="px-3 py-2 text-xs text-slate-600">{[j.city, j.postcode].filter(Boolean).join(" ")}{j.lat === null ? <span className="ml-1 text-red-600">(no map location)</span> : null}</td>
                <td className="px-3 py-2 text-xs">{vehicleClassLabel(j.requiredVehicleClass)}<div className="text-slate-500">{j.volumeM3} m³ · {Math.round(j.weightKg)} kg</div></td>
                <td className="px-3 py-2 text-xs">{STATUS[j.status] ?? j.status}</td>
                <td className="px-3 py-2 text-xs">{j.run?.driver?.name ?? ""}</td>
                <td className="px-3 py-2 text-right"><Link href={`/jobs/${j.id}`} className="text-blue-700 hover:underline">Edit</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
