import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addMonths, eachDayOfInterval, endOfMonth, format, getDay, isSameDay, parseISO, startOfMonth, subMonths } from "date-fns";
import { es } from "date-fns/locale";
import { CheckCircle2, ChevronRight, Clock, DollarSign, Phone, Plus, Search } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, apiError, type ApiError, type Client, type Combo, type Options, type Zone } from "../api";
import { useToast } from "../store";
import ClientModal from "../components/ClientModal";
import { Banner, Button, Card, EmptyState, inputCls } from "../ui";

const STEPS = ["Cliente", "Fecha y hora", "Zonas", "Confirmar"];
const STEP_OF: Record<string, number> = { client: 0, datetime: 1, zones: 2, confirm: 3 };
const PROBE_MIN = 30; // el calendario muestra disponibilidad para 30 min; el paso 3 revalida con la duración real

type S = { client: Client | null; date: string | null; slot: string | null; mode: "zones" | "combo"; zoneIds: number[];
  comboId: number | null; manual: boolean; workerId: number | null; cubicleId: number | null };
const EMPTY: S = { client: null, date: null, slot: null, mode: "zones", zoneIds: [], comboId: null, manual: false, workerId: null, cubicleId: null };

const usd = (n: number) => `$${n.toFixed(2)}`;
const bs = (n: number) => `Bs. ${n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Wizard() {
  const [step, setStep] = useState(0);
  const [s, setS] = useState<S>(EMPTY);
  const [banner, setBanner] = useState<{ text: string; step: number; action: string } | null>(null);
  const nav = useNavigate(), qc = useQueryClient(), toast = useToast((t) => t.show);
  const patch = (p: Partial<S>) => setS((x) => ({ ...x, ...p }));

  const zones = useQuery({ queryKey: ["zones"], queryFn: async () => (await api.get<Zone[]>("/zones")).data });
  const combos = useQuery({ queryKey: ["combos"], queryFn: async () => (await api.get<Combo[]>("/combos")).data });
  const rate = useQuery({ queryKey: ["bcv"], queryFn: async () => (await api.get<{ rate: number }>("/bcv/current")).data.rate });

  const picked = (zones.data ?? []).filter((z) => s.zoneIds.includes(z.id));
  const combo = (combos.data ?? []).find((c) => c.id === s.comboId);
  const duration = s.mode === "combo" ? combo?.total_duration_min ?? 0 : picked.reduce((a, z) => a + z.base_duration_min, 0);
  const price = s.mode === "combo" ? Number(combo?.total_price_usd ?? 0) : picked.reduce((a, z) => a + Number(z.base_price_usd), 0);

  const fit = useQuery({
    queryKey: ["fit", s.date, duration], enabled: step >= 2 && duration > 0 && !!s.date,
    queryFn: async () => (await api.get<{ slots: { start_at: string }[] }>("/appointments/availability", { params: { date: s.date, duration } })).data.slots,
  });
  const fits = !fit.data || fit.data.some((x) => x.start_at === s.slot);

  const confirm = useMutation({
    mutationFn: () => api.post("/appointments", {
      client_id: s.client!.id, start_at: s.slot,
      zone_ids: s.mode === "zones" ? s.zoneIds : [], combo_id: s.mode === "combo" ? s.comboId : null,
      worker_id: s.manual ? s.workerId : null, cubicle_id: s.manual ? s.cubicleId : null,
    }),
    onSuccess: () => { qc.invalidateQueries(); toast("ok", "Cita confirmada"); nav("/calendario"); },
    onError: (e) => {
      const err: ApiError = apiError(e), to = STEP_OF[err.step ?? "confirm"] ?? 3;
      const near = err.nearby_dates?.length ? ` Fechas cercanas: ${err.nearby_dates.map((d) => format(parseISO(d), "d MMM", { locale: es })).join(", ")}.` : "";
      setBanner({ text: err.message + near, step: to, action: `Volver a ${STEPS[to].toLowerCase()}` });
    },
  });

  const canNext = [!!s.client, !!s.slot, duration > 0 && fits, true][step];
  const go = (n: number) => { setBanner(null); setStep(n); };

  return (
    <div className="mx-auto max-w-4xl pb-24">
      <h1 className="mb-4 flex items-center gap-2">Nueva cita</h1>
      <ol className="mb-6 flex items-center gap-2 text-xs">
        {STEPS.map((t, i) => (
          <li key={t} className="flex flex-1 items-center gap-2">
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${i <= step ? "bg-olive text-bone" : "bg-beige/40 text-olive"}`}>{i + 1}</span>
            <span className={`hidden sm:inline ${i === step ? "font-semibold text-olive" : ""}`}>{t}</span>
            <span className={`h-px flex-1 ${i < step ? "bg-olive" : "bg-beige"}`} />
          </li>
        ))}
      </ol>
      {banner && <Banner text={banner.text} action={banner.action} onAction={() => go(banner.step)} />}
      {step >= 2 && !fits && <Banner text="La duración elegida no cabe a esa hora." action="Elegir otra hora" onAction={() => go(1)} />}

      <Card className="p-5">
        {step === 0 && <StepClient s={s} patch={patch} />}
        {step === 1 && <StepDate s={s} patch={patch} />}
        {step === 2 && <StepZones s={s} patch={patch} zones={zones.data ?? []} combos={combos.data ?? []} />}
        {step === 3 && <StepConfirm s={s} patch={patch} duration={duration} price={price} rate={rate.data} picked={picked} combo={combo} />}
      </Card>

      {step === 2 && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-beige bg-bone px-4 py-3 md:left-60">
          <div className="mx-auto flex max-w-4xl items-center gap-4">
            <span className="flex items-center gap-1"><Clock size={20} strokeWidth={1.5} className="text-olive" />{duration} min</span>
            <span className="flex items-center gap-1"><DollarSign size={20} strokeWidth={1.5} className="text-olive" />{usd(price)}</span>
            <span className={rate.data ? "" : "text-terracotta"}>{rate.data ? bs(price * rate.data) : "Sin tasa BCV"}</span>
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        <Button variant="text" onClick={() => go(step - 1)} disabled={step === 0}>Atrás</Button>
        {step < 3
          ? <Button variant="primary" disabled={!canNext} onClick={() => go(step + 1)}>Continuar <ChevronRight size={18} strokeWidth={1.5} /></Button>
          : <Button variant="accent" disabled={confirm.isPending || (s.manual && (!s.workerId || !s.cubicleId))} onClick={() => confirm.mutate()}>
              <CheckCircle2 size={18} strokeWidth={1.5} />{confirm.isPending ? "Guardando…" : "Confirmar cita"}</Button>}
      </div>
    </div>
  );
}

