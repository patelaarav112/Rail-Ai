"""
RailMind AI — Live Data Bridge
Turns the real rows sitting in tms_defects / smms_assets / tdms_assets into a
single normalized asset list and runs them through the real XGBoost model
(services/predictor.py). Every "AI" surface in the app — dashboard
recommendations, predictive risk alerts, anomaly log, health forecasts, the
OR-Tools task list, and the sync/re-score buttons — is built on top of this,
so it reflects whatever is actually in the database instead of a hardcoded
shadow copy of it.
"""
from datetime import date
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from models.tms import TrackDefect
from models.smms import SignalAsset
from models.tdms import TractionAsset
from models.block import MaintenanceBlock
from services.predictor import score_assets

# Station code -> corridor section, so real defect/asset locations ("AGC km
# 187.4") land on one of the corridors the Block Planner / Gantt / optimizer
# actually track. Shared by the optimizer and the recommendation engine.
STATION_SECTION = {
    "NDLS": "NDLS-MTJ", "GZB": "NDLS-MTJ",
    "MTJ": "MTJ-AGC",
    "AGC": "AGC-CNB",
    "CNB": "CNB-ALD",
    "ALD": "ALD-MGS", "MGS": "ALD-MGS",
    "BPL": "BPL-ET", "ET": "BPL-ET",
    "HWH": "BPL-ET", "MAS": "BPL-ET",
}
SEVERITY_PRIORITY = {
    "critical": "critical", "Defect": "critical",
    "high": "high", "Warning": "high",
    "medium": "medium",
    "low": "low", "Normal": "low",
}
PRIORITY_DURATION_HOURS = {"critical": 2, "high": 2, "medium": 3, "low": 2}
DEPT_LABEL = {"engg": "Engineering", "trd": "TRD", "st": "S&T"}


def infer_section(location: str) -> str:
    token = location.split()[0].split("/")[0].upper() if location else ""
    return STATION_SECTION.get(token, "NDLS-MTJ")


