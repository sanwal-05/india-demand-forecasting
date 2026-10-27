const API_BASE = 'http://127.0.0.1:8000/api';

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    let msg = `API error (${res.status})`;
    try {
      const errJson = await res.json();
      if (errJson?.detail) msg = errJson.detail;
    } catch {
      // ignore json parse error
    }
    throw new Error(msg);
  }
  return res.json();
}

export function fetchStates() {
  return request('/states');
}

export function fetchMapData({ metric = 'avg_demand', year = null, month = null } = {}) {
  const params = new URLSearchParams({ metric });
  if (year !== null && year !== '' && year !== 'all') params.set('year', String(year));
  if (month !== null && month !== '' && month !== 'all') params.set('month', String(month));
  return request(`/map?${params.toString()}`);
}

export function fetchTrends({ state = 'Delhi', granularity = 'day', start = '', end = '' } = {}) {
  const params = new URLSearchParams({ state, granularity });
  if (start) params.set('start', start);
  if (end) params.set('end', end);
  return request(`/trends?${params.toString()}`);
}

export function fetchPatterns(state = 'Delhi') {
  return request(`/patterns?state=${encodeURIComponent(state)}`);
}

export function fetchPredictions({ state = 'Delhi', featureSet = 'Set B', start = '', end = '' } = {}) {
  const params = new URLSearchParams({ state, feature_set: featureSet });
  if (start) params.set('start', start);
  if (end) params.set('end', end);
  return request(`/predictions?${params.toString()}`);
}

export function fetchModels(state = 'Delhi') {
  return request(`/models?state=${encodeURIComponent(state)}`);
}

export function fetchInsights() {
  return request('/insights');
}

export function fetchRecommendations() {
  return request('/recommendations');
}

export function fetchClimatology(state = 'Delhi') {
  return request(`/climatology?state=${encodeURIComponent(state)}`);
}

export function runSimulation(payload) {
  return request('/simulate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
