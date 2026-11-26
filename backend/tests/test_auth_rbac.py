import pytest
from sqlalchemy import select
from app.models import AuditLog

pytestmark = pytest.mark.asyncio


async def login(c, u, p):
    return await c.post("/auth/login", data={"username": u, "password": p})


async def test_login_and_me(client):
    r = await login(client, "admin", "admin123")
    assert r.status_code == 200 and r.json()["role"] == "admin"
    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {r.json()['access_token']}"})
    assert me.json()["username"] == "admin"


async def test_failed_login_is_audited(client):
    assert (await login(client, "admin", "mala")).status_code == 401
    async with client.session_factory() as s:
        rows = (await s.scalars(select(AuditLog).where(AuditLog.action == "login_failed"))).all()
    assert len(rows) == 1


async def test_worker_gets_403_on_cubicles_admin_ok(client):
    w = (await login(client, "ana", "ana12345")).json()["access_token"]
    a = (await login(client, "admin", "admin123")).json()["access_token"]
    assert (await client.get("/cubicles", headers={"Authorization": f"Bearer {w}"})).status_code == 403
    assert (await client.get("/cubicles", headers={"Authorization": f"Bearer {a}"})).status_code == 200
    assert (await client.get("/cubicles")).status_code == 401


async def test_refresh_rejects_access_token(client):
    t = (await login(client, "admin", "admin123")).json()
    assert (await client.post("/auth/refresh", json={"refresh_token": t["refresh_token"]})).status_code == 200
    assert (await client.post("/auth/refresh", json={"refresh_token": t["access_token"]})).status_code == 401
