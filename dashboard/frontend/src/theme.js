// Strict Design Tokens per Project Specification
export const GREEN_TOKENS = [
  '#204110', // Darkest green (strongest low demand / highest model skill / Actual line)
  '#375f25',
  '#749764',
  '#a0bd85',
  '#c8d9c2', // Lightest green
];

export const RED_TOKENS = [
  '#6b0015', // Darkest red (highest demand / lowest model skill)
  '#850014',
  '#a50727',
  '#ae001a',
  '#e10531', // Bright red (Predicted line / initial high-demand alert)
];

export const NEUTRALS = {
  bg: '#ffffff',
  border: '#e5e7eb',
  mutedStroke: '#d1d5db',
  noDataFill: '#e5e7eb',
  textDark: '#1f2937',
  textMedium: '#4b5563',
  textMuted: '#6b7280',
};

export const FOCUS_STATES = ['Delhi', 'Maharashtra', 'Kerala', 'Uttar Pradesh'];

// 10-step scale from Green (low demand) -> Red (high demand)
export const DEMAND_LOW_TO_HIGH_PALETTE = [
  '#204110',
  '#375f25',
  '#749764',
  '#a0bd85',
  '#c8d9c2',
  '#e10531',
  '#ae001a',
  '#a50727',
  '#850014',
  '#6b0015',
];

// 10-step scale from Red (low R² / bad) -> Green (high R² / good)
export const SKILL_LOW_TO_HIGH_PALETTE = [
  '#6b0015',
  '#850014',
  '#a50727',
  '#ae001a',
  '#e10531',
  '#c8d9c2',
  '#a0bd85',
  '#749764',
  '#375f25',
  '#204110',
];

/**
 * Compute fill color for a state given the selected metric and value.
 */
export function getMetricColor(metric, value, minVal = 0, maxVal = 500) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return NEUTRALS.noDataFill;
  }
  const v = Number(value);

  if (metric === 'avg_demand') {
    // Log-scale normalization across Indian states (1 MU to ~550 MU) so both medium and large states show distinct steps
    const low = Math.log10(Math.max(1, minVal || 1));
    const high = Math.log10(Math.max(10, maxVal || 500));
    const norm = Math.min(1, Math.max(0, (Math.log10(Math.max(1, v)) - low) / (high - low || 1)));
    const idx = Math.min(9, Math.floor(norm * 10));
    return DEMAND_LOW_TO_HIGH_PALETTE[idx];
  }

  if (metric === 'vs_typical') {
    // Green = below typical (< 0%), Red = above typical (>= 0%)
    if (v < 0) {
      if (v <= -15) return '#204110';
      if (v <= -10) return '#375f25';
      if (v <= -6) return '#749764';
      if (v <= -2.5) return '#a0bd85';
      return '#c8d9c2';
    } else {
      if (v < 4) return '#e10531';
      if (v < 10) return '#ae001a';
      if (v < 18) return '#a50727';
      if (v < 28) return '#850014';
      return '#6b0015';
    }
  }

  if (metric === 'model_r2') {
    // Green = high R², Red = low R²
    if (v >= 0.96) return '#204110';
    if (v >= 0.94) return '#375f25';
    if (v >= 0.91) return '#749764';
    if (v >= 0.88) return '#a0bd85';
    if (v >= 0.84) return '#c8d9c2';
    if (v >= 0.75) return '#e10531';
    if (v >= 0.65) return '#ae001a';
    if (v >= 0.50) return '#a50727';
    if (v >= 0.30) return '#850014';
    return '#6b0015';
  }

  return NEUTRALS.noDataFill;
}

/**
 * GeoJSON NAME_1 -> Dataset state name mapping
 */
export const GEOJSON_TO_DATASET_STATE = {
  'Orissa': 'Odisha',
  'Uttaranchal': 'Uttarakhand',
  'Andaman and Nicobar': 'Andaman and Nicobar Islands',
  'NCT of Delhi': 'Delhi',
};

export function normalizeGeoStateName(geoName) {
  if (!geoName) return '';
  return GEOJSON_TO_DATASET_STATE[geoName] || geoName;
}
