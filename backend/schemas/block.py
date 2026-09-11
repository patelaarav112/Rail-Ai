from pydantic import BaseModel
from typing import Optional, List


class BlockBase(BaseModel):
    block_id:       Optional[str] = None   # auto-generated; not required on input
    section:        str
    department:     str
    start_hour:     int
    end_hour:       int
    label:          str
    date_offset:    int = 0
    priority:       str = "medium"
    status:         str = "scheduled"
    color:          str = "#f97316"
    duration_label: str = ""


class BlockCreate(BaseModel):
    section:        str
    department:     str
    label:          str
    start_hour:     int
    end_hour:       int
    date_offset:    int = 0
    priority:       str = "medium"
    color:          str = "#f97316"
    duration_label: str = ""


class BlockOut(BlockBase):
    id: int

    model_config = {"from_attributes": True}


class ConflictCheckRequest(BaseModel):
    section:    str
    start_hour: int
    end_hour:   int
    date_offset: int = 0


class ConflictCheckResult(BaseModel):
    has_conflict: bool
    message:      str
    suggestion:   Optional[str] = None


class ParseBlockRequest(BaseModel):
    text: str


class ParseBlockResult(BaseModel):
    section:     str
    department:  str
    label:       str
    start_hour:  int
    end_hour:    int
    date_offset: int
    priority:    str
    confidence:  str
    notes:       str
