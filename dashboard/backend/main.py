from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# -----------------------------------------------------------------------------
# Paths & Startup Artifact Loading (Loaded Once at Startup, Read-Only)
# -----------------------------------------------------------------------------
BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent.parent
MODELS_DIR = PROJECT_ROOT / "models"
PROCESSED_DIR = PROJECT_ROOT / "data" / "processed"

MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
DOW_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
FOCUS_STATES = ["Delhi", "Maharashtra", "Kerala", "Uttar Pradesh"]


class ArtifactStore:
    """Holds all pre-computed models, CSV tables, and JSON metadata in memory."""

    def __init__(self) -> None:
        self.feature_config: dict[str, Any] = {}
        self.metrics: dict[str, Any] = {}
        self.insights: dict[str, Any] = {}
        self.models_set_a: dict[str, Any] = {}
        self.daily_df: pd.DataFrame = pd.DataFrame()
        self.predictions_df: pd.DataFrame = pd.DataFrame()
        self.climatology_df: pd.DataFrame = pd.DataFrame()
        self.all_states: list[str] = []
        self.state_r2_lookup: dict[str, dict[str, Any]] = {}
        self.state_summaries: list[dict[str, Any]] = []
        self.available_years: list[int] = []

    def load_all(self) -> None:
        # 1. Load JSON configs & metrics
        with open(MODELS_DIR / "feature_config.json", "r", encoding="utf-8") as f:
            self.feature_config = json.load(f)
        with open(MODELS_DIR / "metrics.json", "r", encoding="utf-8") as f:
            self.metrics = json.load(f)
        with open(MODELS_DIR / "insights.json", "r", encoding="utf-8") as f:
            self.insights = json.load(f)

        # 2. Load the 4 focus state Set A models (<state>_setA.joblib)
        for state in FOCUS_STATES:
            state_cfg = self.feature_config["states"][state]
            model_path = PROJECT_ROOT / state_cfg["model_file"]
            self.models_set_a[state] = joblib.load(model_path)

        # 3. Load processed CSVs
        self.daily_df = pd.read_csv(PROCESSED_DIR / "daily.csv")
        self.daily_df["date_dt"] = pd.to_datetime(self.daily_df["date"])
        self.daily_df = self.daily_df.sort_values(["state", "date_dt"]).reset_index(drop=True)
        self.daily_df["year"] = self.daily_df["date_dt"].dt.year
        self.daily_df["month"] = self.daily_df["date_dt"].dt.month
        self.daily_df["day_of_week"] = self.daily_df["date_dt"].dt.day_of_week
        self.daily_df["day_of_year"] = self.daily_df["date_dt"].dt.day_of_year
        self.daily_df["is_weekend"] = (self.daily_df["day_of_week"] >= 5).astype(int)

        # Compute past-only 365-day trailing mean and demand_index per state
        self.daily_df["trailing_365d_mean"] = (
            self.daily_df.groupby("state")["demand_MU"]
            .transform(lambda s: s.shift(1).rolling(window=365, min_periods=30).mean())
        )
        self.daily_df["demand_index"] = self.daily_df["demand_MU"] / self.daily_df["trailing_365d_mean"]

        self.predictions_df = pd.read_csv(PROCESSED_DIR / "predictions.csv")
        self.climatology_df = pd.read_csv(PROCESSED_DIR / "climatology.csv")

        # 4. Build lookup tables for fast endpoint responses
        self.all_states = sorted(self.daily_df["state"].unique().tolist())
        self.available_years = sorted(self.daily_df["year"].unique().tolist())

        self.state_r2_lookup = {
            row["State / UT"]: row
            for row in self.metrics.get("state_wise_r2_all_states", [])
        }

        summaries: list[dict[str, Any]] = []
        for state in self.all_states:
            sub = self.daily_df[self.daily_df["state"] == state]
            r2_info = self.state_r2_lookup.get(state, {})
            is_focus = state in FOCUS_STATES
            has_weather = bool(sub["temp_mean_c"].notna().any()) if "temp_mean_c" in sub.columns else False
            recent_365_mu = float(sub.tail(365)["demand_MU"].mean())

            summaries.append({
                "state": state,
                "is_focus": is_focus,
                "has_weather": has_weather,
                "avg_demand_MU": round(float(sub["demand_MU"].mean()), 2),
                "min_demand_MU": round(float(sub["demand_MU"].min()), 2),
                "max_demand_MU": round(float(sub["demand_MU"].max()), 2),
                "recent_365d_mean_MU": round(recent_365_mu, 2),
                "start_date": str(sub["date"].iloc[0]),
                "end_date": str(sub["date"].iloc[-1]),
                "n_days": int(len(sub)),
                "model_r2": r2_info.get("Set B (Best Pipeline) R²"),
                "set_a_r2": r2_info.get("Set A (Weather+Cal) R²"),
                "baseline_lag7_r2": r2_info.get("Baseline Lag-7 R²"),
                "mape_pct": r2_info.get("Set B MAPE (%)"),
                "mae_MU": r2_info.get("Set B MAE (MU)"),
                "rmse_MU": r2_info.get("Set B RMSE (MU)"),
            })

        # Sort with the 4 focus states first (in FOCUS_STATES order), then alphabetically
        summaries.sort(key=lambda x: (0 if x["is_focus"] else 1, FOCUS_STATES.index(x["state"]) if x["is_focus"] else x["state"]))
        self.state_summaries = summaries


STORE = ArtifactStore()
STORE.load_all()

