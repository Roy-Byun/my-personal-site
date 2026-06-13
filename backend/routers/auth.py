import os
import re
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth_utils import (
    create_access_token, get_current_user, hash_password, verify_password,
)
from database import get_db
from models import InviteToken, User

router = APIRouter(prefix="/auth", tags=["auth"])

SECURE_COOKIES = os.getenv("SECURE_COOKIES", "false").lower() == "true"
_USERNAME_RE = re.compile(r'^[a-zA-Z0-9._\-@]{3,30}$')


class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    invite_token: str
    username: str
    password: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    western_name: Optional[str] = None
    birthday: Optional[date] = None
    birthday_lunar: Optional[date] = None
    is_lunar: bool = False
    email: Optional[str] = None
    country_code: Optional[str] = None
    phone_number: Optional[str] = None
    profile_picture_url: Optional[str] = None


class ProfileUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    western_name: Optional[str] = None
    birthday: Optional[date] = None
    birthday_lunar: Optional[date] = None
    is_lunar: Optional[bool] = None
    email: Optional[str] = None
    country_code: Optional[str] = None
    phone_number: Optional[str] = None
    profile_picture_url: Optional[str] = None
    password: Optional[str] = None


class UserOut(BaseModel):
    id: int
    username: str
    email: Optional[str]
    role: str
    full_name: Optional[str]
    first_name: Optional[str]
    last_name: Optional[str]
    western_name: Optional[str]
    profile_picture_url: Optional[str]
    birthday: Optional[date]
    country_code: Optional[str]
    phone_number: Optional[str]
    is_suspended: Optional[bool] = False
    suspended_until: Optional[datetime] = None
    suspension_reason: Optional[str] = None

    model_config = {"from_attributes": True}


def _set_cookie(response: Response, user: User) -> None:
    token = create_access_token({"sub": str(user.id), "role": user.role})
    response.set_cookie(
        key="access_token", value=token, httponly=True,
        samesite="lax", secure=SECURE_COOKIES, max_age=8 * 3600, path="/",
    )


@router.post("/login", response_model=UserOut)
def login(body: LoginRequest, response: Response, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == body.username).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    if not getattr(user, "is_active", True):
        raise HTTPException(status_code=403, detail="Account has been deactivated. Contact admin.")
    if getattr(user, "is_suspended", False):
        until = getattr(user, "suspended_until", None)
        if until is None or until > datetime.utcnow():
            msg = (f"Account suspended until {until.strftime('%Y-%m-%d')}"
                   if until else "Account permanently banned.")
            raise HTTPException(status_code=403, detail=msg)
    _set_cookie(response, user)
    return UserOut.model_validate(user)


@router.post("/register", response_model=UserOut, status_code=201)
def register(body: RegisterRequest, response: Response, db: Session = Depends(get_db)):
    invite = db.query(InviteToken).filter(
        InviteToken.token == body.invite_token,
        InviteToken.used_at == None,
    ).first()
    if not invite or invite.expires_at < datetime.utcnow():
        raise HTTPException(400, "Invalid or expired invite link.")

    if not _USERNAME_RE.match(body.username):
        raise HTTPException(400, "Username: 3-30 characters, letters/numbers and . _ - @ only.")
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(400, "Username already taken.")
    if body.email and db.query(User).filter(User.email == body.email).first():
        raise HTTPException(400, "Email already in use.")

    user = User(
        username=body.username,
        hashed_password=hash_password(body.password),
        role="user",
        first_name=body.first_name,
        last_name=body.last_name,
        western_name=body.western_name,
        birthday=body.birthday,
        birthday_lunar=body.birthday_lunar,
        is_lunar=body.is_lunar,
        email=body.email,
        country_code=body.country_code,
        phone_number=body.phone_number,
        profile_picture_url=body.profile_picture_url,
    )
    db.add(user)
    db.flush()
    invite.used_at = datetime.utcnow()
    invite.used_by_id = user.id
    db.commit()
    db.refresh(user)
    _set_cookie(response, user)
    return UserOut.model_validate(user)


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"detail": "Logged out"}


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.put("/me", response_model=UserOut)
def update_profile(
    body: ProfileUpdate,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if body.email and body.email != current_user.email:
        conflict = db.query(User).filter(User.email == body.email, User.id != current_user.id).first()
        if conflict:
            raise HTTPException(400, "Email already in use.")
    str_fields = ["first_name", "last_name", "western_name",
                  "email", "country_code", "phone_number", "profile_picture_url"]
    date_fields = ["birthday", "birthday_lunar"]
    for f in str_fields:
        val = getattr(body, f, None)
        if val is not None:
            setattr(current_user, f, val or None)
    for f in date_fields:
        val = getattr(body, f, None)
        if val is not None:
            setattr(current_user, f, val)
    if body.is_lunar is not None:
        current_user.is_lunar = body.is_lunar
    if body.password:
        current_user.hashed_password = hash_password(body.password)
    db.commit()
    db.refresh(current_user)
    _set_cookie(response, current_user)
    return UserOut.model_validate(current_user)


@router.post("/deactivate", status_code=200)
def deactivate(
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    current_user.is_active = False
    current_user.deactivated_at = datetime.utcnow()
    db.commit()
    response.delete_cookie("access_token", path="/")
    return {"detail": "Account deactivated."}
