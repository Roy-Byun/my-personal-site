from datetime import date, datetime, timedelta
from typing import List, Optional

import logging

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth_utils import get_current_user, get_optional_user

log = logging.getLogger(__name__)
from database import get_db
from holidays import HOLIDAYS
from models import FamilyEvent, User

router = APIRouter(prefix="/events", tags=["events"])

EVENT_COLORS = {
    "birthday":    "#f472b6",
    "memorial":    "#94a3b8",
    "anniversary": "#fb7185",
    "holiday_kr":  "#ef4444",
    "holiday_sg":  "#3b82f6",
    "leave":       "#f59e0b",
    "meeting":     "#22d3ee",
    "school":      "#4ade80",
    "medical":     "#34d399",
    "travel":      "#a78bfa",
    "custom":      "#6366f1",
}


class EventOut(BaseModel):
    id: Optional[int]
    title: str
    event_date: date
    end_date: Optional[date]
    event_type: str
    description: Optional[str]
    color: Optional[str]
    linked_user_id: Optional[int]
    is_recurring: bool
    recurrence_type: Optional[str] = None
    recurrence_interval: Optional[int] = None
    recurrence_end: Optional[date] = None
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
    recurrence_type: Optional[str] = None
    recurrence_interval: int = 1
    recurrence_end: Optional[date] = None


class EventUpdate(BaseModel):
    title: Optional[str] = None
    event_date: Optional[date] = None
    end_date: Optional[date] = None
    event_type: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    is_public: Optional[bool] = None
    recurrence_type: Optional[str] = None
    recurrence_interval: Optional[int] = None
    recurrence_end: Optional[date] = None


def _advance_date(d: date, rtype: str, interval: int) -> date:
    from dateutil.relativedelta import relativedelta
    if rtype == "daily":
        return d + timedelta(days=interval)
    elif rtype == "weekly":
        return d + timedelta(weeks=interval)
    elif rtype == "monthly":
        return d + relativedelta(months=interval)
    elif rtype == "yearly":
        return d + relativedelta(years=interval)
    return d + timedelta(days=1)


def _expand_recurring(event: FamilyEvent, start: date, end: date) -> list[dict]:
    """Generate all occurrences of a recurring event within [start, end]."""
    results = []
    interval = event.recurrence_interval or 1
    current = event.event_date
    iterations = 0

    # Fast-forward to first occurrence >= start
    while current < start and iterations < 10000:
        next_d = _advance_date(current, event.recurrence_type, interval)
        if next_d <= current:
            break
        current = next_d
        iterations += 1

    while current <= end and iterations < 10000:
        iterations += 1
        if event.recurrence_end and current > event.recurrence_end:
            break
        results.append({
            "id": event.id,
            "title": event.title,
            "event_date": current,
            "end_date": event.end_date,
            "event_type": event.event_type,
            "description": event.description,
            "color": event.color or EVENT_COLORS.get(event.event_type, EVENT_COLORS["custom"]),
            "linked_user_id": event.linked_user_id,
            "is_recurring": True,
            "recurrence_type": event.recurrence_type,
            "recurrence_interval": event.recurrence_interval,
            "recurrence_end": event.recurrence_end,
            "is_public": event.is_public,
            "created_by_id": event.created_by_id,
        })
        next_d = _advance_date(current, event.recurrence_type, interval)
        if next_d <= current:
            break
        current = next_d

    return results


def _birthday_events_in_range(db: Session, start: date, end: date) -> list[dict]:
    from models import User as UserModel
    users = db.query(UserModel).filter(UserModel.birthday != None).all()
    events = []
    for u in users:
        bday: date = u.birthday
        for year in range(start.year, end.year + 1):
            try:
                this_year = bday.replace(year=year)
            except ValueError:
                continue
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
                    "recurrence_type": "yearly",
                    "recurrence_interval": 1,
                    "recurrence_end": None,
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
                "recurrence_type": "yearly",
                "recurrence_interval": 1,
                "recurrence_end": None,
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

    result: list[dict] = []

    # DB events — fall back to simple date filter if recurrence column not yet migrated
    try:
        non_recurring = (
            db.query(FamilyEvent)
            .filter(
                FamilyEvent.recurrence_type == None,
                FamilyEvent.event_date >= start,
                FamilyEvent.event_date <= end,
            )
            .all()
        )
        for e in non_recurring:
            result.append({
                "id": e.id, "title": e.title, "event_date": e.event_date,
                "end_date": e.end_date, "event_type": e.event_type,
                "description": e.description,
                "color": e.color or EVENT_COLORS.get(e.event_type, EVENT_COLORS["custom"]),
                "linked_user_id": e.linked_user_id, "is_recurring": e.is_recurring,
                "recurrence_type": None, "recurrence_interval": None, "recurrence_end": None,
                "is_public": e.is_public, "created_by_id": e.created_by_id,
            })

        recurring = (
            db.query(FamilyEvent)
            .filter(
                FamilyEvent.recurrence_type != None,
                FamilyEvent.event_date <= end,
            )
            .filter(
                (FamilyEvent.recurrence_end == None) | (FamilyEvent.recurrence_end >= start)
            )
            .all()
        )
        for e in recurring:
            result.extend(_expand_recurring(e, start, end))

    except Exception:
        log.exception("DB events query failed (recurrence columns may not exist yet); falling back")
        db.rollback()
        try:
            all_events = (
                db.query(FamilyEvent)
                .filter(FamilyEvent.event_date >= start, FamilyEvent.event_date <= end)
                .all()
            )
            for e in all_events:
                result.append({
                    "id": e.id, "title": e.title, "event_date": e.event_date,
                    "end_date": e.end_date, "event_type": e.event_type,
                    "description": e.description,
                    "color": e.color or EVENT_COLORS.get(e.event_type, EVENT_COLORS["custom"]),
                    "linked_user_id": e.linked_user_id, "is_recurring": getattr(e, "is_recurring", False),
                    "recurrence_type": None, "recurrence_interval": None, "recurrence_end": None,
                    "is_public": e.is_public, "created_by_id": e.created_by_id,
                })
        except Exception:
            log.exception("Fallback DB events query also failed")

    try:
        result.extend(_birthday_events_in_range(db, start, end))
    except Exception:
        log.exception("Birthday events query failed (birthday column may not exist yet)")
        db.rollback()

    result.extend(_holiday_events_in_range(start, end))

    result.sort(key=lambda x: x["event_date"])
    return result


