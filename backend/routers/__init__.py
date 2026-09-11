from routers.auth import router as auth_router
from routers.tms import router as tms_router
from routers.smms import router as smms_router
from routers.tdms import router as tdms_router
from routers.blocks import router as blocks_router
from routers.corridors import router as corridors_router
from routers.coa import router as coa_router
from routers.analytics import router as analytics_router
from routers.optimize import router as optimize_router
from routers.predict import router as predict_router
from routers.dashboard import router as dashboard_router
from routers.reports import router as reports_router

__all__ = [
    "auth_router",
    "tms_router", "smms_router", "tdms_router", "blocks_router",
    "corridors_router", "coa_router", "analytics_router", "optimize_router",
    "predict_router", "dashboard_router", "reports_router",
]
