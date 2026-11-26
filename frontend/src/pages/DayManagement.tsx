import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { CheckCircle2, UserX } from "lucide-react";
import { useState } from "react";
import { api, apiError, type Appt } from "../api";
import { bs, useAppts, useNames, usd } from "../data";
import { useAuth, useToast } from "../store";
import { Banner, Button, Card, EmptyState, Modal, StatusBadge, inputCls } from "../ui";

type Tab = "next" | "done" | "no";
const TABS: { id: Tab; label: string; match: (a: Appt) => boolean }[] = [
  { id: "next", label: "Próximas", match: (a) => a.status === "Programada" || a.status === "Confirmada" },
  { id: "done", label: "Atendidas", match: (a) => a.status === "Atendida" },
  { id: "no", label: "No asistió", match: (a) => a.status === "No asistió" || a.status === "Reagendada" },
];
const PHASES = [["inicial", "Inicial (cada 21 días)"], ["mantenimiento_1", "Mantenimiento 1 (2 meses)"],
["mantenimiento_2", "Mantenimiento 2 (6 meses)"], ["mantenimiento_3", "Mantenimiento 3 (anual)"]];

export default function DayManagement() {
  const today = format(new Date(), "yyyy-MM-dd");
  const [tab, setTab] = useState<Tab>("next");
  const [modal, setModal] = useState<{ kind: "attend" | "noshow"; a: Appt } | null>(null);
  const q = useAppts({ date: today });
  const names = useNames();
  const list = (q.data ?? []).filter((a) => a.status !== "Cancelada");

  return (
    <div className={`mx-auto max-w-2xl transition-opacity duration-300 ${q.isFetching ? "opacity-70" : ""}`}>
      <h1 className="mb-1 flex items-center gap-2"><CheckCircle2 size={24} strokeWidth={1.5} />Gestión del día</h1>
      <p className="mb-4 text-xs capitalize">{format(new Date(), "EEEE d 'de' MMMM yyyy", { locale: es })}</p>
      <div className="mb-4 flex border-b border-beige">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`border-b-2 px-4 py-2 ${tab === t.id ? "border-olive font-semibold text-olive" : "border-transparent"}`}>
            {t.label} ({list.filter(t.match).length})</button>))}
      </div>
      <div className="space-y-3">
        {list.filter(TABS.find((t) => t.id === tab)!.match).map((a) => (
          <Card key={a.id} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div><p className="text-lg font-semibold text-olive">{format(parseISO(a.start_at), "HH:mm")} · {a.client_name}</p>
                <p className="text-xs">{a.zones.join(", ")} · {names.cubicle(a.cubicle_id)} · {names.worker(a.worker_id)}</p></div>
              <StatusBadge status={a.status} />
            </div>
            <p className="mt-2 font-semibold text-olive">{usd(a.price_usd)}{a.price_bs != null && <span className="font-normal text-ink"> · {bs(a.price_bs)}</span>}</p>
            {a.rescheduled_to && <p className="mt-1 text-xs text-terracotta">↳ Reagendada → {format(parseISO(a.rescheduled_to.start_at), "dd/MM")}</p>}
            {tab === "next" && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Button variant="primary" className="py-3 text-base" onClick={() => setModal({ kind: "attend", a })}><CheckCircle2 size={20} strokeWidth={1.5} />Asistió</Button>
                <Button variant="ghost" className="border-terracotta/40 py-3 text-base text-terracotta hover:bg-terracotta/10" onClick={() => setModal({ kind: "noshow", a })}><UserX size={20} strokeWidth={1.5} />No asistió</Button>
              </div>)}
          </Card>))}
        {q.data && list.filter(TABS.find((t) => t.id === tab)!.match).length === 0 && <EmptyState icon={<CheckCircle2 />} text="Nada por aquí por ahora." />}
      </div>
      {modal?.kind === "attend" && <AttendModal a={modal.a} onClose={() => setModal(null)} />}
      {modal?.kind === "noshow" && <NoShowModal a={modal.a} onClose={() => setModal(null)} />}
    </div>
  );
}

