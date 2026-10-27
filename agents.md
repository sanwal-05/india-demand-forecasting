# Project: Weather-driven daily electricity demand forecasting for Indian states
SDGs: 7 (Affordable & Clean Energy), 9 (Industry, Innovation & Infrastructure),
13 (Climate Action). Optional: 12.
Stakeholders: grid operators, state utilities (discoms), energy planners, policymakers.

Dataset: Zenodo DOI 10.5281/zenodo.14983362 ("Daily electricity demand data for
Indian states, 2014-2024"), by Hunt & Bloomfield. Contents: daily energy met (MU),
peak met (MW), peak unmet (MW) per state, with "corrected" versions that passed a
quality check (use the corrected ones). Per-state files hold daily min/mean/max
meteorology: 2 m temperature, 10 m u/v wind, 2 m dewpoint, surface solar
radiation, total cloud cover, UTCI. Reference paper: "Building and explaining
data-driven energy demand models for Indian states" (Hunt & Bloomfield, 2025).
The paper is a REFERENCE for ideas, not a template. Our project must be our own.

Rules:
- Keep it simple and readable. It will be presented live, step by step.
- One main notebook: notebooks/demand_forecasting.ipynb. Markdown cells explain
  every step: what, why, and the key concept in plain language.
- Explain why each model was chosen and why each hyperparameter range was chosen.
- Chronological split ONLY (no random shuffling). No leakage: every rolling or
  lag feature uses past data only; fit any scaler or tuning on training data only.
- Always include naive baselines and report honestly, even if results are weak.
- Report MAE, RMSE, R², MAPE, in the original unit (MU).
- Must run on macOS. Keep requirements.txt up to date.
- Never commit raw data. Provide src/download_data.py that rebuilds data/raw/.
- Phase 1 = notebook + README only. Phase 2 (React + FastAPI dashboard) is later.
