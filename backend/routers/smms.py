from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from database import get_db
from models.smms import SignalAsset
from schemas.smms import SignalAssetOut, WorkStatusUpdate
from services.predictor import score_one
from services.activity import log_activity
from services.security import require_department

router = APIRouter(prefix="/smms", tags=["SMMS"], dependencies=[Depends(require_department("st"))])
_VALID_WORK_STATUSES = {"pending", "done", "cancelled"}


@router.get("/assets", response_model=List[SignalAssetOut])
def list_assets(
    search: Optional[str] = Query(None),
    condition: Optional[str] = Query(None),
    overdue: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(SignalAsset)
    if search:
        q = q.filter(
            SignalAsset.location.ilike(f"%{search}%") |
            SignalAsset.asset_type.ilike(f"%{search}%") |
            SignalAsset.asset_id.ilike(f"%{search}%")
        )
    if condition:
        q = q.filter(SignalAsset.condition == condition)
    if overdue:
        q = q.filter(SignalAsset.next_due < date.today().isoformat())
    return q.order_by(SignalAsset.ai_priority.desc()).all()


@router.patch("/assets/{asset_id}/work-status", response_model=SignalAssetOut)
def update_work_status(asset_id: int, body: WorkStatusUpdate, db: Session = Depends(get_db)):
    """Mark an asset Done (maintenance completed) or Cancelled. Resolved
    assets drop out of AI recommendations/risk alerts but stay visible in
    the register for the record."""
    if body.work_status not in _VALID_WORK_STATUSES:
        raise HTTPException(status_code=400, detail=f"work_status must be one of {sorted(_VALID_WORK_STATUSES)}")
    asset = db.query(SignalAsset).filter(SignalAsset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    asset.work_status = body.work_status
    db.commit()
    db.refresh(asset)
    if body.work_status != "pending":
        log_activity(db, "success" if body.work_status == "done" else "info",
                     f"{asset.asset_id} marked {body.work_status} by Signal & Telecom")
    return asset


@router.post("/sync")
def sync_smms(db: Session = Depends(get_db)):
    """Re-run every signal asset through the live XGBoost model and write its
    fresh failure-probability back as ai_priority."""
    assets = db.query(SignalAsset).filter(SignalAsset.work_status == "pending").all()
    changed = 0
    for a in assets:
        scored = score_one({
            "id": f"smms-{a.id}", "severity_label": a.condition, "status": a.status,
            "date_field": a.last_maintenance, "ai_priority": a.ai_priority,
        })
        new_priority = int(round(scored["failure_probability"]))
        if new_priority != a.ai_priority:
            a.ai_priority = new_priority
            changed += 1
    db.commit()
    log_activity(db, "info", f"SMMS sync — {len(assets)} assets re-scored by XGBoost, {changed} priorities updated")
    return {"status": "success", "message": f"SMMS sync complete — {len(assets)} records re-scored, {changed} updated", "count": len(assets)}
