from __future__ import annotations

import holidays
import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from dashboard.backend.main import FOCUS_STATES, STORE, app

client = TestClient(app)

SUBDIV_MAP = {
    "Delhi": "DL",
    "Maharashtra": "MH",
    "Kerala": "KL",
    "Uttar Pradesh": "UP",
}


def test_get_states():
    resp = client.get("/api/states")
    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] == 34
    focus = [s for s in data["states"] if s["is_focus"]]
    assert len(focus) == 4
    assert {s["state"] for s in focus} == set(FOCUS_STATES)
    for s in focus:
        assert s["avg_demand_MU"] > 0
        assert s["model_r2"] is not None and s["model_r2"] > 0.90


@pytest.mark.parametrize("metric", ["avg_demand", "vs_typical", "model_r2"])
def test_get_map(metric: str):
    resp = client.get(f"/api/map?metric={metric}&year=2023&month=6")
    assert resp.status_code == 200
    data = resp.json()
    assert data["metric"] == metric
    assert len(data["states"]) == 34
    assert data["min_value"] is not None
    assert data["max_value"] is not None


@pytest.mark.parametrize("granularity", ["day", "week", "month"])
def test_get_trends(granularity: str):
    resp = client.get(f"/api/trends?state=Delhi&granularity={granularity}&start=2023-01-01&end=2023-06-30")
    assert resp.status_code == 200
    data = resp.json()
    assert data["state"] == "Delhi"
    assert data["granularity"] == granularity
    assert data["count"] > 0
    assert "temp_mean_c" in data["series"][0]


def test_get_patterns():
    resp = client.get("/api/patterns?state=Delhi")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["monthly"]) == 12
    assert len(data["weekday"]) == 7
    assert data["temperature_vs_demand"]["has_weather"] is True
    assert len(data["temperature_vs_demand"]["binned_curve"]) > 5


def test_get_predictions_and_models():
    pred_resp = client.get("/api/predictions?state=Delhi&start=2023-05-01&end=2023-08-31")
    assert pred_resp.status_code == 200
    pred_data = pred_resp.json()
    assert pred_data["has_predictions"] is True
    assert len(pred_data["series"]) == 123
    assert pred_data["summary"]["r2"] > 0.90

    mod_resp = client.get("/api/models?state=Delhi")
    assert mod_resp.status_code == 200
    mod_data = mod_resp.json()
    assert len(mod_data["comparison_table"]) == 12
    assert mod_data["best_model"]["best_model"] == "LightGBM"
    assert len(mod_data["state_wise_r2_all_states"]) == 32


def test_get_insights_and_recommendations():
    ins_resp = client.get("/api/insights")
    assert ins_resp.status_code == 200
    ins = ins_resp.json()
    assert len(ins["state_consumption_patterns"]) == 4
    assert len(ins["top_weather_features_set_a"]) > 0

    rec_resp = client.get("/api/recommendations")
    assert rec_resp.status_code == 200
    recs = rec_resp.json()["recommendations"]
    assert len(recs) == 4
    for r in recs:
        assert r["evidence"]
        assert r["metric_name"]
        assert r["metric_value"]
        assert r["action"]


