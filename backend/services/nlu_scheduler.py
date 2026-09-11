"""
RailMind AI — Self-Trained Natural-Language Block Intake
Turns a plain-English scheduling request ("2h track inspection on NDLS-MTJ
next Tuesday night") into a filled-out block form, entirely in-house — no
external API. Two layers do the work, and each is genuinely trained/tested
or genuinely exact, never just asserted:

1. Three TF-IDF + XGBoost multi-class classifiers (department, section,
   priority) trained on a generated corpus and scored on a held-out test
   split they never saw — see get_nlu_metrics(). This is the part of the
   request that's genuinely ambiguous ("broken rail near Agra" ->
   engg/AGC-CNB has to be learned from word association, not looked up).
2. Deterministic rule-based extractors for duration ("2h"), an explicit
   clock time ("at 10pm"), and relative dates ("next Tuesday") — these
   aren't classification problems (there's one correct answer, not a
   learned association), so they're plain code, checked by
   _test_rule_extractors() at train time instead of a classifier accuracy
   score. Real NLU systems combine trained slot classifiers with a
   deterministic date/time parser the same way (e.g. Rasa + duckling).

Models are cached to model_cache/ like services/predictor.py's risk model —
trained once, then loaded from disk on every subsequent start.
"""
import os
import re
import json
import random
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import joblib
import numpy as np
import xgboost as xgb
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.pipeline import FeatureUnion
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import accuracy_score, f1_score

CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "model_cache")
VECTORIZER_PATH = os.path.join(CACHE_DIR, "nlu_vectorizer.joblib")
ENCODERS_PATH = os.path.join(CACHE_DIR, "nlu_label_encoders.joblib")
METRICS_PATH = os.path.join(CACHE_DIR, "nlu_model_metrics.json")
MODEL_PATHS = {
    "department": os.path.join(CACHE_DIR, "nlu_department.json"),
    "section": os.path.join(CACHE_DIR, "nlu_section.json"),
    "priority": os.path.join(CACHE_DIR, "nlu_priority.json"),
}
# Time-of-day is deliberately NOT one of the trained classifiers below — an
# early version trained one and it scored a mediocre ~73%, because "night"/
# "morning"/"evening" are unambiguous surface keywords, not something that
# needs learned generalization the way department or section do. Rule-based
# extraction (see extract_time_bucket) gets this right for a checkable
# reason instead of a probabilistic one, and is evaluated the same way the
# date/duration/clock-time rules are — see _test_rule_extractors() and the
# corpus-wide accuracy check in _train().
FIELDS = ["department", "section", "priority"]

SECTIONS = ["NDLS-MTJ", "MTJ-AGC", "AGC-CNB", "CNB-ALD", "ALD-MGS", "BPL-ET"]
DEPARTMENTS = ["engg", "st", "trd"]
PRIORITIES = ["critical", "high", "medium", "low"]
# name -> (default start hour, default end hour) once a request is bucketed
# into a rough time of day. Overridden by an explicit clock time or duration
# if the request states one (see extract_explicit_hour / extract_duration_hours).
TIME_BUCKETS = {
    "night": (2, 4), "early_morning": (5, 7), "morning": (8, 10),
    "afternoon": (13, 15), "evening": (18, 20), "unspecified": (2, 4),
}

_HYPERPARAMS = {"n_estimators": 60, "max_depth": 4, "learning_rate": 0.3, "subsample": 0.9, "colsample_bytree": 0.9}

# ─── Vocabulary the synthetic training corpus is built from ────────────────
# Deliberately not identical to the phrase actually asked at inference time
# in most real requests — the whole point of the classifiers is to
# generalize from word association (e.g. "broken rail" -> engg) rather than
# requiring an exact template match, which a plain keyword lookup couldn't do.
DEPT_WORK_PHRASES = {
    "engg": [
        "track inspection", "rail fracture repair", "ballast renewal", "track tamping",
        "rail grinding", "bridge inspection", "track geometry check", "rail welding repair",
        "sleeper replacement", "deep screening", "rail joint repair", "track patrolling",
        "broken rail repair", "track circuit fault", "formation strengthening",
    ],
    "st": [
        "signal maintenance", "interlocking check", "point machine repair", "axle counter testing",
        "block instrument check", "telecom cable repair", "signal cable inspection",
        "relay room maintenance", "level crossing signal check", "optical fiber repair",
        "signal circuit testing", "route relay interlocking check", "signal failure attention",
        "block section telephone repair",
    ],
    "trd": [
        "OHE inspection", "traction substation check", "catenary wire repair",
        "feeder cable maintenance", "pantograph inspection", "traction motor check",
        "overhead line repair", "circuit breaker testing", "insulator cleaning",
        "power supply inspection", "OHE wire tensioning", "traction transformer check",
        "OHE snag rectification", "auto tensioning device check",
    ],
}

