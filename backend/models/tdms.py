from database import Base
from sqlalchemy import Column, Integer, String


class TractionAsset(Base):
    __tablename__ = "tdms_assets"

    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(String(20), unique=True, index=True)
    location = Column(String(100))
    asset_type = Column(String(100))
    voltage = Column(String(20))
    status = Column(String(20))
    last_inspection = Column(String(20))
    ai_priority = Column(Integer, default=50)
    # Department work-item lifecycle — one of "pending" / "done" / "cancelled".
    work_status = Column(String(20), default="pending")
