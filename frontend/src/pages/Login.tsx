import { AlertTriangle, Lock, User } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { api, apiError } from "../api";
import { useAuth } from "../store";
import { Button, inputCls } from "../ui";

export default function Login() {
  const { access, login } = useAuth();
  const nav = useNavigate();
  const [u, setU] = useState(""), [p, setP] = useState(""), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  if (access) return <Navigate to="/" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      const { data } = await api.post("/auth/login", new URLSearchParams({ username: u, password: p }));
      login(data.access_token, data.refresh_token, data.role, u);
      nav("/", { replace: true }); // "/" redirige según rol, sin pantalla intermedia
    } catch (x) { setErr(apiError(x).message); } finally { setBusy(false); }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-card border border-beige bg-canvas p-8 shadow-soft">
        <div className="flex flex-col items-center gap-2">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-olive text-sm font-semibold tracking-widest text-bone">AURA</span>
          <h1>Iniciar sesión</h1>
        </div>
        <label className="relative block"><User size={18} strokeWidth={1.5} className="absolute left-3 top-2.5 text-olive/60" />
          <input className={`${inputCls} pl-9`} placeholder="Usuario" autoComplete="username" value={u} onChange={(e) => setU(e.target.value)} required /></label>
        <label className="relative block"><Lock size={18} strokeWidth={1.5} className="absolute left-3 top-2.5 text-olive/60" />
          <input className={`${inputCls} pl-9`} type="password" placeholder="Contraseña" autoComplete="current-password" value={p} onChange={(e) => setP(e.target.value)} required /></label>
        {err && <p className="flex items-center gap-1 text-xs text-terracotta" role="alert"><AlertTriangle size={14} strokeWidth={1.5} />{err}</p>}
        <Button variant="primary" className="w-full" disabled={busy}>{busy ? "Entrando…" : "Iniciar sesión"}</Button>
      </form>
    </div>
  );
}
