import { useState, useEffect, useCallback } from 'react';
import { getRecords } from './api.js';

const COLORS = { road: '#E8401C', rail: '#0F7B6C', sea: '#1A4FA0', air: '#7B2FBE' };
const MODE_ICONS = { road: '🚗', rail: '🚆', sea: '🚢', air: '✈️' };
const LIMIT = 50;

export default function TabRecords() {
  const [records, setRecords]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [modeFilter, setModeFilter] = useState('');
  const [offset, setOffset]         = useState(0);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getRecords({ mode: modeFilter || undefined, limit: LIMIT, offset });
      setRecords(data);
    } catch (e) {
      setError(e.message || 'Failed to load records');
    } finally {
      setLoading(false);
    }
  }, [modeFilter, offset]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  function changeMode(m) {
    setModeFilter(m);
    setOffset(0);
  }

  const cardStyle = { background: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 2px 10px rgba(0,0,0,0.06)', marginBottom: 14 };
  const filterBtn = (active) => ({
    padding: '7px 14px', borderRadius: 8,
    border: `2px solid ${active ? '#1A3C6B' : '#E5E7EB'}`,
    background: active ? '#1A3C6B' : '#fff',
    color: active ? '#fff' : '#374151',
    fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
  });
  const pagBtn = (disabled) => ({
    padding: '7px 16px', borderRadius: 8, border: '1.5px solid #E5E7EB',
    background: disabled ? '#F9FAFB' : '#fff', color: disabled ? '#CBD5E1' : '#374151',
    fontWeight: 600, fontSize: 12, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
  });

  return (
    <div>
      {/* ── FILTER BAR ────────────────────────────────────────── */}
      <div style={{ ...cardStyle, padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginRight: 4 }}>Filter:</span>
          {[['', 'All Modes'], ['road', '🚗 Road'], ['rail', '🚆 Rail'], ['sea', '🚢 Sea'], ['air', '✈️ Air']].map(([m, label]) => (
            <button key={m} onClick={() => changeMode(m)} style={filterBtn(modeFilter === m)}>
              {label}
            </button>
          ))}
          <button
            onClick={fetchRecords}
            style={{ marginLeft: 'auto', padding: '7px 14px', borderRadius: 8, border: '1.5px solid #E5E7EB', background: '#fff', color: '#374151', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* ── LOADING ───────────────────────────────────────────── */}
      {loading && (
        <div style={{ ...cardStyle, textAlign: 'center', color: '#6B7280', padding: '40px 20px' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>⏳</div>
          <div style={{ fontSize: 14 }}>Loading records…</div>
        </div>
      )}

      {/* ── ERROR ─────────────────────────────────────────────── */}
      {!loading && error && (
        <div style={{ ...cardStyle, background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', fontSize: 13 }}>
          <div style={{ fontSize: 20, marginBottom: 6 }}>⚠️</div>
          <strong>Could not load records</strong>
          <div style={{ marginTop: 4, color: '#7F1D1D' }}>{error}</div>
          <div style={{ marginTop: 8, fontSize: 12, color: '#DC2626' }}>
            Make sure the backend is running: <code>uvicorn main:app --reload</code>
          </div>
        </div>
      )}

      {/* ── EMPTY STATE ───────────────────────────────────────── */}
      {!loading && !error && records.length === 0 && (
        <div style={{ ...cardStyle, textAlign: 'center', padding: '40px 20px', color: '#6B7280' }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>📭</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 6 }}>No records yet</div>
          <div style={{ fontSize: 12 }}>
            Use the <strong>Calculator</strong> tab to save a calculation, or <strong>Upload</strong> a CSV file.
          </div>
        </div>
      )}

      {/* ── RECORDS TABLE ─────────────────────────────────────── */}
      {!loading && !error && records.length > 0 && (
        <div style={cardStyle}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#0F172A', color: '#fff' }}>
                  {['Date', 'Mode', 'Sub-mode', 'Origin → Destination', 'Distance (km)', 'Qty', 'CO₂ (kg)', 'CO₂ (t)', 'Source'].map(h => (
                    <th key={h} style={{ padding: '9px 11px', textAlign: 'left', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((rec, i) => {
                  const color = COLORS[rec.transport_mode] || '#64748B';
                  const icon  = MODE_ICONS[rec.transport_mode] || '🔲';
                  return (
                    <tr key={rec.id} style={{ background: i % 2 === 0 ? '#fff' : '#F8FAFC' }}>
                      <td style={{ padding: '7px 11px', color: '#6B7280', whiteSpace: 'nowrap' }}>
                        {rec.trip_date || '—'}
                      </td>
                      <td style={{ padding: '7px 11px', whiteSpace: 'nowrap' }}>
                        <span style={{ background: color + '18', color, padding: '2px 8px', borderRadius: 5, fontWeight: 700, fontSize: 11 }}>
                          {icon} {rec.transport_mode}
                        </span>
                      </td>
                      <td style={{ padding: '7px 11px', color: '#374151' }}>{rec.sub_mode || '—'}</td>
                      <td style={{ padding: '7px 11px', color: '#374151', whiteSpace: 'nowrap' }}>
                        {rec.origin && rec.destination
                          ? `${rec.origin} → ${rec.destination}`
                          : rec.origin || rec.destination || '—'}
                      </td>
                      <td style={{ padding: '7px 11px', fontFamily: 'monospace', color: '#374151', textAlign: 'right' }}>
                        {rec.distance_km?.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                      </td>
                      <td style={{ padding: '7px 11px', fontFamily: 'monospace', color: '#374151', textAlign: 'right' }}>
                        {rec.quantity}
                      </td>
                      <td style={{ padding: '7px 11px', fontFamily: 'monospace', fontWeight: 700, color, textAlign: 'right' }}>
                        {rec.kg_co2e?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '7px 11px', fontFamily: 'monospace', color: '#374151', textAlign: 'right' }}>
                        {rec.t_co2e?.toFixed(4)}
                      </td>
                      <td style={{ padding: '7px 11px' }}>
                        <span style={{
                          background: rec.source_format === 'csv' ? '#DBEAFE' : '#D1FAE5',
                          color: rec.source_format === 'csv' ? '#1E40AF' : '#065F46',
                          padding: '2px 7px', borderRadius: 5, fontSize: 10, fontWeight: 600,
                        }}>
                          {rec.source_format || 'api'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 12, borderTop: '1px solid #F1F5F9' }}>
            <span style={{ fontSize: 12, color: '#6B7280' }}>
              Showing {offset + 1}–{offset + records.length}
              {records.length === LIMIT ? '+' : ''}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setOffset(Math.max(0, offset - LIMIT))} disabled={offset === 0} style={pagBtn(offset === 0)}>
                ← Previous
              </button>
              <button onClick={() => setOffset(offset + LIMIT)} disabled={records.length < LIMIT} style={pagBtn(records.length < LIMIT)}>
                Next →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
