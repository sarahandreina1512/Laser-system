import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Clock, DollarSign, Pencil, Plus, Power, Settings } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { api, apiError, type Combo, type Zone } from "../api";
import { bs, usd } from "../data";
import { useToast } from "../store";
import { Banner, Button, Card, Modal, inputCls } from "../ui";

type Cfg = { open: string; close: string; slot_step_min: number };
type Rate = { date: string; rate: number; source: string; stale: boolean };

function useSave(invalidate: string[]) {
  const qc = useQueryClient(), toast = useToast((t) => t.show);
  return { ok: () => { invalidate.forEach((k) => qc.invalidateQueries({ queryKey: [k] })); toast("ok", "Cambio registrado"); },
    fail: (e: unknown) => toast("error", apiError(e).message) };
}

const Section = ({ title, icon, action, children }: { title: string; icon: ReactNode; action?: ReactNode; children: ReactNode }) => (
  <Card className="mb-4 p-5"><div className="mb-3 flex items-center justify-between"><h2 className="flex items-center gap-2 text-lg">{icon}{title}</h2>{action}</div>{children}</Card>);
const Pill = ({ active }: { active: boolean }) => <span className={`rounded-full px-2.5 py-0.5 text-xs ${active ? "bg-olive/15 text-olive" : "bg-gray-500/10 text-gray-500"}`}>{active ? "Activo" : "Inactivo"}</span>;
const ic = { size: 20, strokeWidth: 1.5 };

