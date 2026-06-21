"""Application settings loaded from environment variables / .env.

This is the single source of truth for configuration. Every other module
(db.base, core.security, alembic/env.py) must import `settings` from here
instead of reading os.environ directly.
"""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Repo root .env (forgehub/.env), two levels up from backend/app/core/.
_ENV_FILE = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Postgres connection (shared `company_postgres` instance, see docs/DB_README.md)
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5433
    POSTGRES_USER: str = "foundation"
    POSTGRES_PASSWORD: str = ""
    POSTGRES_DB: str = "forgehub"
    POSTGRES_SCHEMA: str = "company"

    # Auth
    JWT_SECRET: str = "dev_only_insecure_jwt_secret_change_me"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # Temporary single hardcoded dev user — placeholder until a real
    # Users/Auth domain exists (out of scope for this foundation step).
    DEV_USER_USERNAME: str = "admin"
    DEV_USER_PASSWORD: str = "admin"

    # Chat bridge (host-bridge/app.py) -- the real Hermes agents only exist
    # as host processes, so chat messages are proxied there over HTTP.
    CHAT_BRIDGE_URL: str = "http://host.docker.internal:8910"
    CHAT_BRIDGE_TOKEN: str = ""

    @property
    def DATABASE_URL(self) -> str:
        """Async SQLAlchemy connection string (postgresql+asyncpg://...)."""
        return (
            f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
