"""Reagendamiento por frecuencia (4.10)."""
from dataclasses import dataclass
from datetime import date, timedelta
from dateutil.relativedelta import relativedelta

DEFAULT_INITIAL_SESSIONS = 8  # 8–10, ajustable por el trabajador


@dataclass(frozen=True)
class Suggestion:
    next_date: date
    phase: str
    session_number: int


def suggest_next(from_date: date, phase: str, session_number: int,
                 initial_sessions: int = DEFAULT_INITIAL_SESSIONS) -> Suggestion:
    if phase == "inicial":
        if session_number >= initial_sessions:  # cierra fase inicial -> Mantenimiento 1
            return Suggestion(from_date + relativedelta(months=2), "mantenimiento_1", 1)
        return Suggestion(from_date + timedelta(days=21), "inicial", session_number + 1)
    step = {"mantenimiento_1": relativedelta(months=2),
            "mantenimiento_2": relativedelta(months=6),
            "mantenimiento_3": relativedelta(years=1)}[phase]
    return Suggestion(from_date + step, phase, session_number + 1)
