import React, { useEffect, useState } from 'react';
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fetchClimatology, runSimulation } from '../api';
import { DEMAND_LOW_TO_HIGH_PALETTE, FOCUS_STATES } from '../theme';

const MONTHS = [
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

const DAYS_OF_WEEK = [
  { value: 0, label: 'Monday' },
  { value: 1, label: 'Tuesday' },
  { value: 2, label: 'Wednesday' },
  { value: 3, label: 'Thursday' },
  { value: 4, label: 'Friday' },
  { value: 5, label: 'Saturday' },
  { value: 6, label: 'Sunday' },
];

/**
 * SVG Semicircle Gauge with 10 Green-to-Red segments, a needle,
 * predicted MU in the center, and percentage difference below.
 */
function SemicircleGauge({ predictedMU, typicalMU, percentDiff }) {
  const cx = 160;
  const cy = 140;
  const rOuter = 116;
  const rInner = 82;
  const rMid = (rOuter + rInner) / 2;
  const strokeWidth = rOuter - rInner;

  // Map percentDiff in [-25%, +25%] -> angle in [-90 deg (left), +90 deg (right)]
  const clampedPct = Math.max(-25, Math.min(25, Number(percentDiff || 0)));
  const needleAngleDeg = (clampedPct / 25) * 90;
  const needleRad = ((needleAngleDeg - 90) * Math.PI) / 180;
  const needleLen = rInner - 8;
  const nx = cx + needleLen * Math.cos(needleRad);
  const ny = cy + needleLen * Math.sin(needleRad);

  // Build 10 arc segments from 180 deg (left) to 0 deg (right)
  const segments = DEMAND_LOW_TO_HIGH_PALETTE.map((color, idx) => {
    const startDeg = 180 - idx * 18;
    const endDeg = 180 - (idx + 1) * 18;
    const startRad = (startDeg * Math.PI) / 180;
    const endRad = (endDeg * Math.PI) / 180;

    const x1 = cx + rMid * Math.cos(startRad);
    const y1 = cy - rMid * Math.sin(startRad);
    const x2 = cx + rMid * Math.cos(endRad);
    const y2 = cy - rMid * Math.sin(endRad);

    return {
      color,
      d: `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${rMid} ${rMid} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`,
    };
  });

  const isAbove = Number(percentDiff || 0) > 0.4;
  const isBelow = Number(percentDiff || 0) < -0.4;
  const badgeColor = isAbove ? '#a50727' : '#204110';

  return (
    <div className="flex flex-col items-center">
      <svg
        viewBox="0 0 320 185"
        className="w-full max-w-[320px] h-auto overflow-visible"
        role="img"
        aria-label="Semicircle Demand Gauge"
      >
        {/* 10 Green-to-Red Segments */}
        {segments.map((seg, idx) => (
          <path
            key={seg.color + idx}
            d={seg.d}
            fill="none"
            stroke={seg.color}
            strokeWidth={strokeWidth}
            strokeLinecap="butt"
          />
        ))}

        {/* Scale Labels (-25%, Typical 0%, +25%) */}
        <text
          x={cx - rOuter - 4}
          y={cy + 14}
          textAnchor="middle"
          fontSize="10"
          fontWeight="600"
          fill="#204110"
        >
          -25%
        </text>
        <text
          x={cx}
          y={cy - rOuter - 8}
          textAnchor="middle"
          fontSize="10"
          fontWeight="700"
          fill="#374151"
        >
          Typical (0%)
        </text>
        <text
          x={cx + rOuter + 4}
          y={cy + 14}
          textAnchor="middle"
          fontSize="10"
          fontWeight="600"
          fill="#6b0015"
        >
          +25%
        </text>

        {/* Needle */}
        <line
          x1={cx}
          y1={cy - 28}
          x2={nx}
          y2={ny}
          stroke={badgeColor}
          strokeWidth="3.2"
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy - 28} r="5" fill={badgeColor} />

        {/* Predicted MU in the Centre */}
        <text
          x={cx}
          y={cy - 2}
          textAnchor="middle"
          fontSize="22"
          fontWeight="800"
          fill="#1f2937"
        >
          {predictedMU !== undefined ? `${Number(predictedMU).toFixed(1)} MU` : '—'}
        </text>
        <text
          x={cx}
          y={cy + 15}
          textAnchor="middle"
          fontSize="10.5"
          fontWeight="600"
          fill="#6b7280"
        >
          vs. {typicalMU !== undefined ? `${Number(typicalMU).toFixed(1)} MU` : '—'} typical
        </text>
      </svg>

      {/* Percentage Label Below */}
      <div
        className="mt-1 px-3 py-1 rounded-full text-xs font-bold text-white"
        style={{ backgroundColor: badgeColor }}
      >
        {percentDiff !== undefined
          ? `${Number(percentDiff) >= 0 ? '+' : ''}${Number(percentDiff).toFixed(1)}% ${isAbove
            ? 'Above Typical'
            : isBelow
              ? 'Below Typical'
              : 'At Typical Baseline'
          }`
          : '—'}
      </div>

      {/* Gauge Legend */}
      <div className="mt-2.5 flex items-center gap-4 text-[11px] text-gray-600">
        <span className="inline-flex items-center gap-1 font-semibold" style={{ color: '#204110' }}>
          <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: '#204110' }} />
          Green = Below / Normal Load
        </span>
        <span className="inline-flex items-center gap-1 font-semibold" style={{ color: '#a50727' }}>
          <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: '#e10531' }} />
          Red = Above Typical / Heat Stress
        </span>
      </div>
    </div>
  );
}

