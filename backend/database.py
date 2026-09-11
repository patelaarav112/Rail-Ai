"""
RailMind AI — Database Configuration
Supports SQLite (default, zero-setup) and PostgreSQL via DATABASE_URL env var.

Usage:
  SQLite  : DATABASE_URL=sqlite:///./railmind.db   (default)
  Postgres: DATABASE_URL=postgresql://user:pass@localhost:5432/railmind
"""
import os
import logging
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger("railmind.db")

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./railmind.db")

_is_sqlite = DATABASE_URL.startswith("sqlite")
_is_postgres = DATABASE_URL.startswith("postgresql") or DATABASE_URL.startswith("postgres")

# ─── Engine configuration ────────────────────────────────────────────────────
if _is_sqlite:
    # SQLite: single-threaded, no connection pool needed
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
        echo=False,
    )
elif _is_postgres:
    # PostgreSQL: production-grade pool settings
    engine = create_engine(
        DATABASE_URL,
        pool_size=10,          # base connection pool size
        max_overflow=20,       # extra connections under load
        pool_pre_ping=True,    # verify connection health before use
        pool_recycle=300,      # recycle connections every 5 minutes
        echo=False,
    )
else:
    # Other databases (MySQL, etc.) — basic setup
    engine = create_engine(DATABASE_URL, echo=False)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI dependency — yields a DB session, always closes on exit."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    """Create all ORM-mapped tables on startup."""
    from models import tms, smms, tdms, block, corridor, activity  # noqa – registers models
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("✅ Database tables created/verified.")
    except Exception as exc:
        logger.error(f"❌ Failed to create tables: {exc}")
        raise


def check_db_connection() -> dict:
    """Health-check the database connection. Returns status dict."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_type = "PostgreSQL" if _is_postgres else "SQLite"
        return {"status": "ok", "db": db_type, "url_masked": DATABASE_URL[:30] + "..."}
    except Exception as exc:
        return {"status": "error", "detail": str(exc)}