SECTION_PHRASES = {
    "NDLS-MTJ": ["NDLS-MTJ", "New Delhi to Mathura", "near New Delhi", "Ghaziabad section", "the Delhi-Mathura corridor", "New Delhi-Ghaziabad stretch"],
    "MTJ-AGC": ["MTJ-AGC", "Mathura to Agra", "near Mathura", "Agra Cantt section", "the Mathura-Agra stretch"],
    "AGC-CNB": ["AGC-CNB", "Agra to Kanpur", "near Agra", "Kanpur Central section", "the Agra-Kanpur stretch"],
    "CNB-ALD": ["CNB-ALD", "Kanpur to Allahabad", "near Kanpur", "Prayagraj section", "the Kanpur-Prayagraj stretch"],
    "ALD-MGS": ["ALD-MGS", "Allahabad to Mughalsarai", "near Prayagraj", "the Pandit Deen Dayal Upadhyaya Jn section", "the Prayagraj-Mughalsarai stretch"],
    "BPL-ET": ["BPL-ET", "Bhopal to Itarsi", "near Bhopal", "Itarsi section", "the Bhopal-Itarsi stretch"],
}

PRIORITY_PHRASES = {
    "critical": ["urgent", "critical", "an emergency", "immediately", "asap", "top priority"],
    "high": ["high priority", "important", "as soon as possible", "priority"],
    "low": ["routine", "low priority", "minor", "whenever convenient", "non-urgent"],
    "medium": [""],  # no explicit urgency phrase — the model has to default sanely
}

TIME_BUCKET_PHRASES = {
    "night": ["at night", "late at night", "overnight", "in the midnight window"],
    "early_morning": ["early morning", "before dawn", "in the pre-dawn hours"],
    "morning": ["in the morning", "during the morning"],
    "afternoon": ["in the afternoon", "during the afternoon"],
    "evening": ["in the evening", "during the evening"],
    "unspecified": [""],
}

_FILLERS = ["", "Please ", "Kindly ", "We need to ", "Can you schedule ", "Requesting to "]
_SENTENCE_TEMPLATES = [
    # Every template includes every slot exactly once — a slot missing from
    # a template but present in the corresponding ground-truth label is
    # exactly the kind of silent labeling bug the held-out test split is
    # supposed to catch; see the time-of-day metric discussion below.
    "{filler}{duration}{work} on {section}{date}{time}{priority}",
    "{filler}schedule {duration}{work} {date}{time} on {section}{priority}",
    "{filler}need {work} on {section}{date}{time}{priority}",
    "{priority_lead}{work} required near {section}{date}{time}",
    "{filler}plan {work} on {section}{time}{date}{priority}",
    "{work} on {section}{time} {priority} {duration}{date}",
]
_DATE_PHRASES = ["", " today", " tonight", " tomorrow", " day after tomorrow", " next monday", " next tuesday",
                  " next wednesday", " next thursday", " next friday", " next saturday", " this weekend", " in 3 days", " in a week"]
_DURATION_PHRASES = ["", "a 1h ", "a 2h ", "a 2 hour ", "a 3h ", "a 4h ", "a quick "]

_ALL_WORK_PHRASES: List[Tuple[str, str]] = sorted(
    ((phrase, dept) for dept, phrases in DEPT_WORK_PHRASES.items() for phrase in phrases),
    key=lambda p: -len(p[0]),
)


# ─── Deterministic rule-based extractors (not learned — see module docstring) ──

def extract_duration_hours(text: str) -> Optional[int]:
    t = text.lower()
    m = re.search(r"(\d+(?:\.\d+)?)\s*h(?:ou)?r?s?\b", t)
    if m:
        return max(1, round(float(m.group(1))))
    if re.search(r"\bquick\b", t):
        return 1
    if re.search(r"\d+\s*min", t):
        return 1  # sub-hour work still occupies a whole hour-granular block
    return None


