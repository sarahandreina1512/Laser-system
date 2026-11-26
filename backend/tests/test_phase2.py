from datetime import datetime, timedelta
import pytest

pytestmark = pytest.mark.asyncio
DAY = (datetime.now() + timedelta(days=14)).replace(hour=10, minute=0, second=0, microsecond=0)
ALLDAYS = {str(d): ["09:00", "18:00"] for d in range(7)}


async def hdr(c, u, p):
    t = (await c.post("/auth/login", data={"username": u, "password": p})).json()["access_token"]
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture
async def env(client):
    A = await hdr(client, "admin", "admin123")
    W = await hdr(client, "ana", "ana12345")
    for i in (1, 2):
        await client.post("/cubicles", json={"name_or_number": f"C{i}", "order": i}, headers=A)
        await client.post("/workers", json={"name": f"Esteticista {i}", "order": i,
                                            "work_schedule": {d: v for d, v in ((int(k), v) for k, v in ALLDAYS.items())}}, headers=A)
    for n, mins, usd in (("Axilas", 15, 20), ("Piernas", 45, 60), ("Bikini", 30, 35)):
        await client.post("/zones", json={"name": n, "base_duration_min": mins, "base_price_usd": usd}, headers=A)
    await client.post("/bcv/manual", json={"rate": "40.5"}, headers=A)
    ids = []
    for i in range(4):
        r = await client.post("/clients", json={"full_name": f"Cliente {i}", "national_id": f"1234567{i}",
                                                "phone": "04141234567"}, headers=W)
        ids.append(r.json()["id"])
    return client, A, W, ids


def body(cid, start=DAY, zones=(1, 2, 3)):
    return {"client_id": cid, "start_at": start.isoformat(), "zone_ids": list(zones)}


async def test_three_zones_sum_duration_price_and_store_rate(env):
    c, A, W, ids = env
    r = await c.post("/appointments", json=body(ids[0]), headers=W)
    j = r.json()
    assert r.status_code == 201 and j["duration_min"] == 90 and float(j["price_usd"]) == 115
    assert float(j["bcv_rate"]) == 40.5 and float(j["price_bs"]) == 4657.5


async def test_two_resources_allow_two_simultaneous_never_three(env):
    c, A, W, ids = env
    assert (await c.post("/appointments", json=body(ids[0]), headers=W)).status_code == 201
    assert (await c.post("/appointments", json=body(ids[1]), headers=W)).status_code == 201
    r = await c.post("/appointments", json=body(ids[2]), headers=W)
    assert r.status_code == 409 and r.json()["detail"]["code"] == "slot_unavailable"
    assert r.json()["detail"]["step"] == "datetime"


async def test_same_client_cannot_overlap(env):
    c, A, W, ids = env
    await c.post("/appointments", json=body(ids[0]), headers=W)
    r = await c.post("/appointments", json=body(ids[0], DAY + timedelta(minutes=30)), headers=W)
    assert r.status_code == 409 and r.json()["detail"]["code"] == "client_busy"


async def test_block_deactivate_with_future_appointments(env):
    c, A, W, ids = env
    a = (await c.post("/appointments", json=body(ids[0]), headers=W)).json()
    cub = a["cubicle_id"]
    r = await c.put(f"/cubicles/{cub}", json={"name_or_number": "X", "active": False}, headers=A)
    assert r.status_code == 409 and r.json()["detail"]["count"] == 1
    assert "affected_url" in r.json()["detail"]
    assert (await c.delete(f"/cubicles/{cub}", headers=A)).status_code == 409
    await c.post(f"/appointments/{a['id']}/cancel", headers=W)
    assert (await c.put(f"/cubicles/{cub}", json={"name_or_number": "X", "active": False}, headers=A)).status_code == 200


async def test_no_show_creates_linked_appointment_21_days_later(env):
    c, A, W, ids = env
    a = (await c.post("/appointments", json={**body(ids[0], zones=(1,)), "phase": "inicial", "session_number": 1},
                      headers=W)).json()
    s = (await c.get(f"/appointments/{a['id']}/next-suggestion?phase=inicial&session_number=1", headers=W)).json()
    assert s["suggested_date"] == (DAY + timedelta(days=21)).date().isoformat()
    assert s["phase"] == "inicial" and s["session_number"] == 2 and s["slots"]
    r = await c.post(f"/appointments/{a['id']}/no-show", headers=W, json={
        "phase": "inicial", "session_number": 2, "new_start_at": s["slots"][0]})
    assert r.status_code == 201
    new = r.json()["new"]
    assert new["status"] == "Programada" and new["original_appointment_id"] == a["id"]
    assert r.json()["original"]["status"] == "Reagendada"
    hist = (await c.get(f"/clients/{ids[0]}", headers=W)).json()
    assert hist["total_appointments"] == 2
    assert any(h["rescheduled_to"] and h["rescheduled_to"]["id"] == new["id"] for h in hist["history"])


