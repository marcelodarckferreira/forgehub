"""Auth router — POST /api/v1/auth/token.

Validates username/password against the Users table.
Falls back to the DEV_USER_USERNAME/DEV_USER_PASSWORD from settings for
bootstrap (before the admin row exists) so the first login always works.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.user import TokenOut, UserOut
from app.core.config import settings
from app.core.deps import get_current_user
from app.core.security import create_access_token, verify_password
from app.db.base import get_db
from app.db.models.user import User

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/token", response_model=TokenOut)
async def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
) -> TokenOut:
    # Try DB first
    result = await db.execute(select(User).where(User.username == form_data.username))
    user: User | None = result.scalar_one_or_none()

    authenticated = False
    if user is not None and user.is_active:
        authenticated = verify_password(form_data.password, user.hashed_password)
    elif (
        form_data.username == settings.DEV_USER_USERNAME
        and form_data.password == settings.DEV_USER_PASSWORD
        and user is None
    ):
        # Bootstrap: no users table row yet — accept settings credentials
        authenticated = True

    if not authenticated:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_access_token(subject=form_data.username)

    if user is None:
        # Bootstrap user object for the response (not persisted here)
        import uuid
        from datetime import datetime, timezone
        _now = datetime.now(timezone.utc)
        fake = User()
        fake.id = uuid.uuid4()
        fake.username = form_data.username
        fake.email = None
        fake.full_name = "Admin (bootstrap)"
        fake.is_active = True
        fake.is_admin = True
        fake.created_at = _now
        fake.updated_at = _now
        user_out = UserOut.model_validate(fake)
    else:
        user_out = UserOut.model_validate(user)

    return TokenOut(access_token=token, token_type="bearer", user=user_out)


@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(current_user)
