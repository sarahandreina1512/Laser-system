from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app import schemas
from app.db import get_session
from app.deps import audit, require_admin, require_staff
from app.repositories.base import AuditService
from app.services import bcv

router = APIRouter(prefix="/bcv", tags=["bcv"])


@router.get("/current")
async def current(s: AsyncSession = Depends(get_session), _=Depends(require_staff)):
    today = date.today()
    row = await bcv.rate_for(s, today)
    if not row or row.date != today:  # intentar API oficial; si falla, queda la última conocida
        remote = await bcv.fetch_remote()
        if remote:
            row = await bcv.upsert_rate(s, today, remote, "api")
    if not row:
        raise HTTPException(404, detail={"code": "no_bcv_rate", "message": "Sin tasa: carga manual (admin)."})
    return {"date": row.date, "rate": row.rate, "source": row.source, "stale": row.date != today}


@router.post("/manual", status_code=201)
async def manual(body: schemas.ManualRateIn, s: AsyncSession = Depends(get_session),
                 a: AuditService = Depends(audit), _=Depends(require_admin)):
    row = await bcv.upsert_rate(s, date.today(), body.rate, "manual")
    a.record("bcv_rates", row.id, "manual", None, {"rate": str(row.rate)})
    return {"date": row.date, "rate": row.rate, "source": row.source}
