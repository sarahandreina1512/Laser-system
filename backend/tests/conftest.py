import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from app import models
from app.db import Base, commit_and_notify, get_session
from app.main import app
from app.security import hash_password


@pytest_asyncio.fixture
async def client():
    engine = create_async_engine("sqlite+aiosqlite://", poolclass=StaticPool)
    async with engine.begin() as c:
        await c.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as s:
        s.add_all([
            models.User(username="admin", password_hash=hash_password("admin123"), role=models.Role.admin),
            models.User(username="ana", password_hash=hash_password("ana12345"), role=models.Role.worker),
        ])
        await s.commit()

    async def override():
        async with Session() as s:
            try:
                yield s
                await commit_and_notify(s)  # una transacción por petición: datos + audit_log juntos
            except Exception:
                await s.rollback()
                raise
    app.dependency_overrides[get_session] = override
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        c.session_factory = Session
        yield c
    app.dependency_overrides.clear()
