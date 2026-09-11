import { useState, useEffect, lazy, Suspense } from 'react';
import { ToastProvider } from './hooks/useToast';
import { useAPI } from './hooks/useAPI';
import { getRisks } from './api/predict';
import { whoAmI } from './api/auth';
import { TOKEN_KEY, DEPT_KEY } from './api/client';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import Login from './views/Login';

const Dashboard   = lazy(() => import('./views/Dashboard'));
const AIScheduler = lazy(() => import('./views/AIScheduler'));
const BlockPlanner= lazy(() => import('./views/BlockPlanner'));
const CorridorMap = lazy(() => import('./views/CorridorMap'));
const TMS         = lazy(() => import('./views/TMS'));
const SMMS        = lazy(() => import('./views/SMMS'));
const TDMS        = lazy(() => import('./views/TDMS'));
const COA         = lazy(() => import('./views/COA'));
const Analytics   = lazy(() => import('./views/Analytics'));
const Predictive  = lazy(() => import('./views/Predictive'));
const Reports     = lazy(() => import('./views/Reports'));

const VIEWS = {
  'dashboard':    Dashboard,
  'ai-scheduler': AIScheduler,
  'block-planner':BlockPlanner,
  'corridor-map': CorridorMap,
  'tms':          TMS,
  'smms':         SMMS,
  'tdms':         TDMS,
  'coa':          COA,
  'analytics':    Analytics,
  'predictive':   Predictive,
  'reports':      Reports,
};

// Every individual department gets its own data module, plus the shared
// planning tools (Block Planner, Corridor Map, AI Scheduler, Weekly/Monthly
// Plans) scoped to that department's own schedule. COA (Control Office) is
// the only role with the full, fleet-wide system. This mirrors the access
// the backend actually enforces — see backend/services/security.py and the
// per-department scoping in backend/routers/{blocks,optimize,reports}.py.
const SHARED_VIEWS = ['block-planner', 'corridor-map', 'ai-scheduler', 'reports'];
const DEPT_VIEWS = {
  engg: ['tms', ...SHARED_VIEWS],
  st: ['smms', ...SHARED_VIEWS],
  trd: ['tdms', ...SHARED_VIEWS],
  coa: Object.keys(VIEWS),
};
const DEPT_HOME = { engg: 'tms', st: 'smms', trd: 'tdms', coa: 'dashboard' };

function Loader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '12px', color: 'var(--text-muted)' }}>
      <div style={{ width: 24, height: 24, border: '2px solid var(--accent-orange)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      Loading...
    </div>
  );
}

export default function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [department, setDepartment] = useState(null);
  const [currentView, setCurrentView] = useState(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [optimizeKey, setOptimizeKey] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Restore a session on load — verify the stored token is still valid
  // rather than trusting it blindly.
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) { setAuthChecked(true); return; }
    whoAmI()
      .then(res => setDepartment(res.department))
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(DEPT_KEY);
      })
      .finally(() => setAuthChecked(true));
  }, []);

  // A 401 from any request (expired/invalid token) forces a fresh sign-in.
  useEffect(() => {
    const onUnauthorized = () => { setDepartment(null); setCurrentView(null); };
    window.addEventListener('railmind:unauthorized', onUnauthorized);
    return () => window.removeEventListener('railmind:unauthorized', onUnauthorized);
  }, []);

  // Land on the department's own page as soon as we know who's signed in.
  useEffect(() => {
    if (department) setCurrentView(DEPT_HOME[department]);
  }, [department]);

  const allowedViews = department ? DEPT_VIEWS[department] : [];
  const { data: alerts } = useAPI(department === 'coa' ? getRisks : () => Promise.resolve([]), [department], []);

  function handleLogin(dept) {
    setDepartment(dept);
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(DEPT_KEY);
    setDepartment(null);
    setCurrentView(null);
  }

  function navigate(view) {
    if (!allowedViews.includes(view)) return; // defense in depth — backend enforces this regardless
    setCurrentView(view);
    setMobileNavOpen(false);
  }

  if (!authChecked) return null; // avoid a login-page flash while verifying a stored session
  if (!department) return <Login onLogin={handleLogin} />;

  const ViewComponent = VIEWS[currentView] || VIEWS[DEPT_HOME[department]];

  return (
    <ToastProvider>
      <div className="app-layout">
        <Sidebar
          currentView={currentView}
          department={department}
          allowedViews={allowedViews}
          onNavigate={navigate}
          onOptimize={() => { navigate('ai-scheduler'); setOptimizeKey(k => k + 1); }}
          onLogout={handleLogout}
          mobileOpen={mobileNavOpen}
          onCloseMobile={() => setMobileNavOpen(false)}
        />
        {mobileNavOpen && <div className="sidebar-backdrop" onClick={() => setMobileNavOpen(false)} />}
        <div className="main-area">
          <Topbar
            currentView={currentView}
            department={department}
            onNotifications={() => setNotifOpen(o => !o)}
            onMenuClick={() => setMobileNavOpen(o => !o)}
            onLogout={handleLogout}
            notifCount={(alerts || []).length}
          />
          <main className="content-area">
            <Suspense fallback={<Loader />}>
              <ViewComponent key={currentView === 'ai-scheduler' ? optimizeKey : currentView} onNavigate={navigate} department={department} />
            </Suspense>
          </main>
        </div>

        {notifOpen && (
          <div className="notif-panel">
            <div className="notif-header">
              <div className="notif-title">Alerts from the predictive engine</div>
              <button onClick={() => setNotifOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>✕</button>
            </div>
            {department !== 'coa' ? (
              <div className="notif-item" style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                Fleet-wide alerts are visible to the Control Office (COA) only.
              </div>
            ) : (alerts || []).length === 0 ? (
              <div className="notif-item" style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                Nothing flagged right now — the fleet looks healthy.
              </div>
            ) : (
              alerts.map((a, i) => (
                <div key={i} className="notif-item">
                  <span style={{ color: a.level === 'high' ? '#dc2626' : '#a16207', fontWeight: 700, fontSize: '0.65rem', textTransform: 'uppercase' }}>{a.level}</span>
                  <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{a.title} — about {a.days} days out</p>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </ToastProvider>
  );
}
