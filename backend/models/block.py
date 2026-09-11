from database import Base
from sqlalchemy import Column, Integer, String


class MaintenanceBlock(Base):
    __tablename__ = "maintenance_blocks"

    id           = Column(Integer, primary_key=True, index=True)
    block_id     = Column(String(10), index=True, nullable=True)
    section      = Column(String(50))
    department   = Column(String(10))
    start_hour   = Column(Integer)
    end_hour     = Column(Integer)
    label        = Column(String(100))
    date_offset  = Column(Integer, default=0)
    priority     = Column(String(20), default="medium")
    status       = Column(String(20), default="scheduled")
    color        = Column(String(20), default="#f97316")
    duration_label = Column(String(20), default="")
