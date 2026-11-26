"""Modelo de datos (sección 3). Dinero en Numeric; fechas en UTC."""
import enum
from datetime import date, datetime
from decimal import Decimal
from sqlalchemy import (JSON, Boolean, Column, Date, DateTime, Enum, ForeignKey,
                        Index, Integer, Numeric, String, Table, Text, func)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db import Base


class Role(str, enum.Enum):
    admin = "admin"
    worker = "worker"


class Status(str, enum.Enum):
    programada = "Programada"
    confirmada = "Confirmada"
    atendida = "Atendida"
    no_asistio = "No asistió"
    cancelada = "Cancelada"
    reagendada = "Reagendada"


class Stamps:
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class Worker(Base, Stamps):
    __tablename__ = "workers"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str] = mapped_column(String(60), default="Esteticista")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    order: Mapped[int] = mapped_column(Integer, default=0)
    work_schedule: Mapped[dict] = mapped_column(JSON, default=dict)  # {"0": ["09:00","17:00"]}


class User(Base, Stamps):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(60), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[Role] = mapped_column(Enum(Role, native_enum=False), default=Role.worker)
    worker_id: Mapped[int | None] = mapped_column(ForeignKey("workers.id"))
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Cubicle(Base, Stamps):
    __tablename__ = "cubicles"
    id: Mapped[int] = mapped_column(primary_key=True)
    name_or_number: Mapped[str] = mapped_column(String(60))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    order: Mapped[int] = mapped_column(Integer, default=0)
    capacity: Mapped[int] = mapped_column(Integer, default=1)


class Client(Base, Stamps):
    __tablename__ = "clients"
    id: Mapped[int] = mapped_column(primary_key=True)
    full_name: Mapped[str] = mapped_column(String(160), index=True)
    national_id: Mapped[str] = mapped_column(String(20), unique=True)
    phone: Mapped[str] = mapped_column(String(30))
    allergies_conditions: Mapped[list] = mapped_column(JSON, default=lambda: ["Ninguna"])
    notes: Mapped[str | None] = mapped_column(Text)


class BodyZone(Base):
    __tablename__ = "body_zones"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    base_duration_min: Mapped[int] = mapped_column(Integer)
    base_price_usd: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    active: Mapped[bool] = mapped_column(Boolean, default=True)


combo_zones = Table(
    "combo_zones", Base.metadata,
    Column("combo_id", ForeignKey("combos.id"), primary_key=True),
    Column("zone_id", ForeignKey("body_zones.id"), primary_key=True),
)


class Combo(Base):
    __tablename__ = "combos"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    total_duration_min: Mapped[int] = mapped_column(Integer)
    total_price_usd: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    zones: Mapped[list[BodyZone]] = relationship(secondary=combo_zones, lazy="selectin")


appointment_zones = Table(
    "appointment_zones", Base.metadata,
    Column("appointment_id", ForeignKey("appointments.id"), primary_key=True),
    Column("zone_id", ForeignKey("body_zones.id"), primary_key=True),
)


class Appointment(Base, Stamps):
    __tablename__ = "appointments"
    __table_args__ = (
        Index("ix_appt_worker_start", "worker_id", "start_at"),
        Index("ix_appt_cubicle_start", "cubicle_id", "start_at"),
        Index("ix_appt_client_start", "client_id", "start_at"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"))
    worker_id: Mapped[int] = mapped_column(ForeignKey("workers.id"))
    cubicle_id: Mapped[int] = mapped_column(ForeignKey("cubicles.id"))
    start_at: Mapped[datetime] = mapped_column(DateTime)
    end_at: Mapped[datetime] = mapped_column(DateTime)
    duration_min: Mapped[int] = mapped_column(Integer)
    status: Mapped[Status] = mapped_column(Enum(Status, native_enum=False), default=Status.programada)
    combo_id: Mapped[int | None] = mapped_column(ForeignKey("combos.id"))
    zones: Mapped[list[BodyZone]] = relationship(secondary=appointment_zones, lazy="selectin")
    price_usd: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    bcv_rate: Mapped[Decimal | None] = mapped_column(Numeric(14, 4))
    price_bs: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    original_appointment_id: Mapped[int | None] = mapped_column(ForeignKey("appointments.id"))
    observations: Mapped[str | None] = mapped_column(Text)
    phase: Mapped[str | None] = mapped_column(String(20))  # inicial|mantenimiento_1|2|3
    session_number: Mapped[int | None] = mapped_column(Integer)


class AppointmentStatusHistory(Base):
    __tablename__ = "appointment_status_history"
    id: Mapped[int] = mapped_column(primary_key=True)
    appointment_id: Mapped[int] = mapped_column(ForeignKey("appointments.id"), index=True)
    from_status: Mapped[str | None] = mapped_column(String(20))
    to_status: Mapped[str] = mapped_column(String(20))
    changed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    changed_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    reason: Mapped[str | None] = mapped_column(Text)


class BcvRate(Base):
    __tablename__ = "bcv_rates"
    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[date] = mapped_column(Date, unique=True)
    rate: Mapped[Decimal] = mapped_column(Numeric(14, 4))
    source: Mapped[str] = mapped_column(String(10), default="api")  # api|manual
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class AuditLog(Base):
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    entity: Mapped[str] = mapped_column(String(60), index=True)
    entity_id: Mapped[int | None] = mapped_column(Integer)
    action: Mapped[str] = mapped_column(String(40))
    before: Mapped[dict | None] = mapped_column(JSON)
    after: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Setting(Base):
    __tablename__ = "settings"
    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON)
