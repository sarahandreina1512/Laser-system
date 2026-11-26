# AURA — gestión de citas de depilación láser (uso interno)

FastAPI + SQLAlchemy 2 (async) + Alembic · React 18 + Vite + TypeScript · Tailwind · TanStack Query · Zustand.

## Arranque con Docker
```bash
cp .env.example .env      
docker compose up --build # http://localhost:8080  (API en /api, docs en /api/docs)
```
El backend ejecuta `alembic upgrade head` y crea el primer admin (idempotente) al iniciar.
Supabase: define `DATABASE_URL=postgresql+asyncpg://…` y elimina el servicio `db` del compose.
Tras entrar como admin: Configuración → carga la tasa BCV, zonas y combos; luego cubículos y trabajadores.

## Desarrollo
```bash
cd backend && pip install -r requirements.txt && pytest          # 27 tests
cd frontend && npm install && npm run dev                        # proxy /api → :8000 (incluye WebSocket)
cd frontend && npx playwright install chromium && npm run e2e    # levanta backend (SQLite) y frontend
```

## Notas operativas
- **WebSocket**: el hub es en memoria, por eso el contenedor corre con 1 worker de Gunicorn. Para escalar
  horizontalmente hay que sustituirlo por Redis pub/sub.
- **Tasa BCV**: `app/services/bcv.py::fetch_remote` es un adaptador; ajusta las claves a tu proveedor y
  programa la actualización diaria (APScheduler/cron) — pendiente.
- **Concurrencia**: la revalidación anti-solapamiento ocurre dentro de la transacción; para carga alta añade un
  bloqueo a nivel de BD (p. ej. `pg_advisory_xact_lock` por día).
- El token del WebSocket viaja en la query string; evita registrar URLs completas en el proxy.
