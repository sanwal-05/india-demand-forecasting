import React, { useEffect, useMemo, useState } from 'react';
import { fetchMapData } from '../api';
import indiaGeoJson from '../data/india_states.json';
import {
  DEMAND_LOW_TO_HIGH_PALETTE,
  FOCUS_STATES,
  GEOJSON_TO_DATASET_STATE,
  GREEN_TOKENS,
  NEUTRALS,
  normalizeGeoStateName,
  RED_TOKENS,
  SKILL_LOW_TO_HIGH_PALETTE,
} from '../theme';
import IndiaMapSVG from './IndiaMapSVG';

const MONTH_OPTIONS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

export default function OverviewTab({
  statesMeta,
  bestModelName,
  onOpenStateExplorer,
}) {
  const [metric, setMetric] = useState('avg_demand');
  const [selectedYear, setSelectedYear] = useState(2023);
  const [selectedMonth, setSelectedMonth] = useState(6);
  const [mapPayload, setMapPayload] = useState(null);
  const [loadingMap, setLoadingMap] = useState(true);
  const [mapError, setMapError] = useState(null);
  const [clickedOtherState, setClickedOtherState] = useState(null);

  // Fetch map data whenever metric, year, or month changes
  useEffect(() => {
    let cancelled = false;
    setLoadingMap(true);
    setMapError(null);

    const yearArg = metric === 'vs_typical' ? selectedYear : null;
    const monthArg = metric === 'vs_typical' ? selectedMonth : null;

    fetchMapData({ metric, year: yearArg, month: monthArg })
      .then((res) => {
        if (!cancelled) {
          setMapPayload(res);
          setLoadingMap(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setMapError(err.message || 'Failed to load map data');
          setLoadingMap(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [metric, selectedYear, selectedMonth]);

  // Index states by name
  const statesByName = useMemo(() => {
    const map = {};
    for (const s of statesMeta?.states || []) {
      map[s.state] = s;
    }
    return map;
  }, [statesMeta]);

  const mapStatesByName = useMemo(() => {
    const map = {};
    for (const s of mapPayload?.states || []) {
      map[s.state] = s;
    }
    return map;
  }, [mapPayload]);

  // Compute KPI card metrics strictly from API data
  const kpiStats = useMemo(() => {
    const allStates = statesMeta?.states || [];
    const focusList = allStates.filter((s) => s.is_focus);
    const validR2Focus = focusList
      .map((s) => s.model_r2)
      .filter((v) => v !== null && v !== undefined);
    const validSetAFocus = focusList
      .map((s) => s.set_a_r2)
      .filter((v) => v !== null && v !== undefined);

    const avgFocusR2 =
      validR2Focus.length > 0
        ? validR2Focus.reduce((a, b) => a + b, 0) / validR2Focus.length
        : null;
    const avgFocusSetAR2 =
      validSetAFocus.length > 0
        ? validSetAFocus.reduce((a, b) => a + b, 0) / validSetAFocus.length
        : null;

    const modeledCount = allStates.filter(
      (s) => s.model_r2 !== null && s.model_r2 !== undefined
    ).length;

    const splits = statesMeta?.splits || {};

    return {
      totalStates: statesMeta?.count || allStates.length,
      modeledCount,
      focusCount: focusList.length,
      trainSplit: splits.train || '2014-01-08 to 2021-12-31',
      valSplit: splits.validation || '2022-01-01 to 2022-12-31',
      testSplit: splits.test || '2023-01-01 to 2024-04-27',
      avgFocusR2,
      avgFocusSetAR2,
      focusList,
    };
  }, [statesMeta]);

  // Compute GeoJSON vs Dataset state matching audit dynamically
  const geoMatchAudit = useMemo(() => {
    const datasetNames = new Set((statesMeta?.states || []).map((s) => s.state));
    const geoRawNames = indiaGeoJson.features.map(
      (f) => f.properties?.NAME_1 || ''
    );
    const normalizedGeoSet = new Set(
      geoRawNames.map((n) => normalizeGeoStateName(n))
    );

    // GeoJSON polygons that have no dataset match
    const geoWithoutDataset = [];
    for (const raw of geoRawNames) {
      const norm = normalizeGeoStateName(raw);
      if (!datasetNames.has(norm)) {
        geoWithoutDataset.push({ rawGeoName: raw, normalizedName: norm });
      }
    }

    // Dataset states that have no dedicated polygon in this GeoJSON
    const datasetWithoutGeo = [];
    for (const dName of datasetNames) {
      if (!normalizedGeoSet.has(dName)) {
        datasetWithoutGeo.push(dName);
      }
    }

    // States in dataset that have demand data but no Model R² (when metric === 'model_r2')
    const missingMetricStates = (mapPayload?.states || [])
      .filter((s) => s.value === null || s.value === undefined)
      .map((s) => s.state);

    return {
      totalGeoPolygons: geoRawNames.length,
      matchedPolygons: geoRawNames.length - geoWithoutDataset.length,
      geoWithoutDataset,
      datasetWithoutGeo,
      missingMetricStates,
    };
  }, [statesMeta, mapPayload]);

  const handleSelectStateOnMap = (stateName, isFocus) => {
    if (isFocus) {
      onOpenStateExplorer(stateName);
    } else {
      setClickedOtherState(stateName);
    }
  };

  const clickedStateSummary = clickedOtherState
    ? statesByName[clickedOtherState] || null
    : null;
  const clickedStateMapInfo = clickedOtherState
    ? mapStatesByName[clickedOtherState] || null
    : null;

  return (
    <div className="space-y-6">
      {/* 1. Top KPI Strip (4 Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            States Covered
          </div>
          <div
            className="mt-1 text-2xl font-bold"
            style={{ color: '#204110' }}
          >
            {kpiStats.totalStates} States & UTs
          </div>
          <div className="mt-1 text-xs text-gray-600">
            <span className="font-semibold text-gray-800">
              {kpiStats.focusCount} Focus States
            </span>{' '}
            (full weather + lag pipeline) · {kpiStats.modeledCount} modeled nationally
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Chronological Date Range
          </div>
          <div className="mt-1 text-xl font-bold text-gray-900">
            2014-01-08 – 2024-04-27
          </div>
          <div className="mt-1 text-xs text-gray-600">
            Train: ≤2021 · Val: 2022 · Test: {kpiStats.testSplit}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Best Forecasting Model
          </div>
          <div
            className="mt-1 text-2xl font-bold"
            style={{ color: '#204110' }}
          >
            {bestModelName || 'LightGBM'}
          </div>
          <div className="mt-1 text-xs text-gray-600">
            Tuned via 5-fold TimeSeriesSplit CV on training data only
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Avg Test R² (4 Focus States)
          </div>
          <div
            className="mt-1 text-2xl font-bold"
            style={{ color: '#204110' }}
          >
            {kpiStats.avgFocusR2 !== null
              ? kpiStats.avgFocusR2.toFixed(3)
              : '—'}{' '}
            <span className="text-sm font-medium text-gray-600">(Set B)</span>
          </div>
          <div className="mt-1 text-xs text-gray-600">
            Weather + Calendar only (Set A) avg R²:{' '}
            <span className="font-semibold text-gray-800">
              {kpiStats.avgFocusSetAR2 !== null
                ? kpiStats.avgFocusSetAR2.toFixed(3)
                : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Main Map + Right-Hand Focus & Selected State Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 7 Cols: Interactive India Choropleth Map Card */}
        <div className="lg:col-span-7 bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-gray-200">
              <div>
                <h2 className="text-base font-bold text-gray-900">
                  Interactive All-India Grid Map
                </h2>
                <p className="text-xs text-gray-600 mt-0.5">
                  Click any of the <span className="font-semibold" style={{ color: '#204110' }}>4 Focus States (bold dark-green outline)</span> to open its State Explorer, or click any other state for its summary.
                </p>
              </div>

              {/* Metric Dropdown & Year/Month Selectors */}
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs font-semibold text-gray-700">
                  Metric:
                </label>
                <select
                  value={metric}
                  onChange={(e) => setMetric(e.target.value)}
                  className="text-xs font-medium bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-gray-800 focus:outline-none focus:border-gray-500"
                >
                  <option value="avg_demand">
                    Average Demand (MU) — Green=Low, Red=High
                  </option>
                  <option value="vs_typical">
                    Demand vs Typical (%) — Green=Below, Red=Above
                  </option>
                  <option value="model_r2">
                    Model Test R² — Green=High Skill, Red=Low Skill
                  </option>
                </select>

                {metric === 'vs_typical' && (
                  <>
                    <select
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(Number(e.target.value))}
                      className="text-xs font-medium bg-white border border-gray-300 rounded-lg px-2 py-1.5 text-gray-800"
                      aria-label="Select Year"
                    >
                      {(
                        mapPayload?.available_years ||
                        statesMeta?.available_years || [2023]
                      ).map((yr) => (
                        <option key={yr} value={yr}>
                          {yr}
                        </option>
                      ))}
                    </select>
                    <select
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(Number(e.target.value))}
                      className="text-xs font-medium bg-white border border-gray-300 rounded-lg px-2 py-1.5 text-gray-800"
                      aria-label="Select Month"
                    >
                      {MONTH_OPTIONS.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </div>
            </div>

            {/* Map Body */}
            <div className="my-2 min-h-[480px] flex items-center justify-center">
              {loadingMap ? (
                <div className="text-sm text-gray-500 py-16">
                  Loading map metrics from API…
                </div>
              ) : mapError ? (
                <div
                  className="text-sm font-medium py-12 px-4 rounded-lg border"
                  style={{
                    color: '#6b0015',
                    borderColor: '#e10531',
                    backgroundColor: '#fff5f5',
                  }}
                >
                  Error loading map: {mapError}
                </div>
              ) : (
                <IndiaMapSVG
                  metric={metric}
                  mapStatesByName={mapStatesByName}
                  minValue={mapPayload?.min_value}
                  maxValue={mapPayload?.max_value}
                  selectedState={clickedOtherState}
                  onSelectState={handleSelectStateOnMap}
                />
              )}
            </div>
          </div>

          {/* Map Legend + Disclaimers */}
          <div className="pt-3 border-t border-gray-200 space-y-2.5">
            {metric === 'avg_demand' && (
              <div>
                <div className="flex items-center justify-between text-xs font-semibold text-gray-700 mb-1">
                  <span style={{ color: '#204110' }}>
                    ■ Green = Low Daily Demand ({mapPayload?.min_value ?? 1.5} MU)
                  </span>
                  <span style={{ color: '#6b0015' }}>
                    ■ Red = High Daily Demand ({mapPayload?.max_value ?? 440} MU)
                  </span>
                </div>
                <div className="grid grid-cols-10 h-3 rounded overflow-hidden border border-gray-200">
                  {DEMAND_LOW_TO_HIGH_PALETTE.map((hex) => (
                    <div key={hex} style={{ backgroundColor: hex }} />
                  ))}
                </div>
              </div>
            )}

            {metric === 'vs_typical' && (
              <div>
                <div className="flex items-center justify-between text-xs font-semibold text-gray-700 mb-1">
                  <span style={{ color: '#204110' }}>
                    ■ Green = Below Typical Month Demand (&lt; 0%)
                  </span>
                  <span style={{ color: '#6b0015' }}>
                    ■ Red = Above Typical Month Demand (&gt; 0%)
                  </span>
                </div>
                <div className="grid grid-cols-10 h-3 rounded overflow-hidden border border-gray-200">
                  {DEMAND_LOW_TO_HIGH_PALETTE.map((hex) => (
                    <div key={hex} style={{ backgroundColor: hex }} />
                  ))}
                </div>
              </div>
            )}

            {metric === 'model_r2' && (
              <div>
                <div className="flex items-center justify-between text-xs font-semibold text-gray-700 mb-1">
                  <span style={{ color: '#6b0015' }}>
                    ■ Red = Lower Model Skill (R² &lt; 0.85)
                  </span>
                  <span style={{ color: '#204110' }}>
                    ■ Green = High Model Skill (R² ≥ 0.85 up to 0.983)
                  </span>
                </div>
                <div className="grid grid-cols-10 h-3 rounded overflow-hidden border border-gray-200">
                  {SKILL_LOW_TO_HIGH_PALETTE.map((hex) => (
                    <div key={hex} style={{ backgroundColor: hex }} />
                  ))}
                </div>
              </div>
            )}

            {/* Symbol Legend */}
            <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600 pt-1">
              <span className="inline-flex items-center gap-1.5 font-semibold text-gray-800">
                <span
                  className="inline-block w-3.5 h-3.5 rounded-sm border-2"
                  style={{
                    borderColor: '#204110',
                    backgroundColor: '#749764',
                  }}
                />
                4 Focus States (Full Color + Bold #204110 Outline)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block w-3.5 h-3.5 rounded-sm border"
                  style={{
                    borderColor: '#d1d5db',
                    backgroundColor: '#c8d9c2',
                    opacity: 0.6,
                  }}
                />
                Other States (Muted + Thin Grey Outline)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block w-3.5 h-3.5 rounded-sm border border-gray-300"
                  style={{ backgroundColor: NEUTRALS.noDataFill }}
                />
                Unmatched / No Data
              </span>
            </div>

            {/* Required Map Boundary Disclaimer */}
            <p className="text-[11px] text-gray-500 italic pt-1 border-t border-gray-100">
              Note: J&amp;K and Ladakh are combined in this dataset and map boundaries are illustrative.
            </p>
          </div>
        </div>

        {/* Right 5 Cols: Focus States Cards + Clicked Non-Focus State Card + GeoJSON Mapping Audit */}
        <div className="lg:col-span-5 space-y-5">
          {/* Selected Non-Focus State Summary Card (Appears when user clicks a non-focus state on the map) */}
          {clickedOtherState && (
            <div className="bg-white border-2 border-gray-300 rounded-xl p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                    Selected National Grid State
                  </span>
                  <h3 className="text-lg font-bold text-gray-900 mt-0.5">
                    {clickedOtherState}
                  </h3>
                </div>
                <button
                  onClick={() => setClickedOtherState(null)}
                  className="text-xs text-gray-500 hover:text-gray-800 px-2 py-0.5 rounded border border-gray-200"
                >
                  Close
                </button>
              </div>

              {clickedStateSummary ? (
                <div className="mt-3 grid grid-cols-2 gap-2.5 text-xs">
                  <div className="p-2.5 rounded-lg bg-gray-50 border border-gray-200">
                    <div className="text-gray-500">Historical Avg Demand</div>
                    <div className="text-sm font-bold text-gray-900 mt-0.5">
                      {clickedStateSummary.avg_demand_MU.toFixed(1)} MU/day
                    </div>
                    <div className="text-[11px] text-gray-500">
                      Range: {clickedStateSummary.min_demand_MU.toFixed(1)} –{' '}
                      {clickedStateSummary.max_demand_MU.toFixed(1)} MU
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-gray-50 border border-gray-200">
                    <div className="text-gray-500">Recent 365-Day Mean</div>
                    <div className="text-sm font-bold text-gray-900 mt-0.5">
                      {clickedStateSummary.recent_365d_mean_MU.toFixed(1)} MU/day
                    </div>
                    <div className="text-[11px] text-gray-500">
                      {clickedStateSummary.n_days.toLocaleString()} daily records
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-gray-50 border border-gray-200">
                    <div className="text-gray-500">National Rollout Test R²</div>
                    <div
                      className="text-sm font-bold mt-0.5"
                      style={{
                        color:
                          clickedStateSummary.model_r2 !== null &&
                          clickedStateSummary.model_r2 >= 0.85
                            ? '#204110'
                            : '#850014',
                      }}
                    >
                      {clickedStateSummary.model_r2 !== null &&
                      clickedStateSummary.model_r2 !== undefined
                        ? clickedStateSummary.model_r2.toFixed(3)
                        : 'No data'}
                    </div>
                    <div className="text-[11px] text-gray-500">
                      MAPE:{' '}
                      {clickedStateSummary.mape_pct !== null &&
                      clickedStateSummary.mape_pct !== undefined
                        ? `${clickedStateSummary.mape_pct.toFixed(2)}%`
                        : '—'}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-gray-50 border border-gray-200">
                    <div className="text-gray-500">Current Map Metric</div>
                    <div className="text-sm font-bold text-gray-900 mt-0.5">
                      {clickedStateMapInfo && clickedStateMapInfo.value !== null
                        ? `${clickedStateMapInfo.value} ${mapPayload?.unit || ''}`
                        : 'No data'}
                    </div>
                    <div className="text-[11px] text-gray-500">
                      {clickedStateSummary.start_date} to{' '}
                      {clickedStateSummary.end_date}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-2 text-xs text-gray-600 bg-gray-50 p-3 rounded-lg border border-gray-200">
                  No demand records exist in the Zenodo POSOCO dataset for{' '}
                  <span className="font-semibold">{clickedOtherState}</span>{' '}
                  (shown in neutral grey on the map).
                </div>
              )}

              <div
                className="mt-3 p-2.5 rounded-lg text-xs border"
                style={{
                  backgroundColor: '#f8faf7',
                  borderColor: '#a0bd85',
                  color: '#204110',
                }}
              >
                <strong>Note:</strong> Detailed weather-coupled analysis, model comparisons, and interactive What-If simulations cover our 4 focus states (
                <button
                  onClick={() => onOpenStateExplorer('Delhi')}
                  className="underline font-semibold mr-1"
                >
                  Delhi
                </button>
                ,
                <button
                  onClick={() => onOpenStateExplorer('Maharashtra')}
                  className="underline font-semibold mx-1"
                >
                  Maharashtra
                </button>
                ,
                <button
                  onClick={() => onOpenStateExplorer('Kerala')}
                  className="underline font-semibold mx-1"
                >
                  Kerala
                </button>
                , and
                <button
                  onClick={() => onOpenStateExplorer('Uttar Pradesh')}
                  className="underline font-semibold ml-1"
                >
                  Uttar Pradesh
                </button>
                ).
              </div>
            </div>
          )}

          {/* 4 Focus States Deep-Dive Directory Card */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold text-gray-900">
                  Our 4 Focus States (Click to Open State Explorer)
                </h3>
                <p className="text-xs text-gray-500">
                  Representing India&apos;s 4 distinct climate and load regimes
                </p>
              </div>
              <span
                className="text-[11px] font-semibold px-2 py-0.5 rounded text-white"
                style={{ backgroundColor: '#204110' }}
              >
                Full Weather + Lag Models
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {kpiStats.focusList.map((st) => (
                <button
                  key={st.state}
                  onClick={() => onOpenStateExplorer(st.state)}
                  className="text-left p-3 rounded-lg border-2 transition-all hover:shadow-md"
                  style={{
                    borderColor: '#204110',
                    backgroundColor: '#ffffff',
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className="font-bold text-sm"
                      style={{ color: '#204110' }}
                    >
                      {st.state}
                    </span>
                    <span className="text-[11px] font-semibold text-gray-600">
                      Explore →
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
                    <div>
                      <span className="text-gray-500 block text-[10px]">
                        Avg / 365d Demand
                      </span>
                      <span className="font-semibold text-gray-900">
                        {st.avg_demand_MU.toFixed(0)} /{' '}
                        {st.recent_365d_mean_MU.toFixed(0)} MU
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500 block text-[10px]">
                        Test R² (Set B / Set A)
                      </span>
                      <span
                        className="font-bold"
                        style={{ color: '#204110' }}
                      >
                        {st.model_r2?.toFixed(3)} / {st.set_a_r2?.toFixed(3)}
                      </span>
                    </div>
                  </div>
                  <div className="mt-1.5 text-[11px] text-gray-600 flex justify-between border-t border-gray-100 pt-1">
                    <span>Test MAPE: {st.mape_pct?.toFixed(2)}%</span>
                    <span>MAE: {st.mae_MU?.toFixed(2)} MU</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Dataset vs GeoJSON State Name Mapping & Unmatched Audit Card */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm text-xs space-y-2.5">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
              <h3 className="font-bold text-sm text-gray-900">
                GeoJSON Boundary &amp; State Name Reconciliation
              </h3>
              <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-semibold text-[11px]">
                {geoMatchAudit.matchedPolygons} / {geoMatchAudit.totalGeoPolygons} Polygons Matched
              </span>
            </div>

            <div>
              <div className="font-semibold text-gray-800 mb-1">
                1. Mapped Legacy GeoJSON State Names → Dataset Names:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(GEOJSON_TO_DATASET_STATE)
                  .filter(([k]) => k !== 'NCT of Delhi' && k !== 'Andaman and Nicobar')
                  .map(([geoName, dsName]) => (
                    <span
                      key={geoName}
                      className="px-2 py-0.5 rounded border text-[11px]"
                      style={{
                        borderColor: '#a0bd85',
                        backgroundColor: '#f8faf7',
                        color: '#204110',
                      }}
                    >
                      GeoJSON &ldquo;{geoName}&rdquo; → Dataset &ldquo;{dsName}&rdquo;
                    </span>
                  ))}
              </div>
            </div>

            <div>
              <div className="font-semibold text-gray-800 mb-1">
                2. Unmatched States / Territories (Shown in Neutral Grey &ldquo;No data&rdquo;):
              </div>
              <ul className="list-disc list-inside space-y-1 text-gray-600">
                {geoMatchAudit.geoWithoutDataset.map((item) => (
                  <li key={item.rawGeoName}>
                    <span className="font-semibold text-gray-800">
                      {item.normalizedName}
                    </span>{' '}
                    (GeoJSON: <code>{item.rawGeoName}</code>) — 100% missing in Zenodo POSOCO demand file; rendered in neutral grey.
                  </li>
                ))}
                {geoMatchAudit.datasetWithoutGeo.map((dsName) => (
                  <li key={dsName}>
                    <span className="font-semibold text-gray-800">{dsName}</span>{' '}
                    — present in dataset (<code>daily.csv</code>), combined within pre-2014{' '}
                    <span className="font-medium">Andhra Pradesh</span> polygon in this GeoJSON.
                  </li>
                ))}
                {metric === 'model_r2' &&
                  geoMatchAudit.missingMetricStates.length > 0 && (
                    <li>
                      <span className="font-semibold text-gray-800">
                        {geoMatchAudit.missingMetricStates.join(', ')}
                      </span>{' '}
                      — present in <code>daily.csv</code> demand history, but excluded from post-2023 Test R² rollout due to incomplete weather/test coverage.
                    </li>
                  )}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
