"""
Database connection via SQLAlchemy.
Defaults to SQLite for local development (no external services required).
Set DATABASE_URL=postgresql://... in .env to switch to PostgreSQL.
"""

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from config import settings

# ── ENGINE ────────────────────────────────────────────────────
_is_sqlite = settings.DATABASE_URL.startswith("sqlite")

if _is_sqlite:
    # SQLite: no connection pool, must allow same-thread access for dev
    engine = create_engine(
        settings.DATABASE_URL,
        connect_args={"check_same_thread": False},
        echo=False,
    )
else:
    # PostgreSQL: connection pool for concurrent requests
    engine = create_engine(
        settings.DATABASE_URL,
        pool_size=20,
        max_overflow=10,
        pool_pre_ping=True,
        pool_recycle=1800,
        echo=False,
    )

# ── SESSION FACTORY ───────────────────────────────────────────
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# ── BASE CLASS for all ORM models ─────────────────────────────
Base = declarative_base()


# ── DEPENDENCY (injected into FastAPI route handlers) ─────────
def get_db():
    """
    Yields a database session per request.
    Automatically closes the session when the request is done.
    Used with FastAPI's Depends() injection.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()