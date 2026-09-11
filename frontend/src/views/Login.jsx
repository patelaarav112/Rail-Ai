import { useState } from 'react';
import { login } from '../api/auth';
import { TOKEN_KEY, DEPT_KEY } from '../api/client';

const DEPARTMENTS = [
  { id: 'engg', icon: '🛤️', label: 'Engineering', sub: 'TMS — Track Defects' },
  { id: 'st', icon: '🚦', label: 'Signal & Telecom', sub: 'SMMS — Signal Assets' },
  { id: 'trd', icon: '⚡', label: 'Traction', sub: 'TDMS — Traction Assets' },
  { id: 'coa', icon: '🚉', label: 'Control Office', sub: 'COA — full system access' },
];

const DEMO_PASSWORDS = { engg: 'engg123', st: 'st123', trd: 'trd123', coa: 'coa123' };

export default function Login({ onLogin }) {
  const [dept, setDept] = useState(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showHint, setShowHint] = useState(false);

  function pick(id) {
    setDept(id);
    setPassword('');
    setError('');
  }

  async function submit(e) {
    e.preventDefault();
    if (!dept) return;
    setBusy(true);
    setError('');
    try {
      const res = await login(dept, password);
      localStorage.setItem(TOKEN_KEY, res.access_token);
      localStorage.setItem(DEPT_KEY, res.department);
      onLogin(res.department);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not sign in — check the backend connection.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #faf6ea 0%, #ffffff 55%, #eef4ff 100%)', padding: '24px',
    }}>
      <div style={{ width: '100%', maxWidth: '460px' }}>
        <div style={{ textAlign: 'center', marginBottom: '22px' }}>
          <div style={{ fontSize: '2.2rem', lineHeight: 1 }}>🚆</div>
          <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: '1.5rem', color: 'var(--text-primary)', letterSpacing: '0.03em', marginTop: '6px' }}>
            RailMind AI
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            Sign in with your department to continue
          </div>
        </div>

        <div className="card" style={{ padding: '24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '18px' }}>
            {DEPARTMENTS.map(d => (
              <button
                key={d.id}
                type="button"
                onClick={() => pick(d.id)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px',
                  padding: '12px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                  textAlign: 'left', fontFamily: 'inherit',
                  border: `1.5px solid ${dept === d.id ? 'var(--accent-blue)' : 'var(--border-soft)'}`,
                  background: dept === d.id ? 'rgba(59,130,246,0.07)' : 'var(--bg-glass)',
                  transition: 'all 150ms ease',
                }}
              >
                <span style={{ fontSize: '1.3rem' }}>{d.icon}</span>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>{d.label}</span>
                <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>{d.sub}</span>
              </button>
            ))}
          </div>

          <form onSubmit={submit}>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                className="form-input"
                type="password"
                placeholder={dept ? `Password for ${DEPARTMENTS.find(d => d.id === dept).label}` : 'Choose a department above first'}
                value={password}
                disabled={!dept}
                onChange={e => setPassword(e.target.value)}
                autoFocus
              />
            </div>

            {error && (
              <div style={{ fontSize: '0.78rem', color: 'var(--ink-red)', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 'var(--radius-md)', padding: '8px 12px', marginBottom: '12px' }}>
                {error}
              </div>
            )}

            <button className="btn-primary full-width" style={{ width: '100%', padding: '11px', fontSize: '0.85rem' }} disabled={!dept || !password || busy}>
              {busy ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <div style={{ marginTop: '14px', textAlign: 'center' }}>
            <button
              type="button"
              onClick={() => setShowHint(h => !h)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.7rem', color: 'var(--text-muted)', textDecoration: 'underline' }}
            >
              {showHint ? 'Hide demo credentials' : 'Show demo credentials'}
            </button>
            {showHint && (
              <div style={{ marginTop: '8px', fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.7 }}>
                {DEPARTMENTS.map(d => (
                  <div key={d.id}>{d.label}: <strong style={{ color: 'var(--text-secondary)' }}>{DEMO_PASSWORDS[d.id]}</strong></div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          Control Office (COA) sees every department · each department gets its own module plus planning tools scoped to its own schedule
        </div>
      </div>
    </div>
  );
}
