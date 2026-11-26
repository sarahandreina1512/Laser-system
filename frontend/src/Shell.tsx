import { Bell, CalendarCheck, CalendarDays, CheckCircle2, DoorOpen, LayoutDashboard, LogOut, Menu, Search, Settings, UserCog, Users } from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useLive } from "./live";
import { useAuth } from "./store";

const ITEMS = [
  { to: "/panel", label: "Panel", Icon: LayoutDashboard, admin: false },
  { to: "/calendario", label: "Calendario", Icon: CalendarDays, admin: false },
  { to: "/citas", label: "Citas", Icon: CalendarCheck, admin: false },
  { to: "/clientes", label: "Clientes", Icon: Users, admin: false },
  { to: "/dia", label: "Gestión del día", Icon: CheckCircle2, admin: false },
  { to: "/cubiculos", label: "Cubículos", Icon: DoorOpen, admin: true },
  { to: "/trabajadores", label: "Trabajadores", Icon: UserCog, admin: true },
  { to: "/configuracion", label: "Configuración", Icon: Settings, admin: true },
];

export default function Shell() {
  const { role, username, logout } = useAuth();
  const [open, setOpen] = useState(false), [search, setSearch] = useState("");
  const nav = useNavigate();
  useLive();
  const items = ITEMS.filter((i) => !i.admin || role === "admin"); // lo no permitido no se renderiza

  return (
    <div className="flex min-h-screen">
      {open && <div className="fixed inset-0 z-20 bg-ink/30 md:hidden" onClick={() => setOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-30 flex w-60 flex-col bg-bone transition-transform md:static md:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center gap-2 px-5 py-5">
          <span className="h-8 w-8 rounded-full bg-olive" /><span className="text-lg font-semibold tracking-widest text-olive">AURA</span>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {items.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} onClick={() => setOpen(false)}
              className={({ isActive }) => `flex items-center gap-3 rounded-ctl px-3 py-2 ${isActive ? "bg-olive text-bone" : "text-olive/80 hover:bg-beige/20"}`}>
              <Icon size={24} strokeWidth={1.5} />{label}
            </NavLink>
          ))}
        </nav>
        <button onClick={() => { logout(); nav("/login"); }} className="m-3 flex items-center gap-3 rounded-ctl px-3 py-2 text-olive/80 hover:bg-beige/20">
          <LogOut size={24} strokeWidth={1.5} />Cerrar sesión
        </button>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-beige bg-bone px-4 py-3">
          <button className="text-olive md:hidden" onClick={() => setOpen(true)} aria-label="Menú"><Menu size={24} strokeWidth={1.5} /></button>
          <form className="relative max-w-sm flex-1" onSubmit={(e) => { e.preventDefault(); nav(`/clientes?q=${encodeURIComponent(search)}`); }}>
            <Search size={18} strokeWidth={1.5} className="absolute left-3 top-2.5 text-olive/60" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente" className="w-full rounded-ctl border border-beige bg-canvas py-2 pl-9 pr-3 outline-none focus:border-olive" />
          </form>
          <div className="ml-auto flex items-center gap-3">
            <Bell size={22} strokeWidth={1.5} className="text-olive" />
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-olive text-sm uppercase text-bone">{username?.[0]}</span>
              <span className="hidden text-xs text-ink sm:inline">{role === "admin" ? "Administrador" : "Trabajador"}</span>
            </div>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6"><Outlet /></main>
      </div>
    </div>
  );
}