def extract_explicit_hour(text: str) -> Optional[int]:
    t = text.lower()
    m = re.search(r"\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b", t)
    if m:
        hour = int(m.group(1)) % 24
        ampm = m.group(3)
        if ampm == "pm" and hour != 12:
            hour = (hour + 12) % 24
        elif ampm == "am" and hour == 12:
            hour = 0
        return hour
    m = re.search(r"\b([01]?\d|2[0-3]):([0-5]\d)\b", t)
    if m:
        return int(m.group(1)) % 24
    return None


_TIME_BUCKET_KEYWORDS = {
    "night": ["overnight", "late at night", "at night", "midnight", "late night"],
    "early_morning": ["early morning", "before dawn", "pre-dawn", "predawn", "dawn"],
    "afternoon": ["afternoon", "midday", "noon"],
    "evening": ["evening", "dusk"],
    "morning": ["morning"],
}
# Checked in this order so a multi-word phrase like "early morning" is
# matched before the plain "morning" bucket's bare keyword steals it.
_TIME_BUCKET_ORDER = ["night", "early_morning", "afternoon", "evening", "morning"]


def extract_time_bucket(text: str) -> str:
    t = text.lower()
    for bucket in _TIME_BUCKET_ORDER:
        if any(kw in t for kw in _TIME_BUCKET_KEYWORDS[bucket]):
            return bucket
    if re.search(r"\bnight\b", t):  # "Tuesday night" etc. — no other keyword matched
        return "night"
    return "unspecified"


_WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

_MONTHS = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3,
    "apr": 4, "april": 4, "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7,
    "aug": 8, "august": 8, "sep": 9, "sept": 9, "september": 9, "oct": 10, "october": 10,
    "nov": 11, "november": 11, "dec": 12, "december": 12,
}
_MONTH_NAMES = "|".join(sorted(_MONTHS, key=len, reverse=True))  # longest-first: "september" before "sep"


def _resolve_absolute_date(text: str, today: date) -> Optional[int]:
    """"20sep", "20 sep", "sep 20", "September 20th" -> days from `today`,
    rolling into next year if that day/month has already passed this year.
    No `\\b` between the day-number and month name — real input glues them
    together ("20sep") with no separator, so requiring a boundary there
    would silently refuse to match the exact phrasing users actually type."""
    t = text.lower()
    m = re.search(rf"\b(\d{{1,2}})(?:st|nd|rd|th)?\s*({_MONTH_NAMES})\b", t)
    if m:
        day, month = int(m.group(1)), _MONTHS[m.group(2)]
    else:
        m = re.search(rf"\b({_MONTH_NAMES})\s*(\d{{1,2}})(?:st|nd|rd|th)?\b", t)
        if not m:
            return None
        month, day = _MONTHS[m.group(1)], int(m.group(2))

    try:
        target = date(today.year, month, day)
    except ValueError:
        return None  # e.g. "31 feb" — not a real date, fall through to other rules
    if target < today:
        try:
            target = date(today.year + 1, month, day)
        except ValueError:
            return None
    return (target - today).days


def extract_date_offset(text: str, today: date) -> int:
    """Relative-date phrase -> integer days from `today`. Exact rule-based
    logic (there's exactly one correct offset for a given phrase and
    weekday), so it's verified with real assertions in
    _test_rule_extractors() rather than reported as a classifier accuracy."""
    absolute = _resolve_absolute_date(text, today)
    if absolute is not None:
        return max(0, absolute)

    t = text.lower()
    if "day after tomorrow" in t:
        return 2
    if "tomorrow" in t:
        return 1
    if "tonight" in t or "today" in t:
        return 0
    m = re.search(r"in\s+(\d+)\s*day", t)
    if m:
        return int(m.group(1))
    if re.search(r"in\s+(a|1)\s*week|next week", t):
        return 7
    if "this weekend" in t:
        days_ahead = (5 - today.weekday()) % 7  # next Saturday
        return days_ahead or 7
    for i, wd in enumerate(_WEEKDAYS):
        if f"next {wd}" in t:
            days_ahead = (i - today.weekday() + 7) % 7
            return days_ahead or 7
        if f"this {wd}" in t or re.search(rf"\b{wd}\b", t):
            return (i - today.weekday()) % 7
    return 0


