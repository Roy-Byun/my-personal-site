from datetime import datetime
from sqlalchemy import Boolean, Column, Date, DateTime, Integer, String, Text
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False, index=True)
    email = Column(String, unique=True, nullable=True)
    hashed_password = Column(String, nullable=False)
    role = Column(String, nullable=False, default="user")

    # Name
    full_name = Column(String, nullable=True)          # legacy – kept for seed compat
    first_name = Column(String, nullable=True)         # 이름
    last_name = Column(String, nullable=True)          # 성
    western_name = Column(String, nullable=True)       # 영어이름

    # Birthday
    birthday = Column(Date, nullable=True)             # 양력 (solar / Gregorian)
    birthday_lunar = Column(Date, nullable=True)       # 음력 (lunar)
    is_lunar = Column(Boolean, nullable=True, default=False)

    # Contact
    country_code = Column(String(10), nullable=True)   # e.g. "+82"
    phone_number = Column(String(20), nullable=True)

    # Profile
    profile_picture_url = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)


class NewsSource(Base):
    __tablename__ = "news_sources"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    source_type = Column(String, nullable=False)          # "newsapi" | "gnews" | "rss"
    api_key = Column(String, nullable=True)               # newsapi / gnews
    rss_url = Column(String, nullable=True)               # rss only
    query = Column(String, nullable=True)                 # search query for api types
    country = Column(String(10), nullable=True, default="us")
    language = Column(String(10), nullable=True, default="en")
    category_override = Column(String, nullable=True)     # force all articles to this category
    enabled = Column(Boolean, nullable=False, default=True)
    last_fetched_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class NewsArticle(Base):
    __tablename__ = "news_articles"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    url = Column(String, nullable=False, unique=True, index=True)
    source_name = Column(String, nullable=True)
    category = Column(String, nullable=False, default="General", index=True)
    summary = Column(Text, nullable=True)
    image_url = Column(String, nullable=True)
    author = Column(String, nullable=True)
    published_at = Column(DateTime, nullable=True)
    fetched_at = Column(DateTime, default=datetime.utcnow, index=True)
    is_manual = Column(Boolean, nullable=False, default=False)


class ArchivedArticle(Base):
    __tablename__ = "archived_articles"

    id = Column(Integer, primary_key=True, index=True)
    original_id = Column(Integer, nullable=True)
    title = Column(String, nullable=False)
    url = Column(String, nullable=False, index=True)
    source_name = Column(String, nullable=True)
    category = Column(String, nullable=False, default="General", index=True)
    summary = Column(Text, nullable=True)
    image_url = Column(String, nullable=True)
    author = Column(String, nullable=True)
    published_at = Column(DateTime, nullable=True)
    archived_at = Column(DateTime, default=datetime.utcnow, index=True)
    archive_index = Column(Integer, nullable=True)
    archive_note = Column(String, nullable=True)
