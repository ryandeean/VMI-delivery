"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, type DragEvent } from "react";
import RouteMap, { RUN_COLOURS } from "@/components/RouteMap";
import type { DayState, JobDTO, RunDTO } from "@/lib/services/runs";
import { addDays, formatDistance, formatDuration, formatLongDate, formatTime, todayString } from "@/lib/time";
import { vehicleClassLabel } from "@/lib/vehicles";

type Message = { kind: "info" | "error" | "success"; text: string; details?: string[] };
type PublishInfo = { calendar: { status: string; message: string }; emails: { kind: string; to: string; status: string }[]; warnings: string[] };

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  UNSCHEDULED: { label: "Unscheduled", cls: "bg-slate-100 text-slate-700" },
  SCHEDULED: { label: "Scheduled", cls: "bg-blue-50 text-blue-700" },
  EN_ROUTE: { label: "On the way", cls: "bg-amber-100 text-amber-800" },
  ARRIVED: { label: "Arrived", cls: "bg-amber-100 text-amber-800" },
  COMPLETED: { label: "Done", cls: "bg-emerald-100 text-emerald-800" },
  FAILED: { label: "Problem", cls: "bg-red-100 text-red-800" },
  SKIPPED: { label: "Not needed", cls: "bg-slate-100 text-slate-500" },
  CANCELLED: { label: "Cancelled", cls: "bg-red-50 text-red-700" },
};

const RUN_STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "Draft", cls: "bg-slate-100 text-slate-700" },
  PUBLISHED: { label: "Sent to driver", cls: "bg-blue-100 text-blue-800" },
  IN_PROGRESS: { label: "Out now", cls: "bg-amber-100 text-amber-800" },
  COMPLETED: { label: "Finished", cls: "bg-emerald-100 text-emerald-800" },
};

