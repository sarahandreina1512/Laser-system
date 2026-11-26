import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Shell from "./Shell";
import Dashboard from "./pages/Dashboard";
import { ClientDetail, ClientsPage } from "./pages/Clients";
import { CubiclesPage, WorkersPage } from "./pages/Resources";
import SettingsPage from "./pages/Settings";
import CalendarPage from "./pages/Calendar";
import DayManagement from "./pages/DayManagement";
import Login from "./pages/Login";
import Wizard from "./pages/Wizard";
import { Toaster } from "./ui";
import { useAuth } from "./store";

const Protected = ({ children }: { children: ReactNode }) => (useAuth((s) => s.access) ? <>{children}</> : <Navigate to="/login" replace />);
// Defensa de UX; la autoridad real es el 403 del backend.
const AdminOnly = ({ children }: { children: ReactNode }) => (useAuth((s) => s.role) === "admin" ? <>{children}</> : <Navigate to="/" replace />);
const Home = () => <Navigate to={useAuth((s) => s.role) === "admin" ? "/panel" : "/dia"} replace />; // redirección por rol

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<Protected><Shell /></Protected>}>
          <Route index element={<Home />} />
          <Route path="panel" element={<Dashboard />} />
          <Route path="calendario" element={<CalendarPage />} />
          <Route path="citas" element={<Wizard />} />
          <Route path="citas/nueva" element={<Wizard />} />
          <Route path="clientes" element={<ClientsPage />}/>
          <Route path="clientes/:id" element={<ClientDetail />} />
          <Route path="dia" element={<DayManagement />} />
          <Route path="cubiculos" element={<AdminOnly><CubiclesPage /></AdminOnly>} />
          <Route path="trabajadores" element={<AdminOnly><WorkersPage /></AdminOnly>} />
          <Route path="configuracion" element={<AdminOnly><SettingsPage /></AdminOnly>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </>
  );
}
