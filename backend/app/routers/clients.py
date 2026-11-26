from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from app import models as m, schemas
from app.db import get_session
from app.deps import audit, require_staff
from app.repositories import ClientRepo
from app.repositories.base import AuditService
from app.services.booking import serialize

router = APIRouter(prefix="/clients", tags=["clients"], dependencies=[Depends(require_staff)])


def dump(c: m.Client) -> dict:
    return {"id": c.id, "full_name": c.full_name, "national_id": c.national_id, "phone": c.phone,
            "allergies_conditions": c.allergies_conditions, "notes": c.notes}


async def _dup_check(s, national_id: str, exclude_id: int | None = None):
    q = select(m.Client).where(m.Client.national_id == national_id.upper())
    other = await s.scalar(q)
    if other and other.id != exclude_id:  # no es callejón sin salida: devuelve client_id para "Ver ficha"
        raise HTTPException(409, detail={"code": "duplicate_national_id", "client_id": other.id,
                                         "message": "Ya existe un cliente con esa cédula."})


@router.get("")
async def search(q: str = "", s: AsyncSession = Depends(get_session)):
    stmt = select(m.Client).order_by(m.Client.full_name).limit(25)
    if q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(m.Client.national_id.ilike(like), m.Client.full_name.ilike(like)))
    out = []
    for c in await s.scalars(stmt):
        total, last = (await s.execute(select(func.count(m.Appointment.id), func.max(m.Appointment.start_at))
                                       .where(m.Appointment.client_id == c.id))).one()
        out.append({**dump(c), "total_appointments": total, "last_appointment": last})
    return out


@router.post("", status_code=201)
async def create(body: schemas.ClientIn, s: AsyncSession = Depends(get_session), a: AuditService = Depends(audit)):
    data = {**body.model_dump(), "national_id": body.national_id.upper()}
    await _dup_check(s, data["national_id"])
    return dump(await ClientRepo(s, a).add(m.Client(**data)))


@router.put("/{cid}")
async def update(cid: int, body: schemas.ClientIn, s: AsyncSession = Depends(get_session),
                 a: AuditService = Depends(audit)):
    repo = ClientRepo(s, a)
    obj = await repo.get(cid)
    if not obj:
        raise HTTPException(404, "Cliente no encontrado")
    data = {**body.model_dump(), "national_id": body.national_id.upper()}
    await _dup_check(s, data["national_id"], cid)
    return dump(await repo.update(obj, **data))


@router.get("/{cid}")
async def detail(cid: int, s: AsyncSession = Depends(get_session)):
    c = await s.get(m.Client, cid)
    if not c:
        raise HTTPException(404, "Cliente no encontrado")
    appts = list(await s.scalars(select(m.Appointment).where(m.Appointment.client_id == cid)
                                 .order_by(m.Appointment.start_at.desc())))
    return {**dump(c), "total_appointments": len(appts), "history": await serialize(s, appts)}
