#!/bin/sh
set -e
alembic upgrade head                      # nada de cambios manuales en producción
[ -n "$ADMIN_USER" ] && python -m scripts.seed   # primer admin, idempotente
# 1 worker: el hub de WebSocket vive en memoria (ver README para escalar con Redis)
exec gunicorn app.main:app -k uvicorn.workers.UvicornWorker -w 1 -b 0.0.0.0:8000
