import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { prisma } from "@/lib/db";
import { addDriverAction } from "./actions";

export const dynamic = "force-dynamic";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function DriversPage() {
  const drivers = await prisma.driver.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }], include: { absences: { orderBy: { startDate: "asc" } } } });
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Drivers" subtitle="Who can drive, on which days, and what licence they hold. Holidays and sick days are recorded on each driver's page." />

      <form action={addDriverAction} className="card mb-6 p-4">
        <h2 className="mb-3 font-bold">Add a driver</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm">Name<input name="name" className="input mt-1" required /></label>
          <label className="text-sm">Mobile<input name="phone" className="input mt-1" /></label>
          <label className="text-sm">Email<input name="email" type="email" className="input mt-1" /></label>
          <div className="text-sm sm:col-span-2">
            <span className="label">Working days</span>
            <div className="flex flex-wrap gap-3">{DAYS.map((d, i) => <label key={d} className="flex items-center gap-1"><input type="checkbox" name={`day${i + 1}`} defaultChecked={i < 5} /> {d}</label>)}</div>
          </div>
          <div className="text-sm">
            <span className="label">Licence</span>
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-1"><input type="checkbox" name="licB" defaultChecked /> B (van)</label>
              <label className="flex items-center gap-1"><input type="checkbox" name="licC1" /> C1 (7.5t)</label>
              <label className="flex items-center gap-1"><input type="checkbox" name="licC" /> C (HGV)</label>
            </div>
          </div>
        </div>
        <button className="btn-primary mt-3" type="submit">Add driver</button>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="px-3 py-2">Driver</th><th className="px-3 py-2">Contact</th><th className="px-3 py-2">Works</th><th className="px-3 py-2">Licence</th><th className="px-3 py-2">Time off</th><th className="px-3 py-2"></th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {drivers.map((d) => {
              const days = d.workingDays.split(",").map(Number);
              const upcoming = d.absences.filter((a) => a.endDate >= today);
              return (
                <tr key={d.id} className={d.active ? "" : "opacity-60"}>
                  <td className="px-3 py-2 font-semibold">{d.name}{!d.active && <span className="badge ml-2 bg-slate-100 text-slate-600">Inactive</span>}</td>
                  <td className="px-3 py-2 text-xs">{d.phone}<br />{d.email}</td>
                  <td className="px-3 py-2 text-xs">{DAYS.filter((_, i) => days.includes(i + 1)).join(" ")}</td>
                  <td className="px-3 py-2 text-xs">{d.licenceCategories}</td>
                  <td className="px-3 py-2 text-xs">{upcoming.length ? upcoming.map((a) => `${a.startDate}${a.endDate !== a.startDate ? ` to ${a.endDate}` : ""}${a.reason ? ` (${a.reason})` : ""}`).join("; ") : "None booked"}</td>
                  <td className="px-3 py-2 text-right"><Link href={`/drivers/${d.id}`} className="text-blue-700 hover:underline">Edit</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
