import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuth } from "./store";

/** Agenda en vivo: ante un evento "changed" refresca las consultas activas (sin recargar ni perder scroll). */
export function useLive() {
  const qc = useQueryClient();
  const logged = !!useAuth((s) => s.access);
  useEffect(() => {
    if (!logged) return;
    let ws: WebSocket | null = null, timer: number | undefined, tries = 0, closed = false;
    const connect = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${location.host}/api/ws?token=${encodeURIComponent(useAuth.getState().access ?? "")}`);
      ws.onopen = () => { if (tries > 0) qc.invalidateQueries(); tries = 0; }; // tras una caída, resincroniza
      ws.onmessage = (e) => { try { if (JSON.parse(e.data).type === "changed") qc.invalidateQueries(); } catch { /* ignorar */ } };
      ws.onclose = () => { if (!closed) timer = window.setTimeout(connect, Math.min(15000, 1000 * 2 ** tries++)); };
    };
    connect();
    return () => { closed = true; clearTimeout(timer); ws?.close(); };
  }, [logged, qc]);
}
