import axios, { AxiosError } from "axios";
import { useAuth } from "./store";

export const api = axios.create({ baseURL: "/api", paramsSerializer: { indexes: null } }) // status=a&status=b;

api.interceptors.request.use((cfg) => {
  const t = useAuth.getState().access;
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

let refreshing: Promise<void> | null = null;
api.interceptors.response.use((r) => r, async (err: AxiosError) => {
  const { refresh, setTokens, logout } = useAuth.getState();
  const orig = err.config as (typeof err.config & { _retried?: boolean }) | undefined;
  if (err.response?.status === 401 && refresh && orig && !orig._retried && !orig.url?.includes("/auth/")) {
    orig._retried = true;
    refreshing ??= api.post("/auth/refresh", { refresh_token: refresh })
      .then((r) => setTokens(r.data.access_token, r.data.refresh_token))
      .catch(() => logout()).finally(() => { refreshing = null; });
    await refreshing;
    return useAuth.getState().access ? api(orig) : Promise.reject(err);
  }
  return Promise.reject(err);
});

export type ApiError = { code?: string; message: string; step?: string | null; client_id?: number; nearby_dates?: string[]; count?: number; affected_url?: string };
export function apiError(e: unknown): ApiError {
  const d = (e as AxiosError<{ detail: unknown }>).response?.data?.detail;
  if (d && typeof d === "object" && "message" in d) return d as ApiError;
  if (Array.isArray(d)) return { message: "Revisa los campos del formulario." };
  return { message: typeof d === "string" ? d : "No se pudo completar la operación." };
}

export type Client = {
  id: number; full_name: string; national_id: string; phone: string; allergies_conditions: string[];
  total_appointments?: number; last_appointment?: string | null
};
export type Zone = { id: number; name: string; base_duration_min: number; base_price_usd: number; active?: boolean };
export type Combo = { id: number; name: string; zone_ids: number[]; total_duration_min: number; total_price_usd: number; active?: boolean };
export type Options = {
  cubicles: { id: number; name: string }[]; workers: { id: number; name: string }[];
  cubicles_total: number; business_hours: { open: string; close: string }
};

export type Status = "Programada" | "Confirmada" | "Atendida" | "No asistió" | "Cancelada" | "Reagendada";
export type Appt = {
  id: number; client_id: number; client_name: string; client_phone: string; worker_id: number; cubicle_id: number;
  start_at: string; end_at: string; duration_min: number; status: Status; zones: string[]; combo_id: number | null;
  flow_stage: "reception" | "treatment" | null; price_usd: number; bcv_rate: number | null; price_bs: number | null; phase: string | null; session_number: number | null;
  observations: string | null; original_appointment_id: number | null; rescheduled_to: { id: number; start_at: string } | null
};
