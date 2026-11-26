"""Capa de acceso a datos: la lógica de negocio solo ve repositorios (portabilidad)."""
from typing import Any, Generic, TypeVar
from sqlalchemy import inspect, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import AuditLog

T = TypeVar("T")


def snapshot(obj: Any) -> dict:
    # Solo atributos ya cargados: evita lazy-load async sobre columnas expiradas (server_default/onupdate)
    loaded = inspect(obj).dict
    return {c.key: str(loaded[c.key]) for c in inspect(obj).mapper.column_attrs
            if c.key in loaded and c.key != "password_hash"}


class AuditService:
    def __init__(self, session: AsyncSession, user_id: int | None):
        self.session, self.user_id = session, user_id

    def record(self, entity: str, entity_id: int | None, action: str,
               before: dict | None = None, after: dict | None = None) -> None:
        if entity != "auth":
            self.session.info.setdefault("events", set()).add(entity)  # lo recoge commit_and_notify
        self.session.add(AuditLog(user_id=self.user_id, entity=entity, entity_id=entity_id,
                                  action=action, before=before, after=after))


class Repository(Generic[T]):
    """RN-08: toda escritura genera audit_log en la misma transacción."""
    model: type[T]

    def __init__(self, session: AsyncSession, audit: AuditService):
        self.session, self.audit = session, audit

    async def get(self, id_: int) -> T | None:
        return await self.session.get(self.model, id_)

    async def list(self, *where: Any, order_by: Any = None) -> list[T]:
        q = select(self.model).where(*where)
        if order_by is not None:
            q = q.order_by(*(order_by if isinstance(order_by, (tuple, list)) else (order_by,)))
        return list((await self.session.scalars(q)).all())

    async def add(self, obj: T) -> T:
        self.session.add(obj)
        await self.session.flush()
        self.audit.record(self.model.__tablename__, obj.id, "create", None, snapshot(obj))
        return obj

    async def update(self, obj: T, **changes: Any) -> T:
        before = snapshot(obj)
        for k, v in changes.items():
            setattr(obj, k, v)
        await self.session.flush()
        self.audit.record(self.model.__tablename__, obj.id, "update", before, snapshot(obj))
        return obj
