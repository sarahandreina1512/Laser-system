"""Datos de prueba para Playwright (BD SQLite desechable). Uso: python -m scripts.seed_e2e"""
import asyncio
from datetime import date
from decimal import Decimal
from app import models as m
from app.db import Base, SessionLocal, engine
from app.security import hash_password

ALL_DAYS = {str(d): ["00:00", "23:30"] for d in range(7)}


async def main() -> None:
    async with engine.begin() as c:
        await c.run_sync(Base.metadata.drop_all)
        await c.run_sync(Base.metadata.create_all)
    async with SessionLocal() as s:
        s.add_all([m.Worker(id=1, name="Ana Pérez", order=1, work_schedule=ALL_DAYS),
                   m.Worker(id=2, name="Luisa Rojas", order=2, work_schedule=ALL_DAYS),
                   m.Cubicle(id=1, name_or_number="Cubículo 1", order=1), m.Cubicle(id=2, name_or_number="Cubículo 2", order=2)])
        await s.flush()
        s.add_all([m.User(username="admin", password_hash=hash_password("admin1234"), role=m.Role.admin),
                   m.User(username="ana", password_hash=hash_password("ana12345"), role=m.Role.worker, worker_id=1),
                   m.Setting(key="business_hours", value={"open": "00:00", "close": "23:30"}),
                   m.BodyZone(name="Axilas", base_duration_min=15, base_price_usd=Decimal("20")),
                   m.BodyZone(name="Piernas", base_duration_min=45, base_price_usd=Decimal("60")),
                   m.BcvRate(date=date.today(), rate=Decimal("40.5"), source="manual"),
                   m.Client(full_name="María Gómez", national_id="V12345678", phone="04141234567"),
                   m.Client(full_name="Carla Díaz", national_id="V87654321", phone="04241234567")])
        await s.commit()

asyncio.run(main())
