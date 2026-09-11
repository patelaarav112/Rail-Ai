# 🚆 RailMind AI — Automatic Block Planning System

> **AI-powered maintenance block scheduling for Indian Railways**  
> Integrates TMS · SMMS · TDMS · COA with OR-Tools CP-SAT optimization and XGBoost predictive failure scoring.

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| **Backend API** | [FastAPI](https://fastapi.tiangolo.com/) 0.111+ |
| **Optimization Engine** | [Google OR-Tools CP-SAT](https://developers.google.com/optimization) 9.12+ |
| **Predictive Scoring** | [XGBoost](https://xgboost.readthedocs.io/) 2.0+ (failure risk, SHAP importance) |
| **Database ORM** | [SQLAlchemy](https://www.sqlalchemy.org/) 2.0+ |
| **Database (dev)** | SQLite (zero install) |
| **Database (prod)** | [PostgreSQL](https://www.postgresql.org/) 14+ via psycopg2-binary |
| **Frontend** | [React](https://react.dev/) 18 + [Vite](https://vitejs.dev/) 5 |
| **Charts** | [Chart.js](https://www.chartjs.org/) 4 + react-chartjs-2 |
| **HTTP Client** | [Axios](https://axios-http.com/) |

---

## 🚀 Quick Start

### One-click (Windows, after the one-time setup below)
Double-click **`start-demo.bat`** in the project root — it opens the backend
and frontend each in their own window, and auto-restarts either one if it
crashes, so a demo doesn't stall on a dead process. Close a window to stop
that half for real.

### Prerequisites
- Python 3.10+
- Node.js 18+

### 1. Backend

```bash
cd backend

# Install dependencies (includes psycopg2-binary for PostgreSQL)
pip install -r requirements.txt

# Configure database (optional — SQLite is default)
cp .env.example .env
# Edit .env if you want PostgreSQL (see .env.example for instructions)

# Start FastAPI
uvicorn main:app --reload --port 8000
```

API docs available at: http://localhost:8000/api/docs

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Dashboard available at: http://localhost:5173

---

## 🗄 Database Setup

### Option A — SQLite (Default, No Install)
No configuration needed. SQLite file is created automatically at `backend/railmind.db`.

### Option B — PostgreSQL (Production)

1. Install PostgreSQL from https://www.postgresql.org/download/windows/
2. Create the database:
```sql
CREATE USER railmind WITH PASSWORD 'railmind123';
CREATE DATABASE railmind OWNER railmind;
GRANT ALL PRIVILEGES ON DATABASE railmind TO railmind;
```
3. Set `DATABASE_URL` in `backend/.env`:
```
DATABASE_URL=postgresql://railmind:railmind123@localhost:5432/railmind
```
4. Restart the backend — tables are created automatically on startup.

---

## 📡 REST API Endpoints

| Module | Endpoint | Description |
|---|---|---|
| Health | `GET /api/health` | System health + DB status |
| TMS | `GET /api/tms/defects` | Track defects (with search/filter) |
| SMMS | `GET /api/smms/assets` | Signal & Telecom assets |
| TDMS | `GET /api/tdms/assets` | Traction & OHE assets |
| Blocks | `GET /api/blocks` | Maintenance blocks |
| Blocks | `GET /api/blocks/gantt` | Gantt chart data |
| Blocks | `POST /api/blocks/check-conflict` | Conflict detection |
| Corridors | `GET /api/corridors` | Railway corridors |
| COA | `GET /api/coa/trains` | Train timetable |
| COA | `GET /api/coa/windows` | Block windows |
| **Optimize** | `POST /api/optimize` | **OR-Tools CP-SAT scheduler** |
| **Predict** | `GET /api/predict/risks` | **XGBoost failure risk** |
| **Predict** | `GET /api/predict/shap` | **XGBoost SHAP importance** |
| Analytics | `GET /api/analytics/shap` | Feature importance (XGBoost) |
| Analytics | `GET /api/analytics/trends` | 30-day trend data |
| Reports | `GET /api/reports/weekly` | Weekly block plan |
| Reports | `GET /api/reports/summary` | Summary statistics |
| Reports | `GET /api/reports/monthly-stats` | Monthly performance |
| Dashboard | `GET /api/dashboard/kpis` | Dashboard KPIs |

Full interactive docs: http://localhost:8000/api/docs

---

## 🤖 AI Components

### OR-Tools CP-SAT Optimizer (`services/optimizer.py`)
- Schedules maintenance blocks using constraint programming
- Constraints: no-overlap per section, max block duration, traffic tolerance
- Objective: minimize weighted start time (prefers 00:00–04:00 window)
- Returns OPTIMAL/FEASIBLE solution with Pareto metrics

### XGBoost Predictor (`services/predictor.py`)
- Trained on 2000 synthetic asset records with 6 features
- Features: `days_since_maintenance`, `defect_severity_score`, `traffic_load_gmt_km`, `asset_age_years`, `weather_season_factor`, `previous_failure_rate`
- Outputs: failure probability %, risk level, days to failure
- SHAP feature importance exposed via `/api/predict/shap`

---

## 📁 Project Structure

```
train/
├── backend/
│   ├── main.py              # FastAPI app (lifespan, CORS, routers)
│   ├── database.py          # SQLAlchemy engine (SQLite + PostgreSQL)
│   ├── requirements.txt     # Python dependencies
│   ├── .env.example         # Environment variable template
│   ├── models/              # SQLAlchemy ORM models
│   ├── schemas/             # Pydantic request/response schemas
│   ├── routers/             # FastAPI route handlers
│   └── services/
│       ├── optimizer.py     # OR-Tools CP-SAT block scheduler
│       ├── predictor.py     # XGBoost risk scoring + SHAP
│       └── seeder.py        # Database seed data
└── frontend/
    ├── vite.config.js       # Vite + /api proxy config
    ├── src/
    │   ├── api/             # Axios REST API clients
    │   ├── views/           # React page components
    │   ├── components/      # Shared UI components
    │   └── hooks/           # Custom hooks (useAPI, useToast)
    └── package.json
```
