"""
RailMind AI — FastAPI Backend
Entry point. Run with: uvicorn main:app --reload --port 8000

Tech Stack:
  • FastAPI           — REST API framework
  • SQLAlchemy 2.x    — ORM (PostgreSQL / SQLite)
  • OR-Tools CP-SAT   — Constraint-programming block scheduler
  • XGBoost           — Predictive failure-risk scoring
  • psycopg2-binary   — PostgreSQL driver
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import create_tables, check_db_connection
from services.seeder import seed
from routers import (
    auth_router, tms_router, smms_router, tdms_router, blocks_router,
    corridors_router, coa_router, analytics_router, optimize_router,
    predict_router, dashboard_router, reports_router,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger("railmind")


# ─── Lifespan (startup / shutdown) ───────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Async startup/shutdown lifecycle handler (replaces deprecated @on_event)."""
    # --- Startup ---
    import sys
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass

    logger.info("🚆 RailMind AI — Backend starting...")

    # Check & report DB status
    db_status = check_db_connection()
    if db_status["status"] == "ok":
        logger.info(f"✅ Database connected: {db_status['db']}")
    else:
        logger.error(f"❌ Database connection failed: {db_status.get('detail')}")

    create_tables()
    seed()  # no-op if already seeded

    logger.info("✅ API ready → http://localhost:8000/api/docs")
    yield
    # --- Shutdown ---
    logger.info("🛑 RailMind AI — Backend shutting down.")


# ─── App ─────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="RailMind AI — Block Planning API",
    description=(
        "AI-powered automatic block planning for Indian Railways. "
        "Integrates TMS, SMMS, TDMS, COA with OR-Tools CP-SAT optimization "
        "and XGBoost predictive failure scoring.\n\n"
        "**Tech Stack**: FastAPI · OR-Tools CP-SAT · XGBoost · SQLAlchemy · "
        "PostgreSQL/SQLite · React Dashboard"
    ),
    version="2.5.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan,
)

# ─── CORS ────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",   # Vite dev server
        "http://localhost:3000",   # CRA dev server
        "http://localhost:4173",   # Vite preview
        "*",                       # Netlify / production (restrict in prod)
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routers (all prefixed with /api) ────────────────────────────────────────
PREFIX = "/api"
app.include_router(auth_router,      prefix=PREFIX)  # login is the only public router
app.include_router(tms_router,       prefix=PREFIX)
app.include_router(smms_router,      prefix=PREFIX)
app.include_router(tdms_router,      prefix=PREFIX)
app.include_router(blocks_router,    prefix=PREFIX)
app.include_router(corridors_router, prefix=PREFIX)
app.include_router(coa_router,       prefix=PREFIX)
app.include_router(analytics_router, prefix=PREFIX)
app.include_router(optimize_router,  prefix=PREFIX)
app.include_router(predict_router,   prefix=PREFIX)
app.include_router(dashboard_router, prefix=PREFIX)
app.include_router(reports_router,   prefix=PREFIX)


# ─── Health check ────────────────────────────────────────────────────────────
@app.get("/api/health", tags=["System"])
def health():
    """System health check — returns DB status and tech stack info."""
    db_status = check_db_connection()
    return {
        "status": "ok" if db_status["status"] == "ok" else "degraded",
        "service": "RailMind AI",
        "version": "2.5.0",
        "tech_stack": {
            "api": "FastAPI 0.111+",
            "optimizer": "OR-Tools CP-SAT 9.12+",
            "scoring": "XGBoost 2.0+",
            "orm": "SQLAlchemy 2.0+",
            "database": db_status.get("db", "unknown"),
        },
        "database": db_status,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
