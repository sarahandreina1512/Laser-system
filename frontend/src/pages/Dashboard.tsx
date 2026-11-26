import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Activity, CalendarClock, CalendarDays, CheckCircle2, DoorOpen, Hourglass, LayoutDashboard, UserX } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { api, apiError, type Appt } from "../api";
import Timeline from "../components/panel/Timeline";
import WeekHeat from "../components/panel/Weekheat";
import { useAppts, useNames } from "../data";
import { useToast } from "../store";
import { Button, Card } from "../ui";
import { AttendModal, NoShowModal } from "./DayManagement";

type Col = "pending" | "reception" | "treatment" | "done";
const COLS: { id: Col; title: string; icon: ReactNode; tone: string }[] = [
  { id: "pending", title: "Por llegar / Agendadas", icon: <CalendarClock size={18} strokeWidth={1.5} />, tone: "border-sky-300 bg-sky-50" },
  { id: "reception", title: "En recepción / Espera", icon: <Hourglass size={18} strokeWidth={1.5} />, tone: "border-amber-300 bg-amber-50" },
  { id: "treatment", title: "En tratamiento", icon: <Activity size={18} strokeWidth={1.5} />, tone: "border-violet-300 bg-violet-50" },
  { id: "done", title: "Completado / Salida", icon: <CheckCircle2 size={18} strokeWidth={1.5} />, tone: "border-emerald-300 bg-emerald-50" },
];
const stageOf = (a: Appt): Col => a.status === "Atendida" ? "done" : a.flow_stage === "treatment" ? "treatment" : a.flow_stage === "reception" ? "reception" : "pending";

function Kpi({ icon, label, value, sub, grad }: { icon: ReactNode; label: string; value: string | number; sub: string; grad: string }) {
  return (
    <div className={`rounded-card bg-gradient-to-br ${grad} p-4 text-white shadow-soft`}>
      <div className="flex items-center justify-between text-sm opacity-95"><span>{label}</span>{icon}</div>
      <p className="mt-2 text-[32px] font-semibold leading-none">{value}</p>
      <p className="mt-1 text-xs opacity-95">{sub}</p>
    </div>);
}

export default function Dashboard() {
  const q = useAppts({ date: format(new Date(), "yyyy-MM-dd") });
  const names = useNames(), qc = useQueryClient(), toast = useToast((t) => t.show);
  const [tab, setTab] = useState<"agenda" | "week">("agenda");
  const [modal, setModal] = useState<{ kind: "attend" | "noshow"; a: Appt } | null>(null);

  const today = (q.data ?? []).filter((a) => a.status !== "Cancelada");
  const board = today.filter((a) => ["Programada", "Confirmada", "Atendida"].includes(a.status));
  const done = today.filter((a) => a.status === "Atendida").length;
  const absent = today.filter((a) => a.status === "No asistió" || a.status === "Reagendada").length;
  const cubActive = names.options?.cubicles.length ?? 0, cubTotal = names.options?.cubicles_total ?? 0;
  const ic = { size: 24, strokeWidth: 1.5 };

  const stage = useMutation({
    mutationFn: (p: { id: number; stage: "reception" | "treatment" | null }) => api.post(`/appointments/${p.id}/stage`, { stage: p.stage }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["appts"] }), onError: (e) => toast("error", apiError(e).message),
  });
  const move = (a: Appt, s: "reception" | "treatment" | null) => stage.mutate({ id: a.id, stage: s });
  const sm = "px-3 py-1.5 text-xs";

  const actions = (a: Appt, col: Col) => ({
    pending: <><Button variant="primary" className={sm} onClick={() => move(a, "reception")} disabled={stage.isPending}>Llegó</Button>
      <Button variant="text" className={`${sm} text-terracotta`} onClick={() => setModal({ kind: "noshow", a })}>No asistió</Button></>,
    reception: <><Button variant="primary" className={sm} onClick={() => move(a, "treatment")} disabled={stage.isPending}>Pasar a sala</Button>
      <Button variant="text" className={sm} onClick={() => move(a, null)}>Volver</Button></>,
    treatment: <><Button variant="primary" className={sm} onClick={() => setModal({ kind: "attend", a })}>Finalizar</Button>
      <Button variant="text" className={sm} onClick={() => move(a, "reception")}>Volver</Button></>,
    done: <Link to="/citas" className="text-xs text-emerald-700 underline">Agendar próxima sesión</Link>,
  })[col];

  return (
    <div>
      <h1 className="mb-4 flex items-center gap-2"><LayoutDashboard size={24} strokeWidth={1.5} />Panel</h1>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi grad="from-violet-500 to-indigo-500" icon={<CalendarDays {...ic} />} label="Citas del día" value={today.length} sub="Citas" />
        <Kpi grad="from-emerald-500 to-teal-500" icon={<CheckCircle2 {...ic} />} label="Atendidas" value={done} sub="Completadas" />
        <Kpi grad="from-orange-400 to-rose-500" icon={<UserX {...ic} />} label="No asistió" value={absent} sub="Ausencias" />
        <Kpi grad="from-sky-500 to-blue-600" icon={<DoorOpen {...ic} />} label="Cubículos activos" value={`${cubActive} / ${cubTotal}`} sub="Activos" />
      </div>

      <h2 className="mb-2 text-lg">Flujo de atención</h2>
      <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {COLS.map((col) => {
          const items = board.filter((a) => stageOf(a) === col.id).sort((a, b) => a.start_at.localeCompare(b.start_at));
          return (
            <div key={col.id} className={`rounded-card border p-3 ${col.tone}`}>
              <div className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-700"><span className="flex items-center gap-1.5">{col.icon}{col.title}</span>
                <span className="rounded-full bg-white/80 px-2 text-xs">{items.length}</span></div>
              <div className="space-y-2">
                {items.length === 0 && <p className="py-4 text-center text-xs text-slate-500">Sin pacientes</p>}
                {items.map((a) => (
                  <div key={a.id} className="rounded-ctl bg-white p-2.5 shadow-sm">
                    <p className="text-sm font-semibold text-slate-800">{format(parseISO(a.start_at), "HH:mm")} · {a.client_name}</p>
                    <p className="text-xs text-slate-600">{a.zones.join(", ")}</p>
                    <p className="text-xs text-slate-500">{names.cubicle(a.cubicle_id)} · {names.worker(a.worker_id)}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">{actions(a, col.id)}</div>
                  </div>))}
              </div>
            </div>);
        })}
      </div>

      <Card className="p-4">
        <div className="mb-3 flex border-b border-beige">
          {([["agenda", "Agenda de hoy"], ["week", "Ocupación semanal"]] as const).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} className={`border-b-2 px-4 py-2 ${tab === id ? "border-olive font-semibold text-olive" : "border-transparent"}`}>{label}</button>))}
        </div>
        {tab === "agenda"
          ? <Timeline appts={today} cubicles={names.options?.cubicles ?? []} open={names.options?.business_hours.open ?? "08:00"} close={names.options?.business_hours.close ?? "19:00"}
            cubicleName={names.cubicle} workerName={names.worker} />
          : <WeekHeat />}
      </Card>

      {modal?.kind === "attend" && <AttendModal a={modal.a} onClose={() => setModal(null)} />}
      {modal?.kind === "noshow" && <NoShowModal a={modal.a} onClose={() => setModal(null)} />}
    </div>
  );
}