type P = { s: S; patch: (p: Partial<S>) => void };

function StepClient({ s, patch }: P) {
  const [q, setQ] = useState(""), [modal, setModal] = useState(false);
  const res = useQuery({ queryKey: ["clients", q], queryFn: async () => (await api.get<Client[]>("/clients", { params: { q } })).data });
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1"><Search size={18} strokeWidth={1.5} className="absolute left-3 top-2.5 text-olive/60" />
          <input className={`${inputCls} pl-9`} placeholder="Buscar por cédula o nombre" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Button onClick={() => setModal(true)}><Plus size={18} strokeWidth={1.5} />Nuevo cliente</Button>
      </div>
      {res.data?.length === 0 && <EmptyState icon={<Search />} text="Sin resultados. Crea el cliente sin salir del asistente." />}
      <ul className="divide-y divide-beige/60">
        {res.data?.map((c) => (
          <li key={c.id}>
            <button onClick={() => patch({ client: c })} className={`flex w-full items-center justify-between rounded-ctl px-3 py-2 text-left hover:bg-beige/20 ${s.client?.id === c.id ? "bg-olive/10" : ""}`}>
              <span><span className="block font-medium text-olive">{c.full_name}</span><span className="text-xs">{c.national_id}</span></span>
              <span className="flex items-center gap-1 text-xs"><Phone size={14} strokeWidth={1.5} />{c.phone}</span>
            </button>
          </li>
        ))}
      </ul>
      {modal && <ClientModal onClose={() => setModal(false)} onDone={(c) => { patch({ client: c }); setModal(false); }} />}
    </div>
  );
}

function StepDate({ s, patch }: P) {
  const [month, setMonth] = useState(s.date ? parseISO(s.date) : new Date());
  const key = format(month, "yyyy-MM");
  const days = useQuery({ queryKey: ["month", key], queryFn: async () => new Set((await api.get<{ available_dates: string[] }>("/appointments/availability/month", { params: { month: key, duration: PROBE_MIN } })).data.available_dates) });
  const slots = useQuery({ queryKey: ["slots", s.date], enabled: !!s.date,
    queryFn: async () => (await api.get<{ slots: { start_at: string }[]; nearby_dates: string[] }>("/appointments/availability", { params: { date: s.date, duration: PROBE_MIN } })).data });
  const cells = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) });
  const lead = (getDay(cells[0]) + 6) % 7; // semana inicia en lunes

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <Button variant="text" onClick={() => setMonth(subMonths(month, 1))} aria-label="Mes anterior">‹</Button>
          <span className="font-semibold capitalize text-olive">{format(month, "MMMM yyyy", { locale: es })}</span>
          <Button variant="text" onClick={() => setMonth(addMonths(month, 1))} aria-label="Mes siguiente">›</Button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs">
          {["L", "M", "X", "J", "V", "S", "D"].map((d) => <span key={d} className="py-1 text-olive/60">{d}</span>)}
          {Array.from({ length: lead }).map((_, i) => <span key={`b${i}`} />)}
          {cells.map((d) => {
            const iso = format(d, "yyyy-MM-dd"), ok = days.data?.has(iso), sel = s.date === iso;
            return <button key={iso} disabled={!ok} onClick={() => patch({ date: iso, slot: null })}
              className={`rounded-ctl py-2 ${sel ? "bg-olive text-bone" : ok ? "bg-olive/10 text-olive hover:bg-olive/20" : "bg-gray-500/5 text-gray-400"} ${isSameDay(d, new Date()) ? "ring-1 ring-beige" : ""}`}>{d.getDate()}</button>;
          })}
        </div>
      </div>
      <div>
        {!s.date ? <EmptyState icon={<Clock />} text="Elige un día para ver las horas disponibles." />
          : slots.data && slots.data.slots.length === 0 ? (
            <EmptyState icon={<Clock />} text="No hay horas libres ese día.">
              <div className="flex flex-wrap justify-center gap-2">{slots.data.nearby_dates.map((d) => (
                <button key={d} onClick={() => patch({ date: d, slot: null })} className="rounded-full border border-olive/20 px-3 py-1 text-xs text-olive">{format(parseISO(d), "EEE d MMM", { locale: es })}</button>))}</div>
            </EmptyState>
          ) : (
            <div className="grid grid-cols-3 gap-2">{slots.data?.slots.map(({ start_at }) => (
              <button key={start_at} onClick={() => patch({ slot: start_at })}
                className={`rounded-ctl border px-2 py-2 ${s.slot === start_at ? "border-olive bg-olive text-bone" : "border-beige bg-bone text-olive hover:bg-beige/20"}`}>{format(parseISO(start_at), "HH:mm")}</button>))}</div>
          )}
      </div>
    </div>
  );
}

