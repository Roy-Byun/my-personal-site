from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth_utils import hash_password, require_admin
from database import get_db
from models import User

router = APIRouter(prefix="/users", tags=["users"])


class UserCreate(BaseModel):
    username: str
    password: str
    email: Optional[str] = None
    role: str = "user"
    full_name: Optional[str] = None
    birthday: Optional[date] = None


class UserUpdate(BaseModel):
    email: Optional[str] = None
    role: Optional[str] = None
    full_name: Optional[str] = None
    birthday: Optional[date] = None
    password: Optional[str] = None


class UserAdminOut(BaseModel):
    id: int
    username: str
    email: Optional[str]
    role: str
    full_name: Optional[str]
    birthday: Optional[date]
    created_at: datetime

    model_config = {"from_attributes": True}


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

    user = User(
        username=body.username,
        hashed_password=hash_password(body.password),
        email=body.email or None,
        role=body.role,
        full_name=body.full_name or None,
        birthday=body.birthday,
    )
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
        conflict = db.query(User).filter(User.email == body.email, User.id != user_id).first()
        if conflict:
            raise HTTPException(status_code=400, detail="Email already in use")
        user.email = body.email or None

    if body.role is not None:
        user.role = body.role
    if body.full_name is not None:
        user.full_name = body.full_name or None
    if body.birthday is not None:
        user.birthday = body.birthday
    if body.password:
        user.hashed_password = hash_password(body.password)

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
