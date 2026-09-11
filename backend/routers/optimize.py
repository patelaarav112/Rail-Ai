from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import List
from sqlalchemy.orm import Session

from database import get_db
from services.optimizer import run_quick_optimization
from services.activity import log_activity
from services.security import require_department, get_current_department, OPERATIONAL_DEPTS

# The AI Block Scheduler is available to every department, but each
# department's run is scoped to its own backlog — only COA can run a
# multi-department optimization.
router = APIRouter(prefix="/optimize", tags=["Optimize"], dependencies=[Depends(require_department(*OPERATIONAL_DEPTS))])


class OptimizeRequest(BaseModel):
    horizon: str = "weekly"           # daily | weekly | monthly
    priority: str = "balanced"        # availability | downtime | safety | balanced
    departments: List[str] = ["engg", "trd", "st"]
    max_duration_hours: int = 4
    traffic_tolerance: int = 5


@router.post("")
def optimize(body: OptimizeRequest, db: Session = Depends(get_db), dept: str = Depends(get_current_department)):
    # A department can only optimize its own blocks, regardless of what the
    # request claims — COA is the only role that can span departments.
    departments = body.departments if dept == "coa" else [dept]
    result = run_quick_optimization(
        db,
        departments=departments,
        horizon=body.horizon,
        priority=body.priority,
    )
    # Enrich with human-readable summary steps
    result["steps"] = [
        f"Loaded maintenance defects from TMS/SMMS/TDMS ({len(result['blocks'])} tasks)",
        "Fetched train timetable & goods forecast from COA",
        "Analyzed corridor availability windows",
        f"Running CP-SAT Solver — {len(result['blocks'])} tasks scheduled",
        "Constraint validation — Safety constraints satisfied",
        "Multi-department conflict resolution complete",
        "Pareto-optimal solution selected",
        f"Generated block schedule with score {result['metrics'].get('optimization_score', 0)}%",
    ]
    log_activity(
        db, "success",
        f"AI Optimization completed — {result['metrics'].get('blocks_scheduled', 0)} blocks scheduled "
        f"({result['metrics'].get('solver_status', 'UNKNOWN')}, score {result['metrics'].get('optimization_score', 0)}%)",
    )
    return result
