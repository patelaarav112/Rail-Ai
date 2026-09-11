from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from services.predictor import get_shap_importance, get_model_metrics
from services.live_data import get_live_risk_alerts, get_live_anomalies, get_live_forecast
from services.security import require_department

router = APIRouter(prefix="/predict", tags=["Predict"], dependencies=[Depends(require_department())])


@router.get("/risks")
def get_risks(db: Session = Depends(get_db)):
    return get_live_risk_alerts(db)


@router.get("/anomalies")
def get_anomaly_log(db: Session = Depends(get_db)):
    return get_live_anomalies(db)


@router.get("/shap")
def get_shap():
    return get_shap_importance()


@router.get("/forecast")
def get_health_forecast(db: Session = Depends(get_db)):
    return get_live_forecast(db)


@router.get("/model-info")
def model_info():
    """Real train/test evaluation of the live XGBoost model — accuracy,
    precision, recall, F1, ROC-AUC on a held-out test split, plus the
    hyperparameters and sample counts it was trained/tested with."""
    return get_model_metrics()
