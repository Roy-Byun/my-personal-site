import logging
import re
import time
from datetime import datetime, timedelta
from typing import Optional

import feedparser
import requests
from sqlalchemy import func
from sqlalchemy.orm import Session

from models import ArchivedArticle, NewsArticle, NewsSource

logger = logging.getLogger(__name__)

CATEGORIES = [
    "Politics", "Finance", "Technology", "Science",
    "Health", "Sports", "Entertainment", "Social", "General",
]

_KEYWORDS: dict[str, list[str]] = {
    "Politics": [
        "government", "election", "president", "congress", "senate",
        "parliament", "policy", "democrat", "republican", "legislation",
        "minister", "prime minister", "white house", "vote", "ballot",
        "diplomacy", "sanctions", "geopolitics", "military", "war",
    ],
    "Finance": [
        "stock", "market", "economy", "gdp", "inflation", "federal reserve",
        "interest rate", "nasdaq", "dow jones", "crypto", "bitcoin",
        "ethereum", "investment", "banking", "finance", "recession",
        "revenue", "earnings", "ipo", "hedge fund", "bonds", "trade deficit",
    ],
    "Technology": [
        "tech", "artificial intelligence", " ai ", "software", "hardware",
        "apple", "google", "microsoft", "meta", "amazon", "startup",
        "cybersecurity", "robot", "semiconductor", "chip", "cloud computing",
        "smartphone", "electric vehicle", "autonomous", "machine learning",
    ],
    "Science": [
        "science", "research", "discovery", "space", "nasa", "climate",
        "environment", "biology", "physics", "chemistry", "astronomy",
        "carbon emissions", "species", "gene", "dna", "experiment",
    ],
    "Health": [
        "health", "medical", "hospital", "drug", "treatment", "patient",
        "doctor", "surgery", "mental health", "covid", "cancer", "fda",
        "vaccine", "pandemic", "disease", "obesity", "nutrition", "clinical",
    ],
    "Sports": [
        "sport", "football", "basketball", "baseball", "soccer", "tennis",
        "golf", "nba", "nfl", "mlb", "olympic", "athlete", "championship",
        "tournament", "league", "coach", "transfer", "match", "goal",
    ],
    "Entertainment": [
        "movie", "film", "music", "celebrity", "actor", "singer",
        "award", "oscar", "grammy", "netflix", "hollywood", "streaming",
        "album", "concert", "box office", "tv show", "series", "trailer",
    ],
    "Social": [
        "social", "community", "education", "culture", "lifestyle",
        "travel", "food", "fashion", "art", "immigration", "housing",
        "poverty", "inequality", "protest", "civil rights", "diversity",
    ],
}

_HTML_TAG = re.compile(r"<[^>]+>")


def categorize(title: str, summary: str = "") -> str:
    text = (title + " " + (summary or "")).lower()
    scores = {cat: sum(1 for kw in kws if kw in text) for cat, kws in _KEYWORDS.items()}
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else "General"


# ── Date parsing ───────────────────────────────────────────────────────────

def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        import dateutil.parser
        return dateutil.parser.parse(value).replace(tzinfo=None)
    except Exception:
        return None


def _struct_to_dt(t) -> Optional[datetime]:
    if t is None:
        return None
    try:
        return datetime(*t[:6])
    except Exception:
        return None


# ── API fetchers ───────────────────────────────────────────────────────────

def fetch_newsapi(source: NewsSource) -> list[dict]:
    if not source.api_key:
        return []
    params: dict = {"apiKey": source.api_key, "pageSize": 50}
    if source.query:
        url = "https://newsapi.org/v2/everything"
        params["q"] = source.query
        params["sortBy"] = "publishedAt"
        if source.language:
            params["language"] = source.language
    else:
        url = "https://newsapi.org/v2/top-headlines"
        params["country"] = source.country or "us"

    resp = requests.get(url, params=params, timeout=15)
    resp.raise_for_status()
    data = resp.json()

    out = []
    for a in data.get("articles", []):
        link = a.get("url")
        if not link or link == "https://removed.com":
            continue
        title = (a.get("title") or "").strip()
        desc = (a.get("description") or "").strip()
        if not title:
            continue
        cat = source.category_override or categorize(title, desc)
        out.append({
            "title": title,
            "url": link,
            "source_name": (a.get("source") or {}).get("name") or source.name,
            "category": cat,
            "summary": desc or None,
            "image_url": a.get("urlToImage"),
            "author": a.get("author"),
            "published_at": _parse_dt(a.get("publishedAt")),
        })
    return out


def fetch_gnews(source: NewsSource) -> list[dict]:
    if not source.api_key:
        return []
    params: dict = {"token": source.api_key, "max": 50}
    if source.language:
        params["lang"] = source.language
    if source.country:
        params["country"] = source.country
    if source.query:
        url = "https://gnews.io/api/v4/search"
        params["q"] = source.query
    else:
        url = "https://gnews.io/api/v4/top-headlines"

    resp = requests.get(url, params=params, timeout=15)
    resp.raise_for_status()
    data = resp.json()

    out = []
    for a in data.get("articles", []):
        link = a.get("url")
        if not link:
            continue
        title = (a.get("title") or "").strip()
        desc = (a.get("description") or "").strip()
        if not title:
            continue
        cat = source.category_override or categorize(title, desc)
        out.append({
            "title": title,
            "url": link,
            "source_name": (a.get("source") or {}).get("name") or source.name,
            "category": cat,
            "summary": desc or None,
            "image_url": a.get("image"),
            "author": None,
            "published_at": _parse_dt(a.get("publishedAt")),
        })
    return out


