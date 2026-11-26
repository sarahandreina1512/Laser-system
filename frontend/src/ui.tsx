import { AlertTriangle, Ban, Check, CheckCircle2, Clock, RefreshCw, UserX, X } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useToast } from "./store";

const ICON = { size: 20, strokeWidth: 1.5 };
type V = "primary" | "accent" | "ghost" | "text";
const VARIANTS: Record<V, string> = {
  primary: "bg-olive text-bone hover:bg-olive/90",
  accent: "bg-terracotta text-bone hover:bg-terracotta/90",
  ghost: "border border-olive/20 text-olive hover:bg-beige/20",
  text: "text-ink hover:underline px-2",
};
export function Button({ variant = "ghost", className = "", ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: V }) {
  return <button {...p} className={`inline-flex items-center justify-center gap-2 rounded-ctl px-4 py-2 font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${VARIANTS[variant]} ${className}`} />;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-card border border-beige bg-canvas shadow-soft ${className}`}>{children}</div>;
}

const STATUS = {
  "Programada": { cls: "bg-beige/30 text-olive", Icon: Clock },
  "Confirmada": { cls: "bg-olive text-bone", Icon: Check },
  "Atendida": { cls: "bg-olive/15 border border-olive text-olive", Icon: CheckCircle2 },
  "No asistió": { cls: "bg-terracotta/15 border border-terracotta text-terracotta", Icon: UserX },
  "Cancelada": { cls: "bg-gray-500/10 text-gray-500", Icon: Ban },
  "Reagendada": { cls: "border border-dashed border-terracotta text-terracotta", Icon: RefreshCw },
} as const;
export function StatusBadge({ status }: { status: keyof typeof STATUS }) { // color + icono + texto
  const { cls, Icon } = STATUS[status];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}><Icon size={14} strokeWidth={1.5} />{status}</span>;
}

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/30 p-4" role="dialog" aria-modal>
      <div className="max-h-full w-full max-w-md overflow-auto rounded-card border border-beige bg-canvas">
        <div className="flex items-center justify-between border-b border-beige px-5 py-3">
          <h2 className="text-lg">{title}</h2>
          <button onClick={onClose} aria-label="Cerrar" className="text-olive"><X {...ICON} /></button>
        </div>
        <div className="p-5">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-beige px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Banner({ text, action, onAction }: { text: string; action?: string; onAction?: () => void }) {
  return (
    <div className="mb-4 flex items-center gap-3 rounded-card border border-terracotta bg-terracotta/10 px-4 py-3 text-terracotta" role="alert">
      <AlertTriangle {...ICON} /><span className="flex-1">{text}</span>
      {action && <Button variant="ghost" onClick={onAction} className="border-terracotta/40 text-terracotta">{action}</Button>}
    </div>
  );
}

export function Toaster() {
  const { toast, close } = useToast();
  if (!toast) return null;
  const ok = toast.kind === "ok";
  return (
    <div key={toast.id} className={`fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-ctl px-4 py-3 text-bone shadow-soft ${ok ? "bg-olive" : "bg-terracotta"}`}>
      {ok ? <CheckCircle2 {...ICON} /> : <AlertTriangle {...ICON} />}<span>{toast.text}</span>
      <button onClick={close} aria-label="Cerrar"><X size={16} /></button>
    </div>
  );
}

export function EmptyState({ icon, text, children }: { icon: ReactNode; text: string; children?: ReactNode }) {
  return <div className="flex flex-col items-center gap-3 py-12 text-center"><div className="text-olive/30 [&>svg]:h-14 [&>svg]:w-14">{icon}</div><p>{text}</p>{children}</div>;
}

export const inputCls = "w-full rounded-ctl border border-beige bg-bone px-3 py-2 outline-none focus:border-olive";
export const errCls = "mt-1 flex items-center gap-1 text-xs text-terracotta";
