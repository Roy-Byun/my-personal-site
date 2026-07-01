from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth_utils import require_admin
from database import get_db
from models import AboutProfile, ExperienceEntry, GalleryPhoto, LifeMilestone, User

router = APIRouter(prefix="/about", tags=["about"])

ENTRY_TYPES = ("work", "education")


# ── Profile (singleton) ─────────────────────────────────────────────────────

class ProfileOut(BaseModel):
    id: Optional[int] = None
    headline: Optional[str] = None
    bio: Optional[str] = None
    photo_url: Optional[str] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ProfileUpdate(BaseModel):
    headline: Optional[str] = None
    bio: Optional[str] = None
    photo_url: Optional[str] = None


def _get_or_create_profile(db: Session) -> AboutProfile:
    profile = db.query(AboutProfile).order_by(AboutProfile.id).first()
    if profile is None:
        profile = AboutProfile()
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


@router.get("/profile", response_model=ProfileOut)
def get_profile(db: Session = Depends(get_db)):
    return _get_or_create_profile(db)


@router.put("/profile", response_model=ProfileOut)
def update_profile(
    body: ProfileUpdate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    profile = _get_or_create_profile(db)
    for field, val in body.model_dump(exclude_none=True).items():
        setattr(profile, field, val)
    profile.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(profile)
    return profile


# ── Experience timeline ─────────────────────────────────────────────────────

class ExperienceOut(BaseModel):
    id: int
    entry_type: str
    title: str
    organization: str
    location: Optional[str]
    start_date: Optional[date]
    end_date: Optional[date]
    description: Optional[str]
    sort_order: int
    created_at: datetime

    model_config = {"from_attributes": True}


class ExperienceCreate(BaseModel):
    entry_type: str = "work"
    title: str
    organization: str
    location: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    description: Optional[str] = None
    sort_order: int = 0


class ExperienceUpdate(BaseModel):
    entry_type: Optional[str] = None
    title: Optional[str] = None
    organization: Optional[str] = None
    location: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    description: Optional[str] = None
    sort_order: Optional[int] = None


@router.get("/experience", response_model=List[ExperienceOut])
def list_experience(db: Session = Depends(get_db)):
    return (
        db.query(ExperienceEntry)
        .order_by(ExperienceEntry.sort_order.asc(), ExperienceEntry.start_date.desc())
        .all()
    )


@router.post("/experience", response_model=ExperienceOut, status_code=status.HTTP_201_CREATED)
def create_experience(
    body: ExperienceCreate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if body.entry_type not in ENTRY_TYPES:
        raise HTTPException(400, f"entry_type must be one of {ENTRY_TYPES}")
    entry = ExperienceEntry(**body.model_dump())
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.put("/experience/{entry_id}", response_model=ExperienceOut)
def update_experience(
    entry_id: int,
    body: ExperienceUpdate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    entry = db.query(ExperienceEntry).filter(ExperienceEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(404, "Experience entry not found")
    data = body.model_dump(exclude_none=True)
    if "entry_type" in data and data["entry_type"] not in ENTRY_TYPES:
        raise HTTPException(400, f"entry_type must be one of {ENTRY_TYPES}")
    for field, val in data.items():
        setattr(entry, field, val)
    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/experience/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_experience(
    entry_id: int,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    entry = db.query(ExperienceEntry).filter(ExperienceEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(404, "Experience entry not found")
    db.delete(entry)
    db.commit()


# ── Gallery ──────────────────────────────────────────────────────────────────

class GalleryOut(BaseModel):
    id: int
    photo_url: str
    caption: Optional[str]
    taken_date: Optional[date]
    sort_order: int
    created_at: datetime

    model_config = {"from_attributes": True}


class GalleryCreate(BaseModel):
    photo_url: str
    caption: Optional[str] = None
    taken_date: Optional[date] = None
    sort_order: int = 0


class GalleryUpdate(BaseModel):
    photo_url: Optional[str] = None
    caption: Optional[str] = None
    taken_date: Optional[date] = None
    sort_order: Optional[int] = None


@router.get("/gallery", response_model=List[GalleryOut])
def list_gallery(db: Session = Depends(get_db)):
    return (
        db.query(GalleryPhoto)
        .order_by(GalleryPhoto.sort_order.asc(), GalleryPhoto.taken_date.asc())
        .all()
    )


@router.post("/gallery", response_model=GalleryOut, status_code=status.HTTP_201_CREATED)
def create_gallery_photo(
    body: GalleryCreate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    photo = GalleryPhoto(**body.model_dump())
    db.add(photo)
    db.commit()
    db.refresh(photo)
    return photo


@router.put("/gallery/{photo_id}", response_model=GalleryOut)
def update_gallery_photo(
    photo_id: int,
    body: GalleryUpdate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    photo = db.query(GalleryPhoto).filter(GalleryPhoto.id == photo_id).first()
    if not photo:
        raise HTTPException(404, "Photo not found")
    for field, val in body.model_dump(exclude_none=True).items():
        setattr(photo, field, val)
    db.commit()
    db.refresh(photo)
    return photo


@router.delete("/gallery/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_gallery_photo(
    photo_id: int,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    photo = db.query(GalleryPhoto).filter(GalleryPhoto.id == photo_id).first()
    if not photo:
        raise HTTPException(404, "Photo not found")
    db.delete(photo)
    db.commit()


# ── Life milestones ──────────────────────────────────────────────────────────

class MilestoneOut(BaseModel):
    id: int
    label: str
    target_date: datetime
    note: Optional[str]
    is_featured: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class MilestoneCreate(BaseModel):
    label: str
    target_date: datetime
    note: Optional[str] = None
    is_featured: bool = False


class MilestoneUpdate(BaseModel):
    label: Optional[str] = None
    target_date: Optional[datetime] = None
    note: Optional[str] = None
    is_featured: Optional[bool] = None


def _clear_other_featured(db: Session, exclude_id: Optional[int] = None) -> None:
    q = db.query(LifeMilestone).filter(LifeMilestone.is_featured == True)
    if exclude_id is not None:
        q = q.filter(LifeMilestone.id != exclude_id)
    q.update({LifeMilestone.is_featured: False}, synchronize_session=False)


@router.get("/milestones", response_model=List[MilestoneOut])
def list_milestones(db: Session = Depends(get_db)):
    return (
        db.query(LifeMilestone)
        .order_by(LifeMilestone.is_featured.desc(), LifeMilestone.target_date.asc())
        .all()
    )


@router.post("/milestones", response_model=MilestoneOut, status_code=status.HTTP_201_CREATED)
def create_milestone(
    body: MilestoneCreate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if body.is_featured:
        _clear_other_featured(db)
    milestone = LifeMilestone(**body.model_dump())
    db.add(milestone)
    db.commit()
    db.refresh(milestone)
    return milestone


@router.put("/milestones/{milestone_id}", response_model=MilestoneOut)
def update_milestone(
    milestone_id: int,
    body: MilestoneUpdate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    milestone = db.query(LifeMilestone).filter(LifeMilestone.id == milestone_id).first()
    if not milestone:
        raise HTTPException(404, "Milestone not found")
    data = body.model_dump(exclude_none=True)
    if data.get("is_featured"):
        _clear_other_featured(db, exclude_id=milestone_id)
    for field, val in data.items():
        setattr(milestone, field, val)
    db.commit()
    db.refresh(milestone)
    return milestone


@router.delete("/milestones/{milestone_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_milestone(
    milestone_id: int,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    milestone = db.query(LifeMilestone).filter(LifeMilestone.id == milestone_id).first()
    if not milestone:
        raise HTTPException(404, "Milestone not found")
    db.delete(milestone)
    db.commit()
