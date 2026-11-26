import { useQuery } from "@tanstack/react-query";
import { addWeeks, format, parseISO, startOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import { useState } from "react";
import { api } from "../../api";

type Cell = { booked_min: number; capacity_min: number; pct: number | null };
type Day = { date: string; weekday: number; resources: number; appointments: number; total: Cell; morning: Cell; afternoon: Cell };
const heat = (p: number) => `hsl(${Math.round(150 - 135 * (p / 100))} 65% ${Math.round(90 - p * 0.12)}%)`; // verde (libre) → salmón (saturado)
const ROWS: { key: "total" | "morning" | "afternoon"; label: string }[] = [
    { key: "total", label: "Día" }, { key: "morning", label: "Mañana" }, { key: "afternoon", label: "Tarde" }];

/** Mapa de calor semanal: % de saturación (citas ÷ capacidad de cubículos) por día y turno. */
export default function WeekHeat() {
    const [offset, setOffset] = useState(0);
    const start = addWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), offset);
    const key = format(start, "yyyy-MM-dd");
    const q = useQuery({ queryKey: ["week", key], queryFn: async () => (await api.get<{ days: Day[] }>("/dashboard/week", { params: { start: key } })).data.days });
    const days = q.data ?? [];

    const today = format(new Date(), "yyyy-MM-dd");
    const free = days.flatMap((d) => (["morning", "afternoon"] as const).map((k) => ({ d, k, pct: d[k].pct })))
        .filter((x) => x.pct !== null && x.d.date >= today).sort((a, b) => (a.pct as number) - (b.pct as number))[0];

    return (
        <div>
            <div className="mb-3 flex items-center justify-between">
                <button className="px-2 text-olive" onClick={() => setOffset(offset - 1)} aria-label="Semana anterior">‹</button>
                <span className="font-semibold text-olive">{format(start, "d MMM", { locale: es })} – {format(addWeeks(start, 1), "d MMM yyyy", { locale: es })}</span>
                <button className="px-2 text-olive" onClick={() => setOffset(offset + 1)} aria-label="Semana siguiente">›</button>
            </div>
            <div className="overflow-x-auto">
                <div className="grid min-w-[560px] grid-cols-[64px_repeat(7,minmax(0,1fr))] gap-1.5 text-center text-xs">
                    <span />
                    {days.map((d) => <span key={d.date} className={`py-1 font-semibold capitalize ${d.date === today ? "text-olive" : "text-gray-500"}`}>{format(parseISO(d.date), "EEE d", { locale: es })}</span>)}
                    {ROWS.map((r) => (
                        <div key={r.key} className="contents">
                            <span className="flex items-center justify-end pr-1 text-gray-500">{r.label}</span>
                            {days.map((d) => {
                                const c = d[r.key];
                                return c.pct === null
                                    ? <span key={d.date + r.key} className="flex h-14 items-center justify-center rounded-ctl bg-gray-500/10 text-gray-400" title="Sin capacidad (cerrado o sin personal)">—</span>
                                    : (
                                        <span key={d.date + r.key} className="flex h-14 flex-col items-center justify-center rounded-ctl text-slate-800" style={{ background: heat(c.pct) }}
                                            title={`${c.booked_min} de ${c.capacity_min} min ocupados`}>
                                            <span className="text-base font-semibold">{c.pct}%</span>
                                            {r.key === "total" && <span className="mt-1 h-1.5 w-3/4 rounded bg-white/70"><span className="block h-full rounded bg-slate-700/60" style={{ width: `${c.pct}%` }} /></span>}
                                        </span>);
                            })}
                        </div>))}
                </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="flex items-center gap-2">Libre <span className="h-2 w-28 rounded" style={{ background: `linear-gradient(to right, ${heat(0)}, ${heat(50)}, ${heat(100)})` }} /> Saturado</span>
                {free && <span>Más espacio libre: <b className="capitalize text-olive">{format(parseISO(free.d.date), "EEEE", { locale: es })} {free.k === "morning" ? "por la mañana" : "por la tarde"}</b> ({free.pct}% ocupado)</span>}
            </div>
        </div>
    );
}