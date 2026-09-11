from pydantic import BaseModel
from typing import Optional


class SignalAssetBase(BaseModel):
    asset_id:         str
    location:         str
    asset_type:       str
    condition:        str
    status:           str = "Normal"   # ← was missing
    last_maintenance: Optional[str] = None
    next_due:         Optional[str] = None
    ai_priority:      int = 50
    work_status:      str = "pending"


class SignalAssetOut(SignalAssetBase):
    id: int

    model_config = {"from_attributes": True}


class WorkStatusUpdate(BaseModel):
    work_status: str  # "pending" | "done" | "cancelled"