export default function DayBoard({ initial }: { initial: DayState }) {
  const router = useRouter();
  const [state, setState] = useState<DayState>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(initial.runs[0]?.id ?? null);
  const [publishInfo, setPublishInfo] = useState<Record<string, PublishInfo>>({});
  const [dragJobId, setDragJobId] = useState<string | null>(null);
  const [showFinished, setShowFinished] = useState(false);
  const tz = state.settings.timezone;

  const call = useCallback(
    async (label: string, url: string, body?: unknown, method = "POST"): Promise<Record<string, unknown> | null> => {
      setBusy(label);
      try {
        const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
        const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!res.ok) throw new Error((data.error as string) || `Request failed (${res.status})`);
        if (data.state) setState(data.state as DayState);
        return data;
      } catch (e) {
        setMessage({ kind: "error", text: (e as Error).message });
        return null;
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  const unscheduled = useMemo(() => state.jobs.filter((j) => !j.runId && j.status === "UNSCHEDULED"), [state.jobs]);
  const parked = useMemo(() => state.jobs.filter((j) => !j.runId && j.status !== "UNSCHEDULED"), [state.jobs]);
  const depot = state.settings.depotLat !== null && state.settings.depotLng !== null ? { lat: state.settings.depotLat, lng: state.settings.depotLng } : null;
  const driverName = (id: string | null) => state.drivers.find((d) => d.id === id)?.name ?? "";

  /* ------------------------------ actions ------------------------------ */

  const goToDate = (d: string) => router.push(`/?date=${d}`);

  const syncOrders = async () => {
    const data = await call("sync", "/api/sync", { from: state.date, to: addDays(state.date, 7), date: state.date });
    if (data?.summary) {
      const s = data.summary as { message: string; errors: string[]; source: string };
      setMessage({ kind: s.errors.length ? "info" : "success", text: s.message, details: s.errors });
    }
  };

  const planDay = async () => {
    if (!unscheduled.length) return setMessage({ kind: "info", text: "Every job for this day is already on a run." });
    const data = await call("plan", "/api/plan", { date: state.date });
    if (data?.summary) {
      const s = data.summary as { created: number; assigned: number; unassigned: { clientName: string; reason: string }[]; warnings: string[] };
      const details = [...s.unassigned.map((u) => `${u.clientName}: ${u.reason}`), ...s.warnings];
      setMessage({ kind: s.unassigned.length ? "info" : "success", text: `Planned ${s.created} run${s.created === 1 ? "" : "s"} covering ${s.assigned} stop${s.assigned === 1 ? "" : "s"}.${s.unassigned.length ? ` ${s.unassigned.length} job${s.unassigned.length === 1 ? "" : "s"} could not be placed.` : ""}`, details });
    }
  };

  const newRun = async () => {
    const data = await call("newrun", "/api/runs", { date: state.date });
    if (data?.runId) setSelectedRunId(data.runId as string);
  };

  const assign = (jobId: string, runId: string, position?: number) => call(`assign-${jobId}`, `/api/runs/${runId}/assign`, { jobId, position });
  const unassign = (jobId: string) => call(`unassign-${jobId}`, `/api/jobs/${jobId}/unassign`);
  const setStatus = (jobId: string, status: string) => call(`status-${jobId}`, `/api/jobs/${jobId}/status`, { status });
  const updateRun = (runId: string, patch: Record<string, unknown>) => call(`run-${runId}`, `/api/runs/${runId}`, patch, "PATCH");
  const reorder = (runId: string, jobIds: string[]) => call(`reorder-${runId}`, `/api/runs/${runId}/reorder`, { jobIds });

  const optimise = async (runId: string) => {
    const data = await call(`optimise-${runId}`, `/api/runs/${runId}/optimise`);
    if (data) {
      const warnings = (data.warnings as string[]) ?? [];
      setMessage(warnings.length ? { kind: "info", text: "Route updated, with some things to check:", details: warnings } : { kind: "success", text: "Route updated with the best stop order." });
    }
  };

  const deleteRun = async (run: RunDTO) => {
    if (!window.confirm(`Delete this run? Its ${run.stops.length} stop${run.stops.length === 1 ? "" : "s"} will go back to the unscheduled list.`)) return;
    await call(`delete-${run.id}`, `/api/runs/${run.id}`, undefined, "DELETE");
  };

  const publish = async (run: RunDTO) => {
    const emailClients = run.stops.some((s) => s.clientNotify && s.contactEmail) ? window.confirm("Also email the clients now with their expected arrival window?\n\nOK = email clients now.\nCancel = wait until the driver taps 'Start run' (clients are emailed automatically then).") : false;
    const data = await call(`publish-${run.id}`, `/api/runs/${run.id}/publish`, { emailClients });
    if (data) {
      const info = { calendar: data.calendar as PublishInfo["calendar"], emails: data.emails as PublishInfo["emails"], warnings: (data.warnings as string[]) ?? [] };
      setPublishInfo((p) => ({ ...p, [run.id]: info }));
      setMessage({ kind: "success", text: `Run sent to ${driverName(run.driverId)}.`, details: [info.calendar.message, ...info.emails.map((e) => `${e.kind}: ${e.status === "PREVIEW" ? "saved as preview (email not configured)" : e.status.toLowerCase()} ${e.to ? `→ ${e.to}` : ""}`)] });
    }
  };

  const emailClients = async (run: RunDTO) => {
    const data = await call(`notify-${run.id}`, `/api/runs/${run.id}/notify-clients`, { force: true });
    if (data) setMessage({ kind: "success", text: "Client emails sent.", details: (data.emails as PublishInfo["emails"]).map((e) => `${e.kind}: ${e.status.toLowerCase()} ${e.to ? `→ ${e.to}` : ""}`) });
  };

  /* --------------------------- drag and drop --------------------------- */

  const onDragStart = (e: DragEvent, jobId: string) => {
    e.dataTransfer.setData("text/plain", jobId);
    e.dataTransfer.effectAllowed = "move";
    setDragJobId(jobId);
  };
  const dropOnRun = async (e: DragEvent, run: RunDTO, index?: number) => {
    e.preventDefault();
    e.stopPropagation();
    const jobId = e.dataTransfer.getData("text/plain") || dragJobId;
    setDragJobId(null);
    if (!jobId) return;
    const inRun = run.stops.findIndex((s) => s.id === jobId);
    if (inRun >= 0) {
      const ids = run.stops.map((s) => s.id).filter((id) => id !== jobId);
      const target = index === undefined ? ids.length : index > inRun ? index - 1 : index;
      ids.splice(target, 0, jobId);
      if (ids.join() !== run.stops.map((s) => s.id).join()) await reorder(run.id, ids);
      return;
    }
    await assign(jobId, run.id, index);
  };
  const dropOnUnscheduled = async (e: DragEvent) => {
    e.preventDefault();
    const jobId = e.dataTransfer.getData("text/plain") || dragJobId;
    setDragJobId(null);
    if (jobId && state.jobs.find((j) => j.id === jobId)?.runId) await unassign(jobId);
  };
  const allowDrop = (e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  /* -------------------------------- UI --------------------------------- */

  const isToday = state.date === todayString(tz);
  const activeCount = state.jobs.filter((j) => !["SKIPPED", "CANCELLED"].includes(j.status)).length;
  const doneCount = state.jobs.filter((j) => j.status === "COMPLETED").length;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="card flex flex-wrap items-center gap-3 p-3">
        <div className="flex items-center gap-1">
          <button className="btn-secondary px-2" onClick={() => goToDate(addDays(state.date, -1))} aria-label="Previous day">◀</button>
          <input type="date" className="input w-auto" value={state.date} onChange={(e) => e.target.value && goToDate(e.target.value)} />
          <button className="btn-secondary px-2" onClick={() => goToDate(addDays(state.date, 1))} aria-label="Next day">▶</button>
          {!isToday && <button className="btn-ghost" onClick={() => goToDate(todayString(tz))}>Today</button>}
        </div>
        <div className="text-lg font-bold">{formatLongDate(state.date)}</div>
        <div className="text-sm text-slate-500">{activeCount} job{activeCount === 1 ? "" : "s"} · {state.runs.length} run{state.runs.length === 1 ? "" : "s"} · {unscheduled.length} to schedule{doneCount ? ` · ${doneCount} done` : ""}</div>
        <div className="ml-auto flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={syncOrders} disabled={busy !== null}>{busy === "sync" ? "Syncing…" : state.integrations.current ? "Sync from Current" : "Load sample orders"}</button>
          <Link href={`/jobs/new?date=${state.date}`} className="btn-secondary">+ Add job</Link>
          <button className="btn-secondary" onClick={newRun} disabled={busy !== null}>+ New run</button>
          <button className="btn-primary" onClick={planDay} disabled={busy !== null || !unscheduled.length} title="Groups the unscheduled jobs into runs, picks the right size van for each and assigns available drivers">{busy === "plan" ? "Planning…" : "Plan my day"}</button>
        </div>
      </div>

      {message && (
        <div className={`rounded-md border p-3 text-sm ${message.kind === "error" ? "border-red-200 bg-red-50 text-red-800" : message.kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold">{message.text}</div>
              {message.details && message.details.length > 0 && (
                <ul className="mt-1 list-disc pl-5">{message.details.map((d, i) => <li key={i}>{d}</li>)}</ul>
              )}
            </div>
            <button className="text-xs underline" onClick={() => setMessage(null)}>Dismiss</button>
          </div>
        </div>
      )}

      {!state.integrations.maps && (
        <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">Routes use estimated drive times. Add a Google Maps key in Settings to plan against live traffic.</div>
      )}

      <div className="grid gap-4 xl:grid-cols-[320px_1fr_420px]">
        {/* Unscheduled */}
        <section className={`card flex flex-col p-3 ${dragJobId && state.jobs.find((j) => j.id === dragJobId)?.runId ? "ring-2 ring-blue-300" : ""}`} onDragOver={allowDrop} onDrop={dropOnUnscheduled}>
          <h2 className="mb-2 flex items-center justify-between text-sm font-bold uppercase tracking-wide text-slate-600">
            To schedule <span className="badge bg-slate-100 text-slate-700">{unscheduled.length}</span>
          </h2>
          {unscheduled.length === 0 && <p className="rounded-md border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">Nothing waiting. Drag a stop here to take it off a run.</p>}
          <div className="space-y-2">
            {unscheduled.map((job) => (
              <JobCard key={job.id} job={job} tz={tz} runs={state.runs} busy={busy} onDragStart={onDragStart} onAssign={(runId) => assign(job.id, runId)} onSkip={() => setStatus(job.id, "SKIPPED")} driverName={driverName} />
            ))}
          </div>
          {parked.length > 0 && (
            <div className="mt-3 border-t border-slate-200 pt-2">
              <button className="text-xs font-semibold text-slate-500 underline" onClick={() => setShowFinished((s) => !s)}>{showFinished ? "Hide" : "Show"} {parked.length} not needed / cancelled</button>
              {showFinished && (
                <div className="mt-2 space-y-1">
                  {parked.map((j) => (
                    <div key={j.id} className="flex items-center justify-between rounded-md bg-slate-50 px-2 py-1 text-xs">
                      <span><span className={`badge mr-1 ${STATUS_LABEL[j.status]?.cls}`}>{STATUS_LABEL[j.status]?.label}</span>{j.clientName}</span>
                      {j.status !== "COMPLETED" && <button className="underline" onClick={() => setStatus(j.id, "UNSCHEDULED")}>Bring back</button>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Runs */}
        <section className="space-y-3">
          {state.runs.length === 0 && (
            <div className="card p-8 text-center text-slate-500">
              <p className="text-lg font-semibold text-slate-700">No runs yet for this day</p>
              <p className="mt-1 text-sm">Press <b>Plan my day</b> to build runs automatically, or <b>New run</b> to build one by hand and drag jobs onto it.</p>
            </div>
          )}
          {state.runs.map((run, i) => (
            <RunCard
              key={run.id}
              run={run}
              colour={RUN_COLOURS[i % RUN_COLOURS.length]}
              state={state}
              selected={run.id === selectedRunId}
              busy={busy}
              publishInfo={publishInfo[run.id]}
              onSelect={() => setSelectedRunId(run.id)}
              onDragStart={onDragStart}
              onDropRun={dropOnRun}
              allowDrop={allowDrop}
              onUpdate={(patch) => updateRun(run.id, patch)}
              onOptimise={() => optimise(run.id)}
              onPublish={() => publish(run)}
              onEmailClients={() => emailClients(run)}
              onDelete={() => deleteRun(run)}
              onUnassign={unassign}
              onMove={(jobId, dir) => {
                const ids = run.stops.map((s) => s.id);
                const idx = ids.indexOf(jobId);
                const to = idx + dir;
                if (to < 0 || to >= ids.length) return;
                ids.splice(idx, 1);
                ids.splice(to, 0, jobId);
                reorder(run.id, ids);
              }}
            />
          ))}
        </section>

        {/* Map */}
        <section className="card overflow-hidden xl:sticky xl:top-4 xl:h-[calc(100vh-6rem)]" style={{ minHeight: 360 }}>
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 text-sm">
            <span className="font-semibold">Map</span>
            <span className="text-xs text-slate-500">{selectedRunId ? `Showing ${driverName(state.runs.find((r) => r.id === selectedRunId)?.driverId ?? null) || "selected run"} in bold` : "Click a run to highlight it"}</span>
          </div>
          <div className="h-[calc(100%-2.5rem)] min-h-[320px]">
            <RouteMap runs={state.runs} selectedRunId={selectedRunId} depot={depot} browserKey={state.integrations.mapBrowserKey} mapId={state.integrations.mapId} onSelectRun={setSelectedRunId} />
          </div>
        </section>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */

function TypeBadge({ type }: { type: string }) {
  return type === "DELIVERY" ? <span className="badge bg-blue-600 text-white">Deliver</span> : <span className="badge bg-amber-500 text-white">Collect</span>;
}

function Slot({ job, tz }: { job: JobDTO; tz: string }) {
  if (!job.windowStart || !job.windowEnd) return null;
  return <span>{formatTime(new Date(job.windowStart), tz)}–{formatTime(new Date(job.windowEnd), tz)}</span>;
}

function JobCard({ job, tz, runs, busy, onDragStart, onAssign, onSkip, driverName }: { job: JobDTO; tz: string; runs: RunDTO[]; busy: string | null; onDragStart: (e: DragEvent, id: string) => void; onAssign: (runId: string) => void; onSkip: () => void; driverName: (id: string | null) => string }) {
  return (
    <div draggable onDragStart={(e) => onDragStart(e, job.id)} className="cursor-grab rounded-md border border-slate-200 bg-white p-2 text-sm shadow-sm hover:border-blue-300 active:cursor-grabbing">
      <div className="flex items-center justify-between gap-2">
        <TypeBadge type={job.type} />
        <span className="text-xs text-slate-500"><Slot job={job} tz={tz} /></span>
      </div>
      <div className="mt-1 font-semibold leading-tight">{job.clientName}</div>
      {job.subject && <div className="truncate text-xs text-slate-600">{job.subject}{job.opportunityNumber ? ` · #${job.opportunityNumber}` : ""}</div>}
      <div className="text-xs text-slate-500">{[job.city, job.postcode].filter(Boolean).join(" ")}{job.lat === null ? " · no map location" : ""}</div>
      <div className="mt-1 flex items-center justify-between text-xs">
        <span className="badge bg-slate-100 text-slate-700" title={`${job.volumeM3} m³ · ${Math.round(job.weightKg)} kg`}>Needs {vehicleClassLabel(job.requiredVehicleClass).toLowerCase()}</span>
        <span className="text-slate-500">{job.volumeM3.toFixed(1)} m³ · {Math.round(job.weightKg)} kg</span>
      </div>
      <div className="mt-2 flex items-center gap-1">
        <select className="input py-1 text-xs" value="" disabled={busy !== null || runs.length === 0} onChange={(e) => e.target.value && onAssign(e.target.value)} aria-label="Add to run">
          <option value="">{runs.length ? "Add to run…" : "No runs yet"}</option>
          {runs.map((r, i) => (
            <option key={r.id} value={r.id}>Run {i + 1}{r.driverId ? `: ${driverName(r.driverId)}` : ""}</option>
          ))}
        </select>
        <Link href={`/jobs/${job.id}`} className="btn-ghost px-2 py-1 text-xs">Edit</Link>
        <button className="btn-ghost px-2 py-1 text-xs" onClick={onSkip} title="No transport needed (e.g. the client collects)">Skip</button>
      </div>
    </div>
  );
}

type RunCardProps = {
  run: RunDTO;
  colour: string;
  state: DayState;
  selected: boolean;
  busy: string | null;
  publishInfo?: PublishInfo;
  onSelect: () => void;
  onDragStart: (e: DragEvent, id: string) => void;
  onDropRun: (e: DragEvent, run: RunDTO, index?: number) => void;
  allowDrop: (e: DragEvent) => void;
  onUpdate: (patch: Record<string, unknown>) => void;
  onOptimise: () => void;
  onPublish: () => void;
  onEmailClients: () => void;
  onDelete: () => void;
  onUnassign: (jobId: string) => void;
  onMove: (jobId: string, dir: -1 | 1) => void;
};

function RunCard({ run, colour, state, selected, busy, publishInfo, onSelect, onDragStart, onDropRun, allowDrop, onUpdate, onOptimise, onPublish, onEmailClients, onDelete, onUnassign, onMove }: RunCardProps) {
  const tz = state.settings.timezone;
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const runBusy = busy !== null && busy.endsWith(run.id);
  const status = RUN_STATUS[run.status] ?? RUN_STATUS.DRAFT;
  // Planning changes re-plan the run (bumping optimisedAt); driver progress does not.
  const changedSincePublish = Boolean(run.publishedAt && run.optimisedAt && run.optimisedAt > run.publishedAt);
  const clientEmailable = run.stops.some((s) => s.clientNotify && s.contactEmail);

  return (
    <div className={`card ${selected ? "ring-2 ring-offset-1" : ""}`} style={selected ? { boxShadow: `0 0 0 2px ${colour}` } : undefined} onClick={onSelect} onDragOver={allowDrop} onDrop={(e) => onDropRun(e, run)}>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
        <span className="h-3 w-3 rounded-full" style={{ background: colour }} aria-hidden />
        <select className="input w-auto min-w-[160px]" value={run.driverId ?? ""} disabled={runBusy || run.status === "COMPLETED"} onChange={(e) => onUpdate({ driverId: e.target.value || null })} aria-label="Driver">
          <option value="">Choose driver…</option>
          {state.drivers.filter((d) => d.active || d.id === run.driverId).map((d) => (
            <option key={d.id} value={d.id} disabled={!d.availability.canAssign && d.id !== run.driverId}>
              {d.name}{d.availability.status !== "AVAILABLE" ? ` (${d.availability.label})` : ""}
            </option>
          ))}
        </select>
        <select className="input w-auto min-w-[160px]" value={run.vehicleId ?? ""} disabled={runBusy || run.status === "COMPLETED"} onChange={(e) => onUpdate({ vehicleId: e.target.value || null })} aria-label="Vehicle">
          <option value="">Choose vehicle…</option>
          {state.vehicles.filter((v) => v.active || v.id === run.vehicleId).map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} · {v.capacityVolumeM3} m³{v.inUseByRunId && v.inUseByRunId !== run.id ? " (in use)" : ""}
            </option>
          ))}
        </select>
        <span className={`badge ${status.cls}`}>{status.label}</span>
        {changedSincePublish && run.status !== "COMPLETED" && <span className="badge bg-amber-100 text-amber-800">Changed since sent</span>}
        <div className="ml-auto flex items-center gap-2 text-sm">
          <label className="flex items-center gap-1 text-slate-600">
            Leave
            <input type="time" className="input w-auto py-1" value={run.plannedStart ? formatTime(new Date(run.plannedStart), tz) : ""} disabled={runBusy} onChange={(e) => onUpdate({ startTime: e.target.value || null })} title={run.startLocked ? "Fixed by you. Clear to let the planner choose." : "Chosen by the planner. Change it to fix a start time."} />
          </label>
          {run.startLocked && <button className="text-xs text-slate-500 underline" onClick={(e) => { e.stopPropagation(); onUpdate({ startTime: null }); }}>auto</button>}
        </div>
      </div>

      {/* Summary line */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-xs text-slate-600">
        <span>Load from <b>{run.plannedStart ? formatTime(new Date(new Date(run.plannedStart).getTime() - state.settings.loadingMinutes * 60000), tz) : "--:--"}</b></span>
        <span>Back about <b>{run.plannedEnd ? formatTime(new Date(run.plannedEnd), tz) : "--:--"}</b></span>
        <span>{formatDistance(run.totalDistanceM)} · {formatDuration(run.totalDurationS)}</span>
        <span className="text-slate-400">{run.routeSource === "GOOGLE" ? "Google traffic" : run.routeSource ? "estimated" : ""}</span>
        {run.fit && (
          <span className="flex items-center gap-1" title={`${run.load.volumeM3.toFixed(1)} m³ of ${state.vehicles.find((v) => v.id === run.vehicleId)?.capacityVolumeM3 ?? "?"} m³ · ${Math.round(run.load.weightKg)} kg`}>
            Van {Math.round(run.fit.volumePct)}% full
            <span className="inline-block h-2 w-16 overflow-hidden rounded bg-slate-200"><span className={`block h-full ${run.fit.fits ? (run.fit.volumePct > 85 ? "bg-amber-500" : "bg-emerald-500") : "bg-red-500"}`} style={{ width: `${Math.min(100, Math.max(run.fit.volumePct, run.fit.weightPct))}%` }} /></span>
          </span>
        )}
        {!run.vehicleId && run.stops.length > 0 && <span>Load {run.load.volumeM3.toFixed(1)} m³ · {Math.round(run.load.weightKg)} kg</span>}
      </div>

      {run.issues.length > 0 && (
        <ul className="mx-3 mb-2 list-disc rounded-md bg-red-50 py-1 pl-7 pr-3 text-xs text-red-700">{run.issues.map((i) => <li key={i}>{i}</li>)}</ul>
      )}

      {/* Stops */}
      <ol className="divide-y divide-slate-100 border-t border-slate-200" onDragLeave={() => setHoverIndex(null)}>
        {run.stops.length === 0 && (
          <li className="m-3 rounded-md border-2 border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">Drag jobs here, or use &quot;Add to run&quot; on a job.</li>
        )}
        {run.stops.map((s, idx) => {
          const st = STATUS_LABEL[s.status];
          const finished = ["COMPLETED", "FAILED"].includes(s.status);
          return (
            <li
              key={s.id}
              draggable={!finished}
              onDragStart={(e) => onDragStart(e, s.id)}
              onDragOver={(e) => { allowDrop(e); setHoverIndex(idx); }}
              onDrop={(e) => { setHoverIndex(null); onDropRun(e, run, idx); }}
              className={`flex items-start gap-2 px-3 py-2 text-sm ${hoverIndex === idx ? "border-t-2 border-blue-400" : ""} ${finished ? "opacity-70" : "cursor-grab"}`}
            >
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: colour }}>{s.sequence}</span>
              <div className="w-14 shrink-0">
                <div className="font-bold">{s.liveEta && !finished ? formatTime(new Date(s.liveEta), tz) : s.plannedArrival ? formatTime(new Date(s.plannedArrival), tz) : "--:--"}</div>
                {s.liveEta && !finished && <div className="text-[10px] text-amber-700">live</div>}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1">
                  <TypeBadge type={s.type} />
                  <span className="font-semibold">{s.clientName}</span>
                  {s.status !== "SCHEDULED" && st && <span className={`badge ${st.cls}`}>{st.label}</span>}
                  {s.lateS > 0 && <span className="badge bg-red-100 text-red-800">{Math.round(s.lateS / 60)} min late</span>}
                  {s.waitS > 5 * 60 && <span className="badge bg-slate-100 text-slate-600">waits {Math.round(s.waitS / 60)} min</span>}
                </div>
                <div className="text-xs text-slate-500">
                  {[s.addressLine1, s.postcode].filter(Boolean).join(", ")} · slot <Slot job={s} tz={tz} /> · {s.serviceMinutes} min on site
                  {s.contactName ? ` · ${s.contactName}${s.contactPhone ? ` ${s.contactPhone}` : ""}` : ""}
                </div>
              </div>
              {!finished && run.status !== "COMPLETED" && (
                <div className="flex shrink-0 items-center gap-0.5">
                  <button className="btn-ghost px-1.5 py-0.5 text-xs" disabled={idx === 0 || runBusy} onClick={(e) => { e.stopPropagation(); onMove(s.id, -1); }} aria-label="Move up">▲</button>
                  <button className="btn-ghost px-1.5 py-0.5 text-xs" disabled={idx === run.stops.length - 1 || runBusy} onClick={(e) => { e.stopPropagation(); onMove(s.id, 1); }} aria-label="Move down">▼</button>
                  <Link href={`/jobs/${s.id}`} className="btn-ghost px-1.5 py-0.5 text-xs" onClick={(e) => e.stopPropagation()}>Edit</Link>
                  <button className="btn-ghost px-1.5 py-0.5 text-xs text-red-600" disabled={runBusy} onClick={(e) => { e.stopPropagation(); onUnassign(s.id); }} aria-label="Remove from run">✕</button>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 p-3">
        <button className="btn-secondary" disabled={runBusy || run.stops.length < 2 || run.status === "COMPLETED"} onClick={(e) => { e.stopPropagation(); onOptimise(); }} title="Puts the stops in the quickest order that still hits every delivery slot">{busy === `optimise-${run.id}` ? "Working…" : "Best order"}</button>
        <button className="btn-primary" disabled={runBusy || !run.driverId || !run.vehicleId || run.stops.length === 0 || run.status === "COMPLETED"} onClick={(e) => { e.stopPropagation(); onPublish(); }} title="Adds the run to Google Calendar and emails the driver and account handlers">
          {busy === `publish-${run.id}` ? "Sending…" : run.publishedAt ? "Send update to driver" : "Send to driver"}
        </button>
        {run.publishedAt && clientEmailable && run.status !== "COMPLETED" && (
          <button className="btn-secondary" disabled={runBusy} onClick={(e) => { e.stopPropagation(); onEmailClients(); }} title="Email every client on this run their expected arrival window now">Email clients</button>
        )}
        {run.driverId && (
          <a className="btn-ghost text-xs" href={`/driver/${state.drivers.find((d) => d.id === run.driverId)?.portalToken}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>Driver&apos;s view ↗</a>
        )}
        <button className="btn-danger ml-auto" disabled={runBusy} onClick={(e) => { e.stopPropagation(); onDelete(); }}>Delete run</button>
      </div>
      {publishInfo && (
        <div className="border-t border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <div><b>Calendar:</b> {publishInfo.calendar.message}</div>
          {publishInfo.emails.map((e, i) => (
            <div key={i}><b>{e.kind}:</b> {e.status === "PREVIEW" ? "preview saved (email not configured)" : e.status.toLowerCase()}{e.to ? ` → ${e.to}` : ""}</div>
          ))}
        </div>
      )}
    </div>
  );
}
