from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth_utils import get_current_user, hash_password, require_admin
from database import get_db
from models import User

router = APIRouter(prefix="/users", tags=["users"])


# ── schemas ────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    # account
    username: str
    password: str
    email: Optional[str] = None
    role: str = "user"
    # name
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    western_name: Optional[str] = None
    # birthday
    birthday: Optional[date] = None
    birthday_lunar: Optional[date] = None
    is_lunar: bool = False
    # contact
    country_code: Optional[str] = None
    phone_number: Optional[str] = None
    # profile
    profile_picture_url: Optional[str] = None


class UserUpdate(BaseModel):
    # account
    email: Optional[str] = None
    role: Optional[str] = None
    password: Optional[str] = None
    # name
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    western_name: Optional[str] = None
    # birthday
    birthday: Optional[date] = None
    birthday_lunar: Optional[date] = None
    is_lunar: Optional[bool] = None
    # contact
    country_code: Optional[str] = None
    phone_number: Optional[str] = None
    # profile
    profile_picture_url: Optional[str] = None


class UserAdminOut(BaseModel):
    id: int
    username: str
    email: Optional[str]
    role: str
    # name
    first_name: Optional[str]
    last_name: Optional[str]
    western_name: Optional[str]
    full_name: Optional[str]        # legacy seed field
    # birthday
    birthday: Optional[date]
    birthday_lunar: Optional[date]
    is_lunar: Optional[bool]
    # contact
    country_code: Optional[str]
    phone_number: Optional[str]
    # profile
    profile_picture_url: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


# ── helpers ────────────────────────────────────────────────────────────────

def _apply_fields(user: User, body: UserCreate | UserUpdate) -> None:
    """Write all non-None body fields onto the ORM object."""
    string_fields = [
        "email", "role",
        "first_name", "last_name", "western_name",
        "country_code", "phone_number", "profile_picture_url",
    ]
    date_fields = ["birthday", "birthday_lunar"]

    for field in string_fields:
        val = getattr(body, field, None)
        if val is not None:
            setattr(user, field, val or None)

    for field in date_fields:
        val = getattr(body, field, None)
        if val is not None:
            setattr(user, field, val)

    if getattr(body, "is_lunar", None) is not None:
        user.is_lunar = body.is_lunar

    if getattr(body, "password", None):
        user.hashed_password = hash_password(body.password)


class UserFamilyOut(BaseModel):
    id: int
    first_name: Optional[str]
    last_name: Optional[str]
    western_name: Optional[str]
    full_name: Optional[str]
    role: str
    birthday: Optional[date]
    country_code: Optional[str]
    phone_number: Optional[str]
    profile_picture_url: Optional[str]

    model_config = {"from_attributes": True}


# ── endpoints ──────────────────────────────────────────────────────────────

@router.get("/family", response_model=List[UserFamilyOut])
def list_family_members(
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Visible to all authenticated family members (no sensitive fields)."""
    return db.query(User).order_by(User.created_at).all()


@router.get("", response_model=List[UserAdminOut])
def list_users(
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return db.query(User).order_by(User.created_at).all()


@router.post("", response_model=UserAdminOut, status_code=status.HTTP_201_CREATED)
def create_user(
    body: UserCreate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(status_code=400, detail="Username already taken")
    if body.email and db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=400, detail="Email already in use")

    user = User(username=body.username)
    _apply_fields(user, body)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.put("/{user_id}", response_model=UserAdminOut)
def update_user(
    user_id: int,
    body: UserUpdate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if body.email is not None:
        conflict = (
            db.query(User)
            .filter(User.email == body.email, User.id != user_id)
            .first()
        )
        if conflict:
            raise HTTPException(status_code=400, detail="Email already in use")

    _apply_fields(user, body)
    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if current_user.id == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()
