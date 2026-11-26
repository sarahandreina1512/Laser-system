import { create } from "zustand";
import { persist } from "zustand/middleware";

// Zustand: el estado global es mínimo (sesión + un toast); Redux Toolkit sería sobreingeniería aquí.
type Auth = { access: string | null; refresh: string | null; role: "admin" | "worker" | null; username: string | null;
  login: (a: string, r: string, role: "admin" | "worker", u: string) => void;
  setTokens: (a: string, r: string) => void; logout: () => void };

export const useAuth = create<Auth>()(persist((set) => ({
  access: null, refresh: null, role: null, username: null,
  login: (access, refresh, role, username) => set({ access, refresh, role, username }),
  setTokens: (access, refresh) => set({ access, refresh }),
  logout: () => set({ access: null, refresh: null, role: null, username: null }),
}), { name: "aura-auth" }));

type Toast = { id: number; kind: "ok" | "error"; text: string } | null;
export const useToast = create<{ toast: Toast; show: (kind: "ok" | "error", text: string) => void; close: () => void }>((set) => {
  let timer: ReturnType<typeof setTimeout>;
  return { toast: null, close: () => set({ toast: null }),
    show: (kind, text) => { clearTimeout(timer); set({ toast: { id: Date.now(), kind, text } });
      timer = setTimeout(() => set({ toast: null }), 4000); } }; // 4 s, uno a la vez
});
