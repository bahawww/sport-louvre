"""FastAPI backend for Football Player Market Value & Trajectory Intelligence."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, model_validator

from features import CAT_FEATURES, DEFAULT_HORIZON_YR
from ml_pipeline import (
    HORIZON_WARN_YR,
    INTERVAL_LEVEL,
    MAX_HORIZON_YR,
    DashboardArtifacts,
    build_artifacts,
    explain_outlook,
    resolve_data_dir,
    player_feature_row,
    predict_feature_row,
    predict_profile,
    valuation_status,
)

artifacts: DashboardArtifacts | None = None


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global artifacts
    artifacts = build_artifacts()
    yield


app = FastAPI(
    title="Transfermarkt Player Trajectory & Valuation API",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


PROFILE_FIELDS = [
    "age",
    "age_at_peak",
    "peak_value_eur",
    "first_value_eur",
    "career_span_years",
    "years_to_peak",
    "value_volatility",
    "num_valuation_points",
    "league_name",
    "nationality",
]


class HypotheticalValuation(BaseModel):
    value_eur: float = Field(..., gt=0)
    years_after: float = Field(0.5, gt=0, le=2)


class Scenario(BaseModel):
    """What-if changes for a real player. Applied to raw inputs, then features are recomputed."""

    horizon_years: float | None = Field(None, gt=0, le=MAX_HORIZON_YR)
    league_name: str | None = None
    append_valuations: list[HypotheticalValuation] = Field(default_factory=list, max_length=6)
    backtest: bool = False


class SimulateRequest(BaseModel):
    """Two modes.

    player_id set  -> what-if on that player's real valuation history (profile fields ignored).
    player_id None -> synthetic profile; the ten profile fields below are required.
    """

    player_id: str | None = None
    scenario: Scenario | None = None
    explain: bool = False  # player mode: add a per-player explanation of the 12-month outlook

    age: float | None = Field(None, ge=14, le=45)
    age_at_peak: float | None = Field(None, ge=14, le=45)
    peak_value_eur: float | None = Field(None, ge=0)
    first_value_eur: float | None = Field(None, ge=0)
    career_span_years: float | None = Field(None, ge=0)
    years_to_peak: float | None = Field(None, ge=0)
    value_volatility: float | None = Field(None, ge=0)
    num_valuation_points: int | None = Field(None, ge=1)
    num_clubs_career: int | None = Field(None, ge=1)  # accepted for compatibility, not modelled
    league_name: str | None = None
    nationality: str | None = None
    position_group: str | None = None

    @model_validator(mode="after")
    def _profile_fields_required(self) -> "SimulateRequest":
        if self.player_id is None:
            missing = [f for f in PROFILE_FIELDS if getattr(self, f) is None]
            if missing:
                raise ValueError(f"profile mode requires: {', '.join(missing)}")
        return self


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
        "model_version": art.overview["model_card"]["version"],
        "trained_at": art.overview["model_card"]["trained_at"],
        "data_as_of": art.overview["data_card"]["data_as_of"],
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
    limit: int = Query(default=30, ge=1, le=3000),
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
                "position": str(row["position"]) if pd.notna(row["position"]) else "Unknown",
                "position_group": str(row["position_group"]) if pd.notna(row["position_group"]) else "Unknown",
                "history": art.history_by_player.get(pid, []),
            }
        )

    return {"players": players}


def _gap(fair: float, market: float, fair_range: list[float], row: dict[str, Any]) -> dict[str, Any]:
    status, basis = valuation_status(market, fair_range[0], fair_range[1], row)
    return {
        "valuation_basis": basis,
        "market_value_eur": round(market, 2),
        "valuation_gap_eur": round(fair - market, 2),
        "valuation_gap_pct": round((fair - market) / market * 100.0, 2) if market > 0 else 0.0,
        "valuation_status": status,
    }


def _simulate_player(art: DashboardArtifacts, req: SimulateRequest) -> dict[str, Any]:
    pid = req.player_id.strip()
    if pid not in art.series:
        raise HTTPException(status_code=404, detail=f"player_id {pid} not found")
    sc = req.scenario or Scenario()
    league = (sc.league_name or "").strip() or None
    warnings: list[str] = []
    if league and league not in art.overview["dataset"]["leagues"]:
        raise HTTPException(status_code=422, detail=f"unknown league_name {league}")
    if sc.backtest and (sc.append_valuations or sc.horizon_years or league):
        raise HTTPException(status_code=422, detail="backtest cannot be combined with scenario changes")
    if req.num_clubs_career is not None:
        warnings.append("num_clubs_career is ignored: club history in the dataset is not usable.")

    appended = [(v.value_eur, v.years_after) for v in sc.append_valuations]
    try:
        row, meta = player_feature_row(
            art, pid, sc.horizon_years, league, appended, backtest=sc.backtest
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    out = predict_feature_row(art, row)

    horizon = float(row["horizon_yr"])
    if horizon > HORIZON_WARN_YR:
        warnings.append(
            f"horizon {horizon:.2f}y is beyond the usual gap between updates (99% < {HORIZON_WARN_YR:.0f}y): extrapolation."
        )
    if not row["has_anchor"]:
        warnings.append("less than 12 months of history: fair value rests on age, position and league only.")

    info = art.players_df.loc[art.players_df["player_id"] == pid].iloc[0]
    out.update(
        {
            "mode": "player_backtest" if sc.backtest else "player_whatif",
            "player": {
                "player_id": pid,
                "name": str(info["name"]),
                "league_name": str(info["league_name"]),
                "position": str(info["position"]) if pd.notna(info["position"]) else "Unknown",
                "in_training_set": pid in art.train_player_ids,
                "hypothetical_points": len(appended),
                **meta,
            },
            "horizon_years": round(horizon, 3),
            "interval_level": INTERVAL_LEVEL,
            "models": {
                "trajectory": art.model_names["classifier"],
                "value": art.model_names["forecast"],
                "fair_value": art.model_names["fundamental"],
            },
            "features": {
                k: (None if isinstance(v, float) and np.isnan(v) else v) for k, v in row.items()
            },
            "warnings": warnings,
        }
    )
    out.update(_gap(out["fair_value_eur"], meta["last_value_eur"], out["fair_value_range_eur"], row))
    if not sc.backtest and not appended and not league:
        out["outlook_12m"] = art.extra["outlook_by_player"].get(pid)
        if req.explain:
            outlook_row, _ = player_feature_row(art, pid, horizon_yr=1.0)
            frame = pd.DataFrame([outlook_row])
            for cat in CAT_FEATURES:
                frame[cat] = frame[cat].astype(object).where(frame[cat].notna(), np.nan)
            out["explanation"] = {
                "method": (
                    "contribution = prediction minus the average prediction when this feature "
                    "group is swapped for the values of 150 typical players (one group at a time)."
                ),
                **explain_outlook(
                    art.extra["outlook_model"],
                    frame,
                    art.extra["explain_background"],
                    ("p_up", "p_down", "expected_log_return"),
                ),
            }
    if not sc.backtest and (appended or league or sc.horizon_years is not None):
        base_row, _ = player_feature_row(art, pid)
        base = predict_feature_row(art, base_row)
        out["baseline"] = {**base, "horizon_years": DEFAULT_HORIZON_YR}
        out["scenario_delta_eur"] = round(out["predicted_value_eur"] - base["predicted_value_eur"], 2)
    out["scouting_verdict"] = _scouting_verdict(
        out["predicted_trajectory"],
        out["predicted_value_eur"],
        float(np.expm1(row["log_peak"])),
        float(row["age"]),
    )
    return out


def _simulate_profile(art: DashboardArtifacts, req: SimulateRequest) -> dict[str, Any]:
    fields = {f: getattr(req, f) for f in PROFILE_FIELDS}
    fields["league_name"] = req.league_name.strip()
    fields["position_group"] = (req.position_group or "").strip() or None
    out = predict_profile(art, fields)
    warnings: list[str] = []
    if req.num_clubs_career is not None:
        warnings.append("num_clubs_career is ignored: club history in the dataset is not usable.")
    if fields["position_group"] is None:
        warnings.append("no position_group: prediction averaged over position groups.")
    out.update(
        {
            "mode": "synthetic_profile",
            "interval_level": INTERVAL_LEVEL,
            "models": {
                "trajectory": art.model_names["classifier_profile"],
                "value": art.model_names["profile"],
            },
            "warnings": warnings,
            "scouting_verdict": _scouting_verdict(
                out["predicted_trajectory"],
                out["predicted_value_eur"],
                float(req.peak_value_eur),
                float(req.age),
            ),
        }
    )
    return out


@app.post("/api/simulate")
def simulate(req: SimulateRequest) -> dict[str, Any]:
    art = _get_artifacts()
    if req.player_id is not None:
        return _simulate_player(art, req)
    return _simulate_profile(art, req)


DATASET_CATALOG: dict[str, dict[str, Any]] = {
    "transfermarkt_player_values.csv": {
        "label": "Player Market Values (CSV)",
        "description": "Dataset utama pemain dari 5 liga top Eropa beserta 36 kolom fitur karier & target trajectory.",
        "format": "CSV",
        "media_type": "text/csv; charset=utf-8",
    },
    "transfermarkt_value_history.csv": {
        "label": "Historical Valuations (CSV)",
        "description": "Titik riwayat valuasi pasar per pemain lengkap dengan tanggal, klub, dan usia.",
        "format": "CSV",
        "media_type": "text/csv; charset=utf-8",
    },
    "data_dictionary.csv": {
        "label": "Data Dictionary (CSV)",
        "description": "Definisi lengkap seluruh kolom dan tipe data pada dataset Transfermarkt.",
        "format": "CSV",
        "media_type": "text/csv; charset=utf-8",
    },
    "transfermarkt_player_values.parquet": {
        "label": "Player Market Values (Parquet)",
        "description": "Format biner Apache Parquet yang terkompresi untuk analitik cepat di Python/Spark.",
        "format": "Parquet",
        "media_type": "application/octet-stream",
    },
}


@app.get("/api/datasets")
def list_datasets() -> dict[str, Any]:
    art = _get_artifacts()
    data_dir = resolve_data_dir()
    files: list[dict[str, Any]] = []
    for fname, meta in DATASET_CATALOG.items():
        fpath = data_dir / fname
        if not fpath.exists():
            continue
        rows = art.total_players if "player_values" in fname else (art.history_rows if "history" in fname else 34)
        cols = 36 if "player_values" in fname else (8 if "history" in fname else 3)
        files.append(
            {
                "filename": fname,
                "label": meta["label"],
                "description": meta["description"],
                "format": meta["format"],
                "size_bytes": fpath.stat().st_size,
                "rows": rows,
                "columns": cols,
                "download_url": f"/api/datasets/download/{fname}",
            }
        )

    df = art.players_df.sort_values("current_value_eur", ascending=False)
    records = [
        {
            "player_id": str(r["player_id"]),
            "name": str(r["name"]),
            "age": None if pd.isna(r["age"]) else int(r["age"]),
            "nationality": str(r["nationality_clean"]),
            "league_name": str(r["league_name"]),
            "peak_club": str(r["peak_club"]) if pd.notna(r["peak_club"]) else "Unknown",
            "current_value_eur": float(r["current_value_eur"]),
            "peak_value_eur": float(r["peak_value_eur"]),
            "first_value_eur": float(r["first_value_eur"]) if pd.notna(r["first_value_eur"]) else 0.0,
            "career_span_years": float(r["career_span_years"]) if pd.notna(r["career_span_years"]) else 0.0,
            "num_valuation_points": int(r["num_valuation_points"]) if pd.notna(r["num_valuation_points"]) else 0,
            "trajectory": str(r["trajectory"]),
            "position": str(r["position"]) if pd.notna(r["position"]) else "Unknown",
            "position_group": str(r["position_group"]) if pd.notna(r["position_group"]) else "Unknown",
            "age_at_peak": float(r["age_at_peak"]),
            "years_to_peak": float(r["years_to_peak"]),
            "value_volatility": float(r["value_volatility"]),
        }
        for _, r in df.iterrows()
    ]
    return {"files": files, "total_players": len(records), "players": records}


@app.get("/api/datasets/download/{filename}")
def download_dataset(filename: str) -> FileResponse:
    if filename not in DATASET_CATALOG:
        raise HTTPException(status_code=404, detail="Dataset file not found")
    fpath = resolve_data_dir() / filename
    if not fpath.exists():
        raise HTTPException(status_code=404, detail="Dataset file missing on disk")
    return FileResponse(
        path=fpath,
        filename=filename,
        media_type=DATASET_CATALOG[filename]["media_type"],
    )
