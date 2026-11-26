"""Orquesta BD + servicio puro de disponibilidad. Errores = 409 con code/step para el wizard."""
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app import models as m
from app.models import Status
from app.repositories import CubicleRepo, WorkerRepo
from app.repositories.base import AuditService, snapshot
from app.services import availability as av
from app.services.bcv import rate_for

ACTIVE = (Status.programada, Status.confirmada)
ALLOWED = {
    Status.programada: {Status.confirmada, Status.cancelada, Status.reagendada},
    Status.confirmada: {Status.atendida, Status.no_asistio, Status.cancelada},
    Status.no_asistio: {Status.reagendada},
}


def fail(code: str, message: str, step: str | None = None, status: int = 409, **extra):
    raise HTTPException(status, detail={"code": code, "message": message, "step": step, **extra})


async def _setting(session, key, default):
    s = await session.get(m.Setting, key)
    return s.value if s else default


async def business_hours(session) -> tuple[time, time]:
    v = await _setting(session, "business_hours", {"open": "09:00", "close": "18:00"})
    return time.fromisoformat(v["open"]), time.fromisoformat(v["close"])


async def availability(session: AsyncSession, day: date, duration: int, worker_id=None,
                       cubicle_id=None, now: datetime | None = None,
                       exclude_id: int | None = None) -> list[av.Slot]:
    cubs = [av.Cubicle(c.id, c.order, c.active) for c in await session.scalars(select(m.Cubicle))]
    wks = [av.Worker(w.id, {int(k): (time.fromisoformat(a), time.fromisoformat(b))
                            for k, (a, b) in (w.work_schedule or {}).items()}, w.order, w.active)
           for w in await session.scalars(select(m.Worker))]
    d0, d1 = datetime.combine(day, time.min), datetime.combine(day, time.max)
    stmt = select(m.Appointment).where(m.Appointment.start_at < d1, m.Appointment.end_at > d0,
                                       m.Appointment.status.in_(ACTIVE))
    if exclude_id:  # reasignación: la propia cita no cuenta como ocupación
        stmt = stmt.where(m.Appointment.id != exclude_id)
    rows = await session.scalars(stmt)
    booked = [av.Booked(a.start_at, a.end_at, a.cubicle_id, a.worker_id, a.client_id, a.status.value)
              for a in rows]
    step = (await _setting(session, "slot_step_min", {"v": 30}))["v"]
    return av.compute_availability(day, duration, await business_hours(session), cubs, wks, booked,
                                   now or datetime.now(), step, worker_id, cubicle_id)


async def nearby_dates(session, around: date, duration: int, n=3, **kw) -> list[date]:
    found = []
    for off in range(1, 15):
        for d in (around + timedelta(days=off), around - timedelta(days=off)):
            if d >= date.today() and await availability(session, d, duration, **kw):
                found.append(d)
    return sorted(found, key=lambda d: abs((d - around).days))[:n]


async def _pricing(session, zone_ids, combo_id):
    if bool(zone_ids) == bool(combo_id):
        fail("zones_required", "Elige zonas individuales o un combo (no ambos).", "zones", 422)
    if combo_id:
        c = await session.get(m.Combo, combo_id)
        if not c or not c.active:
            fail("combo_invalid", "Combo no disponible.", "zones", 422)
        return c.total_duration_min, c.total_price_usd, list(c.zones)
    zs = [await session.get(m.BodyZone, z) for z in zone_ids]
    if any(z is None or not z.active for z in zs):
        fail("zone_invalid", "Alguna zona no está disponible.", "zones", 422)
    return sum(z.base_duration_min for z in zs), sum((z.base_price_usd for z in zs), Decimal(0)), zs


async def _log_status(session, appt, frm, to, user, reason=None):
    session.add(m.AppointmentStatusHistory(appointment_id=appt.id, from_status=frm.value if frm else None,
                                           to_status=to.value, changed_by=user.id, reason=reason))


