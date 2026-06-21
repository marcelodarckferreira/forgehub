"""Placeholder auth router.

TEMPORARY: validates against a single hardcoded dev user read from
settings (DEV_USER_USERNAME / DEV_USER_PASSWORD). There is no real
Users/Auth domain yet — that is out of scope for this backend-foundation
step per the PRD/SPEC. A future auth domain agent should replace this
module's internals (look up a real user, check a real password hash)
while keeping the same path/contract (POST /api/v1/auth/token,
OAuth2PasswordRequestForm in, {access_token, token_type} out) so the
frontend and other domains are unaffected.

Every routes module exports a module-level `router` — app.main imports
and includes it under that name.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm

from app.core.config import settings
from app.core.security import create_access_token

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/token")
async def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
) -> dict[str, str]:
    # TEMPORARY: compares plaintext against settings instead of a real
    # user store / hashed password lookup. Replace once a Users domain
    # exists.
    if (
        form_data.username != settings.DEV_USER_USERNAME
        or form_data.password != settings.DEV_USER_PASSWORD
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(subject=form_data.username)
    return {"access_token": access_token, "token_type": "bearer"}
