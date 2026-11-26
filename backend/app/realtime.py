"""Difusión en vivo (4.8): al confirmarse una transacción con cambios, se avisa a los clientes conectados.
Hub en memoria: válido con 1 proceso. Con varios workers hace falta Redis pub/sub (ver README)."""
from typing import Any, Protocol


class Socket(Protocol):
    async def send_json(self, data: Any) -> None: ...


class Hub:
    def __init__(self) -> None:
        self.connections: set[Socket] = set()

    async def broadcast(self, message: dict) -> None:
        for ws in list(self.connections):
            try:
                await ws.send_json(message)
            except Exception:  # conexión muerta
                self.connections.discard(ws)


hub = Hub()
