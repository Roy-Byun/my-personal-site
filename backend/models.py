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

    # Account status
    is_active = Column(Boolean, nullable=False, default=True)
    deactivated_at = Column(DateTime, nullable=True)
    is_suspended = Column(Boolean, nullable=False, default=False)
    suspended_until = Column(DateTime, nullable=True)   # None = permanent ban
    suspension_reason = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)


class InviteToken(Base):
    __tablename__ = "invite_tokens"

    id = Column(Integer, primary_key=True, index=True)
    token = Column(String(64), unique=True, nullable=False, index=True)
    created_by_id = Column(Integer, nullable=False)
    note = Column(String, nullable=True)              # optional "for: Roy"
    expires_at = Column(DateTime, nullable=False)
    used_at = Column(DateTime, nullable=True)
    used_by_id = Column(Integer, nullable=True)
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
    is_archived = Column(Boolean, nullable=False, default=False)


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


class Announcement(Base):
    __tablename__ = "announcements"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    body = Column(Text, nullable=True)
    link = Column(String, nullable=True)
    priority = Column(String, nullable=False, default="normal")  # "normal" | "important"
    created_by = Column(String, nullable=True)                   # username of creator
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)


class FamilyEvent(Base):
    __tablename__ = "family_events"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    event_date = Column(Date, nullable=False, index=True)
    end_date = Column(Date, nullable=True)
    event_type = Column(String, nullable=False, default="custom")
    # "birthday" | "holiday_kr" | "holiday_sg" | "leave" | "custom"
    description = Column(Text, nullable=True)
    color = Column(String(20), nullable=True)
    linked_user_id = Column(Integer, nullable=True)   # birthday owner
    is_recurring = Column(Boolean, nullable=False, default=False)
    recurrence_type = Column(String(20), nullable=True)      # "daily"|"weekly"|"monthly"|"yearly"
    recurrence_interval = Column(Integer, nullable=True, default=1)
    recurrence_end = Column(Date, nullable=True)
    is_public = Column(Boolean, nullable=False, default=True)
    created_by_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class FamilyRelationship(Base):
    __tablename__ = "family_relationships"

    id = Column(Integer, primary_key=True, index=True)
    from_user_id = Column(Integer, nullable=False, index=True)
    to_user_id = Column(Integer, nullable=False, index=True)
    # "parent_of" | "spouse_of" | "sibling_of"
    relation_type = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class FamilyPost(Base):
    __tablename__ = "family_posts"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=True)
    content = Column(Text, nullable=False)
    image_url = Column(String, nullable=True)
    post_type = Column(String, nullable=False, default="update")
    # "achievement" | "milestone" | "memorial" | "update"
    author_id = Column(Integer, nullable=False)
    author_name = Column(String, nullable=True)      # denormalized for display
    is_pinned = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class PostReaction(Base):
    __tablename__ = "post_reactions"

    id = Column(Integer, primary_key=True, index=True)
    post_id = Column(Integer, nullable=False, index=True)
    user_id = Column(Integer, nullable=False)
    emoji = Column(String(10), nullable=False)  # ❤️ 🎉 😢 💪 🙏 😊


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    project_type = Column(String, nullable=False, default="other")   # "github" | "study" | "planning" | "other"
    status = Column(String, nullable=False, default="active")        # "active" | "paused" | "completed" | "archived"

    # GitHub integration (only relevant when project_type == "github")
    github_repo = Column(String, nullable=True)               # "owner/repo", admin-entered
    github_description = Column(Text, nullable=True)          # auto-synced
    github_language = Column(String, nullable=True)           # auto-synced
    github_stars = Column(Integer, nullable=True)              # auto-synced
    github_last_commit_at = Column(DateTime, nullable=True)    # auto-synced
    github_url = Column(String, nullable=True)                 # auto-synced
    github_synced_at = Column(DateTime, nullable=True)          # last successful sync
    github_sync_error = Column(String, nullable=True)          # admin-only visibility

    external_url = Column(String, nullable=True)
    tags = Column(String, nullable=True)                        # comma-separated
    is_public = Column(Boolean, nullable=False, default=True)   # lets admin draft before publishing
    sort_order = Column(Integer, nullable=False, default=0)

    created_by_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)


class ProjectTask(Base):
    __tablename__ = "project_tasks"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, nullable=False, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="todo")       # "todo" | "in_progress" | "done"
    priority = Column(String, nullable=False, default="normal")   # "low" | "normal" | "high"
    due_date = Column(Date, nullable=True)
    position = Column(Integer, nullable=False, default=0)   # dense ordering within (project_id, status)

    created_by_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)


class AboutProfile(Base):
    __tablename__ = "about_profile"   # singleton row, lazily created on first GET/PUT

    id = Column(Integer, primary_key=True, index=True)
    headline = Column(String, nullable=True)
    bio = Column(Text, nullable=True)
    photo_url = Column(String, nullable=True)   # plain URL string, matches User.profile_picture_url convention
    updated_at = Column(DateTime, default=datetime.utcnow)


class ExperienceEntry(Base):
    __tablename__ = "experience_entries"

    id = Column(Integer, primary_key=True, index=True)
    entry_type = Column(String, nullable=False, default="work")   # "work" | "education"
    title = Column(String, nullable=False)
    organization = Column(String, nullable=False)
    location = Column(String, nullable=True)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)   # null = ongoing / "present"
    description = Column(Text, nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


class GalleryPhoto(Base):
    __tablename__ = "gallery_photos"

    id = Column(Integer, primary_key=True, index=True)
    photo_url = Column(String, nullable=False)
    caption = Column(String, nullable=True)
    taken_date = Column(Date, nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


class LifeMilestone(Base):
    __tablename__ = "life_milestones"

    id = Column(Integer, primary_key=True, index=True)
    label = Column(String, nullable=False)          # e.g. "PhD Completion"
    target_date = Column(DateTime, nullable=False)
    note = Column(Text, nullable=True)
    is_featured = Column(Boolean, nullable=False, default=False)   # only one enforced True at a time (app-level)
    created_at = Column(DateTime, default=datetime.utcnow)
