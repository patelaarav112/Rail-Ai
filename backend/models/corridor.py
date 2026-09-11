from database import Base
from sqlalchemy import Column, Integer, String


class Corridor(Base):
    __tablename__ = "corridors"

    id = Column(Integer, primary_key=True, index=True)
    corridor_id = Column(String(20), unique=True, index=True)
    name = Column(String(100))
    length_km = Column(Integer)
    department = Column(String(30))
    status = Column(String(20), default="normal")
    availability = Column(Integer, default=90)
    active_blocks = Column(Integer, default=0)
    trains_today = Column(Integer, default=0)
    zone = Column(String(20))
