# Weather-Driven Daily Electricity Demand Forecasting for Indian States

An end-to-end, leak-free data science and machine learning pipeline that models and forecasts daily state-level electricity demand (in **Million Units, MU / GWh**) across Indian states (`2014–2024`) using meteorology, calendar signals, and autoregressive demand history.

---

## 1. Problem Statement, Objective & Scope

### Problem Statement
India's electricity consumption is growing at `5–8%` per year while becoming increasingly sensitive to extreme weather—particularly pre-monsoon heatwaves, humid monsoon spells, and winter cold waves. State Load Despatch Centres (**SLDCs**) and distribution companies (**DISCOMs**) must schedule generation and power procurement daily. Under-forecasting during heatwaves leads to expensive spot-market purchases or load shedding, whereas over-forecasting results in curtailment and financial penalties.

### Objective
1. **Explain Weather Sensitivity (`Feature Set A — Weather + Calendar Only`)**: Quantify how meteorology (temperature, humidity/dewpoint, solar radiation, cloud cover, cooling degree days) and calendar effects (weekdays, Sundays, regional holidays, COVID-19 disruptions) drive daily demand independent of long-term economic growth.
2. **Forecast Short-Term Demand (`Feature Set B — Weather + Calendar + 1-Day & 7-Day Lags`)**: Build an operational next-day and week-ahead forecasting pipeline in **Million Units (`MU`)**, evaluated strictly on out-of-sample chronological data (`2023–2024`).
3. **Deliver Actionable Grid Insights**: Identify seasonal peaks, Sunday/holiday load drops, non-linear temperature tipping points, state-wise weather sensitivity across 32 Indian states/UTs, and high-demand peak alert classification (Top 10% load days).

### Scope
- **Deep-Dive Focus States (4 Climatically & Economically Distinct Regimes)**:
  1. **Delhi (`NCT of Delhi`)** — Urban commercial/residential load with extreme continental summers (`>42°C`) and cool winters (`<8°C`), exhibiting a U-shaped temperature response.
  2. **Maharashtra** — India's largest state load (`~450–650 MU/day`), balancing heavy industrial corridors, Mumbai/Pune commercial load, and agricultural pumping.
  3. **Kerala** — Tropical coastal climate (`24–31°C` year-round) dominated by residential and service-sector demand with strong humidity coupling.
  4. **Uttar Pradesh** — India's most populous state (`~250–550 MU/day`), sitting in the Indo-Gangetic plain with rapid rural electrification and extreme pre-monsoon heatwaves.
- **National Generalization**: Full rollout of the winning pipeline across **32 Indian states and Union Territories** with complete historical records (`2014–2024`).

### Target Users & Stakeholders
| Stakeholder | Operational Use Case |
| :--- | :--- |
| **Grid Operators (POSOCO / Grid-India & SLDCs)** | Day-ahead and week-ahead unit commitment, reserve margin sizing, and transmission congestion management. |
| **State Utilities (DISCOMs)** | Short-term bilateral power procurement on power exchanges (`IEX` / `PXIL`) to avoid deviation settlement (`DSM`) penalties. |
| **Energy Planners (CEA & State Energy Depts.)** | Climate-resilient resource adequacy planning and seasonal maintenance scheduling during monsoon load troughs. |
| **Policymakers** | Heatwave contingency planning, demand-response tariff design, and clean energy integration targets. |

### Alignment with UN Sustainable Development Goals (SDGs)
- **SDG 7 (Affordable & Clean Energy)**: Accurate load forecasting lowers spinning-reserve waste and helps integrate variable solar/wind generation smoothly.
- **SDG 9 (Industry, Innovation & Infrastructure)**: Modernizes grid dispatch infrastructure with interpretable, data-driven predictive analytics.
- **SDG 13 (Climate Action)**: Quantifies the grid impact of rising temperatures and heatwaves to build climate-resilient power systems.
- **SDG 12 (Responsible Consumption & Production)**: Reduces thermal generation curtailment and emergency diesel/spot-power reliance.

---

## 2. Dataset Description & Citations

### Data Source
This project uses the open-access Zenodo dataset and accompanies the reference study by Hunt & Bloomfield (2025):

1. **Dataset Citation**:
   > Hunt, K. M. R., & Bloomfield, H. C. (2025). *Daily electricity demand data for Indian states, 2014–2024* [Data set]. Zenodo. https://doi.org/10.5281/zenodo.14983362
