import { Field, Notice, PageHeader } from "@/components/ui";
import { integrationStatus } from "@/lib/config";
import { getSettings } from "@/lib/services/settings";
import { saveSettingsAction, testIntegrationAction } from "./actions";

export const dynamic = "force-dynamic";

const TIMEZONES = ["Europe/London", "Europe/Dublin", "Europe/Paris", "Europe/Berlin", "Europe/Madrid", "Europe/Amsterdam", "America/New_York", "America/Los_Angeles", "Australia/Sydney"];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string; warn?: string; test?: string }> }) {
  const sp = await searchParams;
  const s = await getSettings();
  const integrations = integrationStatus();
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Settings" subtitle="Depot, working hours and the assumptions the planner uses." />
      {sp.saved && <Notice kind="success">Settings saved.</Notice>}
      {sp.warn === "depot" && <Notice kind="error">The depot address could not be placed on the map. Check the postcode, or type the latitude and longitude by hand.</Notice>}
      {sp.test && <Notice kind={/works|Connected/.test(sp.test) ? "success" : "info"}>{sp.test}</Notice>}

      <div className="card mb-6 p-4">
        <h2 className="mb-1 font-bold">Connections</h2>
        <p className="mb-3 text-xs text-slate-500">Keys live in the <code>.env</code> file on the server (see README). Everything works without them; each connection switches on when its key is added.</p>
        <ul className="divide-y divide-slate-100">
          {integrations.map((i) => (
            <li key={i.key} className="flex flex-wrap items-center gap-3 py-2 text-sm">
              <span className={`badge ${i.configured ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{i.configured ? "On" : "Off"}</span>
              <span className="w-56 font-semibold">{i.label}</span>
              <span className="flex-1 text-xs text-slate-600">{i.detail}</span>
              {["current", "calendar", "email", "maps"].includes(i.key) && (
                <form action={testIntegrationAction}><input type="hidden" name="kind" value={i.key} /><button className="btn-ghost text-xs" type="submit">Test</button></form>
              )}
            </li>
          ))}
        </ul>
      </div>

      <form action={saveSettingsAction} className="space-y-6">
        <section className="card p-4">
          <h2 className="mb-3 font-bold">Company and depot</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Company name"><input name="companyName" className="input" defaultValue={s.companyName} /></Field>
            <Field label="Timezone">
              <select name="timezone" className="input" defaultValue={s.timezone}>{TIMEZONES.map((t) => <option key={t}>{t}</option>)}</select>
            </Field>
            <Field label="Dispatch email" hint="Copied on driver and client emails; gets problem alerts."><input name="dispatchEmail" type="email" className="input" defaultValue={s.dispatchEmail} /></Field>
            <Field label="Dispatch phone" hint="Shown to clients in emails."><input name="dispatchPhone" className="input" defaultValue={s.dispatchPhone} /></Field>
            <Field label="Depot name"><input name="depotName" className="input" defaultValue={s.depotName} /></Field>
            <Field label="Depot address" className="sm:col-span-2" hint="Runs start and end here. Placed on the map automatically when you save."><input name="depotAddress" className="input" defaultValue={s.depotAddress} /></Field>
            <Field label="Depot map location" hint={s.depotLat !== null ? "Found" : "Not found yet"}>
              <div className="flex gap-1"><input name="depotLat" className="input" defaultValue={s.depotLat ?? ""} placeholder="lat" /><input name="depotLng" className="input" defaultValue={s.depotLng ?? ""} placeholder="lng" /></div>
            </Field>
          </div>
        </section>

        <section className="card p-4">
          <h2 className="mb-3 font-bold">Working day</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Earliest departure"><input name="dayStart" type="time" className="input" defaultValue={s.dayStart} /></Field>
            <Field label="Latest return"><input name="dayEnd" type="time" className="input" defaultValue={s.dayEnd} /></Field>
            <Field label="Loading time before leaving (min)"><input name="loadingMinutes" type="number" className="input" defaultValue={s.loadingMinutes} /></Field>
            <Field label="Safety buffer on start time (min)" hint="Drivers leave this much earlier than the tightest plan."><input name="startBufferMinutes" type="number" className="input" defaultValue={s.startBufferMinutes} /></Field>
            <Field label="Default time on site (min)"><input name="defaultServiceMinutes" type="number" className="input" defaultValue={s.defaultServiceMinutes} /></Field>
            <Field label="Longest run (hours)"><input name="maxRunHours" type="number" step="0.5" className="input" defaultValue={s.maxRunHours} /></Field>
            <Field label="Most stops per run"><input name="maxStopsPerRun" type="number" className="input" defaultValue={s.maxStopsPerRun} /></Field>
            <Field label="Arrival window told to clients (min)" hint="e.g. 60 = between 10:00 and 11:00."><input name="clientEtaWindowMinutes" type="number" className="input" defaultValue={s.clientEtaWindowMinutes} /></Field>
          </div>
        </section>

        <section className="card p-4">
          <h2 className="mb-1 font-bold">Sizing orders</h2>
          <p className="mb-3 text-xs text-slate-500">Used to turn an order&apos;s item list into van space. Products without dimensions in Current RMS get the defaults below; you can also set the size on any job by hand.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Packing factor" hint="1.3 = cases and awkward shapes take 30% more room than their volume."><input name="packingFactor" type="number" step="0.05" className="input" defaultValue={s.packingFactor} /></Field>
            <Field label="Default volume per item (m³)"><input name="defaultItemVolumeM3" type="number" step="0.01" className="input" defaultValue={s.defaultItemVolumeM3} /></Field>
            <Field label="Default weight per item (kg)"><input name="defaultItemWeightKg" type="number" step="0.5" className="input" defaultValue={s.defaultItemWeightKg} /></Field>
          </div>
        </section>

        <button className="btn-primary" type="submit">Save settings</button>
      </form>
    </div>
  );
}
