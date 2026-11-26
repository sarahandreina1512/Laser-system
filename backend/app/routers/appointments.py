import calendar
from datetime import date, datetime
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app import models as m, schemas
from app.db import get_session
from app.deps import audit, require_staff
from app.models import Role, Status, User
from app.repositories.base import AuditService
from app.services import booking as bk
from app.services.frequency import DEFAULT_INITIAL_SESSIONS, suggest_next

router = APIRouter(prefix="/appointments", tags=["appointments"])


async def _get(s, aid) -> m.Appointment:
    a = await s.get(m.Appointment, aid)
    if not a:
        raise HTTPException(404, "Cita no encontrada")
    return a


@router.get("/availability")
async def availability(date_: date = Query(alias="date"), duration: int = Query(gt=0), worker_id: int | None = None,
                       cubicle_id: int | None = None, s: AsyncSession = Depends(get_session),
                       _: User = Depends(require_staff)):
    slots = await bk.availability(s, date_, duration, worker_id, cubicle_id)
    times = sorted({sl.start_at for sl in slots})
    near = [] if times else [d.isoformat() for d in await bk.nearby_dates(
        s, date_, duration, worker_id=worker_id, cubicle_id=cubicle_id)]
    return {"date": date_, "slots": [{"start_at": t} for t in times], "nearby_dates": near}


@router.get("/availability/month")
async def month_availability(month: str = Query(pattern=r"^\d{4}-\d{2}$"), duration: int = Query(gt=0),
                             s: AsyncSession = Depends(get_session), _: User = Depends(require_staff)):
    y, mth = map(int, month.split("-"))
    days = [date(y, mth, d) for d in range(1, calendar.monthrange(y, mth)[1] + 1)]
    ok = [d.isoformat() for d in days if d >= date.today() and await bk.availability(s, d, duration)]
    return {"month": month, "available_dates": ok}


