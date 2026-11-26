"""Zonas, combos, opciones y ajustes: lectura staff, escritura admin (RN-03)."""
from datetime import time
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app import models as m, schemas
from app.db import get_session
from app.deps import audit, require_admin, require_staff
from app.models import Role, User
from app.repositories.base import AuditService
from app.services.booking import business_hours

router = APIRouter(tags=["catalog"])


def _zone(z: m.BodyZone) -> dict:
    return {"id": z.id, "name": z.name, "base_duration_min": z.base_duration_min,
            "base_price_usd": z.base_price_usd, "active": z.active}


def _combo(c: m.Combo) -> dict:
    return {"id": c.id, "name": c.name, "zone_ids": [z.id for z in c.zones], "active": c.active,
            "total_duration_min": c.total_duration_min, "total_price_usd": c.total_price_usd}


def _only_admin(user: User, include_inactive: bool):
    if include_inactive and user.role != Role.admin:
        raise HTTPException(403, "Sin permiso para este recurso")


@router.get("/zones")
async def zones(include_inactive: bool = False, s: AsyncSession = Depends(get_session), user: User = Depends(require_staff)):
    _only_admin(user, include_inactive)
    q = select(m.BodyZone) if include_inactive else select(m.BodyZone).where(m.BodyZone.active)
    return [_zone(z) for z in await s.scalars(q.order_by(m.BodyZone.name))]


@router.post("/zones", status_code=201, dependencies=[Depends(require_admin)])
async def add_zone(body: schemas.ZoneIn, s: AsyncSession = Depends(get_session), a: AuditService = Depends(audit)):
    z = m.BodyZone(**body.model_dump())
    s.add(z)
    await s.flush()
    a.record("body_zones", z.id, "create", None, body.model_dump(mode="json"))
    return _zone(z)


@router.put("/zones/{zid}", dependencies=[Depends(require_admin)])
async def update_zone(zid: int, body: schemas.ZoneIn, s: AsyncSession = Depends(get_session), a: AuditService = Depends(audit)):
    z = await s.get(m.BodyZone, zid)
    if not z:
        raise HTTPException(404, "Zona no encontrada")
    before = _zone(z)  # las citas ya creadas conservan su duración y precio
    for k, v in body.model_dump().items():
        setattr(z, k, v)
    await s.flush()
    a.record("body_zones", z.id, "update", {k: str(v) for k, v in before.items()}, body.model_dump(mode="json"))
    return _zone(z)


@router.get("/combos")
async def combos(include_inactive: bool = False, s: AsyncSession = Depends(get_session), user: User = Depends(require_staff)):
    _only_admin(user, include_inactive)
    q = select(m.Combo) if include_inactive else select(m.Combo).where(m.Combo.active)
    return [_combo(c) for c in await s.scalars(q.order_by(m.Combo.name))]


async def _fill_combo(s: AsyncSession, c: m.Combo, body: schemas.ComboIn) -> None:
    zs = [await s.get(m.BodyZone, i) for i in body.zone_ids]
    if any(z is None for z in zs):
        raise HTTPException(422, "Zona inexistente")
    c.name, c.zones, c.active = body.name, zs, body.active
    c.total_duration_min = body.total_duration_min or sum(z.base_duration_min for z in zs)
    c.total_price_usd = body.total_price_usd if body.total_price_usd is not None else sum((z.base_price_usd for z in zs), Decimal(0))


@router.post("/combos", status_code=201, dependencies=[Depends(require_admin)])
async def add_combo(body: schemas.ComboIn, s: AsyncSession = Depends(get_session), a: AuditService = Depends(audit)):
    c = m.Combo()
    await _fill_combo(s, c, body)
    s.add(c)
    await s.flush()
    a.record("combos", c.id, "create", None, {"name": c.name, "zone_ids": body.zone_ids})
    return _combo(c)


@router.put("/combos/{cid}", dependencies=[Depends(require_admin)])
async def update_combo(cid: int, body: schemas.ComboIn, s: AsyncSession = Depends(get_session), a: AuditService = Depends(audit)):
    c = await s.get(m.Combo, cid)
    if not c:
        raise HTTPException(404, "Combo no encontrado")
    before = {"name": c.name, "zone_ids": [z.id for z in c.zones], "active": c.active}
    await _fill_combo(s, c, body)
    await s.flush()
    a.record("combos", c.id, "update", before, {"name": c.name, "zone_ids": body.zone_ids, "active": c.active})
    return _combo(c)


@router.get("/options", dependencies=[Depends(require_staff)])
async def options(s: AsyncSession = Depends(get_session)):
    """Recursos para filtros y 'Asignar manualmente' (el trabajador no ve los módulos de gestión)."""
    cubs = await s.scalars(select(m.Cubicle).where(m.Cubicle.active).order_by(m.Cubicle.order))
    wks = await s.scalars(select(m.Worker).where(m.Worker.active).order_by(m.Worker.order))
    return {"cubicles": [{"id": c.id, "name": c.name_or_number} for c in cubs],
            "workers": [{"id": w.id, "name": w.name} for w in wks]}


@router.get("/settings", dependencies=[Depends(require_admin)])
async def get_settings(s: AsyncSession = Depends(get_session)):
    o, c = await business_hours(s)
    step = await s.get(m.Setting, "slot_step_min")
    return {"open": o.strftime("%H:%M"), "close": c.strftime("%H:%M"), "slot_step_min": step.value["v"] if step else 30}


@router.put("/settings", dependencies=[Depends(require_admin)])
async def put_settings(body: schemas.SettingsIn, s: AsyncSession = Depends(get_session), a: AuditService = Depends(audit)):
    time.fromisoformat(body.open)
    for key, val in (("business_hours", {"open": body.open, "close": body.close}), ("slot_step_min", {"v": body.slot_step_min})):
        row = await s.get(m.Setting, key)
        before = row.value if row else None
        if row:
            row.value = val
        else:
            s.add(m.Setting(key=key, value=val))
        a.record("settings", None, "update", {"key": key, "value": before}, {"key": key, "value": val})
    await s.flush()
    return body.model_dump()