def test_simulate_with_missing_inputs_uses_climatology():
    """Verify that missing weather inputs are filled from climatology.csv and returns sweep."""
    resp = client.post(
        "/api/simulate",
        json={"state": "Delhi", "month": 6, "day_of_week": 2, "is_holiday": 0},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["predicted_MU"] > 0
    assert data["typical_MU"] > 0
    # With no weather overrides and is_holiday=0, predicted_MU equals typical_MU (0.0% diff)
    assert abs(data["percent_difference"]) < 1e-6
    assert len(data["temperature_sweep"]) >= 25
    assert "plain_language_summary" in data and len(data["plain_language_summary"]) > 10

    clim_resp = client.get("/api/climatology?state=Delhi")
    assert clim_resp.status_code == 200
    clim_data = clim_resp.json()
    assert "ranges" in clim_data
    assert "6" in clim_data["months"] or 6 in clim_data["months"]


@pytest.mark.parametrize("state", FOCUS_STATES)
def test_simulate_matches_notebook_predictions_on_historical_rows(state: str):
    """
    Send known historical test rows per state to POST /api/simulate and verify that:
      1. Using only the core simulator inputs (with secondary features filled from climatology.csv
         and MU converted via the stored level_mu in feature_config.json), /api/simulate matches
         the notebook Set A predictions within a small relative tolerance (< 5.5%).
      2. Passing the exact historical row features + trailing_365d_mean reproduces the notebook
         Set A predictions in data/processed/predictions.csv to within 0.01 MU.
    """
    sub_daily = STORE.daily_df[STORE.daily_df["state"] == state].sort_values("date").reset_index(drop=True)
    sub_preds = STORE.predictions_df[
        (STORE.predictions_df["state"] == state) & (STORE.predictions_df["feature_set"] == "Set A")
    ].set_index("date")

    st_holidays = holidays.country_holidays("IN", subdiv=SUBDIV_MAP[state], years=[2023, 2024])
    holiday_dates = {str(d) for d in st_holidays.keys()}

    # Take 5 known historical test rows from April 2024 (where stored level_mu aligns with trailing 365d level)
    recent_test_rows = sub_daily[sub_daily["date"].isin(sub_preds.index)].tail(5)
    assert len(recent_test_rows) == 5

    for _, row in recent_test_rows.iterrows():
        dt_str = str(row["date"])
        nb_pred_mu = float(sub_preds.loc[dt_str, "predicted_MU"])
        is_hol = 1 if dt_str in holiday_dates else 0

        # 1. Core simulator payload (relies on climatology.csv fallback + stored level_mu)
        core_payload = {
            "state": state,
            "month": int(row["month"]),
            "day_of_week": int(row["day_of_week"]),
            "is_holiday": is_hol,
            "temp_mean_c": float(row["temp_mean_c"]),
            "temp_min_c": float(row["temp_min_c"]),
            "temp_max_c": float(row["temp_max_c"]),
            "dewpoint_mean_c": float(row["dewpoint_mean_c"]),
            "cloud_mean": float(row["cloud_mean"]),
            "solar_mean_mj": float(row["solar_mean_mj"]),
            "temp_roll7_mean": float(row["temp_roll7_mean"]),
            "temp_roll30_mean": float(row["temp_roll30_mean"]),
        }
        r_core = client.post("/api/simulate", json=core_payload)
        assert r_core.status_code == 200
        sim_core_mu = r_core.json()["predicted_MU"]
        rel_err = abs(sim_core_mu - nb_pred_mu) / nb_pred_mu
        assert rel_err < 0.055, (
            f"{state} ({dt_str}): core simulator MU={sim_core_mu:.2f} vs notebook MU={nb_pred_mu:.2f} "
            f"(rel_err={rel_err:.2%})"
        )

        # 2. Full historical row payload (verifies exact pipeline equivalence with notebook Set A)
        full_payload = {
            **core_payload,
            "day_of_year": int(row["day_of_year"]),
            "is_weekend": int(row["is_weekend"]),
            "covid_flag": 0,
            "cooling_degree_days": float(row["cooling_degree_days"]),
            "wind_speed_mean": float(row["wind_speed_mean"]),
            "dewpoint_roll7_mean": float(row["dewpoint_roll7_mean"]),
            "dewpoint_roll30_mean": float(row["dewpoint_roll30_mean"]),
            "solar_roll7_mean": float(row["solar_roll7_mean"]),
            "solar_roll30_mean": float(row["solar_roll30_mean"]),
            "cloud_roll7_mean": float(row["cloud_roll7_mean"]),
            "cloud_roll30_mean": float(row["cloud_roll30_mean"]),
            "trailing_365d_mean": float(row["trailing_365d_mean"]),
        }
        r_full = client.post("/api/simulate", json=full_payload)
        assert r_full.status_code == 200
        sim_full_mu = r_full.json()["predicted_MU"]
        assert abs(sim_full_mu - nb_pred_mu) <= 0.01, (
            f"{state} ({dt_str}): full row simulator MU={sim_full_mu:.2f} vs notebook MU={nb_pred_mu:.2f}"
        )
