from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from database import get_db
from models.block import MaintenanceBlock
from schemas.block import BlockOut, BlockCreate, ConflictCheckRequest, ConflictCheckResult, ParseBlockRequest, ParseBlockResult
from services.activity import log_activity
from services.scheduler import find_overlap, find_all_conflicts, schedule_health
from services.security import require_department, get_current_department, OPERATIONAL_DEPTS, DEPT_LABEL
from services.nlu_scheduler import parse_block_request, get_nlu_metrics, NLUParseError
import random
import string

# Block Planner is shared across every department — seeing the whole
# schedule (not just your own blocks) is what makes the conflict
# cross-checker below actually useful. Creating/deleting is still limited
# to each department's own blocks (enforced per-route below); COA can
# manage everything.
router = APIRouter(prefix="/blocks", tags=["Blocks"], dependencies=[Depends(require_department(*OPERATIONAL_DEPTS))])


def _gen_id():
    return "B" + "".join(random.choices(string.digits, k=3))


@router.get("", response_model=List[BlockOut])
def list_blocks(
    date_offset: Optional[int] = Query(None),
    section: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """List maintenance blocks with optional filters."""
    q = db.query(MaintenanceBlock)
    if date_offset is not None:
        q = q.filter(MaintenanceBlock.date_offset == date_offset)
    if section:
        q = q.filter(MaintenanceBlock.section == section)
    if department:
        q = q.filter(MaintenanceBlock.department == department)
    return q.order_by(MaintenanceBlock.date_offset, MaintenanceBlock.start_hour).all()


@router.get("/gantt", response_model=List[BlockOut])
def get_gantt_blocks(
    days: int = Query(7, ge=1, le=30, description="Number of days to include"),
    db: Session = Depends(get_db),
):
    """Return blocks formatted for the Gantt chart (up to N days)."""
    return (
        db.query(MaintenanceBlock)
        .filter(MaintenanceBlock.date_offset < days)
        .order_by(MaintenanceBlock.date_offset, MaintenanceBlock.start_hour)
        .all()
    )


@router.get("/conflicts")
def get_conflicts(db: Session = Depends(get_db)):
    """Cross-check every currently assigned block against every other block
    on its section/day and report any that actually collide. Used by the
    Block Planner's "Validate Schedule" action, and safe to poll any time —
    it only reads, never changes, the schedule."""
    return schedule_health(db)


@router.post("", response_model=BlockOut, status_code=201)
def create_block(
    body: BlockCreate,
    force: bool = Query(False, description="Create even if it collides with an existing block"),
    db: Session = Depends(get_db),
    dept: str = Depends(get_current_department),
):
    """Create a new maintenance block. Rejects (409) anything that would
    double-book a section/time already claimed by another block, unless
    force=true — mirroring check-conflict, but actually enforced server-side
    instead of relying on the client having called it first.

    A department can only schedule blocks under its own name — COA is the
    only role allowed to create a block for someone else."""
    if dept != "coa" and body.department != dept:
        raise HTTPException(
            status_code=403,
            detail=f"{DEPT_LABEL.get(dept, dept)} can only schedule blocks for its own department.",
        )

    overlap = find_overlap(db, body.section, body.date_offset, body.start_hour, body.end_hour)
    if overlap and not force:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Conflicts with block '{overlap.label}' ({overlap.department.upper()}, "
                f"{overlap.start_hour:02d}:00–{overlap.end_hour:02d}:00) on {body.section}. "
                f"Pass force=true to double-book anyway."
            ),
        )

    block = MaintenanceBlock(block_id=_gen_id(), **body.model_dump())
    db.add(block)
    db.commit()
    db.refresh(block)

    if overlap and force:
        log_activity(
            db, "warn",
            f"Block {block.block_id} force-scheduled despite overlapping {overlap.block_id} "
            f"on {block.section} ({block.start_hour:02d}:00-{block.end_hour:02d}:00)",
        )
    else:
        log_activity(
            db, "success",
            f"Block {block.block_id} scheduled — {block.label} on {block.section} "
            f"({block.start_hour:02d}:00-{block.end_hour:02d}:00, {block.department.upper()})",
        )
    return block


@router.delete("/{block_id}", status_code=204)
def delete_block(
    block_id: int,
    db: Session = Depends(get_db),
    dept: str = Depends(get_current_department),
):
    """Delete a maintenance block by primary key. A department can only
    remove its own blocks — COA can remove any."""
    block = db.query(MaintenanceBlock).filter(MaintenanceBlock.id == block_id).first()
    if block:
        if dept != "coa" and block.department != dept:
            raise HTTPException(
                status_code=403,
                detail=f"{DEPT_LABEL.get(dept, dept)} can only remove blocks it scheduled.",
            )
        db.delete(block)
        db.commit()


@router.post("/parse-request", response_model=ParseBlockResult)
def parse_request(
    body: ParseBlockRequest,
    dept: str = Depends(get_current_department),
):
    """Turn a plain-English scheduling request ("2h track inspection on
    NDLS-MTJ next Tuesday night") into a filled-out block form using
    RailMind's own trained NLU classifiers (services/nlu_scheduler.py) — no
    external API. The Add Block modal is pre-populated from the result, but
    nothing is scheduled here — the caller still reviews and submits it
    through the normal POST /blocks flow (with its own conflict + RBAC
    checks) afterwards."""
    try:
        return parse_block_request(body.text, dept)
    except NLUParseError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.get("/parse-model-info")
def parse_model_info():
    """Real train/test evaluation of the natural-language intake model —
    per-field accuracy on a held-out test split, plus the deterministic
    date/duration/clock-time rule-extractor self-test. Same transparency
    contract as GET /api/predict/model-info for the risk model."""
    return get_nlu_metrics()


@router.post("/check-conflict", response_model=ConflictCheckResult)
def check_conflict(body: ConflictCheckRequest, db: Session = Depends(get_db)):
    """Pre-flight check if a proposed block time slot conflicts with existing
    blocks — same rule create_block enforces, callable before you commit to a
    label so the UI can suggest a clear window."""
    overlapping = find_overlap(db, body.section, body.date_offset, body.start_hour, body.end_hour)

    if overlapping:
        suggestion_start = body.end_hour + 1
        log_activity(
            db, "warn",
            f"Conflict detected: {body.section} {body.start_hour:02d}:00-{body.end_hour:02d}:00 "
            f"overlaps '{overlapping.label}' — suggested {suggestion_start:02d}:00 instead",
        )
        return ConflictCheckResult(
            has_conflict=True,
            message=f"Conflict with block '{overlapping.label}' ({overlapping.start_hour}:00–{overlapping.end_hour}:00)",
            suggestion=f"Move to {suggestion_start:02d}:00–{suggestion_start + 2:02d}:00 for 0 conflicts.",
        )
    return ConflictCheckResult(
        has_conflict=False,
        message="No conflicts detected. Window is clear. Impact: 0 trains affected.",
    )