async def create_appointment(session, audit: AuditService, user, *, client_id, start_at, duration,
                             price_usd, zones, combo_id, worker_id, cubicle_id, phase=None,
                             session_number=None, observations=None, original_id=None) -> m.Appointment:
    if not await session.get(m.Client, client_id):
        fail("client_not_found", "Cliente no encontrado.", "client", 404)
    slots = await availability(session, start_at.date(), duration, worker_id, cubicle_id)
    slot = next((s for s in slots if s.start_at == start_at), None)
    if not slot:  # solapamiento, horario, fecha pasada o recurso inactivo
        near = [d.isoformat() for d in await nearby_dates(session, start_at.date(), duration,
                                                          worker_id=worker_id, cubicle_id=cubicle_id)]
        fail("slot_unavailable", "Esa hora ya no está disponible.", "datetime", nearby_dates=near)
    end_at = start_at + timedelta(minutes=duration)
    same_day = await session.scalars(select(m.Appointment).where(
        m.Appointment.client_id == client_id, m.Appointment.status.in_(ACTIVE),
        m.Appointment.start_at < end_at, m.Appointment.end_at > start_at))
    if same_day.first():
        fail("client_busy", "El cliente ya tiene una cita en ese horario.", "datetime")
    rate = await rate_for(session, start_at.date())
    if not rate:
        fail("no_bcv_rate", "No hay tasa BCV; un admin debe cargarla manualmente.", "confirm")
    appt = m.Appointment(client_id=client_id, worker_id=slot.worker_id, cubicle_id=slot.cubicle_id,
                         start_at=start_at, end_at=end_at, duration_min=duration, status=Status.programada,
                         combo_id=combo_id, zones=zones, price_usd=price_usd, bcv_rate=rate.rate,
                         price_bs=(price_usd * rate.rate).quantize(Decimal("0.01")),
                         original_appointment_id=original_id, observations=observations,
                         phase=phase, session_number=session_number)
    session.add(appt)
    await session.flush()
    await _log_status(session, appt, None, Status.programada, user)
    audit.record("appointments", appt.id, "create", None, snapshot(appt))
    return appt


async def create_from_input(session, audit, user, body) -> m.Appointment:
    duration, price, zones = await _pricing(session, body.zone_ids, body.combo_id)
    return await create_appointment(session, audit, user, client_id=body.client_id, start_at=body.start_at,
                                    duration=duration, price_usd=price, zones=zones, combo_id=body.combo_id,
                                    worker_id=body.worker_id, cubicle_id=body.cubicle_id, phase=body.phase,
                                    session_number=body.session_number, observations=body.observations)


async def change_status(session, audit, user, appt, to: Status, reason=None):
    if to not in ALLOWED.get(appt.status, set()):
        fail("bad_transition", f"No se puede pasar de {appt.status.value} a {to.value}.", None, 409)
    before, frm = snapshot(appt), appt.status
    appt.status = to
    await session.flush()
    await _log_status(session, appt, frm, to, user, reason)
    audit.record("appointments", appt.id, "status", before, snapshot(appt))


async def no_show_and_link(session, audit, user, appt, body) -> m.Appointment:
    """Original se conserva (No asistió -> Reagendada); nace una nueva Programada enlazada (RN-04)."""
    if appt.status == Status.programada:
        await change_status(session, audit, user, appt, Status.confirmada, "implícita")
    await change_status(session, audit, user, appt, Status.no_asistio, body.reason)
    child = await create_appointment(
        session, audit, user, client_id=appt.client_id, start_at=body.new_start_at, duration=appt.duration_min,
        price_usd=appt.price_usd, zones=list(appt.zones), combo_id=appt.combo_id, worker_id=body.worker_id,
        cubicle_id=body.cubicle_id, phase=body.phase, session_number=body.session_number,
        original_id=appt.id)  # si falla, la transacción entera se revierte
    await change_status(session, audit, user, appt, Status.reagendada, f"→ cita {child.id}")
    return child


async def future_active_count(session, key: str, rid: int) -> int:
    rows = await session.scalars(select(m.Appointment.id).where(
        getattr(m.Appointment, key) == rid, m.Appointment.status.in_(ACTIVE),
        m.Appointment.start_at >= datetime.now()))
    return len(rows.all())


async def serialize(session, appts: list[m.Appointment]) -> list[dict]:
    ids = [a.id for a in appts]
    kids = {}
    if ids:
        for k in await session.scalars(select(m.Appointment).where(m.Appointment.original_appointment_id.in_(ids))):
            kids[k.original_appointment_id] = k
    out = []
    for a in appts:
        c = await session.get(m.Client, a.client_id)
        ch = kids.get(a.id)
        out.append({
            "id": a.id, "client_id": a.client_id, "client_name": c.full_name, "client_phone": c.phone,
            "worker_id": a.worker_id, "cubicle_id": a.cubicle_id, "start_at": a.start_at, "end_at": a.end_at,
            "duration_min": a.duration_min, "status": a.status.value, "zones": [z.name for z in a.zones],
            "combo_id": a.combo_id, "price_usd": a.price_usd, "bcv_rate": a.bcv_rate, "price_bs": a.price_bs,
            "phase": a.phase, "session_number": a.session_number, "observations": a.observations,
            "original_appointment_id": a.original_appointment_id,
            "rescheduled_to": {"id": ch.id, "start_at": ch.start_at} if ch else None})  # ↳ Reagendada → fecha
    return out