# -----------------------------------------------------------------------------
# FastAPI App & CORS Configuration
# -----------------------------------------------------------------------------
app = FastAPI(
    title="India State Electricity Demand Forecasting API",
    description="Read-only FastAPI backend serving Phase 1 trained models, historical demand/weather series, test predictions, metrics, insights, and live Set A simulations.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _clean_float(val: Any, decimals: int = 4) -> Optional[float]:
    if val is None or (isinstance(val, (float, np.floating)) and np.isnan(val)):
        return None
    return round(float(val), decimals)


# -----------------------------------------------------------------------------
# 1. GET /api/states
# -----------------------------------------------------------------------------
@app.get("/api/states")
def get_states() -> dict[str, Any]:
    """Return all states with is_focus=true for the 4 focus states and a short summary."""
    return {
        "count": len(STORE.state_summaries),
        "focus_states": FOCUS_STATES,
        "available_years": STORE.available_years,
        "splits": STORE.metrics.get("splits", {}),
        "states": STORE.state_summaries,
    }


# -----------------------------------------------------------------------------
# 2. GET /api/map?metric=avg_demand|vs_typical|model_r2&year=&month=
# -----------------------------------------------------------------------------
@app.get("/api/map")
def get_map_data(
    metric: str = Query("avg_demand", pattern="^(avg_demand|vs_typical|model_r2)$"),
    year: Optional[int] = Query(None, ge=2014, le=2024),
    month: Optional[int] = Query(None, ge=1, le=12),
) -> dict[str, Any]:
    """Return per-state values for the India choropleth map."""
    df = STORE.daily_df
    slice_df = df
    if year is not None:
        slice_df = slice_df[slice_df["year"] == year]
    if month is not None:
        slice_df = slice_df[slice_df["month"] == month]

    # Typical baseline: if month is given, historical mean for that month across all years; else overall historical mean
    typ_df = df[df["month"] == month] if month is not None else df
    typical_by_state = typ_df.groupby("state")["demand_MU"].mean().to_dict()

    # If neither year nor month is specified and metric == vs_typical, compare most recent 365 days vs overall typical
    if year is None and month is None and metric == "vs_typical":
        recent_cutoff = df["date_dt"].max() - pd.Timedelta(days=364)
        slice_df = df[df["date_dt"] >= recent_cutoff]

    slice_mean_by_state = slice_df.groupby("state")["demand_MU"].mean().to_dict()

    unit_map = {
        "avg_demand": "MU",
        "vs_typical": "%",
        "model_r2": "R²",
    }

    records: list[dict[str, Any]] = []
    valid_vals: list[float] = []

    for state in STORE.all_states:
        avg_mu = slice_mean_by_state.get(state)
        typ_mu = typical_by_state.get(state)
        r2_entry = STORE.state_r2_lookup.get(state, {})
        model_r2 = r2_entry.get("Set B (Best Pipeline) R²")
        set_a_r2 = r2_entry.get("Set A (Weather+Cal) R²")
        mape_pct = r2_entry.get("Set B MAPE (%)")

        vs_typ_pct: Optional[float] = None
        if avg_mu is not None and typ_mu is not None and typ_mu > 0:
            vs_typ_pct = (avg_mu - typ_mu) / typ_mu * 100.0

        if metric == "avg_demand":
            val = _clean_float(avg_mu, 2)
        elif metric == "vs_typical":
            val = _clean_float(vs_typ_pct, 2)
        else:
            val = _clean_float(model_r2, 4)

        if val is not None:
            valid_vals.append(val)

        records.append({
            "state": state,
            "is_focus": state in FOCUS_STATES,
            "value": val,
            "avg_demand_MU": _clean_float(avg_mu, 2),
            "typical_MU": _clean_float(typ_mu, 2),
            "vs_typical_pct": _clean_float(vs_typ_pct, 2),
            "model_r2": _clean_float(model_r2, 4),
            "set_a_r2": _clean_float(set_a_r2, 4),
            "mape_pct": _clean_float(mape_pct, 2),
        })

    return {
        "metric": metric,
        "unit": unit_map[metric],
        "year": year,
        "month": month,
        "available_years": STORE.available_years,
        "available_months": list(range(1, 13)),
        "min_value": min(valid_vals) if valid_vals else None,
        "max_value": max(valid_vals) if valid_vals else None,
        "states": records,
    }


# -----------------------------------------------------------------------------
# 3. GET /api/trends?state=&granularity=day|week|month&start=&end=
# -----------------------------------------------------------------------------
@app.get("/api/trends")
def get_trends(
    state: str = Query("Delhi"),
    granularity: str = Query("day", pattern="^(day|week|month)$"),
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
) -> dict[str, Any]:
    """Return historical demand (and weather for focus states) aggregated by day, week, or month."""
    if state not in STORE.all_states:
        raise HTTPException(status_code=404, detail=f"Unknown state '{state}'.")

    sub = STORE.daily_df[STORE.daily_df["state"] == state].copy()
    if start:
        sub = sub[sub["date"] >= start]
    if end:
        sub = sub[sub["date"] <= end]

    has_weather = state in FOCUS_STATES
    weather_cols = [
        "temp_mean_c", "temp_min_c", "temp_max_c", "cooling_degree_days",
        "dewpoint_mean_c", "solar_mean_mj", "cloud_mean", "wind_speed_mean",
    ]

    if sub.empty:
        return {
            "state": state,
            "is_focus": state in FOCUS_STATES,
            "has_weather": has_weather,
            "granularity": granularity,
            "start": start,
            "end": end,
            "count": 0,
            "summary": None,
            "series": [],
        }

    if granularity == "day":
        grouped = sub.copy()
        grouped["period"] = grouped["date"]
    elif granularity == "week":
        sub["period"] = sub["date_dt"].dt.to_period("W").apply(lambda p: p.start_time.strftime("%Y-%m-%d"))
        agg_cols = ["demand_MU", "trailing_365d_mean", "demand_index"] + (weather_cols if has_weather else [])
        grouped = sub.groupby("period", as_index=False)[agg_cols].mean()
    else:  # month
        sub["period"] = sub["date_dt"].dt.strftime("%Y-%m-01")
        agg_cols = ["demand_MU", "trailing_365d_mean", "demand_index"] + (weather_cols if has_weather else [])
        grouped = sub.groupby("period", as_index=False)[agg_cols].mean()

    series: list[dict[str, Any]] = []
    for _, row in grouped.iterrows():
        item: dict[str, Any] = {
            "date": str(row["period"]),
            "demand_MU": _clean_float(row["demand_MU"], 2),
            "trailing_365d_mean_MU": _clean_float(row.get("trailing_365d_mean"), 2),
            "demand_index": _clean_float(row.get("demand_index"), 4),
        }
        if has_weather:
            for col in weather_cols:
                item[col] = _clean_float(row.get(col), 2)
        series.append(item)

    return {
        "state": state,
        "is_focus": state in FOCUS_STATES,
        "has_weather": has_weather,
        "granularity": granularity,
        "start": str(sub["date"].iloc[0]),
        "end": str(sub["date"].iloc[-1]),
        "count": len(series),
        "summary": {
            "mean_demand_MU": _clean_float(sub["demand_MU"].mean(), 2),
            "min_demand_MU": _clean_float(sub["demand_MU"].min(), 2),
            "max_demand_MU": _clean_float(sub["demand_MU"].max(), 2),
        },
        "series": series,
    }


# -----------------------------------------------------------------------------
# 4. GET /api/patterns?state=
# -----------------------------------------------------------------------------
@app.get("/api/patterns")
def get_patterns(state: str = Query("Delhi")) -> dict[str, Any]:
    """Return monthly seasonality, weekday profile, and temperature-vs-demand data for a state."""
    if state not in STORE.all_states:
        raise HTTPException(status_code=404, detail=f"Unknown state '{state}'.")

    sub = STORE.daily_df[STORE.daily_df["state"] == state].copy()
    has_weather = state in FOCUS_STATES

    # 1. Monthly seasonality
    monthly_list: list[dict[str, Any]] = []
    for m in range(1, 13):
        m_sub = sub[sub["month"] == m]
        if m_sub.empty:
            continue
        m_item: dict[str, Any] = {
            "month": m,
            "month_name": MONTH_NAMES[m - 1],
            "mean_demand_MU": _clean_float(m_sub["demand_MU"].mean(), 2),
            "median_demand_MU": _clean_float(m_sub["demand_MU"].median(), 2),
            "p10_demand_MU": _clean_float(np.percentile(m_sub["demand_MU"], 10), 2),
            "p90_demand_MU": _clean_float(np.percentile(m_sub["demand_MU"], 90), 2),
            "mean_demand_index": _clean_float(m_sub["demand_index"].mean(), 4),
        }
        if has_weather:
            m_item["mean_temp_c"] = _clean_float(m_sub["temp_mean_c"].mean(), 2)
        monthly_list.append(m_item)

    # 2. Weekday pattern (Mon=0 .. Sun=6) plus Official Holiday comparison from insights.json
    wkday_mean_mu = float(sub[sub["day_of_week"] < 5]["demand_MU"].mean())
    wkday_mean_idx = float(sub[sub["day_of_week"] < 5]["demand_index"].mean())
    weekday_list: list[dict[str, Any]] = []
    for dow in range(7):
        d_sub = sub[sub["day_of_week"] == dow]
        if d_sub.empty:
            continue
        mean_mu = float(d_sub["demand_MU"].mean())
        pct_vs_wkday = (mean_mu - wkday_mean_mu) / wkday_mean_mu * 100.0 if wkday_mean_mu > 0 else 0.0
        weekday_list.append({
            "day_of_week": dow,
            "day_name": DOW_NAMES[dow],
            "is_weekend": dow >= 5,
            "is_holiday": False,
            "mean_demand_MU": _clean_float(mean_mu, 2),
            "median_demand_MU": _clean_float(d_sub["demand_MU"].median(), 2),
            "mean_demand_index": _clean_float(d_sub["demand_index"].mean(), 4),
            "pct_vs_weekday_mean": _clean_float(pct_vs_wkday, 2),
        })

    # Attach state holiday drop from insights.json (if focus state) so Holiday bar renders alongside Mon-Sun
    pattern_lookup = {
        row["State"]: row for row in STORE.insights.get("state_consumption_patterns", [])
    }
    holiday_summary: Optional[dict[str, Any]] = None
    if state in pattern_lookup:
        hol_drop_pct = float(pattern_lookup[state].get("Holiday Drop (%)", 0.0))
        hol_mean_mu = wkday_mean_mu * (1.0 + hol_drop_pct / 100.0)
        hol_mean_idx = wkday_mean_idx * (1.0 + hol_drop_pct / 100.0)
        holiday_summary = {
            "day_of_week": 7,
            "day_name": "Holiday",
            "is_weekend": False,
            "is_holiday": True,
            "mean_demand_MU": _clean_float(hol_mean_mu, 2),
            "median_demand_MU": _clean_float(hol_mean_mu, 2),
            "mean_demand_index": _clean_float(hol_mean_idx, 4),
            "pct_vs_weekday_mean": _clean_float(hol_drop_pct, 2),
            "sunday_drop_MU": pattern_lookup[state].get("Sunday Drop (MU)"),
            "sunday_drop_pct": pattern_lookup[state].get("Sunday Drop (%)"),
            "holiday_drop_pct": hol_drop_pct,
        }

    # 3. Temperature vs Demand (available for the 4 focus states with weather telemetry)
    binned_curve: list[dict[str, Any]] = []
    scatter_sample: list[dict[str, Any]] = []

    if has_weather:
        w_sub = sub.dropna(subset=["temp_mean_c", "demand_MU", "demand_index"]).copy()
        w_sub["temp_bin"] = (w_sub["temp_mean_c"] / 1.5).round() * 1.5
        b_grp = (
            w_sub.groupby("temp_bin", as_index=False)
            .agg(
                temp_mid_c=("temp_mean_c", "mean"),
                mean_demand_MU=("demand_MU", "mean"),
                mean_demand_index=("demand_index", "mean"),
                days_count=("demand_MU", "size"),
            )
        )
        b_grp = b_grp[b_grp["days_count"] >= 10].sort_values("temp_mid_c")
        for _, r in b_grp.iterrows():
            binned_curve.append({
                "temp_c": _clean_float(r["temp_mid_c"], 2),
                "mean_demand_MU": _clean_float(r["mean_demand_MU"], 2),
                "mean_demand_index": _clean_float(r["mean_demand_index"], 4),
                "days_count": int(r["days_count"]),
            })

        # Evenly sample up to 500 historical days for clean scatter rendering
        step = max(1, len(w_sub) // 500)
        sampled = w_sub.iloc[::step]
        for _, r in sampled.iterrows():
            scatter_sample.append({
                "date": str(r["date"]),
                "month": int(r["month"]),
                "temp_mean_c": _clean_float(r["temp_mean_c"], 2),
                "demand_MU": _clean_float(r["demand_MU"], 2),
                "demand_index": _clean_float(r["demand_index"], 4),
            })

    return {
        "state": state,
        "is_focus": state in FOCUS_STATES,
        "has_weather": has_weather,
        "weekday_baseline_MU": _clean_float(wkday_mean_mu, 2),
        "monthly": monthly_list,
        "weekday": weekday_list,
        "holiday_summary": holiday_summary,
        "weekday_with_holiday": weekday_list + ([holiday_summary] if holiday_summary else []),
        "temperature_vs_demand": {
            "has_weather": has_weather,
            "thresholds": STORE.insights.get("temperature_thresholds", {}),
            "binned_curve": binned_curve,
            "scatter_sample": scatter_sample,
        },
    }


# -----------------------------------------------------------------------------
# 5. GET /api/predictions?state=&start=&end=
# -----------------------------------------------------------------------------
@app.get("/api/predictions")
def get_predictions(
    state: str = Query("Delhi"),
    feature_set: str = Query("Set B", pattern="^(Set A|Set B)$"),
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
) -> dict[str, Any]:
    """Return test-period actual vs predicted demand (in MU) for a focus state."""
    if state not in FOCUS_STATES:
        return {
            "state": state,
            "is_focus": False,
            "has_predictions": False,
            "message": f"Detailed test-period predictions are exported for the 4 focus states ({', '.join(FOCUS_STATES)}).",
            "series": [],
        }

    sub = STORE.predictions_df[STORE.predictions_df["state"] == state].copy()
    if start:
        sub = sub[sub["date"] >= start]
    if end:
        sub = sub[sub["date"] <= end]

    set_a_df = sub[sub["feature_set"] == "Set A"].set_index("date")
    set_b_df = sub[sub["feature_set"] == "Set B"].set_index("date")

    # 90th-percentile peak threshold on the full test period for this state
    full_state_b = STORE.predictions_df[
        (STORE.predictions_df["state"] == state) & (STORE.predictions_df["feature_set"] == "Set B")
    ]
    peak_thresh_mu = float(np.percentile(full_state_b["actual_MU"], 90))

    dates = sorted(set_b_df.index.unique().tolist())
    series: list[dict[str, Any]] = []
    y_true_list: list[float] = []
    y_pred_list: list[float] = []

    for dt in dates:
        row_b = set_b_df.loc[dt]
        row_a = set_a_df.loc[dt] if dt in set_a_df.index else None

        act_mu = float(row_b["actual_MU"])
        pred_b = float(row_b["predicted_MU"])
        pred_a = float(row_a["predicted_MU"]) if row_a is not None else None
        chosen_pred = pred_b if feature_set == "Set B" else (pred_a if pred_a is not None else pred_b)

        y_true_list.append(act_mu)
        y_pred_list.append(chosen_pred)

        series.append({
            "date": dt,
            "actual_MU": _clean_float(act_mu, 2),
            "predicted_MU": _clean_float(chosen_pred, 2),
            "predicted_MU_set_b": _clean_float(pred_b, 2),
            "predicted_MU_set_a": _clean_float(pred_a, 2),
            "residual_MU": _clean_float(act_mu - chosen_pred, 2),
            "model_name": str(row_b["model_name"]),
            "feature_set": feature_set,
            "is_peak_actual": bool(act_mu >= peak_thresh_mu),
            "is_peak_predicted": bool(chosen_pred >= peak_thresh_mu),
        })

    summary: Optional[dict[str, Any]] = None
    if y_true_list:
        yt = np.asarray(y_true_list)
        yp = np.asarray(y_pred_list)
        mae = float(np.mean(np.abs(yt - yp)))
        rmse = float(np.sqrt(np.mean((yt - yp) ** 2)))
        ss_res = float(np.sum((yt - yp) ** 2))
        ss_tot = float(np.sum((yt - np.mean(yt)) ** 2))
        r2 = 1.0 - (ss_res / ss_tot) if ss_tot > 0 else None
        mape = float(np.mean(np.abs((yt - yp) / yt)) * 100.0)
        summary = {
            "mae_MU": _clean_float(mae, 3),
            "rmse_MU": _clean_float(rmse, 3),
            "r2": _clean_float(r2, 4),
            "mape_pct": _clean_float(mape, 2),
            "peak_threshold_90p_MU": _clean_float(peak_thresh_mu, 2),
            "n_days": len(yt),
        }

    return {
        "state": state,
        "is_focus": True,
        "has_predictions": True,
        "model_name": "LightGBM",
        "feature_set": feature_set,
        "peak_threshold_90p_MU": _clean_float(peak_thresh_mu, 2),
        "summary": summary,
        "series": series,
    }


# -----------------------------------------------------------------------------
# 6. GET /api/models?state=
# -----------------------------------------------------------------------------
@app.get("/api/models")
def get_models(state: str = Query("Delhi")) -> dict[str, Any]:
    """Return the model comparison table, best model summary, and state-wise R² table."""
    per_state_tables = STORE.metrics.get("per_state_model_comparison", {})
    best_per_state = STORE.metrics.get("best_model_per_state", {})
    peak_alerts = STORE.metrics.get("peak_alert_classification_top10pct", {}).get("per_state", [])
    peak_by_state = {row["State"]: row for row in peak_alerts}

    is_focus = state in per_state_tables
    comparison_table = per_state_tables.get(state, [])
    best_model = best_per_state.get(state)
    state_r2_row = STORE.state_r2_lookup.get(state)

    # Compute monthly test errors dynamically for any of the 4 focus states from predictions_df
    monthly_errors: list[dict[str, Any]] = []
    if state in FOCUS_STATES:
        sub_b = STORE.predictions_df[
            (STORE.predictions_df["state"] == state) & (STORE.predictions_df["feature_set"] == "Set B")
        ].copy()
        sub_b["month"] = pd.to_datetime(sub_b["date"]).dt.month
        sub_b["err"] = sub_b["actual_MU"] - sub_b["predicted_MU"]
        sub_b["abs_err"] = sub_b["err"].abs()
        sub_b["ape_pct"] = (sub_b["abs_err"] / sub_b["actual_MU"]) * 100.0
        for m in range(1, 13):
            m_df = sub_b[sub_b["month"] == m]
            if m_df.empty:
                continue
            monthly_errors.append({
                "month": m,
                "month_name": MONTH_NAMES[m - 1],
                "days": int(len(m_df)),
                "mean_actual_MU": _clean_float(m_df["actual_MU"].mean(), 2),
                "mae_MU": _clean_float(m_df["abs_err"].mean(), 2),
                "rmse_MU": _clean_float(np.sqrt(np.mean(m_df["err"] ** 2)), 2),
                "mape_pct": _clean_float(m_df["ape_pct"].mean(), 2),
            })

    return {
        "state": state,
        "is_focus": is_focus,
        "splits": STORE.metrics.get("splits", {}),
        "best_model": best_model,
        "comparison_table": comparison_table,
        "peak_alert_metrics": peak_by_state.get(state),
        "peak_alert_overall": peak_by_state.get("OVERALL (All 4 Focus States)"),
        "confusion_matrix_overall": STORE.metrics.get("peak_alert_classification_top10pct", {}).get("confusion_matrix_overall"),
        "monthly_test_errors": monthly_errors,
        "state_national_metrics": state_r2_row,
        "state_wise_r2_all_states": STORE.metrics.get("state_wise_r2_all_states", []),
    }


# -----------------------------------------------------------------------------
# 7. GET /api/insights & GET /api/recommendations
# -----------------------------------------------------------------------------
@app.get("/api/insights")
def get_insights() -> dict[str, Any]:
    """Return quantitative consumption pattern findings from the notebook."""
    top_weather_dict = STORE.insights.get("top_weather_features_set_a", {})
    top_weather_list = [
        {"feature": k, "importance_drop_r2": v}
        for k, v in top_weather_dict.items()
    ]
    return {
        "temperature_thresholds": STORE.insights.get("temperature_thresholds", {}),
        "state_consumption_patterns": STORE.insights.get("state_consumption_patterns", []),
        "top_weather_features_set_a": top_weather_list,
        "most_weather_sensitive_states_top10": STORE.insights.get("most_weather_sensitive_states_top10", []),
    }


@app.get("/api/recommendations")
def get_recommendations() -> dict[str, Any]:
    """Return grid-level recommendations, each citing its evidence and a metric from the data."""
    patterns = {
        row["State"]: row
        for row in STORE.insights.get("state_consumption_patterns", [])
    }
    top_feats = STORE.insights.get("top_weather_features_set_a", {})
    best_per_state = STORE.metrics.get("best_model_per_state", {})
    raw_recs = STORE.insights.get("grid_recommendations", [])

    # Enrich each recommendation with explicit structured metric citations from our exported artifacts
    citation_meta = {
        1: {
            "stakeholder": "Northern SLDCs & DISCOMs (Delhi, Uttar Pradesh, Punjab, Haryana)",
            "metric_name": "Cooling Inflection Threshold & Top Weather Importance (temp_max_c + temp_mean_c)",
            "metric_value": f"> {STORE.insights['temperature_thresholds']['sharp_cooling_rise_threshold_c']}°C threshold | Set A importance = {round(top_feats.get('temp_max_c', 0) + top_feats.get('temp_mean_c', 0), 4)} R² drop",
        },
        2: {
            "stakeholder": "Grid-India (POSOCO) & Regional Load Despatch Centres (RLDCs)",
            "metric_name": "Asynchronous Peak Months & Monsoon Troughs",
            "metric_value": (
                f"Delhi peaks in {patterns['Delhi']['Peak Month']} ({patterns['Delhi']['Peak Month Mean (MU)']} MU, {patterns['Delhi']['Peak Month Index']}x) "
                f"while Maharashtra peaks in {patterns['Maharashtra']['Peak Month']} ({patterns['Maharashtra']['Peak Month Mean (MU)']} MU) and troughs in {patterns['Maharashtra']['Trough Month']}"
            ),
        },
        3: {
            "stakeholder": "State SLDCs & Renewable Energy Management Centres (REMCs)",
            "metric_name": "Sunday & Official Holiday Demand Drop",
            "metric_value": (
                f"Delhi: {patterns['Delhi']['Sunday Drop (%)']}% ({patterns['Delhi']['Sunday Drop (MU)']} MU) on Sundays, {patterns['Delhi']['Holiday Drop (%)']}% on holidays | "
                f"Kerala: {patterns['Kerala']['Sunday Drop (%)']}% ({patterns['Kerala']['Sunday Drop (MU)']} MU) on Sundays"
            ),
        },
        4: {
            "stakeholder": "DISCOM Power Procurement & CEA Resource Planners",
            "metric_name": "LightGBM Set A (Weather-Only) R² vs Set B (Day-Ahead) MAPE",
            "metric_value": (
                f"Delhi Set A R² = {best_per_state['Delhi']['set_a_metrics']['R²']:.3f}, Set B MAPE = {best_per_state['Delhi']['set_b_metrics']['MAPE (%)']:.2f}% | "
                f"Maharashtra Set B MAPE = {best_per_state['Maharashtra']['set_b_metrics']['MAPE (%)']:.2f}%"
            ),
        },
    }

    enriched = []
    for rec in raw_recs:
        rid = rec.get("id")
        meta = citation_meta.get(rid, {})
        enriched.append({
            "id": rid,
            "title": rec.get("title"),
            "stakeholder": meta.get("stakeholder", "State Grid Operators & DISCOMs"),
            "evidence": rec.get("finding"),
            "metric_name": meta.get("metric_name"),
            "metric_value": meta.get("metric_value"),
            "action": rec.get("action"),
        })

    return {
        "count": len(enriched),
        "recommendations": enriched,
    }


# -----------------------------------------------------------------------------
# 7b. GET /api/climatology?state=
# -----------------------------------------------------------------------------
@app.get("/api/climatology")
def get_climatology(state: str = Query("Delhi")) -> dict[str, Any]:
    """Return historical slider ranges and monthly climatology + data-driven presets for a focus state."""
    if state not in FOCUS_STATES:
        raise HTTPException(
            status_code=400,
            detail=f"Climatology is available for the 4 focus states ({', '.join(FOCUS_STATES)}).",
        )

    sub_daily = STORE.daily_df[STORE.daily_df["state"] == state].dropna(subset=["temp_mean_c"])
    sub_clim = STORE.climatology_df[STORE.climatology_df["state"] == state].sort_values("month")

    def _bounds(col: str, step: float = 0.5) -> dict[str, float]:
        s = sub_daily[col].dropna()
        return {
            "min": round(float(np.floor(s.min() * 2) / 2), 2),
            "max": round(float(np.ceil(s.max() * 2) / 2), 2),
            "median": round(float(s.median()), 2),
            "step": step,
        }

    ranges = {
        "temp_mean_c": _bounds("temp_mean_c", 0.5),
        "temp_min_c": _bounds("temp_min_c", 0.5),
        "dewpoint_mean_c": _bounds("dewpoint_mean_c", 0.5),
        "cloud_mean": {
            "min": 0.0,
            "max": 1.0,
            "median": round(float(sub_daily["cloud_mean"].median()), 2),
            "step": 0.02,
        },
        "temp_roll7_mean": _bounds("temp_roll7_mean", 0.5),
        "temp_roll30_mean": _bounds("temp_roll30_mean", 0.5),
    }

    months_dict: dict[int, dict[str, Any]] = {}
    for _, crow in sub_clim.iterrows():
        m = int(crow["month"])
        m_daily = sub_daily[sub_daily["month"] == m]

        # Data-driven percentiles from historical daily observations in that month
        cloud_p85 = round(float(np.percentile(m_daily["cloud_mean"].dropna(), 85)), 2)
        cloud_p20 = round(float(np.percentile(m_daily["cloud_mean"].dropna(), 20)), 2)
        dew_p75 = round(float(np.percentile(m_daily["dewpoint_mean_c"].dropna(), 75)), 1)
        dew_p25 = round(float(np.percentile(m_daily["dewpoint_mean_c"].dropna(), 25)), 1)
        roll7_p95 = round(float(np.percentile(m_daily["temp_roll7_mean"].dropna(), 95)), 1)
        roll30_p95 = round(float(np.percentile(m_daily["temp_roll30_mean"].dropna(), 95)), 1)
        roll7_p10 = round(float(np.percentile(m_daily["temp_roll7_mean"].dropna(), 10)), 1)
        roll30_p10 = round(float(np.percentile(m_daily["temp_roll30_mean"].dropna(), 10)), 1)

        typical_preset = {
            "temp_mean_c": round(float(crow["temp_mean_c"]), 1),
            "temp_min_c": round(float(crow["temp_min_c"]), 1),
            "temp_max_c": round(float(crow["temp_max_c"]), 1),
            "dewpoint_mean_c": round(float(crow["dewpoint_mean_c"]), 1),
            "cloud_mean": round(float(crow["cloud_mean"]), 2),
            "solar_mean_mj": round(float(crow["solar_mean_mj"]), 2),
            "temp_roll7_mean": round(float(crow["temp_roll7_mean"]), 1),
            "temp_roll30_mean": round(float(crow["temp_roll30_mean"]), 1),
        }

        heatwave_preset = {
            "temp_mean_c": round(float(crow["temp_p95_c"]), 1),
            "temp_min_c": round(float(crow["temp_min_p95_c"]), 1),
            "temp_max_c": round(float(crow["temp_max_p95_c"]), 1),
            "dewpoint_mean_c": dew_p75,
            "cloud_mean": cloud_p20,
            "solar_mean_mj": round(float(np.percentile(m_daily["solar_mean_mj"].dropna(), 85)), 2),
            "temp_roll7_mean": roll7_p95,
            "temp_roll30_mean": roll30_p95,
        }

        cool_cloudy_preset = {
            "temp_mean_c": round(float(crow["temp_p05_c"]), 1),
            "temp_min_c": round(float(crow["temp_min_p05_c"]), 1),
            "temp_max_c": round(float(crow["temp_max_p05_c"]), 1),
            "dewpoint_mean_c": dew_p25,
            "cloud_mean": cloud_p85,
            "solar_mean_mj": round(float(np.percentile(m_daily["solar_mean_mj"].dropna(), 15)), 2),
            "temp_roll7_mean": roll7_p10,
            "temp_roll30_mean": roll30_p10,
        }

        months_dict[m] = {
            "month": m,
            "month_name": MONTH_NAMES[m - 1],
            "climatology": {k: round(float(crow[k]), 4) for k in crow.index if k != "state"},
            "presets": {
                "typical": typical_preset,
                "heatwave": heatwave_preset,
                "cool_cloudy": cool_cloudy_preset,
            },
        }

    return {
        "state": state,
        "level_mu": STORE.feature_config["states"][state]["level_mu"],
        "ranges": ranges,
        "months": months_dict,
    }


# -----------------------------------------------------------------------------
# 8. POST /api/simulate
# -----------------------------------------------------------------------------
class SimulateRequest(BaseModel):
    state: str = Field("Delhi", description="Focus state name: Delhi, Maharashtra, Kerala, or Uttar Pradesh")
    month: int = Field(6, ge=1, le=12, description="Calendar month (1=Jan .. 12=Dec)")
    day_of_week: Optional[int] = Field(None, ge=0, le=6, description="Day of week (0=Mon .. 6=Sun)")
    is_holiday: Optional[int] = Field(None, ge=0, le=1, description="1 if official state holiday, else 0")

    # Weather inputs (both canonical feature names and friendly aliases supported)
    temp_mean_c: Optional[float] = None
    mean_temperature: Optional[float] = None
    temp_min_c: Optional[float] = None
    min_temperature: Optional[float] = None
    temp_max_c: Optional[float] = None
    max_temperature: Optional[float] = None
    dewpoint_mean_c: Optional[float] = None
    dewpoint: Optional[float] = None
    cloud_mean: Optional[float] = None
    cloud_cover: Optional[float] = None
    solar_mean_mj: Optional[float] = None
    solar_radiation: Optional[float] = None
    temp_roll7_mean: Optional[float] = None
    temp_7d_mean: Optional[float] = None
    temp_roll30_mean: Optional[float] = None
    temp_30d_mean: Optional[float] = None

    # Optional secondary Feature Set A inputs (filled from climatology.csv if omitted)
    day_of_year: Optional[int] = None
    is_weekend: Optional[int] = None
    covid_flag: Optional[int] = None
    cooling_degree_days: Optional[float] = None
    wind_speed_mean: Optional[float] = None
    dewpoint_roll7_mean: Optional[float] = None
    dewpoint_roll30_mean: Optional[float] = None
    solar_roll7_mean: Optional[float] = None
    solar_roll30_mean: Optional[float] = None
    cloud_roll7_mean: Optional[float] = None
    cloud_roll30_mean: Optional[float] = None

    # Optional level_mu override (if testing exact historical day trailing_365d_mean; defaults to stored level_mu)
    trailing_365d_mean: Optional[float] = None


def _first_not_none(*vals: Optional[float | int]) -> Optional[float | int]:
    for v in vals:
        if v is not None:
            return v
    return None


@app.post("/api/simulate")
def simulate_demand(req: SimulateRequest) -> dict[str, Any]:
    """Run the saved Set A model for a focus state using feature_config.json and climatology.csv."""
    if req.state not in FOCUS_STATES:
        raise HTTPException(
            status_code=400,
            detail=f"Simulation is supported for the 4 focus states ({', '.join(FOCUS_STATES)}). Got '{req.state}'.",
        )

    state_cfg = STORE.feature_config["states"][req.state]
    feature_order: list[str] = state_cfg["feature_order"]
    stored_level_mu: float = float(state_cfg["level_mu"])
    level_mu: float = float(req.trailing_365d_mean) if req.trailing_365d_mean is not None else stored_level_mu
    model = STORE.models_set_a[req.state]

    # 1. Fetch typical monthly baseline from climatology.csv for (state, month)
    clim_sub = STORE.climatology_df[
        (STORE.climatology_df["state"] == req.state) & (STORE.climatology_df["month"] == req.month)
    ]
    if clim_sub.empty:
        raise HTTPException(status_code=404, detail=f"Climatology not found for {req.state}, month={req.month}")
    clim_row = clim_sub.iloc[0]

    # Initialize all 22 features in exact order with the typical value from climatology.csv
    typical_features: dict[str, float] = {col: float(clim_row[col]) for col in feature_order}
    typical_features["month"] = float(req.month)

    # Set day_of_week for typical baseline if provided (else keep climatology median = 3 / Thursday)
    dow_val = int(req.day_of_week) if req.day_of_week is not None else int(round(typical_features["day_of_week"]))
    typical_features["day_of_week"] = float(dow_val)
    typical_features["is_weekend"] = 1.0 if dow_val >= 5 else 0.0
    typical_features["is_holiday"] = 0.0
    typical_features["covid_flag"] = 0.0
    typical_features["cooling_degree_days"] = max(0.0, typical_features["temp_mean_c"] - 18.0)

    # 2. Apply user overrides onto a copy of typical_features
    sim_features: dict[str, float] = dict(typical_features)

    if req.is_holiday is not None:
        sim_features["is_holiday"] = float(req.is_holiday)
    if req.is_weekend is not None:
        sim_features["is_weekend"] = float(req.is_weekend)
    if req.day_of_year is not None:
        sim_features["day_of_year"] = float(req.day_of_year)
    if req.covid_flag is not None:
        sim_features["covid_flag"] = float(req.covid_flag)

    # Weather inputs (canonical or alias)
    overrides_map = {
        "temp_mean_c": _first_not_none(req.temp_mean_c, req.mean_temperature),
        "temp_min_c": _first_not_none(req.temp_min_c, req.min_temperature),
        "temp_max_c": _first_not_none(req.temp_max_c, req.max_temperature),
        "dewpoint_mean_c": _first_not_none(req.dewpoint_mean_c, req.dewpoint),
        "cloud_mean": _first_not_none(req.cloud_mean, req.cloud_cover),
        "solar_mean_mj": _first_not_none(req.solar_mean_mj, req.solar_radiation),
        "temp_roll7_mean": _first_not_none(req.temp_roll7_mean, req.temp_7d_mean),
        "temp_roll30_mean": _first_not_none(req.temp_roll30_mean, req.temp_30d_mean),
        "wind_speed_mean": req.wind_speed_mean,
        "dewpoint_roll7_mean": req.dewpoint_roll7_mean,
        "dewpoint_roll30_mean": req.dewpoint_roll30_mean,
        "solar_roll7_mean": req.solar_roll7_mean,
        "solar_roll30_mean": req.solar_roll30_mean,
        "cloud_roll7_mean": req.cloud_roll7_mean,
        "cloud_roll30_mean": req.cloud_roll30_mean,
    }
    for k, v in overrides_map.items():
        if v is not None:
            sim_features[k] = float(v)

    # If temp_mean_c was overridden and temp_max_c was not explicitly passed, shift temp_max_c by the same ΔT
    if overrides_map["temp_mean_c"] is not None and overrides_map["temp_max_c"] is None:
        sim_features["temp_max_c"] = typical_features["temp_max_c"] + (
            sim_features["temp_mean_c"] - typical_features["temp_mean_c"]
        )

    # Recompute cooling_degree_days from temp_mean_c unless explicitly overridden
    if req.cooling_degree_days is not None:
        sim_features["cooling_degree_days"] = float(req.cooling_degree_days)
    else:
        sim_features["cooling_degree_days"] = max(0.0, sim_features["temp_mean_c"] - 18.0)

    # 3. Build DataFrames in the exact feature_order from feature_config.json and predict
    X_sim = pd.DataFrame([[sim_features[c] for c in feature_order]], columns=feature_order)
    X_typ = pd.DataFrame([[typical_features[c] for c in feature_order]], columns=feature_order)

    pred_index = float(model.predict(X_sim)[0])
    typ_index = float(model.predict(X_typ)[0])

    predicted_mu = pred_index * level_mu
    typical_mu = typ_index * level_mu
    pct_diff = ((predicted_mu - typical_mu) / typical_mu * 100.0) if typical_mu > 0 else 0.0

    # Historical observed average MU for (state, month, day_of_week) for reference
    hist_slice = STORE.daily_df[
        (STORE.daily_df["state"] == req.state)
        & (STORE.daily_df["month"] == req.month)
        & (STORE.daily_df["day_of_week"] == dow_val)
    ]
    hist_typical_mu = float(hist_slice["demand_MU"].mean()) if not hist_slice.empty else typical_mu

    # 4. Build Temperature Sweep across the state's historical temperature range (including exact current temp)
    state_daily = STORE.daily_df[STORE.daily_df["state"] == req.state]
    t_min_hist = float(np.floor(state_daily["temp_mean_c"].min()))
    t_max_hist = float(np.ceil(state_daily["temp_mean_c"].max()))
    base_t = round(float(sim_features["temp_mean_c"]), 2)
    grid_temps = np.round(np.linspace(t_min_hist, t_max_hist, 25), 2)
    sweep_temps = np.unique(np.sort(np.append(grid_temps, base_t)))

    sweep_rows: list[list[float]] = []
    for t_val in sweep_temps:
        delta_t = float(t_val) - base_t
        row_dict = dict(sim_features)
        row_dict["temp_mean_c"] = float(t_val)
        row_dict["temp_min_c"] = sim_features["temp_min_c"] + delta_t
        row_dict["temp_max_c"] = sim_features["temp_max_c"] + delta_t
        row_dict["temp_roll7_mean"] = sim_features["temp_roll7_mean"] + delta_t
        row_dict["temp_roll30_mean"] = sim_features["temp_roll30_mean"] + delta_t
        row_dict["cooling_degree_days"] = max(0.0, float(t_val) - 18.0)
        sweep_rows.append([row_dict[c] for c in feature_order])

    X_sweep = pd.DataFrame(sweep_rows, columns=feature_order)
    sweep_preds_idx = model.predict(X_sweep)

    temperature_sweep = [
        {
            "temp_mean_c": round(float(t_val), 2),
            "predicted_MU": round(float(p_idx * level_mu), 2),
            "predicted_demand_index": round(float(p_idx), 4),
            "typical_MU": round(float(typical_mu), 2),
            "is_current": bool(abs(float(t_val) - base_t) < 1e-4),
        }
        for t_val, p_idx in zip(sweep_temps, sweep_preds_idx)
    ]

    # 5. Compute counterfactual factor contributions to generate a real, data-driven plain-language explanation
    factor_defs = [
        ("daytime mean/max temperature", ["temp_mean_c", "temp_max_c", "cooling_degree_days"]),
        ("overnight minimum temperature", ["temp_min_c"]),
        ("7-day and 30-day heat build-up", ["temp_roll7_mean", "temp_roll30_mean"]),
        ("humidity / dewpoint", ["dewpoint_mean_c"]),
        ("cloud cover and solar radiation", ["cloud_mean", "solar_mean_mj"]),
        ("official holiday schedule", ["is_holiday"]),
    ]
    cf_rows = []
    for _, cols in factor_defs:
        r_cf = dict(typical_features)
        for c in cols:
            r_cf[c] = sim_features[c]
        cf_rows.append([r_cf[c] for c in feature_order])

    cf_preds_mu = model.predict(pd.DataFrame(cf_rows, columns=feature_order)) * level_mu
    driver_deltas = [
        {
            "driver": label,
            "delta_MU": round(float(cf_mu - typical_mu), 2),
            "delta_pct": round(float((cf_mu - typical_mu) / typical_mu * 100.0), 2) if typical_mu > 0 else 0.0,
        }
        for (label, _), cf_mu in zip(factor_defs, cf_preds_mu)
    ]

    # Sort drivers that move in the same direction as the overall difference by magnitude
    if abs(pct_diff) < 0.4:
        plain_summary = (
            f"Demand is right at typical levels ({predicted_mu:.1f} MU vs {typical_mu:.1f} MU typical for "
            f"{MONTH_NAMES[req.month - 1]} {DOW_NAMES[dow_val]}s in {req.state}), as weather inputs match historical medians."
        )
    else:
        direction_word = "above" if pct_diff > 0 else "below"
        sign_mult = 1.0 if pct_diff > 0 else -1.0
        aligned = sorted(
            driver_deltas,
            key=lambda d: d["delta_MU"] * sign_mult,
            reverse=True,
        )
        top1 = aligned[0]
        top2 = aligned[1] if len(aligned) > 1 and (aligned[1]["delta_MU"] * sign_mult) > 0.8 else None
        if top2 and abs(top1["delta_MU"]) > 0.1:
            driver_phrase = f"{top1['driver']} ({top1['delta_MU']:+.1f} MU) and {top2['driver']} ({top2['delta_MU']:+.1f} MU)"
        elif abs(top1["delta_MU"]) > 0.1:
            driver_phrase = f"{top1['driver']} ({top1['delta_MU']:+.1f} MU)"
        else:
            driver_phrase = f"combined non-linear weather interactions at {base_t:.1f}°C along the temperature response curve"

        plain_summary = (
            f"Demand is {abs(pct_diff):.1f}% {direction_word} typical ({predicted_mu - typical_mu:+.1f} MU), "
            f"driven mainly by {driver_phrase}."
        )

    return {
        "state": req.state,
        "month": req.month,
        "month_name": MONTH_NAMES[req.month - 1],
        "day_of_week": dow_val,
        "day_name": DOW_NAMES[dow_val],
        "is_holiday": int(sim_features["is_holiday"]),
        "predicted_MU": round(predicted_mu, 2),
        "typical_MU": round(typical_mu, 2),
        "historical_typical_MU": round(hist_typical_mu, 2),
        "percent_difference": round(pct_diff, 2),
        "predicted_demand_index": round(pred_index, 4),
        "typical_demand_index": round(typ_index, 4),
        "level_mu": round(level_mu, 4),
        "stored_level_mu": round(stored_level_mu, 4),
        "climatology_temperature_percentiles_c": {
            "p05": float(clim_row["temp_p05_c"]),
            "p50": float(clim_row["temp_p50_c"]),
            "p95": float(clim_row["temp_p95_c"]),
        },
        "feature_order": feature_order,
        "feature_values": {c: round(sim_features[c], 4) for c in feature_order},
        "plain_language_summary": plain_summary,
        "driver_contributions": driver_deltas,
        "temperature_sweep": temperature_sweep,
    }
