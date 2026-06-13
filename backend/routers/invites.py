import secrets
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth_utils import require_admin
from database import get_db
from models import InviteToken, User

router = APIRouter(prefix="/invites", tags=["invites"])


class InviteCreate(BaseModel):
    expires_days: int = 7
    note: Optional[str] = None


class InviteOut(BaseModel):
    id: int
    token: str
    note: Optional[str]
    expires_at: datetime
    used_at: Optional[datetime]
    used_by_id: Optional[int]
    created_at: datetime

    model_config = {"from_attributes": True}


@router.post("", response_model=InviteOut, status_code=201)
def create_invite(
    body: InviteCreate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    invite = InviteToken(
        token=secrets.token_urlsafe(32),
        created_by_id=current_user.id,
        expires_at=datetime.utcnow() + timedelta(days=max(1, min(body.expires_days, 90))),
        note=body.note,
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    return invite


@router.get("", response_model=List[InviteOut])
def list_invites(
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return db.query(InviteToken).order_by(InviteToken.created_at.desc()).limit(50).all()


@router.get("/validate/{token}")
def validate_invite(token: str, db: Session = Depends(get_db)):
    invite = db.query(InviteToken).filter(InviteToken.token == token).first()
    if not invite or invite.used_at or invite.expires_at < datetime.utcnow():
        raise HTTPException(400, "Invalid or expired invite link.")
    return {"valid": True, "note": invite.note}


@router.delete("/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_invite(
    invite_id: int,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    invite = db.query(InviteToken).filter(InviteToken.id == invite_id).first()
    if not invite:
        raise HTTPException(404, "Invite not found")
    db.delete(invite)
    db.commit()