# Declared before /{event_id} to avoid route shadowing
@router.post("/import-ics", status_code=200)
async def import_ics(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not (file.filename or "").lower().endswith(".ics"):
        raise HTTPException(400, "Only .ics files are accepted")

    content = await file.read()
    try:
        from icalendar import Calendar as ICalCalendar
        cal = ICalCalendar.from_ical(content)
    except Exception as e:
        raise HTTPException(400, f"Invalid .ics file: {e}")

    imported = 0
    skipped = 0

    for component in cal.walk():
        if component.name != "VEVENT":
            continue

        summary = str(component.get("SUMMARY", "")).strip()
        if not summary:
            skipped += 1
            continue

        dtstart = component.get("DTSTART")
        if not dtstart:
            skipped += 1
            continue

        raw_start = dtstart.dt
        ev_date = raw_start.date() if isinstance(raw_start, datetime) else raw_start

        dtend = component.get("DTEND")
        end_date_val = None
        if dtend:
            raw_end = dtend.dt
            end_date_val = raw_end.date() if isinstance(raw_end, datetime) else raw_end
            if end_date_val == ev_date:
                end_date_val = None

        desc_raw = component.get("DESCRIPTION")
        description = str(desc_raw).strip() if desc_raw else None

        recurrence_type = None
        recurrence_interval = 1
        recurrence_end = None

        rrule = component.get("RRULE")
        if rrule:
            freq_list = rrule.get("FREQ", [])
            if freq_list:
                freq = str(freq_list[0]).lower()
                recurrence_type = {"daily": "daily", "weekly": "weekly",
                                   "monthly": "monthly", "yearly": "yearly"}.get(freq)
            interval_list = rrule.get("INTERVAL", [])
            if interval_list:
                recurrence_interval = int(interval_list[0])
            until_list = rrule.get("UNTIL", [])
            if until_list:
                u = until_list[0]
                recurrence_end = u.date() if isinstance(u, datetime) else u

        db.add(FamilyEvent(
            title=summary,
            event_date=ev_date,
            end_date=end_date_val,
            event_type="custom",
            description=description,
            color=EVENT_COLORS["custom"],
            is_recurring=recurrence_type is not None,
            recurrence_type=recurrence_type,
            recurrence_interval=recurrence_interval,
            recurrence_end=recurrence_end,
            is_public=True,
            created_by_id=current_user.id,
        ))
        imported += 1

    db.commit()
    return {"imported": imported, "skipped": skipped}


@router.post("", response_model=EventOut, status_code=status.HTTP_201_CREATED)
def create_event(
    body: EventCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    color = body.color or EVENT_COLORS.get(body.event_type, EVENT_COLORS["custom"])
    event = FamilyEvent(
        title=body.title,
        event_date=body.event_date,
        end_date=body.end_date,
        event_type=body.event_type,
        description=body.description,
        color=color,
        is_public=body.is_public,
        is_recurring=body.recurrence_type is not None,
        recurrence_type=body.recurrence_type,
        recurrence_interval=body.recurrence_interval,
        recurrence_end=body.recurrence_end,
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
        "recurrence_type": event.recurrence_type,
        "recurrence_interval": event.recurrence_interval,
        "recurrence_end": event.recurrence_end,
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
    updates = body.model_dump(exclude_none=True)
    for field, val in updates.items():
        setattr(event, field, val)
    if "recurrence_type" in updates:
        event.is_recurring = updates["recurrence_type"] is not None
    db.commit()
    db.refresh(event)
    return {
        "id": event.id, "title": event.title, "event_date": event.event_date,
        "end_date": event.end_date, "event_type": event.event_type,
        "description": event.description, "color": event.color,
        "linked_user_id": event.linked_user_id, "is_recurring": event.is_recurring,
        "recurrence_type": event.recurrence_type,
        "recurrence_interval": event.recurrence_interval,
        "recurrence_end": event.recurrence_end,
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
