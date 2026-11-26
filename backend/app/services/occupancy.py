"""Saturación de cubículos por día y turno (servicio puro, sin BD)."""
from datetime import date, datetime, time

NOON = time(13)  # corte mañana / tarde


def _minutes(a0: datetime, a1: datetime, b0: datetime, b1: datetime) -> float:
    return max(0.0, (min(a1, b1) - max(a0, b0)).total_seconds() / 60)


def occupancy(day: date, intervals: list[tuple[datetime, datetime]], open_t: time, close_t: time,
              resources: int) -> dict:
    """Capacidad = recursos simultáneos posibles (min(cubículos, trabajadoras del día)) × minutos abiertos.
    `pct` es None cuando no hay capacidad (día cerrado o sin personal)."""
    o, c, n = (datetime.combine(day, t) for t in (open_t, close_t, NOON))
    windows = {"total": (o, c), "morning": (o, min(n, c)), "afternoon": (max(n, o), c)}
    out = {}
    for key, (w0, w1) in windows.items():
        cap = max(0.0, (w1 - w0).total_seconds() / 60) * resources
        used = sum(_minutes(w0, w1, s, e) for s, e in intervals)
        out[key] = {"booked_min": round(used), "capacity_min": round(cap),
                    "pct": None if cap <= 0 else min(100, round(used * 100 / cap))}
    return out