export default function SimulatorTab({
  selectedState,
  onChangeSelectedState,
}) {
  const initParams = new URLSearchParams(window.location.search);
  const initMonth = Number(initParams.get('month')) || 6;
  const initDow = initParams.get('dow') !== null ? Number(initParams.get('dow')) : 2;
  const initHoliday = initParams.get('holiday') !== null ? Number(initParams.get('holiday')) : 0;
  const initPreset = initParams.get('preset') || 'typical';

  const [month, setMonth] = useState(initMonth >= 1 && initMonth <= 12 ? initMonth : 6);
  const [dayOfWeek, setDayOfWeek] = useState(initDow >= 0 && initDow <= 6 ? initDow : 2); // Wednesday
  const [isHoliday, setIsHoliday] = useState(initHoliday === 1 ? 1 : 0);
  const [activePreset, setActivePreset] = useState(
    ['typical', 'heatwave', 'cool_cloudy'].includes(initPreset) ? initPreset : 'typical'
  );

  // Climatology & historical slider ranges for the selected state
  const [climData, setClimData] = useState(null);
  const [loadingClim, setLoadingClim] = useState(true);

  // Weather slider values
  const [tempMean, setTempMean] = useState(33.3);
  const [tempMin, setTempMin] = useState(28.0);
  const [dewpoint, setDewpoint] = useState(20.5);
  const [cloudCover, setCloudCover] = useState(0.3);
  const [tempRoll7, setTempRoll7] = useState(33.5);
  const [tempRoll30, setTempRoll30] = useState(33.1);

  // Simulation result from POST /api/simulate
  const [simResult, setSimResult] = useState(null);
  const [loadingSim, setLoadingSim] = useState(false);
  const [simError, setSimError] = useState(null);

  // 1. Load climatology & slider bounds when selectedState changes
  useEffect(() => {
    let cancelled = false;
    setLoadingClim(true);

    fetchClimatology(selectedState)
      .then((res) => {
        if (cancelled) return;
        setClimData(res);
        const mInfo = res.months?.[month] || res.months?.[String(month)];
        const presetToUse = mInfo?.presets?.[activePreset]
          ? activePreset
          : 'typical';
        if (mInfo?.presets?.[presetToUse]) {
          const p = mInfo.presets[presetToUse];
          setTempMean(p.temp_mean_c);
          setTempMin(p.temp_min_c);
          setDewpoint(p.dewpoint_mean_c);
          setCloudCover(p.cloud_mean);
          setTempRoll7(p.temp_roll7_mean);
          setTempRoll30(p.temp_roll30_mean);
          setActivePreset(presetToUse);
        }
        setLoadingClim(false);
      })
      .catch((err) => {
        if (!cancelled) {
          setSimError(err.message || 'Failed to load state climatology');
          setLoadingClim(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedState]);

  // Apply a data-driven preset ('typical', 'heatwave', 'cool_cloudy') for the current state and month
  const applyPreset = (presetKey, targetMonth = month, cData = climData) => {
    if (!cData) return;
    const mInfo =
      cData.months?.[targetMonth] || cData.months?.[String(targetMonth)];
    const preset = mInfo?.presets?.[presetKey];
    if (!preset) return;

    setTempMean(preset.temp_mean_c);
    setTempMin(preset.temp_min_c);
    setDewpoint(preset.dewpoint_mean_c);
    setCloudCover(preset.cloud_mean);
    setTempRoll7(preset.temp_roll7_mean);
    setTempRoll30(preset.temp_roll30_mean);
    setActivePreset(presetKey);
  };

  const handleMonthChange = (newMonth) => {
    const m = Number(newMonth);
    setMonth(m);
    applyPreset(activePreset || 'typical', m, climData);
  };

  // 2. Run POST /api/simulate automatically whenever any input changes
  useEffect(() => {
    if (loadingClim || !climData) return;
    let cancelled = false;
    setLoadingSim(true);
    setSimError(null);

    runSimulation({
      state: selectedState,
      month,
      day_of_week: dayOfWeek,
      is_holiday: isHoliday,
      temp_mean_c: Number(tempMean),
      temp_min_c: Number(tempMin),
      dewpoint_mean_c: Number(dewpoint),
      cloud_mean: Number(cloudCover),
      temp_roll7_mean: Number(tempRoll7),
      temp_roll30_mean: Number(tempRoll30),
    })
      .then((res) => {
        if (!cancelled) {
          setSimResult(res);
          setLoadingSim(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setSimError(err.message || 'Simulation request failed');
          setLoadingSim(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    selectedState,
    month,
    dayOfWeek,
    isHoliday,
    tempMean,
    tempMin,
    dewpoint,
    cloudCover,
    tempRoll7,
    tempRoll30,
    loadingClim,
    climData,
  ]);

  const ranges = climData?.ranges || {
    temp_mean_c: { min: 5, max: 42, step: 0.5 },
    temp_min_c: { min: 2, max: 35, step: 0.5 },
    dewpoint_mean_c: { min: -2, max: 28, step: 0.5 },
    cloud_mean: { min: 0, max: 1, step: 0.02 },
    temp_roll7_mean: { min: 6, max: 40, step: 0.5 },
    temp_roll30_mean: { min: 8, max: 38, step: 0.5 },
  };

  const currentMonthClim =
    climData?.months?.[month] || climData?.months?.[String(month)];

  return (
    <div className="space-y-5">
      {/* Header Banner with Title and Required Note */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">
            What-If Demand Simulator
          </h2>
          <p className="text-xs text-gray-600 mt-0.5 font-medium">
            Scenario estimates based on historical weather patterns.
          </p>
        </div>

        {/* Data-Driven Preset Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-500 mr-1">
            Data Presets:
          </span>
          <button
            onClick={() => applyPreset('typical')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${activePreset === 'typical'
              ? 'text-white'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            style={
              activePreset === 'typical'
                ? { backgroundColor: '#204110', borderColor: '#204110' }
                : undefined
            }
          >
            Typical
          </button>
          <button
            onClick={() => applyPreset('heatwave')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${activePreset === 'heatwave'
              ? 'text-white'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            style={
              activePreset === 'heatwave'
                ? { backgroundColor: '#a50727', borderColor: '#a50727' }
                : undefined
            }
          >
            Heatwave
          </button>
          <button
            onClick={() => applyPreset('cool_cloudy')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${activePreset === 'cool_cloudy'
              ? 'text-white'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            style={
              activePreset === 'cool_cloudy'
                ? { backgroundColor: '#375f25', borderColor: '#375f25' }
                : undefined
            }
          >
            Cool & Cloudy
          </button>
        </div>
      </div>

      {/* Main Two-Panel Grid: Left Panel (Inputs) & Right Panel (Results) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT PANEL (Inputs - 5 Cols) */}
        <div className="lg:col-span-5 bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-5">
          {/* 1. State, Month, Day of Week, Holiday Toggle */}
          <div className="space-y-3 pb-4 border-b border-gray-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">
              1. Grid State &amp; Calendar Context
            </h3>

            {/* Focus State Buttons */}
            <div className="grid grid-cols-2 gap-2">
              {FOCUS_STATES.map((st) => {
                const active = selectedState === st;
                return (
                  <button
                    key={st}
                    onClick={() => onChangeSelectedState(st)}
                    className={`py-1.5 px-3 rounded-lg text-xs font-semibold border text-center transition-colors ${active
                      ? 'text-white'
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

            {/* Month, Day of Week, Holiday */}
            <div className="grid grid-cols-2 gap-3 pt-1 text-xs">
              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  Month
                </label>
                <select
                  value={month}
                  onChange={(e) => handleMonthChange(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white text-gray-800 font-medium"
                >
                  {MONTHS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  Day of Week
                </label>
                <select
                  value={dayOfWeek}
                  onChange={(e) => setDayOfWeek(Number(e.target.value))}
                  className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white text-gray-800 font-medium"
                >
                  {DAYS_OF_WEEK.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1 text-xs">
              <span className="font-semibold text-gray-700">
                Official State Holiday:
              </span>
              <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
                <button
                  onClick={() => setIsHoliday(0)}
                  className={`px-3 py-1 font-semibold ${isHoliday === 0
                    ? 'text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  style={
                    isHoliday === 0
                      ? { backgroundColor: '#204110' }
                      : undefined
                  }
                >
                  No (Regular Day)
                </button>
                <button
                  onClick={() => setIsHoliday(1)}
                  className={`px-3 py-1 font-semibold ${isHoliday === 1
                    ? 'text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  style={
                    isHoliday === 1
                      ? { backgroundColor: '#a50727' }
                      : undefined
                  }
                >
                  Yes (Holiday)
                </button>
              </div>
            </div>
          </div>

          {/* 2. Today's Weather Sliders */}
          <div className="space-y-3.5 pb-4 border-b border-gray-100 text-xs">
            <div className="flex items-center justify-between">
              <h3 className="font-bold uppercase tracking-wider text-gray-500">
                2. Today&apos;s Weather Inputs
              </h3>
              {currentMonthClim && (
                <span className="text-[11px] text-gray-500">
                  {currentMonthClim.month_name} p05–p95:{' '}
                  {Number(currentMonthClim.climatology.temp_p05_c).toFixed(1)}°C
                  –{' '}
                  {Number(currentMonthClim.climatology.temp_p95_c).toFixed(1)}°C
                </span>
              )}
            </div>

            {/* Mean Temperature */}
            <div>
              <div className="flex justify-between font-semibold mb-1">
                <span className="text-gray-700">Mean Temperature</span>
                <span style={{ color: tempMean >= 25 ? '#a50727' : '#204110' }}>
                  {Number(tempMean).toFixed(1)} °C
                </span>
              </div>
              <input
                type="range"
                min={ranges.temp_mean_c.min}
                max={ranges.temp_mean_c.max}
                step={ranges.temp_mean_c.step}
                value={tempMean}
                onChange={(e) => {
                  setTempMean(Number(e.target.value));
                  setActivePreset('custom');
                }}
                className="w-full accent-[#204110] cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-gray-400">
                <span>Min: {ranges.temp_mean_c.min}°C</span>
                <span>Max: {ranges.temp_mean_c.max}°C</span>
              </div>
            </div>

            {/* Overnight Minimum Temperature */}
            <div>
              <div className="flex justify-between font-semibold mb-1">
                <span className="text-gray-700">Overnight Minimum Temp</span>
                <span style={{ color: tempMin >= 24 ? '#a50727' : '#204110' }}>
                  {Number(tempMin).toFixed(1)} °C
                </span>
              </div>
              <input
                type="range"
                min={ranges.temp_min_c.min}
                max={ranges.temp_min_c.max}
                step={ranges.temp_min_c.step}
                value={tempMin}
                onChange={(e) => {
                  setTempMin(Number(e.target.value));
                  setActivePreset('custom');
                }}
                className="w-full accent-[#204110] cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-gray-400">
                <span>Min: {ranges.temp_min_c.min}°C</span>
                <span>Max: {ranges.temp_min_c.max}°C</span>
              </div>
            </div>

            {/* Dewpoint */}
            <div>
              <div className="flex justify-between font-semibold mb-1">
                <span className="text-gray-700">Dewpoint (Humidity Proxy)</span>
                <span className="text-gray-900">
                  {Number(dewpoint).toFixed(1)} °C
                </span>
              </div>
              <input
                type="range"
                min={ranges.dewpoint_mean_c.min}
                max={ranges.dewpoint_mean_c.max}
                step={ranges.dewpoint_mean_c.step}
                value={dewpoint}
                onChange={(e) => {
                  setDewpoint(Number(e.target.value));
                  setActivePreset('custom');
                }}
                className="w-full accent-[#204110] cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-gray-400">
                <span>Min: {ranges.dewpoint_mean_c.min}°C</span>
                <span>Max: {ranges.dewpoint_mean_c.max}°C</span>
              </div>
            </div>

            {/* Cloud Cover */}
            <div>
              <div className="flex justify-between font-semibold mb-1">
                <span className="text-gray-700">Cloud Cover (0–1)</span>
                <span className="text-gray-900">
                  {Number(cloudCover).toFixed(2)} (
                  {Math.round(Number(cloudCover) * 100)}%)
                </span>
              </div>
              <input
                type="range"
                min={ranges.cloud_mean.min}
                max={ranges.cloud_mean.max}
                step={ranges.cloud_mean.step}
                value={cloudCover}
                onChange={(e) => {
                  setCloudCover(Number(e.target.value));
                  setActivePreset('custom');
                }}
                className="w-full accent-[#204110] cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-gray-400">
                <span>0.0 (Clear Sky)</span>
                <span>1.0 (Overcast)</span>
              </div>
            </div>
          </div>

          {/* 3. Recent Weather Sliders (7-Day & 30-Day Heat Build-Up) */}
          <div className="space-y-3.5 text-xs">
            <h3 className="font-bold uppercase tracking-wider text-gray-500">
              3. Recent Weather (Multi-Day Heat Build-Up)
            </h3>

            {/* 7-Day Mean Temperature */}
            <div>
              <div className="flex justify-between font-semibold mb-1">
                <span className="text-gray-700">7-Day Mean Temperature</span>
                <span
                  style={{ color: tempRoll7 >= 28 ? '#a50727' : '#204110' }}
                >
                  {Number(tempRoll7).toFixed(1)} °C
                </span>
              </div>
              <input
                type="range"
                min={ranges.temp_roll7_mean.min}
                max={ranges.temp_roll7_mean.max}
                step={ranges.temp_roll7_mean.step}
                value={tempRoll7}
                onChange={(e) => {
                  setTempRoll7(Number(e.target.value));
                  setActivePreset('custom');
                }}
                className="w-full accent-[#204110] cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-gray-400">
                <span>Min: {ranges.temp_roll7_mean.min}°C</span>
                <span>Max: {ranges.temp_roll7_mean.max}°C</span>
              </div>
            </div>

            {/* 30-Day Mean Temperature */}
            <div>
              <div className="flex justify-between font-semibold mb-1">
                <span className="text-gray-700">30-Day Mean Temperature</span>
                <span
                  style={{ color: tempRoll30 >= 28 ? '#a50727' : '#204110' }}
                >
                  {Number(tempRoll30).toFixed(1)} °C
                </span>
              </div>
              <input
                type="range"
                min={ranges.temp_roll30_mean.min}
                max={ranges.temp_roll30_mean.max}
                step={ranges.temp_roll30_mean.step}
                value={tempRoll30}
                onChange={(e) => {
                  setTempRoll30(Number(e.target.value));
                  setActivePreset('custom');
                }}
                className="w-full accent-[#204110] cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-gray-400">
                <span>Min: {ranges.temp_roll30_mean.min}°C</span>
                <span>Max: {ranges.temp_roll30_mean.max}°C</span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL (Results - 7 Cols) */}
        <div className="lg:col-span-7 space-y-5">
          {simError ? (
            <div
              className="bg-white border rounded-xl p-6 text-sm"
              style={{ borderColor: '#e10531', color: '#6b0015' }}
            >
              {simError}
            </div>
          ) : (
            <>
              {/* Top Row: Semicircle Gauge + 3 KPI Cards */}
              <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
                  {/* Semicircle Gauge (6 Cols) */}
                  <div className="md:col-span-6 border-b md:border-b-0 md:border-r border-gray-100 pb-4 md:pb-0 md:pr-4">
                    <SemicircleGauge
                      predictedMU={simResult?.predicted_MU}
                      typicalMU={simResult?.typical_MU}
                      percentDiff={simResult?.percent_difference}
                    />
                  </div>

                  {/* 3 Cards: Predicted MU, Typical MU, Difference % (6 Cols) */}
                  <div className="md:col-span-6 space-y-3">
                    <div className="p-3.5 rounded-xl border border-gray-200 bg-white">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                        Predicted Demand (MU)
                      </div>
                      <div
                        className="text-2xl font-extrabold mt-0.5"
                        style={{
                          color:
                            (simResult?.percent_difference || 0) > 0.4
                              ? '#a50727'
                              : '#204110',
                        }}
                      >
                        {simResult?.predicted_MU !== undefined
                          ? `${simResult.predicted_MU.toFixed(2)} MU`
                          : '—'}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        Demand Index: {simResult?.predicted_demand_index ?? '—'}{' '}
                        × Level {simResult?.level_mu?.toFixed(1) ?? '—'} MU
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl border border-gray-200 bg-white">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                        Typical Demand ({simResult?.month_name}{' '}
                        {simResult?.day_name})
                      </div>
                      <div
                        className="text-xl font-bold mt-0.5"
                        style={{ color: '#204110' }}
                      >
                        {simResult?.typical_MU !== undefined
                          ? `${simResult.typical_MU.toFixed(2)} MU`
                          : '—'}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        Climatological median baseline for {selectedState}
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl border border-gray-200 bg-white">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                        Difference vs. Typical (%)
                      </div>
                      <div
                        className="text-xl font-bold mt-0.5"
                        style={{
                          color:
                            (simResult?.percent_difference || 0) > 0.4
                              ? '#a50727'
                              : '#204110',
                        }}
                      >
                        {simResult?.percent_difference !== undefined
                          ? `${simResult.percent_difference >= 0 ? '+' : ''
                          }${simResult.percent_difference.toFixed(2)}% (${simResult.predicted_MU - simResult.typical_MU >= 0
                            ? '+'
                            : ''
                          }${(
                            simResult.predicted_MU - simResult.typical_MU
                          ).toFixed(2)} MU)`
                          : '—'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Plain-Language Explanation Line Computed from Model & Sweep */}
                {simResult?.plain_language_summary && (
                  <div
                    className="mt-4 p-3.5 rounded-lg border text-xs sm:text-sm font-medium leading-relaxed"
                    style={{
                      backgroundColor:
                        (simResult?.percent_difference || 0) > 0.4
                          ? '#fff5f5'
                          : '#f4f8f2',
                      borderColor:
                        (simResult?.percent_difference || 0) > 0.4
                          ? '#e10531'
                          : '#749764',
                      color:
                        (simResult?.percent_difference || 0) > 0.4
                          ? '#6b0015'
                          : '#204110',
                    }}
                  >
                    {simResult.plain_language_summary}
                  </div>
                )}
              </div>

              {/* Bottom Card: Temperature Sweep Line Chart with Current Temperature Marker */}
              <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">
                      Simulated Temperature Response Curve ({selectedState} ·{' '}
                      {simResult?.month_name} {simResult?.day_name})
                    </h3>
                    <p className="text-xs text-gray-500">
                      Predicted demand (MU) across {selectedState}&apos;s historical temperature range, with your current temperature marked on the curve.
                    </p>
                  </div>

                  {/* Chart Legend */}
                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <span
                      className="inline-flex items-center gap-1.5 font-semibold"
                      style={{ color: '#e10531' }}
                    >
                      <span
                        className="w-4 inline-block"
                        style={{ backgroundColor: '#e10531', height: '3px' }}
                      />
                      Simulated Demand Curve (Red)
                    </span>
                    <span
                      className="inline-flex items-center gap-1.5 font-semibold"
                      style={{ color: '#204110' }}
                    >
                      <span
                        className="w-4 inline-block"
                        style={{ backgroundColor: '#204110', height: '2px' }}
                      />
                      Typical MU Baseline (Green)
                    </span>
                  </div>
                </div>

                <div className="h-[290px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={simResult?.temperature_sweep || []}
                      margin={{ top: 12, right: 20, left: 6, bottom: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis
                        dataKey="temp_mean_c"
                        type="number"
                        domain={['dataMin', 'dataMax']}
                        tick={{ fontSize: 11, fill: '#4b5563' }}
                        unit="°C"
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#4b5563' }}
                        domain={['auto', 'auto']}
                        label={{
                          value: 'Predicted (MU)',
                          angle: -90,
                          position: 'insideLeft',
                          style: { fontSize: 11, fill: '#374151' },
                        }}
                      />
                      <Tooltip
                        formatter={(val, name) => [`${val} MU`, name]}
                        labelFormatter={(lbl) => `Mean Temp: ${lbl}°C`}
                        contentStyle={{
                          backgroundColor: '#ffffff',
                          borderColor: '#d1d5db',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px' }} />

                      {/* Typical Demand Horizontal Line (Dark Green) */}
                      {simResult?.typical_MU !== undefined && (
                        <ReferenceLine
                          y={simResult.typical_MU}
                          stroke="#204110"
                          strokeWidth={1.8}
                          strokeDasharray="5 3"
                          label={{
                            value: `Typical: ${simResult.typical_MU} MU`,
                            position: 'insideTopLeft',
                            fill: '#204110',
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        />
                      )}

                      {/* Vertical line at user's current temperature */}
                      <ReferenceLine
                        x={Number(tempMean)}
                        stroke="#6b0015"
                        strokeDasharray="3 3"
                        strokeWidth={1.3}
                      />

                      {/* Temperature Sweep Line (Red) */}
                      <Line
                        type="monotone"
                        dataKey="predicted_MU"
                        name="Simulated Demand Sweep (MU)"
                        stroke="#e10531"
                        strokeWidth={2.5}
                        dot={{ r: 2.5, fill: '#e10531' }}
                        isAnimationActive={false}
                      />

                      {/* Marker Dot at User's Current Temperature */}
                      {simResult?.predicted_MU !== undefined && (
                        <ReferenceDot
                          x={Number(tempMean)}
                          y={Number(simResult.predicted_MU)}
                          r={6.5}
                          fill="#6b0015"
                          stroke="#ffffff"
                          strokeWidth={2}
                          label={{
                            value: `Current: ${Number(tempMean).toFixed(1)}°C (${simResult.predicted_MU} MU)`,
                            position: 'top',
                            fill: '#6b0015',
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        />
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
