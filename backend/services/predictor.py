"""
RailMind AI — XGBoost Predictive Scoring Engine
Scores asset failure risk using 6 features. Trains a model on synthetic data
on first run (saved to model_cache/). Returns failure probabilities and SHAP importance.

Feature engineering is deterministic — the same asset always produces the
same feature vector (derived from its real severity/condition/status and,
when available, a real date field), rather than being re-randomized on every
request. See services/live_data.py for how live DB rows are normalized and
fed through this module.
"""
import os
import json
import hashlib
from datetime import date, datetime, timezone
from typing import List, Dict, Any, Optional

import numpy as np
import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score, confusion_matrix

MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "model_cache", "risk_model.json")
METRICS_PATH = os.path.join(os.path.dirname(__file__), "..", "model_cache", "risk_model_metrics.json")
FEATURE_NAMES = [
    "days_since_maintenance",
    "defect_severity_score",
    "traffic_load_gmt_km",
    "asset_age_years",
    "weather_season_factor",
    "previous_failure_rate",
]

_model: xgb.XGBClassifier | None = None
_metrics_cache: Optional[Dict[str, Any]] = None

# Fixed training hyperparameters — kept as a constant (rather than read back
# off a loaded model, which doesn't restore sklearn-wrapper attributes from
# a raw booster file) so metrics reporting is accurate whether the model was
# just trained or loaded from cache.
_HYPERPARAMS = {"n_estimators": 150, "max_depth": 4, "learning_rate": 0.1, "subsample": 0.8, "colsample_bytree": 0.8}


def _generate_synthetic_data(n: int = 2000):
    """Generate labeled training data for the risk model."""
    rng = np.random.default_rng(42)
    X = rng.uniform(
        low=[0, 0, 0, 0, 0, 0],
        high=[365, 10, 100, 50, 1, 1],
        size=(n, 6),
    )
    # Failure probability based on domain logic
    risk = (
        0.34 * (X[:, 0] / 365)        # days_since_maintenance
        + 0.28 * (X[:, 1] / 10)       # defect_severity_score
        + 0.18 * (X[:, 2] / 100)      # traffic_load
        + 0.11 * (X[:, 3] / 50)       # asset_age
        + 0.06 * X[:, 4]              # weather
        + 0.03 * X[:, 5]              # prev_failure_rate
    )
    y = (risk > 0.5).astype(int)
    return X, y


def _evaluate(model: xgb.XGBClassifier, X_test, y_test, train_samples: int) -> Dict[str, Any]:
    """Score the model on data it never trained on — this is the "tested"
    half of "trained and tested": real held-out accuracy/precision/recall/F1/
    ROC-AUC, not just a training loss."""
    y_pred = model.predict(X_test)
    y_proba = model.predict_proba(X_test)[:, 1]
    tn, fp, fn, tp = confusion_matrix(y_test, y_pred).ravel()
    return {
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "train_samples": int(train_samples),
        "test_samples": int(len(y_test)),
        "accuracy": round(float(accuracy_score(y_test, y_pred)), 4),
        "precision": round(float(precision_score(y_test, y_pred, zero_division=0)), 4),
        "recall": round(float(recall_score(y_test, y_pred, zero_division=0)), 4),
        "f1_score": round(float(f1_score(y_test, y_pred, zero_division=0)), 4),
        "roc_auc": round(float(roc_auc_score(y_test, y_proba)), 4),
        "confusion_matrix": {"true_negative": int(tn), "false_positive": int(fp), "false_negative": int(fn), "true_positive": int(tp)},
        "feature_names": FEATURE_NAMES,
        "hyperparameters": _HYPERPARAMS,
    }


def _train_model() -> xgb.XGBClassifier:
    """Train the XGBoost model on a train split, evaluate it on a held-out
    test split it never saw, and cache both the model and its test metrics."""
    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    X, y = _generate_synthetic_data()
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

    model = xgb.XGBClassifier(
        **_HYPERPARAMS,
        random_state=42,
        eval_metric="logloss",
        verbosity=0,
    )
    model.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)
    model.save_model(MODEL_PATH)

    metrics = _evaluate(model, X_test, y_test, len(X_train))
    with open(METRICS_PATH, "w") as f:
        json.dump(metrics, f, indent=2)

    global _metrics_cache
    _metrics_cache = metrics
    return model


def get_model() -> xgb.XGBClassifier:
    """Load the cached model or train fresh. If a model is cached but its
    test-metrics file is missing (e.g. cached before this evaluation step
    existed), re-run the same held-out split to backfill real metrics
    without needing to retrain."""
    global _model
    if _model is not None:
        return _model
    if os.path.exists(MODEL_PATH):
        _model = xgb.XGBClassifier()
        _model.load_model(MODEL_PATH)
        if not os.path.exists(METRICS_PATH):
            X, y = _generate_synthetic_data()
            X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
            metrics = _evaluate(_model, X_test, y_test, len(X_train))
            os.makedirs(os.path.dirname(METRICS_PATH), exist_ok=True)
            with open(METRICS_PATH, "w") as f:
                json.dump(metrics, f, indent=2)
            global _metrics_cache
            _metrics_cache = metrics
    else:
        _model = _train_model()
    return _model


def get_model_metrics() -> Dict[str, Any]:
    """Real train/test evaluation results for the live model — this is what
    makes "the AI is trained and tested" a checkable fact instead of a claim."""
    global _metrics_cache
    get_model()  # ensures the model (and metrics file) exist
    if _metrics_cache is not None:
        return _metrics_cache
    if os.path.exists(METRICS_PATH):
        with open(METRICS_PATH) as f:
            _metrics_cache = json.load(f)
        return _metrics_cache
    return {}


