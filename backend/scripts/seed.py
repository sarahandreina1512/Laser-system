"""Crea el primer admin (idempotente). Requiere la BD migrada: `alembic upgrade head`.
Uso: ADMIN_USER=... ADMIN_PASSWORD=... python -m scripts.seed   (o argumentos <usuario> <clave>)"""
import asyncio, os, sys
from sqlalchemy import select
from app import models as m
from app.db import SessionLocal
from app.security import hash_password


async def main(user: str, pwd: str) -> None:
    if len(pwd) < 8:
        sys.exit("La contraseña del admin debe tener al menos 8 caracteres")
    async with SessionLocal() as s:
        if not await s.scalar(select(m.User).where(m.User.username == user)):
            s.add(m.User(username=user, password_hash=hash_password(pwd), role=m.Role.admin))
        if not await s.get(m.Setting, "business_hours"):
            s.add(m.Setting(key="business_hours", value={"open": "09:00", "close": "18:00"}))
        await s.commit()

if __name__ == "__main__":
    u = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("ADMIN_USER")
    p = sys.argv[2] if len(sys.argv) > 2 else os.environ.get("ADMIN_PASSWORD")
    if not (u and p):
        sys.exit("Indica ADMIN_USER y ADMIN_PASSWORD")
    asyncio.run(main(u, p))
