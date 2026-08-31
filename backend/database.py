import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./local_dev.db")

_IS_SQLITE = DATABASE_URL.startswith("sqlite")

if _IS_SQLITE:
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
    )
else:
    # Postgres on a shared, often-busy host: validate connections before use,
    # recycle them, keep the pool generous for the anyio threadpool + background
    # jobs, and fail fast rather than hang when things go wrong.
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        pool_recycle=1800,
        pool_size=10,
        max_overflow=20,
        pool_timeout=10,
        connect_args={
            "connect_timeout": 10,
            # Cap any single statement / idle-in-transaction so one stuck query
            # can never pin a pooled connection indefinitely.
            "options": "-c statement_timeout=15000 -c idle_in_transaction_session_timeout=15000",
        },
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
