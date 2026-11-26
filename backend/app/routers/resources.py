"""Cubículos y trabajadores (solo admin): mismo patrón, RN-07 y soft-delete."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app import models as m, schemas
from app.db import get_session
from app.deps import audit, require_admin
from app.repositories import CubicleRepo, WorkerRepo
from app.repositories.base import AuditService
from app.services.booking import future_active_count


def _blocked(kind: str, key: str, rid: int, n: int):
    return HTTPException(409, detail={
        "code": "has_future_appointments", "count": n,
        "message": f"Hay {n} cita(s) futura(s) con este recurso. Reasígnalas primero.",
        "affected_url": f"/appointments?{key}={rid}&upcoming=true"})  # enlace "Ver citas afectadas"


def build(prefix: str, tag: str, Repo, Model, In, key: str, dump):
    r = APIRouter(prefix=prefix, tags=[tag], dependencies=[Depends(require_admin)])

    @r.get("")
    async def list_(s: AsyncSession = Depends(get_session), a: AuditService = Depends(audit)):
        return [dump(x) for x in await Repo(s, a).list(order_by=(Model.order, Model.id))]

    @r.post("", status_code=201)
    async def create(body: In, s: AsyncSession = Depends(get_session), a: AuditService = Depends(audit)):
        return dump(await Repo(s, a).add(Model(**body.model_dump())))

    @r.put("/{rid}")
    async def update(rid: int, body: In, s: AsyncSession = Depends(get_session), a: AuditService = Depends(audit)):
        repo, obj = Repo(s, a), await Repo(s, a).get(rid)
        if not obj:
            raise HTTPException(404, "No encontrado")
        if obj.active and not body.active and (n := await future_active_count(s, key, rid)):
            raise _blocked(tag, key, rid, n)
        return dump(await repo.update(obj, **body.model_dump()))

    @r.delete("/{rid}", status_code=204)
    async def delete(rid: int, s: AsyncSession = Depends(get_session), a: AuditService = Depends(audit)):
        repo, obj = Repo(s, a), await Repo(s, a).get(rid)
        if not obj:
            raise HTTPException(404, "No encontrado")
        if n := await future_active_count(s, key, rid):
            raise _blocked(tag, key, rid, n)
        used = await s.scalar(select(m.Appointment.id).where(getattr(m.Appointment, key) == rid).limit(1))
        if used:  # nunca destruir historial: se inactiva
            await repo.update(obj, active=False)
        else:
            a.record(Model.__tablename__, rid, "delete", {"id": rid}, None)
            await s.delete(obj)

    return r


cubicles = build("/cubicles", "cubicles", CubicleRepo, m.Cubicle, schemas.CubicleIn, "cubicle_id",
                 lambda c: {"id": c.id, "name_or_number": c.name_or_number, "active": c.active,
                            "order": c.order, "capacity": c.capacity})
workers = build("/workers", "workers", WorkerRepo, m.Worker, schemas.WorkerIn, "worker_id",
                lambda w: {"id": w.id, "name": w.name, "role": w.role, "active": w.active,
                           "order": w.order, "work_schedule": w.work_schedule})
