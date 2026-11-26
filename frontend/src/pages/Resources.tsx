import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { DoorOpen, Pencil, Plus, Power, Trash2, UserCog } from "lucide-react";
import { useState, type ReactNode } from "react";
import { api, apiError, type Appt } from "../api";
import { useAppts, useNames } from "../data";
import { useToast } from "../store";
import { Banner, Button, Card, EmptyState, Modal, inputCls } from "../ui";

type Cubicle = { id: number; name_or_number: string; active: boolean; order: number; capacity: number };
type Sched = Record<string, [string, string]>;
type Worker = { id: number; name: string; role: string; active: boolean; order: number; work_schedule: Sched };
type Kind = "cubicle" | "worker";
type Blocked = { message: string; kind: Kind; id: number; url: string };
const DAYS = ["L", "M", "X", "J", "V", "S", "D"];

function useResource<T extends { id: number; active: boolean }>(path: string, kind: Kind) {
  const qc = useQueryClient(), toast = useToast((t) => t.show);
  const [blocked, setBlocked] = useState<Blocked | null>(null);
  const list = useQuery({ queryKey: [path], queryFn: async () => (await api.get<T[]>(path)).data });
  const upcoming = useAppts({ upcoming: true });
  const key = kind === "cubicle" ? "cubicle_id" : "worker_id";
  const countFor = (id: number) => (upcoming.data ?? []).filter((a) => a[key] === id).length;
  const done = () => { qc.invalidateQueries({ queryKey: [path] }); qc.invalidateQueries({ queryKey: ["options"] }); toast("ok", "Cambio registrado"); };
  const fail = (id: number, e: unknown) => {
    const er = apiError(e);
    if (er.code === "has_future_appointments" && er.affected_url) setBlocked({ message: er.message, kind, id, url: er.affected_url });
    else toast("error", er.message);
  };
  const save = useMutation({ mutationFn: (p: { id?: number; body: object }) => (p.id ? api.put(`${path}/${p.id}`, p.body) : api.post(path, p.body)),
    onSuccess: done, onError: (e, p) => fail(p.id ?? 0, e) });
  const remove = useMutation({ mutationFn: (id: number) => api.delete(`${path}/${id}`), onSuccess: done, onError: (e, id) => fail(id, e) });
  return { rows: list.data, countFor, save, remove, blocked, clearBlocked: () => setBlocked(null) };
}

/** Diálogo bloqueante (RN-07): lista las citas afectadas y permite reasignarlas una a una. */
function BlockedDialog({ b, onClose }: { b: Blocked; onClose: () => void }) {
  const qc = useQueryClient(), toast = useToast((t) => t.show), { options } = useNames();
  const [show, setShow] = useState(false), [pick, setPick] = useState<Record<number, string>>({});
  const aff = useQuery({ queryKey: ["affected", b.url], enabled: show, queryFn: async () => (await api.get<Appt[]>(b.url)).data });
  const alts = (b.kind === "cubicle" ? options?.cubicles : options?.workers)?.filter((o) => o.id !== b.id) ?? [];
  const move = useMutation({
    mutationFn: (a: Appt) => api.post(`/appointments/${a.id}/reassign`, { [b.kind === "cubicle" ? "cubicle_id" : "worker_id"]: Number(pick[a.id]) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["appts"] }); qc.invalidateQueries({ queryKey: ["affected"] }); toast("ok", "Cambio registrado"); },
    onError: (e) => toast("error", apiError(e).message),
  });
  return (
    <Modal title="No se puede completar" onClose={onClose} footer={<>
      {!show && <Button variant="ghost" onClick={() => setShow(true)}>Ver citas afectadas</Button>}<Button variant="text" onClick={onClose}>Cancelar</Button></>}>
      <Banner text={b.message} />
      {show && (aff.data?.length === 0
        ? <p className="text-xs">Ya no quedan citas afectadas. Cierra este aviso y repite la operación.</p>
        : <ul className="space-y-2">{aff.data?.map((a) => (
            <li key={a.id} className="rounded-ctl bg-bone p-2 text-xs">
              <p className="font-semibold text-olive">{format(parseISO(a.start_at), "dd/MM HH:mm")} · {a.client_name}</p>
              <div className="mt-1 flex gap-2">
                <select className={inputCls} value={pick[a.id] ?? ""} onChange={(e) => setPick({ ...pick, [a.id]: e.target.value })}>
                  <option value="">Reasignar a…</option>{alts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
                <Button variant="primary" disabled={!pick[a.id] || move.isPending} onClick={() => move.mutate(a)}>Reasignar</Button>
              </div>
            </li>))}</ul>)}
    </Modal>
  );
}