2. **Reference Paper Citation**:
   > Hunt, K. M. R., & Bloomfield, H. C. (2025). *Building and explaining data-driven energy demand models for Indian states*. (Used as a domain reference; all pipeline design, feature engineering, model tuning, and evaluations in this repository are independently implemented).

### Files Used (`data/raw/`)
Downloaded programmatically via [`src/download_data.py`](src/download_data.py) from the Zenodo REST API (`https://zenodo.org/api/records/14983362`) with MD5 checksum verification:
- `corrected_daily_energy_met_MU.csv`: Quality-controlled daily electrical energy met (**Million Units, MU**, where $\text{1 MU} = \text{1 GWh}$) across 36 Indian states/UTs (`2014-01-01` to `2024-04-27`, `3,770` days).
- `corrected_peak_met_MW.csv`: Quality-controlled daily peak power demand met (**MW**) per state.
- `weather_<State_Name>.csv` (36 files): Population-weighted ERA5 daily meteorology (`min`, `mean`, `max`) per state (`2014-01-01` to `2024-12-10`, `3,997` days).
- *(Excluded raw uncorrected files `daily_energy_met_MU.csv`, `peak_met_MW.csv`, `peak_unmet_MW.csv`, and national aggregate `weighted_daily_mean_utci_india.csv` to prevent mixing uncleaned data).*

### Core Variables & Units
| Variable | Column Name (Cleaned) | Unit | Description |
| :--- | :--- | :--- | :--- |
| **Target (Raw)** | `demand_mu` | `MU` (`GWh`) | Daily electrical energy met (`corrected_daily_energy_met_MU.csv`). |
| **Target (Detrended)** | `demand_index` | Dimensionless ratio | `demand_mu / trailing_365d_mean` (uses strictly past 365 days shifted by 1 day). |
| **2m Temperature** | `temp_mean_c`, `temp_min_c`, `temp_max_c` | `°C` | Daily mean, min, and max air temperature at 2 meters (converted from Kelvin). |
| **2m Dewpoint** | `dewpoint_mean_c` | `°C` | Daily mean dewpoint temperature at 2 meters (proxy for absolute humidity). |
| **Solar Radiation** | `solar_mean_jm2` | `J/m²` | Daily mean surface downward solar radiation. |
| **Cloud Cover** | `cloud_mean_frac` | Fraction `[0–1]` | Daily mean total cloud cover fraction. |
| **Wind Speed** | `wind_speed_mean` | `m/s` | Daily mean 10m resultant wind speed $\sqrt{u_{10}^2 + v_{10}^2}$. |
| **Thermal Comfort** | `utci_mean_c` | `°C` | Universal Thermal Climate Index (`UTCI`) in Celsius. |

---

## 3. End-to-End Methodology & Pipeline

The complete workflow is implemented step-by-step in [`notebooks/demand_forecasting.ipynb`](notebooks/demand_forecasting.ipynb) with plain-language explanations before every code cell.

```
[Zenodo API (src/download_data.py)]
       │
       ▼
[1. Preprocessing & Alignment]
  • Inner join state demand + ERA5 weather (2014-01-01 to 2024-04-27)
  • Convert Kelvin -> °C; causal forward-fill (ffill) for isolated 1-2 day gaps
  • Retain real heatwave/lockdown extremes; add covid_flag (2020-03-24 to 2021-06-30)
       │
       ▼
[2. Leak-Free Trend Normalization]
  • trailing_365d_mean = demand_mu.shift(1).rolling(365, min_periods=30).mean()
  • demand_index = demand_mu / trailing_365d_mean
  • Predicted index converts back to MU via: pred_mu = pred_index * trailing_365d_mean
       │
       ▼
[3. Feature Engineering]
  • Calendar: day_of_week, is_weekend, month, day_of_year, is_holiday (state-specific)
  • Rolling Weather (past only): 7-day & 30-day rolling means of temp, dewpoint, solar, cloud
  • Non-linear Heat Stress: cooling_degree_days = max(0, temp_mean_c - 22.0)
  • Feature Set A (20 features): Weather + Calendar only (Explanatory)
  • Feature Set B (22 features): Set A + demand_index_lag1 + demand_index_lag7 (Forecasting)
       │
       ▼
[4. Strict Chronological Split (Zero Leakage)]
  • Train:      2014-01-08 to 2021-12-31 (2,915 days/state) -> Fit scalers, models & CV
  • Validation: 2022-01-01 to 2022-12-31 (365 days/state)   -> Compare & select models
  • Test:       2023-01-01 to 2024-04-27 (483 days/state)   -> Final out-of-sample evaluation
       │
       ▼
[5. Model Benchmarking, Tuning & Phase 2 Export]
  • 2 Naive Baselines + 5 ML Models (Linear, Ridge, Random Forest, LightGBM, MLP)
  • RandomizedSearchCV with 5-fold TimeSeriesSplit on Train only
  • Export models/best_model.joblib, data/processed/predictions.csv, metrics.json, insights.json
```

