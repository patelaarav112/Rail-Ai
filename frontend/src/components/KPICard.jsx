import { useEffect, useRef, useState } from 'react';

export default function KPICard({ label, value, unit = '', change, positive = true, icon = '📊', color = 'var(--ink-orange)', onClick }) {
  const [displayed, setDisplayed] = useState(0);
  const animRef = useRef(null);
  const target = parseFloat(value) || 0;

  useEffect(() => {
    const duration = 1400;
    const start = performance.now();
    const startVal = 0;

    function step(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setDisplayed(startVal + (target - startVal) * eased);
      if (progress < 1) animRef.current = requestAnimationFrame(step);
    }

    animRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animRef.current);
  }, [target]);

  const formatted = Number.isInteger(target)
    ? Math.round(displayed).toLocaleString()
    : displayed.toFixed(1);

  return (
    <div
      className="kpi-card"
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }) : undefined}
      style={onClick ? { cursor: 'pointer' } : undefined}
      title={onClick ? `View ${label} details` : undefined}
    >
      <div className="kpi-icon" style={{ color }}>{icon}</div>
      <div className="kpi-content">
        <div className="kpi-label">{label}</div>
        <div className="kpi-value" style={{ color }}>
          {formatted}{unit}
        </div>
        <div className="kpi-change" style={{ color: positive ? 'var(--ink-green)' : 'var(--ink-red)' }}>
          {positive ? '↑' : '↓'} {change}
        </div>
      </div>
    </div>
  );
}
