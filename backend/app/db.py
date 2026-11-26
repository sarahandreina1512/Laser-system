from collections.abc import AsyncIterator
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from app.config import settings
from app.realtime import hub

engine = create_async_engine(settings.DATABASE_URL)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def commit_and_notify(session: AsyncSession) -> None:
    """Commit y, solo después, aviso en vivo: los clientes nunca refrescan datos sin confirmar."""
    await session.commit()
    events = session.info.pop("events", None)
    if events:
        await hub.broadcast({"type": "changed", "entities": sorted(events)})


async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        try:
            yield session
            await commit_and_notify(session)  # una transacción por petición (datos + audit_log)
        except Exception:
            await session.rollback()
            raise