const Pill = ({ active }: { active: boolean }) => (
  <span className={`rounded-full px-2.5 py-0.5 text-xs ${active ? "bg-olive/15 text-olive" : "bg-gray-500/10 text-gray-500"}`}>{active ? "Activo" : "Inactivo"}</span>);

function Row<T extends { id: number; active: boolean }>({ r, icon, title, meta, count, onEdit, onToggle, onDelete }:
  { r: T; icon: ReactNode; title: string; meta: ReactNode; count: number; onEdit: () => void; onToggle: () => void; onDelete: () => void }) {
  const act = "rounded-ctl p-2 text-olive hover:bg-beige/30 disabled:cursor-not-allowed disabled:opacity-30";
  return (
    <Card className="mb-2 flex items-center gap-3 p-3">
      <span className="text-olive">{icon}</span>
      <div className="min-w-0 flex-1"><p className="font-semibold text-olive">{title}</p><div className="text-xs">{meta}</div></div>
      <Pill active={r.active} />
      <button className={act} onClick={onEdit} aria-label="Editar"><Pencil size={20} strokeWidth={1.5} /></button>
      <button className={act} onClick={onToggle} aria-label={r.active ? "Inactivar" : "Activar"}><Power size={20} strokeWidth={1.5} /></button>
      <button className={act} onClick={onDelete} disabled={count > 0} title={count > 0 ? `${count} cita(s) futura(s): reasígnalas primero` : "Eliminar"} aria-label="Eliminar"><Trash2 size={20} strokeWidth={1.5} /></button>
    </Card>);
}

const Field = ({ label, children }: { label: string; children: ReactNode }) => <label className="block"><span className="mb-1 block text-xs">{label}</span>{children}</label>;
const StateSelect = ({ v, on }: { v: boolean; on: (b: boolean) => void }) => (
  <Field label="Estado"><select className={inputCls} value={String(v)} onChange={(e) => on(e.target.value === "true")}><option value="true">Activo</option><option value="false">Inactivo</option></select></Field>);

function CubicleModal({ c, onClose, onSave }: { c?: Cubicle; onClose: () => void; onSave: (b: object) => void }) {
  const [f, setF] = useState({ name_or_number: c?.name_or_number ?? "", active: c?.active ?? true, order: c?.order ?? 0, capacity: c?.capacity ?? 1 });
  return (
    <Modal title={c ? "Editar cubículo" : "Nuevo cubículo"} onClose={onClose} footer={<><Button variant="text" onClick={onClose}>Cancelar</Button>
      <Button variant="primary" disabled={!f.name_or_number.trim()} onClick={() => { onSave(f); onClose(); }}>Guardar</Button></>}>
      <div className="space-y-3">
        {c && <Field label="ID"><input className={inputCls} value={c.id} readOnly disabled /></Field>}
        <Field label="Nombre o número"><input className={inputCls} value={f.name_or_number} onChange={(e) => setF({ ...f, name_or_number: e.target.value })} /></Field>
        <StateSelect v={f.active} on={(active) => setF({ ...f, active })} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Orden"><input className={inputCls} type="number" value={f.order} onChange={(e) => setF({ ...f, order: Number(e.target.value) })} /></Field>
          <Field label="Capacidad"><input className={inputCls} type="number" min={1} value={f.capacity} onChange={(e) => setF({ ...f, capacity: Math.max(1, Number(e.target.value)) })} /></Field>
        </div>
      </div>
    </Modal>);
}

