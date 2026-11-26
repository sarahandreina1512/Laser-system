import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
from app.main import app
from app.realtime import hub
from app.security import make_token
from tests.test_phase2 import body, env, hdr  # noqa: F401  (reutiliza el fixture env)

pytestmark = pytest.mark.asyncio


class Fake:
    def __init__(self): self.got = []
    async def send_json(self, data): self.got.append(data)


async def test_commit_broadcasts_changed_entities(env):
    c, A, W, ids = env
    f = Fake(); hub.connections.add(f)
    try:
        r = await c.post("/appointments", json=body(ids[0]), headers=W)
        assert r.status_code == 201
        assert f.got and "appointments" in f.got[-1]["entities"]
        n = len(f.got)
        await c.post("/appointments", json=body(ids[0]), headers=W)  # 409 -> rollback: no se difunde
        assert len(f.got) == n
        await c.post("/auth/login", data={"username": "admin", "password": "mala"})  # auth no difunde
        assert len(f.got) == n
    finally:
        hub.connections.discard(f)


def test_ws_rejects_bad_token_and_accepts_good_one():
    with TestClient(app) as tc:
        with pytest.raises(WebSocketDisconnect):
            with tc.websocket_connect("/ws?token=mala"):
                pass
        with tc.websocket_connect(f"/ws?token={make_token(1, 'admin', 'access')}") as ws:
            ws.send_text("ping")
            assert ws.receive_text() == "pong"