### Key Methodological Choices (Leak-Free by Construction)
1. **Missing Value Imputation**: Only `0.40%` of values are missing in the 4 focus states (isolated 1–2 day telemetry dropouts; weather is `100%` complete). We use **forward-fill (`ffill`)** within each state rather than linear interpolation so that day $t$ never peeks at day $t+1$.
2. **Trend Removal (`demand_index`)**: Electricity demand grows every year due to new connections and GDP growth. Dividing today's demand by the **1-day-shifted trailing 365-day mean** creates a stationary relative index (`1.0` = typical annual load, `1.35` = `35%` above the past year's average). All predictions are multiplied back by `trailing_365d_mean` so every metric (`MAE`, `RMSE`, $R^2$, `MAPE`) is reported honestly in **Million Units (`MU`)**.
3. **Chronological Split Only**: Random train/test splitting leaks same-week weather and multi-year trends across adjacent days, artificially inflating $R^2$. We strictly train on `2014–2021`, validate on `2022`, and test once on `2023–Apr 2024`.

---

## 4. Machine Learning Models & Hyperparameter Tuning

Every model is evaluated on both **Feature Set A** (Weather + Calendar) and **Feature Set B** (Weather + Calendar + Lags $t-1, t-7$). Hyperparameters are tuned exclusively on the `2014–2021` training set using `RandomizedSearchCV` paired with a 5-fold expanding `TimeSeriesSplit`.

| Model | Why It Was Chosen | Tuned Hyperparameters & Search Ranges |
| :--- | :--- | :--- |
| **Baseline 1: Training Mean** | Establishes the zero-skill floor ($\hat{y}_t = \bar{y}_{\text{train}} \times \text{trailing\_365d\_mean}$). | None (deterministic). |
| **Baseline 2: Same Weekday Last Week ($y_{t-7}$)** | Strong operational persistence benchmark that captures both the current season and day-of-week cycle. Any ML model must beat this to be useful. | None (deterministic). |
| **Linear Regression (OLS)** | Fast, transparent additive benchmark (`StandardScaler` + `LinearRegression`) to measure how much variance linear slopes alone explain. | None (closed-form OLS). |
| **Ridge Regression ($\ell_2$)** | Stabilizes correlated weather features (`temp_mean_c`, `temp_max_c`, `utci_mean_c`, 7d/30d rolling means) by shrinking collinear weights. | `alpha`: `[0.01, 0.1, 1.0, 10.0, 50.0, 100.0, 500.0]` |
| **Random Forest** | Captures non-linear temperature thresholds (`>24°C` AC surge, `<15°C` heating) and feature interactions (`temperature × humidity`, `weekend × month`) via bootstrap bagging. | `n_estimators`: `[100, 200, 300]`<br>`max_depth`: `[6, 10, 15, None]`<br>`min_samples_leaf`: `[2, 5, 10]`<br>`max_features`: `['sqrt', 0.5, 0.8]` |
| **LightGBM (Gradient Boosted Trees)** | **Best Model.** Sequentially corrects residual errors on sharp seasonal transitions and heatwave spikes while preventing overfitting via shallow trees and L2 regularization. | `n_estimators`: `[100, 200, 300]`<br>`learning_rate`: `[0.03, 0.05, 0.1]`<br>`num_leaves`: `[15, 31, 63]`<br>`max_depth`: `[4, 6, 8, -1]`<br>`subsample`: `[0.7, 0.8, 1.0]`<br>`colsample_bytree`: `[0.7, 0.8, 1.0]`<br>`reg_lambda`: `[0.0, 1.0, 5.0]` |
| **MLP (Neural Network)** | Benchmarks smooth continuous non-linear representations (`StandardScaler` + `MLPRegressor` with ReLU activations and early stopping), mirroring Hunt & Bloomfield (2025). | `hidden_layer_sizes`: `[(32,), (64,), (64, 32), (128, 64)]`<br>`alpha`: `[0.0001, 0.001, 0.01, 0.1]`<br>`learning_rate_init`: `[0.001, 0.005, 0.01]` |

