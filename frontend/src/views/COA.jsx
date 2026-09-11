import { useEffect, useRef, useState } from 'react';
import { Chart, registerables } from 'chart.js';
import { useAPI } from '../hooks/useAPI';
import { useToast } from '../hooks/useToast';
import { getTrains, getWindows, getGoodsForecast } from '../api/coa';
import { createBlock, checkConflict } from '../api/blocks';
import Modal from '../components/Modal';

Chart.register(...registerables);

const DEPTS = ['engg', 'trd', 'st'];
const DEPT_LABELS = { engg: 'Engineering', trd: 'TRD', st: 'S&T' };
const HOURS = Array.from({ length: 24 }, (_, i) => i);

// "00:00 – 02:00" -> [0, 2]. Windows are always plain on-the-hour ranges —
// see routers/coa.py's get_block_windows, which is what generates these.
function parseWindowTime(time) {
  const m = /^(\d{1,2}):00\s*[–-]\s*(\d{1,2}):00$/.exec(time || '');
  return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : [0, 24];
}

export default function COA() {
  const showToast = useToast();
  const { data: trains } = useAPI(getTrains, [], []);
  const { data: windows, refetch: refetchWindows } = useAPI(getWindows, [], []);
  const { data: goods } = useAPI(getGoodsForecast, [], null);
  const goodsRef = useRef(null);
  const goodsChart = useRef(null);

  const [showModal, setShowModal] = useState(false);
  const [windowBounds, setWindowBounds] = useState([0, 24]);
  const [form, setForm] = useState(null);
  const [conflict, setConflict] = useState(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!goodsRef.current || !goods) return;
    goodsChart.current?.destroy();
    goodsChart.current = new Chart(goodsRef.current, {
      type: 'bar',
      data: {
        labels: goods.labels,
        datasets: [{ label: 'Goods Trains', data: goods.data, backgroundColor: 'rgba(234,179,8,0.3)', borderColor: '#eab308', borderWidth: 1, borderRadius: 4 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#475569', font: { size: 10 } }, grid: { display: false } },
          y: { ticks: { color: '#475569', font: { size: 10 } }, grid: { color: 'rgba(15,23,42,0.06)' } },
        },
      },
    });
    return () => goodsChart.current?.destroy();
  }, [goods]);

  const windowColors = { Available: 'var(--ink-green)', Booked: 'var(--ink-orange)', Restricted: 'var(--ink-red)' };

  function openWindow(w) {
    if (w.type !== 'Available') return; // Booked/Restricted windows aren't bookable from here
    const [start, end] = parseWindowTime(w.time);
    setWindowBounds([start, end]);
    setForm({
      section: w.section, department: 'engg', label: '',
      start_hour: start, end_hour: Math.min(start + 2, end),
      date_offset: 0, priority: 'medium',
    });
    setConflict(null);
    setShowModal(true);
  }

  async function handleCheckConflict() {
    if (!form) return;
    setChecking(true);
    try {
      const res = await checkConflict({ section: form.section, start_hour: form.start_hour, end_hour: form.end_hour, date_offset: form.date_offset });
      setConflict(res);
    } catch {
      setConflict({ has_conflict: false, message: 'Could not check — backend offline' });
    } finally {
      setChecking(false);
    }
  }

  async function handleSave(force = false) {
    if (!form) return;
    if (!form.label) { showToast('warn', 'Give the block a label before scheduling it.'); return; }
    setSaving(true);
    try {
      await createBlock(form, { force });
      showToast('success', force ? `"${form.label}" force-scheduled despite the conflict.` : `"${form.label}" is on the schedule.`);
      setShowModal(false);
      setConflict(null);
      refetchWindows();
    } catch (err) {
      showToast('error', err?.response?.data?.detail || "Couldn't save that block — try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="view-container">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '16px' }}>
        {/* Train timetable */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="card">
            <div className="card-header">
              <div className="card-title">🚉 COA — Train Corridor List</div>
              <span className="rtag">LIVE</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr><th>Train Name</th><th>Departure</th><th>Arrival</th><th>Type</th><th>Status</th><th>Block Impact</th></tr>
                </thead>
                <tbody>
                  {(trains || []).map((t, i) => {
                    const typeColors = { trd: '#1d4ed8', engg: '#c2410c', st: '#15803d' };
                    const col = typeColors[t.cls] || '#64748b';
                    return (
                      <tr key={i}>
                        <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{t.name}</td>
                        <td style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.72rem' }}>{t.dep}</td>
                        <td style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.72rem' }}>{t.arr}</td>
                        <td><span style={{ color: col, background: col + '20', padding: '2px 6px', borderRadius: '3px', fontSize: '0.7rem', fontWeight: 700 }}>{t.cls.toUpperCase()}</span></td>
                        <td>
                          {t.on_time
                            ? <span style={{ color: 'var(--ink-green)', fontSize: '0.75rem' }}>● ON TIME</span>
                            : <span style={{ color: 'var(--ink-yellow)', fontSize: '0.75rem' }}>● {t.delay}min LATE</span>}
                        </td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Unaffected</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Goods forecast chart */}
          <div className="card">
            <div className="card-header"><div className="card-title">📦 Goods Train Distribution — Hourly</div></div>
            <div style={{ height: '160px' }}>
              <canvas ref={goodsRef} />
            </div>
          </div>
        </div>

        {/* Block windows */}
        <div className="card">
          <div className="card-header"><div className="card-title">Available Block Windows</div></div>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
            Click a green "Available" window to schedule a block in it.
          </div>
          <div id="blockWindowsList" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {(windows || []).map((w, i) => {
              const col = windowColors[w.type] || 'var(--ink-green)';
              const clickable = w.type === 'Available';
              return (
                <div
                  key={i}
                  className={`block-window ${clickable ? 'block-window-clickable' : ''}`}
                  onClick={() => openWindow(w)}
                  title={clickable ? 'Click to schedule a block in this window' : undefined}
                  style={{ cursor: clickable ? 'pointer' : 'default' }}
                >
                  <div>
                    <div className="bw-time">{w.time}</div>
                    <div className="bw-section">{w.section}</div>
                  </div>
                  <div className="bw-available" style={{ color: col }}>
                    {w.type}{w.trains > 0 ? ` (${w.trains} trains)` : ''}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Schedule-into-window modal */}
      <Modal show={showModal && !!form} onClose={() => setShowModal(false)} title="🗓️ Schedule Block in This Window">
        {form && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              {form.section} — available {windowBounds[0]}:00–{windowBounds[1]}:00 today
            </div>

            <div className="form-group">
              <label className="form-label">Block Label</label>
              <input className="form-input" placeholder="e.g. Rail Fracture Repair" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label">Department</label>
                <select className="form-select" value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}>
                  {DEPTS.map(d => <option key={d} value={d}>{DEPT_LABELS[d]}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Priority</label>
                <select className="form-select" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Start Hour</label>
                <select className="form-select" value={form.start_hour} onChange={e => setForm(f => ({ ...f, start_hour: +e.target.value }))}>
                  {HOURS.filter(h => h >= windowBounds[0] && h < windowBounds[1]).map(h => <option key={h} value={h}>{h.toString().padStart(2, '0')}:00</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">End Hour</label>
                <select className="form-select" value={form.end_hour} onChange={e => setForm(f => ({ ...f, end_hour: +e.target.value }))}>
                  {HOURS.filter(h => h > form.start_hour && h <= windowBounds[1]).map(h => <option key={h} value={h}>{h.toString().padStart(2, '0')}:00</option>)}
                </select>
              </div>
            </div>

            <button className="btn-secondary" onClick={handleCheckConflict} disabled={checking}>
              {checking ? '⚙️ Checking...' : '🔍 Check Conflicts'}
            </button>

            {conflict && (
              <div style={{ padding: '10px 14px', borderRadius: '8px', border: `1px solid ${conflict.has_conflict ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`, background: conflict.has_conflict ? 'rgba(239,68,68,0.06)' : 'rgba(34,197,94,0.06)', fontSize: '0.8rem', color: conflict.has_conflict ? '#dc2626' : '#15803d' }}>
                {conflict.has_conflict ? '⚠️ ' : '✅ '}{conflict.message}
                {conflict.suggestion && <div style={{ marginTop: '4px', color: 'var(--text-muted)', fontSize: '0.75rem' }}>{conflict.suggestion}</div>}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={() => handleSave(conflict?.has_conflict)} disabled={saving}>
                {saving ? 'Saving...' : conflict?.has_conflict ? '⚠️ Force Schedule Anyway' : 'Schedule Block'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
