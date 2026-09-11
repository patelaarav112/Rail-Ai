import { useState, useEffect } from 'react';
import { useToast } from '../hooks/useToast';
import { optimize } from '../api/optimize';
import { getTicker } from '../api/dashboard';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Command Center', icon: '🏠', section: 'CORE MODULES', badge: 'live' },
  { id: 'ai-scheduler', label: 'AI Block Scheduler', icon: '🤖', section: null, badge: 'ai' },
  { id: 'block-planner', label: 'Block Planner', icon: '🗓️', section: null, badge: null },
  { id: 'corridor-map', label: 'Corridor Map', icon: '🗺️', section: null, badge: null },
  { id: 'tms', label: 'TMS Defects', icon: '🛤️', section: 'DATA SYSTEMS', badge: 'warn' },
  { id: 'smms', label: 'SMMS Assets', icon: '🚦', section: null, badge: 'ok' },
  { id: 'tdms', label: 'TDMS Assets', icon: '⚡', section: null, badge: 'ok' },
  { id: 'coa', label: 'COA Timetable', icon: '🚉', section: null, badge: null },
  { id: 'analytics', label: 'Analytics & KPIs', icon: '📊', section: 'INTELLIGENCE', badge: null },
  { id: 'predictive', label: 'Predictive Engine', icon: '🧠', section: null, badge: 'alert' },
  { id: 'reports', label: 'Weekly/Monthly Plans', icon: '📄', section: null, badge: null },
];

const BADGE_STYLES = {
  live: { bg: 'rgba(34,197,94,0.15)', color: '#15803d', text: 'LIVE' },
  ai: { bg: 'rgba(249,115,22,0.15)', color: '#c2410c', text: 'AI' },
  warn: { bg: 'rgba(239,68,68,0.15)', color: '#dc2626', text: '●' },
  ok: { bg: 'rgba(34,197,94,0.1)', color: '#15803d', text: '●' },
  alert: { bg: 'rgba(249,115,22,0.15)', color: '#c2410c', text: '⚡' },
};

const DEPT_LABEL = { engg: 'Engineering', st: 'Signal & Telecom', trd: 'Traction', coa: 'Control Office (COA)' };
const DEPT_HOME_VIEW = { engg: 'tms', st: 'smms', trd: 'tdms' };

export default function Sidebar({ currentView, department, allowedViews = [], onNavigate, onOptimize, onLogout, mobileOpen, onCloseMobile }) {
  const showToast = useToast();
  const [collapsed, setCollapsed] = useState(false);
  const [tickerMsg, setTickerMsg] = useState('Loading live train data...');
  const [tickerIdx, setTickerIdx] = useState(0);
  const [messages, setMessages] = useState([]);
  const isCOA = department === 'coa';
  const byId = id => NAV_ITEMS.find(item => item.id === id);

  // COA gets the full menu grouped the way NAV_ITEMS defines it. Every other
  // department gets its own module first, then the shared planning tools
  // (Block Planner, AI Scheduler, Corridor Map, Reports) — all scoped to
  // that department's own schedule server-side.
  const visibleItems = isCOA
    ? NAV_ITEMS.filter(item => allowedViews.includes(item.id))
    : [
        { ...byId(DEPT_HOME_VIEW[department]), section: 'MY MODULE' },
        { ...byId('block-planner'), section: 'PLANNING TOOLS' },
        byId('ai-scheduler'),
        byId('corridor-map'),
        byId('reports'),
      ].filter(item => item && item.id);

  useEffect(() => {
    if (!isCOA) return; // /dashboard/* is a Control-Office-only module
    getTicker().then(msgs => setMessages(msgs)).catch(() => {});
  }, [isCOA]);

  useEffect(() => {
    if (!messages.length) return;
    const id = setInterval(() => {
      setTickerIdx(i => (i + 1) % messages.length);
    }, 4000);
    return () => clearInterval(id);
  }, [messages]);

  useEffect(() => {
    if (messages[tickerIdx]) setTickerMsg(messages[tickerIdx]);
  }, [tickerIdx, messages]);

  async function handleOptimize() {
    showToast('info', 'Running the OR-Tools optimizer…');
    try {
      // Every department's quick-run is scoped to its own backlog server-side
      // regardless of what's sent here — only COA can span all three.
      const result = await optimize({ horizon: 'weekly', priority: 'balanced', departments: isCOA ? ['engg', 'trd', 'st'] : [department] });
      const n = result?.metrics?.blocks_scheduled ?? 0;
      const skipped = result?.metrics?.blocks_skipped ?? 0;
      showToast('success',
        skipped > 0
          ? `Optimization complete — ${n} block${n === 1 ? '' : 's'} added, ${skipped} skipped (already booked).`
          : `Optimization complete — ${n} block${n === 1 ? '' : 's'} added to the schedule.`);
    } catch {
      showToast('error', "Optimizer error — check the backend connection.");
    }
    onOptimize?.();
  }

  let lastSection = null;

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''} ${mobileOpen ? 'sidebar-mobile-open' : ''}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="logo-icon">🚆</div>
          {!collapsed && (
            <div className="logo-text">
              <div className="logo-title">RailMind AI</div>
              <div className="logo-sub">Block Planning System</div>
            </div>
          )}
        </div>
        <div className="sidebar-status">
          {!collapsed && (
            <>
              <span className="status-dot"></span>
              <span className="status-text">ALL SYSTEMS ONLINE</span>
            </>
          )}
        </div>
      </div>

      <nav className="sidebar-nav">
        {visibleItems.map(item => {
          const showSection = item.section && item.section !== lastSection;
          if (showSection) lastSection = item.section;
          const active = currentView === item.id;
          const badge = item.badge ? BADGE_STYLES[item.badge] : null;

          return (
            <div key={item.id}>
              {showSection && !collapsed && (
                <div className="nav-section-label">{item.section}</div>
              )}
              <div
                className={`nav-item ${active ? 'active' : ''}`}
                onClick={() => { onNavigate(item.id); onCloseMobile?.(); }}
                title={collapsed ? item.label : ''}
              >
                <span className="nav-icon">{item.icon}</span>
                {!collapsed && <span className="nav-label">{item.label}</span>}
                {!collapsed && badge && (
                  <span className="nav-badge" style={{ background: badge.bg, color: badge.color }}>
                    {badge.text}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </nav>

      {!collapsed && (
        <>
          {isCOA && (
            <div className="ticker-bar">
              <span className="ticker-icon">🚆</span>
              <span className="ticker-text">{tickerMsg}</span>
            </div>
          )}

          {allowedViews.includes('ai-scheduler') && (
            <div style={{ padding: '12px 16px' }}>
              <button className="btn-primary" style={{ width: '100%', fontSize: '0.78rem', padding: '10px' }} onClick={handleOptimize}>
                🤖 Run AI Optimization
              </button>
            </div>
          )}

          <div className="sidebar-footer">
            <div className="sf-ai">
              <div className="sf-ai-dot"></div>
              <span>OR-Tools CP-SAT + XGBoost</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-primary)' }}>{DEPT_LABEL[department] || department}</div>
                <div className="sf-version">v2.5.0 — ECR Division</div>
              </div>
              <button
                onClick={onLogout}
                title="Sign out"
                style={{
                  background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: 'var(--ink-red)',
                  borderRadius: 'var(--radius-sm)', padding: '5px 10px', fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer',
                }}
              >
                Sign out
              </button>
            </div>
          </div>
        </>
      )}
    </aside>
  );
}
