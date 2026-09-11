import { useState, useEffect, useRef } from 'react';
import { useToast } from '../hooks/useToast';
import { optimize } from '../api/optimize';

const STEPS = [
  'Loading TMS defects and asset priority scores',
  'Fetching COA train timetable & goods forecast',
  'Analyzing corridor availability windows',
  'Running CP-SAT Constraint Solver (OR-Tools)',
  'Validating safety constraints & regulations',
  'Resolving multi-department conflicts',
  'Computing Pareto-optimal block schedule',
  'Generating maintenance block plan',
];

const DEPT_COLORS = { engg: '#c2410c', trd: '#1d4ed8', st: '#15803d' };
const DEPT_LABELS = { engg: 'Engineering', trd: 'TRD', st: 'S&T' };

export default function AIScheduler({ onNavigate, department }) {
  const showToast = useToast();
  const isCOA = department === 'coa' || !department;
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(-1);
  const [result, setResult] = useState(null);
  const [config, setConfig] = useState({
    horizon: 'weekly',
    priority: 'balanced',
    departments: isCOA ? ['engg', 'trd', 'st'] : [department],
    maxDuration: 4,
    trafficTolerance: 5,
  });
  const stepTimer = useRef(null);

  function toggleDept(d) {
    if (!isCOA) return; // a department can only ever optimize its own backlog
    setConfig(c => ({
      ...c,
      departments: c.departments.includes(d)
        ? c.departments.filter(x => x !== d)
        : [...c.departments, d],
    }));
  }

  async function runOptimization() {
    if (config.departments.length === 0) {
      showToast('warn', 'Select at least one department to optimize.');
      return;
    }
    setRunning(true);
    setResult(null);
    setStep(0);

    // Animate steps while waiting for API
    let currentStep = 0;
    stepTimer.current = setInterval(() => {
      currentStep += 1;
      setStep(currentStep);
      if (currentStep >= STEPS.length - 1) clearInterval(stepTimer.current);
    }, 900);

    try {
      const res = await optimize({
        horizon: config.horizon,
        priority: config.priority,
        departments: config.departments,
        max_duration_hours: config.maxDuration,
        traffic_tolerance: config.trafficTolerance,
      });
      clearInterval(stepTimer.current);
      setStep(STEPS.length);
      setResult(res);
      const scheduled = res.metrics?.blocks_scheduled || 0;
      const skipped = res.metrics?.blocks_skipped || 0;
      showToast('success',
        skipped > 0
          ? `Optimization complete — ${scheduled} block${scheduled === 1 ? '' : 's'} added to the schedule, ${skipped} skipped (already booked).`
          : `Optimization complete — ${scheduled} block${scheduled === 1 ? '' : 's'} added to the schedule.`);
    } catch (e) {
      clearInterval(stepTimer.current);
      showToast('error', "Optimization failed — check that the backend is running.");
      setRunning(false);
      setStep(-1);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="view-container">
      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '20px' }}>
        {/* Config Panel */}
        <div className="card">
          <div className="card-header"><div className="card-title">🤖 Optimizer Configuration</div></div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '0 4px' }}>
            <div className="form-group">
              <label className="form-label">Planning Horizon</label>
              <select className="form-select" value={config.horizon} onChange={e => setConfig(c => ({ ...c, horizon: e.target.value }))}>
                <option value="daily">Daily (Next 24 hours)</option>
                <option value="weekly">Weekly (7 days)</option>
                <option value="monthly">Monthly (30 days)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Optimization Priority</label>
              <select className="form-select" value={config.priority} onChange={e => setConfig(c => ({ ...c, priority: e.target.value }))}>
                <option value="availability">Maximize Availability</option>
                <option value="downtime">Minimize Downtime</option>
                <option value="safety">Prioritize Safety</option>
                <option value="balanced">Balanced (Recommended)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Departments</label>
              {isCOA ? (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {['engg', 'trd', 'st'].map(d => (
                    <button key={d}
                      onClick={() => toggleDept(d)}
                      style={{
                        padding: '6px 14px', borderRadius: '6px', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 600,
                        border: `1px solid ${config.departments.includes(d) ? DEPT_COLORS[d] : 'var(--border-color)'}`,
                        background: config.departments.includes(d) ? DEPT_COLORS[d] + '20' : 'transparent',
                        color: config.departments.includes(d) ? DEPT_COLORS[d] : 'var(--text-muted)',
                      }}>
                      {DEPT_LABELS[d]}
                    </button>
                  ))}
                </div>
              ) : (
                <div style={{
                  display: 'inline-flex', padding: '6px 14px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600,
                  border: `1px solid ${DEPT_COLORS[department]}`, background: DEPT_COLORS[department] + '20', color: DEPT_COLORS[department],
                }} title="This run is scoped to your own department">
                  {DEPT_LABELS[department] || department}
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Max Block Duration: <strong style={{ color: 'var(--ink-orange)' }}>{config.maxDuration}h</strong></label>
              <input type="range" className="form-range" min={1} max={8} value={config.maxDuration} onChange={e => setConfig(c => ({ ...c, maxDuration: +e.target.value }))} />
            </div>

            <div className="form-group">
              <label className="form-label">Traffic Tolerance: <strong style={{ color: 'var(--ink-orange)' }}>{config.trafficTolerance} trains</strong></label>
              <input type="range" className="form-range" min={0} max={20} value={config.trafficTolerance} onChange={e => setConfig(c => ({ ...c, trafficTolerance: +e.target.value }))} />
            </div>

            <button className="btn-primary" style={{ width: '100%', padding: '12px', fontSize: '0.85rem' }} onClick={runOptimization} disabled={running}>
              {running ? '⚙️ Running OR-Tools Solver...' : '🤖 Run AI Optimization'}
            </button>
          </div>
        </div>

        {/* Output Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Algorithm Progress */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">⚙️ Algorithm Execution</div>
              {running && <div style={{ fontSize: '0.75rem', color: 'var(--ink-orange)' }}>OR-Tools CP-SAT Solver running...</div>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {STEPS.map((s, i) => {
                const done = step > i;
                const active = step === i;
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', opacity: step < 0 ? 0.35 : 1 }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', flexShrink: 0,
                      background: done ? 'rgba(34,197,94,0.15)' : active ? 'rgba(249,115,22,0.15)' : 'var(--bg-glass)',
                      border: `1px solid ${done ? '#15803d' : active ? '#c2410c' : 'var(--border-color)'}`,
                      color: done ? '#15803d' : active ? '#c2410c' : 'var(--text-muted)',
                    }}>
                      {done ? '✓' : active ? '⚙' : i + 1}
                    </div>
                    <span style={{ fontSize: '0.8rem', color: done ? 'var(--text-secondary)' : active ? 'var(--text-primary)' : 'var(--text-muted)' }}>{s}</span>
                  </div>
                );
              })}
            </div>

            {running && (
              <div style={{ marginTop: '16px' }}>
                <div style={{ height: '4px', background: 'var(--border-color)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: 'var(--accent-orange)', borderRadius: '2px', width: `${((step + 1) / STEPS.length) * 100}%`, transition: 'width 0.5s ease' }} />
                </div>
              </div>
            )}
          </div>

          {/* Results */}
          {result && (
            <div className="card">
              <div className="card-header">
                <div className="card-title">✅ Optimization Results</div>
                <span style={{ fontSize: '0.75rem', color: 'var(--ink-green)' }}>OR-Tools: {result.metrics?.solver_status}</span>
              </div>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
                {[
                  { label: 'Blocks Scheduled', val: result.metrics?.blocks_scheduled || 0, col: 'var(--ink-orange)' },
                  { label: 'Downtime Saved', val: `${result.metrics?.downtime_saved_hours || 0}h`, col: 'var(--ink-green)' },
                  { label: 'Availability Score', val: `${result.metrics?.availability_score || 0}%`, col: 'var(--ink-cyan)' },
                  { label: 'Optimization Score', val: `${result.metrics?.optimization_score || 0}%`, col: 'var(--ink-purple)' },
                ].map((m, i) => (
                  <div key={i} style={{ flex: 1, minWidth: '120px', background: 'var(--bg-glass)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '1.4rem', fontWeight: 700, color: m.col }}>{m.val}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{m.label}</div>
                  </div>
                ))}
              </div>

              <div style={{ overflowX: 'auto', maxHeight: '320px', overflowY: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr><th>Section</th><th>Dept</th><th>Label</th><th>Day</th><th>Window</th><th>Priority</th></tr>
                  </thead>
                  <tbody>
                    {(result.blocks || []).map((b, i) => {
                      const col = DEPT_COLORS[b.dept] || '#64748b';
                      const priCol = b.priority === 'critical' ? '#dc2626' : b.priority === 'high' ? '#c2410c' : '#a16207';
                      return (
                        <tr key={i}>
                          <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{b.section}</td>
                          <td><span style={{ color: col, background: col + '20', padding: '2px 6px', borderRadius: '3px', fontSize: '0.7rem', fontWeight: 700 }}>{(b.dept || '').toUpperCase()}</span></td>
                          <td>{b.label}</td>
                          <td>Day {b.date_offset + 1}</td>
                          <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem' }}>{b.start_time}–{b.end_time}</td>
                          <td><span style={{ color: priCol, fontSize: '0.7rem', fontWeight: 600 }}>{(b.priority || '').toUpperCase()}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <button className="btn-primary" style={{ marginTop: '12px', width: '100%' }} onClick={() => onNavigate?.('block-planner')}>
                🗓️ View in Block Planner
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
