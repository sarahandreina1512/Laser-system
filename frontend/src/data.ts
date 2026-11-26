import { useQuery } from "@tanstack/react-query";
import { api, type Appt, type Options } from "./api";

export type ApptParams = { date?: string; date_from?: string; date_to?: string; worker_id?: string; cubicle_id?: string; status?: string[]; upcoming?: boolean };
export const useAppts = (params: ApptParams) =>
  useQuery({ queryKey: ["appts", params], queryFn: async () => (await api.get<Appt[]>("/appointments", { params })).data });

export function useNames() {
  const o = useQuery({ queryKey: ["options"], queryFn: async () => (await api.get<Options>("/options")).data });
  const w = new Map(o.data?.workers.map((x) => [x.id, x.name])), c = new Map(o.data?.cubicles.map((x) => [x.id, x.name]));
  return { options: o.data, worker: (id: number) => w.get(id) ?? `Trabajador #${id}`, cubicle: (id: number) => c.get(id) ?? `Cubículo #${id}` };
}

export const usd = (n: number) => `$${Number(n).toFixed(2)}`;
export const bs = (n: number) => `Bs. ${Number(n).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
