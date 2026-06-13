from datetime import date, datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth_utils import get_current_user, get_optional_user
from database import get_db
from holidays import HOLIDAYS
from models import FamilyEvent, User

router = APIRouter(prefix="/events", tags=["events"])

EVENT_COLORS = {
    "birthday":   "#f472b6",   # pink
    "holiday_kr": "#ef4444",   # red
    "holiday_sg": "#3b82f6",   # blue
    "leave":      "#f59e0b",   # amber
    "custom":     "#6366f1",   # indigo
}


class EventOut(BaseModel):
    id: Optional[int]             # None for auto-generated entries (holidays, birthdays)
    title: str
    event_date: date
    end_date: Optional[date]
    event_type: str
    description: Optional[str]
    color: Optional[str]
    linked_user_id: Optional[int]
    is_recurring: bool
    is_public: bool
    created_by_id: Optional[int]

    model_config = {"from_attributes": True}


class EventCreate(BaseModel):
    title: str
    event_date: date
    end_date: Optional[date] = None
    event_type: str = "custom"
    description: Optional[str] = None
    color: Optional[str] = None
    is_public: bool = True


class EventUpdate(BaseModel):
    title: Optional[str] = None
    event_date: Optional[date] = None
    end_date: Optional[date] = None
    event_type: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    is_public: Optional[bool] = None


def _birthday_events_in_range(db: Session, start: date, end: date) -> list[dict]:
    """Generate virtual birthday events from user profiles within the date range."""
    from models import User as UserModel
    users = db.query(UserModel).filter(UserModel.birthday != None).all()
    events = []
    for u in users:
        bday: date = u.birthday
        # Try this year and next year
        for year in range(start.year, end.year + 1):
            try:
                this_year = bday.replace(year=year)
            except ValueError:
                continue  # Feb 29 in non-leap year
            if start <= this_year <= end:
                name = (
                    f"{u.last_name or ''}{u.first_name or ''}".strip()
                    or u.western_name
                    or u.full_name
                    or u.username
                )
                events.append({
                    "id": None,
                    "title": f"🎂 {name}의 생일",
                    "event_date": this_year,
                    "end_date": None,
                    "event_type": "birthday",
                    "description": None,
                    "color": EVENT_COLORS["birthday"],
                    "linked_user_id": u.id,
                    "is_recurring": True,
                    "is_public": True,
                    "created_by_id": None,
                })
    return events


def _holiday_events_in_range(start: date, end: date) -> list[dict]:
    out = []
    for h in HOLIDAYS:
        d = date.fromisoformat(h["date"])
        if start <= d <= end:
            etype = "holiday_kr" if h["country"] == "KR" else "holiday_sg"
            flag = "🇰🇷" if h["country"] == "KR" else "🇸🇬"
            out.append({
                "id": None,
                "title": f"{flag} {h['title']}",
                "event_date": d,
                "end_date": None,
                "event_type": etype,
                "description": None,
                "color": EVENT_COLORS[etype],
                "linked_user_id": None,
                "is_recurring": True,
                "is_public": True,
                "created_by_id": None,
            })
    return out


@router.get("", response_model=List[EventOut])
def list_events(
    start: Optional[date] = Query(None),
    end: Optional[date] = Query(None),
    db: Session = Depends(get_db),
):
    today = date.today()
    if start is None:
        start = today
    if end is None:
        end = today + timedelta(days=60)

    # DB events
    db_events = (
        db.query(FamilyEvent)
        .filter(FamilyEvent.event_date >= start, FamilyEvent.event_date <= end)
        .order_by(FamilyEvent.event_date)
        .all()
    )
    result: list[dict] = [
        {
            "id": e.id,
            "title": e.title,
            "event_date": e.event_date,
            "end_date": e.end_date,
            "event_type": e.event_type,
            "description": e.description,
            "color": e.color or EVENT_COLORS.get(e.event_type, EVENT_COLORS["custom"]),
            "linked_user_id": e.linked_user_id,
            "is_recurring": e.is_recurring,
            "is_public": e.is_public,
            "created_by_id": e.created_by_id,
        }
        for e in db_events
    ]

    # Auto-generated entries
    result.extend(_birthday_events_in_range(db, start, end))
    result.extend(_holiday_events_in_range(start, end))

    # Sort by date
    result.sort(key=lambda x: x["event_date"])
    return result


@router.post("", response_model=EventOut, status_code=status.HTTP_201_CREATED)
def create_event(
    body: EventCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    color = body.color or EVENT_COLORS.get(body.event_type, EVENT_COLORS["custom"])
    event = FamilyEvent(
        **body.model_dump(),
        color=color,
        created_by_id=current_user.id,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return {
        "id": event.id, "title": event.title, "event_date": event.event_date,
        "end_date": event.end_date, "event_type": event.event_type,
        "description": event.description, "color": event.color,
        "linked_user_id": event.linked_user_id, "is_recurring": event.is_recurring,
        "is_public": event.is_public, "created_by_id": event.created_by_id,
    }


@router.put("/{event_id}", response_model=EventOut)
def update_event(
    event_id: int,
    body: EventUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    event = db.query(FamilyEvent).filter(FamilyEvent.id == event_id).first()
    if not event:
        raise HTTPException(404, "Event not found")
    if event.created_by_id != current_user.id and current_user.role != "admin":
        raise HTTPException(403, "Not allowed")
    for field, val in body.model_dump(exclude_none=True).items():
        setattr(event, field, val)
    db.commit()
    db.refresh(event)
    return {
        "id": event.id, "title": event.title, "event_date": event.event_date,
        "end_date": event.end_date, "event_type": event.event_type,
        "description": event.description, "color": event.color,
        "linked_user_id": event.linked_user_id, "is_recurring": event.is_recurring,
        "is_public": event.is_public, "created_by_id": event.created_by_id,
    }


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(
    event_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    event = db.query(FamilyEvent).filter(FamilyEvent.id == event_id).first()
    if not event:
        raise HTTPException(404, "Event not found")
    if event.created_by_id != current_user.id and current_user.role != "admin":
        raise HTTPException(403, "Not allowed")
    db.delete(event)
    db.commit()
