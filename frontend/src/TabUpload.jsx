import { useState, useRef } from 'react';
import { calculateBatch } from './api.js';

const COLORS = { road: '#E8401C', rail: '#0F7B6C', sea: '#1A4FA0', air: '#7B2FBE' };
const MODE_LABELS = { road: '🚗 Road', rail: '🚆 Rail', sea: '🚢 Sea', air: '✈️ Air' };
const fmtKg = n => n >= 1e6 ? `${(n / 1e6).toFixed(3)} Mt` : n >= 1000 ? `${(n / 1000).toFixed(1)} kt` : `${(n || 0).toFixed(1)} kg`;

export default function TabUpload() {
  const [file, setFile]         = useState(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult]     = useState(null);   // BatchSummary
  const [error, setError]       = useState(null);
  const inputRef = useRef();

  function pickFile(f) {
    if (!f) return;
    if (!f.name.endsWith('.csv')) { setError('Only .csv files are accepted.'); return; }
    setFile(f);
    setResult(null);
    setError(null);
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    setResult(null);
    try {
      const data = await calculateBatch(file);
      setResult(data);
    } catch (e) {
      setError(e.message || 'Upload failed — is the backend running?');
    } finally {
      setUploading(false);
    }
  }

  function reset() {
    setFile(null);
    setResult(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  const cardStyle = { background: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 2px 10px rgba(0,0,0,0.06)', marginBottom: 14 };
  const btnPrimary = (disabled) => ({
    padding: '11px 28px', borderRadius: 9, border: 'none',
    background: disabled ? '#CBD5E1' : '#1A3C6B', color: '#fff',
    fontWeight: 700, fontSize: 14, cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit', transition: 'background 0.15s',
  });

  return (
    <div>
      {/* ── HEADER CARD ───────────────────────────────────────── */}
      <div style={{ ...cardStyle, borderLeft: '4px solid #1A3C6B' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: '#1E293B' }}>
          Batch CSV Upload
        </h3>
        <p style={{ margin: 0, fontSize: 12, color: '#6B7280' }}>
          Upload a CSV file containing transport records from any agency. Columns are auto-mapped — accepted names include
          <code style={{ background: '#F1F5F9', padding: '1px 5px', borderRadius: 4, margin: '0 3px', fontSize: 11 }}>mode</code>,
          <code style={{ background: '#F1F5F9', padding: '1px 5px', borderRadius: 4, margin: '0 3px', fontSize: 11 }}>distance_km</code>,
          <code style={{ background: '#F1F5F9', padding: '1px 5px', borderRadius: 4, margin: '0 3px', fontSize: 11 }}>fuel_code</code>,
          <code style={{ background: '#F1F5F9', padding: '1px 5px', borderRadius: 4, margin: '0 3px', fontSize: 11 }}>quantity</code> and more.
          All results are stored in the database and visible in the <strong>Records</strong> tab.
        </p>
      </div>

      {/* ── DROP ZONE ─────────────────────────────────────────── */}
      <div
        style={{
          ...cardStyle,
          border: `2px dashed ${dragging ? '#1A3C6B' : file ? '#10B981' : '#CBD5E1'}`,
          background: dragging ? '#EFF6FF' : '#fff',
          textAlign: 'center',
          padding: '32px 20px',
          cursor: 'pointer',
          transition: 'all 0.15s',
        }}
        onClick={() => !file && inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); pickFile(e.dataTransfer.files[0]); }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          style={{ display: 'none' }}
          onChange={e => pickFile(e.target.files[0])}
        />
        {file ? (
          <div>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#065F46' }}>{file.name}</div>
            <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>
              {(file.size / 1024).toFixed(1)} KB · CSV
            </div>
            <button
              onClick={e => { e.stopPropagation(); reset(); }}
              style={{ marginTop: 10, padding: '4px 14px', borderRadius: 6, border: '1px solid #E5E7EB', background: '#fff', fontSize: 11, cursor: 'pointer', color: '#6B7280', fontFamily: 'inherit' }}
            >
              Remove
            </button>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 36, marginBottom: 8 }}>📤</div>
            <div style={{ fontWeight: 600, fontSize: 14, color: '#374151' }}>Drop CSV here or click to browse</div>
            <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 6 }}>Accepts .csv files only</div>
          </div>
        )}
      </div>

      {/* ── UPLOAD BUTTON ─────────────────────────────────────── */}
      {!result && (
        <div style={{ textAlign: 'center', marginBottom: 14 }}>
          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            style={btnPrimary(!file || uploading)}
          >
            {uploading ? '⏳ Processing…' : '⬆ Upload & Calculate'}
          </button>
        </div>
      )}

      {/* ── ERROR BANNER ──────────────────────────────────────── */}
      {error && (
        <div style={{ ...cardStyle, background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', fontSize: 13 }}>
          ❌ <strong>Error:</strong> {error}
          <span style={{ marginLeft: 12, cursor: 'pointer', color: '#DC2626', fontWeight: 700 }} onClick={reset}>Try again</span>
        </div>
      )}

      {/* ── RESULTS ───────────────────────────────────────────── */}
      {result && (
        <div>
          {/* Summary row */}
          <div style={{ ...cardStyle, background: 'linear-gradient(135deg,#0F172A,#1A3C6B)', color: '#fff' }}>
            <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              Batch ID: {result.batch_id}
            </div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 11, opacity: 0.6 }}>Total CO₂</div>
                <div style={{ fontSize: 28, fontWeight: 800 }}>{fmtKg(result.total_kg_co2e)}</div>
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#4ADE80' }}>{result.rows_successful}</div>
                  <div style={{ fontSize: 10, opacity: 0.7 }}>Processed</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: result.rows_failed > 0 ? '#F87171' : '#4ADE80' }}>
                    {result.rows_failed}
                  </div>
                  <div style={{ fontSize: 10, opacity: 0.7 }}>Failed</div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>{result.total_rows}</div>
                  <div style={{ fontSize: 10, opacity: 0.7 }}>Total Rows</div>
                </div>
              </div>
            </div>
          </div>

          {/* By Mode breakdown */}
          {result.by_mode && Object.keys(result.by_mode).length > 0 && (
            <div style={cardStyle}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', marginBottom: 12 }}>
                CO₂ by Transport Mode
              </div>
              {Object.entries(result.by_mode)
                .sort((a, b) => b[1] - a[1])
                .map(([mode, kg]) => {
                  const maxKg = Math.max(...Object.values(result.by_mode));
                  const pct = maxKg > 0 ? (kg / maxKg) * 100 : 0;
                  const color = COLORS[mode] || '#64748B';
                  return (
                    <div key={mode} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                        <span style={{ fontWeight: 600, color: '#374151' }}>{MODE_LABELS[mode] || mode}</span>
                        <span style={{ fontWeight: 700, color }}>{fmtKg(kg)}</span>
                      </div>
                      <div style={{ background: '#F1F5F9', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, background: color, height: '100%', borderRadius: 4, transition: 'width 0.4s' }} />
                      </div>
                    </div>
                  );
                })}
            </div>
          )}

          {/* Failed rows */}
          {result.errors && result.errors.length > 0 && (
            <div style={cardStyle}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#991B1B', textTransform: 'uppercase', marginBottom: 10 }}>
                ⚠️ Failed Rows ({result.errors.length})
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: '#FEF2F2' }}>
                      {['Row', 'Error', 'Raw Data'].map(h => (
                        <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid #FECACA', color: '#7F1D1D' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.errors.map((e, i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#FFF5F5' }}>
                        <td style={{ padding: '6px 10px', fontWeight: 700, color: '#DC2626' }}>{e.row}</td>
                        <td style={{ padding: '6px 10px', color: '#991B1B' }}>{e.error}</td>
                        <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontSize: 10, color: '#6B7280', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {JSON.stringify(e.raw)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Upload another */}
          <div style={{ textAlign: 'center', marginBottom: 14 }}>
            <button onClick={reset} style={btnPrimary(false)}>
              ⬆ Upload Another File
            </button>
          </div>
        </div>
      )}

      {/* ── CSV FORMAT GUIDE ──────────────────────────────────── */}
      {!result && (
        <div style={{ ...cardStyle, borderLeft: '4px solid #0F7B6C' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>Accepted CSV Column Names</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, fontSize: 11 }}>
            {[
              ['mode', 'mode, transport_mode, type'],
              ['distance', 'distance_km, km, distance_mi, distance_nm'],
              ['fuel', 'fuel_code, fuel, fuel_type'],
              ['quantity', 'quantity, qty, passengers, pax, tonnes'],
              ['date', 'date, trip_date, record_date'],
              ['route', 'origin, destination, from, to'],
            ].map(([field, accepted]) => (
              <div key={field} style={{ background: '#F8FAFC', borderRadius: 7, padding: '8px 10px' }}>
                <div style={{ fontWeight: 700, color: '#1E293B', fontFamily: 'monospace' }}>{field}</div>
                <div style={{ color: '#6B7280', marginTop: 2 }}>{accepted}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
