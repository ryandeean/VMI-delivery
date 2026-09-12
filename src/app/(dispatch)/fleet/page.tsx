import { PageHeader } from "@/components/ui";
import { prisma } from "@/lib/db";
import { VEHICLE_CLASSES, vehicleClass } from "@/lib/vehicles";
import { addVehicleAction, deleteVehicleAction, updateVehicleAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function FleetPage() {
  const vehicles = await prisma.vehicle.findMany({ orderBy: [{ active: "desc" }, { capacityVolumeM3: "asc" }] });
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Vehicles" subtitle="The planner picks the smallest van that carries each round. Capacities are usable load space, not the brochure figure." />

      <form action={addVehicleAction} className="card mb-6 p-4">
        <h2 className="mb-3 font-bold">Add a vehicle</h2>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <label className="text-sm lg:col-span-2">Name<input name="name" className="input mt-1" placeholder="Van 4 (Sprinter)" required /></label>
          <label className="text-sm">Registration<input name="registration" className="input mt-1" placeholder="LX24 ABC" /></label>
          <label className="text-sm">Size
            <select name="vehicleClass" className="input mt-1" defaultValue="MEDIUM_VAN">
              {VEHICLE_CLASSES.map((c) => <option key={c.code} value={c.code}>{c.label} ({c.example})</option>)}
            </select>
          </label>
          <label className="text-sm">Load space (m³)<input name="capacityVolumeM3" type="number" step="0.1" className="input mt-1" placeholder="auto" /></label>
          <label className="text-sm">Max load (kg)<input name="capacityWeightKg" type="number" className="input mt-1" placeholder="auto" /></label>
        </div>
        <p className="mt-2 text-xs text-slate-500">Leave load space and max load blank to use typical figures for that size. Licence: cars and vans up to 3.5t need B; a 7.5t truck needs C1.</p>
        <button className="btn-primary mt-3" type="submit">Add vehicle</button>
      </form>

      <div className="space-y-3">
        {vehicles.map((v) => (
          <form key={v.id} action={updateVehicleAction} className={`card p-4 ${v.active ? "" : "opacity-60"}`}>
            <input type="hidden" name="id" value={v.id} />
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-7">
              <label className="text-sm lg:col-span-2">Name<input name="name" className="input mt-1" defaultValue={v.name} required /></label>
              <label className="text-sm">Registration<input name="registration" className="input mt-1" defaultValue={v.registration} /></label>
              <label className="text-sm">Size
                <select name="vehicleClass" className="input mt-1" defaultValue={v.vehicleClass}>
                  {VEHICLE_CLASSES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                </select>
              </label>
              <label className="text-sm">Load space (m³)<input name="capacityVolumeM3" type="number" step="0.1" className="input mt-1" defaultValue={v.capacityVolumeM3} /></label>
              <label className="text-sm">Max load (kg)<input name="capacityWeightKg" type="number" className="input mt-1" defaultValue={v.capacityWeightKg} /></label>
              <label className="text-sm">Licence needed
                <select name="licenceRequired" className="input mt-1" defaultValue={v.licenceRequired}>
                  <option value="B">B (car / van)</option>
                  <option value="C1">C1 (7.5t)</option>
                  <option value="C">C (HGV)</option>
                </select>
              </label>
              <label className="text-sm lg:col-span-5">Notes<input name="notes" className="input mt-1" defaultValue={v.notes} placeholder="Tail lift, no parking sensors, due MOT…" /></label>
              <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="active" defaultChecked={v.active} /> In service</label>
              <div className="flex items-end justify-end gap-2">
                <button className="btn-secondary" type="submit">Save</button>
                <button className="btn-danger" formAction={deleteVehicleAction} type="submit">Delete</button>
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-500">Typical {vehicleClass(v.vehicleClass).label.toLowerCase()}: {vehicleClass(v.vehicleClass).typicalVolumeM3} m³, {vehicleClass(v.vehicleClass).typicalWeightKg} kg.</p>
          </form>
        ))}
      </div>
    </div>
  );
}
