from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from database import get_db
from models.corridor import Corridor
from schemas.corridor import CorridorOut
from services.security import require_department, OPERATIONAL_DEPTS

# Corridor Map is shared infrastructure visibility — every department can
# see the full corridor list (COA included) so a block on someone else's
# section is visible before it's scheduled.
router = APIRouter(prefix="/corridors", tags=["Corridors"], dependencies=[Depends(require_department(*OPERATIONAL_DEPTS))])


@router.get("", response_model=List[CorridorOut])
def list_corridors(db: Session = Depends(get_db)):
    return db.query(Corridor).all()
