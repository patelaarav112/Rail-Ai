from pydantic import BaseModel
from typing import Optional


class TrackDefectBase(BaseModel):
    defect_id: str
    location: str
    defect_type: str
    severity: str
    reported_date: Optional[str] = None
    status: str = "Open"
    ai_priority: int = 50
    work_status: str = "pending"


class TrackDefectCreate(TrackDefectBase):
    pass


class TrackDefectOut(TrackDefectBase):
    id: int

    model_config = {"from_attributes": True}


class WorkStatusUpdate(BaseModel):
    work_status: str  # "pending" | "done" | "cancelled"