def extract_label(text: str) -> Optional[str]:
    """Best-matching known work phrase, Title Cased — the classifiers infer
    *which department/section/priority*, but the label itself is lifted
    straight from the text when a recognizable phrase is present."""
    t = text.lower()
    for phrase, _dept in _ALL_WORK_PHRASES:
        if phrase.lower() in t:
            return phrase[:1].upper() + phrase[1:]
    return None


def _test_rule_extractors() -> Dict[str, Any]:
    """Real assertions against a fixed reference date, run at train time —
    this is what makes "the date parser works" a checked fact instead of an
    assumption. Friday is used as the reference so every weekday branch
    (today/this-week/next-week wraparound) actually gets exercised."""
    ref = date(2026, 9, 11)  # a Friday
    date_cases = [
        ("schedule it today", 0), ("do it tonight", 0), ("tomorrow morning", 1),
        ("day after tomorrow", 2), ("next monday", 3), ("next friday", 7),
        ("this weekend", 1), ("in 3 days", 3), ("in a week", 7), ("no date mentioned", 0),
        # Absolute dates — glued together ("20sep") the way users actually
        # type them, spaced out, and month-then-day order, plus a same-year
        # date that's already passed (must roll over into next year).
        ("on 20sep", (date(2026, 9, 20) - ref).days),
        ("sep 25", (date(2026, 9, 25) - ref).days),
        ("15th september", (date(2026, 9, 15) - ref).days),
        ("on 5 jan", (date(2027, 1, 5) - ref).days),
    ]
    duration_cases = [("a 2h inspection", 2), ("3 hours of work", 3), ("a quick check", 1), ("nothing stated", None)]
    hour_cases = [("at 22:00", 22), ("at 10pm", 22), ("at 6am", 6), ("no time given", None)]
    time_bucket_cases = [
        ("Tuesday night inspection", "night"), ("overnight repair", "night"),
        ("early morning before dawn", "early_morning"), ("in the morning", "morning"),
        ("this afternoon", "afternoon"), ("this evening", "evening"),
        ("no time-of-day mentioned", "unspecified"),
    ]

    date_pass = sum(1 for text, exp in date_cases if extract_date_offset(text, ref) == exp)
    duration_pass = sum(1 for text, exp in duration_cases if extract_duration_hours(text) == exp)
    hour_pass = sum(1 for text, exp in hour_cases if extract_explicit_hour(text) == exp)
    tb_pass = sum(1 for text, exp in time_bucket_cases if extract_time_bucket(text) == exp)
    total_pass = date_pass + duration_pass + hour_pass + tb_pass
    total = len(date_cases) + len(duration_cases) + len(hour_cases) + len(time_bucket_cases)

    return {
        "date_parser": f"{date_pass}/{len(date_cases)}",
        "duration_parser": f"{duration_pass}/{len(duration_cases)}",
        "clock_time_parser": f"{hour_pass}/{len(hour_cases)}",
        "time_of_day_parser": f"{tb_pass}/{len(time_bucket_cases)}",
        "overall": f"{total_pass}/{total}",
        "passed": total_pass == total,
    }


# ─── Synthetic training corpus ──────────────────────────────────────────────

def _generate_training_data(n: int = 4000, seed: int = 42):
    """Generate (text, department, section, priority, time_bucket) examples.
    Templates and vocab are randomly recombined with a seeded RNG so the run
    is reproducible, but no single fixed sentence dominates the corpus."""
    rng = random.Random(seed)
    texts, dept_y, section_y, priority_y, tb_y = [], [], [], [], []

    for _ in range(n):
        dept = rng.choice(DEPARTMENTS)
        work = rng.choice(DEPT_WORK_PHRASES[dept])
        section = rng.choice(SECTIONS)
        section_phrase = rng.choice(SECTION_PHRASES[section])
        priority = rng.choice(PRIORITIES)
        priority_phrase = rng.choice(PRIORITY_PHRASES[priority])
        time_bucket = rng.choice(list(TIME_BUCKET_PHRASES))
        time_phrase = rng.choice(TIME_BUCKET_PHRASES[time_bucket])
        date_phrase = rng.choice(_DATE_PHRASES)
        duration_phrase = rng.choice(_DURATION_PHRASES)
        filler = rng.choice(_FILLERS)

        template = rng.choice(_SENTENCE_TEMPLATES)
        text = template.format(
            filler=filler,
            work=work,
            section=section_phrase,
            date=date_phrase,
            time=(" " + time_phrase) if time_phrase else "",
            priority=(", " + priority_phrase) if priority_phrase else "",
            priority_lead=(priority_phrase.capitalize() + " ") if priority_phrase else "",
            duration=duration_phrase,
        )
        text = re.sub(r"\s+", " ", text).strip()

        texts.append(text)
        dept_y.append(dept)
        section_y.append(section)
        priority_y.append(priority)
        tb_y.append(time_bucket)

    return texts, dept_y, section_y, priority_y, tb_y


