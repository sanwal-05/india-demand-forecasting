import React, { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  Brush,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fetchPatterns, fetchTrends } from '../api';
import { FOCUS_STATES } from '../theme';

export default function StateExplorerTab({
  selectedState,
  onChangeSelectedState,
}) {
  const [granularity, setGranularity] = useState('week');
  const [startDate, setStartDate] = useState('2019-01-01');
  const [endDate, setEndDate] = useState('2024-04-27');

  // Compare 2 states option
  const [compareMode, setCompareMode] = useState(false);
  const [compareState, setCompareState] = useState('Maharashtra');
  const [compareUnit, setCompareUnit] = useState('MU'); // 'MU' or 'index'

  const [trendsPrimary, setTrendsPrimary] = useState(null);
  const [trendsSecondary, setTrendsSecondary] = useState(null);
  const [patternsPrimary, setPatternsPrimary] = useState(null);
  const [patternsSecondary, setPatternsSecondary] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Ensure compareState is always distinct from selectedState
  useEffect(() => {
    if (compareState === selectedState) {
      const fallback =
        FOCUS_STATES.find((s) => s !== selectedState) || 'Maharashtra';
      setCompareState(fallback);
    }
  }, [selectedState, compareState]);

  // Fetch trends & patterns from FastAPI
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const promises = [
      fetchTrends({
        state: selectedState,
        granularity,
        start: startDate,
        end: endDate,
      }),
      fetchPatterns(selectedState),
    ];

    if (compareMode && compareState) {
      promises.push(
        fetchTrends({
          state: compareState,
          granularity,
          start: startDate,
          end: endDate,
        }),
        fetchPatterns(compareState)
      );
    }

    Promise.all(promises)
      .then(([tr1, pat1, tr2, pat2]) => {
        if (!cancelled) {
          setTrendsPrimary(tr1);
          setPatternsPrimary(pat1);
          setTrendsSecondary(tr2 || null);
          setPatternsSecondary(pat2 || null);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || 'Failed to load State Explorer data');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedState, compareMode, compareState, granularity, startDate, endDate]);

  // Merge primary and optional comparison series by date
  const mergedTrendSeries = useMemo(() => {
    const s1 = trendsPrimary?.series || [];
    if (!compareMode || !trendsSecondary?.series) {
      return s1.map((row) => ({
        date: row.date,
        primary_MU: row.demand_MU,
        trailing_365d_MU: row.trailing_365d_mean_MU,
        primary_index: row.demand_index,
        temp_mean_c: row.temp_mean_c,
      }));
    }

    const map2 = {};
    for (const r2 of trendsSecondary.series) {
      map2[r2.date] = r2;
    }

    return s1.map((r1) => {
      const r2 = map2[r1.date];
      return {
        date: r1.date,
        primary_MU: r1.demand_MU,
        secondary_MU: r2 ? r2.demand_MU : null,
        primary_index: r1.demand_index,
        secondary_index: r2 ? r2.demand_index : null,
      };
    });
  }, [trendsPrimary, trendsSecondary, compareMode]);

  // Monthly pattern data (single or 2-state comparison)
  const monthlyChartData = useMemo(() => {
    const m1 = patternsPrimary?.monthly || [];
    const m2Map = {};
    if (compareMode && patternsSecondary?.monthly) {
      for (const item of patternsSecondary.monthly) {
        m2Map[item.month] = item;
      }
    }
    return m1.map((item) => ({
      ...item,
      secondary_MU: m2Map[item.month]?.mean_demand_MU ?? null,
      secondary_index: m2Map[item.month]?.mean_demand_index ?? null,
    }));
  }, [patternsPrimary, patternsSecondary, compareMode]);

  // Weekday + Official Holiday pattern data
  const weekdayHolidayData = useMemo(() => {
    return (
      patternsPrimary?.weekday_with_holiday ||
      patternsPrimary?.weekday ||
      []
    );
  }, [patternsPrimary]);

  // Temperature vs Demand curve data
  const tempCurveData = useMemo(() => {
    const c1 =
      patternsPrimary?.temperature_vs_demand?.binned_curve || [];
    if (!compareMode || !patternsSecondary?.temperature_vs_demand?.binned_curve) {
      return c1;
    }
    // Align by rounded temperature bin
    const map = new Map();
    for (const pt of c1) {
      const k = Math.round(pt.temp_c * 2) / 2;
      map.set(k, {
        temp_c: pt.temp_c,
        mean_demand_MU: pt.mean_demand_MU,
        mean_demand_index: pt.mean_demand_index,
      });
    }
    for (const pt2 of patternsSecondary.temperature_vs_demand.binned_curve) {
      const k = Math.round(pt2.temp_c * 2) / 2;
      const existing = map.get(k) || { temp_c: pt2.temp_c };
      existing.secondary_MU = pt2.mean_demand_MU;
      existing.secondary_index = pt2.mean_demand_index;
      map.set(k, existing);
    }
    return Array.from(map.values()).sort((a, b) => a.temp_c - b.temp_c);
  }, [patternsPrimary, patternsSecondary, compareMode]);

  const holidayInfo = patternsPrimary?.holiday_summary;
  const tempThresholds =
    patternsPrimary?.temperature_vs_demand?.thresholds || {
      comfort_zone_c: [18.0, 22.0],
      sharp_cooling_rise_threshold_c: 24.5,
      winter_heating_rise_threshold_c: 15.0,
    };

  return (
    <div className="space-y-6">
      {/* 1. Top Control Bar: Focus State Selector, Compare 2 States Toggle, Granularity & Date Filter */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Primary Focus State Selector */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500 mr-1">
              Focus State:
            </span>
            {FOCUS_STATES.map((st) => {
              const active = selectedState === st;
              return (
                <button
                  key={st}
                  onClick={() => onChangeSelectedState(st)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${active
                    ? 'text-white shadow-sm'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  style={
                    active
                      ? { backgroundColor: '#204110', borderColor: '#204110' }
                      : undefined
                  }
                >
                  {st}
                </button>
              );
            })}
          </div>

          {/* Compare 2 States Toggle */}
          <div className="flex flex-wrap items-center gap-2.5">
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-gray-800 cursor-pointer">
              <input
                type="checkbox"
                checked={compareMode}
                onChange={(e) => setCompareMode(e.target.checked)}
                className="rounded border-gray-300"
              />
              Compare 2 States
            </label>

            {compareMode && (
              <>
                <select
                  value={compareState}
                  onChange={(e) => setCompareState(e.target.value)}
                  className="text-xs font-semibold bg-white border rounded-lg px-2.5 py-1.5"
                  style={{ borderColor: '#e10531', color: '#850014' }}
                >
                  {FOCUS_STATES.filter((s) => s !== selectedState).map((s) => (
                    <option key={s} value={s}>
                      vs. {s}
                    </option>
                  ))}
                </select>

                <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden text-xs">
                  <button
                    onClick={() => setCompareUnit('MU')}
                    className={`px-2.5 py-1 font-semibold ${compareUnit === 'MU'
                      ? 'text-white'
                      : 'bg-white text-gray-700'
                      }`}
                    style={
                      compareUnit === 'MU'
                        ? { backgroundColor: '#204110' }
                        : undefined
                    }
                  >
                    Raw MU
                  </button>
                  <button
                    onClick={() => setCompareUnit('index')}
                    className={`px-2.5 py-1 font-semibold ${compareUnit === 'index'
                      ? 'text-white'
                      : 'bg-white text-gray-700'
                      }`}
                    style={
                      compareUnit === 'index'
                        ? { backgroundColor: '#204110' }
                        : undefined
                    }
                  >
                    Normalized Index
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Second Row: Day/Week/Month Toggle + Date Range Filter + Presets */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-gray-100 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-600">Granularity:</span>
            <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
              {[
                { id: 'day', label: 'Day' },
                { id: 'week', label: 'Week' },
                { id: 'month', label: 'Month' },
              ].map((g) => (
                <button
                  key={g.id}
                  onClick={() => setGranularity(g.id)}
                  className={`px-3 py-1.5 font-semibold ${granularity === g.id
                    ? 'text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  style={
                    granularity === g.id
                      ? { backgroundColor: '#204110' }
                      : undefined
                  }
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-gray-600">Date Range:</span>
            <input
              type="date"
              value={startDate}
              min="2014-01-01"
              max={endDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-1 text-gray-800"
            />
            <span className="text-gray-400">to</span>
            <input
              type="date"
              value={endDate}
              min={startDate}
              max="2024-04-28"
              onChange={(e) => setEndDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-1 text-gray-800"
            />

            <div className="flex items-center gap-1 ml-1">
              <button
                onClick={() => {
                  setStartDate('2014-01-08');
                  setEndDate('2024-04-27');
                }}
                className="px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                All (2014–2024)
              </button>
              <button
                onClick={() => {
                  setStartDate('2020-01-01');
                  setEndDate('2021-12-31');
                }}
                className="px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                COVID (2020–21)
              </button>
              <button
                onClick={() => {
                  setStartDate('2023-01-01');
                  setEndDate('2024-04-27');
                }}
                className="px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                Test (2023–24)
              </button>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-sm text-gray-500">
          Loading historical demand trends and seasonal patterns…
        </div>
      ) : error ? (
        <div
          className="bg-white border rounded-xl p-6 text-sm"
          style={{ borderColor: '#e10531', color: '#6b0015' }}
        >
          {error}
        </div>
      ) : (
        <>
          {/* 2. Main Demand Trend Line Chart Card with Zoom Brush */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h2 className="text-base font-bold text-gray-900">
                  {compareMode
                    ? `${selectedState} vs. ${compareState} — Demand Trend`
                    : `${selectedState} — Demand Trend`}
                </h2>
                <p className="text-xs text-gray-500">
                  Drag slider to zoom. {mergedTrendSeries.length.toLocaleString()} {granularity} points.
                </p>
              </div>

              {/* Legend */}
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: '#204110' }}>
                  <span className="w-4 h-0.5 inline-block" style={{ backgroundColor: '#204110', height: '3px' }} />
                  {selectedState}
                </span>
                {compareMode ? (
                  <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: '#e10531' }}>
                    <span className="w-4 h-0.5 inline-block" style={{ backgroundColor: '#e10531', height: '3px' }} />
                    {compareState}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: '#a50727' }}>
                    <span className="w-4 h-0.5 inline-block" style={{ backgroundColor: '#e10531', height: '2px' }} />
                    365-Day Mean
                  </span>
                )}
              </div>
            </div>

            <div className="h-[360px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={mergedTrendSeries}
                  margin={{ top: 10, right: 20, left: 6, bottom: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: '#4b5563' }}
                    minTickGap={36}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#4b5563' }}
                    domain={['auto', 'auto']}
                    label={{
                      value:
                        compareMode && compareUnit === 'index'
                          ? 'Demand Index (Ratio)'
                          : 'Demand (MU)',
                      angle: -90,
                      position: 'insideLeft',
                      style: { fontSize: 11, fill: '#374151' },
                    }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      borderColor: '#d1d5db',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />

                  {compareMode ? (
                    <>
                      <Line
                        type="monotone"
                        dataKey={
                          compareUnit === 'MU' ? 'primary_MU' : 'primary_index'
                        }
                        name={`${selectedState} (${compareUnit})`}
                        stroke="#204110"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey={
                          compareUnit === 'MU'
                            ? 'secondary_MU'
                            : 'secondary_index'
                        }
                        name={`${compareState} (${compareUnit})`}
                        stroke="#e10531"
                        strokeWidth={2}
                        dot={false}
                      />
                    </>
                  ) : (
                    <>
                      <Line
                        type="monotone"
                        dataKey="primary_MU"
                        name={`${selectedState} Actual Demand (MU)`}
                        stroke="#204110"
                        strokeWidth={1.9}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="trailing_365d_MU"
                        name="Trailing 365-Day Mean Level (MU)"
                        stroke="#e10531"
                        strokeWidth={1.6}
                        strokeDasharray="5 3"
                        dot={false}
                      />
                    </>
                  )}

                  <Brush
                    dataKey="date"
                    height={26}
                    stroke="#204110"
                    fill="#f9fafb"
                    travellerWidth={10}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 3. Three Pattern Charts Grid: Monthly Pattern, Weekday & Holiday Pattern, Temperature vs Demand */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Pattern Chart 1: Monthly Seasonal Pattern */}
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-900">
                  1. Monthly Seasonal Pattern
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Average demand by month
                </p>

                <div className="h-[250px] w-full mt-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={monthlyChartData}
                      margin={{ top: 8, right: 10, left: 0, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis
                        dataKey="month_name"
                        tick={{ fontSize: 11, fill: '#4b5563' }}
                      />
                      <YAxis tick={{ fontSize: 11, fill: '#4b5563' }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#ffffff',
                          borderColor: '#d1d5db',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                      />
                      <Bar
                        dataKey="mean_demand_MU"
                        name={`${selectedState} Mean (MU)`}
                        radius={[4, 4, 0, 0]}
                      >
                        {monthlyChartData.map((entry) => {
                          const isPeak = (entry.mean_demand_index || 1) >= 1.04;
                          return (
                            <Cell
                              key={`m-${entry.month}`}
                              fill={isPeak ? '#a50727' : '#375f25'}
                            />
                          );
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-600">
                <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: '#375f25' }}>
                  <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: '#375f25' }} />
                  Moderate
                </span>
                <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: '#a50727' }}>
                  <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: '#a50727' }} />
                  Peak
                </span>
              </div>
            </div>

            {/* Pattern Chart 2: Weekday & Official Holiday Pattern */}
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-900">
                  2. Weekday vs. Sunday & Holiday
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Sunday: {holidayInfo?.sunday_drop_pct ?? '—'}% · Holiday: {holidayInfo?.holiday_drop_pct ?? '—'}%
                </p>

                <div className="h-[250px] w-full mt-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={weekdayHolidayData}
                      margin={{ top: 8, right: 10, left: 0, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis
                        dataKey="day_name"
                        tick={{ fontSize: 10.5, fill: '#4b5563' }}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#4b5563' }}
                        domain={['dataMin - 5', 'dataMax + 3']}
                      />
                      <Tooltip
                        formatter={(val, name, props) => {
                          const pct = props?.payload?.pct_vs_weekday_mean;
                          const suffix =
                            pct !== undefined
                              ? ` (${pct >= 0 ? '+' : ''}${pct}% vs Mon–Fri)`
                              : '';
                          return [`${val} MU${suffix}`, 'Mean Demand'];
                        }}
                        contentStyle={{
                          backgroundColor: '#ffffff',
                          borderColor: '#d1d5db',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                      />
                      <Bar
                        dataKey="mean_demand_MU"
                        name="Mean Demand (MU)"
                        radius={[4, 4, 0, 0]}
                      >
                        {weekdayHolidayData.map((entry) => {
                          const isLow =
                            entry.day_name === 'Sun' ||
                            entry.day_name === 'Holiday' ||
                            entry.is_weekend;
                          return (
                            <Cell
                              key={entry.day_name}
                              fill={
                                entry.day_name === 'Sun' ||
                                  entry.day_name === 'Holiday'
                                  ? '#204110'
                                  : entry.is_weekend
                                    ? '#749764'
                                    : '#a50727'
                              }
                            />
                          );
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-600">
                <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: '#204110' }}>
                  <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: '#204110' }} />
                  Sun & Holiday
                </span>
                <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: '#a50727' }}>
                  <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: '#a50727' }} />
                  Weekday
                </span>
              </div>
            </div>

            {/* Pattern Chart 3: Temperature vs Demand Curve with Threshold */}
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-900">
                  3. Temperature vs. Demand Curve
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Cooling surge above {tempThresholds.sharp_cooling_rise_threshold_c}°C
                </p>

                <div className="h-[250px] w-full mt-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={tempCurveData}
                      margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis
                        dataKey="temp_c"
                        type="number"
                        domain={['dataMin - 1', 'dataMax + 1']}
                        tick={{ fontSize: 11, fill: '#4b5563' }}
                        unit="°C"
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#4b5563' }}
                        domain={['auto', 'auto']}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#ffffff',
                          borderColor: '#d1d5db',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                      />
                      {/* Comfort Band 18-22°C */}
                      <ReferenceArea
                        x1={18}
                        x2={22}
                        fill="#c8d9c2"
                        fillOpacity={0.45}
                      />
                      {/* Sharp Cooling Surge Threshold 24.5°C */}
                      <ReferenceLine
                        x={
                          tempThresholds.sharp_cooling_rise_threshold_c || 24.5
                        }
                        stroke="#e10531"
                        strokeWidth={2}
                        strokeDasharray="4 3"
                        label={{
                          value: '24.5°C Surge',
                          position: 'insideTopRight',
                          fill: '#a50727',
                          fontSize: 10,
                          fontWeight: 700,
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey={
                          compareMode && compareUnit === 'index'
                            ? 'mean_demand_index'
                            : 'mean_demand_MU'
                        }
                        name={`${selectedState} Demand`}
                        stroke="#204110"
                        strokeWidth={2.4}
                        dot={{ r: 3, fill: '#204110' }}
                      />
                      {compareMode && (
                        <Line
                          type="monotone"
                          dataKey={
                            compareUnit === 'index'
                              ? 'secondary_index'
                              : 'secondary_MU'
                          }
                          name={`${compareState} Demand`}
                          stroke="#e10531"
                          strokeWidth={2}
                          dot={{ r: 2.5, fill: '#e10531' }}
                        />
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-600">
                <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: '#204110' }}>
                  <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: '#c8d9c2', border: '1px solid #204110' }} />
                  Green Zone = 18–22°C Comfort Minimum
                </span>
                <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: '#e10531' }}>
                  <span className="w-2.5 h-0.5 inline-block" style={{ backgroundColor: '#e10531', height: '2px' }} />
                  Red Line = 24.5°C Cooling Tipping Point
                </span>
              </div>
            </div>
          </div>
        </>
      )
      }
    </div >
  );
}
