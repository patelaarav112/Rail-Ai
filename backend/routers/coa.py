from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models.block import MaintenanceBlock
from models.corridor import Corridor
from services.live_data import STATION_SECTION, DEPT_LABEL
from services.security import require_department

router = APIRouter(prefix="/coa", tags=["COA"], dependencies=[Depends(require_department())])

# Indicative train timetable — Indian Railways doesn't expose a public
# real-time timetable API, so this stands in for COA's live feed. The block
# windows below, however, are computed from the *real* maintenance schedule.
TRAINS = [
    {"name": "12301 Howrah Mail", "dep": "22:05", "arr": "10:20", "cls": "trd", "on_time": True, "delay": 0},
    {"name": "12314 Rajdhani", "dep": "16:10", "arr": "08:00", "cls": "engg", "on_time": True, "delay": 0},
    {"name": "22691 Rajdhani", "dep": "21:55", "arr": "14:30", "cls": "st", "on_time": False, "delay": 15},
    {"name": "12303 Poorva Exp", "dep": "08:00", "arr": "23:45", "cls": "engg", "on_time": True, "delay": 0},
    {"name": "75441 GOODS", "dep": "03:00", "arr": "14:00", "cls": "trd", "on_time": True, "delay": 0},
    {"name": "15657 Brahmaputra", "dep": "18:25", "arr": "09:40", "cls": "st", "on_time": True, "delay": 0},
]

GOODS_FORECAST = {
    "labels": ["00", "03", "06", "09", "12", "15", "18", "21"],
    "data": [8, 12, 5, 3, 2, 4, 7, 10],
}


@router.get("/trains")
def get_trains():
    return TRAINS


@router.get("/windows")
def get_block_windows(db: Session = Depends(get_db)):
    """Real maintenance-window availability: for each corridor section, find
    the actual gaps around today's scheduled blocks (date_offset == 0)
    instead of a hardcoded window list."""
    sections = sorted(set(STATION_SECTION.values()))
    todays_blocks = db.query(MaintenanceBlock).filter(MaintenanceBlock.date_offset == 0).all()
    by_section = {}
    for b in todays_blocks:
        by_section.setdefault(b.section, []).append(b)

    windows = []
    for section in sections:
        section_blocks = sorted(by_section.get(section, []), key=lambda b: b.start_hour)
        cursor = 0
        for b in section_blocks:
            if b.start_hour > cursor:
                windows.append({"time": f"{cursor:02d}:00 – {b.start_hour:02d}:00", "type": "Available", "section": section, "trains": 0})
            windows.append({
                "time": f"{b.start_hour:02d}:00 – {b.end_hour:02d}:00", "type": "Booked",
                "section": f"{section} ({DEPT_LABEL.get(b.department, b.department).upper()})", "trains": 0,
            })
            cursor = max(cursor, b.end_hour)
        if cursor < 6:
            windows.append({"time": f"{cursor:02d}:00 – 06:00", "type": "Available", "section": section, "trains": 0})

    # Morning peak restriction, sized from real corridor traffic totals.
    total_daily_trains = sum(c.trains_today for c in db.query(Corridor).all())
    peak_estimate = round(total_daily_trains * 0.18) if total_daily_trains else 12
    windows.append({"time": "06:00 – 10:00", "type": "Restricted", "section": "All sections", "trains": peak_estimate})

    return windows[:12]


@router.get("/goods-forecast")
def get_goods_forecast():
    return GOODS_FORECAST
