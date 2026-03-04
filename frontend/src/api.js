/**
 * API client — all fetch wrappers for the FastAPI backend.
 * Base URL is '/api' which Vite proxies to http://localhost:8000/api
 */

const BASE = '/api';

async function handleResponse(res) {
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.json();
      msg = body.detail || msg;
    } catch { /* body not JSON, keep statusText */ }
    throw new Error(msg);
  }
  return res.json();
}

/**
 * POST /api/calculate — single emission calculation, stored in DB.
 * @param {{ mode: string, distance_km: number, quantity?: number, fuel_code?: string, sub_mode?: string, trip_date?: string, origin?: string, destination?: string }} payload
 */
export async function calculateSingle(payload) {
  const res = await fetch(`${BASE}/calculate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

/**
 * POST /api/calculate/batch — upload a CSV file for bulk processing.
 * @param {File} file
 */
export async function calculateBatch(file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${BASE}/calculate/batch`, { method: 'POST', body: form });
  return handleResponse(res);
}

/**
 * GET /api/records — paginated list of stored records.
 * @param {{ mode?: string, limit?: number, offset?: number }} opts
 */
export async function getRecords({ mode, limit = 50, offset = 0 } = {}) {
  const params = new URLSearchParams({ limit, offset });
  if (mode) params.set('mode', mode);
  const res = await fetch(`${BASE}/records?${params}`);
  return handleResponse(res);
}

/**
 * GET /api/summary — aggregated CO₂ totals by mode (Redis cached 5min).
 */
export async function getSummary() {
  const res = await fetch(`${BASE}/summary`);
  return handleResponse(res);
}

/**
 * GET /api/factors — emission factor reference table.
 */
export async function getFactors() {
  const res = await fetch(`${BASE}/factors`);
  return handleResponse(res);
}
