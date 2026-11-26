from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    DATABASE_URL: str = "sqlite+aiosqlite:///./aura.db"  # SQLite solo desarrollo
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""
    JWT_SECRET: str = "dev-secret-change-me"
    BCV_API_URL: str = ""
    ACCESS_MINUTES: int = 30
    REFRESH_DAYS: int = 7


settings = Settings()
