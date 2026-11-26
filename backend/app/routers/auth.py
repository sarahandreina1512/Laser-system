import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import get_session
from app.deps import current_user
from app.models import User
from app.repositories import UserRepo
from app.repositories.base import AuditService
from app.security import decode_token, make_token, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    role: str  # el frontend redirige según rol sin pantalla intermedia


class UserOut(BaseModel):
    id: int
    username: str
    role: str
    worker_id: int | None
    model_config = {"from_attributes": True}


class RefreshIn(BaseModel):
    refresh_token: str


def _tokens(u: User) -> TokenOut:
    return TokenOut(access_token=make_token(u.id, u.role.value, "access"),
                    refresh_token=make_token(u.id, u.role.value, "refresh"), role=u.role.value)


@router.post("/login", response_model=TokenOut)
async def login(form: OAuth2PasswordRequestForm = Depends(), session: AsyncSession = Depends(get_session)):
    user = await UserRepo(session, AuditService(session, None)).by_username(form.username)
    if not user or not user.active or not verify_password(form.password, user.password_hash):
        AuditService(session, user.id if user else None).record(
            "auth", None, "login_failed", None, {"username": form.username})
        await session.commit()  # persistir el intento antes de responder 401
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuario o contraseña incorrectos")
    return _tokens(user)


@router.post("/refresh", response_model=TokenOut)
async def refresh(body: RefreshIn, session: AsyncSession = Depends(get_session)):
    try:
        data = decode_token(body.refresh_token, "refresh")
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Refresh token inválido")
    user = await session.get(User, int(data["sub"]))
    if not user or not user.active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuario inactivo")
    return _tokens(user)


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(current_user)):
    return user