_SEVERITY_MAP = {"critical": 9.0, "high": 7.0, "medium": 4.0, "low": 1.5, "Defect": 8.0, "Warning": 5.0, "Normal": 1.0}
_HIGH_RISK_MONTHS = {4, 5, 6, 7, 8, 9}  # Apr-Sep: heat + monsoon stress on Indian Railways assets
_OVERDUE_SEVERITY_BOOST = 2.0  # an overdue item is treated as more severe — delay compounds risk

# score_assets() bands its output by this tier so condition/severity always
# wins the sort — see the docstring there for why.
_SEVERITY_TIER = {"critical": 3, "Defect": 3, "high": 2, "Warning": 2, "medium": 1, "low": 0, "Normal": 0}


def _stable_unit(key: str, salt: str) -> float:
    """Deterministic pseudo-random float in [0, 1) from a stable hash of
    `key` — the same asset always yields the same value, unlike a fresh
    random.uniform() on every request."""
    h = hashlib.sha256(f"{salt}:{key}".encode()).hexdigest()
    return int(h[:8], 16) / 0xFFFFFFFF


def _asset_to_features(asset: Dict[str, Any]) -> List[float]:
    """Convert a raw asset dict to a deterministic feature vector.

    Recognizes both the live-data schema (severity_label/date_field/id) and
    the plain schema (severity/condition/status) so callers can pass either.
    """
    sev = asset.get("severity_label") or asset.get("severity") or asset.get("condition") or asset.get("status", "low")
    sev_score = float(_SEVERITY_MAP.get(sev, 4.0))
    if asset.get("status") == "Overdue":
        sev_score = min(9.0, sev_score + _OVERDUE_SEVERITY_BOOST)

    key = str(asset.get("id") or asset.get("asset_ref") or asset.get("title", "asset"))

    # Fallback values below are deterministic per-asset hashes, NOT derived
    # from the asset's own current ai_priority. An earlier version computed
    # both this fallback and `prev_fail` from ai_priority — since ai_priority
    # is itself the *output* of this same scoring on the previous sync, that
    # fed each sync's result back in as an input. Every asset's score
    # compressed a little further toward zero each time "Sync" was clicked,
    # eventually flattening real severity differences into noise (a critical
    # defect could end up ranked below a high one, or an overdue item near
    # the bottom) — this is what actually broke AI Priority ordering.
    date_field = asset.get("date_field")
    if date_field:
        try:
            d = datetime.strptime(date_field, "%Y-%m-%d").date()
            days_maint = max(0.0, min(365.0, float((date.today() - d).days)))
        except ValueError:
            days_maint = 180.0 + _stable_unit(key, "days_maint") * 150.0
    else:
        days_maint = 180.0 + _stable_unit(key, "days_maint") * 150.0

    traffic   = 40.0 + _stable_unit(key, "traffic") * 50.0
    age       = 2.0 + _stable_unit(key, "age") * 28.0
    weather   = 0.75 if date.today().month in _HIGH_RISK_MONTHS else 0.35
    prev_fail = _stable_unit(key, "prev_fail")

    return [days_maint, sev_score, traffic, age, weather, prev_fail]


def score_assets(assets: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Score a list of asset dicts using XGBoost.
    Returns each asset with failure_probability and risk_level added.

    The model's raw prediction is banded by severity/condition tier before
    being reported: every critical/Defect asset's failure_probability lands
    above every high/Warning asset's, which lands above every medium's,
    which lands above every low/Normal's. The model's actual output still
    sets the order *within* a tier — this is a floor under the prediction,
    not a replacement for it. Without it, two features the model also
    legitimately weighs (traffic load, asset age) could let a high-severity
    item on a busier, older section outscore a critical one on a quieter,
    newer section — defensible multi-factor math, but the wrong headline
    behavior for a severity/priority list where "critical" has to mean
    "handle this first," full stop.
    """
    if not assets:
        return []
    model = get_model()
    feature_matrix = np.array([_asset_to_features(a) for a in assets])
    proba = model.predict_proba(feature_matrix)[:, 1]

    results = []
    for asset, prob in zip(assets, proba):
        sev = asset.get("severity_label") or asset.get("severity") or asset.get("condition") or asset.get("status", "low")
        tier = _SEVERITY_TIER.get(sev, 1)
        banded_pct = min(99.9, tier * 25.0 + float(prob) * 24.5)

        if banded_pct > 75:
            level = "high"
        elif banded_pct > 45:
            level = "medium"
        else:
            level = "low"
        days_to_failure = max(1, int((100.0 - banded_pct) * 0.6))
        results.append({
            **asset,
            "failure_probability": round(banded_pct, 1),
            "risk_level": level,
            "days_to_failure": days_to_failure,
        })
    return results


def get_shap_importance() -> List[Dict[str, Any]]:
    """Return feature importance scores (mimics SHAP values)."""
    model = get_model()
    booster = model.get_booster()
    raw_scores = booster.get_score(importance_type="gain")

    # Map internal feature names (f0, f1, ...) to human readable
    mapped = {}
    for key, val in raw_scores.items():
        idx = int(key.replace("f", ""))
        if idx < len(FEATURE_NAMES):
            mapped[FEATURE_NAMES[idx]] = val

    total = sum(mapped.values()) or 1
    colors = ["#dc2626", "#c2410c", "#a16207", "#1d4ed8", "#7e22ce", "#15803d"]

    return [
        {
            "name": name,
            "val": round(mapped.get(name, 0) / total, 3),
            "color": colors[i % len(colors)],
        }
        for i, name in enumerate(FEATURE_NAMES)
    ]


def score_one(asset: Dict[str, Any]) -> Dict[str, Any]:
    """Score a single normalized asset dict (see live_data.load_live_assets)."""
    return score_assets([asset])[0]
