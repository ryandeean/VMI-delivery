"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { JobDTO } from "@/lib/services/runs";
import { formatTime } from "@/lib/time";

type RunProps = {
  id: string;
  date: string;
  dateLabel: string;
  status: string;
  vehicleName: string;
  vehicleRegistration: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  startedAt: string | null;
  notes: string;
  stops: JobDTO[];
};

type SettingsProps = { timezone: string; depotName: string; depotAddress: string; loadingMinutes: number; dispatchPhone: string };

export default function DriverRun({ token, run, settings }: { token: string; run: RunProps; settings: SettingsProps }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const tz = settings.timezone;

  async function act(label: string, body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    setBusy(label);
    setError(null);
    try {
      const res = await fetch(`/api/driver/${token}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) throw new Error((data.error as string) || "Something went wrong");
      router.refresh();
      return data;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(null);
    }
  }

  const start = run.plannedStart ? new Date(run.plannedStart) : null;
  const loadFrom = start ? new Date(start.getTime() - settings.loadingMinutes * 60000) : null;
  const remaining = run.stops.filter((s) => !["COMPLETED", "FAILED", "CANCELLED", "SKIPPED"].includes(s.status)).length;
  const nextStop = run.stops.find((s) => !["COMPLETED", "FAILED", "CANCELLED", "SKIPPED"].includes(s.status));

  return (
    <section className="card overflow-hidden">
      <div className="bg-slate-900 p-4 text-white">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-bold">{run.dateLabel}</h2>
          <span className="text-sm text-slate-300">{run.stops.length} stop{run.stops.length === 1 ? "" : "s"}{remaining < run.stops.length ? ` · ${remaining} left` : ""}</span>
        </div>
        <div className="mt-1 text-lg">{run.vehicleName}{run.vehicleRegistration ? <span className="ml-2 rounded bg-yellow-300 px-1.5 py-0.5 font-mono text-sm font-bold text-black">{run.vehicleRegistration}</span> : null}</div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded bg-white/10 p-2"><div className="text-xs text-slate-300">Load from</div><div className="text-lg font-bold">{loadFrom ? formatTime(loadFrom, tz) : "--:--"}</div></div>
          <div className="rounded bg-white/10 p-2"><div className="text-xs text-slate-300">Leave depot</div><div className="text-lg font-bold">{start ? formatTime(start, tz) : "--:--"}</div></div>
          <div className="rounded bg-white/10 p-2"><div className="text-xs text-slate-300">Back about</div><div className="text-lg font-bold">{run.plannedEnd ? formatTime(new Date(run.plannedEnd), tz) : "--:--"}</div></div>
        </div>
        {run.notes && <p className="mt-2 rounded bg-amber-400/20 p-2 text-sm">{run.notes}</p>}
        {run.status === "PUBLISHED" && (
          <button className="btn-success mt-3 w-full py-3 text-base" disabled={busy !== null} onClick={async () => { const r = await act("start", { action: "start", runId: run.id }); if (r) setNotice(`Run started. ${r.emails ? `${r.emails} client${r.emails === 1 ? "" : "s"} told the kit is on its way.` : ""}`); }}>
            {busy === "start" ? "Starting…" : "Start run (tells clients you are out)"}
          </button>
        )}
        {run.status === "IN_PROGRESS" && <p className="mt-3 text-sm text-emerald-300">Started {run.startedAt ? formatTime(new Date(run.startedAt), tz) : ""}. {nextStop ? `Next: ${nextStop.clientName}.` : "All stops done."}</p>}
        {run.status === "COMPLETED" && <p className="mt-3 text-sm text-emerald-300">Run finished. Nice one.</p>}
      </div>

      {(error || notice) && (
        <div className={`p-3 text-sm ${error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>{error ?? notice}</div>
      )}

      <ol className="divide-y divide-slate-200">
        {run.stops.map((s) => (
          <StopCard key={s.id} stop={s} tz={tz} busy={busy} act={act} isNext={nextStop?.id === s.id} runActive={run.status !== "COMPLETED"} />
        ))}
      </ol>
      <div className="p-3 text-center text-xs text-slate-500">
        Return to {settings.depotName}{settings.depotAddress ? `, ${settings.depotAddress}` : ""}.{settings.dispatchPhone ? ` Office: ${settings.dispatchPhone}` : ""}
      </div>
    </section>
  );
}

function StopCard({ stop: s, tz, busy, act, isNext, runActive }: { stop: JobDTO; tz: string; busy: string | null; act: (label: string, body: Record<string, unknown>) => Promise<Record<string, unknown> | null>; isNext: boolean; runActive: boolean }) {
  const [mode, setMode] = useState<"none" | "done" | "problem">("none");
  const [podName, setPodName] = useState("");
  const [notes, setNotes] = useState("");
  const [problem, setProblem] = useState("");
  const [markFailed, setMarkFailed] = useState(false);
  const [showItems, setShowItems] = useState(false);
  const finished = ["COMPLETED", "FAILED"].includes(s.status);
  const address = [s.addressLine1, s.addressLine2, s.city, s.postcode].filter(Boolean).join(", ");
  const nav = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}&travelmode=driving`;
  const eta = s.liveEta && !finished ? new Date(s.liveEta) : s.plannedArrival ? new Date(s.plannedArrival) : null;
  const goods = s.items.filter((i) => !i.isService);
  const disabled = busy !== null;

  return (
    <li className={`p-4 ${finished ? "bg-slate-50" : ""} ${isNext && runActive ? "border-l-4 border-blue-600" : ""}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${finished ? (s.status === "FAILED" ? "bg-red-600" : "bg-emerald-600") : "bg-slate-800"}`}>{finished ? (s.status === "FAILED" ? "!" : "✓") : s.sequence}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-lg font-bold">{eta ? formatTime(eta, tz) : "--:--"}</span>
            <span className={`badge ${s.type === "DELIVERY" ? "bg-blue-600 text-white" : "bg-amber-500 text-white"}`}>{s.type === "DELIVERY" ? "DELIVER" : "COLLECT"}</span>
            {s.windowStart && s.windowEnd && <span className="text-slate-500">slot {formatTime(new Date(s.windowStart), tz)}–{formatTime(new Date(s.windowEnd), tz)}</span>}
            {s.status === "EN_ROUTE" && <span className="badge bg-amber-100 text-amber-800">On the way</span>}
            {s.status === "ARRIVED" && <span className="badge bg-amber-100 text-amber-800">Arrived</span>}
          </div>
          <div className="mt-1 text-xl font-bold leading-tight">{s.clientName}</div>
          {(s.subject || s.opportunityNumber) && <div className="text-sm text-slate-600">{s.subject}{s.opportunityNumber ? ` · #${s.opportunityNumber}` : ""}</div>}
          <a href={nav} target="_blank" rel="noreferrer" className="mt-2 block rounded-md bg-blue-50 p-2 text-sm text-blue-800">
            <span className="font-semibold">📍 {address || "No address"}</span>
            <span className="block text-xs">Tap to navigate</span>
          </a>
          <div className="mt-2 space-y-1 text-sm">
            {(s.contactName || s.contactPhone || s.contactEmail) && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{s.contactName || "Contact"}</span>
                {s.contactPhone && <a className="btn-secondary py-1 text-xs" href={`tel:${s.contactPhone}`}>📞 {s.contactPhone}</a>}
                {s.contactEmail && <a className="btn-secondary py-1 text-xs" href={`mailto:${s.contactEmail}`}>✉ Email</a>}
              </div>
            )}
            {s.secondaryContacts.map((c, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 text-slate-700">
                <span>{c.name}{c.role ? <span className="text-slate-500"> · {c.role}</span> : null}</span>
                {c.phone && <a className="btn-secondary py-1 text-xs" href={`tel:${c.phone}`}>📞 {c.phone}</a>}
                {c.email && <a className="btn-secondary py-1 text-xs" href={`mailto:${c.email}`}>✉</a>}
              </div>
            ))}
          </div>
          {s.driverNotes && <div className="mt-2 rounded-md border-l-4 border-amber-400 bg-amber-50 p-2 text-sm">{s.driverNotes}</div>}
          {goods.length > 0 && (
            <div className="mt-2 text-sm">
              <button className="text-blue-700 underline" onClick={() => setShowItems((v) => !v)}>{showItems ? "Hide" : "Show"} {goods.reduce((n, i) => n + i.quantity, 0)} items</button>
              {showItems && <ul className="mt-1 list-disc pl-5 text-slate-700">{goods.map((i, k) => <li key={k}>{i.quantity} × {i.name}</li>)}</ul>}
            </div>
          )}

          {finished ? (
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className={s.status === "FAILED" ? "text-red-700" : "text-emerald-700"}>
                {s.status === "FAILED" ? "Could not complete" : s.type === "DELIVERY" ? "Delivered" : "Collected"} {s.completedAt ? formatTime(new Date(s.completedAt), tz) : ""}{s.podName ? ` · ${s.podName}` : ""}{s.podNotes ? ` · ${s.podNotes}` : ""}
              </span>
              {runActive && <button className="text-xs text-slate-500 underline" disabled={disabled} onClick={() => act(`undo-${s.id}`, { action: "undo", jobId: s.id })}>Undo</button>}
            </div>
          ) : runActive ? (
            <div className="mt-3 space-y-2">
              {mode === "none" && (
                <div className="grid grid-cols-2 gap-2">
                  {s.status !== "EN_ROUTE" && s.status !== "ARRIVED" && (
                    <button className="btn-primary col-span-2 py-3 text-base" disabled={disabled} onClick={() => act(`omw-${s.id}`, { action: "onMyWay", jobId: s.id })}>{busy === `omw-${s.id}` ? "Sending…" : "On my way (tells the client)"}</button>
                  )}
                  {s.status === "EN_ROUTE" && <button className="btn-secondary py-3" disabled={disabled} onClick={() => act(`arr-${s.id}`, { action: "arrived", jobId: s.id })}>Arrived</button>}
                  <button className={`btn-success py-3 ${s.status === "EN_ROUTE" ? "" : "col-span-2"}`} disabled={disabled} onClick={() => setMode("done")}>{s.type === "DELIVERY" ? "Delivered ✓" : "Collected ✓"}</button>
                  <button className="btn-danger col-span-2" disabled={disabled} onClick={() => setMode("problem")}>Problem…</button>
                </div>
              )}
              {mode === "done" && (
                <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50 p-3">
                  <label className="block text-sm font-semibold">Handed to / collected from (name)<input className="input mt-1" value={podName} onChange={(e) => setPodName(e.target.value)} placeholder="e.g. Hannah at reception" /></label>
                  <label className="block text-sm">Notes (optional)<input className="input mt-1" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Left in stage 5 store" /></label>
                  <div className="grid grid-cols-2 gap-2">
                    <button className="btn-ghost" onClick={() => setMode("none")}>Back</button>
                    <button className="btn-success py-3" disabled={disabled} onClick={async () => { const r = await act(`done-${s.id}`, { action: "complete", jobId: s.id, podName, notes }); if (r) setMode("none"); }}>{busy === `done-${s.id}` ? "Saving…" : "Confirm"}</button>
                  </div>
                </div>
              )}
              {mode === "problem" && (
                <div className="space-y-2 rounded-md border border-red-200 bg-red-50 p-3">
                  <label className="block text-sm font-semibold">What is wrong?<textarea className="input mt-1" rows={3} value={problem} onChange={(e) => setProblem(e.target.value)} placeholder="Nobody on site, wrong address, kit refused…" /></label>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={markFailed} onChange={(e) => setMarkFailed(e.target.checked)} /> I cannot complete this stop</label>
                  <p className="text-xs text-slate-600">This alerts the office and the account handler straight away.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button className="btn-ghost" onClick={() => setMode("none")}>Back</button>
                    <button className="btn-danger" disabled={disabled || !problem.trim()} onClick={async () => { const r = await act(`prob-${s.id}`, { action: "problem", jobId: s.id, message: problem, markFailed }); if (r) { setMode("none"); setProblem(""); } }}>{busy === `prob-${s.id}` ? "Sending…" : "Send alert"}</button>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}
