from collections import defaultdict

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models.corridor import Corridor
from models.block import MaintenanceBlock
from services.live_data import score_live_assets, average_health, get_live_recommendations, fleet_ai_score, estimate_downtime_saved, DEPT_LABEL
from services.predictor import get_shap_importance
from services.activity import get_recent_activity, ensure_seed_activity
from services.scheduler import get_corridor_map_status
from services.security import require_department
from routers.coa import TRAINS

router = APIRouter(prefix="/dashboard", tags=["Dashboard"], dependencies=[Depends(require_department())])

_OPEN_STATUSES = {"Open", "Overdue", "Warning", "Defect", "Scheduled"}


@router.get("/kpis")
def get_kpis(db: Session = Depends(get_db)):
    """Every value here is computed live from the database + the real
    XGBoost model — nothing is a fixed constant."""
    scored = score_live_assets(db)
    total = len(scored) or 1
    low_risk = sum(1 for s in scored if s["risk_level"] == "low")
    critical_open = sum(1 for s in scored if s["severity_label"] in ("critical", "Defect") and s["status"] in _OPEN_STATUSES)
    pending = sum(1 for s in scored if s["status"] in _OPEN_STATUSES)

    availability = average_health(scored)
    corridors = db.query(Corridor).all()
    trains_managed = sum(c.trains_today for c in corridors) or 0

    blocks_count = db.query(MaintenanceBlock).count()
    in_window = db.query(MaintenanceBlock).filter(MaintenanceBlock.start_hour < 4).count()
    window_pct = round((in_window / blocks_count) * 100, 0) if blocks_count else 0
    downtime_saved = estimate_downtime_saved(blocks_count, in_window)

    on_time = sum(1 for t in TRAINS if t["on_time"])
    ai_score = fleet_ai_score(scored)

    return {
        "availability": {"value": availability, "change": f"{low_risk}/{total} assets low-risk", "positive": True},
        "blocks": {"value": blocks_count, "change": f"{window_pct:.0f}% in low-traffic window", "positive": True},
        "downtime": {"value": downtime_saved, "change": f"{in_window} blocks scheduled 00:00-04:00", "positive": True},
        "trains": {"value": trains_managed, "change": f"{len(corridors)} corridors · {on_time}/{len(TRAINS)} on time", "positive": True},
        "tasks": {"value": pending, "change": f"{critical_open} critical priority", "positive": critical_open == 0},
        "ai_score": {"value": ai_score, "change": "Excellent" if ai_score >= 85 else "Good" if ai_score >= 70 else "Needs attention", "positive": ai_score >= 70},
    }


@router.get("/kpi-details")
def get_kpi_details(db: Session = Depends(get_db)):
    """Drill-down behind each Command Center KPI card, computed from the
    exact same data the KPI numbers themselves come from — so clicking a
    card explains the number instead of opening a separate, disconnected
    view."""
    scored = score_live_assets(db)
    categories = ["Track", "Signal", "Traction/OHE"]
    low_risk = [s for s in scored if s["risk_level"] == "low"]
    top_risk = sorted((s for s in scored if s["risk_level"] != "low"), key=lambda s: -s["failure_probability"])[:5]

    blocks = db.query(MaintenanceBlock).all()
    dept_counts, priority_counts = defaultdict(int), defaultdict(int)
    for b in blocks:
        dept_counts[b.department] += 1
        priority_counts[b.priority] += 1
    in_window = [b for b in blocks if b.start_hour < 4]

    corridors = db.query(Corridor).all()
    open_items = [s for s in scored if s["status"] in _OPEN_STATUSES]
    critical_items = sorted(
        (s for s in open_items if s["severity_label"] in ("critical", "Defect")),
        key=lambda s: -s["ai_priority"],
    )[:5]

    return {
        "availability": {
            "by_category": [{"category": c, "value": average_health(scored, c)} for c in categories],
            "low_risk_count": len(low_risk),
            "total_count": len(scored),
            "top_risk_assets": [
                {"asset_ref": s["asset_ref"], "title": s["title"], "location": s["location"],
                 "failure_probability": s["failure_probability"], "department": DEPT_LABEL.get(s["department"], s["department"])}
                for s in top_risk
            ],
        },
        "blocks": {
            "total": len(blocks),
            "by_department": {DEPT_LABEL.get(k, k): v for k, v in dept_counts.items()},
            "by_priority": dict(priority_counts),
        },
        "downtime": {
            "blocks_in_window": len(in_window),
            "total_blocks": len(blocks),
            "sample_blocks": [
                {"label": b.label, "section": b.section, "start_hour": b.start_hour, "end_hour": b.end_hour}
                for b in in_window[:5]
            ],
        },
        "trains": {
            "corridors": [
                {"name": c.name, "trains_today": c.trains_today, "availability": c.availability, "zone": c.zone}
                for c in corridors
            ],
            "on_time": sum(1 for t in TRAINS if t["on_time"]),
            "total": len(TRAINS),
            "delayed": [{"name": t["name"], "delay": t["delay"]} for t in TRAINS if not t["on_time"]],
        },
        "tasks": {
            "total_pending": len(open_items),
            "critical_count": len(critical_items),
            "top_items": [
                {"asset_ref": s["asset_ref"], "title": s["title"], "location": s["location"],
                 "severity": s["severity_label"], "department": DEPT_LABEL.get(s["department"], s["department"])}
                for s in critical_items
            ],
        },
        "ai_score": {
            "score": fleet_ai_score(scored),
            "low_risk_pct": round(len(low_risk) / (len(scored) or 1) * 100, 1),
            "feature_importance": get_shap_importance(),
        },
    }


@router.get("/recommendations")
def get_recommendations(db: Session = Depends(get_db)):
    """Top real assets by XGBoost failure probability, turned into
    actionable recommendations the UI can Accept straight into a block."""
    return get_live_recommendations(db)


@router.get("/activity")
def get_activity(db: Session = Depends(get_db)):
    """Real event log — populated as the app is actually used (optimizer
    runs, syncs, blocks scheduled). Seeded with a startup line so it's never
    empty on first load."""
    ensure_seed_activity(db)
    return get_recent_activity(db)


@router.get("/corridor-map")
def get_corridor_map(db: Session = Depends(get_db)):
    """Real per-section status for today's schedule — which section has a
    block running, which one (if any) has an actual unresolved conflict.
    Backs the Dashboard's Live Corridor Map, replacing what used to be a
    fixed illustration (AGC permanently "critical") with today's real data."""
    return get_corridor_map_status(db)


@router.get("/ticker")
def get_ticker():
    """Live train ticker built from the real COA timetable."""
    messages = []
    for t in TRAINS:
        if t["on_time"]:
            messages.append(f"{t['name']}: ON TIME — dep {t['dep']} / arr {t['arr']}")
        else:
            messages.append(f"{t['name']}: {t['delay']} min LATE — dep {t['dep']}")
    return messages
