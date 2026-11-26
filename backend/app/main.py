import jwt
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from app.realtime import hub
from app.security import decode_token
from app.routers import appointments, auth, bcv, catalog, clients, resources

app = FastAPI(title="AURA API", docs_url="/docs")  # OpenAPI en /docs
for r in (auth.router, resources.cubicles, resources.workers, clients.router,
          catalog.router, appointments.router, bcv.router):
    app.include_router(r)


@app.websocket("/ws")
async def ws(websocket: WebSocket, token: str = ""):
    """Canal de eventos. Token JWT de acceso por query (los navegadores no permiten cabeceras en WS)."""
    try:
        decode_token(token, "access")
    except jwt.PyJWTError:
        await websocket.close(code=4401)
        return
    await websocket.accept()
    hub.connections.add(websocket)
    try:
        while True:
            if await websocket.receive_text() == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        pass
    finally:
        hub.connections.discard(websocket)
