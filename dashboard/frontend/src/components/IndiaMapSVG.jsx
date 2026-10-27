import React, { useMemo, useState } from 'react';
import { geoIdentity, geoPath } from 'd3-geo';
import indiaGeoJson from '../data/india_states.json';
import {
  FOCUS_STATES,
  getMetricColor,
  NEUTRALS,
  normalizeGeoStateName,
} from '../theme';

const SVG_WIDTH = 640;
const SVG_HEIGHT = 720;

// Label offsets so focus state badges never obscure state boundaries
const FOCUS_LABEL_OFFSETS = {
  Delhi: { dx: 48, dy: -14, anchor: 'start', showLeader: true },
  'Uttar Pradesh': { dx: 6, dy: 4, anchor: 'middle', showLeader: false },
  Maharashtra: { dx: -6, dy: 6, anchor: 'middle', showLeader: false },
  Kerala: { dx: -28, dy: 6, anchor: 'end', showLeader: true },
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

  // Build planar d3-geo projection fitted to the vectorized India map
  const { featuresWithPaths, focusCentroids } = useMemo(() => {
    const projection = geoIdentity().fitExtent(
      [
        [20, 14],
        [SVG_WIDTH - 20, SVG_HEIGHT - 14],
      ],
      indiaGeoJson
    );
    const pathGen = geoPath().projection(projection);

    const paths = [];
    const centroids = [];

    for (const feature of indiaGeoJson.features) {
      const rawGeoName = feature.properties?.NAME_1 || '';
      const datasetStateName =
        feature.properties?.STATE || normalizeGeoStateName(rawGeoName);
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
          rawGeoName,
          cx: centroid[0],
          cy: centroid[1],
        });
      }
    }

    // Sort so non-focus states render first, then focus states on top, and Delhi last (on top of Haryana/UP)
    paths.sort((a, b) => {
      if (a.datasetStateName === 'Delhi') return 1;
      if (b.datasetStateName === 'Delhi') return -1;
      if (a.isFocus === b.isFocus) return 0;
      return a.isFocus ? 1 : -1;
    });

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
    if (
      !stateRecord ||
      stateRecord.value === null ||
      stateRecord.value === undefined
    ) {
      return 'No data';
    }
    if (metric === 'avg_demand')
      return `${Number(stateRecord.value).toFixed(1)} MU/day`;
    if (metric === 'vs_typical') {
      const v = Number(stateRecord.value);
      return `${v >= 0 ? '+' : ''}${v.toFixed(1)}% vs typical`;
    }
    if (metric === 'model_r2')
      return `R² = ${Number(stateRecord.value).toFixed(3)}`;
    return String(stateRecord.value);
  };

  return (
    <div
      className="relative w-full flex flex-col items-center select-none"
      onMouseMove={handleMouseMove}
    >
      <svg
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        className="w-full max-w-[600px] h-auto bg-white"
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
            const isHovered = hoveredInfo?.rawGeoName === item.rawGeoName;

            // Focus states stand out: full color (opacity 1.0) and bold dark-green (#204110) outline
            // Other states are muted: lighter opacity (0.62) and crisp grey outline
            const fillOpacity = item.isFocus
              ? 1.0
              : isHovered || isSelected
              ? 0.88
              : hasValue
              ? 0.62
              : 0.7;

            const strokeColor = item.isFocus
              ? '#204110'
              : isSelected || isHovered
              ? '#204110'
              : '#6b7280';

            const strokeWidth = item.isFocus
              ? 2.8
              : isSelected || isHovered
              ? 2.0
              : 1.1;

            return (
              <path
                key={item.rawGeoName}
                d={item.d || ''}
                fill={fillColor}
                fillOpacity={fillOpacity}
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                strokeLinejoin="round"
                strokeLinecap="round"
                className="cursor-pointer transition-opacity duration-100"
                onMouseEnter={() =>
                  setHoveredInfo({
                    rawGeoName: item.rawGeoName,
                    state: item.datasetStateName,
                    isFocus: item.isFocus,
                    record: stateRecord || null,
                  })
                }
                onMouseLeave={() => setHoveredInfo(null)}
                onClick={() =>
                  onSelectState(item.datasetStateName, item.isFocus)
                }
              />
            );
          })}
        </g>

        {/* Interactive Focus State Labels & Pin Markers */}
        <g>
          {focusCentroids.map(({ state, rawGeoName, cx, cy }) => {
            const cfg = FOCUS_LABEL_OFFSETS[state] || {
              dx: 0,
              dy: 0,
              anchor: 'middle',
              showLeader: false,
            };
            const lx = cx + cfg.dx;
            const ly = cy + cfg.dy;
            const stateRecord = mapStatesByName[state];

            return (
              <g
                key={`label-${state}`}
                className="cursor-pointer"
                onMouseEnter={() =>
                  setHoveredInfo({
                    rawGeoName,
                    state,
                    isFocus: true,
                    record: stateRecord || null,
                  })
                }
                onMouseLeave={() => setHoveredInfo(null)}
                onClick={() => onSelectState(state, true)}
              >
                {cfg.showLeader && (
                  <>
                    <line
                      x1={cx}
                      y1={cy}
                      x2={lx}
                      y2={ly}
                      stroke="#204110"
                      strokeWidth={1.8}
                    />
                    <circle
                      cx={cx}
                      cy={cy}
                      r={state === 'Delhi' ? 6.5 : 4.5}
                      fill="#204110"
                      stroke="#ffffff"
                      strokeWidth={1.8}
                    />
                  </>
                )}
                <text
                  x={lx}
                  y={ly}
                  textAnchor={cfg.anchor}
                  dominantBaseline="middle"
                  fontSize="12.5"
                  fontWeight="800"
                  fill="#204110"
                  stroke="#ffffff"
                  strokeWidth="3.8"
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
          className="pointer-events-none absolute z-20 bg-white border border-gray-300 rounded-lg shadow-md px-3.5 py-2.5 text-xs text-gray-800 min-w-[225px]"
          style={{
            left: Math.min(mousePos.x + 14, 390),
            top: Math.max(mousePos.y - 18, 10),
          }}
        >
          <div className="flex items-center justify-between gap-2 border-b border-gray-100 pb-1 mb-1.5">
            <div>
              <span className="font-bold text-sm text-gray-900">
                {hoveredInfo.state}
              </span>
              {hoveredInfo.rawGeoName !== hoveredInfo.state && (
                <span className="block text-[10px] text-gray-500">
                  Polygon: {hoveredInfo.rawGeoName} (Combined J&amp;K Grid)
                </span>
              )}
            </div>
            {hoveredInfo.isFocus ? (
              <span
                className="px-1.5 py-0.5 rounded text-[10px] font-semibold text-white shrink-0"
                style={{ backgroundColor: '#204110' }}
              >
                Focus State
              </span>
            ) : (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600 shrink-0">
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
                    ? `${hoveredInfo.record.avg_demand_MU.toFixed(1)} MU/day`
                    : 'No data'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Typical Demand:</span>
                <span className="font-medium">
                  {hoveredInfo.record.typical_MU !== null
                    ? `${hoveredInfo.record.typical_MU.toFixed(1)} MU/day`
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
              <div
                className="mt-1.5 pt-1 border-t border-gray-100 text-[11px] font-semibold"
                style={{
                  color: hoveredInfo.isFocus ? '#204110' : '#375f25',
                }}
              >
                {hoveredInfo.isFocus
                  ? 'Click to open in State Explorer →'
                  : 'Click to view state summary & demand →'}
              </div>
            </div>
          ) : (
            <div className="text-gray-500 py-1">
              <span className="font-semibold text-gray-700">No data</span> in
              POSOCO telemetry for this territory.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
