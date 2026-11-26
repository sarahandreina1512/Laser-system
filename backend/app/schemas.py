from datetime import datetime, time
from decimal import Decimal
from pydantic import BaseModel, Field, field_validator

PHASES = ("inicial", "mantenimiento_1", "mantenimiento_2", "mantenimiento_3")


class CubicleIn(BaseModel):
    name_or_number: str = Field(min_length=1, max_length=60)
    order: int = 0
    capacity: int = Field(1, ge=1)
    active: bool = True


class WorkerIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    role: str = "Esteticista"
    order: int = 0
    active: bool = True
    work_schedule: dict[int, tuple[str, str]] = {}  # weekday 0=lun -> (inicio, fin)

    @field_validator("work_schedule")
    @classmethod
    def _schedule(cls, v):
        for d, (a, b) in v.items():
            if not 0 <= d <= 6 or time.fromisoformat(a) >= time.fromisoformat(b):
                raise ValueError("horario inválido")
        return v


class ClientIn(BaseModel):
    full_name: str = Field(min_length=3, max_length=160)
    national_id: str = Field(pattern=r"^[A-Za-z]?-?\d{5,12}$")
    phone: str = Field(min_length=7, max_length=30)
    allergies_conditions: list[str] = ["Ninguna"]
    notes: str | None = None

    @field_validator("allergies_conditions")
    @classmethod
    def _allergies(cls, v):
        if not v or ("Ninguna" in v and len(v) > 1):
            raise ValueError("'Ninguna' no se combina con otras opciones")
        return v


class ZoneIn(BaseModel):
    name: str
    base_duration_min: int = Field(gt=0)
    base_price_usd: Decimal = Field(ge=0)
    active: bool = True


class ComboIn(BaseModel):
    name: str
    zone_ids: list[int] = Field(min_length=2)
    total_duration_min: int | None = Field(None, gt=0)  # por defecto: suma de zonas
    total_price_usd: Decimal | None = Field(None, ge=0)
    active: bool = True


class AppointmentIn(BaseModel):
    client_id: int
    start_at: datetime
    zone_ids: list[int] = []
    combo_id: int | None = None
    worker_id: int | None = None   # None = automático
    cubicle_id: int | None = None
    phase: str | None = None
    session_number: int | None = Field(None, ge=1)
    observations: str | None = None


class AttendIn(BaseModel):
    price_usd: Decimal | None = Field(None, ge=0)
    bcv_rate: Decimal | None = Field(None, gt=0)  # solo admin
    observations: str | None = None


class NoShowIn(BaseModel):
    phase: str
    session_number: int = Field(ge=1)
    new_start_at: datetime
    worker_id: int | None = None
    cubicle_id: int | None = None
    reason: str | None = None

    @field_validator("phase")
    @classmethod
    def _phase(cls, v):
        if v not in PHASES:
            raise ValueError(f"fase debe ser una de {PHASES}")
        return v


class ManualRateIn(BaseModel):
    rate: Decimal = Field(gt=0, lt=1_000_000)


class ReassignIn(BaseModel):
    worker_id: int | None = None
    cubicle_id: int | None = None


class SettingsIn(BaseModel):
    open: str
    close: str
    slot_step_min: int = Field(30, ge=10, le=120)

    @field_validator("close")
    @classmethod
    def _hours(cls, v, info):
        if time.fromisoformat(info.data["open"]) >= time.fromisoformat(v):
            raise ValueError("El cierre debe ser posterior a la apertura")
        return v
