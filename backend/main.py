"""FastAPI backend for Football Player Market Value & Trajectory Intelligence."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any

import pandas as pd
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from ml_pipeline import CLEAN_NUM_FEATURES, CAT_FEATURES, DashboardArtifacts, build_artifacts

artifacts: DashboardArtifacts | None = None


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global artifacts
    artifacts = build_artifacts()
    yield


app = FastAPI(
    title="Transfermarkt Player Trajectory & Valuation API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SimulateRequest(BaseModel):
    age: float = Field(..., ge=14, le=45)
    age_at_peak: float = Field(..., ge=14, le=45)
    peak_value_eur: float = Field(..., ge=0)
    first_value_eur: float = Field(..., ge=0)
    career_span_years: float = Field(..., ge=0)
    years_to_peak: float = Field(..., ge=0)
    value_volatility: float = Field(..., ge=0)
    num_valuation_points: int = Field(..., ge=1)
    num_clubs_career: int = Field(..., ge=1)
    league_name: str
    nationality: str


def _get_artifacts() -> DashboardArtifacts:
    if artifacts is None:
        raise RuntimeError("ML artifacts not initialized")
    return artifacts


def _scouting_verdict(
    trajectory: str,
    pred_value: float,
    peak_value: float,
    age: float,
) -> str:
    ratio = (pred_value / peak_value) if peak_value > 0 else 1.0
    if trajectory == "rising_star":
        return f"High-upside rising star (age {age:.0f}) projected at €{pred_value / 1e6:.1f}M; prime acquisition target."
    if trajectory == "growing":
        return f"Upward growth trajectory at €{pred_value / 1e6:.1f}M ({ratio:.0%} of peak); strong compounding value."
    if trajectory == "stable":
        return f"Established performer holding steady around €{pred_value / 1e6:.1f}M ({ratio:.0%} of peak)."
    if trajectory == "declining":
        return f"Post-peak decline phase (€{pred_value / 1e6:.1f}M vs €{peak_value / 1e6:.1f}M peak); monitor contract length."
    return f"Sharp depreciation risk (€{pred_value / 1e6:.1f}M, {ratio:.0%} of peak); high-risk asset."


@app.get("/api/health")
def health() -> dict[str, Any]:
    art = _get_artifacts()
    return {
        "status": "ok",
        "players": art.total_players,
        "history_rows": art.history_rows,
    }


@app.get("/api/overview")
def overview() -> dict[str, Any]:
    return _get_artifacts().overview


@app.get("/api/test-predictions")
def test_predictions() -> dict[str, Any]:
    return _get_artifacts().test_predictions


@app.get("/api/history")
def history(
    q: str = Query(default="", description="Search player name, club, or nationality"),
    league: str = Query(default="", description="Filter by league_name"),
    limit: int = Query(default=30, ge=1, le=508),
) -> dict[str, Any]:
    art = _get_artifacts()
    df = art.players_df

    if league and league.lower() != "all":
        df = df[df["league_name"].str.lower() == league.strip().lower()]

    if q.strip():
        needle = q.strip().lower()
        mask = (
            df["name"].fillna("").str.lower().str.contains(needle, regex=False)
            | df["peak_club"].fillna("").str.lower().str.contains(needle, regex=False)
            | df["nationality_clean"].fillna("").str.lower().str.contains(needle, regex=False)
        )
        df = df[mask]

    df = df.sort_values("current_value_eur", ascending=False).head(limit)

    players: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        pid = str(row["player_id"])
        players.append(
            {
                "player_id": pid,
                "name": str(row["name"]),
                "age": None if pd.isna(row["age"]) else float(row["age"]),
                "nationality": str(row["nationality_clean"]),
                "league_name": str(row["league_name"]),
                "peak_club": str(row["peak_club"]) if pd.notna(row["peak_club"]) else "Unknown",
                "current_value_eur": float(row["current_value_eur"]),
                "peak_value_eur": float(row["peak_value_eur"]),
                "trajectory": str(row["trajectory"]),
                "history": art.history_by_player.get(pid, []),
            }
        )

    return {"players": players}


@app.post("/api/simulate")
def simulate(req: SimulateRequest) -> dict[str, Any]:
    art = _get_artifacts()
    nat = req.nationality.strip()
    nat_grouped = nat if nat in art.top_nationalities else "Other"

    row_dict = {
        "age": float(req.age),
        "age_at_peak": float(req.age_at_peak),
        "peak_value_eur": float(req.peak_value_eur),
        "first_value_eur": float(req.first_value_eur),
        "career_span_years": float(req.career_span_years),
        "years_to_peak": float(req.years_to_peak),
        "value_volatility": float(req.value_volatility),
        "num_valuation_points": int(req.num_valuation_points),
        "num_clubs_career": int(req.num_clubs_career),
        "ever_100m": int(req.peak_value_eur >= 100_000_000),
        "ever_50m": int(req.peak_value_eur >= 50_000_000),
        "ever_10m": int(req.peak_value_eur >= 10_000_000),
        "league_name": req.league_name.strip(),
        "nationality": nat_grouped,
    }
    X_input = pd.DataFrame([row_dict], columns=CLEAN_NUM_FEATURES + CAT_FEATURES)

    pred_traj = str(art.best_clean_clf.predict(X_input)[0])
    probs_arr = art.best_clean_clf.predict_proba(X_input)[0]
    classes = art.best_clean_clf.classes_
    traj_probs = {
        str(cls): round(float(prob), 4)
        for cls, prob in zip(classes, probs_arr)
    }

    pred_val = max(0.0, float(art.best_reg_model.predict(X_input)[0]))
    margin = max(art.best_reg_mae * 0.65, pred_val * 0.15)
    low_val = max(0.0, pred_val - margin)
    high_val = pred_val + margin

    return {
        "predicted_trajectory": pred_traj,
        "trajectory_probabilities": traj_probs,
        "predicted_value_eur": round(pred_val, 2),
        "value_range_eur": [round(low_val, 2), round(high_val, 2)],
        "scouting_verdict": _scouting_verdict(
            pred_traj, pred_val, float(req.peak_value_eur), float(req.age)
        ),
    }