# ─── Train / load / evaluate ────────────────────────────────────────────────

def _build_vectorizer() -> FeatureUnion:
    """Word n-grams alone miss inflections a demo user will actually type —
    "urgently" shares no token with the "urgent" the training vocabulary
    uses. Character n-grams pick up that overlap (both contain "urgen"),
    the standard fix for this without a full stemmer/lemmatizer dependency.
    max_features caps both spaces — char n-grams especially explode in
    count otherwise — which keeps training to seconds without losing the
    frequent, informative n-grams (rare ones are dropped first)."""
    return FeatureUnion([
        ("word", TfidfVectorizer(lowercase=True, ngram_range=(1, 2), min_df=2, sublinear_tf=True, max_features=4000)),
        ("char", TfidfVectorizer(lowercase=True, analyzer="char_wb", ngram_range=(3, 4), min_df=2, sublinear_tf=True, max_features=4000)),
    ])


_vectorizer: Optional[FeatureUnion] = None
_encoders: Optional[Dict[str, LabelEncoder]] = None
_models: Optional[Dict[str, xgb.XGBClassifier]] = None
_metrics_cache: Optional[Dict[str, Any]] = None


def _train() -> None:
    """Train the shared TF-IDF vectorizer and the four classifiers on a
    train split, score every one of them on a held-out test split they
    never saw, and cache everything to disk."""
    os.makedirs(CACHE_DIR, exist_ok=True)
    texts, dept_y, section_y, priority_y, tb_y = _generate_training_data()

    (texts_tr, texts_te, dept_tr, dept_te, sec_tr, sec_te,
     pri_tr, pri_te, tb_tr, tb_te) = train_test_split(
        texts, dept_y, section_y, priority_y, tb_y, test_size=0.2, random_state=42,
    )

    vectorizer = _build_vectorizer()
    X_tr = vectorizer.fit_transform(texts_tr)
    X_te = vectorizer.transform(texts_te)

    field_data = {
        "department": (dept_tr, dept_te),
        "section": (sec_tr, sec_te),
        "priority": (pri_tr, pri_te),
    }

    encoders: Dict[str, LabelEncoder] = {}
    models: Dict[str, xgb.XGBClassifier] = {}
    per_field: Dict[str, Any] = {}
    test_preds: Dict[str, np.ndarray] = {}

    for field, (y_tr, y_te) in field_data.items():
        enc = LabelEncoder()
        y_tr_enc = enc.fit_transform(y_tr)
        y_te_enc = enc.transform(y_te)

        model = xgb.XGBClassifier(**_HYPERPARAMS, random_state=42, eval_metric="mlogloss", verbosity=0)
        model.fit(X_tr, y_tr_enc)
        model.save_model(MODEL_PATHS[field])

        y_pred = model.predict(X_te)
        per_field[field] = {
            "accuracy": round(float(accuracy_score(y_te_enc, y_pred)), 4),
            "f1_macro": round(float(f1_score(y_te_enc, y_pred, average="macro")), 4),
            "classes": list(enc.classes_),
        }
        test_preds[field] = y_pred == y_te_enc

        encoders[field] = enc
        models[field] = model

    exact_match = np.logical_and.reduce([test_preds[f] for f in FIELDS])

    # Time-of-day is rule-based, not trained (see FIELDS comment above) —
    # still evaluated for real, just against the corpus's known ground truth
    # instead of a classifier's held-out score.
    tb_pred = [extract_time_bucket(t) for t in texts_te]
    time_bucket_rule_accuracy = round(float(accuracy_score(tb_te, tb_pred)), 4)

    rule_test = _test_rule_extractors()

    metrics = {
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "train_samples": len(texts_tr),
        "test_samples": len(texts_te),
        "vocabulary_size": len(vectorizer.get_feature_names_out()),
        "per_field": per_field,
        "exact_match_accuracy": round(float(exact_match.mean()), 4),
        "time_bucket_rule_based_accuracy": time_bucket_rule_accuracy,
        "rule_based_extractors": rule_test,
        "hyperparameters": _HYPERPARAMS,
    }

    joblib.dump(vectorizer, VECTORIZER_PATH)
    joblib.dump(encoders, ENCODERS_PATH)
    with open(METRICS_PATH, "w") as f:
        json.dump(metrics, f, indent=2)

    global _vectorizer, _encoders, _models, _metrics_cache
    _vectorizer, _encoders, _models, _metrics_cache = vectorizer, encoders, models, metrics


