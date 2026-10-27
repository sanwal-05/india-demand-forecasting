import React, { useMemo, useState } from 'react';
import { geoMercator, geoPath } from 'd3-geo';
import indiaGeoJson from '../data/india_states.json';
import {
  FOCUS_STATES,
  getMetricColor,
  NEUTRALS,
  normalizeGeoStateName,
} from '../theme';

const SVG_WIDTH = 660;
const SVG_HEIGHT = 680;

// Label offsets so focus state badges never overlap polygon edges
const FOCUS_LABEL_OFFSETS = {
  Delhi: { dx: 42, dy: -12, anchor: 'start', showLeader: true },
  'Uttar Pradesh': { dx: 8, dy: 4, anchor: 'middle', showLeader: false },
  Maharashtra: { dx: -4, dy: 8, anchor: 'middle', showLeader: false },
  Kerala: { dx: -36, dy: 6, anchor: 'end', showLeader: true },
};

export default function IndiaMapSVG({
  metric,
  mapStatesByName,
  minValue,
  maxValue,
  selectedState,
  onSelectState,
}) {
  const [hoveredInfo, setHoveredInfo] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Build d3-geo Mercator projection fitted to India GeoJSON
  const { featuresWithPaths, focusCentroids } = useMemo(() => {
    const projection = geoMercator().fitExtent(
      [
        [24, 20],
        [SVG_WIDTH - 24, SVG_HEIGHT - 24],
      ],
      indiaGeoJson
    );
    const pathGen = geoPath().projection(projection);

    const paths = [];
    const centroids = [];

    for (const feature of indiaGeoJson.features) {
      const rawGeoName = feature.properties?.NAME_1 || '';
      const datasetStateName = normalizeGeoStateName(rawGeoName);
      const isFocus = FOCUS_STATES.includes(datasetStateName);
      const d = pathGen(feature);
      const centroid = pathGen.centroid(feature);

      paths.push({
        rawGeoName,
        datasetStateName,
        isFocus,
        d,
        centroid,
      });

      if (isFocus && Array.isArray(centroid) && !Number.isNaN(centroid[0])) {
        centroids.push({
          state: datasetStateName,
          cx: centroid[0],
          cy: centroid[1],
        });
      }
    }

    // Sort so non-focus states render first and the 4 focus states render on top with crisp outlines
    paths.sort((a, b) => (a.isFocus === b.isFocus ? 0 : a.isFocus ? 1 : -1));

    return { featuresWithPaths: paths, focusCentroids: centroids };
  }, []);

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const formatMetricValue = (stateRecord) => {
    if (!stateRecord || stateRecord.value === null || stateRecord.value === undefined) {
      return 'No data';
    }
    if (metric === 'avg_demand') return `${Number(stateRecord.value).toFixed(1)} MU/day`;
    if (metric === 'vs_typical') {
      const v = Number(stateRecord.value);
      return `${v >= 0 ? '+' : ''}${v.toFixed(1)}% vs typical`;
    }
    if (metric === 'model_r2') return `R² = ${Number(stateRecord.value).toFixed(3)}`;
    return String(stateRecord.value);
  };

  return (
    <div
      className="relative w-full flex flex-col items-center select-none"
      onMouseMove={handleMouseMove}
    >
      <svg
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        className="w-full max-w-[640px] h-auto bg-white"
        role="img"
        aria-label="Interactive Choropleth Map of India Electricity Demand and Model Skill"
      >
        <g>
          {featuresWithPaths.map((item) => {
            const stateRecord = mapStatesByName[item.datasetStateName];
            const hasValue =
              stateRecord &&
              stateRecord.value !== null &&
              stateRecord.value !== undefined;
            const fillColor = hasValue
              ? getMetricColor(metric, stateRecord.value, minValue, maxValue)
              : NEUTRALS.noDataFill;

            const isSelected = selectedState === item.datasetStateName;

            // Focus states stand out: full color (opacity 1.0) and bold dark-green (#204110) outline
            // Other states are muted: lighter opacity (0.55) and thin grey outline
            const fillOpacity = item.isFocus
              ? 1.0
              : hasValue
              ? isSelected
                ? 0.8
                : 0.55
              : 0.65;

            const strokeColor = item.isFocus
              ? '#204110'
              : isSelected
              ? '#375f25'
              : NEUTRALS.mutedStroke;

            const strokeWidth = item.isFocus ? 2.4 : isSelected ? 1.6 : 0.8;

            return (
              <path
                key={item.rawGeoName}
                d={item.d || ''}
                fill={fillColor}
                fillOpacity={fillOpacity}
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                strokeLinejoin="round"
                className="cursor-pointer transition-opacity duration-150 hover:opacity-95"
                onMouseEnter={() =>
                  setHoveredInfo({
                    rawGeoName: item.rawGeoName,
                    state: item.datasetStateName,
                    isFocus: item.isFocus,
                    record: stateRecord || null,
                  })
                }
                onMouseLeave={() => setHoveredInfo(null)}
                onClick={() => onSelectState(item.datasetStateName, item.isFocus)}
              />
            );
          })}
        </g>

        {/* Bold labels for our 4 focus states */}
        <g className="pointer-events-none">
          {focusCentroids.map(({ state, cx, cy }) => {
            const cfg = FOCUS_LABEL_OFFSETS[state] || {
              dx: 0,
              dy: 0,
              anchor: 'middle',
              showLeader: false,
            };
            const lx = cx + cfg.dx;
            const ly = cy + cfg.dy;

            return (
              <g key={`label-${state}`}>
                {cfg.showLeader && (
                  <>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={4.2}
                      fill="#204110"
                      stroke="#ffffff"
                      strokeWidth={1.5}
                    />
                    <line
                      x1={cx}
                      y1={cy}
                      x2={lx}
                      y2={ly}
                      stroke="#204110"
                      strokeWidth={1.5}
                    />
                  </>
                )}
                <text
                  x={lx}
                  y={ly}
                  textAnchor={cfg.anchor}
                  dominantBaseline="middle"
                  fontSize="12"
                  fontWeight="700"
                  fill="#204110"
                  stroke="#ffffff"
                  strokeWidth="3.5"
                  paintOrder="stroke"
                >
                  {state} ★
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Floating Hover Tooltip */}
      {hoveredInfo && (
        <div
          className="pointer-events-none absolute z-20 bg-white border border-gray-300 rounded-lg shadow-md px-3.5 py-2.5 text-xs text-gray-800 min-w-[210px]"
          style={{
            left: Math.min(mousePos.x + 14, 420),
            top: Math.max(mousePos.y - 18, 10),
          }}
        >
          <div className="flex items-center justify-between gap-2 border-b border-gray-100 pb-1 mb-1.5">
            <span className="font-bold text-sm text-gray-900">
              {hoveredInfo.state}
            </span>
            {hoveredInfo.isFocus ? (
              <span
                className="px-1.5 py-0.5 rounded text-[10px] font-semibold text-white"
                style={{ backgroundColor: '#204110' }}
              >
                Focus State
              </span>
            ) : (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
                National Grid
              </span>
            )}
          </div>

          {hoveredInfo.record && hoveredInfo.record.value !== null ? (
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500">Selected Metric:</span>
                <span className="font-semibold text-gray-900">
                  {formatMetricValue(hoveredInfo.record)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Avg Demand:</span>
                <span className="font-medium">
                  {hoveredInfo.record.avg_demand_MU !== null
                    ? `${hoveredInfo.record.avg_demand_MU.toFixed(1)} MU`
                    : 'No data'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Typical Demand:</span>
                <span className="font-medium">
                  {hoveredInfo.record.typical_MU !== null
                    ? `${hoveredInfo.record.typical_MU.toFixed(1)} MU`
                    : 'No data'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Model Test R²:</span>
                <span className="font-medium">
                  {hoveredInfo.record.model_r2 !== null
                    ? hoveredInfo.record.model_r2.toFixed(3)
                    : 'No data'}
                </span>
              </div>
              <div className="mt-1.5 pt-1 border-t border-gray-100 text-[11px] font-medium" style={{ color: hoveredInfo.isFocus ? '#204110' : '#4b5563' }}>
                {hoveredInfo.isFocus
                  ? 'Click to open in State Explorer →'
                  : 'Click to view state summary card'}
              </div>
            </div>
          ) : (
            <div className="text-gray-500 py-1">
              <span className="font-semibold text-gray-700">No data</span> in POSOCO telemetry for this territory.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
