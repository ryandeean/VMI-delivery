import DriverRun from "@/components/DriverRun";
import { driverByToken, driverRuns } from "@/lib/services/driverActions";
import { getSettings } from "@/lib/services/settings";
import { jobDTO } from "@/lib/services/runs";
import { formatLongDate, todayString } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function DriverPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const settings = await getSettings();
  const driver = await driverByToken(token);
  if (!driver) {
    return (
      <main className="mx-auto max-w-md p-6 text-center">
        <h1 className="text-xl font-bold">Link not recognised</h1>
        <p className="mt-2 text-slate-600">Ask the office to send you a new link.</p>
      </main>
    );
  }
  const runs = await driverRuns(driver.id);
  const today = todayString(settings.timezone);
  return (
    <main className="mx-auto max-w-lg px-3 pb-16 pt-4">
      <header className="mb-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{settings.companyName} Deliveries</div>
        <h1 className="text-2xl font-bold">Hi {driver.name.split(" ")[0]}</h1>
      </header>
      {runs.length === 0 && (
        <div className="card p-6 text-center text-slate-600">
          <p className="text-lg font-semibold text-slate-800">Nothing scheduled yet</p>
          <p className="mt-1 text-sm">Your runs appear here as soon as the office sends them. Pull down to refresh.</p>
        </div>
      )}
      <div className="space-y-6">
        {runs.map((run) => (
          <DriverRun
            key={run.id}
            token={token}
            run={{
              id: run.id,
              date: run.date,
              dateLabel: run.date === today ? "Today" : formatLongDate(run.date),
              status: run.status,
              vehicleName: run.vehicle?.name ?? "Vehicle to be confirmed",
              vehicleRegistration: run.vehicle?.registration ?? "",
              plannedStart: run.plannedStart?.toISOString() ?? null,
              plannedEnd: run.plannedEnd?.toISOString() ?? null,
              startedAt: run.startedAt?.toISOString() ?? null,
              notes: run.notes,
              stops: [...run.jobs].sort((a, b) => a.sequence - b.sequence).map(jobDTO),
            }}
            settings={{ timezone: settings.timezone, depotName: settings.depotName, depotAddress: settings.depotAddress, loadingMinutes: settings.loadingMinutes, dispatchPhone: settings.dispatchPhone }}
          />
        ))}
      </div>
    </main>
  );
}