export function AttendModal({ a, onClose }: { a: Appt; onClose: () => void }) {
  const isAdmin = useAuth((s) => s.role) === "admin", qc = useQueryClient(), toast = useToast((t) => t.show);
  const [price, setPrice] = useState(String(a.price_usd)), [rate, setRate] = useState(String(a.bcv_rate ?? "")), [obs, setObs] = useState("");
  const [err, setErr] = useState("");
  const total = Number(price) * Number(rate);
  const save = useMutation({
    mutationFn: () => api.post(`/appointments/${a.id}/attend`, {
      price_usd: Number(price), observations: obs || null,
      ...(isAdmin && rate && Number(rate) !== a.bcv_rate ? { bcv_rate: Number(rate) } : {})
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["appts"] }); toast("ok", "Cambio registrado"); onClose(); },
    onError: (e) => setErr(apiError(e).message),
  });
  return (
    <Modal title="Asistió" onClose={onClose} footer={<><Button variant="text" onClick={onClose}>Cancelar</Button>
      <Button variant="primary" disabled={save.isPending || !(Number(price) >= 0) || price === ""} onClick={() => save.mutate()}>Guardar</Button></>}>
      <div className="space-y-3">
        {err && <Banner text={err} />}
        <label className="block"><span className="mb-1 block text-xs">Precio USD</span>
          <input className={inputCls} type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
        <label className="block"><span className="mb-1 block text-xs">Tasa BCV {isAdmin ? "" : "(solo un administrador puede editarla)"}</span>
          <input className={inputCls} type="number" min="0" step="0.0001" value={rate} readOnly={!isAdmin} disabled={!isAdmin} onChange={(e) => setRate(e.target.value)} /></label>
        <p className="text-xs">Conversión Bs.: <span className="font-semibold text-olive">{total > 0 ? bs(total) : "—"}</span></p>
        <label className="block"><span className="mb-1 block text-xs">Observaciones</span>
          <textarea className={inputCls} rows={3} value={obs} onChange={(e) => setObs(e.target.value)} /></label>
      </div>
    </Modal>
  );
}

export function NoShowModal({ a, onClose }: { a: Appt; onClose: () => void }) {
  const qc = useQueryClient(), toast = useToast((t) => t.show);
  const [phase, setPhase] = useState(a.phase ?? "inicial"), [session, setSession] = useState(a.session_number ?? 1);
  const [pickedDate, setPickedDate] = useState<string | null>(null), [slot, setSlot] = useState<string | null>(null), [err, setErr] = useState("");

  const sg = useQuery({
    queryKey: ["suggest", a.id, phase, session], enabled: session >= 1,
    queryFn: async () => (await api.get<{ suggested_date: string; phase: string; session_number: number }>(`/appointments/${a.id}/next-suggestion`, { params: { phase, session_number: session } })).data
  });
  const date = pickedDate ?? sg.data?.suggested_date;
  const av = useQuery({
    queryKey: ["av", date, a.duration_min], enabled: !!date,
    queryFn: async () => (await api.get<{ slots: { start_at: string }[]; nearby_dates: string[] }>("/appointments/availability", { params: { date, duration: a.duration_min } })).data
  });

  const create = useMutation({
    mutationFn: () => api.post(`/appointments/${a.id}/no-show`, { phase: sg.data!.phase, session_number: sg.data!.session_number, new_start_at: slot }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["appts"] }); toast("ok", "Cita enlazada creada"); onClose(); },
    onError: (e) => setErr(apiError(e).message),
  });
  const chip = (on: boolean, label: string, onClick: () => void) => (
    <button key={label} onClick={onClick} className={`rounded-full border px-3 py-1 text-xs ${on ? "border-olive bg-olive text-bone" : "border-beige bg-bone text-olive"}`}>{label}</button>);

  return (
    <Modal title="No asistió" onClose={onClose} footer={<><Button variant="text" onClick={onClose}>Cancelar</Button>
      <Button variant="primary" disabled={!slot || !sg.data || create.isPending} onClick={() => create.mutate()}>Crear cita enlazada</Button></>}>
      <div className="space-y-3">
        {err && <Banner text={err} />}
        <p className="rounded-ctl bg-bone p-3 text-xs">La cita original se conserva en el historial y se crea una nueva cita enlazada.</p>
        <label className="block"><span className="mb-1 block text-xs">Fase</span>
          <select className={inputCls} value={phase} onChange={(e) => { setPhase(e.target.value); setPickedDate(null); setSlot(null); }}>
            {PHASES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="block"><span className="mb-1 block text-xs">Número de sesión (de esta cita)</span>
          <input className={inputCls} type="number" min={1} value={session} onChange={(e) => { setSession(Math.max(1, Number(e.target.value))); setPickedDate(null); setSlot(null); }} /></label>
        {sg.data && <p className="text-xs">Próxima fecha sugerida: <span className="font-semibold text-olive">{format(parseISO(sg.data.suggested_date), "EEEE d 'de' MMMM", { locale: es })}</span> (sesión {sg.data.session_number})</p>}
        {av.data && (av.data.slots.length > 0
          ? <div className="flex flex-wrap gap-2">{av.data.slots.map((s) => chip(slot === s.start_at, format(parseISO(s.start_at), "HH:mm"), () => setSlot(s.start_at)))}</div>
          : <div><p className="mb-2 text-xs">No hay huecos ese día. Fechas cercanas:</p>
            <div className="flex flex-wrap gap-2">{av.data.nearby_dates.map((d) => chip(false, format(parseISO(d), "EEE d MMM", { locale: es }), () => { setPickedDate(d); setSlot(null); }))}</div></div>)}
      </div>
    </Modal>
  );
}
