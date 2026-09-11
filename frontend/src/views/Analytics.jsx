import { useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';
import { useAPI } from '../hooks/useAPI';
import { getKPIs, getTrends, getDeptUtil, getDowntime, getPunctuality } from '../api/analytics';

Chart.register(...registerables);

function ChartCard({ title, children, style }) {
  return (
    <div className="card" style={style}>
      <div className="card-header"><div className="card-title">{title}</div></div>
      {children}
    </div>
  );
}

export default function Analytics() {
  const { data: kpis } = useAPI(getKPIs, [], []);
  const { data: trends } = useAPI(getTrends, [], null);
  const { data: deptUtil } = useAPI(getDeptUtil, [], null);
  const { data: downtime } = useAPI(getDowntime, [], null);
  const { data: punctuality } = useAPI(getPunctuality, [], null);

  const trendsRef = useRef(null);
  const deptRef = useRef(null);
  const downtimeRef = useRef(null);
  const punctRef = useRef(null);
  const chartsRef = useRef({});

  function buildChart(ref, key, config) {
    if (!ref.current) return;
    chartsRef.current[key]?.destroy();
    chartsRef.current[key] = new Chart(ref.current, config);
  }

  useEffect(() => {
    if (!trends) return;
    buildChart(trendsRef, 'trends', {
      type: 'line',
      data: { labels: trends.labels, datasets: trends.datasets.map(d => ({ ...d, backgroundColor: d.fill ? d.borderColor + '12' : undefined, tension: 0.4, pointRadius: 0, fill: !!d.fill, borderDash: d.fill ? undefined : [4, 4] })) },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#475569', font: { size: 11 } } } }, scales: { x: { ticks: { color: '#475569', font: { size: 9 }, maxTicksLimit: 8 }, grid: { color: 'rgba(15,23,42,0.06)' } }, y: { ticks: { color: '#475569', font: { size: 9 } }, grid: { color: 'rgba(15,23,42,0.06)' }, min: 55, max: 100 } } },
    });
    return () => chartsRef.current.trends?.destroy();
  }, [trends]);

  useEffect(() => {
    if (!deptUtil) return;
    buildChart(deptRef, 'deptUtil', {
      type: 'bar',
      data: { labels: deptUtil.labels, datasets: deptUtil.datasets.map(d => ({ ...d, borderRadius: 6 })) },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#475569', font: { size: 11 } } } }, scales: { x: { ticks: { color: '#475569' }, grid: { display: false } }, y: { ticks: { color: '#475569' }, grid: { color: 'rgba(15,23,42,0.06)' } } } },
    });
    return () => chartsRef.current.deptUtil?.destroy();
  }, [deptUtil]);

  useEffect(() => {
    if (!downtime) return;
    buildChart(downtimeRef, 'downtime', {
      type: 'bar',
      data: { labels: downtime.labels, datasets: downtime.datasets.map(d => ({ ...d, borderRadius: 6 })) },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#475569', font: { size: 11 } } } }, scales: { x: { ticks: { color: '#475569' }, grid: { display: false } }, y: { ticks: { color: '#475569' }, grid: { color: 'rgba(15,23,42,0.06)' } } } },
    });
    return () => chartsRef.current.downtime?.destroy();
  }, [downtime]);

  useEffect(() => {
    if (!punctuality) return;
    buildChart(punctRef, 'punc', {
      type: 'line',
      data: { labels: punctuality.labels, datasets: punctuality.datasets.map(d => ({ ...d, backgroundColor: '#22c55e18', fill: true, tension: 0.4, pointBackgroundColor: '#22c55e', pointRadius: 5 })) },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#475569' }, grid: { display: false } }, y: { ticks: { color: '#475569' }, grid: { color: 'rgba(15,23,42,0.06)' }, min: 85, max: 100 } } },
    });
    return () => chartsRef.current.punc?.destroy();
  }, [punctuality]);

  return (
    <div className="view-container">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <ChartCard title="📈 Asset Availability Trend — AI vs Manual (30 days)">
          <div style={{ height: '200px' }}><canvas ref={trendsRef} /></div>
        </ChartCard>
        <ChartCard title="📊 Department Block Utilization">
          <div style={{ height: '200px' }}><canvas ref={deptRef} /></div>
        </ChartCard>
        <ChartCard title="📉 Downtime Reduction — Before & After AI">
          <div style={{ height: '200px' }}><canvas ref={downtimeRef} /></div>
        </ChartCard>
        <ChartCard title="🚄 Train Punctuality Trend">
          <div style={{ height: '200px' }}><canvas ref={punctRef} /></div>
        </ChartCard>

        {/* KPI table */}
        <ChartCard title="📋 KPI Detail Table">
          <div className="kpi-table-grid">
            {(kpis || []).map((k, i) => (
              <div key={i} className="kpi-table-item">
                <div className="kti-label">{k.label}</div>
                <div className="kti-value" style={{ color: k.color }}>{k.val}</div>
                <div className="kti-change" style={{ color: 'var(--ink-green)' }}>{k.change}</div>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>
    </div>
  );
}
