# Data Inspection, Validity Check & Phase 1 Plan

## 1. Zenodo Download Summary ([`src/download_data.py`](file:///Users/sanjanabhowal/Desktop/india-demand-forecasting/src/download_data.py))

[`src/download_data.py`](file:///Users/sanjanabhowal/Desktop/india-demand-forecasting/src/download_data.py) queries `https://zenodo.org/api/records/14983362`, lists all **42 files** with their sizes and categories, downloads the **38 required files** (`129.62 MB` total) into `data/raw/`, skips existing files with matching MD5 checksums, and verifies MD5 hashes after every download:

| Category | Count | Files | Action |
| :--- | :---: | :--- | :--- |
| **Corrected Daily Energy** | 1 | `corrected_daily_energy_met_MU.csv` (`788.6 KB`) | Downloaded & MD5 verified |
| **Corrected Peak Demand** | 1 | `corrected_peak_met_MW.csv` (`1,014.8 KB`) | Downloaded & MD5 verified |
| **Per-State Weather** | 36 | `Andaman_and_Nicobar.csv` … `West_Bengal.csv` (`3.44–3.63 MB` each) | Downloaded & MD5 verified |
| **Excluded (Uncorrected / National)** | 4 | `daily_energy_met_MU.csv`, `peak_met_MW.csv`, `peak_unmet_MW.csv`, `weighted_daily_mean_utci_india.csv` | Skipped |

---

## 2. Dataset Inspection

### 2.1 File Structure, Columns & Dtypes
- **Demand Files (`corrected_daily_energy_met_MU.csv` & `corrected_peak_met_MW.csv`)**:
  - **Shape**: `3,955 rows × 40 columns`
  - **Columns & Dtypes**: `'Date'` (`str`, `YYYY-MM-DD`) + **39 numeric (`float64`) columns** consisting of **36 states/UTs** and **3 non-state entities** (`'AMNSIL'`, `'Damodar Valley Corporation'`, `'Total'`).
- **Per-State Weather Files (36 `<State>.csv` files)**:
  - **Shape**: `16,554 rows × 22 columns` per file
  - **Columns & Dtypes**: `'date'` (lowercase `str`, `YYYY-MM-DD`) + **21 numeric (`float64`) columns** representing daily `min`, `mean`, and `max` of 7 ERA5 meteorological variables:
    1. `2m_temperature_{min,mean,max}` — **in Kelvin (K)** (convert to °C via $T_{\text{C}} = T_{\text{K}} - 273.15$)
    2. `2m_dewpoint_temperature_{min,mean,max}` — **in Kelvin (K)**
    3. `utci_{min,mean,max}` (Universal Thermal Climate Index) — **in Kelvin (K)**
    4. `10m_u_component_of_wind_{min,mean,max}` — m/s
    5. `10m_v_component_of_wind_{min,mean,max}` — m/s
    6. `surface_solar_radiation_downwards_{min,mean,max}` — $\text{J/m}^2$
    7. `total_cloud_cover_{min,mean,max}` — fraction $[0, 1]$

### 2.2 Date Range, Duplicates & Calendar Gaps
- **Demand Date Range**: `2013-01-01` to `2024-04-28` (`3,955` rows, **`3,900` unique dates**).
  - **Duplicates**: **55 duplicate date rows** (`43` exact full-row duplicates and `12` dates with slight revisions between `2013-06-26` and `2022-12-27`). *We must deduplicate by `Date` before computing lags or rolling windows.*
  - **Missing Calendar Days**: Out of `4,136` calendar days between `2013-01-01` and `2024-04-28`, **236 calendar dates are absent** from the POSOCO record (concentrated mainly in `2013` with 94 missing days, `2020` with 50, and `2017` with 29; `2018–2019` and `2022–2023` have only 1–6 missing days/year). *We must reindex onto a regular daily calendar (`asfreq('D')`) so a 7-day lag is always strictly 7 calendar days prior.*
- **Weather Date Range**: `1979-01-01` to `2024-04-27` (`16,554` rows, **0 duplicates**, **0 missing calendar days**).
- **Date Alignment**: `3,899` of the `3,900` unique demand dates match the weather files (`2024-04-28` is present only in demand).

### 2.3 Missing Values (NaNs)
- **Demand Files**:
  - **30 states/UTs have 0 missing values (`0.00%`)** across all 3,900 unique dates.
  - `Chhattisgarh` has only **1 missing value (`0.03%`)**.
  - `Telangana` has **423 missing values (`10.70%`)**, corresponding to dates prior to its June 2014 statehood.
  - `Dadra and Nagar Haveli` and `Daman and Diu` each have **695 missing values (`17.57%`)** after their 2020 administrative merger (note: their weather files also have identical MD5 checksums).
  - `Andaman and Nicobar Islands` and `Lakshadweep` are **100% NaN (`3,955` missing)** in both demand files.
- **Weather Files**:
  - From `2013-01-01` through `2024-01-28`, **all 21 weather columns have 0 missing values** in every state file.
  - Each weather file has `291` total NaN cells at the tail end of 2024: `utci_{min,mean,max}` is NaN for the last **90 days** (`2024-01-29` to `2024-04-27`), `surface_solar_radiation_downwards_*` is NaN on **2 days** (`2024-04-26` to `2024-04-27`), and the remaining 15 columns are NaN on **1 day** (`2024-04-27`).

### 2.4 State Name Matching (Demand Columns ↔ Weather Filenames)
- **3 non-state columns** in demand have no weather file: `'AMNSIL'`, `'Damodar Valley Corporation'`, `'Total'`.
- **24 single-word states/UTs** match the weather filename stem identically (e.g., `'Maharashtra'` ↔ `'Maharashtra.csv'`).
- **10 multi-word states/UTs** match after replacing spaces with underscores (`state.replace(" ", "_")`, e.g., `'Uttar Pradesh'` ↔ `'Uttar_Pradesh.csv'`, `'Tamil Nadu'` ↔ `'Tamil_Nadu.csv'`).
- **2 special mappings** require an explicit lookup dictionary:
  - `'Delhi'` (demand column) ↔ `'NCT_of_Delhi.csv'` (weather file)
  - `'Andaman and Nicobar Islands'` (demand column) ↔ `'Andaman_and_Nicobar.csv'` (weather file; 100% NaN in demand)

---

## 3. Validity Check Results

> [!IMPORTANT]
> **Plain Verdict: YES — this dataset is completely valid and rich in signal.** Unlike synthetic or noisy datasets, it exhibits strong multi-year economic growth trends, clear physical weather sensitivity (both summer cooling peaks and winter heating/irrigation peaks), consistent Sunday industrial/commercial load drops in 33 of 34 states, and a strong autoregressive weekly baseline (median naive lag-7 $R^2 = 0.761$).

### 3.1 Demand vs. Date for 3 States (Trend & Seasonality)
![Daily Electricity Demand vs. Date for Maharashtra, Uttar Pradesh, and Delhi](/Users/sanjanabhowal/.gemini/antigravity/brain/0d96c794-b0c3-4522-86a2-13e381f73dab/validity_demand_trend_seasonality.png)

- **Long-Term Secular Trend (`365-day rolling mean`)**: Clear upward trajectory driven by economic growth and electrification (`Maharashtra` grows from ~340 MU/day in 2013 to ~560 MU/day in 2024; `Uttar Pradesh` nearly doubles from ~220 MU/day to ~410 MU/day), interrupted by a sharp, real-world dip in **March–June 2020 (COVID-19 national lockdown)**.
- **Distinct Regional Seasonality (`30-day rolling mean`)**:
  - **Maharashtra**: Peaks in pre-monsoon summer (March–May), drops sharply during the southwest monsoon (June–September) when rains cool the air and pause irrigation pumping, and rebounds during the winter Rabi irrigation season.
  - **Uttar Pradesh**: Massive summer/monsoon cooling peak (May–September, reaching >520 MU/day) vs. cool winter troughs (~260–300 MU/day).
  - **Delhi**: Classic **bimodal (dual-peak)** urban profile — an extreme summer air-conditioning peak (May–August, ~130–150 MU/day) plus a secondary winter heating peak (December–January, ~85–90 MU/day), separated by spring and autumn troughs (~55–65 MU/day).

### 3.2 Weather Correlation, Weekday vs. Sunday Drop, and Naive Baseline $R^2$
![Validity Check Summary Across Top 20 States](/Users/sanjanabhowal/.gemini/antigravity/brain/0d96c794-b0c3-4522-86a2-13e381f73dab/validity_metrics_summary.png)

### 3.3 Full Per-State Validity Table (All 34 Valid States, Sorted by Mean Demand)

*Note on Temperature Correlation*: Because demand grows by 60–90% over 2013–2024 while annual mean temperature is stationary, we report both **raw Pearson $r$** across all 11 years and **within-year (year-demeaned) Pearson $r$**, which isolates the seasonal weather response from the multi-year GDP/electrification trend.

| State / UT | Valid Days | Mean Demand (MU) | Std (MU) | Raw $r(\text{Demand}, T_{\text{mean}})$ | Within-Year $r(\text{Demand}, T_{\text{mean}})$ | Weekday Mon–Fri (MU) | Sunday (MU) | Weekday − Sunday (MU) | Weekday − Sunday (%) | Naive Lag-7 $R^2$ | Naive Lag-7 MAE (MU) | Naive Lag-7 RMSE (MU) | Naive Lag-7 MAPE (%) |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **Maharashtra** | 3,900 | 440.04 | 74.31 | 0.251 | 0.482 | 443.04 | 426.27 | +16.77 | +3.79% | **0.851** | 20.45 | 28.79 | 4.79% |
| **Gujarat** | 3,900 | 319.33 | 60.51 | 0.177 | 0.375 | 320.84 | 308.90 | +11.94 | +3.72% | **0.753** | 19.73 | 30.13 | 6.56% |
| **Uttar Pradesh** | 3,900 | 314.36 | 78.78 | 0.456 | 0.672 | 315.23 | 309.78 | +5.46 | +1.73% | **0.797** | 24.17 | 35.54 | 7.45% |
| **Tamil Nadu** | 3,900 | 293.30 | 41.42 | 0.444 | 0.655 | 296.34 | 275.88 | +20.45 | +6.90% | **0.705** | 16.49 | 22.64 | 5.87% |
| **Rajasthan** | 3,900 | 220.03 | 45.43 | -0.151 | -0.161 | 220.59 | 216.50 | +4.09 | +1.86% | **0.758** | 15.80 | 22.44 | 7.51% |
| **Madhya Pradesh** | 3,900 | 204.20 | 51.87 | -0.344 | -0.469 | 204.59 | 201.72 | +2.87 | +1.40% | **0.857** | 14.06 | 19.69 | 7.25% |
| **Karnataka** | 3,900 | 194.62 | 40.83 | 0.295 | 0.348 | 196.78 | 183.49 | +13.29 | +6.75% | **0.828** | 12.63 | 17.06 | 6.78% |
| **Andhra Pradesh** | 3,900 | 179.98 | 37.28 | 0.196 | 0.320 | 180.41 | 177.63 | +2.78 | +1.54% | **0.843** | 10.36 | 14.71 | 6.00% |
| **Telangana** | 3,485 | 179.38 | 43.95 | 0.012 | 0.026 | 180.28 | 175.12 | +5.15 | +2.86% | **0.808** | 13.29 | 19.35 | 7.45% |
| **Punjab** | 3,900 | 154.54 | 58.93 | 0.649 | 0.695 | 155.30 | 150.08 | +5.22 | +3.36% | **0.789** | 18.02 | 27.09 | 11.51% |
| **Haryana** | 3,900 | 143.05 | 36.71 | 0.564 | 0.626 | 144.57 | 134.78 | +9.79 | +6.77% | **0.715** | 13.92 | 19.66 | 9.78% |
| **West Bengal** | 3,900 | 141.98 | 29.02 | 0.682 | 0.826 | 143.17 | 135.30 | +7.87 | +5.50% | **0.694** | 11.30 | 16.15 | 7.88% |
| **Odisha** | 3,900 | 86.11 | 19.70 | 0.312 | 0.611 | 86.18 | 85.75 | +0.43 | +0.50% | **0.820** | 6.14 | 8.43 | 7.26% |
| **Delhi** | 3,900 | 85.61 | 23.31 | 0.756 | 0.774 | 87.07 | 80.28 | +6.79 | +7.80% | **0.813** | 7.22 | 10.10 | 8.11% |
| **Chhattisgarh** | 3,899 | 84.15 | 16.66 | 0.299 | 0.544 | 84.28 | 83.66 | +0.61 | +0.73% | **0.772** | 5.71 | 8.01 | 6.77% |
| **Bihar** | 3,900 | 78.80 | 26.18 | 0.286 | 0.605 | 78.76 | 78.99 | -0.23 | -0.29% | **0.862** | 6.45 | 9.69 | 8.01% |
| **Kerala** | 3,900 | 68.92 | 10.20 | 0.536 | 0.713 | 69.79 | 64.06 | +5.73 | +8.21% | **0.831** | 2.99 | 4.22 | 4.42% |
| **Jammu and Kashmir** | 3,900 | 43.20 | 8.85 | -0.384 | -0.615 | 43.26 | 42.82 | +0.44 | +1.01% | **0.797** | 2.76 | 4.01 | 7.02% |
| **Uttarakhand** | 3,900 | 37.07 | 5.41 | 0.260 | 0.378 | 37.38 | 35.16 | +2.21 | +5.92% | **0.590** | 2.38 | 3.48 | 6.73% |
| **Himachal Pradesh** | 3,900 | 27.49 | 4.29 | -0.089 | -0.085 | 27.77 | 25.77 | +2.00 | +7.20% | **0.678** | 1.61 | 2.45 | 6.25% |
| **Assam** | 3,900 | 26.14 | 6.26 | 0.552 | 0.719 | 26.26 | 25.35 | +0.91 | +3.46% | **0.748** | 2.14 | 3.15 | 8.15% |
| **Jharkhand** | 3,900 | 24.86 | 4.79 | 0.095 | 0.257 | 24.85 | 24.78 | +0.07 | +0.29% | **0.777** | 1.68 | 2.28 | 6.87% |
| **Dadra and Nagar Haveli** | 3,206 | 16.44 | 2.56 | -0.135 | -0.167 | 16.48 | 16.25 | +0.23 | +1.39% | **0.700** | 0.75 | 1.42 | 6.53% |
| **Goa** | 3,900 | 10.33 | 2.25 | 0.288 | 0.457 | 10.45 | 9.64 | +0.81 | +7.72% | **0.819** | 0.69 | 0.96 | 6.85% |
| **Puducherry** | 3,900 | 7.39 | 1.32 | 0.343 | 0.644 | 7.44 | 6.98 | +0.46 | +6.16% | **0.763** | 0.45 | 0.65 | 6.44% |
| **Daman and Diu** | 3,206 | 6.55 | 0.99 | -0.035 | -0.035 | 6.60 | 6.31 | +0.28 | +4.30% | **0.299** | 0.46 | 0.83 | 8.66% |
| **Meghalaya** | 3,900 | 5.29 | 0.92 | -0.428 | -0.576 | 5.29 | 5.25 | +0.04 | +0.72% | **0.692** | 0.37 | 0.51 | 7.65% |
| **Chandigarh** | 3,900 | 4.47 | 1.21 | 0.668 | 0.668 | 4.57 | 4.03 | +0.55 | +11.96% | **0.765** | 0.41 | 0.59 | 8.74% |
| **Tripura** | 3,900 | 3.91 | 0.90 | 0.459 | 0.586 | 3.93 | 3.82 | +0.11 | +2.76% | **0.454** | 0.46 | 0.67 | 11.98% |
| **Manipur** | 3,900 | 2.32 | 0.50 | -0.290 | -0.464 | 2.32 | 2.29 | +0.03 | +1.44% | **0.751** | 0.17 | 0.25 | 8.21% |
| **Nagaland** | 3,900 | 2.08 | 0.38 | 0.056 | 0.124 | 2.09 | 2.05 | +0.04 | +1.75% | **0.666** | 0.16 | 0.22 | 7.95% |
| **Arunachal Pradesh** | 3,900 | 2.05 | 0.45 | -0.104 | -0.085 | 2.05 | 2.04 | +0.02 | +0.86% | **0.748** | 0.16 | 0.22 | 8.54% |
| **Mizoram** | 3,900 | 1.50 | 0.32 | -0.219 | -0.445 | 1.50 | 1.46 | +0.04 | +2.86% | **0.755** | 0.11 | 0.16 | 7.67% |
| **Sikkim** | 3,900 | 1.36 | 0.34 | -0.511 | -0.520 | 1.40 | 1.19 | +0.20 | +14.35% | **0.285** | 0.20 | 0.28 | 16.16% |

---

## 4. Proposed Phase 1 Plan (Awaiting Approval)

### 4.1 The 4 Focus States — and Why They Were Chosen
We propose focusing on **Maharashtra, Uttar Pradesh, Tamil Nadu, and Delhi (`NCT of Delhi`)**:
1. **Zero Missing Target Data**: All 4 states have **0 missing values** (`3,900 / 3,900` valid dates), avoiding synthetic target imputation.
2. **High Stakeholder Impact**: Together they account for **~1,133 MU/day (~36% of India's total electricity consumption)**.
3. **Four Distinct Geographic Grids, Climates & Demand Regimes**:
   - **Maharashtra (Western Grid — ~440 MU/day)**: India's largest electricity consumer; mixed industrial (`-3.8%` Sunday drop) and agricultural load with a sharp southwest monsoon demand drop and winter Rabi irrigation rebound.
   - **Uttar Pradesh (Northern Grid — ~314 MU/day)**: India's most populous state; rapid secular growth (+86% over 2013–2024) and intense summer/monsoon cooling peaks (`r = 0.67` within-year temperature correlation).
   - **Tamil Nadu (Southern Grid — ~293 MU/day)**: Warm tropical industrial/manufacturing hub with both strong heat sensitivity (`r = 0.66` within-year) and the largest Sunday industrial load drop in India (`-20.5 MU` or `-6.9%`).
   - **Delhi (`NCT of Delhi`, Northern Urban Metro — ~86 MU/day)**: Pure urban residential/commercial profile with the highest raw temperature correlation in India (`r = 0.76`), a **non-linear U-shaped temperature curve** (both summer AC peaks and winter heating peaks), and a `-7.8%` Sunday drop. *(Also exercises our `Delhi` ↔ `NCT_of_Delhi.csv` name mapping.)*

*(Optional alternative: if you want to include a winter-peaking agricultural state with negative temperature correlation, we could swap either Tamil Nadu or Delhi for **Madhya Pradesh** or **Punjab**.)*

### 4.2 Target Variable
- **Primary Target**: Corrected Daily Energy Met in **Million Units (`MU`, i.e., GWh)** from `corrected_daily_energy_met_MU.csv`.
- **Preprocessing**: Deduplicate dates (`keep='first'`), reindex to a regular daily calendar (`asfreq('D')`), and restrict to `2014-01-01` – `2023-12-31` (10 complete calendar years; avoids the 94 missing calendar days in 2013 and the early-2024 `utci` NaNs, or up to `2024-04-26` if excluding `utci`).

### 4.3 Features (Strictly Leak-Free, Past Data Only)
1. **Meteorological Features (converted from K to °C where applicable)**:
   - `temp_mean_C`, `temp_max_C`, `temp_min_C`, diurnal temperature range (`temp_max_C - temp_min_C`)
   - Non-linear thermal stress: **Cooling Degree Days** $\text{CDD} = \max(0, T_{\text{mean}} - 24^\circ\text{C})$ and **Heating Degree Days** $\text{HDD} = \max(0, 18^\circ\text{C} - T_{\text{mean}})$
   - Humidity / mugginess: `dewpoint_mean_C`, dewpoint depression (`temp_mean_C - dewpoint_mean_C`)
   - Solar & cloud: `surface_solar_radiation_downwards_mean`, `total_cloud_cover_mean`
   - Wind speed magnitude: $\sqrt{u_{10\text{m,mean}}^2 + v_{10\text{m,mean}}^2}$
   - Thermal comfort: `utci_mean_C` (if ending at `2023-12-31`, where `utci` is 100% non-null)
   - Multi-day heatwave build-up: 3-day and 7-day trailing mean of `temp_mean_C` (using `.shift(1).rolling(...)` or up to day $t$ weather)
2. **Calendar & Trend Features**:
   - Day of week (`0–6`), `is_sunday`, `is_weekend`
   - Cyclical seasonal encoding: $\sin/\cos(2\pi \cdot \text{dayofyear} / 365.25)$
   - Secular growth index: `year` or linear time index `t_days` (fit/scaled on train only)
3. **Autoregressive Lag & Rolling Demand Features (strictly past values $t-1$ and earlier)**:
   - `demand_lag_1` ($y_{t-1}$), `demand_lag_2` ($y_{t-2}$), `demand_lag_7` ($y_{t-7}$, same weekday last week), `demand_lag_14` ($y_{t-14}$)
   - `demand_rolling_mean_7` ($\text{mean}(y_{t-7 \dots t-1})$), `demand_rolling_std_7` ($\text{std}(y_{t-7 \dots t-1})$), `demand_rolling_mean_30` ($\text{mean}(y_{t-30 \dots t-1})$)

### 4.4 Chronological Split Dates (No Shuffling)
Using the 10 complete calendar years `2014-01-01` to `2023-12-31`:
- **Training Set (7 years)**: `2014-01-01` to `2020-12-31` (~2,450 days) — captures multi-year growth, El Niño/monsoon variations, and the 2020 shock.
- **Validation Set (1.5 years)**: `2021-01-01` to `2022-06-30` (~540 days) — used for hyperparameter tuning (alongside `TimeSeriesSplit` cross-validation on train).
- **Test Set (1.5 years)**: `2022-07-01` to `2023-12-31` (~548 days) — strictly held out for final evaluation of **MAE, RMSE, $R^2$, and MAPE (in MU)**.

### 4.5 Model List (From Simple Baselines to Non-Linear Ensembles)
1. **Naive Baseline 1 — Seasonal Weekly Lag ($\hat{y}_t = y_{t-7}$)**: "Same weekday last week" benchmark.
2. **Naive Baseline 2 — Persistence ($\hat{y}_t = y_{t-1}$)**: "Yesterday's demand" benchmark.
3. **Ridge Regression (`Ridge` with `StandardScaler` in a `Pipeline`)**: Regularized linear model testing how much linear weather + calendar + lag features explain, with `alpha` tuned over `[0.1, 1.0, 10.0, 100.0]`.
4. **Random Forest Regressor (`RandomForestRegressor`)**: Bagged decision trees capturing non-linear U-shaped temperature responses and feature interactions without scaling sensitivity (`n_estimators`, `max_depth`, `min_samples_leaf` tuned).
5. **Histogram-Based Gradient Boosting (`HistGradientBoostingRegressor`)**: Fast, modern gradient-boosted trees (scikit-learn's native LightGBM equivalent, runs natively on macOS without external OpenMP issues), tuned over `learning_rate`, `max_leaf_nodes`, and `min_samples_leaf`.