---

## 5. Results & Evaluation (in Original Units: `MU`)

### 5.1 Deep-Dive Benchmark on Delhi (`Test Set: Jan 2023 – Apr 2024`, `483` Days)

| Model | Feature Set | Val RMSE (`MU`) | Val $R^2$ | Test MAE (`MU`) | Test RMSE (`MU`) | Test $R^2$ | Test MAPE (`%`) |
| :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| **Baseline: Training Mean** | Baseline | 28.08 | -0.149 | 22.53 | 25.51 | -0.141 | 25.72% |
| **Baseline: Same Weekday Last Week** | Baseline | 11.46 | 0.808 | 8.41 | 11.69 | 0.760 | 8.78% |
| **Linear Regression** | Set A (Weather + Cal) | 9.33 | 0.873 | 7.21 | 9.03 | 0.857 | 8.35% |
| **Ridge Regression** | Set A (Weather + Cal) | 9.31 | 0.874 | 7.20 | 9.02 | 0.857 | 8.34% |
| **Random Forest** | Set A (Weather + Cal) | 5.78 | 0.951 | 4.53 | 6.19 | 0.933 | 4.80% |
| **LightGBM** | Set A (Weather + Cal) | 5.66 | 0.953 | 4.48 | 5.78 | 0.941 | 4.82% |
| **MLP (Neural Net)** | Set A (Weather + Cal) | 5.56 | 0.955 | 4.38 | 5.77 | **0.942** | 4.74% |
| **Linear Regression** | Set B (+ Lags 1d, 7d) | 3.74 | 0.980 | 2.47 | 3.39 | 0.980 | 2.79% |
| **Ridge Regression** | Set B (+ Lags 1d, 7d) | 3.74 | 0.980 | 2.47 | 3.39 | 0.980 | 2.78% |
| **MLP (Neural Net)** | Set B (+ Lags 1d, 7d) | 4.19 | 0.974 | 3.51 | 4.62 | 0.963 | 3.97% |
| **Random Forest** | Set B (+ Lags 1d, 7d) | 3.63 | 0.981 | 2.42 | 3.40 | 0.980 | 2.63% |
| **LightGBM (Best Overall)** | **Set B (+ Lags 1d, 7d)** | **3.51** | **0.982** | **2.25** | **3.11** | **0.983** | **2.47%** |

- **Why Tree & Neural Models Outperform Linear Models on Set A**: Moving from Ridge Regression ($R^2 = 0.857$, RMSE `9.02 MU`) to LightGBM ($R^2 = 0.941$, RMSE `5.78 MU`) cuts error by **36%** because Delhi's temperature response is U-shaped (demand rises both above `24°C` and below `15°C`).
- **Why LightGBM + Set B Wins**: Combining weather/calendar features with 1-day and 7-day demand lags slashes Delhi's test RMSE from `11.69 MU` (persistence baseline) to **`3.11 MU`** ($R^2 = \mathbf{0.983}$, MAPE `2.47%`).

### 5.2 Multi-State Results Across the 4 Focus States (`Test Set: 2023–2024`)

| State | Baseline $y_{t-7}$ Test $R^2$ | LightGBM Set A Test $R^2$ | LightGBM Set B Test MAE (`MU`) | LightGBM Set B Test RMSE (`MU`) | LightGBM Set B Test $R^2$ | LightGBM Set B Test MAPE (`%`) |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| **Delhi** | 0.760 | 0.941 | 2.25 | 3.11 | **0.983** | **2.47%** |
| **Uttar Pradesh** | 0.677 | 0.759 | 11.10 | 15.16 | **0.965** | **2.81%** |
| **Kerala** | 0.793 | 0.873 | 1.38 | 1.93 | **0.956** | **1.58%** |
| **Maharashtra** | 0.713 | 0.605 | 8.49 | 11.73 | **0.921** *(Ridge: 0.927)* | **1.54%** |

