import { useEffect, useRef, useState } from 'react';
import { Chart, registerables } from 'chart.js';
import { useAPI } from '../hooks/useAPI';
import { useToast } from '../hooks/useToast';
import { getRisks, getAnomalies, getShap, getForecast, getModelInfo } from '../api/predict';
import { createBlockSafely } from '../api/blocks';

Chart.register(...registerables);

export default function Predictive() {
  const showToast = useToast();
  const [scheduled, setScheduled] = useState({});
  const { data: risks } = useAPI(getRisks, [], []);
  const { data: anomalies } = useAPI(getAnomalies, [], []);
  const { data: shap } = useAPI(getShap, [], []);
  const { data: forecast } = useAPI(getForecast, [], null);
  const { data: modelInfo } = useAPI(getModelInfo, [], null);

  const forecastRef = useRef(null);
  const forecastChart = useRef(null);

  async function schedulePreventive(risk) {
    if (!risk.suggested_block) return;
    try {
      const block = await createBlockSafely(risk.suggested_block);
      setScheduled(s => ({ ...s, [risk.id]: true }));
      const shifted = block.start_hour !== risk.suggested_block.start_hour;
      showToast('success', shifted
        ? `Preventive block scheduled for ${risk.title} — moved to ${block.start_hour}:00 since the original slot was taken.`
        : `Preventive block scheduled for ${risk.title}.`);
    } catch (err) {
      showToast('error', err?.message || "Couldn't schedule that block — check the backend connection.");
    }
  }

  function explainAnomaly(anomaly) {
    const top3 = [...(shap || [])].sort((a, b) => b.val - a.val).slice(0, 3);
    const factors = top3.map(f => `${f.name.replace(/_/g, ' ')} (${(f.val * 100).toFixed(0)}%)`).join(', ');
    showToast('info', `Top factors for ${anomaly.asset}: ${factors || 'model still loading'}.`);
  }

  useEffect(() => {
    if (!forecastRef.current || !forecast) return;
    forecastChart.current?.destroy();
    forecastChart.current = new Chart(forecastRef.current, {
      type: 'line',
      data: {
        labels: forecast.labels,
        datasets: forecast.datasets.map(d => ({
          ...d,
          backgroundColor: d.borderColor + '0a',
          fill: true, tension: 0.4, pointRadius: 0,
        })),
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#475569', font: { size: 11 } } } },
        scales: {
          x: { ticks: { color: '#475569', font: { size: 9 }, maxTicksLimit: 10 }, grid: { color: 'rgba(15,23,42,0.06)' } },
          y: { ticks: { color: '#475569', font: { size: 9 } }, grid: { color: 'rgba(15,23,42,0.06)' }, min: 0, max: 100, title: { display: true, text: 'Health Score', color: '#475569', font: { size: 10 } } },
        },
      },
    });
    return () => forecastChart.current?.destroy();
  }, [forecast]);

  return (
    <div className="view-container">
      {/* Forecast chart */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div className="card-header">
          <div className="card-title">🔮 30-Day Asset Health Forecast — XGBoost Prediction</div>
          <span style={{ fontSize: '0.72rem', color: 'var(--ink-orange)' }}>XGBoost Model Active</span>
        </div>
        <div style={{ height: '220px' }}><canvas ref={forecastRef} /></div>
        <div style={{ display: 'flex', gap: '16px', marginTop: '10px', flexWrap: 'wrap' }}>
          {[{ label: 'Critical Threshold', col: '#ef4444' }, { label: 'Early Warning Zone', col: '#f97316' }, { label: 'Safe Operating Range', col: '#22c55e' }].map((m, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '20px', height: '2px', background: m.col }} />
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{m.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Model Performance — real train/test evaluation, not a claim */}
      {modelInfo?.accuracy != null && (
        <div className="card" style={{ marginBottom: '16px' }}>
          <div className="card-header">
            <div className="card-title">🧪 Model Performance — Trained &amp; Tested</div>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              {modelInfo.train_samples} train / {modelInfo.test_samples} held-out test samples
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '10px' }}>
            {[
              { label: 'Accuracy', val: modelInfo.accuracy, col: 'var(--ink-green)' },
              { label: 'Precision', val: modelInfo.precision, col: 'var(--ink-cyan)' },
              { label: 'Recall', val: modelInfo.recall, col: 'var(--ink-blue)' },
              { label: 'F1 Score', val: modelInfo.f1_score, col: 'var(--ink-purple)' },
              { label: 'ROC-AUC', val: modelInfo.roc_auc, col: 'var(--ink-orange)' },
            ].map((m, i) => (
              <div key={i} style={{ background: 'var(--bg-glass)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.3rem', fontWeight: 700, color: m.col, fontFamily: "'JetBrains Mono', monospace" }}>{(m.val * 100).toFixed(1)}%</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{m.label}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '10px', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
            XGBoost · {modelInfo.hyperparameters?.n_estimators} trees, depth {modelInfo.hyperparameters?.max_depth} · confusion matrix on held-out test set —{' '}
            TP {modelInfo.confusion_matrix?.true_positive}, TN {modelInfo.confusion_matrix?.true_negative}, FP {modelInfo.confusion_matrix?.false_positive}, FN {modelInfo.confusion_matrix?.false_negative}
          </div>
        </div>
      )}

      <div className="predictive-grid">
        {/* Risk Alerts */}
        <div className="card">
          <div className="card-header"><div className="card-title">⚠️ Failure Risk Alerts</div></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {(risks || []).map((r, i) => (
              <div key={i} className={`risk-alert ${r.level}`} style={{ padding: '10px 12px', borderRadius: '8px', border: `1px solid ${r.level === 'high' ? 'rgba(239,68,68,0.3)' : 'rgba(249,115,22,0.3)'}`, background: r.level === 'high' ? 'rgba(239,68,68,0.05)' : 'rgba(249,115,22,0.05)' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>{r.title}</div>
                <div style={{ height: '4px', background: 'var(--border-color)', borderRadius: '2px', marginBottom: '4px' }}>
                  <div style={{ width: `${r.prob}%`, height: '100%', background: r.level === 'high' ? '#ef4444' : '#f97316', borderRadius: '2px' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  <span>{r.prob}% failure probability</span><span>~{r.days} days</span>
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '8px' }}>{r.desc}</div>
                <button
                  className="btn-primary"
                  style={{ fontSize: '0.7rem', padding: '4px 10px', width: '100%', opacity: scheduled[r.id] ? 0.6 : 1 }}
                  disabled={!!scheduled[r.id]}
                  onClick={() => schedulePreventive(r)}
                >
                  {scheduled[r.id] ? '✓ Block Scheduled' : 'Schedule Preventive Block'}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Anomaly Detection */}
        <div className="card">
          <div className="card-header"><div className="card-title">📜 Anomaly Detection Log</div></div>
          <div id="anomalyLog" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {(anomalies || []).map((a, i) => (
              <div key={i} className="anomaly-item">
                <div className="anomaly-dot" style={{ background: a.bg }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>{a.asset}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{a.desc}</div>
                </div>
                <div className="anomaly-score">{(a.score * 100).toFixed(0)}%</div>
                <div className="anomaly-xai" onClick={() => explainAnomaly(a)} style={{ cursor: 'pointer' }}>XAI ↗</div>
              </div>
            ))}
          </div>
        </div>

        {/* SHAP Feature Importance */}
        <div className="card">
          <div className="card-header"><div className="card-title">🔬 XGBoost Feature Importance (SHAP)</div></div>
          <div id="shapVisual" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {(shap || []).map((f, i) => (
              <div key={i} className="shap-bar">
                <div className="shap-label" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  {f.name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </div>
                <div className="shap-track" style={{ height: '6px', background: 'var(--border-color)', borderRadius: '3px', position: 'relative' }}>
                  <div className="shap-fill" style={{ width: `${(f.val || 0) * 100}%`, height: '100%', background: f.color, borderRadius: '3px' }} />
                </div>
                <div className="shap-val" style={{ fontSize: '0.72rem', color: f.color, textAlign: 'right', marginTop: '2px' }}>{((f.val || 0) * 100).toFixed(0)}%</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
