import { useState } from 'react';
import { useAPI } from '../hooks/useAPI';
import { useToast } from '../hooks/useToast';
import { getWeeklyReport, getReportSummary, getMonthlyStats } from '../api/reports';

const PRIORITY_COLORS = {
  CRITICAL: '#dc2626', HIGH: '#c2410c', MEDIUM: '#a16207', LOW: '#15803d',
};

function isoDate(d) { return d.toISOString().slice(0, 10); }
const TODAY = new Date();
const WEEK_AHEAD = new Date(TODAY.getTime() + 6 * 86400000);

export default function Reports() {
  const showToast = useToast();
  const { data: report, loading, refetch } = useAPI(getWeeklyReport, [], null);
  const { data: summary } = useAPI(getReportSummary, [], null);
  const { data: monthlyStats } = useAPI(getMonthlyStats, [], null);
  const [reportType, setReportType] = useState('weekly');
  const [zone, setZone] = useState('all');

  function handleGenerate() {
    showToast('info', 'Generating the block plan report…');
    setTimeout(() => {
      refetch();
      showToast('success', 'Report generated.');
    }, 1800);
  }

  function handleDownload() {
    if (!report?.rows?.length) { showToast('warn', 'Nothing to download yet — generate a report first.'); return; }
    const header = ['Date', 'Time', 'Section', 'Department', 'Work', 'Duration', 'Impact', 'Priority'];
    const csvRows = report.rows.map(r => [r.date, r.time, r.section, r.dept, r.work, r.duration, r.impact, r.priority]);
    const csv = [header, ...csvRows].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `railmind-${reportType}-block-plan.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('success', `Downloaded ${report.rows.length} rows as CSV.`);
  }

  async function handleShare() {
    if (!report) { showToast('warn', 'Nothing to share yet — generate a report first.'); return; }
    const text = `${report.title} (${report.period})\nAI Score: ${report.ai_score}% · Availability: ${report.availability}% · Downtime saved: ${report.downtime_saved}h\n${report.rows.length} blocks scheduled.`;
    try {
      await navigator.clipboard.writeText(text);
      showToast('success', 'Report summary copied to clipboard.');
    } catch {
      showToast('info', text);
    }
  }

  return (
    <div className="view-container">
      {/* Config */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Report Type</label>
            <select className="form-select" value={reportType} onChange={e => setReportType(e.target.value)} style={{ fontSize: '0.8rem', padding: '6px 10px' }}>
              <option value="weekly">Weekly Block Plan</option>
              <option value="monthly">Monthly Summary</option>
              <option value="maintenance">Maintenance Status</option>
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">From</label>
            <input type="date" className="form-input" defaultValue={isoDate(TODAY)} style={{ fontSize: '0.8rem', padding: '6px 10px' }} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">To</label>
            <input type="date" className="form-input" defaultValue={isoDate(WEEK_AHEAD)} style={{ fontSize: '0.8rem', padding: '6px 10px' }} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Zone</label>
            <select className="form-select" value={zone} onChange={e => setZone(e.target.value)} style={{ fontSize: '0.8rem', padding: '6px 10px' }}>
              <option value="all">All Zones</option><option value="nr">NR</option><option value="ecr">ECR</option><option value="wcr">WCR</option>
            </select>
          </div>
          <button className="btn-primary" style={{ padding: '8px 16px', fontSize: '0.8rem' }} onClick={handleGenerate}>⚙️ Generate Report</button>
          <button className="btn-secondary" style={{ padding: '8px 16px', fontSize: '0.8rem' }} onClick={handleDownload}>⬇ Download</button>
          <button className="btn-secondary" style={{ padding: '8px 16px', fontSize: '0.8rem' }} onClick={handleShare}>⊹ Share</button>
          <button className="btn-secondary" style={{ padding: '8px 16px', fontSize: '0.8rem' }} onClick={() => window.print()}>🖨 Print</button>
        </div>
      </div>

      {/* Summary stats strip — live from /api/reports/summary */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '16px' }}>
          {[
            { label: 'Total Blocks',      val: summary.total_blocks,                        col: 'var(--ink-orange)' },
            { label: 'Critical',          val: summary.priority_breakdown?.critical ?? 0,   col: '#dc2626' },
            { label: 'High',              val: summary.priority_breakdown?.high ?? 0,        col: '#c2410c' },
            { label: '0-Train Impact',    val: `${summary.zero_impact_pct}%`,               col: 'var(--ink-green)' },
            { label: 'AI Score',          val: `${summary.ai_optimization_score}%`,         col: 'var(--ink-cyan)' },
            { label: 'Downtime Saved',    val: `${summary.downtime_saved_hours}h`,           col: 'var(--ink-purple)' },
            ...(monthlyStats ? [
              { label: 'Monthly Adherence', val: `${monthlyStats.adherence_pct}%`, col: 'var(--ink-green)' },
              { label: 'Co-scheduled',      val: `${monthlyStats.co_scheduled_pct}%`, col: 'var(--ink-cyan)' },
            ] : []),
          ].map((s, i) => (
            <div key={i} className="card" style={{ padding: '10px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.15rem', fontWeight: 700, color: s.col }}>{s.val}</div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Report */}
      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>Generating report...</div>
      ) : report ? (
        <div className="card" id="reportContent">
          {/* Header */}
          <div style={{ textAlign: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '16px' }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '1px' }}>
              🚆 NORTHERN RAILWAY — EAST CENTRAL RAILWAY DIVISION
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--ink-orange)', marginTop: '4px' }}>{report.title}</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>Report Period: {report.period}</div>
            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginTop: '10px', flexWrap: 'wrap' }}>
              {[
                { label: 'AI Optimization Score', val: `${report.ai_score}%`, col: 'var(--ink-green)' },
                { label: 'Asset Availability', val: `${report.availability}%`, col: 'var(--ink-orange)' },
                { label: 'Downtime Saved', val: `${report.downtime_saved} hrs`, col: 'var(--ink-cyan)' },
              ].map((m, i) => (
                <div key={i} style={{ background: 'var(--bg-glass)', padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                  <div style={{ color: m.col, fontWeight: 700 }}>{m.val}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{m.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Schedule table */}
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr><th>Date</th><th>Time Window</th><th>Section</th><th>Department</th><th>Work Description</th><th>Duration</th><th>Train Impact</th><th>Priority</th></tr>
              </thead>
              <tbody>
                {(report.rows || []).map((r, i) => {
                  const col = PRIORITY_COLORS[r.priority] || '#64748b';
                  return (
                    <tr key={i}>
                      <td style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{r.date}</td>
                      <td style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.72rem', whiteSpace: 'nowrap' }}>{r.time}</td>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{r.section}</td>
                      <td><span className="rtag">{r.dept}</span></td>
                      <td>{r.work}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{r.duration}</td>
                      <td style={{ color: r.impact === '0 trains' ? 'var(--ink-green)' : 'var(--ink-yellow)', fontSize: '0.75rem' }}>{r.impact}</td>
                      <td><span style={{ color: col, background: col + '20', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>{r.priority}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* AI notes */}
          {report.ai_notes && (
            <div style={{ marginTop: '16px', padding: '12px 16px', borderRadius: '8px', background: 'rgba(249,115,22,0.05)', border: '1px solid rgba(249,115,22,0.2)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              <strong style={{ color: 'var(--ink-orange)' }}>🧠 AI Optimization Note: </strong>{report.ai_notes}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
