"""
RailMind AI — Database Seeder
Populates all tables with the same data that was hardcoded in the original app.js.
Run once: python -c "from services.seeder import seed; seed()"
"""
from database import SessionLocal
from models.tms import TrackDefect
from models.smms import SignalAsset
from models.tdms import TractionAsset
from models.block import MaintenanceBlock
from models.corridor import Corridor


TMS_DEFECTS = [
    {"defect_id": "TMS-2601", "location": "AGC km 187.4", "defect_type": "Rail Fracture", "severity": "critical", "reported_date": "2026-09-01", "status": "Open", "ai_priority": 98},
    {"defect_id": "TMS-2587", "location": "CNB km 342.1", "defect_type": "Track Geometry (TWT)", "severity": "high", "reported_date": "2026-09-02", "status": "Open", "ai_priority": 87},
    {"defect_id": "TMS-2543", "location": "MGS km 791.2", "defect_type": "Sleeper Defect", "severity": "medium", "reported_date": "2026-08-28", "status": "Scheduled", "ai_priority": 65},
    {"defect_id": "TMS-2511", "location": "BPL km 499.8", "defect_type": "Fish Plate Loose", "severity": "medium", "reported_date": "2026-08-25", "status": "Open", "ai_priority": 62},
    {"defect_id": "TMS-2499", "location": "GZB km 8.3", "defect_type": "Gauge Deviation", "severity": "high", "reported_date": "2026-08-24", "status": "Open", "ai_priority": 81},
    {"defect_id": "TMS-2467", "location": "MTJ km 141.7", "defect_type": "Weld Joint Defect", "severity": "low", "reported_date": "2026-08-20", "status": "Open", "ai_priority": 41},
    {"defect_id": "TMS-2438", "location": "ET km 672.3", "defect_type": "Rail Wear (Lateral)", "severity": "medium", "reported_date": "2026-08-18", "status": "Scheduled", "ai_priority": 55},
    {"defect_id": "TMS-2411", "location": "ALD km 640.9", "defect_type": "Level Crossing Issue", "severity": "high", "reported_date": "2026-08-16", "status": "Open", "ai_priority": 76},
    {"defect_id": "TMS-2389", "location": "NDLS km 1.1", "defect_type": "Platform Gap Defect", "severity": "low", "reported_date": "2026-08-14", "status": "Open", "ai_priority": 30},
    {"defect_id": "TMS-2361", "location": "CNB km 319.5", "defect_type": "Rail Corrugation", "severity": "medium", "reported_date": "2026-08-11", "status": "Open", "ai_priority": 58},
    {"defect_id": "TMS-2344", "location": "HWH km 1447.2", "defect_type": "Bridge Inspection Due", "severity": "high", "reported_date": "2026-08-09", "status": "Overdue", "ai_priority": 92},
    {"defect_id": "TMS-2318", "location": "AGC km 164.0", "defect_type": "Turnout Defect", "severity": "medium", "reported_date": "2026-08-07", "status": "Open", "ai_priority": 69},
]

# condition → status mapping: critical→Defect, high→Warning, medium/low→Normal
SMMS_ASSETS = [
    {"asset_id": "SMMS-S401", "location": "AGC/A Cabin",       "asset_type": "Interlocking System",     "condition": "critical", "status": "Defect",  "last_maintenance": "2026-07-01", "next_due": "2026-09-01", "ai_priority": 95},
    {"asset_id": "SMMS-S312", "location": "CNB/B Cabin",       "asset_type": "Axle Counter",            "condition": "high",     "status": "Warning", "last_maintenance": "2026-07-20", "next_due": "2026-09-15", "ai_priority": 78},
    {"asset_id": "SMMS-S289", "location": "GZB outer signal",  "asset_type": "Colour Light Signal",     "condition": "medium",   "status": "Normal",  "last_maintenance": "2026-08-01", "next_due": "2026-10-01", "ai_priority": 52},
    {"asset_id": "SMMS-S247", "location": "BPL yard",          "asset_type": "Panel Locking",           "condition": "low",      "status": "Normal",  "last_maintenance": "2026-08-10", "next_due": "2026-11-10", "ai_priority": 28},
    {"asset_id": "SMMS-S203", "location": "MTJ/D Cabin",       "asset_type": "BPAC Equipment",          "condition": "medium",   "status": "Normal",  "last_maintenance": "2026-07-25", "next_due": "2026-09-25", "ai_priority": 61},
    {"asset_id": "SMMS-S188", "location": "MGS/F Gate",        "asset_type": "LC Gate Equipment",       "condition": "high",     "status": "Warning", "last_maintenance": "2026-06-30", "next_due": "2026-08-30", "ai_priority": 89},
    {"asset_id": "SMMS-S164", "location": "ET outer",          "asset_type": "Fog Device",              "condition": "low",      "status": "Normal",  "last_maintenance": "2026-08-15", "next_due": "2026-11-15", "ai_priority": 22},
    {"asset_id": "SMMS-S141", "location": "ALD/A Cabin",       "asset_type": "Route Relay Interlocking","condition": "medium",   "status": "Normal",  "last_maintenance": "2026-07-10", "next_due": "2026-09-10", "ai_priority": 67},
]

