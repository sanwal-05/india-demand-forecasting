import React, { useEffect, useState } from 'react';
import { fetchInsights, fetchRecommendations } from '../api';

export default function InsightsTab() {
  const [insights, setInsights] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([fetchInsights(), fetchRecommendations()])
      .then(([insRes, recRes]) => {
        if (!cancelled) {
          setInsights(insRes);
          setRecommendations(recRes?.recommendations || []);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || 'Failed to load insights and recommendations');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-sm text-gray-500">
        Loading consumption pattern insights and grid recommendations from API…
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="bg-white border rounded-xl p-6 text-sm"
        style={{ borderColor: '#e10531', color: '#6b0015' }}
      >
        {error}
      </div>
    );
  }

  const thresholds = insights?.temperature_thresholds || {};
  const statePatterns = insights?.state_consumption_patterns || [];
  const topFeatures = insights?.top_weather_features_set_a || [];
  const topWeatherStates =
    insights?.most_weather_sensitive_states_top10 || [];

  return (
    <div className="space-y-6">
      {/* 1. Temperature Tipping Point & Comfort Band Banner Card */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-gray-100">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Empirical Thermal Response Finding (2014–2024)
            </span>
            <h2 className="text-base font-bold text-gray-900 mt-0.5">
              Non-Linear Temperature Tipping Points Across Indian State Grids
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className="px-2.5 py-1 rounded-lg font-semibold border"
              style={{
                backgroundColor: '#f4f8f2',
                borderColor: '#749764',
                color: '#204110',
              }}
            >
              Comfort Minimum: {thresholds.comfort_zone_c?.[0]}–
              {thresholds.comfort_zone_c?.[1]}°C
            </span>
            <span
              className="px-2.5 py-1 rounded-lg font-semibold text-white"
              style={{ backgroundColor: '#a50727' }}
            >
              Cooling Surge Tipping Point: &gt;
              {thresholds.sharp_cooling_rise_threshold_c}°C
            </span>
            <span
              className="px-2.5 py-1 rounded-lg font-semibold border"
              style={{
                backgroundColor: '#ffffff',
                borderColor: '#204110',
                color: '#204110',
              }}
            >
              Winter Heating (North): &lt;
              {thresholds.winter_heating_rise_threshold_c}°C
            </span>
          </div>
        </div>
        <p className="text-xs sm:text-sm text-gray-700 mt-3 leading-relaxed">
          {thresholds.explanation}
        </p>
      </div>

      {/* 2. Per-State Consumption Pattern Cards (Peak Season, Trough, Sunday & Holiday Drops) */}
      <div>
        <div className="mb-3">
          <h2 className="text-base font-bold text-gray-900">
            Consumption Pattern Findings by Focus State
          </h2>
          <p className="text-xs text-gray-500">
            Peak months (red) vs. monsoon/winter troughs and weekend/holiday load reductions (green)
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {statePatterns.map((pat) => (
            <div
              key={pat.State}
              className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col justify-between space-y-3"
            >
              <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                <h3 className="text-base font-bold text-gray-900">
                  {pat.State}
                </h3>
                <span
                  className="text-[11px] font-semibold px-2 py-0.5 rounded text-white"
                  style={{ backgroundColor: '#a50727' }}
                >
                  Peaks in {pat['Peak Month']}
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center p-2 rounded-lg bg-gray-50">
                  <span className="text-gray-600">Peak Month Load:</span>
                  <span
                    className="font-bold"
                    style={{ color: '#a50727' }}
                  >
                    {pat['Peak Month Mean (MU)']} MU ({pat['Peak Month Index']}x)
                  </span>
                </div>

                <div className="flex justify-between items-center p-2 rounded-lg bg-gray-50">
                  <span className="text-gray-600">Annual Trough Month:</span>
                  <span
                    className="font-bold"
                    style={{ color: '#204110' }}
                  >
                    {pat['Trough Month']}
                  </span>
                </div>

                <div className="flex justify-between items-center p-2 rounded-lg bg-gray-50">
                  <span className="text-gray-600">Sunday Load Drop:</span>
                  <span
                    className="font-bold"
                    style={{ color: '#204110' }}
                  >
                    {pat['Sunday Drop (%)']}% ({pat['Sunday Drop (MU)']} MU)
                  </span>
                </div>

                <div className="flex justify-between items-center p-2 rounded-lg bg-gray-50">
                  <span className="text-gray-600">Official Holiday Drop:</span>
                  <span
                    className="font-bold"
                    style={{ color: '#204110' }}
                  >
                    {pat['Holiday Drop (%)']}%
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Top Weather Features & Most Weather-Sensitive States Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card A: Which Weather Features Matter Most */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-bold text-gray-900">
            Which Weather Features Matter Most (Set A Permutation Importance)
          </h3>
          <p className="text-xs text-gray-500 mt-0.5 mb-3">
            Mean drop in out-of-sample Test R² when each weather feature is randomly permuted
          </p>

          <div className="space-y-2 text-xs">
            {topFeatures.map((item, idx) => {
              const maxImp = topFeatures[0]?.importance_drop_r2 || 0.2;
              const widthPct = Math.min(
                100,
                Math.max(6, (item.importance_drop_r2 / maxImp) * 100)
              );
              const barColor =
                idx < 3 ? '#a50727' : idx < 6 ? '#204110' : '#749764';

              return (
                <div key={item.feature} className="space-y-1">
                  <div className="flex justify-between">
                    <span className="font-semibold text-gray-800">
                      {idx + 1}. <code>{item.feature}</code>
                    </span>
                    <span className="font-bold text-gray-900">
                      -{Number(item.importance_drop_r2).toFixed(4)} R²
                    </span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded overflow-hidden">
                    <div
                      className="h-full rounded"
                      style={{
                        width: `${widthPct}%`,
                        backgroundColor: barColor,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Card B: Which Indian States Are Most Weather-Sensitive */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm overflow-x-auto">
          <h3 className="text-sm font-bold text-gray-900">
            Top 10 Most Weather-Sensitive Indian States
          </h3>
          <p className="text-xs text-gray-500 mt-0.5 mb-3">
            Ranked by out-of-sample Test R² using Feature Set A (Weather + Calendar only, zero demand lags)
          </p>

          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500 uppercase text-[10px]">
                <th className="py-2 pr-2">Rank &amp; State</th>
                <th className="py-2 px-2 text-right">Mean Demand (MU)</th>
                <th className="py-2 px-2 text-right">Set A Weather R²</th>
                <th className="py-2 px-2 text-right">Set B Full R²</th>
                <th className="py-2 pl-2 text-right">Set B MAPE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {topWeatherStates.map((row, idx) => (
                <tr key={row['State / UT']}>
                  <td className="py-2 pr-2 font-semibold text-gray-900">
                    #{idx + 1} {row['State / UT']}
                  </td>
                  <td className="py-2 px-2 text-right">
                    {Number(row['Mean Test Demand (MU)']).toFixed(1)} MU
                  </td>
                  <td
                    className="py-2 px-2 text-right font-bold"
                    style={{ color: '#204110' }}
                  >
                    {Number(row['Set A (Weather+Cal) R²']).toFixed(3)}
                  </td>
                  <td className="py-2 px-2 text-right font-medium text-gray-800">
                    {Number(row['Set B (Best Pipeline) R²']).toFixed(3)}
                  </td>
                  <td className="py-2 pl-2 text-right text-gray-600">
                    {Number(row['Set B MAPE (%)']).toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Grid-Level Operational Recommendation Cards (Evidence + Metric + Action) */}
      <div>
        <div className="mb-3">
          <h2 className="text-base font-bold text-gray-900">
            Evidence-Backed Grid-Level Recommendations (SLDCs, DISCOMs &amp; Grid-India)
          </h2>
          <p className="text-xs text-gray-500">
            Every operational recommendation cites its quantitative finding and related metric from the dataset and trained models.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {recommendations.map((rec) => (
            <div
              key={rec.id}
              className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col justify-between space-y-4"
            >
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-2.5">
                  <span
                    className="text-[11px] font-bold px-2.5 py-0.5 rounded text-white"
                    style={{ backgroundColor: '#204110' }}
                  >
                    Recommendation #{rec.id}
                  </span>
                  <span className="text-xs font-semibold text-gray-600">
                    {rec.stakeholder}
                  </span>
                </div>

                <h3 className="text-base font-bold text-gray-900">
                  {rec.title}
                </h3>

                {/* Related Metric Citation Pill */}
                <div
                  className="p-3 rounded-lg border text-xs"
                  style={{
                    backgroundColor: '#f8faf7',
                    borderColor: '#a0bd85',
                  }}
                >
                  <div
                    className="font-bold uppercase text-[10px] tracking-wider"
                    style={{ color: '#375f25' }}
                  >
                    Related Metric: {rec.metric_name}
                  </div>
                  <div
                    className="font-bold text-sm mt-0.5"
                    style={{ color: '#204110' }}
                  >
                    {rec.metric_value}
                  </div>
                </div>

                {/* Evidence from the Data */}
                <div className="text-xs text-gray-700 space-y-1">
                  <div className="font-bold text-gray-900">
                    Evidence from Data &amp; Models:
                  </div>
                  <p className="leading-relaxed">{rec.evidence}</p>
                </div>
              </div>

              {/* Concrete Grid Action */}
              <div
                className="p-3.5 rounded-lg border text-xs leading-relaxed"
                style={{
                  backgroundColor: '#ffffff',
                  borderColor: '#204110',
                }}
              >
                <div
                  className="font-bold mb-1"
                  style={{ color: '#204110' }}
                >
                  Grid-Level Operational Action:
                </div>
                <div className="text-gray-800">{rec.action}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
