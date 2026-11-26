"""Servicio puro de disponibilidad real (spec 4.6 / 4.7). Sin acceso a BD."""
from __future__ import annotations
from collections import Counter
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

INACTIVE_STATUSES = {"Cancelada", "Reagendada", "No asistió"}  # no ocupan recursos


@dataclass(frozen=True)
class Cubicle:
    id: int
    order: int = 0
    active: bool = True


@dataclass(frozen=True)
class Worker:
    id: int
    schedule: dict[int, tuple[time, time]]  # weekday (0=lun) -> (inicio, fin)
    order: int = 0
    active: bool = True


@dataclass(frozen=True)
class Booked:
    start_at: datetime
    end_at: datetime
    cubicle_id: int
    worker_id: int
    client_id: int | None = None
    status: str = "Programada"


@dataclass(frozen=True)
class Slot:
    start_at: datetime
    end_at: datetime
    cubicle_id: int
    worker_id: int


def _overlap(a0: datetime, a1: datetime, b0: datetime, b1: datetime) -> bool:
    return a0 < b1 and b0 < a1


def _busy(booked: list[Booked], key: str, rid: int, s: datetime, e: datetime) -> bool:
    return any(
        getattr(b, key) == rid and b.status not in INACTIVE_STATUSES
        and _overlap(s, e, b.start_at, b.end_at)
        for b in booked
    )


def compute_availability(
    day: date,
    duration_min: int,
    business_hours: tuple[time, time],
    cubicles: list[Cubicle],
    workers: list[Worker],
    booked: list[Booked],
    now: datetime,
    step_min: int = 30,
    worker_id: int | None = None,
    cubicle_id: int | None = None,
) -> list[Slot]:
    """Horas candidatas con cubículo y trabajador libres todo el intervalo.

    RN-02 se cumple por construcción: cada cita consume 1 cubículo y 1
    trabajador, así que nunca hay más simultáneas que min(cubículos, trabajadores).
    """
    if duration_min <= 0:
        raise ValueError("duration_min debe ser > 0")
    open_t, close_t = business_hours
    day_end = datetime.combine(day, close_t)
    cands_c = sorted(
        (c for c in cubicles if c.active and (cubicle_id is None or c.id == cubicle_id)),
        key=lambda c: (c.order, c.id),
    )
    cands_w = sorted(
        (w for w in workers if w.active and (worker_id is None or w.id == worker_id)),
        key=lambda w: (w.order, w.id),
    )
    # Reparto equitativo: entre los recursos libres se elige el de MENOR carga del día; así no se repite
    # una trabajadora/cubículo mientras otra(o) esté sin asignar. En empate, manda `order` y luego `id`.
    live = [b for b in booked if b.status not in INACTIVE_STATUSES]
    c_load = Counter(b.cubicle_id for b in live)
    w_load = Counter(b.worker_id for b in live)
    slots: list[Slot] = []
    cur = datetime.combine(day, open_t)
    delta = timedelta(minutes=duration_min)
    while cur + delta <= day_end:
        end = cur + delta
        if cur >= now:  # fecha/hora no pasada
            free_c = [c for c in cands_c if not _busy(booked, "cubicle_id", c.id, cur, end)]
            free_w = [
                w for w in cands_w
                if (sch := w.schedule.get(day.weekday()))
                and sch[0] <= cur.time() and end.time() <= sch[1]
                and not _busy(booked, "worker_id", w.id, cur, end)
            ]
            if free_c and free_w:
                c = min(free_c, key=lambda x: (c_load[x.id], x.order, x.id))
                w = min(free_w, key=lambda x: (w_load[x.id], x.order, x.id))
                slots.append(Slot(cur, end, c.id, w.id))
        cur += timedelta(minutes=step_min)
    return slots


def client_has_conflict(booked: list[Booked], client_id: int, s: datetime, e: datetime) -> bool:
    """Validación 'mismo cliente simultáneo' antes de confirmar."""
    return any(
        b.client_id == client_id and b.status not in INACTIVE_STATUSES
        and _overlap(s, e, b.start_at, b.end_at)
        for b in booked
    )