@router.get("")
async def list_(date_: date | None = Query(None, alias="date"), date_from: date | None = None,
                date_to: date | None = None, client_id: int | None = None,
                worker_id: int | None = None, cubicle_id: int | None = None, status: list[Status] = Query([]),
                upcoming: bool = False, s: AsyncSession = Depends(get_session), _: User = Depends(require_staff)):
    q = select(m.Appointment).order_by(m.Appointment.start_at)
    if date_:
        q = q.where(m.Appointment.start_at >= datetime.combine(date_, datetime.min.time()),
                    m.Appointment.start_at <= datetime.combine(date_, datetime.max.time()))
    if date_from:
        q = q.where(m.Appointment.start_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        q = q.where(m.Appointment.start_at <= datetime.combine(date_to, datetime.max.time()))
    for col, v in (("client_id", client_id), ("worker_id", worker_id), ("cubicle_id", cubicle_id)):
        if v is not None:
            q = q.where(getattr(m.Appointment, col) == v)
    if status:
        q = q.where(m.Appointment.status.in_(status))
    if upcoming:  # "Ver citas afectadas"
        q = q.where(m.Appointment.start_at >= datetime.now(), m.Appointment.status.in_(bk.ACTIVE))
    return await bk.serialize(s, list(await s.scalars(q)))


@router.post("", status_code=201)
async def create(body: schemas.AppointmentIn, s: AsyncSession = Depends(get_session),
                 a: AuditService = Depends(audit), user: User = Depends(require_staff)):
    appt = await bk.create_from_input(s, a, user, body)
    return (await bk.serialize(s, [appt]))[0]


@router.post("/{aid}/confirm")
async def confirm(aid: int, s: AsyncSession = Depends(get_session), a: AuditService = Depends(audit),
                  user: User = Depends(require_staff)):
    appt = await _get(s, aid)
    await bk.change_status(s, a, user, appt, Status.confirmada)
    return (await bk.serialize(s, [appt]))[0]


@router.post("/{aid}/cancel")
async def cancel(aid: int, s: AsyncSession = Depends(get_session), a: AuditService = Depends(audit),
                 user: User = Depends(require_staff)):
    appt = await _get(s, aid)
    await bk.change_status(s, a, user, appt, Status.cancelada)
    return (await bk.serialize(s, [appt]))[0]


@router.post("/{aid}/attend")
async def attend(aid: int, body: schemas.AttendIn, s: AsyncSession = Depends(get_session),
                 a: AuditService = Depends(audit), user: User = Depends(require_staff)):
    if body.bcv_rate is not None and user.role != Role.admin:
        raise HTTPException(403, "Solo un administrador puede editar la tasa BCV")
    appt = await _get(s, aid)
    if appt.status == Status.programada:  # "Asistió" directo desde Gestión del día
        await bk.change_status(s, a, user, appt, Status.confirmada, "implícita")
    await bk.change_status(s, a, user, appt, Status.atendida)
    price = body.price_usd if body.price_usd is not None else appt.price_usd
    rate = body.bcv_rate if body.bcv_rate is not None else appt.bcv_rate
    before = {"price_usd": str(appt.price_usd), "bcv_rate": str(appt.bcv_rate)}
    appt.price_usd, appt.bcv_rate = price, rate
    appt.price_bs = (price * rate).quantize(Decimal("0.01"))
    if body.observations:
        appt.observations = body.observations
    a.record("appointments", appt.id, "attend", before, {"price_usd": str(price), "bcv_rate": str(rate)})
    return (await bk.serialize(s, [appt]))[0]


@router.get("/{aid}/next-suggestion")
async def next_suggestion(aid: int, phase: str, session_number: int = Query(ge=1),
                          initial_sessions: int = DEFAULT_INITIAL_SESSIONS, s: AsyncSession = Depends(get_session),
                          _: User = Depends(require_staff)):
    if phase not in schemas.PHASES:
        raise HTTPException(422, "Fase inválida")
    appt = await _get(s, aid)
    sg = suggest_next(appt.start_at.date(), phase, session_number, initial_sessions)
    slots = await bk.availability(s, sg.next_date, appt.duration_min)
    times = sorted({sl.start_at for sl in slots})
    near = [] if times else [d.isoformat() for d in await bk.nearby_dates(s, sg.next_date, appt.duration_min)]
    return {"suggested_date": sg.next_date, "phase": sg.phase, "session_number": sg.session_number,
            "slots": times, "nearby_dates": near}


@router.post("/{aid}/no-show", status_code=201)
async def no_show(aid: int, body: schemas.NoShowIn, s: AsyncSession = Depends(get_session),
                  a: AuditService = Depends(audit), user: User = Depends(require_staff)):
    appt = await _get(s, aid)
    child = await bk.no_show_and_link(s, a, user, appt, body)
    return {"original": (await bk.serialize(s, [appt]))[0], "new": (await bk.serialize(s, [child]))[0]}


@router.post("/{aid}/reassign")
async def reassign(aid: int, body: schemas.ReassignIn, s: AsyncSession = Depends(get_session),
                   a: AuditService = Depends(audit), _: User = Depends(require_staff)):
    """Mueve una cita activa a otro cubículo/trabajador (flujo 'Ver citas afectadas')."""
    appt = await _get(s, aid)
    if body.worker_id is None and body.cubicle_id is None:
        raise HTTPException(422, "Indica cubículo o trabajador")
    if appt.status not in bk.ACTIVE:
        bk.fail("bad_state", "Solo se reasignan citas Programadas o Confirmadas.")
    wid = body.worker_id or (appt.worker_id if body.cubicle_id else None)   # lo no indicado se conserva
    cid = body.cubicle_id or (appt.cubicle_id if body.worker_id else None)
    slots = await bk.availability(s, appt.start_at.date(), appt.duration_min, wid, cid,
                                  now=datetime.min, exclude_id=appt.id)
    slot = next((x for x in slots if x.start_at == appt.start_at), None)
    if not slot:
        bk.fail("slot_unavailable", "El recurso elegido no está libre en ese horario.")
    before = {"worker_id": appt.worker_id, "cubicle_id": appt.cubicle_id}
    appt.worker_id, appt.cubicle_id = slot.worker_id, slot.cubicle_id
    await s.flush()
    a.record("appointments", appt.id, "reassign", before, {"worker_id": appt.worker_id, "cubicle_id": appt.cubicle_id})
    return (await bk.serialize(s, [appt]))[0]
