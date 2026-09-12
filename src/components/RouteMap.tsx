"use client";

import { useEffect, useMemo } from "react";
import { APIProvider, Map, Marker, useMap } from "@vis.gl/react-google-maps";
import { decodePolyline } from "@/lib/polyline";
import type { RunDTO } from "@/lib/services/runs";

export const RUN_COLOURS = ["#2563eb", "#16a34a", "#d97706", "#7c3aed", "#db2777", "#0891b2", "#65a30d", "#ea580c"];

type Point = { lat: number; lng: number };

type Props = {
  runs: RunDTO[];
  selectedRunId: string | null;
  depot: Point | null;
  browserKey: string;
  mapId: string;
  onSelectRun?: (runId: string) => void;
};

type RunPath = { runId: string; colour: string; selected: boolean; line: Point[]; stops: (Point & { label: string; title: string })[] };

function buildPaths(runs: RunDTO[], selectedRunId: string | null, depot: Point | null): RunPath[] {
  return runs.map((run, i) => {
    const stops = run.stops
      .filter((s) => typeof s.lat === "number" && typeof s.lng === "number")
      .map((s) => ({ lat: s.lat as number, lng: s.lng as number, label: String(s.sequence), title: `${s.sequence}. ${s.clientName} (${s.postcode})` }));
    const line = run.polyline ? decodePolyline(run.polyline) : depot ? [depot, ...stops, depot] : stops;
    return { runId: run.id, colour: RUN_COLOURS[i % RUN_COLOURS.length], selected: run.id === selectedRunId, line, stops };
  });
}

export default function RouteMap(props: Props) {
  const paths = useMemo(() => buildPaths(props.runs, props.selectedRunId, props.depot), [props.runs, props.selectedRunId, props.depot]);
  if (!props.browserKey) return <SchematicMap paths={paths} depot={props.depot} onSelectRun={props.onSelectRun} />;
  const center = props.depot ?? paths[0]?.stops[0] ?? { lat: 51.5074, lng: -0.1278 };
  return (
    <APIProvider apiKey={props.browserKey}>
      <Map defaultCenter={center} defaultZoom={10} mapId={props.mapId || undefined} gestureHandling="greedy" disableDefaultUI={false} className="h-full w-full">
        {props.depot && <Marker position={props.depot} title="Depot" label={{ text: "D", color: "#fff", fontWeight: "bold" }} />}
        {paths.map((p) =>
          p.stops.map((s) => (
            <Marker key={`${p.runId}-${s.label}`} position={s} title={s.title} label={{ text: s.label, color: "#fff", fontWeight: "bold" }} opacity={p.selected || !props.selectedRunId ? 1 : 0.55} onClick={() => props.onSelectRun?.(p.runId)} />
          )),
        )}
        <Polylines paths={paths} depot={props.depot} />
      </Map>
    </APIProvider>
  );
}

function Polylines({ paths, depot }: { paths: RunPath[]; depot: Point | null }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const lines = paths.map(
      (p) =>
        new google.maps.Polyline({
          path: p.line,
          strokeColor: p.colour,
          strokeWeight: p.selected ? 5 : 3,
          strokeOpacity: p.selected ? 0.95 : 0.45,
          map,
        }),
    );
    const bounds = new google.maps.LatLngBounds();
    let any = false;
    if (depot) {
      bounds.extend(depot);
      any = true;
    }
    for (const p of paths) for (const s of p.stops) {
      bounds.extend(s);
      any = true;
    }
    if (any) map.fitBounds(bounds, 40);
    return () => lines.forEach((l) => l.setMap(null));
  }, [map, paths, depot]);
  return null;
}

/** No Google browser key: draw a simple proportional sketch so the day still makes sense visually. */
function SchematicMap({ paths, depot, onSelectRun }: { paths: RunPath[]; depot: Point | null; onSelectRun?: (id: string) => void }) {
  const W = 640;
  const H = 440;
  const all: Point[] = [...(depot ? [depot] : []), ...paths.flatMap((p) => [...p.stops, ...p.line])];
  if (!all.length) return <div className="flex h-full items-center justify-center text-sm text-slate-500">Add stops to a run to see the route.</div>;
  const minLat = Math.min(...all.map((p) => p.lat));
  const maxLat = Math.max(...all.map((p) => p.lat));
  const minLng = Math.min(...all.map((p) => p.lng));
  const maxLng = Math.max(...all.map((p) => p.lng));
  const cos = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));
  const spanX = Math.max((maxLng - minLng) * cos, 0.01);
  const spanY = Math.max(maxLat - minLat, 0.01);
  const scale = Math.min((W - 60) / spanX, (H - 60) / spanY);
  const project = (p: Point) => ({ x: 30 + (p.lng - minLng) * cos * scale + ((W - 60) - spanX * scale) / 2, y: H - 30 - (p.lat - minLat) * scale - ((H - 60) - spanY * scale) / 2 });
  return (
    <div className="relative h-full w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full bg-slate-50" role="img" aria-label="Schematic map of today's runs">
        {paths.map((p) => (
          <polyline key={p.runId} points={p.line.map((pt) => { const q = project(pt); return `${q.x},${q.y}`; }).join(" ")} fill="none" stroke={p.colour} strokeWidth={p.selected ? 4 : 2} strokeOpacity={p.selected ? 0.95 : 0.4} strokeLinejoin="round" style={{ cursor: "pointer" }} onClick={() => onSelectRun?.(p.runId)} />
        ))}
        {depot && (() => { const q = project(depot); return (<g><rect x={q.x - 9} y={q.y - 9} width={18} height={18} fill="#0f172a" rx={3} /><text x={q.x} y={q.y + 4} textAnchor="middle" fontSize={11} fontWeight="bold" fill="#fff">D</text></g>); })()}
        {paths.map((p) => p.stops.map((s) => { const q = project(s); return (<g key={`${p.runId}-${s.label}`} style={{ cursor: "pointer" }} onClick={() => onSelectRun?.(p.runId)}><title>{s.title}</title><circle cx={q.x} cy={q.y} r={11} fill={p.colour} fillOpacity={p.selected ? 1 : 0.55} stroke="#fff" strokeWidth={2} /><text x={q.x} y={q.y + 4} textAnchor="middle" fontSize={11} fontWeight="bold" fill="#fff">{s.label}</text></g>); }))}
      </svg>
      <div className="absolute bottom-2 left-2 rounded bg-white/90 px-2 py-1 text-[11px] text-slate-500">Sketch view. Add a Google Maps browser key in Settings for a real map.</div>
    </div>
  );
}
