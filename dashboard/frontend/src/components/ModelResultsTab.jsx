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
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fetchInsights, fetchModels, fetchPredictions } from '../api';
import { FOCUS_STATES, getMetricColor } from '../theme';

export default function ModelResultsTab({
  selectedState,
  onChangeSelectedState,
}) {
  const [featureSet, setFeatureSet] = useState('Set B');
  const [predData, setPredData] = useState(null);
  const [modelsData, setModelsData] = useState(null);
  const [insightsData, setInsightsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      fetchPredictions({ state: selectedState, featureSet }),
      fetchModels(selectedState),
      fetchInsights(),
    ])
      .then(([pRes, mRes, iRes]) => {
        if (!cancelled) {
          setPredData(pRes);
          setModelsData(mRes);
          setInsightsData(iRes);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || 'Failed to load model evaluation results');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedState, featureSet]);

  // Identify points with large errors (top 10% largest |residual_MU|) and attach large_error_MU for red highlighting
  const { chartSeries, errorThreshold90p } = useMemo(() => {
    const raw = predData?.series || [];
    if (raw.length === 0) return { chartSeries: [], errorThreshold90p: 0 };

    const absErrors = raw
      .map((d) => Math.abs(Number(d.residual_MU || 0)))
      .sort((a, b) => a - b);
    const idx90 = Math.floor(absErrors.length * 0.9);
    const thresh = absErrors[idx90] || 0;

    const enriched = raw.map((d) => {
      const absErr = Math.abs(Number(d.residual_MU || 0));
      const isLargeError = absErr >= thresh && thresh > 0;
      return {
        ...d,
        abs_error_MU: Number(absErr.toFixed(2)),
        large_error_point_MU: isLargeError ? d.predicted_MU : null,
        isLargeError,
      };
    });

    return {
      chartSeries: enriched,
      errorThreshold90p: Number(thresh.toFixed(2)),
    };
  }, [predData]);

  // Feature importance list from insights.json
  const featureImportanceData = useMemo(() => {
    const list = insightsData?.top_weather_features_set_a || [];
    return list.map((item) => ({
      feature: item.feature,
      importance: Number(item.importance_drop_r2),
    }));
  }, [insightsData]);

  // State-wise R² across all 32 states from modelsData
  const stateWiseR2Data = useMemo(() => {
    const list = modelsData?.state_wise_r2_all_states || [];
    return [...list]
      .sort(
        (a, b) =>
          Number(b['Set B (Best Pipeline) R²']) -
          Number(a['Set B (Best Pipeline) R²'])
      )
      .map((row) => ({
        state: row['State / UT'],
        r2_set_b: Number(row['Set B (Best Pipeline) R²']),
        r2_set_a: Number(row['Set A (Weather+Cal) R²']),
        r2_baseline: Number(row['Baseline Lag-7 R²']),
        mape_pct: Number(row['Set B MAPE (%)']),
      }));
  }, [modelsData]);

  const summary = predData?.summary || {};
  const comparisonRows = modelsData?.comparison_table || [];
  const bestModelName = modelsData?.best_model?.best_model || 'LightGBM';

  return (
    <div className="space-y-6">
      {/* 1. Top Bar: Focus State Selector & Feature Set Toggle */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
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

        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold text-gray-600">Feature Set:</span>
          <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
            <button
              onClick={() => setFeatureSet('Set A')}
              className={`px-3 py-1.5 font-semibold ${featureSet === 'Set A'
                ? 'text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              style={
                featureSet === 'Set A'
                  ? { backgroundColor: '#204110' }
                  : undefined
              }
            >
              Set A (Weather + Calendar)
            </button>
            <button
              onClick={() => setFeatureSet('Set B')}
              className={`px-3 py-1.5 font-semibold ${featureSet === 'Set B'
                ? 'text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              style={
                featureSet === 'Set B'
                  ? { backgroundColor: '#204110' }
                  : undefined
              }
            >
              Set B (Weather + Calendar + Lags)
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-sm text-gray-500">
          Loading out-of-sample test predictions and model benchmarks…
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
          {/* 2. MAE, RMSE, R² and MAPE Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Test MAE
              </div>
              <div
                className="mt-1 text-2xl font-bold"
                style={{ color: '#204110' }}
              >
                {summary.mae_MU !== undefined ? `${summary.mae_MU} MU` : '—'}
              </div>
              <div className="mt-1 text-xs text-gray-600">
                Mean Absolute Error
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Test RMSE
              </div>
              <div
                className="mt-1 text-2xl font-bold"
                style={{ color: '#204110' }}
              >
                {summary.rmse_MU !== undefined ? `${summary.rmse_MU} MU` : '—'}
              </div>
              <div className="mt-1 text-xs text-gray-600">
                Root Mean Square Error
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Test R²
              </div>
              <div
                className="mt-1 text-2xl font-bold"
                style={{
                  color: (summary.r2 || 0) >= 0.85 ? '#204110' : '#a50727',
                }}
              >
                {summary.r2 !== undefined ? summary.r2.toFixed(4) : '—'}
              </div>
              <div className="mt-1 text-xs text-gray-600">
                {bestModelName}
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Test MAPE
              </div>
              <div
                className="mt-1 text-2xl font-bold"
                style={{ color: '#204110' }}
              >
                {summary.mape_pct !== undefined
                  ? `${summary.mape_pct.toFixed(2)}%`
                  : '—'}
              </div>
              <div className="mt-1 text-xs text-gray-600">
                Mean Absolute % Error
              </div>
            </div>
          </div>

          {/* 3. Actual (Dark Green) vs Predicted (Red) Overlay Chart with Date Brush & Large Error Highlights */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div>
                <h2 className="text-base font-bold text-gray-900">
                  {selectedState} — Test Set Actual vs. Predicted Electricity Demand (MU · {bestModelName} {featureSet})
                </h2>
                <p className="text-xs text-gray-500">
                  Test period 2023–2024. Red markers show largest errors (&ge;{errorThreshold90p} MU).
                </p>
              </div>

              {/* Legend */}
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <span
                  className="inline-flex items-center gap-1.5 font-semibold"
                  style={{ color: '#204110' }}
                >
                  <span
                    className="w-4 inline-block"
                    style={{ backgroundColor: '#204110', height: '3px' }}
                  />
                  Actual
                </span>
                <span
                  className="inline-flex items-center gap-1.5 font-semibold"
                  style={{ color: '#e10531' }}
                >
                  <span
                    className="w-4 inline-block"
                    style={{ backgroundColor: '#e10531', height: '3px' }}
                  />
                  Predicted
                </span>
                <span
                  className="inline-flex items-center gap-1.5 font-semibold"
                  style={{ color: '#6b0015' }}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full inline-block border"
                    style={{
                      backgroundColor: '#6b0015',
                      borderColor: '#e10531',
                    }}
                  />
                  Large Error
                </span>
              </div>
            </div>

            <div className="h-[370px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={chartSeries}
                  margin={{ top: 10, right: 20, left: 6, bottom: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: '#4b5563' }}
                    minTickGap={34}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#4b5563' }}
                    domain={['auto', 'auto']}
                    label={{
                      value: 'Demand (MU)',
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
                    formatter={(value, name, props) => {
                      if (name === 'Large Error Day') {
                        const err = props?.payload?.residual_MU;
                        return [
                          `${value} MU (Error: ${err >= 0 ? '+' : ''}${err} MU)`,
                          name,
                        ];
                      }
                      return [`${value} MU`, name];
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />

                  <Line
                    type="monotone"
                    dataKey="actual_MU"
                    name="Actual Demand (MU)"
                    stroke="#204110"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="predicted_MU"
                    name={`Predicted Demand (${featureSet}, MU)`}
                    stroke="#e10531"
                    strokeWidth={1.8}
                    dot={false}
                  />
                  <Scatter
                    dataKey="large_error_point_MU"
                    name="Large Error Day"
                    fill="#6b0015"
                    stroke="#e10531"
                    strokeWidth={1.5}
                  />

                  <Brush
                    dataKey="date"
                    height={26}
                    stroke="#204110"
                    fill="#f9fafb"
                    travellerWidth={10}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 4. Model Comparison Table + Feature Importance Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left 7 Cols: Model Comparison Table with Best Model Highlighted */}
            <div className="lg:col-span-7 bg-white border border-gray-200 rounded-xl p-5 shadow-sm overflow-x-auto">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-bold text-gray-900">
                    Model Comparison — {selectedState}
                  </h3>
                  <p className="text-xs text-gray-500">
                    Green highlights the best model ({bestModelName}).
                  </p>
                </div>
                <span
                  className="text-[11px] font-semibold px-2.5 py-1 rounded text-white"
                  style={{ backgroundColor: '#204110' }}
                >
                  Best: {bestModelName}
                </span>
              </div>

              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500 uppercase text-[10px]">
                    <th className="py-2 pr-2">Model</th>
                    <th className="py-2 px-2">Feature Set</th>
                    <th className="py-2 px-2 text-right">Val R²</th>
                    <th className="py-2 px-2 text-right">MAE (MU)</th>
                    <th className="py-2 px-2 text-right">RMSE (MU)</th>
                    <th className="py-2 px-2 text-right">Test R²</th>
                    <th className="py-2 pl-2 text-right">MAPE (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {comparisonRows.map((row, idx) => {
                    const isBestWinner =
                      row.Model === bestModelName &&
                      row['Feature Set'].includes('Set B');
                    const isBestSetA =
                      row.Model === bestModelName &&
                      row['Feature Set'].includes('Set A');
                    const isBaseline = row['Feature Set'] === 'Baseline';

                    return (
                      <tr
                        key={`${row.Model}-${row['Feature Set']}-${idx}`}
                        style={
                          isBestWinner
                            ? {
                              backgroundColor: '#c8d9c2',
                              fontWeight: 700,
                              color: '#204110',
                            }
                            : isBestSetA
                              ? {
                                backgroundColor: '#f4f8f2',
                                fontWeight: 600,
                                color: '#204110',
                              }
                              : isBaseline
                                ? { color: '#850014' }
                                : undefined
                        }
                      >
                        <td className="py-2 pr-2">
                          {row.Model}
                          {isBestWinner && (
                            <span
                              className="ml-1.5 px-1.5 py-0.5 text-[10px] rounded text-white"
                              style={{ backgroundColor: '#204110' }}
                            >
                              Best
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-2">{row['Feature Set']}</td>
                        <td className="py-2 px-2 text-right">
                          {Number(row['Val R²']).toFixed(3)}
                        </td>
                        <td className="py-2 px-2 text-right">
                          {Number(row['MAE (MU)']).toFixed(2)}
                        </td>
                        <td className="py-2 px-2 text-right">
                          {Number(row['RMSE (MU)']).toFixed(2)}
                        </td>
                        <td className="py-2 px-2 text-right font-semibold">
                          {Number(row['R²']).toFixed(3)}
                        </td>
                        <td className="py-2 pl-2 text-right">
                          {Number(row['MAPE (%)']).toFixed(2)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Right 5 Cols: Permutation Feature Importance Chart */}
            <div className="lg:col-span-5 bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-900">
                  Weather Feature Importance (Permutation Drop in R²)
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Top meteorological drivers in Feature Set A across the 4 focus states
                </p>

                <div className="h-[310px] w-full mt-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={featureImportanceData}
                      layout="vertical"
                      margin={{ top: 6, right: 18, left: 28, bottom: 6 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 11, fill: '#4b5563' }}
                      />
                      <YAxis
                        dataKey="feature"
                        type="category"
                        width={125}
                        tick={{ fontSize: 11, fill: '#1f2937' }}
                      />
                      <Tooltip
                        formatter={(val) => [
                          `${Number(val).toFixed(4)} R² drop`,
                          'Permutation Importance',
                        ]}
                        contentStyle={{
                          backgroundColor: '#ffffff',
                          borderColor: '#d1d5db',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                      />
                      <Bar
                        dataKey="importance"
                        name="Mean Drop in Test R²"
                        radius={[0, 4, 4, 0]}
                      >
                        {featureImportanceData.map((entry, idx) => (
                          <Cell
                            key={entry.feature}
                            fill={
                              idx < 3
                                ? '#a50727'
                                : idx < 6
                                  ? '#204110'
                                  : '#749764'
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-600">
                <span
                  className="inline-flex items-center gap-1.5 font-semibold"
                  style={{ color: '#a50727' }}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-sm inline-block"
                    style={{ backgroundColor: '#a50727' }}
                  />
                  Red = Primary Heat Drivers (T_max, T_mean, T_roll7)
                </span>
                <span
                  className="inline-flex items-center gap-1.5 font-semibold"
                  style={{ color: '#204110' }}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-sm inline-block"
                    style={{ backgroundColor: '#204110' }}
                  />
                  Green = Secondary Thermal &amp; Solar Drivers
                </span>
              </div>
            </div>
          </div>

          {/* 5. State-Wise R² Bar Chart Across All 32 Indian States (Green = High, Red = Low) */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  National Rollout: State-Wise Out-of-Sample Test R² Across All 32 Indian States
                </h3>
                <p className="text-xs text-gray-500">
                  Evaluated in original units (MU) on the 2023–2024 Test Set · National Median Test R² = 0.919, Median MAPE = 3.29%
                </p>
              </div>

              <div className="flex items-center gap-4 text-xs">
                <span
                  className="inline-flex items-center gap-1.5 font-semibold"
                  style={{ color: '#204110' }}
                >
                  <span
                    className="w-3 h-3 rounded-sm inline-block"
                    style={{ backgroundColor: '#204110' }}
                  />
                  Green = High Model Skill (R² &ge; 0.85)
                </span>
                <span
                  className="inline-flex items-center gap-1.5 font-semibold"
                  style={{ color: '#a50727' }}
                >
                  <span
                    className="w-3 h-3 rounded-sm inline-block"
                    style={{ backgroundColor: '#e10531' }}
                  />
                  Red = Lower Model Skill (R² &lt; 0.85)
                </span>
              </div>
            </div>

            <div className="h-[340px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={stateWiseR2Data}
                  margin={{ top: 8, right: 16, left: 4, bottom: 68 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="state"
                    angle={-40}
                    textAnchor="end"
                    interval={0}
                    tick={{ fontSize: 10.5, fill: '#374151' }}
                  />
                  <YAxis
                    domain={[0, 1]}
                    tick={{ fontSize: 11, fill: '#4b5563' }}
                    label={{
                      value: 'Test R²',
                      angle: -90,
                      position: 'insideLeft',
                      style: { fontSize: 11, fill: '#374151' },
                    }}
                  />
                  <Tooltip
                    formatter={(val, name, props) => [
                      `R² = ${Number(val).toFixed(3)} (MAPE: ${props?.payload?.mape_pct?.toFixed(2)}%)`,
                      'LightGBM Set B',
                    ]}
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      borderColor: '#d1d5db',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Bar
                    dataKey="r2_set_b"
                    name="Test R² (Set B)"
                    radius={[3, 3, 0, 0]}
                  >
                    {stateWiseR2Data.map((entry) => (
                      <Cell
                        key={entry.state}
                        fill={getMetricColor('model_r2', entry.r2_set_b)}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
