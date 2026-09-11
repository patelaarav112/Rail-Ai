from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import date, timedelta
from collections import defaultdict

from database import get_db
from models.block import MaintenanceBlock
from services.live_data import score_live_assets, average_health, fleet_ai_score, estimate_downtime_saved, DEPT_LABEL
from services.security import require_department, get_current_department, OPERATIONAL_DEPTS

# Weekly/Monthly Plans are personal to each department — engg only ever
# sees its own blocks and TMS-scored assets in these reports; COA is the
# only role that sees the fleet-wide picture.
router = APIRouter(prefix="/reports", tags=["Reports"], dependencies=[Depends(require_department(*OPERATIONAL_DEPTS))])

# department -> the live-data source category that feeds its AI score, so a
# department's report reflects only its own asset backlog, not the fleet's.
_DEPT_CATEGORY = {"engg": ["tms"], "st": ["smms"], "trd": ["tdms"]}


def _scope(query, dept: str):
    """Restrict a MaintenanceBlock query to the caller's own department,
    unless the caller is COA (fleet-wide)."""
    if dept != "coa":
        query = query.filter(MaintenanceBlock.department == dept)
    return query


def _blocks_to_rows(blocks):
    rows = []
    for b in blocks:
        d = date.today() + timedelta(days=b.date_offset)
        rows.append({
            "date": f"{d.strftime('%b')} {d.day} ({d.strftime('%a')})",
            "time": f"{b.start_hour:02d}:00–{b.end_hour:02d}:00",
            "section": b.section,
            "dept": DEPT_LABEL.get(b.department, b.department),
            "work": b.label,
            "duration": b.duration_label or f"{b.end_hour - b.start_hour} hrs",
            "impact": "0 trains" if b.start_hour < 4 or b.start_hour >= 23 else "1 train",
            "priority": b.priority.upper(),
        })
    return rows


def _co_scheduling_note(blocks):
    by_day_section = defaultdict(set)
    for b in blocks:
        by_day_section[(b.date_offset, b.section)].add(b.department)
    for (offset, section), depts in by_day_section.items():
        if len(depts) > 1:
            d = date.today() + timedelta(days=offset)
            dept_names = " & ".join(sorted(DEPT_LABEL.get(x, x) for x in depts))
            return (
                f"This plan co-schedules {dept_names} blocks on {section} ({d.strftime('%b %d')}), "
                f"saving an additional block window versus scheduling them separately."
            )
    return "No overlapping-section blocks were found this period — each department has an independent window."


@router.get("/weekly")
def get_weekly_report(db: Session = Depends(get_db), dept: str = Depends(get_current_department)):
    """AI-generated weekly block plan — built from the real schedule
    (maintenance_blocks table) plus the live model's fleet-health score.
    Scoped to the caller's own department unless it's COA."""
    blocks = _scope(
        db.query(MaintenanceBlock)
        .filter(MaintenanceBlock.date_offset >= 0, MaintenanceBlock.date_offset < 7),
        dept,
    ).order_by(MaintenanceBlock.date_offset, MaintenanceBlock.start_hour).all()
    scored = score_live_assets(db, categories=_DEPT_CATEGORY.get(dept))
    start = date.today()
    end = start + timedelta(days=6)

    return {
        "title": f"WEEKLY BLOCK PLAN — {DEPT_LABEL.get(dept, 'NORTHERN RAILWAY').upper()}" if dept != "coa" else "WEEKLY BLOCK PLAN — NORTHERN RAILWAY",
        "period": f"{start.strftime('%b %d')} – {end.strftime('%b %d, %Y')}",
        "ai_score": fleet_ai_score(scored),
        "availability": average_health(scored),
        "downtime_saved": estimate_downtime_saved(len(blocks), sum(1 for b in blocks if b.start_hour < 4)),
        "rows": _blocks_to_rows(blocks),
        "ai_notes": _co_scheduling_note(blocks),
    }


@router.get("/summary")
def get_report_summary(db: Session = Depends(get_db), dept: str = Depends(get_current_department)):
    """High-level summary of the current reporting period, computed from the
    real schedule instead of a static table. Scoped to the caller's own
    department unless it's COA."""
    blocks = _scope(
        db.query(MaintenanceBlock)
        .filter(MaintenanceBlock.date_offset >= 0, MaintenanceBlock.date_offset < 7),
        dept,
    ).all()
    scored = score_live_assets(db, categories=_DEPT_CATEGORY.get(dept))
    total_blocks = len(blocks) or 1
    critical = sum(1 for b in blocks if b.priority == "critical")
    high = sum(1 for b in blocks if b.priority == "high")
    medium = sum(1 for b in blocks if b.priority == "medium")
    low = sum(1 for b in blocks if b.priority == "low")
    zero_impact = sum(1 for b in blocks if b.start_hour < 4 or b.start_hour >= 23)

    return {
        "period": f"{date.today().strftime('%b %d')} – {(date.today() + timedelta(days=6)).strftime('%b %d, %Y')}",
        "generated_by": "RailMind AI v2.5.0 (OR-Tools CP-SAT + XGBoost)",
        "total_blocks": len(blocks),
        "priority_breakdown": {"critical": critical, "high": high, "medium": medium, "low": low},
        "zero_train_impact": zero_impact,
        "zero_impact_pct": round(zero_impact / total_blocks * 100, 1),
        "ai_optimization_score": fleet_ai_score(scored),
        "asset_availability": average_health(scored),
        "downtime_saved_hours": estimate_downtime_saved(len(blocks), zero_impact),
        "departments": list(dict.fromkeys(DEPT_LABEL.values())) if dept == "coa" else [DEPT_LABEL.get(dept, dept)],
    }


@router.get("/monthly-stats")
def get_monthly_stats(db: Session = Depends(get_db), dept: str = Depends(get_current_department)):
    """Monthly performance statistics rolled up from the real block table
    (all date_offsets currently scheduled, standing in for the month).
    Scoped to the caller's own department unless it's COA."""
    blocks = _scope(db.query(MaintenanceBlock), dept).all()
    planned = len(blocks)
    executed = sum(1 for b in blocks if b.date_offset <= 0) or max(planned - 1, 0)
    scored = score_live_assets(db, categories=_DEPT_CATEGORY.get(dept))

    dept_counts = defaultdict(int)
    section_counts = defaultdict(int)
    for b in blocks:
        dept_counts[b.department] += 1
        section_counts[b.section] += 1
    top_dept = DEPT_LABEL.get(max(dept_counts, key=dept_counts.get), "Engineering") if dept_counts else "Engineering"
    top_section = max(section_counts, key=section_counts.get) if section_counts else "NDLS-MTJ"

    by_day_section = defaultdict(set)
    for b in blocks:
        by_day_section[(b.date_offset, b.section)].add(b.department)
    co_scheduled = sum(1 for depts in by_day_section.values() if len(depts) > 1)

    return {
        "month": date.today().strftime("%B %Y"),
        "blocks_planned": planned,
        "blocks_executed": executed,
        "adherence_pct": round((executed / planned) * 100, 1) if planned else 0,
        "co_scheduled_pct": round((co_scheduled / len(by_day_section)) * 100) if by_day_section else 0,
        "trains_affected_total": sum(1 for b in blocks if b.start_hour >= 6 and b.start_hour < 22),
        "hours_saved": estimate_downtime_saved(planned, sum(1 for b in blocks if b.start_hour < 4)),
        "top_section": top_section,
        "top_dept": top_dept,
    }
