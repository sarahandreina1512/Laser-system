from sqlalchemy import select
from app import models
from app.repositories.base import Repository


class UserRepo(Repository[models.User]):
    model = models.User

    async def by_username(self, username: str):
        return await self.session.scalar(select(models.User).where(models.User.username == username))


class CubicleRepo(Repository[models.Cubicle]):
    model = models.Cubicle


class WorkerRepo(Repository[models.Worker]):
    model = models.Worker


class ClientRepo(Repository[models.Client]):
    model = models.Client