function WorkerModal({ w, onClose, onSave }: { w?: Worker; onClose: () => void; onSave: (b: object) => void }) {
  const [f, setF] = useState({ name: w?.name ?? "", role: w?.role ?? "Esteticista", active: w?.active ?? true, order: w?.order ?? 0 });
  const [sch, setSch] = useState<Sched>(w?.work_schedule ?? {});
  const toggle = (d: number) => { const n = { ...sch }; if (n[d]) delete n[d]; else n[d] = ["09:00", "18:00"]; setSch(n); };
  const bad = Object.values(sch).some(([a, b]) => !a || !b || a >= b); // coherencia horaria
  return (
    <Modal title={w ? "Editar trabajador" : "Nuevo trabajador"} onClose={onClose} footer={<><Button variant="text" onClick={onClose}>Cancelar</Button>
      <Button variant="primary" disabled={f.name.trim().length < 2 || bad} onClick={() => { onSave({ ...f, work_schedule: sch }); onClose(); }}>Guardar</Button></>}>
      <div className="space-y-3">
        {w && <Field label="ID"><input className={inputCls} value={w.id} readOnly disabled /></Field>}
        <Field label="Nombre"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Rol"><input className={inputCls} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <StateSelect v={f.active} on={(active) => setF({ ...f, active })} />
          <Field label="Orden"><input className={inputCls} type="number" value={f.order} onChange={(e) => setF({ ...f, order: Number(e.target.value) })} /></Field>
        </div>
        <div><span className="mb-1 block text-xs">Horario semanal</span>
          <div className="mb-2 flex gap-1.5">{DAYS.map((d, i) => (
            <button key={d} type="button" onClick={() => toggle(i)} aria-pressed={!!sch[i]}
              className={`h-8 w-8 rounded-full border text-xs ${sch[i] ? "border-olive bg-olive text-bone" : "border-beige bg-beige/30 text-olive"}`}>{d}</button>))}</div>
          {DAYS.map((d, i) => sch[i] && (
            <div key={d} className="mb-1 flex items-center gap-2 text-xs"><span className="w-5">{d}</span>
              <input type="time" className={inputCls} value={sch[i][0]} onChange={(e) => setSch({ ...sch, [i]: [e.target.value, sch[i][1]] })} />–
              <input type="time" className={inputCls} value={sch[i][1]} onChange={(e) => setSch({ ...sch, [i]: [sch[i][0], e.target.value] })} /></div>))}
          {bad && <p className="text-xs text-terracotta">La hora de fin debe ser posterior a la de inicio.</p>}
        </div>
      </div>
    </Modal>);
}

function Page<T extends { id: number; active: boolean }>({ title, icon, path, kind, empty, row, modal, toBody, addLabel }: {
  title: string; icon: ReactNode; path: string; kind: Kind; empty: string; addLabel: string;
  row: (r: T) => { title: string; meta: ReactNode };
  modal: (r: T | undefined, onClose: () => void, onSave: (b: object) => void) => ReactNode;
  toBody: (r: T) => object;
}) {
  const res = useResource<T>(path, kind);
  const [edit, setEdit] = useState<T | "new" | null>(null);
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="flex items-center gap-2 [&>svg]:h-6 [&>svg]:w-6">{icon}{title}</h1>
        <Button variant="primary" onClick={() => setEdit("new")}><Plus size={18} strokeWidth={1.5} />{addLabel}</Button>
      </div>
      {res.rows?.length === 0 && <EmptyState icon={icon} text={empty} />}
      {res.rows?.map((r) => { const v = row(r); return (
        <Row key={r.id} r={r} icon={icon} title={v.title} meta={v.meta} count={res.countFor(r.id)} onEdit={() => setEdit(r)}
          onToggle={() => res.save.mutate({ id: r.id, body: { ...toBody(r), active: !r.active } })} onDelete={() => res.remove.mutate(r.id)} />); })}
      {edit && modal(edit === "new" ? undefined : edit, () => setEdit(null), (body) => res.save.mutate({ id: edit === "new" ? undefined : edit.id, body }))}
      {res.blocked && <BlockedDialog b={res.blocked} onClose={res.clearBlocked} />}
    </div>
  );
}

export const CubiclesPage = () => (
  <Page<Cubicle> title="Cubículos" icon={<DoorOpen />} path="/cubicles" kind="cubicle" addLabel="Nuevo cubículo" empty="Aún no hay cubículos."
    row={(c) => ({ title: c.name_or_number, meta: `Capacidad ${c.capacity} · Orden ${c.order}` })}
    toBody={(c) => ({ name_or_number: c.name_or_number, order: c.order, capacity: c.capacity })}
    modal={(c, onClose, onSave) => <CubicleModal c={c} onClose={onClose} onSave={onSave} />} />);

export const WorkersPage = () => (
  <Page<Worker> title="Trabajadores" icon={<UserCog />} path="/workers" kind="worker" addLabel="Nuevo trabajador" empty="Aún no hay trabajadores."
    row={(w) => ({ title: w.name, meta: <>{w.role} · <span className="inline-flex gap-1 align-middle">{DAYS.map((d, i) => w.work_schedule[i] && <span key={d} className="rounded-full bg-beige/40 px-1.5 text-olive">{d}</span>)}</span></> })}
    toBody={(w) => ({ name: w.name, role: w.role, order: w.order, work_schedule: w.work_schedule })}
    modal={(w, onClose, onSave) => <WorkerModal w={w} onClose={onClose} onSave={onSave} />} />);
