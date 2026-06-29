"""Pydantic schemas for the User domain."""
import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr


class UserCreate(BaseModel):
    username: str
    password: str
    email: str | None = None
    full_name: str | None = None
    is_admin: bool = False


class UserUpdate(BaseModel):
    email: str | None = None
    full_name: str | None = None
    is_active: bool | None = None
    is_admin: bool | None = None
    password: str | None = None


class UserOut(BaseModel):
    id: uuid.UUID
    username: str
    email: str | None
    full_name: str | None
    is_active: bool
    is_admin: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TokenOut(BaseModel):
    access_token: str
    token_type: str
    user: UserOut
