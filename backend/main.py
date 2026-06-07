import logging
import os

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from auth_utils import hash_password
from database import Base, SessionLocal, engine
from models import User
from news_fetcher import cleanup_old_articles, run_fetch_cycle
from routers import auth, health, system, users
from routers import news as news_router

logging.basicConfig(level=logging.INFO)

if os.path.exists("/host/proc"):
    os.environ["PROCFS_PATH"] = "/host/proc"

app = FastAPI(title="Roika Mini PC API")

ALLOWED_ORIGINS = [
    o.strip().rstrip("/")
    for o in os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:5173,http://localhost:5174",
    ).split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_scheduler = BackgroundScheduler(timezone="UTC")


def _news_fetch_job() -> None:
    db = SessionLocal()
    try:
        run_fetch_cycle(db)
    finally:
        db.close()


def _news_cleanup_job() -> None:
    db = SessionLocal()
    try:
        cleanup_old_articles(db)
    finally:
        db.close()


@app.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(bind=engine)
    _run_migrations()
    _seed_admin()

    _scheduler.add_job(_news_fetch_job, "interval", minutes=30, id="news_fetch", replace_existing=True)
    _scheduler.add_job(_news_cleanup_job, "interval", hours=24, id="news_cleanup", replace_existing=True)
    _scheduler.start()


@app.on_event("shutdown")
def shutdown() -> None:
    _scheduler.shutdown(wait=False)


def _run_migrations() -> None:
    users_columns = [
        ("first_name",          "VARCHAR"),
        ("last_name",           "VARCHAR"),
        ("western_name",        "VARCHAR"),
        ("birthday_lunar",      "DATE"),
        ("is_lunar",            "BOOLEAN DEFAULT FALSE"),
        ("country_code",        "VARCHAR(10)"),
        ("phone_number",        "VARCHAR(20)"),
        ("profile_picture_url", "TEXT"),
    ]
    with engine.begin() as conn:
        for col, col_type in users_columns:
            try:
                conn.execute(text(f"ALTER TABLE users ADD COLUMN {col} {col_type}"))
            except Exception:
                pass


def _seed_admin() -> None:
    username = os.getenv("ADMIN_USERNAME")
    password = os.getenv("ADMIN_PASSWORD")
    if not username or not password:
        return
    db = SessionLocal()
    try:
        if not db.query(User).filter(User.username == username).first():
            db.add(
                User(
                    username=username,
                    hashed_password=hash_password(password),
                    role="admin",
                    full_name=os.getenv("ADMIN_FULL_NAME", username),
                )
            )
            db.commit()
    finally:
        db.close()


app.include_router(health.router)
app.include_router(auth.router)
app.include_router(system.router)
app.include_router(users.router)
app.include_router(news_router.router)
