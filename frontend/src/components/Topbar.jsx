import { useState, useEffect } from 'react';

const VIEW_LABELS = {
  'dashboard': 'Command Center',
  'ai-scheduler': 'AI Block Scheduler',
  'block-planner': 'Block Planner',
  'corridor-map': 'Corridor Map',
  'tms': 'TMS — Track Monitoring System',
  'smms': 'SMMS — Signal Maintenance',
  'tdms': 'TDMS — Traction Distribution',
  'coa': 'COA — Control Office Application',
  'analytics': 'Analytics & KPIs',
  'predictive': 'Predictive Engine',
  'reports': 'Weekly/Monthly Plans',
};

function getIST() {
  return new Date().toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
}

function getISTDate() {
  return new Date().toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
  });
}

const DEPT_LABEL = { engg: 'Engineering', st: 'Signal & Telecom', trd: 'Traction', coa: 'COA' };

export default function Topbar({ currentView, department, onNotifications, onMenuClick, notifCount = 0 }) {
  const [time, setTime] = useState(getIST());
  const [date, setDate] = useState(getISTDate());

  useEffect(() => {
    const id = setInterval(() => {
      setTime(getIST());
      setDate(getISTDate());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="menu-toggle" onClick={onMenuClick} title="Menu" aria-label="Toggle navigation">☰</button>
        <div className="topbar-breadcrumb">
          <span className="tb-zone">Northern Railway — ECR Division</span>
          <span style={{ color: 'var(--text-muted)' }}>›</span>
          <span className="tb-view">{VIEW_LABELS[currentView] || currentView}</span>
        </div>
      </div>

      <div className="topbar-right">
        {department && <span className="rtag" title="Signed in as">{DEPT_LABEL[department] || department}</span>}
        <div className="topbar-clock">
          <div className="clock-time">{time} IST</div>
          <div className="clock-date">{date}</div>
        </div>

        <button className="btn-icon notif-btn" onClick={onNotifications} title="Notifications">
          🔔
          {notifCount > 0 && (
            <span style={{
              position: 'absolute', top: '-4px', right: '-4px',
              background: '#ef4444', color: '#fff', fontSize: '0.6rem',
              borderRadius: '50%', width: '16px', height: '16px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{notifCount}</span>
          )}
        </button>
      </div>
    </header>
  );
}
