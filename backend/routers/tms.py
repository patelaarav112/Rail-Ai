from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from database import get_db
from models.tms import TrackDefect
from schemas.tms import TrackDefectOut, TrackDefectCreate, WorkStatusUpdate
from services.predictor import score_one
from services.activity import log_activity
from services.security import require_department

_VALID_WORK_STATUSES = {"pending", "done", "cancelled"}

router = APIRouter(prefix="/tms", tags=["TMS"], dependencies=[Depends(require_department("engg"))])


@router.get("/defects", response_model=List[TrackDefectOut])
def list_defects(
    search: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(TrackDefect)
    if search:
        q = q.filter(
            TrackDefect.location.ilike(f"%{search}%") |
            TrackDefect.defect_type.ilike(f"%{search}%") |
            TrackDefect.defect_id.ilike(f"%{search}%")
        )
    if severity:
        q = q.filter(TrackDefect.severity == severity)
    if status:
        q = q.filter(TrackDefect.status == status)
    return q.order_by(TrackDefect.ai_priority.desc()).all()


@router.post("/defects", response_model=TrackDefectOut, status_code=201)
def create_defect(body: TrackDefectCreate, db: Session = Depends(get_db)):
    defect = TrackDefect(**body.model_dump())
    db.add(defect)
    db.commit()
    db.refresh(defect)
    return defect


@router.patch("/defects/{defect_id}/work-status", response_model=TrackDefectOut)
def update_work_status(defect_id: int, body: WorkStatusUpdate, db: Session = Depends(get_db)):
    """Mark a defect Done (the department finished the work) or Cancelled
    (not going to be actioned). Resolved defects drop out of AI
    recommendations/risk alerts (see services/live_data.load_live_assets)
    but stay visible in the register for the record."""
    if body.work_status not in _VALID_WORK_STATUSES:
        raise HTTPException(status_code=400, detail=f"work_status must be one of {sorted(_VALID_WORK_STATUSES)}")
    defect = db.query(TrackDefect).filter(TrackDefect.id == defect_id).first()
    if not defect:
        raise HTTPException(status_code=404, detail="Defect not found")
    defect.work_status = body.work_status
    db.commit()
    db.refresh(defect)
    if body.work_status != "pending":
        log_activity(db, "success" if body.work_status == "done" else "info",
                     f"{defect.defect_id} marked {body.work_status} by Engineering")
    return defect


@router.post("/sync")
def sync_tms(db: Session = Depends(get_db)):
    """Re-run every open defect through the live XGBoost model and write its
    fresh failure-probability back as ai_priority — a real re-scoring pass,
    not just a record count."""
    defects = db.query(TrackDefect).filter(TrackDefect.work_status == "pending").all()
    changed = 0
    for d in defects:
        scored = score_one({
            "id": f"tms-{d.id}", "severity_label": d.severity, "status": d.status,
            "date_field": d.reported_date, "ai_priority": d.ai_priority,
        })
        new_priority = int(round(scored["failure_probability"]))
        if new_priority != d.ai_priority:
            d.ai_priority = new_priority
            changed += 1
    db.commit()
    log_activity(db, "info", f"TMS sync — {len(defects)} defects re-scored by XGBoost, {changed} priorities updated")
    return {"status": "success", "message": f"TMS sync complete — {len(defects)} records re-scored, {changed} updated", "count": len(defects)}
