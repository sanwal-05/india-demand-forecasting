import React, { useEffect, useState } from 'react';
import { fetchInsights, fetchRecommendations } from '../api';

export default function InsightsTab() {
  const [insights, setInsights] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentRecIndex, setCurrentRecIndex] = useState(0);

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

  const handlePrevRec = () => {
    setCurrentRecIndex((prev) =>
      prev === 0 ? recommendations.length - 1 : prev - 1
    );
  };

  const handleNextRec = () => {
    setCurrentRecIndex((prev) =>
      prev === recommendations.length - 1 ? 0 : prev + 1
    );
  };

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
        <div className="pb-3 border-b border-gray-100">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
            Empirical Thermal Response Finding (2014–2024)
          </span>
          <h2 className="text-base font-bold text-gray-900 mt-0.5">
            Non-Linear Temperature Tipping Points Across Indian State Grids
          </h2>
        </div>

        <div className="mt-4 space-y-2.5 text-sm text-gray-700">
          <div className="flex items-start gap-3">
            <span
              className="mt-0.5 w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: '#749764' }}
            />
            <div>
              <span className="font-semibold">Comfort Zone:</span> Demand remains stable between{' '}
              <span className="font-bold" style={{ color: '#204110' }}>
                {thresholds.comfort_zone_c?.[0]}–{thresholds.comfort_zone_c?.[1]}°C
              </span>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <span
              className="mt-0.5 w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: '#a50727' }}
            />
            <div>
              <span className="font-semibold">Cooling Surge Threshold:</span> Sharp demand increase above{' '}
              <span className="font-bold" style={{ color: '#a50727' }}>
                {thresholds.sharp_cooling_rise_threshold_c}°C
              </span>{' '}
              due to air conditioning load
            </div>
          </div>

          <div className="flex items-start gap-3">
            <span
              className="mt-0.5 w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: '#204110' }}
            />
            <div>
              <span className="font-semibold">Winter Heating (Northern States):</span> Increased demand below{' '}
              <span className="font-bold" style={{ color: '#204110' }}>
                {thresholds.winter_heating_rise_threshold_c}°C
              </span>{' '}
              for space heating
            </div>
          </div>
        </div>
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
            Top Weather Features (Set A)
          </h3>
          <p className="text-xs text-gray-500 mt-0.5 mb-3">
            Impact on Test R² when permuted
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
            Most Weather-Sensitive States
          </h3>
          <p className="text-xs text-gray-500 mt-0.5 mb-3">
            Ranked by Set A Test R² (weather only)
          </p>

          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500 uppercase text-[10px]">
                <th className="py-2 pr-2">Rank &amp; State</th>
                <th className="py-2 px-2 text-right">Mean Demand (MU)</th>
                <th className="py-2 px-2 text-right">Set A R²</th>
                <th className="py-2 px-2 text-right">Set B R²</th>
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

      {/* 4. Grid-Level Operational Recommendation Carousel */}
      <div>
        <div className="mb-4">
          <h2 className="text-base font-bold text-gray-900">
            Grid-Level Recommendations
          </h2>
          <p className="text-xs text-gray-500">
            {recommendations.length} actionable recommendations
          </p>
        </div>

        {recommendations.length > 0 && (
          <div className="relative px-16">
            {/* Main Recommendation Card */}
            <div className="bg-white border-2 border-gray-300 rounded-xl p-8 shadow-lg max-w-4xl mx-auto">
              <div className="space-y-5">
                {/* Header */}
                <div className="flex items-center justify-between pb-4 border-b-2 border-gray-200">
                  <div>
                    <span
                      className="text-xs font-bold px-3 py-1.5 rounded text-white"
                      style={{ backgroundColor: '#204110' }}
                    >
                      #{recommendations[currentRecIndex].id}
                    </span>
                    <h3 className="text-xl font-bold text-gray-900 mt-3">
                      {recommendations[currentRecIndex].title}
                    </h3>
                  </div>
                  <span className="text-sm font-semibold text-gray-600 bg-gray-100 px-3 py-1.5 rounded-lg">
                    {recommendations[currentRecIndex].stakeholder}
                  </span>
                </div>

                {/* Key Metric */}
                <div
                  className="p-5 rounded-xl border-2 text-center"
                  style={{
                    backgroundColor: '#f8faf7',
                    borderColor: '#749764',
                  }}
                >
                  <div
                    className="font-bold text-3xl mb-1"
                    style={{ color: '#204110' }}
                  >
                    {recommendations[currentRecIndex].metric_value}
                  </div>
                  <div className="text-sm text-gray-600">
                    {recommendations[currentRecIndex].metric_name}
                  </div>
                </div>

                {/* Evidence - Bullet Points */}
                <div className="bg-gray-50 rounded-lg p-5">
                  <ul className="space-y-2.5 text-sm text-gray-700">
                    {recommendations[currentRecIndex].evidence.split(/\.\s+/).filter(s => s.trim()).map((sentence, idx) => (
                      <li key={idx} className="flex items-start gap-3">
                        <span className="text-lg" style={{ color: '#204110' }}>•</span>
                        <span className="flex-1 leading-relaxed">{sentence.trim()}{sentence.trim().endsWith('.') ? '' : '.'}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Action */}
                <div
                  className="p-5 rounded-xl border-2"
                  style={{
                    backgroundColor: '#ffffff',
                    borderColor: '#204110',
                  }}
                >
                  <div className="font-bold mb-3 text-base" style={{ color: '#204110' }}>
                    → Recommended Action
                  </div>
                  <div className="text-sm text-gray-800 leading-relaxed">
                    {recommendations[currentRecIndex].action}
                  </div>
                </div>
              </div>
            </div>

            {/* Navigation Arrows */}
            <button
              onClick={handlePrevRec}
              className="absolute left-0 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white border-2 shadow-lg flex items-center justify-center transition-all hover:bg-gray-50 hover:scale-110"
              style={{ borderColor: '#204110' }}
              aria-label="Previous recommendation"
            >
              <svg
                className="w-6 h-6"
                style={{ color: '#204110' }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>

            <button
              onClick={handleNextRec}
              className="absolute right-0 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white border-2 shadow-lg flex items-center justify-center transition-all hover:bg-gray-50 hover:scale-110"
              style={{ borderColor: '#204110' }}
              aria-label="Next recommendation"
            >
              <svg
                className="w-6 h-6"
                style={{ color: '#204110' }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>

            {/* Indicator Dots */}
            <div className="flex items-center justify-center gap-2 mt-6">
              {recommendations.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentRecIndex(idx)}
                  className="w-2.5 h-2.5 rounded-full transition-all hover:scale-125"
                  style={{
                    backgroundColor:
                      idx === currentRecIndex ? '#204110' : '#d1d5db',
                  }}
                  aria-label={`Go to recommendation ${idx + 1}`}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
