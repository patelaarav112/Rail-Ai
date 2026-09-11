import { useEffect, useRef, useState } from 'react';
import { Chart, registerables } from 'chart.js';
import { useAPI } from '../hooks/useAPI';
import { useToast } from '../hooks/useToast';
import { getKPIs, getRecommendations, getActivity, getCorridorMapStatus, getKPIDetails } from '../api/dashboard';
import { createBlockSafely } from '../api/blocks';
import KPICard from '../components/KPICard';
import Modal from '../components/Modal';

Chart.register(...registerables);

const DEPT_COLORS = { engg: '#f97316', trd: '#3b82f6', st: '#22c55e' };

// Live Corridor Map layout — station x-coordinates and the real section
// each adjoining segment represents (see services/scheduler.py's
// CORRIDOR_SEGMENTS, which these must stay in sync with).
const STATIONS = [
  { x: 60, code: 'NDLS' }, { x: 210, code: 'MTJ' }, { x: 360, code: 'AGC' },
  { x: 510, code: 'CNB' }, { x: 660, code: 'ALD' }, { x: 780, code: 'MGS' }, { x: 840, code: 'HWH' },
];
const MAP_SEGMENTS = [
  { section: 'NDLS-MTJ' }, { section: 'MTJ-AGC' }, { section: 'AGC-CNB' },
  { section: 'CNB-ALD' }, { section: 'ALD-MGS' },
];
const STATUS_COLOR = { critical: '#ef4444', warn: '#f97316', ok: '#22c55e' };
const STATUS_RANK = { ok: 0, warn: 1, critical: 2 };
const worseStatus = (a, b) => (!a ? b || 'ok' : !b ? a : (STATUS_RANK[a] >= STATUS_RANK[b] ? a : b));

