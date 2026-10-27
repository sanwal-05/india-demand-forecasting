import React, { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fetchMapData } from '../api';
import indiaGeoJson from '../data/india_states.json';
import {
  DEMAND_LOW_TO_HIGH_PALETTE,
  FOCUS_STATES,
  getMetricColor,
  NEUTRALS,
  normalizeGeoStateName,
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

  // All-States Demand Section state
  const [demandMetricField, setDemandMetricField] = useState(
    'recent_365d_mean_MU'
  );
  const [stateSearch, setStateSearch] = useState('');

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

  // All states sorted by selected demand metric for the All-India Demand Overview section
  const allStatesRanked = useMemo(() => {
    const list = [...(statesMeta?.states || [])].filter(
      (s) => s[demandMetricField] !== null && s[demandMetricField] !== undefined
    );
    list.sort(
      (a, b) => Number(b[demandMetricField]) - Number(a[demandMetricField])
    );
    return list.map((s, idx) => ({
      ...s,
      rank: idx + 1,
      displayDemand: Number(s[demandMetricField]),
    }));
  }, [statesMeta, demandMetricField]);

  const filteredStatesTable = useMemo(() => {
    const q = stateSearch.trim().toLowerCase();
    if (!q) return allStatesRanked;
    return allStatesRanked.filter((s) => s.state.toLowerCase().includes(q));
  }, [allStatesRanked, stateSearch]);

  // Compute GeoJSON vs Dataset state matching audit dynamically
  const geoMatchAudit = useMemo(() => {
    const datasetNames = new Set(
      (statesMeta?.states || []).map((s) => s.state)
    );
    const geoFeatures = indiaGeoJson.features || [];
    const normalizedGeoSet = new Set(
      geoFeatures.map(
        (f) =>
          f.properties?.STATE ||
          normalizeGeoStateName(f.properties?.NAME_1 || '')
      )
    );

    const geoWithoutDataset = [];
    for (const f of geoFeatures) {
      const raw = f.properties?.NAME_1 || '';
      const norm = f.properties?.STATE || normalizeGeoStateName(raw);
      if (!datasetNames.has(norm)) {
        geoWithoutDataset.push({ rawGeoName: raw, normalizedName: norm });
      }
    }

    const datasetWithoutGeo = [];
    for (const dName of datasetNames) {
      if (!normalizedGeoSet.has(dName)) {
        datasetWithoutGeo.push(dName);
      }
    }

    return {
      totalGeoPolygons: geoFeatures.length,
      matchedPolygons: geoFeatures.length - geoWithoutDataset.length,
      geoWithoutDataset,
      datasetWithoutGeo,
    };
  }, [statesMeta]);

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
            {kpiStats.totalStates}
          </div>
          <div className="mt-1 text-xs text-gray-600">
            {kpiStats.focusCount} Focus · {kpiStats.modeledCount} Modeled
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Date Range
          </div>
          <div
            className="mt-1 text-xl font-bold"
            style={{ color: '#204110' }}
          >
            2014 – 2024
          </div>
          <div className="mt-1 text-xs text-gray-600">
            Train: ≤2021 · Val: 2022 · Test: 2023–24
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Best Model
          </div>
          <div
            className="mt-1 text-2xl font-bold"
            style={{ color: '#204110' }}
          >
            {bestModelName || 'LightGBM'}
          </div>
          <div className="mt-1 text-xs text-gray-600">
            5-fold TimeSeriesSplit CV
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Avg Test R² (4 Focus)
          </div>
          <div
            className="mt-1 text-2xl font-bold"
            style={{ color: '#204110' }}
          >
            {kpiStats.avgFocusSetAR2 !== null
              ? kpiStats.avgFocusSetAR2.toFixed(3)
              : '—'}{' '}
            <span className="text-sm font-medium text-gray-600">(Set A)</span>
          </div>
          <div className="mt-1 text-xs text-gray-600">
            Set B R²:{' '}
            <span className="font-semibold text-gray-800">
              {kpiStats.avgFocusR2 !== null
                ? kpiStats.avgFocusR2.toFixed(3)
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
                  Interactive India Grid Map
                </h2>
                <p className="text-xs text-gray-600 mt-0.5">
                  Click{' '}
                  <span
                    className="font-semibold"
                    style={{ color: '#204110' }}
                  >
                    Focus States (bold outline)
                  </span>{' '}
                  to explore details.
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
                    Average Demand (MU)
                  </option>
                  <option value="vs_typical">
                    Demand vs Typical (%)
                  </option>
                  <option value="model_r2">
                    Model Test R²
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
                    ■ Low Demand
                  </span>
                  <span style={{ color: '#6b0015' }}>
                    ■ High Demand
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
                    ■ Below Typical
                  </span>
                  <span style={{ color: '#6b0015' }}>
                    ■ Above Typical
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
                    ■ Lower R²
                  </span>
                  <span style={{ color: '#204110' }}>
                    ■ Higher R²
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
                Focus States
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block w-3.5 h-3.5 rounded-sm border"
                  style={{
                    borderColor: '#6b7280',
                    backgroundColor: '#c8d9c2',
                    opacity: 0.65,
                  }}
                />
                Other States
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block w-3.5 h-3.5 rounded-sm border border-gray-300"
                  style={{ backgroundColor: NEUTRALS.noDataFill }}
                />
                No Data
              </span>
            </div>

            {/* Required Map Boundary Disclaimer */}
            <p className="text-[11px] text-gray-500 italic pt-1 border-t border-gray-100">
              Note: J&amp;K and Ladakh are combined in this dataset and map
              boundaries are illustrative.
            </p>
          </div>
        </div>

        {/* Right 5 Cols: Focus States Cards + Clicked Non-Focus State Card + GeoJSON Mapping Audit */}
        <div className="lg:col-span-5 space-y-5">
          {/* Selected Non-Focus State Summary Card */}
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
                      {clickedStateSummary.recent_365d_mean_MU.toFixed(1)}{' '}
                      MU/day
                    </div>
                    <div className="text-[11px] text-gray-500">
                      {clickedStateSummary.n_days.toLocaleString()} daily
                      records
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
                      {clickedStateMapInfo &&
                        clickedStateMapInfo.value !== null
                        ? `${clickedStateMapInfo.value} ${mapPayload?.unit || ''
                        }`
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
                <strong>Note:</strong> Full weather-coupled pattern charts,
                model comparisons, and What-If simulations are available for our
                4 focus states (
                {FOCUS_STATES.map((fs, i) => (
                  <React.Fragment key={fs}>
                    {i > 0 && ', '}
                    <button
                      onClick={() => onOpenStateExplorer(fs)}
                      className="underline font-semibold"
                    >
                      {fs}
                    </button>
                  </React.Fragment>
                ))}
                ).
              </div>
            </div>
          )}

          {/* 4 Focus States Deep-Dive Directory Card */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <div className="mb-4">
              <h3 className="text-sm font-bold text-gray-900">
                4 Focus States
              </h3>
              <p className="text-xs text-gray-500">
                Click to explore details
              </p>
            </div>

            <div className="space-y-3">
              {kpiStats.focusList.map((st) => (
                <button
                  key={st.state}
                  onClick={() => onOpenStateExplorer(st.state)}
                  className="w-full text-left p-4 rounded-lg border-2 transition-all hover:shadow-md"
                  style={{
                    borderColor: '#204110',
                    backgroundColor: '#ffffff',
                  }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span
                      className="font-bold text-base"
                      style={{ color: '#204110' }}
                    >
                      {st.state}
                    </span>
                    <span className="text-xs font-semibold text-gray-600">
                      Explore →
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div>
                      <span className="text-gray-500 block text-[10px] mb-1">
                        Avg Demand
                      </span>
                      <span className="font-semibold text-gray-900 text-sm">
                        {st.avg_demand_MU.toFixed(0)} MU
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500 block text-[10px] mb-1">
                        Test R² (A / B)
                      </span>
                      <span className="font-bold text-sm" style={{ color: '#204110' }}>
                        {st.set_a_r2?.toFixed(3)} / {st.model_r2?.toFixed(3)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500 block text-[10px] mb-1">
                        MAPE
                      </span>
                      <span className="font-semibold text-gray-900 text-sm">
                        {st.mape_pct?.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Dataset vs GeoJSON State Name Mapping & Unmatched Audit Card */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm text-xs space-y-2">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
              <h3 className="font-bold text-sm text-gray-900">
                Map Coverage
              </h3>
              <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-semibold text-[11px]">
                {geoMatchAudit.matchedPolygons} /{' '}
                {geoMatchAudit.totalGeoPolygons} Matched
              </span>
            </div>

            <div>
              <p className="text-gray-600 leading-relaxed">
                J&K and Ladakh combined. Small UTs without mainland polygons shown in table below.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 3. ALL-INDIA ELECTRICITY DEMAND OVERVIEW (ALL 36 STATES & UTs) */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-gray-200">
          <div>
            <h2 className="text-base font-bold text-gray-900">
              All-India Daily Electricity Demand — All {allStatesRanked.length}{' '}
              States &amp; UTs
            </h2>
            <p className="text-xs text-gray-600 mt-0.5">
              Compare demand across all states and UTs.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-semibold text-gray-700">
              Metric:
            </label>
            <select
              value={demandMetricField}
              onChange={(e) => setDemandMetricField(e.target.value)}
              className="text-xs font-medium bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-gray-800"
            >
              <option value="recent_365d_mean_MU">
                Recent 365-Day Mean
              </option>
              <option value="avg_demand_MU">
                Historical Average
              </option>
              <option value="max_demand_MU">
                Historical Peak
              </option>
            </select>
          </div>
        </div>

        {/* All-States Demand Bar Chart */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2 text-xs">
            <span className="font-semibold text-gray-700">
              Demand Ranking
            </span>
            <div className="flex items-center gap-4">
              <span
                className="inline-flex items-center gap-1.5 font-semibold"
                style={{ color: '#204110' }}
              >
                <span
                  className="w-3 h-3 rounded-sm inline-block"
                  style={{ backgroundColor: '#204110' }}
                />
                Green = Lower Demand (MU)
              </span>
              <span
                className="inline-flex items-center gap-1.5 font-semibold"
                style={{ color: '#6b0015' }}
              >
                <span
                  className="w-3 h-3 rounded-sm inline-block"
                  style={{ backgroundColor: '#6b0015' }}
                />
                Red = Higher Demand (MU)
              </span>
            </div>
          </div>

          <div className="h-[340px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={allStatesRanked}
                margin={{ top: 10, right: 16, left: 8, bottom: 78 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="state"
                  interval={0}
                  angle={-42}
                  textAnchor="end"
                  height={82}
                  tick={({ x, y, payload }) => {
                    const isFoc = FOCUS_STATES.includes(payload.value);
                    return (
                      <text
                        x={x}
                        y={y + 4}
                        textAnchor="end"
                        transform={`rotate(-42, ${x}, ${y + 4})`}
                        fontSize={isFoc ? 11 : 10}
                        fontWeight={isFoc ? 800 : 500}
                        fill={isFoc ? '#204110' : '#374151'}
                      >
                        {isFoc ? `${payload.value} ★` : payload.value}
                      </text>
                    );
                  }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#4b5563' }}
                  label={{
                    value: 'Demand (MU / day)',
                    angle: -90,
                    position: 'insideLeft',
                    style: { fontSize: 11, fill: '#374151' },
                  }}
                />
                <Tooltip
                  formatter={(val) => [`${Number(val).toFixed(1)} MU/day`, 'Demand']}
                  labelFormatter={(label) =>
                    FOCUS_STATES.includes(label)
                      ? `${label} ★ (Focus State)`
                      : label
                  }
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    borderColor: '#d1d5db',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Bar
                  dataKey="displayDemand"
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                  className="cursor-pointer"
                  onClick={(barData) => {
                    if (!barData?.state) return;
                    handleSelectStateOnMap(barData.state, Boolean(barData.is_focus));
                  }}
                >
                  {allStatesRanked.map((entry) => {
                    const maxD = allStatesRanked[0]?.displayDemand || 560;
                    const minD =
                      allStatesRanked[allStatesRanked.length - 1]
                        ?.displayDemand || 1;
                    const fillHex = getMetricColor(
                      'avg_demand',
                      entry.displayDemand,
                      minD,
                      maxD
                    );
                    return (
                      <Cell
                        key={entry.state}
                        fill={fillHex}
                        stroke={entry.is_focus ? '#204110' : 'none'}
                        strokeWidth={entry.is_focus ? 2 : 0}
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Searchable Table of All 36 States & UTs */}
        <div className="pt-2">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">
              All {allStatesRanked.length} States &amp; UTs Demand Directory
            </h3>
            <input
              type="text"
              value={stateSearch}
              onChange={(e) => setStateSearch(e.target.value)}
              placeholder="Filter state name (e.g., Gujarat, Tamil Nadu)..."
              className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 w-64 focus:outline-none focus:border-gray-500"
            />
          </div>

          <div className="max-h-[340px] overflow-y-auto border border-gray-200 rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-gray-50 sticky top-0 border-b border-gray-200 text-gray-600 uppercase text-[10px]">
                <tr>
                  <th className="py-2.5 px-3 font-bold">Rank</th>
                  <th className="py-2.5 px-3 font-bold">State / UT</th>
                  <th className="py-2.5 px-3 font-bold">Role</th>
                  <th className="py-2.5 px-3 font-bold text-right">
                    Recent 365d Mean (MU)
                  </th>
                  <th className="py-2.5 px-3 font-bold text-right">
                    10-Yr Avg (MU)
                  </th>
                  <th className="py-2.5 px-3 font-bold text-right">
                    Min – Max (MU)
                  </th>
                  <th className="py-2.5 px-3 font-bold text-right">
                    Model Test R²
                  </th>
                  <th className="py-2.5 px-3 font-bold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredStatesTable.map((st) => (
                  <tr
                    key={st.state}
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                    style={
                      st.is_focus
                        ? { backgroundColor: '#f8faf7' }
                        : clickedOtherState === st.state
                          ? { backgroundColor: '#fef2f2' }
                          : undefined
                    }
                    onClick={() =>
                      handleSelectStateOnMap(st.state, Boolean(st.is_focus))
                    }
                  >
                    <td className="py-2 px-3 font-semibold text-gray-500">
                      #{st.rank}
                    </td>
                    <td className="py-2 px-3 font-bold text-gray-900">
                      {st.state} {st.is_focus && '★'}
                    </td>
                    <td className="py-2 px-3">
                      {st.is_focus ? (
                        <span
                          className="px-2 py-0.5 rounded text-[10px] font-semibold text-white"
                          style={{ backgroundColor: '#204110' }}
                        >
                          Focus State
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
                          National Grid
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-gray-900">
                      {st.recent_365d_mean_MU.toFixed(1)} MU
                    </td>
                    <td className="py-2 px-3 text-right font-medium text-gray-700">
                      {st.avg_demand_MU.toFixed(1)} MU
                    </td>
                    <td className="py-2 px-3 text-right text-gray-500">
                      {st.min_demand_MU.toFixed(1)} –{' '}
                      {st.max_demand_MU.toFixed(1)} MU
                    </td>
                    <td
                      className="py-2 px-3 text-right font-semibold"
                      style={{
                        color:
                          st.model_r2 === null || st.model_r2 === undefined
                            ? '#6b7280'
                            : st.model_r2 >= 0.85
                              ? '#204110'
                              : '#850014',
                      }}
                    >
                      {st.model_r2 !== null && st.model_r2 !== undefined
                        ? st.model_r2.toFixed(3)
                        : '—'}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {st.is_focus ? (
                        <span
                          className="font-semibold underline"
                          style={{ color: '#204110' }}
                        >
                          Explore →
                        </span>
                      ) : (
                        <span className="text-gray-600 font-medium underline">
                          Select on Map
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
