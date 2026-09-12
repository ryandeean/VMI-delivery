import { notFound } from "next/navigation";
import { BackLink, Notice, PageHeader } from "@/components/ui";
import { prisma } from "@/lib/db";
import { portalUrl } from "@/lib/services/views";
import { addAbsenceAction, deleteAbsenceAction, deleteDriverAction, emailPortalLinkAction, newPortalLinkAction, updateDriverAction } from "../actions";

export const dynamic = "force-dynamic";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function DriverPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; linksent?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const driver = await prisma.driver.findUnique({ where: { id }, include: { absences: { orderBy: { startDate: "desc" } }, runs: { orderBy: { date: "desc" }, take: 10, include: { jobs: true, vehicle: true } } } });
  if (!driver) notFound();
  const days = driver.workingDays.split(",").map(Number);
  const licences = driver.licenceCategories.split(",");
  const link = portalUrl(driver);
  return (
    <div className="mx-auto max-w-5xl">
      <BackLink href="/drivers">All drivers</BackLink>
      <PageHeader title={driver.name} />
      {sp.saved && <Notice kind="success">Saved.</Notice>}
      {sp.linksent && <Notice kind={sp.linksent === "FAILED" || sp.linksent === "SKIPPED" ? "error" : "success"}>{sp.linksent === "SENT" ? "Link emailed to the driver." : sp.linksent === "PREVIEW" ? "Email is not set up yet, so the message was saved to the Emails page instead." : "Could not send: check the driver has an email address and that email is configured."}</Notice>}

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <form action={updateDriverAction} className="card p-4">
          <input type="hidden" name="id" value={driver.id} />
          <h2 className="mb-3 font-bold">Details</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm">Name<input name="name" className="input mt-1" defaultValue={driver.name} required /></label>
            <label className="text-sm">Mobile<input name="phone" className="input mt-1" defaultValue={driver.phone} /></label>
            <label className="text-sm">Email<input name="email" type="email" className="input mt-1" defaultValue={driver.email} /></label>
            <div className="text-sm sm:col-span-2">
              <span className="label">Working days</span>
              <div className="flex flex-wrap gap-3">{DAYS.map((d, i) => <label key={d} className="flex items-center gap-1"><input type="checkbox" name={`day${i + 1}`} defaultChecked={days.includes(i + 1)} /> {d}</label>)}</div>
            </div>
            <div className="text-sm">
              <span className="label">Licence</span>
              <div className="flex flex-wrap gap-3">
                <label className="flex items-center gap-1"><input type="checkbox" name="licB" defaultChecked={licences.includes("B")} /> B</label>
                <label className="flex items-center gap-1"><input type="checkbox" name="licC1" defaultChecked={licences.includes("C1")} /> C1</label>
                <label className="flex items-center gap-1"><input type="checkbox" name="licC" defaultChecked={licences.includes("C")} /> C</label>
              </div>
            </div>
            <label className="text-sm sm:col-span-2">Notes<input name="notes" className="input mt-1" defaultValue={driver.notes} /></label>
            <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="active" defaultChecked={driver.active} /> Active</label>
          </div>
          <div className="mt-3 flex gap-2">
            <button className="btn-primary" type="submit">Save</button>
            <button className="btn-danger ml-auto" formAction={deleteDriverAction} type="submit">Delete driver</button>
          </div>
        </form>

        <div className="space-y-4">
          <div className="card p-4">
            <h2 className="mb-2 font-bold">Phone link</h2>
            <p className="mb-2 text-xs text-slate-500">The driver opens this on their phone to see the day&apos;s stops, contacts and addresses, and to send &quot;on my way&quot; updates. No login needed.</p>
            <input className="input mb-2 text-xs" readOnly value={link} onFocus={undefined} />
            <div className="flex flex-wrap gap-2">
              <a className="btn-secondary" href={link} target="_blank" rel="noreferrer">Open</a>
              <form action={emailPortalLinkAction}><input type="hidden" name="id" value={driver.id} /><button className="btn-secondary" type="submit" disabled={!driver.email}>Email it to them</button></form>
              <form action={newPortalLinkAction}><input type="hidden" name="id" value={driver.id} /><button className="btn-ghost text-xs" type="submit">New link (old one stops working)</button></form>
            </div>
          </div>

          <div className="card p-4">
            <h2 className="mb-2 font-bold">Time off</h2>
            <form action={addAbsenceAction} className="mb-3 grid grid-cols-2 gap-2 text-sm">
              <input type="hidden" name="driverId" value={driver.id} />
              <label>From<input type="date" name="startDate" className="input mt-1" required /></label>
              <label>To<input type="date" name="endDate" className="input mt-1" /></label>
              <input name="reason" className="input col-span-2" placeholder="Holiday, sick, training…" />
              <button className="btn-secondary col-span-2" type="submit">Add time off</button>
            </form>
            <ul className="divide-y divide-slate-100 text-sm">
              {driver.absences.length === 0 && <li className="py-1 text-xs text-slate-500">No time off recorded.</li>}
              {driver.absences.map((a) => (
                <li key={a.id} className="flex items-center justify-between py-1">
                  <span>{a.startDate}{a.endDate !== a.startDate ? ` to ${a.endDate}` : ""}{a.reason ? <span className="text-slate-500"> · {a.reason}</span> : null}</span>
                  <form action={deleteAbsenceAction}><input type="hidden" name="id" value={a.id} /><button className="text-xs text-red-600 hover:underline" type="submit">Remove</button></form>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {driver.runs.length > 0 && (
        <div className="card mt-4 p-4">
          <h2 className="mb-2 font-bold">Recent runs</h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {driver.runs.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-1"><a href={`/?date=${r.date}`} className="text-blue-700 hover:underline">{r.date}</a><span className="text-slate-500">{r.vehicle?.name ?? "no vehicle"} · {r.jobs.length} stops · {r.status.toLowerCase().replace("_", " ")}</span></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
