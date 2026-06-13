from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth_utils import get_current_user, require_admin
from database import get_db
from models import FamilyRelationship, User

router = APIRouter(prefix="/family", tags=["family-tree"])


# ── helpers ────────────────────────────────────────────────────────────────

def _member_dict(u: User) -> dict:
    parts = [p for p in [u.last_name, u.first_name] if p]
    name = " ".join(parts) or u.western_name or u.full_name or u.username
    return {
        "id": u.id,
        "username": u.username,
        "name": name,
        "western_name": u.western_name,
        "role": u.role,
        "birthday": u.birthday.isoformat() if u.birthday else None,
        "profile_picture_url": u.profile_picture_url,
    }


# ── schemas ────────────────────────────────────────────────────────────────

class RelCreate(BaseModel):
    from_user_id: int
    to_user_id: int
    relation_type: str   # "parent_of" | "spouse_of" | "sibling_of"


class RelOut(BaseModel):
    id: int
    from_user_id: int
    to_user_id: int
    relation_type: str

    model_config = {"from_attributes": True}


# ── endpoints ──────────────────────────────────────────────────────────────

@router.get("/tree")
def get_tree(
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    members = db.query(User).order_by(User.created_at).all()
    rels = db.query(FamilyRelationship).all()
    return {
        "members": [_member_dict(m) for m in members],
        "relationships": [
            {"id": r.id, "from_user_id": r.from_user_id, "to_user_id": r.to_user_id,
             "relation_type": r.relation_type}
            for r in rels
        ],
    }


@router.post("/relationships", response_model=RelOut, status_code=201)
def add_relationship(
    body: RelCreate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if body.from_user_id == body.to_user_id:
        raise HTTPException(400, "Cannot relate a member to themselves")
    if body.relation_type not in ("parent_of", "spouse_of", "sibling_of"):
        raise HTTPException(400, "relation_type must be parent_of, spouse_of, or sibling_of")
    # Prevent exact duplicate
    existing = db.query(FamilyRelationship).filter(
        FamilyRelationship.from_user_id == body.from_user_id,
        FamilyRelationship.to_user_id == body.to_user_id,
        FamilyRelationship.relation_type == body.relation_type,
    ).first()
    if existing:
        raise HTTPException(409, "This relationship already exists")
    rel = FamilyRelationship(**body.model_dump())
    db.add(rel)
    db.commit()
    db.refresh(rel)
    return rel


@router.delete("/relationships/{rel_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_relationship(
    rel_id: int,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    rel = db.query(FamilyRelationship).filter(FamilyRelationship.id == rel_id).first()
    if not rel:
        raise HTTPException(404, "Relationship not found")
    db.delete(rel)
    db.commit()
