from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth_utils import require_admin
from database import get_db
from models import Announcement, User

router = APIRouter(prefix="/announcements", tags=["announcements"])


class AnnouncementOut(BaseModel):
    id: int
    title: str
    body: Optional[str]
    link: Optional[str]
    priority: str
    created_by: Optional[str]
    created_at: datetime
    expires_at: Optional[datetime]

    model_config = {"from_attributes": True}


class AnnouncementCreate(BaseModel):
    title: str
    body: Optional[str] = None
    link: Optional[str] = None
    priority: str = "normal"
    expires_at: Optional[datetime] = None


class AnnouncementUpdate(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    link: Optional[str] = None
    priority: Optional[str] = None
    expires_at: Optional[datetime] = None


@router.get("", response_model=List[AnnouncementOut])
def list_announcements(db: Session = Depends(get_db)):
    now = datetime.utcnow()
    return (
        db.query(Announcement)
        .filter(
            (Announcement.expires_at == None) | (Announcement.expires_at > now)
        )
        .order_by(
            Announcement.priority.desc(),  # "normal" < "important" alphabetically — use case below
            Announcement.created_at.desc(),
        )
        .all()
    )


@router.post("", response_model=AnnouncementOut, status_code=status.HTTP_201_CREATED)
def create_announcement(
    body: AnnouncementCreate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if body.priority not in ("normal", "important"):
        raise HTTPException(400, "priority must be normal or important")
    ann = Announcement(**body.model_dump(), created_by=current_user.username)
    db.add(ann)
    db.commit()
    db.refresh(ann)
    return ann


@router.put("/{ann_id}", response_model=AnnouncementOut)
def update_announcement(
    ann_id: int,
    body: AnnouncementUpdate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    ann = db.query(Announcement).filter(Announcement.id == ann_id).first()
    if not ann:
        raise HTTPException(404, "Announcement not found")
    for field, val in body.model_dump(exclude_none=True).items():
        setattr(ann, field, val)
    db.commit()
    db.refresh(ann)
    return ann


@router.delete("/{ann_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_announcement(
    ann_id: int,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    ann = db.query(Announcement).filter(Announcement.id == ann_id).first()
    if not ann:
        raise HTTPException(404, "Announcement not found")
    db.delete(ann)
    db.commit()