TDMS_ASSETS = [
    {"asset_id": "TDMS-O221", "location": "AGC km 190", "asset_type": "OHE Mast & Cantilever", "voltage": "25 kV AC", "status": "Defect", "last_inspection": "2026-08-20", "ai_priority": 90},
    {"asset_id": "TDMS-SP14", "location": "CNB TSS", "asset_type": "Traction Substation", "voltage": "132/25 kV", "status": "Normal", "last_inspection": "2026-08-25", "ai_priority": 20},
    {"asset_id": "TDMS-O198", "location": "GZB km 12", "asset_type": "Booster Transformer", "voltage": "25 kV AC", "status": "Warning", "last_inspection": "2026-08-18", "ai_priority": 72},
    {"asset_id": "TDMS-SP11", "location": "MTJ TSS", "asset_type": "Traction Substation", "voltage": "132/25 kV", "status": "Normal", "last_inspection": "2026-08-28", "ai_priority": 15},
    {"asset_id": "TDMS-O176", "location": "BPL km 498", "asset_type": "OHE Tension Device", "voltage": "25 kV AC", "status": "Warning", "last_inspection": "2026-08-12", "ai_priority": 68},
    {"asset_id": "TDMS-SP08", "location": "ALD TSS", "asset_type": "Traction Substation", "voltage": "132/25 kV", "status": "Normal", "last_inspection": "2026-08-30", "ai_priority": 18},
    {"asset_id": "TDMS-O143", "location": "HWH km 1440", "asset_type": "Sectioning & Paralleling Post", "voltage": "25 kV AC", "status": "Normal", "last_inspection": "2026-09-01", "ai_priority": 25},
    {"asset_id": "TDMS-O128", "location": "MAS km 2180", "asset_type": "Auto Transformer", "voltage": "2x25 kV", "status": "Warning", "last_inspection": "2026-08-15", "ai_priority": 63},
]

GANTT_BLOCKS = [
    {"block_id": "B001", "section": "NDLS-MTJ", "department": "engg", "start_hour": 2,  "end_hour": 4,  "label": "Track Tamping",      "date_offset": 0, "priority": "high",     "color": "#f97316", "duration_label": "2h"},
    {"block_id": "B002", "section": "MTJ-AGC",  "department": "trd",  "start_hour": 0,  "end_hour": 3,  "label": "OHE Inspection",    "date_offset": 0, "priority": "high",     "color": "#3b82f6", "duration_label": "3h"},
    {"block_id": "B003", "section": "AGC-CNB",  "department": "engg", "start_hour": 22, "end_hour": 24, "label": "Rail Fracture Repair","date_offset": 0, "priority": "critical",  "color": "#ef4444", "duration_label": "2h"},
    {"block_id": "B004", "section": "BPL-ET",   "department": "st",   "start_hour": 1,  "end_hour": 3,  "label": "Signal Maintenance", "date_offset": 1, "priority": "high",     "color": "#22c55e", "duration_label": "2h"},
    {"block_id": "B005", "section": "CNB-ALD",  "department": "trd",  "start_hour": 2,  "end_hour": 5,  "label": "OHE Tension Adj",   "date_offset": 1, "priority": "high",     "color": "#3b82f6", "duration_label": "3h"},
    {"block_id": "B006", "section": "NDLS-MTJ", "department": "st",   "start_hour": 0,  "end_hour": 2,  "label": "Axle Counter Calib", "date_offset": 2, "priority": "medium",   "color": "#22c55e", "duration_label": "2h"},
    {"block_id": "B007", "section": "MTJ-AGC",  "department": "engg", "start_hour": 1,  "end_hour": 4,  "label": "Deep Screening",     "date_offset": 2, "priority": "medium",   "color": "#f97316", "duration_label": "3h"},
    {"block_id": "B008", "section": "ALD-MGS",  "department": "trd",  "start_hour": 23, "end_hour": 24, "label": "Substation Maint.",  "date_offset": 3, "priority": "medium",   "color": "#3b82f6", "duration_label": "1h"},
    {"block_id": "B009", "section": "CNB-ALD",  "department": "st",   "start_hour": 2,  "end_hour": 4,  "label": "BPAC Renewal",       "date_offset": 3, "priority": "medium",   "color": "#22c55e", "duration_label": "2h"},
    {"block_id": "B010", "section": "BPL-ET",   "department": "engg", "start_hour": 3,  "end_hour": 6,  "label": "Bridge Inspection",  "date_offset": 4, "priority": "medium",   "color": "#f97316", "duration_label": "3h"},
    {"block_id": "B011", "section": "NDLS-MTJ", "department": "trd",  "start_hour": 1,  "end_hour": 3,  "label": "Booster Transformer","date_offset": 5, "priority": "low",      "color": "#3b82f6", "duration_label": "2h"},
    {"block_id": "B012", "section": "AGC-CNB",  "department": "st",   "start_hour": 0,  "end_hour": 2,  "label": "Panel Locking",      "date_offset": 5, "priority": "low",      "color": "#22c55e", "duration_label": "2h"},
]