### 5.3 National Rollout Across 32 Indian States & UTs (`Test Set: 2023–2024`)
Running the LightGBM pipeline across all 32 states/UTs with complete data yields:
- **National Median Test $R^2$ (`Set B`)**: **`0.919`** (vs. `0.625` for the Same-Weekday-Last-Week baseline — **LightGBM beats the baseline in 32 out of 32 states**).
- **National Median Test `MAPE` (`Set B`)**: **`3.29%`**.
- **Top Performing Grids (`Set B` Test $R^2$)**: Delhi (`0.983`), Uttar Pradesh (`0.965`), Kerala (`0.956`), Rajasthan (`0.954`), Chandigarh (`0.953`), Punjab (`0.950`), Assam (`0.946`), Karnataka (`0.945`), West Bengal (`0.942`), Bihar (`0.938`), Gujarat (`0.932`), Maharashtra (`0.921`).

### 5.4 High-Demand Peak Alert Classification (Top 10% Load Days on Test Set)
Flagging extreme peak-load days (`>= 90th percentile` of each state's test-period demand in `MU`) directly from the model's continuous predictions:

| State | 90th Pct Threshold (`MU`) | Precision | Recall | F1-Score | Accuracy |
| :--- | ---: | ---: | ---: | ---: | ---: |
| **Delhi** | `130.1 MU` | `0.975` | `0.796` | `0.876` | `0.977` |
| **Kerala** | `99.3 MU` | `0.952` | `0.816` | `0.879` | `0.977` |
| **Uttar Pradesh** | `513.1 MU` | `0.947` | `0.735` | `0.828` | `0.969` |
| **Maharashtra** | `610.9 MU` | `0.833` | `0.714` | `0.769` | `0.957` |
| **Overall (1,932 State-Days)** | — | **`0.926`** | **`0.765`** | **`0.838`** | **`0.970`** |

---

## 6. Key Consumption Insights & Grid Recommendations

1. **Seasonal Peak vs. Monsoon Trough**:
   - **Northern States (`Delhi`, `Uttar Pradesh`)** peak in **June** (`1.357x` and `1.237x` of annual average demand) before monsoon rains arrive, with load troughs in **January–February**.
   - **Peninsular & Coastal States (`Maharashtra`, `Kerala`)** peak earlier in **March–April** (`1.124x` and `1.140x`), followed by a sharp **July–August monsoon trough** (`0.896x` and `0.922x`) when rainfall suppresses both cooling load and agricultural irrigation pumping.
   - *Grid Action*: Schedule major thermal overhauls in **Jan–Feb** for Northern Regional (`NR`) grids and **Jul–Aug** for Western/Southern (`WR`/`SR`) grids.
2. **Temperature Tipping Point (`24–25°C`) & Multi-Day Heatwave Accumulation**:
   - Across India, minimum demand sits in the `18–22°C` comfort zone. Above **`24–25°C`**, demand rises steeply (`+2.5% to +3.6%` per `°C` in northern grids). Permutation importance on `Set A` confirms that **maximum/mean daily temperature (`temp_max_c`, `temp_mean_c`) and 7-day rolling temperature (`temp_roll7_mean`)** are the single strongest meteorological drivers due to building thermal inertia.
   - *Grid Action*: Trigger automated day-ahead peak procurement whenever 7-day rolling mean temperature exceeds `31°C` in Delhi/UP (`29°C` in Kerala), rather than waiting for single-day extreme temperature alerts.
3. **Sunday & Holiday Load Drop**:
   - Commercial/service-heavy grids drop sharply on Sundays (**`-7.50%` / `-6.5 MU` in Delhi**; **`-8.03%` / `-5.7 MU` in Kerala**) and gazetted holidays (**`-8.80%` in Delhi**), whereas industrial/agricultural grids (`Maharashtra -3.69%`, `UP -1.62%`) remain flatter.
   - *Grid Action*: Scale back day-ahead baseload schedules by `7–9%` on Sundays/holidays in urban grids and schedule pumped-hydro/battery charging during Sunday solar hours.

---

## 7. Limitations

1. **Daily Granularity vs. 15-Minute Dispatch**: The dataset provides daily energy met (`MU`) and daily peak met (`MW`), not 15-minute block-level load profiles required for intraday real-time dispatch (`RTD`).
2. **Reanalysis vs. Operational Weather Forecasts**: Historical ERA5 reanalysis represents observed meteorology; live deployment requires coupling the model with NWP forecast feeds (e.g., IMD / ECMWF / Open-Meteo), which introduce 1–7 day weather forecast uncertainty.
3. **Unobserved Agricultural Tariff & Feeder Schedules**: In agrarian states (`Maharashtra`, `Uttar Pradesh`, `Punjab`), irrigation load depends on rural feeder rostering and monsoon onset timing, explaining why Set A (weather-only) $R^2$ is lower in Maharashtra (`0.605`) than in urban Delhi (`0.941`).
4. **Structural Breaks**: Extreme exogenous shocks like the March–May 2020 COVID-19 lockdown cause sharp temporary deviations that require explicit regime indicators (`covid_flag`).

---

## 8. How to Run on macOS

### Prerequisites
- macOS (Apple Silicon `arm64` or Intel `x86_64`) with **Python 3.10+** installed.
- Note for Apple Silicon users: if LightGBM requires the OpenMP runtime, install it once via `brew install libomp`.

### Step-by-Step Setup & Execution
```bash
# 1. Clone or navigate to the project root
cd india-demand-forecasting

# 2. Create and activate a virtual environment
python3 -m venv .venv
source .venv/bin/activate

# 3. Install dependencies
pip install --upgrade pip
pip install -r requirements.txt

# 4. Download raw data from Zenodo API (verifies MD5 checksums, skips existing files)
python src/download_data.py

# 5. Execute the complete notebook top-to-bottom (or open interactively in Jupyter/VS Code)
jupyter nbconvert --to notebook --execute --inplace notebooks/demand_forecasting.ipynb
```

### Repository Structure
```
india-demand-forecasting/
├── AGENTS.md                        # Project rules and guidelines
├── README.md                        # Project overview, methodology, results & setup guide
├── requirements.txt                 # Pinned Python dependencies for macOS
├── src/
│   └── download_data.py             # Zenodo REST API downloader with MD5 verification
├── notebooks/
│   └── demand_forecasting.ipynb     # Main self-contained notebook (Parts 1, 2 & 3 executed)
├── data/
│   ├── raw/                         # Downloaded Zenodo CSVs (git-ignored)
│   └── processed/
│       ├── daily.csv                # Daily demand_MU for all 34 states + weather for 4 focus states
│       ├── predictions.csv          # Test-period actual vs. predicted MU (Set A & Set B) for 4 focus states
│       └── climatology.csv          # Per-state & month median Set A features + 5th/50th/95th temp percentiles
└── models/
    ├── Delhi_setA.joblib            # Trained Feature Set A model for Delhi
    ├── Maharashtra_setA.joblib      # Trained Feature Set A model for Maharashtra
    ├── Kerala_setA.joblib           # Trained Feature Set A model for Kerala
    ├── Uttar_Pradesh_setA.joblib    # Trained Feature Set A model for Uttar Pradesh
    ├── feature_config.json          # Exact feature order, target definition, level_mu & split dates per state
    ├── metrics.json                 # Per-state model comparison tables, best models & 32-state R²
    └── insights.json                # Quantitative consumption insights & grid recommendations
```

---

## 9. Phase 2 Plan: Interactive Grid Forecasting Dashboard (React + FastAPI)

All Phase 1 artifacts (`models/<state>_setA.joblib`, `models/feature_config.json`, `data/processed/daily.csv`, `data/processed/predictions.csv`, `data/processed/climatology.csv`, `models/metrics.json`, `models/insights.json`) are pre-packaged to power **Phase 2**:
1. **FastAPI Backend (`backend/`)**:
   - `/api/states` & `/api/metrics`: Serve state-wise evaluation metrics (`MAE`, `RMSE`, $R^2$, `MAPE`) and seasonal insights from `metrics.json` and `insights.json`.
   - `/api/daily/{state}` & `/api/predictions/{state}`: Serve historical demand/weather series from `daily.csv` and test-period actual vs. predicted demand trajectories (`Set A` and `Set B`) from `predictions.csv`.
   - `/api/simulate`: Load `models/<state>_setA.joblib`, `models/feature_config.json`, and baseline monthly medians/percentiles from `data/processed/climatology.csv` to run interactive "What-If Heatwave & Holiday" simulations (converting predicted `demand_index` back to `MU` using each state's trailing 365-day `level_mu`).
2. **React Frontend (`frontend/`)**:
   - Interactive India state selector with KPI cards (`Test R²`, `MAPE`, `Peak Threshold MU`, `Temperature Tipping Point`).
   - Actual vs. Predicted time-series viewer with high-demand peak alert badges.
   - Live Heatwave Slider (`Δ°C` bounded by 5th–95th monthly percentiles from `climatology.csv`, humidity, holiday toggle) showing real-time demand surge predictions in `MU`.
