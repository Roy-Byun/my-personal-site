from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from auth_utils import get_current_user, get_optional_user
from database import get_db
from models import FamilyPost, PostReaction, User

router = APIRouter(prefix="/posts", tags=["posts"])

ALLOWED_EMOJIS = {"❤️", "🎉", "😢", "💪", "🙏", "😊"}
PER_PAGE = 10


class ReactionSummary(BaseModel):
    emoji: str
    count: int
    reacted: bool   # current user has reacted


class PostOut(BaseModel):
    id: int
    title: Optional[str]
    content: str
    image_url: Optional[str]
    post_type: str
    author_id: int
    author_name: Optional[str]
    is_pinned: bool
    created_at: datetime
    reactions: List[ReactionSummary] = []

    model_config = {"from_attributes": True}


class PostCreate(BaseModel):
    title: Optional[str] = None
    content: str
    image_url: Optional[str] = None
    post_type: str = "update"


class PostUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    image_url: Optional[str] = None
    post_type: Optional[str] = None
    is_pinned: Optional[bool] = None


class ReactRequest(BaseModel):
    emoji: str


def _build_reactions(db: Session, post_id: int, user_id: Optional[int]) -> List[ReactionSummary]:
    rows = (
        db.query(PostReaction.emoji, func.count(PostReaction.id).label("cnt"))
        .filter(PostReaction.post_id == post_id)
        .group_by(PostReaction.emoji)
        .all()
    )
    reacted_set: set = set()
    if user_id:
        reacted_set = {
            r.emoji
            for r in db.query(PostReaction.emoji)
            .filter(PostReaction.post_id == post_id, PostReaction.user_id == user_id)
            .all()
        }
    return [ReactionSummary(emoji=row.emoji, count=row.cnt, reacted=row.emoji in reacted_set) for row in rows]


def _serialize(post: FamilyPost, db: Session, user_id: Optional[int]) -> dict:
    d = {c.name: getattr(post, c.name) for c in post.__table__.columns}
    d["reactions"] = _build_reactions(db, post.id, user_id)
    return d


@router.get("", response_model=dict)
def list_posts(
    page: int = Query(1, ge=1),
    current_user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    uid = current_user.id if current_user else None
    q = db.query(FamilyPost).order_by(
        FamilyPost.is_pinned.desc(), FamilyPost.created_at.desc()
    )
    total = q.count()
    posts = q.offset((page - 1) * PER_PAGE).limit(PER_PAGE).all()
    return {
        "posts": [_serialize(p, db, uid) for p in posts],
        "total": total,
        "page": page,
        "per_page": PER_PAGE,
        "has_more": (page * PER_PAGE) < total,
    }


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
def create_post(
    body: PostCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if body.post_type not in ("achievement", "milestone", "memorial", "update"):
        raise HTTPException(400, "Invalid post_type")
    name = (
        f"{current_user.last_name or ''}{current_user.first_name or ''}".strip()
        or current_user.western_name
        or current_user.full_name
        or current_user.username
    )
    post = FamilyPost(
        **body.model_dump(),
        author_id=current_user.id,
        author_name=name,
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    return _serialize(post, db, current_user.id)


@router.put("/{post_id}", response_model=dict)
def update_post(
    post_id: int,
    body: PostUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    post = db.query(FamilyPost).filter(FamilyPost.id == post_id).first()
    if not post:
        raise HTTPException(404, "Post not found")
    if post.author_id != current_user.id and current_user.role != "admin":
        raise HTTPException(403, "Not allowed")
    # Only admin can pin
    if body.is_pinned is not None and current_user.role != "admin":
        raise HTTPException(403, "Only admin can pin posts")
    for field, val in body.model_dump(exclude_none=True).items():
        setattr(post, field, val)
    db.commit()
    db.refresh(post)
    return _serialize(post, db, current_user.id)


@router.delete("/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_post(
    post_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    post = db.query(FamilyPost).filter(FamilyPost.id == post_id).first()
    if not post:
        raise HTTPException(404, "Post not found")
    if post.author_id != current_user.id and current_user.role != "admin":
        raise HTTPException(403, "Not allowed")
    db.delete(post)
    db.commit()


@router.post("/{post_id}/react", status_code=status.HTTP_200_OK)
def toggle_reaction(
    post_id: int,
    body: ReactRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if body.emoji not in ALLOWED_EMOJIS:
        raise HTTPException(400, f"Emoji must be one of: {', '.join(ALLOWED_EMOJIS)}")
    post = db.query(FamilyPost).filter(FamilyPost.id == post_id).first()
    if not post:
        raise HTTPException(404, "Post not found")
    existing = (
        db.query(PostReaction)
        .filter(
            PostReaction.post_id == post_id,
            PostReaction.user_id == current_user.id,
            PostReaction.emoji == body.emoji,
        )
        .first()
    )
    if existing:
        db.delete(existing)
    else:
        db.add(PostReaction(post_id=post_id, user_id=current_user.id, emoji=body.emoji))
    db.commit()
    return {"reactions": _build_reactions(db, post_id, current_user.id)}