def fetch_rss(source: NewsSource) -> list[dict]:
    if not source.rss_url:
        return []
    feed = feedparser.parse(source.rss_url)
    feed_title = getattr(feed.feed, "title", None) or source.name

    out = []
    for entry in feed.entries:
        link = entry.get("link") or entry.get("id")
        if not link:
            continue
        title = (entry.get("title") or "").strip()
        if not title:
            continue

        raw_summary = entry.get("summary") or entry.get("description") or ""
        summary = _HTML_TAG.sub("", raw_summary).strip()[:600] or None

        image_url = None
        if getattr(entry, "media_content", None):
            image_url = entry.media_content[0].get("url")
        elif getattr(entry, "media_thumbnail", None):
            image_url = entry.media_thumbnail[0].get("url")
        elif getattr(entry, "enclosures", None):
            for enc in entry.enclosures:
                if "image" in (enc.get("type") or ""):
                    image_url = enc.get("href")
                    break

        cat = source.category_override or categorize(title, summary or "")
        out.append({
            "title": title,
            "url": link,
            "source_name": feed_title,
            "category": cat,
            "summary": summary,
            "image_url": image_url,
            "author": entry.get("author"),
            "published_at": _struct_to_dt(entry.get("published_parsed")),
        })
    return out


# ── DB helpers ─────────────────────────────────────────────────────────────

def save_articles(db: Session, raw: list[dict]) -> int:
    saved = 0
    for a in raw:
        if not a.get("title") or not a.get("url"):
            continue
        exists = db.query(NewsArticle.id).filter(NewsArticle.url == a["url"]).first()
        if not exists:
            db.add(NewsArticle(**a))
            saved += 1
    if saved:
        db.commit()
    return saved


def archive_article(
    db: Session, article: NewsArticle, note: Optional[str] = None
) -> ArchivedArticle:
    max_idx = (
        db.query(func.max(ArchivedArticle.archive_index))
        .filter(ArchivedArticle.category == article.category)
        .scalar()
        or 0
    )
    archived = ArchivedArticle(
        original_id=article.id,
        title=article.title,
        url=article.url,
        source_name=article.source_name,
        category=article.category,
        summary=article.summary,
        image_url=article.image_url,
        author=article.author,
        published_at=article.published_at,
        archive_index=max_idx + 1,
        archive_note=note,
    )
    db.add(archived)
    db.delete(article)
    db.commit()
    db.refresh(archived)
    return archived


# ── SerpAPI (Google News) ──────────────────────────────────────────────────

_RELATIVE_DATE = re.compile(
    r"(\d+)\s+(minute|hour|day|week|month)s?\s+ago", re.IGNORECASE
)

def _parse_serpapi_date(value: Optional[str]) -> Optional[datetime]:
    """Parse SerpAPI date strings like '2 hours ago' or '1/4/2024, 2:00 PM, +0000 UTC'."""
    if not value:
        return None
    m = _RELATIVE_DATE.match(value.strip())
    if m:
        n, unit = int(m.group(1)), m.group(2).lower()
        delta = {
            "minute": timedelta(minutes=n),
            "hour":   timedelta(hours=n),
            "day":    timedelta(days=n),
            "week":   timedelta(weeks=n),
            "month":  timedelta(days=n * 30),
        }.get(unit, timedelta(0))
        return datetime.utcnow() - delta
    return _parse_dt(value)


def fetch_serpapi(source: NewsSource) -> list[dict]:
    if not source.api_key:
        return []
    params = {
        "engine":  "google_news",
        "api_key": source.api_key,
        "q":       source.query or "top news",
        "hl":      source.language or "en",
        "gl":      source.country or "us",
        "num":     30,
    }
    resp = requests.get("https://serpapi.com/search.json", params=params, timeout=20)
    resp.raise_for_status()
    data = resp.json()

    out = []
    for a in data.get("news_results", []):
        link = a.get("link")
        if not link:
            continue
        title = (a.get("title") or "").strip()
        if not title:
            continue
        snippet = (a.get("snippet") or "").strip()
        src_meta = a.get("source") or {}
        source_name = src_meta.get("name") or source.name
        authors = src_meta.get("authors") or []
        author = authors[0] if authors else None
        cat = source.category_override or categorize(title, snippet)
        out.append({
            "title":        title,
            "url":          link,
            "source_name":  source_name,
            "category":     cat,
            "summary":      snippet or None,
            "image_url":    a.get("thumbnail"),
            "author":       author,
            "published_at": _parse_serpapi_date(a.get("date")),
        })
    return out


# ── Scheduled jobs ─────────────────────────────────────────────────────────

def run_fetch_cycle(db: Session) -> None:
    sources = db.query(NewsSource).filter(NewsSource.enabled == True).all()
    for source in sources:
        try:
            if source.source_type == "newsapi":
                articles = fetch_newsapi(source)
            elif source.source_type == "gnews":
                articles = fetch_gnews(source)
            elif source.source_type == "rss":
                articles = fetch_rss(source)
            elif source.source_type == "serpapi":
                articles = fetch_serpapi(source)
            else:
                continue
            count = save_articles(db, articles)
            source.last_fetched_at = datetime.utcnow()
            db.commit()
            logger.info("Fetched %d new articles from '%s'", count, source.name)
        except Exception as exc:
            logger.warning("Error fetching from '%s': %s", source.name, exc)


def cleanup_old_articles(db: Session) -> None:
    cutoff = datetime.utcnow() - timedelta(hours=24)
    deleted = (
        db.query(NewsArticle)
        .filter(
            NewsArticle.fetched_at < cutoff,
            NewsArticle.is_manual == False,
        )
        .delete(synchronize_session=False)
    )
    db.commit()
    if deleted:
        logger.info("Cleaned up %d expired news articles", deleted)
