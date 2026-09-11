"""Real activity feed — routers call log_activity() whenever something
actually happens (optimizer run, sync, block created/conflict-checked) so
the dashboard's "System Activity" panel reflects genuine events instead of
a static script."""
from datetime import timezone, timedelta
from sqlalchemy.orm import Session
from models.activity import ActivityLog

IST = timezone(timedelta(hours=5, minutes=30))

SEED_ACTIVITY = [
    ("info", "RailMind AI backend started — OR-Tools CP-SAT + XGBoost models loaded"),
]


def log_activity(db: Session, type_: str, msg: str) -> None:
    db.add(ActivityLog(type=type_, msg=msg))
    db.commit()


def ensure_seed_activity(db: Session) -> None:
    if db.query(ActivityLog).first():
        return
    for type_, msg in SEED_ACTIVITY:
        db.add(ActivityLog(type=type_, msg=msg))
    db.commit()


def get_recent_activity(db: Session, limit: int = 12):
    rows = (
        db.query(ActivityLog)
        .order_by(ActivityLog.id.desc())
        .limit(limit)
        .all()
    )
    def to_ist(ts):
        if not ts:
            return "--:--"
        ts = ts.replace(tzinfo=timezone.utc) if ts.tzinfo is None else ts
        return ts.astimezone(IST).strftime("%H:%M")

    return [
        {"time": to_ist(r.timestamp), "type": r.type, "msg": r.msg}
        for r in rows
    ]
