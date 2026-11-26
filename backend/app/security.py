from datetime import datetime, timedelta, timezone
import jwt
from passlib.context import CryptContext
from app.config import settings

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
ALG = "HS256"


def hash_password(p: str) -> str:
    return _pwd.hash(p)


def verify_password(p: str, h: str) -> bool:
    return _pwd.verify(p, h)


def make_token(user_id: int, role: str, kind: str) -> str:
    ttl = timedelta(minutes=settings.ACCESS_MINUTES) if kind == "access" else timedelta(days=settings.REFRESH_DAYS)
    payload = {"sub": str(user_id), "role": role, "type": kind, "exp": datetime.now(timezone.utc) + ttl}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=ALG)


def decode_token(token: str, kind: str) -> dict:
    data = jwt.decode(token, settings.JWT_SECRET, algorithms=[ALG])  # lanza jwt.PyJWTError
    if data.get("type") != kind:
        raise jwt.InvalidTokenError("tipo de token incorrecto")
    return data
