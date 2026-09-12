import type { Job } from "@prisma/client";
import { Field } from "@/components/ui";
import { deleteJobAction, saveJobAction, skipJobAction } from "@/app/(dispatch)/jobs/actions";
import { parseContacts, parseItems } from "@/lib/services/json";
import { formatTime } from "@/lib/time";

type Props = { job?: Job; date: string; tz: string; defaultServiceMinutes: number };

export default function JobForm({ job, date, tz, defaultServiceMinutes }: Props) {
  const items = job ? parseItems(job.items) : [];
  const contacts = job ? parseContacts(job.secondaryContacts) : [];
  const itemLines = items.map((i) => `${i.quantity} x ${i.name}${i.volumeM3 || i.weightKg ? ` (${[i.volumeM3 ? `${i.volumeM3} m3` : "", i.weightKg ? `${i.weightKg} kg` : ""].filter(Boolean).join(", ")})` : ""}`).join("\n");
  const contactLines = contacts.map((c) => [c.name, c.phone, c.email, c.role ?? ""].join(", ").replace(/(, )+$/, "")).join("\n");
  const fromCurrent = job?.source === "CURRENT_RMS";
  return (
    <form action={saveJobAction} className="space-y-6">
      {job && <input type="hidden" name="id" value={job.id} />}
      {fromCurrent && <p className="rounded-md bg-blue-50 p-2 text-xs text-blue-800">This job came from Current RMS order #{job.opportunityNumber}. Client, address, slot and items refresh on every sync; your notes, timing on site and load override are kept.</p>}

      <section className="card p-4">
        <h2 className="mb-3 font-bold">What and when</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Type">
            <select name="type" className="input" defaultValue={job?.type ?? "DELIVERY"}>
              <option value="DELIVERY">Delivery</option>
              <option value="COLLECTION">Collection</option>
            </select>
          </Field>
          <Field label="Date"><input name="date" type="date" className="input" defaultValue={job?.date ?? date} required /></Field>
          <Field label="Slot from"><input name="windowStartTime" type="time" className="input" defaultValue={job?.windowStart ? formatTime(job.windowStart, tz) : ""} /></Field>
          <Field label="Slot to"><input name="windowEndTime" type="time" className="input" defaultValue={job?.windowEnd ? formatTime(job.windowEnd, tz) : ""} /></Field>
          <Field label="Client / company" className="sm:col-span-2"><input name="clientName" className="input" defaultValue={job?.clientName ?? ""} required /></Field>
          <Field label="Job / kit description"><input name="subject" className="input" defaultValue={job?.subject ?? ""} placeholder="e.g. Alexa 35 package" /></Field>
          <Field label="Order number"><input name="opportunityNumber" className="input" defaultValue={job?.opportunityNumber ?? ""} /></Field>
          <Field label="Time on site (minutes)"><input name="serviceMinutes" type="number" min={0} className="input" defaultValue={job?.serviceMinutes ?? defaultServiceMinutes} /></Field>
        </div>
      </section>

      <section className="card p-4">
        <h2 className="mb-3 font-bold">Where</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Address line 1" className="sm:col-span-2"><input name="addressLine1" className="input" defaultValue={job?.addressLine1 ?? ""} /></Field>
          <Field label="Address line 2" className="sm:col-span-2"><input name="addressLine2" className="input" defaultValue={job?.addressLine2 ?? ""} /></Field>
          <Field label="Town / city"><input name="city" className="input" defaultValue={job?.city ?? ""} /></Field>
          <Field label="Postcode"><input name="postcode" className="input" defaultValue={job?.postcode ?? ""} /></Field>
          <Field label="Country"><input name="country" className="input" defaultValue={job?.country ?? "United Kingdom"} /></Field>
          <Field label="Map location" hint={job?.lat != null ? `Found: ${job.lat.toFixed(5)}, ${job.lng?.toFixed(5)}. Change the address and it is looked up again.` : "Looked up automatically from the address when you save."}>
            <div className="flex gap-1">
              <input name="lat" className="input" placeholder="lat" defaultValue={job?.lat ?? ""} />
              <input name="lng" className="input" placeholder="lng" defaultValue={job?.lng ?? ""} />
            </div>
          </Field>
        </div>
      </section>

      <section className="card p-4">
        <h2 className="mb-3 font-bold">Who to contact</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Contact name"><input name="contactName" className="input" defaultValue={job?.contactName ?? ""} /></Field>
          <Field label="Contact phone"><input name="contactPhone" className="input" defaultValue={job?.contactPhone ?? ""} /></Field>
          <Field label="Contact email" hint="Gets the 'out for delivery' and 'driver on the way' emails."><input name="contactEmail" type="email" className="input" defaultValue={job?.contactEmail ?? ""} /></Field>
          <Field label="Other contacts on site" className="sm:col-span-3" hint="One per line: Name, phone, email, role"><textarea name="secondaryContacts" className="input" rows={3} defaultValue={contactLines} /></Field>
          <Field label="Account handler"><input name="accountHandlerName" className="input" defaultValue={job?.accountHandlerName ?? ""} /></Field>
          <Field label="Account handler email" hint="Gets the plan for the day and any problem alerts."><input name="accountHandlerEmail" type="email" className="input" defaultValue={job?.accountHandlerEmail ?? ""} /></Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="clientNotify" defaultChecked={job?.clientNotify ?? true} /> Email the client with arrival times</label>
        </div>
      </section>

      <section className="card p-4">
        <h2 className="mb-1 font-bold">What is going</h2>
        <p className="mb-3 text-xs text-slate-500">The van size is worked out from the items. Sizes in brackets are optional: <code>2 x Skypanel S60 (0.25 m3, 22 kg)</code>.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Items (one per line)"><textarea name="items" className="input font-mono text-xs" rows={8} defaultValue={itemLines} /></Field>
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="loadOverride" defaultChecked={job?.loadOverride ?? false} /> Set the size by hand instead</label>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Volume (m³)"><input name="volumeM3" type="number" step="0.1" min={0} className="input" defaultValue={job?.volumeM3 ?? ""} /></Field>
              <Field label="Weight (kg)"><input name="weightKg" type="number" step="1" min={0} className="input" defaultValue={job?.weightKg ?? ""} /></Field>
            </div>
            {job && <p className="text-xs text-slate-500">Currently rated: {job.volumeM3} m³, {Math.round(job.weightKg)} kg, needs a {job.requiredVehicleClass.replace(/_/g, " ").toLowerCase()}.</p>}
          </div>
        </div>
      </section>

      <section className="card p-4">
        <h2 className="mb-3 font-bold">Notes</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Notes for the driver" hint="Shown on the driver's phone and run sheet (parking, access, who to ask for)."><textarea name="driverNotes" className="input" rows={3} defaultValue={job?.driverNotes ?? ""} /></Field>
          <Field label="Internal notes"><textarea name="notes" className="input" rows={3} defaultValue={job?.notes ?? ""} /></Field>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-primary" type="submit">Save job</button>
        {job && (
          <>
            <button className="btn-secondary" formAction={skipJobAction} type="submit">{job.status === "SKIPPED" ? "Needs transport after all" : "No transport needed"}</button>
            <button className="btn-danger ml-auto" formAction={deleteJobAction} type="submit">Delete job</button>
          </>
        )}
      </div>
    </form>
  );
}
