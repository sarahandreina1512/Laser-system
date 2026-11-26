import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import get_session
from app.models import Role, User
from app.repositories.base import AuditService
from app.security import decode_token

oauth2 = OAuth2PasswordBearer(tokenUrl="/auth/login")


async def current_user(token: str = Depends(oauth2), session: AsyncSession = Depends(get_session)) -> User:
    try:
        data = decode_token(token, "access")
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token inválido o vencido")
    user = await session.get(User, int(data["sub"]))
    if not user or not user.active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuario inactivo")
    return user


def require_roles(*roles: Role):
    """El backend rechaza con 403 sin confiar en el ocultamiento del frontend."""
    async def checker(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Sin permiso para este recurso")
        return user
    return checker


require_admin = require_roles(Role.admin)
require_staff = require_roles(Role.admin, Role.worker)


async def audit(session: AsyncSession = Depends(get_session), user: User = Depends(current_user)) -> AuditService:
    return AuditService(session, user.id)
