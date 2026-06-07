import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from auth_utils import hash_password
from database import Base, SessionLocal, engine
from models import User
from routers import auth, health, system, users

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


@app.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(bind=engine)
    _run_migrations()
    _seed_admin()


def _run_migrations() -> None:
    """Idempotent column additions — runs ALTER TABLE for any column that doesn't
    exist yet.  Safe to call on every boot; errors per column are swallowed."""
    new_columns = [
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
        for col, col_type in new_columns:
            try:
                conn.execute(text(f"ALTER TABLE users ADD COLUMN {col} {col_type}"))
            except Exception:
                pass  # column already exists — safe to ignore


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
