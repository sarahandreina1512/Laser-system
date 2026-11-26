import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Pencil, Phone, Plus, Search, Users } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, type Appt, type Client } from "../api";
import ClientModal from "../components/ClientModal";
import { bs, usd } from "../data";
import { Button, Card, EmptyState, StatusBadge, inputCls } from "../ui";

export function ClientsPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const [modal, setModal] = useState(false);
  const nav = useNavigate();
  const res = useQuery({ queryKey: ["clients", q], queryFn: async () => (await api.get<Client[]>("/clients", { params: { q } })).data });
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-4 flex items-center gap-2"><Users size={24} strokeWidth={1.5} />Clientes</h1>
      <div className="mb-4 flex gap-2">
        <div className="relative flex-1"><Search size={18} strokeWidth={1.5} className="absolute left-3 top-2.5 text-olive/60" />
          <input className={`${inputCls} pl-9`} placeholder="Buscar por cédula o nombre" value={q} onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {})} /></div>
        <Button variant="primary" onClick={() => setModal(true)}><Plus size={18} strokeWidth={1.5} />Nuevo cliente</Button>
      </div>
      {res.data?.length === 0 && <EmptyState icon={<Users />} text="No hay clientes que coincidan." />}
      <div className="space-y-2">
        {res.data?.map((c) => (
          <Link key={c.id} to={`/clientes/${c.id}`}>
            <Card className="mb-2 flex flex-wrap items-center justify-between gap-2 p-3 hover:bg-bone">
              <span><span className="block font-semibold text-olive">{c.full_name}</span><span className="text-xs">{c.national_id}</span></span>
              <span className="flex items-center gap-1 text-xs"><Phone size={14} strokeWidth={1.5} />{c.phone}</span>
              <span className="text-xs">{c.total_appointments ?? 0} citas · última: {c.last_appointment ? format(parseISO(c.last_appointment), "dd/MM/yyyy") : "—"}</span>
            </Card>
          </Link>))}
      </div>
      {modal && <ClientModal onClose={() => setModal(false)} onDone={(c) => nav(`/clientes/${c.id}`)} />}
    </div>
  );
}

export function ClientDetail() {
  const { id } = useParams();
  const [edit, setEdit] = useState(false);
  const q = useQuery({ queryKey: ["client", id], queryFn: async () => (await api.get<Client & { history: Appt[]; total_appointments: number }>(`/clients/${id}`)).data });
  if (q.isError) return <EmptyState icon={<Users />} text="No se encontró el cliente."><Link to="/clientes"><Button>Volver a clientes</Button></Link></EmptyState>;
  const c = q.data;
  if (!c) return null;
  return (
    <div className="mx-auto max-w-3xl">
      <Card className="mb-4 flex flex-wrap items-center gap-4 p-5">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-olive text-xl uppercase text-bone">{c.full_name[0]}</span>
        <div className="flex-1">
          <h1>{c.full_name}</h1>
          <p className="text-xs">{c.national_id} · <Phone size={12} className="inline" strokeWidth={1.5} /> {c.phone} · {c.total_appointments} cita{c.total_appointments === 1 ? "" : "s"}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">{c.allergies_conditions.map((a) => <span key={a} className="rounded-full bg-beige/40 px-2.5 py-0.5 text-xs text-olive">{a}</span>)}</div>
        </div>
        <Button onClick={() => setEdit(true)}><Pencil size={18} strokeWidth={1.5} />Editar</Button>
      </Card>
      <h2 className="mb-2 text-lg">Historial</h2>
      {c.history.length === 0 && <EmptyState icon={<Users />} text="Este cliente aún no tiene citas." />}
      <div className="space-y-2">
        {c.history.map((a) => (
          <Card key={a.id} className="p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-olive">{format(parseISO(a.start_at), "dd/MM/yyyy HH:mm")}</span><StatusBadge status={a.status} />
            </div>
            <p className="mt-1">{a.zones.join(", ")} · {a.duration_min} min</p>
            <p className="text-xs">{usd(a.price_usd)}{a.price_bs != null && ` · ${bs(a.price_bs)} (tasa ${a.bcv_rate})`}</p>
            {a.observations && <p className="mt-1 text-xs italic">{a.observations}</p>}
            {a.rescheduled_to && <p className="mt-1 text-xs text-terracotta">↳ Reagendada → {format(parseISO(a.rescheduled_to.start_at), "dd/MM")}</p>}
          </Card>))}
      </div>
      {edit && <ClientModal client={c} onClose={() => setEdit(false)} onDone={() => { setEdit(false); q.refetch(); }} />}
    </div>
  );
}
