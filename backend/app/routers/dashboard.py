from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app import models as m
from app.db import get_session
from app.deps import require_staff
from app.services.booking import LOADED, business_hours
from app.services.occupancy import occupancy

router = APIRouter(prefix="/dashboard", tags=["dashboard"], dependencies=[Depends(require_staff)])


@router.get("/week")
async def week(start: date | None = None, s: AsyncSession = Depends(get_session)):
    """Ocupación de lunes a domingo (por defecto, la semana actual): total, mañana y tarde."""
    today = date.today()
    monday = start or today - timedelta(days=today.weekday())
    open_t, close_t = await business_hours(s)
    n_cub = len((await s.scalars(select(m.Cubicle.id).where(m.Cubicle.active))).all())
    workers = list(await s.scalars(select(m.Worker).where(m.Worker.active)))
    t0 = datetime.combine(monday, datetime.min.time())
    rows = list(await s.scalars(select(m.Appointment).where(
        m.Appointment.start_at >= t0, m.Appointment.start_at < t0 + timedelta(days=7), m.Appointment.status.in_(LOADED))))
    days = []
    for i in range(7):
        d = monday + timedelta(days=i)
        working = sum(1 for w in workers if str(d.weekday()) in (w.work_schedule or {}))
        mine = [(a.start_at, a.end_at) for a in rows if a.start_at.date() == d]
        days.append({"date": d.isoformat(), "weekday": d.weekday(), "resources": min(n_cub, working),
                     "appointments": len(mine), **occupancy(d, mine, open_t, close_t, min(n_cub, working))})
    return {"start": monday.isoformat(), "days": days}