async def test_failed_link_rolls_back_no_show(env):
    c, A, W, ids = env
    a = (await c.post("/appointments", json=body(ids[0], zones=(1,)), headers=W)).json()
    r = await c.post(f"/appointments/{a['id']}/no-show", headers=W, json={
        "phase": "inicial", "session_number": 2, "new_start_at": (DAY - timedelta(days=30)).isoformat()})
    assert r.status_code == 409
    assert (await c.get(f"/clients/{ids[0]}", headers=W)).json()["history"][0]["status"] == "Programada"


async def test_worker_403_and_attend_rate_rules(env):
    c, A, W, ids = env
    assert (await c.get("/workers", headers=W)).status_code == 403
    assert (await c.post("/bcv/manual", json={"rate": "50"}, headers=W)).status_code == 403
    a = (await c.post("/appointments", json=body(ids[0], zones=(1,)), headers=W)).json()
    assert (await c.post(f"/appointments/{a['id']}/attend", json={"bcv_rate": "99"}, headers=W)).status_code == 403
    r = await c.post(f"/appointments/{a['id']}/attend", json={"bcv_rate": "50"}, headers=A)
    assert r.json()["status"] == "Atendida" and float(r.json()["price_bs"]) == 1000


async def test_duplicate_client_links_to_existing(env):
    c, A, W, ids = env
    r = await c.post("/clients", json={"full_name": "Otra Persona", "national_id": "12345670",
                                       "phone": "04141234567"}, headers=W)
    assert r.status_code == 409 and r.json()["detail"]["client_id"] == ids[0]
    bad = await c.post("/clients", json={"full_name": "Otra", "national_id": "99999999", "phone": "04141234567",
                                         "allergies_conditions": ["Ninguna", "Látex"]}, headers=W)
    assert bad.status_code == 422


async def test_availability_endpoint(env):
    c, A, W, ids = env
    r = await c.get(f"/appointments/availability?date={DAY.date()}&duration=90", headers=W)
    assert r.status_code == 200 and len(r.json()["slots"]) > 0


async def test_month_and_options_endpoints(env):
    c, A, W, ids = env
    r = await c.get(f"/appointments/availability/month?month={DAY:%Y-%m}&duration=30", headers=W)
    assert r.status_code == 200 and DAY.date().isoformat() in r.json()["available_dates"]
    o = (await c.get("/options", headers=W)).json()
    assert len(o["cubicles"]) == 2 and len(o["workers"]) == 2


async def test_list_range_and_multi_status_filter(env):
    c, A, W, ids = env
    a = (await c.post("/appointments", json=body(ids[0]), headers=W)).json()
    await c.post("/appointments", json=body(ids[1], DAY + timedelta(days=1)), headers=W)
    await c.post(f"/appointments/{a['id']}/cancel", headers=W)
    d = DAY.date()
    r = await c.get("/appointments", params={"date_from": d, "date_to": d + timedelta(days=1)}, headers=W)
    assert len(r.json()) == 2
    r = await c.get("/appointments", params={"date_from": d, "date_to": d, "status": ["Programada", "Confirmada"]}, headers=W)
    assert r.json() == []


async def test_reassign_unblocks_cubicle_deactivation(env):
    c, A, W, ids = env
    a = (await c.post("/appointments", json=body(ids[0]), headers=W)).json()
    old = a["cubicle_id"]
    new = next(x["id"] for x in (await c.get("/options", headers=W)).json()["cubicles"] if x["id"] != old)
    r = await c.post(f"/appointments/{a['id']}/reassign", json={"cubicle_id": new}, headers=W)
    assert r.status_code == 200 and r.json()["cubicle_id"] == new and r.json()["worker_id"] == a["worker_id"]
    assert (await c.put(f"/cubicles/{old}", json={"name_or_number": "C", "active": False}, headers=A)).status_code == 200


async def test_reassign_to_busy_resource_conflicts(env):
    c, A, W, ids = env
    a1 = (await c.post("/appointments", json=body(ids[0]), headers=W)).json()
    a2 = (await c.post("/appointments", json=body(ids[1]), headers=W)).json()
    r = await c.post(f"/appointments/{a1['id']}/reassign", json={"cubicle_id": a2["cubicle_id"]}, headers=W)
    assert r.status_code == 409


async def test_settings_zone_update_and_admin_only_lists(env):
    c, A, W, ids = env
    r = await c.put("/settings", json={"open": "08:00", "close": "17:00", "slot_step_min": 15}, headers=A)
    assert r.status_code == 200 and (await c.get("/settings", headers=A)).json()["open"] == "08:00"
    assert (await c.put("/settings", json={"open": "18:00", "close": "09:00"}, headers=A)).status_code == 422
    assert (await c.get("/settings", headers=W)).status_code == 403
    assert (await c.put("/zones/1", json={"name": "Axilas", "base_duration_min": 20, "base_price_usd": 25, "active": False}, headers=A)).status_code == 200
    assert len((await c.get("/zones", headers=W)).json()) == 2
    assert len((await c.get("/zones?include_inactive=true", headers=A)).json()) == 3
    assert (await c.get("/zones?include_inactive=true", headers=W)).status_code == 403
    cb = await c.post("/combos", json={"name": "Dúo", "zone_ids": [2, 3]}, headers=A)
    assert cb.json()["total_duration_min"] == 75 and float(cb.json()["total_price_usd"]) == 95