function StepZones({ s, patch, zones, combos }: P & { zones: Zone[]; combos: Combo[] }) {
  const tab = (m: S["mode"], label: string) => (
    <button onClick={() => patch({ mode: m, zoneIds: [], comboId: null })}
      className={`border-b-2 px-4 py-2 ${s.mode === m ? "border-olive font-semibold text-olive" : "border-transparent"}`}>{label}</button>);
  const chip = (on: boolean, onClick: () => void, label: string, mins: number) => (
    <button key={label} onClick={onClick} className={`flex items-center gap-2 rounded-full border px-3 py-1.5 ${on ? "border-olive bg-olive text-bone" : "border-beige bg-bone text-olive hover:bg-beige/20"}`}>
      {label}<span className="flex items-center gap-0.5 text-xs opacity-80"><Clock size={12} strokeWidth={1.5} />{mins} min</span></button>);
  return (
    <div>
      <div className="mb-4 flex border-b border-beige">{tab("zones", "Zonas individuales")}{tab("combo", "Combos predefinidos")}</div>
      <div className="flex flex-wrap gap-2">
        {s.mode === "zones"
          ? zones.map((z) => chip(s.zoneIds.includes(z.id), () => patch({ zoneIds: s.zoneIds.includes(z.id) ? s.zoneIds.filter((i) => i !== z.id) : [...s.zoneIds, z.id] }), z.name, z.base_duration_min))
          : combos.map((c) => chip(s.comboId === c.id, () => patch({ comboId: c.id }), c.name, c.total_duration_min))}
      </div>
      {(s.mode === "zones" ? zones : combos).length === 0 && <EmptyState icon={<Plus />} text="Aún no hay zonas o combos. Un administrador debe crearlos." />}
    </div>
  );
}

function StepConfirm({ s, patch, duration, price, rate, picked, combo }: P & { duration: number; price: number; rate?: number; picked: Zone[]; combo?: Combo }) {
  const opts = useQuery({ queryKey: ["options"], enabled: s.manual, queryFn: async () => (await api.get<Options>("/options")).data });
  const sel = (label: string, value: number | null, list: { id: number; name: string }[] | undefined, on: (n: number | null) => void) => (
    <label className="block"><span className="mb-1 block text-xs">{label}</span>
      <select className={inputCls} value={value ?? ""} onChange={(e) => on(e.target.value ? Number(e.target.value) : null)}>
        <option value="">Selecciona…</option>{list?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>);
  return (
    <div className="space-y-4">
      <div className="rounded-card bg-bone p-4">
        <p className="font-semibold text-olive">{s.client?.full_name} <span className="font-normal text-ink">· {s.client?.national_id}</span></p>
        <p>{s.slot && format(parseISO(s.slot), "EEEE d 'de' MMMM, HH:mm", { locale: es })} · {duration} min</p>
        <p>{combo ? combo.name : picked.map((z) => z.name).join(", ")}</p>
        <p className="mt-2 font-semibold text-olive">{usd(price)} {rate ? <span className="font-normal text-ink">· {bs(price * rate)} (tasa {rate})</span> : <span className="text-terracotta">· Sin tasa BCV</span>}</p>
      </div>
      <div>
        <p className="mb-2 text-xs">Cubículo y trabajador: {s.manual ? "manual" : "Automático"}{" "}
          <button className="underline" onClick={() => patch({ manual: !s.manual, workerId: null, cubicleId: null })}>{s.manual ? "Volver a automático" : "Asignar manualmente"}</button></p>
        {s.manual && <div className="grid gap-3 sm:grid-cols-2">
          {sel("Cubículo", s.cubicleId, opts.data?.cubicles, (n) => patch({ cubicleId: n }))}
          {sel("Trabajador", s.workerId, opts.data?.workers, (n) => patch({ workerId: n }))}</div>}
      </div>
    </div>
  );
}
