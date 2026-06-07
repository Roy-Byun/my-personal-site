from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from auth_utils import require_admin
from database import get_db
from models import ArchivedArticle, NewsArticle, NewsSource, User
from news_fetcher import CATEGORIES, archive_article, categorize, run_fetch_cycle

router = APIRouter(prefix="/news", tags=["news"])

_PER_PAGE = 20


# ── Schemas ────────────────────────────────────────────────────────────────

class ArticleOut(BaseModel):
    id: int
    title: str
    url: str
    source_name: Optional[str]
    category: str
    summary: Optional[str]
    image_url: Optional[str]
    author: Optional[str]
    published_at: Optional[datetime]
    fetched_at: datetime
    is_manual: bool

    model_config = {"from_attributes": True}


class ArchivedOut(BaseModel):
    id: int
    original_id: Optional[int]
    title: str
    url: str
    source_name: Optional[str]
    category: str
    summary: Optional[str]
    image_url: Optional[str]
    author: Optional[str]
    published_at: Optional[datetime]
    archived_at: datetime
    archive_index: Optional[int]
    archive_note: Optional[str]

    model_config = {"from_attributes": True}


class SourceOut(BaseModel):
    id: int
    name: str
    source_type: str
    has_api_key: bool = False
    rss_url: Optional[str]
    query: Optional[str]
    country: Optional[str]
    language: Optional[str]
    category_override: Optional[str]
    enabled: bool
    last_fetched_at: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_masked(cls, src: NewsSource) -> "SourceOut":
        d = {c.name: getattr(src, c.name) for c in src.__table__.columns}
        d["has_api_key"] = bool(d.pop("api_key", None))
        return cls(**d)


class SourceCreate(BaseModel):
    name: str
    source_type: str
    api_key: Optional[str] = None
    rss_url: Optional[str] = None
    query: Optional[str] = None
    country: Optional[str] = "us"
    language: Optional[str] = "en"
    category_override: Optional[str] = None
    enabled: bool = True


class SourceUpdate(BaseModel):
    name: Optional[str] = None
    api_key: Optional[str] = None
    rss_url: Optional[str] = None
    query: Optional[str] = None
    country: Optional[str] = None
    language: Optional[str] = None
    category_override: Optional[str] = None
    enabled: Optional[bool] = None


class ArticleCreate(BaseModel):
    title: str
    url: str
    source_name: Optional[str] = None
    category: Optional[str] = None
    summary: Optional[str] = None
    image_url: Optional[str] = None
    author: Optional[str] = None
    published_at: Optional[datetime] = None


class ArchiveRequest(BaseModel):
    note: Optional[str] = None


# ── Public: read articles ──────────────────────────────────────────────────

@router.get("", response_model=dict)
def list_articles(
    category: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    db: Session = Depends(get_db),
):
    q = db.query(NewsArticle).order_by(
        NewsArticle.published_at.desc().nullslast(),
        NewsArticle.fetched_at.desc(),
    )
    if category and category != "All":
        q = q.filter(NewsArticle.category == category)
    total = q.count()
    articles = q.offset((page - 1) * _PER_PAGE).limit(_PER_PAGE).all()

    cat_counts = dict(
        db.query(NewsArticle.category, func.count(NewsArticle.id))
        .group_by(NewsArticle.category)
        .all()
    )
    return {
        "articles": [ArticleOut.model_validate(a) for a in articles],
        "total": total,
        "page": page,
        "per_page": _PER_PAGE,
        "has_more": (page * _PER_PAGE) < total,
        "categories": CATEGORIES,
        "category_counts": cat_counts,
    }


@router.get("/archive", response_model=dict)
def list_archive(
    category: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    db: Session = Depends(get_db),
):
    q = db.query(ArchivedArticle).order_by(ArchivedArticle.archived_at.desc())
    if category and category != "All":
        q = q.filter(ArchivedArticle.category == category)
    total = q.count()
    articles = q.offset((page - 1) * _PER_PAGE).limit(_PER_PAGE).all()
    return {
        "articles": [ArchivedOut.model_validate(a) for a in articles],
        "total": total,
        "page": page,
        "per_page": _PER_PAGE,
        "has_more": (page * _PER_PAGE) < total,
    }


# ── Admin: manual fetch trigger ────────────────────────────────────────────

@router.post("/fetch", status_code=status.HTTP_202_ACCEPTED)
def trigger_fetch(
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    run_fetch_cycle(db)
    return {"detail": "Fetch cycle completed"}


# ── Admin: article CRUD ────────────────────────────────────────────────────

@router.post("", response_model=ArticleOut, status_code=status.HTTP_201_CREATED)
def create_article(
    body: ArticleCreate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if db.query(NewsArticle).filter(NewsArticle.url == body.url).first():
        raise HTTPException(400, "Article URL already exists")
    cat = body.category or categorize(body.title, body.summary or "")
    article = NewsArticle(
        title=body.title,
        url=body.url,
        source_name=body.source_name,
        category=cat,
        summary=body.summary,
        image_url=body.image_url,
        author=body.author,
        published_at=body.published_at or datetime.utcnow(),
        is_manual=True,
    )
    db.add(article)
    db.commit()
    db.refresh(article)
    return article


@router.delete("/{article_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_article(
    article_id: int,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    a = db.query(NewsArticle).filter(NewsArticle.id == article_id).first()
    if not a:
        raise HTTPException(404, "Article not found")
    db.delete(a)
    db.commit()


@router.post("/{article_id}/archive", response_model=ArchivedOut)
def archive_one(
    article_id: int,
    body: ArchiveRequest = ArchiveRequest(),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    a = db.query(NewsArticle).filter(NewsArticle.id == article_id).first()
    if not a:
        raise HTTPException(404, "Article not found")
    return archive_article(db, a, body.note)


@router.delete("/archive/{archive_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_archived(
    archive_id: int,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    a = db.query(ArchivedArticle).filter(ArchivedArticle.id == archive_id).first()
    if not a:
        raise HTTPException(404, "Archived article not found")
    db.delete(a)
    db.commit()


# ── Admin: sources CRUD ────────────────────────────────────────────────────

@router.get("/sources", response_model=List[SourceOut])
def list_sources(
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return [SourceOut.from_orm_masked(s) for s in db.query(NewsSource).order_by(NewsSource.created_at).all()]


@router.post("/sources", response_model=SourceOut, status_code=status.HTTP_201_CREATED)
def create_source(
    body: SourceCreate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if body.source_type not in ("newsapi", "gnews", "rss", "serpapi"):
        raise HTTPException(400, "source_type must be newsapi, gnews, rss, or serpapi")
    source = NewsSource(**body.model_dump())
    db.add(source)
    db.commit()
    db.refresh(source)
    return SourceOut.from_orm_masked(source)


@router.put("/sources/{source_id}", response_model=SourceOut)
def update_source(
    source_id: int,
    body: SourceUpdate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    source = db.query(NewsSource).filter(NewsSource.id == source_id).first()
    if not source:
        raise HTTPException(404, "Source not found")
    for field, val in body.model_dump(exclude_none=True).items():
        setattr(source, field, val)
    db.commit()
    db.refresh(source)
    return SourceOut.from_orm_masked(source)


@router.delete("/sources/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_source(
    source_id: int,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    source = db.query(NewsSource).filter(NewsSource.id == source_id).first()
    if not source:
        raise HTTPException(404, "Source not found")
    db.delete(source)
    db.commit()
