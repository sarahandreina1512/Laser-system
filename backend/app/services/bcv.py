from datetime import date, datetime
from decimal import Decimal
import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings
from app.models import BcvRate


async def rate_for(session: AsyncSession, day: date) -> BcvRate | None:
    """Tasa del día o la más reciente anterior (el BCV no publica fines de semana)."""
    return await session.scalar(select(BcvRate).where(BcvRate.date <= day).order_by(BcvRate.date.desc()))


async def fetch_remote() -> Decimal | None:
    """Adaptador de la API oficial: ajustar las claves al proveedor real de BCV_API_URL."""
    if not settings.BCV_API_URL:
        return None
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            data = (await c.get(settings.BCV_API_URL)).json()
        for k in ("rate", "promedio", "usd"):
            if k in data and Decimal(str(data[k])) > 0:
                return Decimal(str(data[k]))
    except Exception:
        return None
    return None


async def upsert_rate(session: AsyncSession, day: date, rate: Decimal, source: str) -> BcvRate:
    row = await session.scalar(select(BcvRate).where(BcvRate.date == day))
    if row:
        row.rate, row.source = rate, source
    else:
        row = BcvRate(date=day, rate=rate, source=source)
        session.add(row)
    await session.flush()
    return row