def load_live_assets(db: Session, categories: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    """Pull real TMS/SMMS/TDMS rows and normalize them into one asset list.

    Each item: id, source (tms/smms/tdms), category (Track/Signal/Traction/OHE),
    department (engg/st/trd), asset_ref, title, location, severity_label,
    date_field, ai_priority, status — the shape services.predictor expects.

    Only "pending" work items are included — once a department marks
    something Done or Cancelled, it's resolved and should stop being scored,
    recommended, or alerted on (it still shows up in that department's own
    register, just no longer here). See routers/{tms,smms,tdms}.py's
    work-status endpoints.
    """
    categories = categories or ["tms", "smms", "tdms"]
    items: List[Dict[str, Any]] = []

    if "tms" in categories:
        for d in db.query(TrackDefect).filter(TrackDefect.work_status == "pending").all():
            items.append({
                "id": f"tms-{d.id}", "source": "tms", "category": "Track", "department": "engg",
                "asset_ref": d.defect_id, "title": d.defect_type, "location": d.location,
                "severity_label": d.severity, "date_field": d.reported_date,
                "ai_priority": d.ai_priority, "status": d.status,
            })
    if "smms" in categories:
        for a in db.query(SignalAsset).filter(SignalAsset.work_status == "pending").all():
            items.append({
                "id": f"smms-{a.id}", "source": "smms", "category": "Signal", "department": "st",
                "asset_ref": a.asset_id, "title": a.asset_type, "location": a.location,
                "severity_label": a.condition, "date_field": a.last_maintenance,
                "ai_priority": a.ai_priority, "status": a.status,
            })
    if "tdms" in categories:
        for a in db.query(TractionAsset).filter(TractionAsset.work_status == "pending").all():
            items.append({
                "id": f"tdms-{a.id}", "source": "tdms", "category": "Traction/OHE", "department": "trd",
                "asset_ref": a.asset_id, "title": a.asset_type, "location": a.location,
                "severity_label": a.status, "date_field": a.last_inspection,
                "ai_priority": a.ai_priority, "status": a.status,
            })
    return items


def score_live_assets(db: Session, categories: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    """Load real assets and run them through the trained XGBoost model —
    each result is enriched with failure_probability / risk_level /
    days_to_failure, sorted highest risk first."""
    items = load_live_assets(db, categories)
    if not items:
        return []
    scored = score_assets(items)
    scored.sort(key=lambda r: r["failure_probability"], reverse=True)
    return scored


def average_health(scored: List[Dict[str, Any]], category: Optional[str] = None) -> float:
    """100 - avg(failure_probability) for a category (or all assets)."""
    pool = [s for s in scored if category is None or s["category"] == category]
    if not pool:
        return 90.0
    return round(100 - sum(s["failure_probability"] for s in pool) / len(pool), 1)


def fleet_ai_score(scored: List[Dict[str, Any]]) -> float:
    """Overall AI confidence score — share of live-scored assets the model
    rates low-risk, rescaled onto a 60-100 band. Shared by the dashboard and
    reports endpoints so the same number is quoted everywhere."""
    if not scored:
        return 85.0
    low = sum(1 for s in scored if s["risk_level"] == "low")
    return round(60 + (low / len(scored)) * 40, 1)


def estimate_downtime_saved(blocks_count: int, in_window_count: int) -> float:
    """Rough hours-saved estimate: every block avoids ~0.4h of daytime
    disruption by existing at all, plus another ~0.6h for landing in the
    00:00-04:00 low-traffic window."""
    return round(blocks_count * 0.4 + in_window_count * 0.6, 1)


def _pending_block_labels(db: Session) -> List[str]:
    """Labels of every currently-scheduled-or-future block. The originating
    asset_ref is always embedded in the label (see the suggested_block
    builders below) — checking against it is what stops the recommendation
    and risk-alert engines from repeatedly surfacing, and letting someone
    re-accept, an asset that already has a preventive block booked."""
    rows = db.query(MaintenanceBlock.label).filter(MaintenanceBlock.date_offset >= 0).all()
    return [row[0] for row in rows]


def _has_pending_block(asset_ref: str, pending_labels: List[str]) -> bool:
    return any(asset_ref in label for label in pending_labels)


def get_live_risk_alerts(db: Session, top_n: int = 4) -> List[Dict[str, Any]]:
    """Highest-risk real assets that don't already have a block scheduled,
    formatted as failure-risk alert cards, each carrying a `suggested_block`
    the frontend's "Schedule Preventive Block" button can post straight to
    POST /api/blocks."""
    scored = score_live_assets(db)
    pending = _pending_block_labels(db)
    unaddressed = [s for s in scored if not _has_pending_block(s["asset_ref"], pending)]
    # Prefer genuinely high/medium-risk assets; only reach into low-risk
    # ones to fill the panel if every risky asset already has a block
    # booked — otherwise "everything risky is already handled" would render
    # as an empty panel instead of the reassuring signal it actually is.
    high_med = [s for s in unaddressed if s["risk_level"] in ("high", "medium")]
    high_med_refs = {s["asset_ref"] for s in high_med}
    top = (high_med + [s for s in unaddressed if s["asset_ref"] not in high_med_refs])[:top_n]
    results = []
    for s in top:
        priority = SEVERITY_PRIORITY.get(s["severity_label"], "medium")
        duration = PRIORITY_DURATION_HOURS[priority]
        results.append({
            "id": s["asset_ref"],
            "title": f"{s['title']} — {s['location']}",
            "level": s["risk_level"] if s["risk_level"] != "low" else "medium",
            "prob": int(s["failure_probability"]),
            "desc": (
                f"XGBoost model flags {s['failure_probability']}% failure probability "
                f"({s['severity_label']} severity, AI priority {s['ai_priority']}). "
                f"Predicted window: ~{s['days_to_failure']} days."
            ),
            "days": s["days_to_failure"],
            "suggested_block": {
                "section": infer_section(s["location"]),
                "department": s["department"],
                "label": f"Preventive — {s['title']} ({s['asset_ref']})",
                "start_hour": 2,
                "end_hour": 2 + duration,
                "date_offset": 0,
                "priority": priority,
            },
        })
    return results


def get_live_anomalies(db: Session, top_n: int = 5) -> List[Dict[str, Any]]:
    """Real assets scored by the model, formatted as the anomaly detection log."""
    scored = score_live_assets(db)
    colors = {"high": "#ef4444", "medium": "#f97316", "low": "#22c55e"}
    out = []
    for s in scored[:top_n]:
        out.append({
            "asset": f"{s['category']} — {s['asset_ref']} ({s['location']})",
            "desc": f"{s['title']} — status: {s['status']}, severity: {s['severity_label']}",
            "score": round(s["failure_probability"] / 100, 2),
            "bg": colors.get(s["risk_level"], "#22c55e"),
        })
    return out


def get_live_recommendations(db: Session, top_n: int = 4) -> List[Dict[str, Any]]:
    """Top-risk real assets that don't already have a block scheduled,
    turned into actionable recommendation cards, each carrying a
    `suggested_block` the frontend's Accept button can pass straight to
    POST /api/blocks to actually schedule it."""
    scored = score_live_assets(db)
    pending = _pending_block_labels(db)
    unaddressed = [s for s in scored if not _has_pending_block(s["asset_ref"], pending)][:top_n]
    recs = []
    for idx, s in enumerate(unaddressed):
        if s["risk_level"] == "high" and s["severity_label"] in ("critical", "Defect"):
            level = "critical"
        else:
            level = s["risk_level"]
        priority = SEVERITY_PRIORITY.get(s["severity_label"], "medium")
        duration = PRIORITY_DURATION_HOURS[priority]
        section = infer_section(s["location"])
        timing = "Tonight" if s["days_to_failure"] <= 3 else "This week" if s["days_to_failure"] <= 10 else "Next week"
        start_hour = 2 if idx % 2 == 0 else 0

        recs.append({
            "id": s["asset_ref"],
            "priority": f"P{idx + 1}",
            "level": level,
            "title": f"{s['title']} — {s['location']}",
            "desc": (
                f"XGBoost predicts {s['failure_probability']}% failure probability in "
                f"~{s['days_to_failure']} days. Schedule a {duration}h {DEPT_LABEL[s['department']]} "
                f"block in the {start_hour:02d}:00-{start_hour + duration:02d}:00 low-traffic window."
            ),
            "tags": [DEPT_LABEL[s["department"]], section, timing],
            "suggested_block": {
                "section": section,
                "department": s["department"],
                "label": f"{s['title']} — {s['asset_ref']}",
                "start_hour": start_hour,
                "end_hour": start_hour + duration,
                "date_offset": 0,
                "priority": priority,
            },
        })
    return recs


def get_live_forecast(db: Session) -> Dict[str, Any]:
    """30-day health projection anchored to today's real model-scored average
    health per category, decaying forward at a rate driven by that category's
    current risk level (higher current risk => faster projected decay)."""
    scored = score_live_assets(db)
    categories = [
        ("Track", "Track Health", "#f97316"),
        ("Traction/OHE", "OHE Health", "#ef4444"),
        ("Signal", "Signal Health", "#22c55e"),
    ]
    labels = [f"Day {i+1}" for i in range(30)]
    datasets = []
    for cat, label, color in categories:
        start = average_health(scored, cat)
        pool = [s for s in scored if s["category"] == cat]
        avg_risk = (sum(s["failure_probability"] for s in pool) / len(pool)) if pool else 15.0
        daily_decay = 0.15 + (avg_risk / 100) * 0.9   # riskier categories degrade faster
        floor = 30.0 if cat != "Signal" else 55.0
        data = [max(floor, round(start - daily_decay * i, 1)) for i in range(30)]
        datasets.append({"label": label, "data": data, "borderColor": color})
    return {"labels": labels, "datasets": datasets}
