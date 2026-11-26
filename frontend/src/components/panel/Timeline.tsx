import { format, parseISO } from "date-fns";
import { useEffect, useState } from "react";
import type { Appt } from "../../api";

const HOUR = 56; // px por hora
const PALETTE = [
    "bg-sky-100 border-sky-500 text-sky-900", "bg-emerald-100 border-emerald-500 text-emerald-900",
    "bg-violet-100 border-violet-500 text-violet-900", "bg-amber-100 border-amber-500 text-amber-900",
    "bg-rose-100 border-rose-500 text-rose-900", "bg-teal-100 border-teal-500 text-teal-900",
];
// Color estable por zona/tipo de láser (primera zona de la cita).
const colorFor = (zone: string) => PALETTE[[...zone].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % PALETTE.length];
const minutes = (iso: string) => { const d = parseISO(iso); return d.getHours() * 60 + d.getMinutes(); };

type Props = {
    appts: Appt[]; cubicles: { id: number; name: string }[]; open: string; close: string;
    cubicleName: (id: number) => string; workerName: (id: number) => string
};

/** Cronograma diario: horas en vertical, una columna por cubículo (dos citas simultáneas nunca comparten cubículo). */
export default function Timeline({ appts, cubicles, open, close, cubicleName, workerName }: Props) {
    const [now, setNow] = useState(new Date());
    useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);

    let startH = Number(open.slice(0, 2)), endH = Math.ceil(Number(close.slice(0, 2)) + Number(close.slice(3, 5)) / 60);
    if (!(endH > startH)) [startH, endH] = [8, 19];
    const shown = appts.filter((a) => a.status !== "Cancelada");
    const colIds = [...cubicles.map((c) => c.id), ...new Set(shown.map((a) => a.cubicle_id).filter((id) => !cubicles.some((c) => c.id === id)))];
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const nowTop = nowMin >= startH * 60 && nowMin <= endH * 60 ? ((nowMin - startH * 60) / 60) * HOUR : null;
    const zonesInUse = [...new Set(shown.map((a) => a.zones[0] ?? "Combo"))];

    if (colIds.length === 0) return <p className="py-8 text-center">No hay cubículos configurados.</p>;
    return (
        <div>
            <div className="overflow-x-auto">
                <div style={{ minWidth: 56 + colIds.length * 150 }}>
                    <div className="flex border-b border-beige" style={{ paddingLeft: 56 }}>
                        {colIds.map((id) => <div key={id} className="flex-1 py-2 text-center text-xs font-semibold text-olive">{cubicleName(id)}</div>)}
                    </div>
                    <div className="relative flex" style={{ height: (endH - startH) * HOUR }}>
                        <div className="relative w-14 shrink-0">
                            {Array.from({ length: endH - startH + 1 }, (_, i) => (
                                <span key={i} className="absolute right-2 text-[11px] text-gray-500" style={{ top: i * HOUR - 7 }}>{String(startH + i).padStart(2, "0")}:00</span>))}
                        </div>
                        {colIds.map((id) => (
                            <div key={id} className="relative flex-1 border-l border-beige/60"
                                style={{ backgroundImage: "linear-gradient(to bottom, rgba(221,184,169,0.45) 1px, transparent 1px)", backgroundSize: `100% ${HOUR}px` }}>
                                {shown.filter((a) => a.cubicle_id === id).map((a) => {
                                    const top = ((minutes(a.start_at) - startH * 60) / 60) * HOUR, h = (a.duration_min / 60) * HOUR;
                                    const faded = a.status !== "Programada" && a.status !== "Confirmada";
                                    return (
                                        <div key={a.id} style={{ top, height: Math.max(22, h - 2) }} title={`${a.client_name} · ${a.zones.join(", ")} · ${workerName(a.worker_id)} · ${a.status}`}
                                            className={`absolute inset-x-1 overflow-hidden rounded-ctl border-l-4 px-1.5 py-0.5 text-[11px] leading-tight ${colorFor(a.zones[0] ?? "Combo")} ${faded ? "opacity-60" : ""}`}>
                                            <p className="truncate font-semibold">{format(parseISO(a.start_at), "HH:mm")} {a.client_name}</p>
                                            {h >= 40 && <p className="truncate">{workerName(a.worker_id)}</p>}
                                            {h >= 56 && <p className="truncate">{a.zones.join(", ")} · {a.status}</p>}
                                        </div>);
                                })}
                            </div>))}
                        {nowTop !== null && (
                            <div className="pointer-events-none absolute right-0 z-10 flex items-center" style={{ top: nowTop, left: 56 }} aria-label="Hora actual">
                                <span className="-ml-1 h-2 w-2 rounded-full bg-rose-500" /><span className="h-px flex-1 bg-rose-500" />
                            </div>)}
                    </div>
                </div>
            </div>
            {zonesInUse.length > 0 && <div className="mt-3 flex flex-wrap gap-2 text-xs">{zonesInUse.map((z) => (
                <span key={z} className={`rounded-full border-l-4 px-2.5 py-0.5 ${colorFor(z)}`}>{z}</span>))}</div>}
        </div>
    );
}