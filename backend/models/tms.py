from database import Base
from sqlalchemy import Column, Integer, String, Date


class TrackDefect(Base):
    __tablename__ = "tms_defects"

    id = Column(Integer, primary_key=True, index=True)
    defect_id = Column(String(20), unique=True, index=True)
    location = Column(String(100))
    defect_type = Column(String(100))
    severity = Column(String(20))
    reported_date = Column(String(20))
    status = Column(String(30), default="Open")
    ai_priority = Column(Integer, default=50)
    # Department work-item lifecycle — separate from `status` (which
    # reflects the defect's own state, not who's acted on it). One of
    # "pending" / "done" / "cancelled".
    work_status = Column(String(20), default="pending")
