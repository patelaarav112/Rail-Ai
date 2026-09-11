from pydantic import BaseModel
from typing import Optional


class TractionAssetBase(BaseModel):
    asset_id: str
    location: str
    asset_type: str
    voltage: str
    status: str
    last_inspection: Optional[str] = None
    ai_priority: int = 50
    work_status: str = "pending"


class TractionAssetOut(TractionAssetBase):
    id: int

    model_config = {"from_attributes": True}


class WorkStatusUpdate(BaseModel):
    work_status: str  # "pending" | "done" | "cancelled"