CORRIDORS = [
    {"corridor_id": "DEL-MUM", "name": "Delhi – Mumbai (WR)", "length_km": 1385, "department": "NCR/WR", "status": "normal", "availability": 88, "active_blocks": 2, "trains_today": 48, "zone": "NR/WR"},
    {"corridor_id": "DEL-HWH", "name": "Delhi – Howrah (ECR)", "length_km": 1447, "department": "NCR/ECR", "status": "warning", "availability": 72, "active_blocks": 4, "trains_today": 62, "zone": "NR/ECR"},
    {"corridor_id": "DEL-MAS", "name": "Delhi – Chennai (SCR)", "length_km": 2182, "department": "NCR/SCR", "status": "critical", "availability": 61, "active_blocks": 1, "trains_today": 35, "zone": "NR/SCR"},
    {"corridor_id": "MUM-MAS", "name": "Mumbai – Chennai (CR)", "length_km": 1279, "department": "CR/SR", "status": "normal", "availability": 94, "active_blocks": 0, "trains_today": 29, "zone": "CR/SR"},
    {"corridor_id": "HWH-MAS", "name": "Howrah – Chennai (ER)", "length_km": 1662, "department": "ER/SR", "status": "normal", "availability": 85, "active_blocks": 1, "trains_today": 22, "zone": "ER/SR"},
    {"corridor_id": "DEL-JAT", "name": "Delhi – Jammu (NR)", "length_km": 596, "department": "NR", "status": "normal", "availability": 91, "active_blocks": 1, "trains_today": 18, "zone": "NR"},
    {"corridor_id": "DEL-NGP", "name": "Delhi – Nagpur (CR)", "length_km": 1093, "department": "NCR/CR", "status": "warning", "availability": 77, "active_blocks": 2, "trains_today": 31, "zone": "NCR/CR"},
    {"corridor_id": "BPL-ET", "name": "Bhopal – Itarsi (WCR)", "length_km": 172, "department": "WCR", "status": "normal", "availability": 96, "active_blocks": 0, "trains_today": 15, "zone": "WCR"},
]


def seed(force: bool = False):
    """Seed the database. Skips if already seeded (unless force=True)."""
    db = SessionLocal()
    try:
        # Check if already seeded
        existing = db.query(TrackDefect).first()
        if existing and not force:
            print("✅ Database already seeded. Use seed(force=True) to re-seed.")
            return

        if force:
            db.query(TrackDefect).delete()
            db.query(SignalAsset).delete()
            db.query(TractionAsset).delete()
            db.query(MaintenanceBlock).delete()
            db.query(Corridor).delete()

        # Seed TMS defects
        for d in TMS_DEFECTS:
            db.add(TrackDefect(**d))

        # Seed SMMS assets
        for a in SMMS_ASSETS:
            db.add(SignalAsset(**a))

        # Seed TDMS assets
        for a in TDMS_ASSETS:
            db.add(TractionAsset(**a))

        # Seed Gantt blocks
        for b in GANTT_BLOCKS:
            db.add(MaintenanceBlock(**b))

        # Seed corridors
        for c in CORRIDORS:
            db.add(Corridor(**c))

        db.commit()
        print(f"✅ Database seeded: {len(TMS_DEFECTS)} TMS defects, {len(SMMS_ASSETS)} SMMS assets, "
              f"{len(TDMS_ASSETS)} TDMS assets, {len(GANTT_BLOCKS)} blocks, {len(CORRIDORS)} corridors.")
    except Exception as e:
        db.rollback()
        print(f"❌ Seeding failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
