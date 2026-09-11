from pydantic import BaseModel


class CorridorOut(BaseModel):
    id: int
    corridor_id: str
    name: str
    length_km: int
    department: str
    status: str
    availability: int
    active_blocks: int
    trains_today: int
    zone: str

    model_config = {"from_attributes": True}
