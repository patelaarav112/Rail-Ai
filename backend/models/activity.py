from database import Base
from sqlalchemy import Column, Integer, String, DateTime
from datetime import datetime, timezone


class ActivityLog(Base):
    """Real event log — a row is inserted whenever the system actually does
    something (optimizer run, sync, block created/conflict-checked), so the
    dashboard activity feed reflects genuine actions instead of static copy."""
    __tablename__ = "activity_log"

    id        = Column(Integer, primary_key=True, index=True)
    type      = Column(String(20), default="info")   # success | info | warn
    msg       = Column(String(300))
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))