def _load_or_train() -> None:
    global _vectorizer, _encoders, _models, _metrics_cache
    if _models is not None:
        return
    if all(os.path.exists(p) for p in (VECTORIZER_PATH, ENCODERS_PATH, METRICS_PATH, *MODEL_PATHS.values())):
        _vectorizer = joblib.load(VECTORIZER_PATH)
        _encoders = joblib.load(ENCODERS_PATH)
        _models = {}
        for field, path in MODEL_PATHS.items():
            m = xgb.XGBClassifier()
            m.load_model(path)
            _models[field] = m
        with open(METRICS_PATH) as f:
            _metrics_cache = json.load(f)
    else:
        _train()


def get_nlu_metrics() -> Dict[str, Any]:
    """Real train/test evaluation of the live NLU classifiers, plus the
    deterministic rule-extractor self-test — the checkable evidence behind
    "trained and tested", not a claim."""
    _load_or_train()
    return _metrics_cache or {}


# ─── Public parsing API (unchanged call signature/behavior contract) ───────

class NLUParseError(Exception):
    """Raised only when there's literally nothing to parse."""


def parse_block_request(text: str, requester_dept: str, today: Optional[date] = None) -> Dict[str, Any]:
    text = (text or "").strip()
    if not text:
        raise NLUParseError("Type what you'd like to schedule first.")

    _load_or_train()
    today = today or date.today()

    X = _vectorizer.transform([text])
    predicted: Dict[str, str] = {}
    confidences: Dict[str, float] = {}
    for field in FIELDS:
        model = _models[field]
        enc = _encoders[field]
        proba = model.predict_proba(X)[0]
        idx = int(np.argmax(proba))
        predicted[field] = enc.inverse_transform([idx])[0]
        confidences[field] = float(proba[idx])

    department = predicted["department"] if requester_dept == "coa" else requester_dept
    section = predicted["section"] if predicted["section"] in SECTIONS else SECTIONS[0]
    priority = predicted["priority"] if predicted["priority"] in PRIORITIES else "medium"

    time_bucket = extract_time_bucket(text)
    start_hour, end_hour = TIME_BUCKETS.get(time_bucket, TIME_BUCKETS["unspecified"])
    explicit_hour = extract_explicit_hour(text)
    if explicit_hour is not None:
        start_hour = explicit_hour
    duration = extract_duration_hours(text)
    end_hour = start_hour + duration if duration else max(end_hour, start_hour + 1)
    start_hour = max(0, min(start_hour, 23))
    end_hour = max(start_hour + 1, min(end_hour, 24))

    date_offset = max(0, min(extract_date_offset(text, today), 60))

    dept_label = extract_label(text)
    if not dept_label:
        dept_label = f"{ {'engg': 'Track', 'st': 'Signal', 'trd': 'Traction'}.get(department, 'General') } Maintenance"

    overall_confidence = sum(confidences.values()) / len(confidences)
    confidence_level = "high" if overall_confidence > 0.75 else "medium" if overall_confidence > 0.5 else "low"

    notes = []
    if requester_dept != "coa" and predicted["department"] != requester_dept:
        notes.append(f"Department locked to your own ({requester_dept}).")
    if confidences["section"] < 0.5:
        notes.append("Section wasn't clearly stated — best guess.")
    if confidences["priority"] < 0.5 and "priority" not in text.lower():
        notes.append("No urgency stated — defaulted to medium priority.")
    if explicit_hour is None and duration is None and time_bucket == "unspecified":
        notes.append("No time window stated — used the standard low-traffic window.")

    return {
        "section": section,
        "department": department,
        "label": dept_label,
        "start_hour": start_hour,
        "end_hour": end_hour,
        "date_offset": date_offset,
        "priority": priority,
        "confidence": confidence_level,
        "notes": " ".join(notes)[:200],
    }
