"""
RailMind AI — Schedule Integrity Checker
Cross-checks every maintenance block actually persisted in the database so
two departments can never be told the same section is theirs at the same
time. OR-Tools already guarantees no-overlap *within a single optimizer
run* (see services/optimizer.py's AddNoOverlap), but blocks also get added
one at a time (Block Planner, AI recommendation "Accept", preventive
scheduling) — this is the independent audit over the *whole*, current
schedule, plus the single-slot check used before an insert.
"""
from collections import defaultdict
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from models.block import MaintenanceBlock


def find_overlap(
    db: Session, section: str, date_offset: int, start_hour: int, end_hour: int,
    exclude_id: Optional[int] = None,
) -> Optional[MaintenanceBlock]:
    """Single-slot check: is there already a block on this section/day whose
    time range overlaps [start_hour, end_hour)? Used before every insert."""
    q = db.query(MaintenanceBlock).filter(
        MaintenanceBlock.section == section,
        MaintenanceBlock.date_offset == date_offset,
        MaintenanceBlock.start_hour < end_hour,
        MaintenanceBlock.end_hour > start_hour,
    )
    if exclude_id is not None:
        q = q.filter(MaintenanceBlock.id != exclude_id)
    return q.first()


def find_all_conflicts(db: Session) -> List[Dict[str, Any]]:
    """Cross-check every currently assigned block against every other block
    on the same section and day — reports every pair whose time ranges
    actually collide, regardless of which department scheduled them or how
    they were created (manual, AI recommendation, or optimizer)."""
    blocks = db.query(MaintenanceBlock).order_by(
        MaintenanceBlock.section, MaintenanceBlock.date_offset, MaintenanceBlock.start_hour
    ).all()

    groups: Dict[tuple, List[MaintenanceBlock]] = defaultdict(list)
    for b in blocks:
        groups[(b.section, b.date_offset)].append(b)

    def as_dict(b: MaintenanceBlock) -> Dict[str, Any]:
        return {
            "id": b.id, "block_id": b.block_id, "label": b.label,
            "department": b.department, "start_hour": b.start_hour, "end_hour": b.end_hour,
            "priority": b.priority,
        }

    conflicts = []
    for (section, offset), group in groups.items():
        group = sorted(group, key=lambda b: b.start_hour)
        for i in range(len(group)):
            for j in range(i + 1, len(group)):
                a, b = group[i], group[j]
                if a.start_hour < b.end_hour and b.start_hour < a.end_hour:
                    overlap_start, overlap_end = max(a.start_hour, b.start_hour), min(a.end_hour, b.end_hour)
                    conflicts.append({
                        "section": section,
                        "date_offset": offset,
                        "block_a": as_dict(a),
                        "block_b": as_dict(b),
                        "overlap_window": f"{overlap_start:02d}:00-{overlap_end:02d}:00",
                        "cross_department": a.department != b.department,
                        "message": (
                            f"{a.block_id} ({a.department.upper()}) and {b.block_id} ({b.department.upper()}) "
                            f"both claim {section} on day {offset} between {overlap_start:02d}:00-{overlap_end:02d}:00"
                        ),
                    })

    return conflicts


def schedule_health(db: Session) -> Dict[str, Any]:
    """Summary used by the Block Planner's "Validate Schedule" action and by
    anything that wants a quick clean/not-clean signal."""
    conflicts = find_all_conflicts(db)
    total_blocks = db.query(MaintenanceBlock).count()
    return {
        "clean": len(conflicts) == 0,
        "total_blocks": total_blocks,
        "conflict_count": len(conflicts),
        "conflicts": conflicts,
    }


# The Dashboard's "Live Corridor Map" walks these station-to-station
# segments in order — kept in sync with the section codes BlockPlanner.jsx
# and the NLU scheduler actually schedule against.
CORRIDOR_SEGMENTS = ["NDLS-MTJ", "MTJ-AGC", "AGC-CNB", "CNB-ALD", "ALD-MGS"]
CORRIDOR_BRANCH = "BPL-ET"
_PRIORITY_RANK = {"critical": 0, "high": 1, "medium": 2, "low": 3}


def get_corridor_map_status(db: Session) -> Dict[str, Any]:
    """Real, today-only status for the Dashboard's corridor map: which of
    the six sections has a block running right now, and which one (if any)
    has an actual unresolved conflict — instead of the fixed "AGC is always
    critical" illustration this replaced."""
    todays_blocks = db.query(MaintenanceBlock).filter(MaintenanceBlock.date_offset == 0).all()
    by_section: Dict[str, List[MaintenanceBlock]] = defaultdict(list)
    for b in todays_blocks:
        by_section[b.section].append(b)

    conflicted_sections = {
        c["section"] for c in find_all_conflicts(db) if c["date_offset"] == 0
    }

    def status_for(section: str) -> str:
        if section in conflicted_sections:
            return "critical"
        if by_section.get(section):
            return "warn"
        return "ok"

    segments = [{"section": s, "status": status_for(s)} for s in CORRIDOR_SEGMENTS]
    branch = {"section": CORRIDOR_BRANCH, "status": status_for(CORRIDOR_BRANCH)}

    active_block = None
    if todays_blocks:
        top = min(todays_blocks, key=lambda b: (_PRIORITY_RANK.get(b.priority, 4), b.start_hour))
        active_block = {
            "section": top.section, "label": top.label, "department": top.department,
            "start_hour": top.start_hour, "end_hour": top.end_hour,
        }

    return {"segments": segments, "branch": branch, "active_block": active_block}
