import { addDays, addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, format, getDay, parseISO, startOfMonth, startOfWeek, subDays, subMonths, subWeeks } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarDays, ChevronRight, Clock, DollarSign, Filter, Phone } from "lucide-react";
import { useState } from "react";
import type { Appt, Status } from "../api";
import { bs, useAppts, useNames, usd } from "../data";
import { Card, EmptyState, StatusBadge, inputCls } from "../ui";

type View = "month" | "week" | "day";
const STATUSES: Status[] = ["Programada", "Confirmada", "Atendida", "No asistió", "Cancelada", "Reagendada"];
const DENSITY = ["bg-bone", "bg-olive/10", "bg-olive/25", "bg-olive/45", "bg-olive/70 text-bone"]; // un solo hue: beige → oliva
const iso = (d: Date) => format(d, "yyyy-MM-dd");
const isNoShow = (a: Appt) => a.status === "No asistió" || a.status === "Reagendada";

export default function CalendarPage() {
  const [view, setView] = useState<View>("month");
  const [cur, setCur] = useState(new Date());
  const [f, setF] = useState({ worker: "", cubicle: "", status: "" });
  const names = useNames();

  const [from, to] = view === "month" ? [startOfMonth(cur), endOfMonth(cur)]
    : view === "week" ? [startOfWeek(cur, { weekStartsOn: 1 }), endOfWeek(cur, { weekStartsOn: 1 })] : [cur, cur];
  const q = useAppts({ date_from: iso(from), date_to: iso(to), worker_id: f.worker || undefined, cubicle_id: f.cubicle || undefined,
    status: f.status ? [f.status] : undefined });

  const byDay = new Map<string, Appt[]>();
  q.data?.forEach((a) => byDay.set(a.start_at.slice(0, 10), [...(byDay.get(a.start_at.slice(0, 10)) ?? []), a]));
  const step = (dir: 1 | -1) => setCur(view === "month" ? (dir > 0 ? addMonths(cur, 1) : subMonths(cur, 1))
    : view === "week" ? (dir > 0 ? addWeeks(cur, 1) : subWeeks(cur, 1)) : (dir > 0 ? addDays(cur, 1) : subDays(cur, 1)));
  const title = view === "day" ? format(cur, "EEEE d 'de' MMMM", { locale: es }) : view === "week"
    ? `${format(from, "d MMM", { locale: es })} – ${format(to, "d MMM yyyy", { locale: es })}` : format(cur, "MMMM yyyy", { locale: es });
  const sel = (k: keyof typeof f, label: string, opts: { v: string; l: string }[]) => (
    <select aria-label={label} className={`${inputCls} w-auto`} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })}>
      <option value="">{label}</option>{opts.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select>);

  return (
    <div className={`transition-opacity duration-300 ${q.isFetching ? "opacity-70" : ""}`}>
      <h1 className="mb-4 flex items-center gap-2"><CalendarDays size={24} strokeWidth={1.5} />Calendario</h1>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-ctl border border-olive/20">
          {(["month", "week", "day"] as View[]).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 ${view === v ? "bg-olive text-bone" : "text-olive"}`}>{{ month: "Mes", week: "Semana", day: "Día" }[v]}</button>))}
        </div>
        <button onClick={() => step(-1)} className="px-2 text-olive" aria-label="Anterior">‹</button>
        <span className="min-w-40 text-center font-semibold capitalize text-olive">{title}</span>
        <button onClick={() => step(1)} className="px-2 text-olive" aria-label="Siguiente">›</button>
        <button onClick={() => setCur(new Date())} className="text-xs underline">Hoy</button>
        <span className="ml-auto flex flex-wrap items-center gap-2"><Filter size={18} strokeWidth={1.5} className="text-olive" />
          {names.options && sel("worker", "Trabajador", names.options.workers.map((w) => ({ v: String(w.id), l: w.name })))}
          {names.options && sel("cubicle", "Cubículo", names.options.cubicles.map((c) => ({ v: String(c.id), l: c.name })))}
          {sel("status", "Estado", STATUSES.map((s) => ({ v: s, l: s })))}</span>
      </div>

      {view === "month" && <MonthGrid cur={cur} byDay={byDay} onPick={(d) => { setCur(d); setView("day"); }} />}
      {view === "week" && (
        <div className="grid gap-2 md:grid-cols-7">
          {eachDayOfInterval({ start: from, end: to }).map((d) => (
            <Card key={iso(d)} className="p-2">
              <button onClick={() => { setCur(d); setView("day"); }} className="mb-1 block w-full text-left text-xs font-semibold capitalize text-olive">{format(d, "EEE d", { locale: es })}</button>
              {(byDay.get(iso(d)) ?? []).map((a) => (
                <div key={a.id} className="mb-1 rounded-ctl bg-bone p-1.5 text-xs"><span className="font-semibold text-olive">{format(parseISO(a.start_at), "HH:mm")}</span> {a.client_name}<div className="mt-1"><StatusBadge status={a.status} /></div></div>))}
            </Card>))}
        </div>)}
      {view === "day" && (
        <div className="mx-auto max-w-2xl space-y-3">
          {q.data?.length === 0 && <EmptyState icon={<CalendarDays />} text="No hay citas este día." />}
          {q.data?.map((a) => <DayCard key={a.id} a={a} worker={names.worker(a.worker_id)} cubicle={names.cubicle(a.cubicle_id)} />)}
        </div>)}

      <div className="mt-6 flex flex-wrap gap-2" aria-label="Leyenda de estados">{STATUSES.map((s) => <StatusBadge key={s} status={s} />)}</div>
    </div>
  );
}

function MonthGrid({ cur, byDay, onPick }: { cur: Date; byDay: Map<string, Appt[]>; onPick: (d: Date) => void }) {
  const cells = eachDayOfInterval({ start: startOfMonth(cur), end: endOfMonth(cur) });
  const count = (d: Date) => (byDay.get(iso(d)) ?? []).filter((a) => a.status !== "Cancelada").length;
  const max = Math.max(1, ...cells.map(count));
  return (
    <div className="grid grid-cols-7 gap-1 text-center text-xs">
      {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => <span key={d} className="py-1 text-olive/60">{d}</span>)}
      {Array.from({ length: (getDay(cells[0]) + 6) % 7 }).map((_, i) => <span key={`b${i}`} />)}
      {cells.map((d) => {
        const n = count(d), lvl = n === 0 ? 0 : Math.max(1, Math.ceil((n / max) * 4)), dot = (byDay.get(iso(d)) ?? []).some(isNoShow);
        return (
          <button key={iso(d)} onClick={() => onPick(d)} className={`relative flex h-16 flex-col items-center justify-center rounded-ctl border border-beige/60 ${DENSITY[lvl]}`}>
            <span>{d.getDate()}</span>{n > 0 && <span className="text-[10px] opacity-80">{n} cita{n > 1 ? "s" : ""}</span>}
            {dot && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-terracotta" title="Hubo no-asistencias" />}
          </button>);
      })}
    </div>
  );
}

function DayCard({ a, worker, cubicle }: { a: Appt; worker: string; cubicle: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div><p className="font-semibold text-olive">{format(parseISO(a.start_at), "HH:mm")} – {format(parseISO(a.end_at), "HH:mm")} · {a.client_name}</p>
          <p className="flex items-center gap-1 text-xs"><Phone size={14} strokeWidth={1.5} />{a.client_phone}</p></div>
        <StatusBadge status={a.status} />
      </div>
      <p className="mt-2">{a.zones.join(", ")}</p>
      <p className="mt-1 flex flex-wrap items-center gap-x-4 text-xs">
        <span className="flex items-center gap-1"><Clock size={14} strokeWidth={1.5} />{a.duration_min} min</span><span>{cubicle}</span><span>{worker}</span>
        <span className="flex items-center gap-1"><DollarSign size={14} strokeWidth={1.5} />{usd(a.price_usd)}{a.price_bs != null && ` · ${bs(a.price_bs)}`}</span></p>
      {a.rescheduled_to && <p className="mt-2 flex items-center gap-1 text-xs text-terracotta"><ChevronRight size={14} strokeWidth={1.5} />↳ Reagendada → {format(parseISO(a.rescheduled_to.start_at), "dd/MM")}</p>}
    </Card>
  );
}