function Hours() {
  const cfg = useQuery({ queryKey: ["settings"], queryFn: async () => (await api.get<Cfg>("/settings")).data });
  const [f, setF] = useState<Cfg | null>(null);
  useEffect(() => { if (cfg.data) setF(cfg.data); }, [cfg.data]);
  const s = useSave(["settings"]);
  const save = useMutation({ mutationFn: () => api.put("/settings", f), onSuccess: () => { s.ok(); qc(); }, onError: s.fail });
  const qcl = useQueryClient(); const qc = () => qcl.invalidateQueries({ queryKey: ["month"] });
  if (!f) return null;
  const bad = f.open >= f.close;
  return (
    <Section title="Horario de atención" icon={<Clock {...ic} />}>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block"><span className="mb-1 block text-xs">Apertura</span><input type="time" className={inputCls} value={f.open} onChange={(e) => setF({ ...f, open: e.target.value })} /></label>
        <label className="block"><span className="mb-1 block text-xs">Cierre</span><input type="time" className={inputCls} value={f.close} onChange={(e) => setF({ ...f, close: e.target.value })} /></label>
        <label className="block"><span className="mb-1 block text-xs">Intervalo de horas (min)</span>
          <select className={inputCls} value={f.slot_step_min} onChange={(e) => setF({ ...f, slot_step_min: Number(e.target.value) })}>
            {[10, 15, 20, 30, 60].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
      </div>
      {bad && <p className="mt-2 text-xs text-terracotta">El cierre debe ser posterior a la apertura.</p>}
      <div className="mt-3 flex justify-end"><Button variant="primary" disabled={bad || save.isPending} onClick={() => save.mutate()}>Guardar horario</Button></div>
    </Section>);
}

function Bcv() {
  const rate = useQuery({ queryKey: ["bcv-admin"], queryFn: async () => { try { return (await api.get<Rate>("/bcv/current")).data; } catch { return null; } } });
  const [v, setV] = useState("");
  const s = useSave(["bcv-admin", "bcv"]);
  const save = useMutation({ mutationFn: () => api.post("/bcv/manual", { rate: Number(v) }), onSuccess: () => { s.ok(); setV(""); }, onError: s.fail });
  return (
    <Section title="Tasa BCV" icon={<DollarSign {...ic} />}>
      {rate.data ? <p>Tasa vigente: <span className="font-semibold text-olive">{bs(rate.data.rate)}</span> · {format(parseISO(rate.data.date), "dd/MM/yyyy")} · {rate.data.source === "manual" ? "manual" : "API"}
        {rate.data.stale && <span className="text-terracotta"> (desactualizada)</span>}</p>
        : rate.isFetched && <Banner text="No hay tasa cargada. Las citas no pueden crearse sin ella." />}
      <div className="mt-3 flex gap-2">
        <input type="number" min="0" step="0.0001" className={inputCls} placeholder="Carga manual (Bs. por USD)" value={v} onChange={(e) => setV(e.target.value)} />
        <Button variant="ghost" disabled={!(Number(v) > 0) || save.isPending} onClick={() => save.mutate()}>Guardar tasa</Button>
      </div>
    </Section>);
}

function ZoneModal({ z, onClose }: { z?: Zone; onClose: () => void }) {
  const [f, setF] = useState({ name: z?.name ?? "", base_duration_min: String(z?.base_duration_min ?? 30), base_price_usd: String(z?.base_price_usd ?? ""), active: z?.active ?? true });
  const s = useSave(["zones-all", "zones", "combos-all"]);
  const save = useMutation({ mutationFn: () => { const b = { ...f, base_duration_min: Number(f.base_duration_min), base_price_usd: Number(f.base_price_usd) };
    return z ? api.put(`/zones/${z.id}`, b) : api.post("/zones", b); }, onSuccess: () => { s.ok(); onClose(); }, onError: s.fail });
  const ok = f.name.trim() && Number(f.base_duration_min) > 0 && f.base_price_usd !== "" && Number(f.base_price_usd) >= 0;
  return (
    <Modal title={z ? "Editar zona" : "Nueva zona"} onClose={onClose} footer={<><Button variant="text" onClick={onClose}>Cancelar</Button>
      <Button variant="primary" disabled={!ok || save.isPending} onClick={() => save.mutate()}>Guardar</Button></>}>
      <div className="space-y-3">
        <label className="block"><span className="mb-1 block text-xs">Nombre</span><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="mb-1 block text-xs">Duración (min)</span><input type="number" min={1} className={inputCls} value={f.base_duration_min} onChange={(e) => setF({ ...f, base_duration_min: e.target.value })} /></label>
          <label className="block"><span className="mb-1 block text-xs">Precio USD</span><input type="number" min={0} step="0.01" className={inputCls} value={f.base_price_usd} onChange={(e) => setF({ ...f, base_price_usd: e.target.value })} /></label>
        </div>
        <p className="text-xs">Las citas ya creadas conservan su duración y precio.</p>
      </div>
    </Modal>);
}

function Zones() {
  const zs = useQuery({ queryKey: ["zones-all"], queryFn: async () => (await api.get<Zone[]>("/zones", { params: { include_inactive: true } })).data });
  const [edit, setEdit] = useState<Zone | "new" | null>(null);
  const s = useSave(["zones-all", "zones"]);
  const toggle = useMutation({ mutationFn: (z: Zone) => api.put(`/zones/${z.id}`, { name: z.name, base_duration_min: z.base_duration_min, base_price_usd: z.base_price_usd, active: !z.active }),
    onSuccess: s.ok, onError: s.fail });
  return (
    <Section title="Zonas" icon={<Settings {...ic} />} action={<Button onClick={() => setEdit("new")}><Plus size={18} strokeWidth={1.5} />Nueva zona</Button>}>
      <ul className="divide-y divide-beige/60">{zs.data?.map((z) => (
        <li key={z.id} className="flex items-center gap-3 py-2">
          <span className="flex-1"><span className="font-medium text-olive">{z.name}</span> <span className="text-xs">{z.base_duration_min} min · {usd(z.base_price_usd)}</span></span>
          <Pill active={!!z.active} />
          <button className="p-2 text-olive" aria-label="Editar" onClick={() => setEdit(z)}><Pencil {...ic} /></button>
          <button className="p-2 text-olive" aria-label={z.active ? "Inactivar" : "Activar"} onClick={() => toggle.mutate(z)}><Power {...ic} /></button></li>))}</ul>
      {zs.data?.length === 0 && <p className="text-xs">Aún no hay zonas.</p>}
      {edit && <ZoneModal z={edit === "new" ? undefined : edit} onClose={() => setEdit(null)} />}
    </Section>);
}

function ComboModal({ zones, onClose }: { zones: Zone[]; onClose: () => void }) {
  const [name, setName] = useState(""), [ids, setIds] = useState<number[]>([]), [dur, setDur] = useState(""), [price, setPrice] = useState("");
  const s = useSave(["combos-all", "combos"]);
  const save = useMutation({ mutationFn: () => api.post("/combos", { name, zone_ids: ids, total_duration_min: dur ? Number(dur) : null, total_price_usd: price ? Number(price) : null }),
    onSuccess: () => { s.ok(); onClose(); }, onError: s.fail });
  return (
    <Modal title="Nuevo combo" onClose={onClose} footer={<><Button variant="text" onClick={onClose}>Cancelar</Button>
      <Button variant="primary" disabled={!name.trim() || ids.length < 2 || save.isPending} onClick={() => save.mutate()}>Guardar</Button></>}>
      <div className="space-y-3">
        <label className="block"><span className="mb-1 block text-xs">Nombre</span><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <div><span className="mb-1 block text-xs">Zonas (mínimo 2)</span><div className="flex flex-wrap gap-2">{zones.filter((z) => z.active).map((z) => (
          <button key={z.id} type="button" onClick={() => setIds(ids.includes(z.id) ? ids.filter((i) => i !== z.id) : [...ids, z.id])}
            className={`rounded-full border px-3 py-1 text-xs ${ids.includes(z.id) ? "border-olive bg-olive text-bone" : "border-beige bg-beige/30 text-olive"}`}>{z.name}</button>))}</div></div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="mb-1 block text-xs">Duración (opcional)</span><input type="number" min={1} className={inputCls} placeholder="Suma de zonas" value={dur} onChange={(e) => setDur(e.target.value)} /></label>
          <label className="block"><span className="mb-1 block text-xs">Precio USD (opcional)</span><input type="number" min={0} step="0.01" className={inputCls} placeholder="Suma de zonas" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
        </div>
      </div>
    </Modal>);
}

function Combos() {
  const zs = useQuery({ queryKey: ["zones-all"], queryFn: async () => (await api.get<Zone[]>("/zones", { params: { include_inactive: true } })).data });
  const cs = useQuery({ queryKey: ["combos-all"], queryFn: async () => (await api.get<Combo[]>("/combos", { params: { include_inactive: true } })).data });
  const [open, setOpen] = useState(false);
  const s = useSave(["combos-all", "combos"]);
  const toggle = useMutation({ mutationFn: (c: Combo) => api.put(`/combos/${c.id}`, { name: c.name, zone_ids: c.zone_ids, total_duration_min: c.total_duration_min, total_price_usd: c.total_price_usd, active: !c.active }),
    onSuccess: s.ok, onError: s.fail });
  const nm = (id: number) => zs.data?.find((z) => z.id === id)?.name ?? `#${id}`;
  return (
    <Section title="Combos" icon={<Settings {...ic} />} action={<Button onClick={() => setOpen(true)}><Plus size={18} strokeWidth={1.5} />Nuevo combo</Button>}>
      <ul className="divide-y divide-beige/60">{cs.data?.map((c) => (
        <li key={c.id} className="flex items-center gap-3 py-2">
          <span className="flex-1"><span className="font-medium text-olive">{c.name}</span> <span className="text-xs">{c.zone_ids.map(nm).join(" + ")} · {c.total_duration_min} min · {usd(c.total_price_usd)}</span></span>
          <Pill active={!!c.active} />
          <button className="p-2 text-olive" aria-label={c.active ? "Inactivar" : "Activar"} onClick={() => toggle.mutate(c)}><Power {...ic} /></button></li>))}</ul>
      {cs.data?.length === 0 && <p className="text-xs">Aún no hay combos.</p>}
      {open && <ComboModal zones={zs.data ?? []} onClose={() => setOpen(false)} />}
    </Section>);
}

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-4 flex items-center gap-2"><Settings size={24} strokeWidth={1.5} />Configuración</h1>
      <Hours /><Bcv /><Zones /><Combos />
    </div>);
}