export default function Dashboard({ onNavigate }) {
  const showToast = useToast();
  const { data: kpis } = useAPI(getKPIs, [], null);
  const { data: recs } = useAPI(getRecommendations, [], []);
  const { data: activity, refetch: refetchActivity } = useAPI(getActivity, [], []);
  const { data: corridorMap } = useAPI(getCorridorMapStatus, [], null);
  const { data: kpiDetails } = useAPI(getKPIDetails, [], null);
  const [accepted, setAccepted] = useState({});
  const [detailKey, setDetailKey] = useState(null);

  const segStatus = Object.fromEntries((corridorMap?.segments || []).map(s => [s.section, s.status]));
  const stationStatus = {
    NDLS: segStatus['NDLS-MTJ'] || 'ok',
    MTJ: worseStatus(segStatus['NDLS-MTJ'], segStatus['MTJ-AGC']),
    AGC: worseStatus(segStatus['MTJ-AGC'], segStatus['AGC-CNB']),
    CNB: worseStatus(segStatus['AGC-CNB'], segStatus['CNB-ALD']),
    ALD: worseStatus(segStatus['CNB-ALD'], segStatus['ALD-MGS']),
    MGS: segStatus['ALD-MGS'] || 'ok',
    HWH: 'ok', // beyond the tracked network — no section data exists here
  };
  const branchStatus = corridorMap?.branch?.status || 'ok';
  const activeSegIndex = corridorMap?.active_block
    ? MAP_SEGMENTS.findIndex(seg => seg.section === corridorMap.active_block.section)
    : -1;
  const activeBoxX = activeSegIndex >= 0 ? (STATIONS[activeSegIndex].x + STATIONS[activeSegIndex + 1].x) / 2 : null;

  async function acceptRecommendation(rec) {
    if (!rec.suggested_block) return;
    try {
      const block = await createBlockSafely(rec.suggested_block);
      setAccepted(a => ({ ...a, [rec.id]: true }));
      const shifted = block.start_hour !== rec.suggested_block.start_hour;
      showToast('success', shifted
        ? `Scheduled: ${rec.title} — moved to ${block.start_hour}:00 since the original slot was taken.`
        : `Scheduled: ${rec.title}`);
      refetchActivity();
    } catch (err) {
      showToast('error', err?.message || "Couldn't schedule that block — check the backend connection.");
    }
  }

  const donutRef = useRef(null);
  const lineRef = useRef(null);
  const donutChart = useRef(null);
  const lineChart = useRef(null);

  // Auto-refresh activity log every 12s
  useEffect(() => {
    const id = setInterval(refetchActivity, 12000);
    return () => clearInterval(id);
  }, [refetchActivity]);

  // Asset health donut chart
  useEffect(() => {
    if (!donutRef.current) return;
    donutChart.current?.destroy();
    donutChart.current = new Chart(donutRef.current, {
      type: 'doughnut',
      data: {
        labels: ['Good (>80%)', 'Moderate (60-80%)', 'Critical (<60%)'],
        datasets: [{ data: [62, 26, 12], backgroundColor: ['#22c55e', '#f97316', '#ef4444'], borderWidth: 0, hoverOffset: 8 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { color: '#475569', font: { size: 11 }, padding: 16 } }, tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed}%` } } },
        cutout: '72%',
      },
    });
    return () => donutChart.current?.destroy();
  }, []);

  // Block efficiency line chart
  useEffect(() => {
    if (!lineRef.current) return;
    lineChart.current?.destroy();
    const labels = Array.from({ length: 14 }, (_, i) => `Day ${i + 1}`);
    lineChart.current = new Chart(lineRef.current, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'AI Optimized', data: labels.map((_, i) => 78 + i * 1.2 + Math.sin(i) * 2), borderColor: '#f97316', backgroundColor: 'rgba(249,115,22,0.08)', fill: true, tension: 0.4, pointRadius: 0 },
          { label: 'Manual Baseline', data: labels.map(() => 65), borderColor: '#475569', borderDash: [4, 4], fill: false, pointRadius: 0 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#475569', font: { size: 10 } } } },
        scales: {
          x: { ticks: { color: '#475569', font: { size: 9 } }, grid: { display: false } },
          y: { ticks: { color: '#475569', font: { size: 9 } }, grid: { color: 'rgba(15,23,42,0.06)' }, min: 55, max: 100 },
        },
      },
    });
    return () => lineChart.current?.destroy();
  }, []);

  const actLog = activity || [];
  const KPI_CONFIG = [
    { metricKey: 'availability', label: 'Asset Availability', value: kpis?.availability?.value || 94.7, unit: '%', change: kpis?.availability?.change || '+2.3% vs last week', icon: '📶', color: 'var(--ink-orange)', positive: true },
    { metricKey: 'blocks', label: 'Blocks Scheduled', value: kpis?.blocks?.value || 47, unit: '', change: kpis?.blocks?.change || '12 more than manual', icon: '🗓️', color: 'var(--ink-cyan)', positive: true },
    { metricKey: 'downtime', label: 'Downtime Saved', value: kpis?.downtime?.value || 18.5, unit: ' hrs', change: kpis?.downtime?.change || '31% reduction', icon: '⏱️', color: 'var(--ink-green)', positive: true },
    { metricKey: 'trains', label: 'Trains Managed', value: kpis?.trains?.value || 312, unit: '', change: kpis?.trains?.change || '97.8% punctuality', icon: '🚆', color: 'var(--ink-purple)', positive: true },
    { metricKey: 'tasks', label: 'Pending Tasks', value: kpis?.tasks?.value || 7, unit: '', change: kpis?.tasks?.change || '3 high priority', icon: '📋', color: 'var(--ink-yellow)', positive: false },
    { metricKey: 'ai_score', label: 'AI Score', value: kpis?.ai_score?.value || 91.2, unit: '', change: kpis?.ai_score?.change || 'Excellent', icon: '🧠', color: 'var(--ink-green)', positive: true },
  ];
  const detailTitle = KPI_CONFIG.find(k => k.metricKey === detailKey)?.label || '';

  function renderKPIDetail() {
    const d = kpiDetails?.[detailKey];
    if (!d) return <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading…</div>;

    const row = (label, value, color) => (
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-color)', fontSize: '0.82rem' }}>
        <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ fontWeight: 700, color: color || 'var(--text-primary)' }}>{value}</span>
      </div>
    );

    switch (detailKey) {
      case 'availability':
        return (
          <div>
            {d.by_category.map(c => <div key={c.category}>{row(c.category, `${c.value}%`)}</div>)}
            {row('Low-risk assets', `${d.low_risk_count} / ${d.total_count}`, 'var(--ink-green)')}
            {d.top_risk_assets.length > 0 && (
              <>
                <div style={{ marginTop: '12px', marginBottom: '6px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Highest-risk assets</div>
                {d.top_risk_assets.map(a => row(`${a.title} — ${a.location}`, `${a.failure_probability}%`, 'var(--ink-red)'))}
              </>
            )}
          </div>
        );
      case 'blocks':
        return (
          <div>
            {row('Total blocks', d.total)}
            <div style={{ marginTop: '12px', marginBottom: '6px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>By department</div>
            {Object.entries(d.by_department).map(([k, v]) => <div key={k}>{row(k, v)}</div>)}
            <div style={{ marginTop: '12px', marginBottom: '6px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>By priority</div>
            {Object.entries(d.by_priority).map(([k, v]) => <div key={k}>{row(k.charAt(0).toUpperCase() + k.slice(1), v)}</div>)}
          </div>
        );
      case 'downtime':
        return (
          <div>
            {row('Blocks in the 00:00–04:00 window', `${d.blocks_in_window} / ${d.total_blocks}`, 'var(--ink-green)')}
            {d.sample_blocks.length > 0 && (
              <>
                <div style={{ marginTop: '12px', marginBottom: '6px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Examples</div>
                {d.sample_blocks.map((b, i) => <div key={i}>{row(`${b.label} — ${b.section}`, `${b.start_hour}:00-${b.end_hour}:00`)}</div>)}
              </>
            )}
          </div>
        );
      case 'trains':
        return (
          <div>
            {row('On time', `${d.on_time} / ${d.total}`, 'var(--ink-green)')}
            {d.delayed.length > 0 && d.delayed.map((t, i) => <div key={i}>{row(t.name, `${t.delay} min late`, 'var(--ink-yellow)')}</div>)}
            <div style={{ marginTop: '12px', marginBottom: '6px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Corridors</div>
            {d.corridors.map((c, i) => <div key={i}>{row(`${c.name} (${c.zone})`, `${c.trains_today} trains · ${c.availability}%`)}</div>)}
          </div>
        );
      case 'tasks':
        return (
          <div>
            {row('Total pending', d.total_pending)}
            {row('Critical priority', d.critical_count, d.critical_count > 0 ? 'var(--ink-red)' : 'var(--ink-green)')}
            {d.top_items.length > 0 && (
              <>
                <div style={{ marginTop: '12px', marginBottom: '6px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Needs attention</div>
                {d.top_items.map((t, i) => <div key={i}>{row(`${t.title} — ${t.location}`, `${t.department} · ${t.severity}`, 'var(--ink-red)')}</div>)}
              </>
            )}
          </div>
        );
      case 'ai_score':
        return (
          <div>
            {row('Fleet AI score', `${d.score}%`, 'var(--ink-green)')}
            {row('Assets rated low-risk', `${d.low_risk_pct}%`)}
            <div style={{ marginTop: '12px', marginBottom: '6px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>What drives the model (SHAP)</div>
            {d.feature_importance.map(f => (
              <div key={f.name} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', width: '160px', flexShrink: 0 }}>{f.name.replace(/_/g, ' ')}</span>
                <div style={{ flex: 1, height: '6px', background: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: `${f.val * 100}%`, height: '100%', background: f.color }} />
                </div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', width: '36px', textAlign: 'right' }}>{Math.round(f.val * 100)}%</span>
              </div>
            ))}
          </div>
        );
      default:
        return null;
    }
  }

  return (
    <div className="view-container">
      {/* KPI Strip */}
      <div className="kpi-strip">
        {KPI_CONFIG.map((k, i) => (
          <KPICard key={i} {...k} onClick={() => setDetailKey(k.metricKey)} />
        ))}
      </div>

      <div className="dashboard-grid">
        {/* Corridor Map */}
        <div className="card span-2">
          <div className="card-header">
            <div className="card-title">🗺️ Live Corridor Map</div>
            <span className="rtag">LIVE</span>
          </div>
          <div className="map-container">
            <svg viewBox="0 0 900 300" width="100%" height="240">
              <defs>
                <marker id="arr" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                  <path d="M 0 0 L 6 3 L 0 6 z" fill="#475569" />
                </marker>
              </defs>
              {/* Segments — each colored by today's real status for that
                  section (see services/scheduler.get_corridor_map_status):
                  critical = an unresolved conflict, warn = a block is
                  running, ok = nothing scheduled today. */}
              {MAP_SEGMENTS.map((seg, i) => (
                <line
                  key={seg.section}
                  x1={STATIONS[i].x} y1={150} x2={STATIONS[i + 1].x} y2={150}
                  stroke={STATUS_COLOR[segStatus[seg.section] || 'ok']} strokeWidth={3}
                  markerEnd={i === MAP_SEGMENTS.length - 1 ? 'url(#arr)' : undefined}
                />
              ))}
              {/* MGS–HWH is decorative — no tracked section exists there */}
              <line x1={STATIONS[5].x} y1={150} x2={STATIONS[6].x} y2={150} stroke="#334155" strokeWidth={3} markerEnd="url(#arr)" />

              {/* Stations — each dot takes the worse of its two adjoining segments */}
              {STATIONS.map(s => {
                const status = stationStatus[s.code];
                const col = STATUS_COLOR[status];
                return (
                  <g key={s.code}>
                    <circle cx={s.x} cy={150} r={8} fill={col} stroke="#1e293b" strokeWidth={2} />
                    {status === 'critical' && <circle cx={s.x} cy={150} r={14} fill="none" stroke="#ef4444" strokeWidth={1} opacity={0.5} style={{ animation: 'pulse 1.5s infinite' }} />}
                    <text x={s.x} y={135} textAnchor="middle" fill="#475569" fontSize={11}>{s.code}</text>
                  </g>
                );
              })}

              {/* Active block indicator — only rendered when a real block is
                  scheduled today on one of the main-line segments */}
              {activeBoxX != null && (
                <g>
                  <rect x={activeBoxX - 55} y={135} width={110} height={30} rx={4} fill="rgba(249,115,22,0.3)" stroke="#f97316" strokeWidth={1} />
                  <text x={activeBoxX} y={153} textAnchor="middle" fill="#f97316" fontSize={9}>
                    {corridorMap.active_block.department.toUpperCase()} BLOCK — {corridorMap.active_block.start_hour}:00-{corridorMap.active_block.end_hour}:00
                  </text>
                </g>
              )}

              {/* BPL branch — colored by BPL-ET's real status the same way */}
              <line x1="510" y1="150" x2="600" y2="220" stroke={STATUS_COLOR[branchStatus]} strokeWidth={2} strokeDasharray="6,3" />
              <circle cx={600} cy={220} r={6} fill={STATUS_COLOR[branchStatus]} stroke="#1e293b" strokeWidth={2} />
              <text x={600} y={207} textAnchor="middle" fill="#475569" fontSize={10}>BPL</text>
            </svg>
          </div>
        </div>

        {/* AI Recommendations */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">🧠 AI Recommendations</div>
            <button className="btn-primary" style={{ fontSize: '0.7rem', padding: '4px 10px' }} onClick={() => onNavigate?.('ai-scheduler')}>Optimize All</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {(recs || []).map((r, i) => (
              <div key={r.id || i} className={`rec-card level-${r.level}`} style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid', borderColor: r.level === 'critical' ? 'rgba(239,68,68,0.3)' : r.level === 'high' ? 'rgba(249,115,22,0.3)' : 'var(--border-color)', background: r.level === 'critical' ? 'rgba(239,68,68,0.05)' : 'var(--bg-card)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                  <span style={{ fontSize: '0.65rem', fontWeight: 700, color: r.level === 'critical' ? 'var(--ink-red)' : r.level === 'high' ? 'var(--ink-orange)' : 'var(--ink-yellow)', background: r.level === 'critical' ? 'rgba(239,68,68,0.1)' : 'rgba(249,115,22,0.1)', padding: '1px 6px', borderRadius: '3px' }}>{r.priority}</span>
                  <button
                    className="btn-primary"
                    style={{ fontSize: '0.65rem', padding: '2px 8px', opacity: accepted[r.id] ? 0.6 : 1 }}
                    disabled={!!accepted[r.id]}
                    onClick={() => acceptRecommendation(r)}
                  >
                    {accepted[r.id] ? '✓ Scheduled' : 'Accept'}
                  </button>
                </div>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' }}>{r.title}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{r.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Asset Health Donut */}
        <div className="card">
          <div className="card-header"><div className="card-title">💚 Asset Health</div></div>
          <div style={{ height: '200px', position: 'relative' }}>
            <canvas ref={donutRef} />
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -70%)', textAlign: 'center' }}>
              <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--ink-orange)' }}>94.7%</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Availability</div>
            </div>
          </div>
        </div>

        {/* Block Efficiency Line Chart */}
        <div className="card span-2">
          <div className="card-header"><div className="card-title">📈 Block Efficiency — AI vs Manual</div></div>
          <div style={{ height: '180px' }}>
            <canvas ref={lineRef} />
          </div>
        </div>

        {/* Activity Log */}
        <div className="card span-2">
          <div className="card-header">
            <div className="card-title">📜 System Activity</div>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Auto-refresh 12s</span>
          </div>
          <div className="activity-log">
            {actLog.map((a, i) => (
              <div key={i} className="activity-item">
                <span className="activity-time">{a.time}</span>
                <span className={`activity-dot ${a.type}`}></span>
                <span className="activity-msg">{a.msg}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Modal show={!!detailKey} onClose={() => setDetailKey(null)} title={`${detailTitle} — Details`}>
        {renderKPIDetail()}
      </Modal>
    </div>
  );
}
