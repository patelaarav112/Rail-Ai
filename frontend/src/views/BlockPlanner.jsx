import { useState, Fragment } from 'react';
import { useToast } from '../hooks/useToast';
import { useAPI } from '../hooks/useAPI';
import { getBlocks, createBlock, checkConflict, getConflicts, parseBlockRequest, getParseModelInfo } from '../api/blocks';
import Modal from '../components/Modal';

const SECTIONS = ['NDLS-MTJ', 'MTJ-AGC', 'AGC-CNB', 'CNB-ALD', 'ALD-MGS', 'BPL-ET'];
const DEPTS = ['engg', 'trd', 'st'];
const DEPT_COLORS = { engg: '#c2410c', trd: '#1d4ed8', st: '#15803d' };
const DEPT_LABELS = { engg: 'Engineering', trd: 'TRD', st: 'S&T' };
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MODAL_DAY_OPTIONS = 14; // how far ahead the Add-Block modal lets you schedule
const MONTH_DAYS = 30;

function dateFor(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d;
}
function shortLabel(offset) {
  return dateFor(offset).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function BlockPlanner({ department }) {
  const showToast = useToast();
  const isCOA = department === 'coa' || !department;
  const { data: blocks, refetch } = useAPI(getBlocks, [], []);
  const { data: nluInfo } = useAPI(getParseModelInfo, [], null);
  const [view, setView] = useState('week');
  const [dayOffset, setDayOffset] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [conflict, setConflict] = useState(null);
  const [form, setForm] = useState({ section: 'NDLS-MTJ', department: isCOA ? 'engg' : department, label: '', start_hour: 2, end_hour: 4, date_offset: 0, priority: 'medium' });
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [scheduleAudit, setScheduleAudit] = useState(null);
  const [validating, setValidating] = useState(false);
  const [nlText, setNlText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseNote, setParseNote] = useState(null);

  function openModal() {
    setShowModal(true);
    setConflict(null);
    setNlText('');
    setParseNote(null);
  }

  async function handleFillWithAI() {
    if (!nlText.trim()) return;
    setParsing(true);
    setParseNote(null);
    setConflict(null);
    try {
      const res = await parseBlockRequest(nlText);
      const filled = {
        section: res.section,
        department: isCOA ? res.department : department,
        label: res.label,
        start_hour: res.start_hour,
        end_hour: res.end_hour,
        date_offset: res.date_offset,
        priority: res.priority,
      };
      setForm(f => ({ ...f, ...filled }));

      const parts = [`Filled from: "${nlText}"`];
      if (res.confidence !== 'high') parts.push(`${res.confidence} confidence`);
      if (res.notes) parts.push(res.notes);
      setParseNote({ ok: true, text: parts.join(' — ') });

      // Go straight to booking the parsed slot: check it, and either
      // schedule it immediately (the common case) or surface the conflict
      // so the user can decide whether to force it — instead of silently
      // stopping at "form filled" and leaving Check Conflicts/Schedule
      // Block as separate, easy-to-miss steps.
      await attemptSchedule(filled);
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Could not parse that — try rephrasing or fill the form manually.';
      setParseNote({ ok: false, text: msg });
      showToast('error', msg);
    } finally {
      setParsing(false);
    }
  }

  async function attemptSchedule(blockFields) {
    setSaving(true);
    try {
      const result = await checkConflict({
        section: blockFields.section, start_hour: blockFields.start_hour,
        end_hour: blockFields.end_hour, date_offset: blockFields.date_offset,
      });
      setConflict(result);
      if (!result.has_conflict) {
        await createBlock(blockFields);
        showToast('success', `"${blockFields.label}" scheduled on ${blockFields.section} — slot was clear.`);
        setShowModal(false);
        setConflict(null);
        refetch();
        setScheduleAudit(null);
      } else {
        showToast('warn', `That slot is already booked on ${blockFields.section} — review below or force-schedule anyway.`);
      }
    } catch (err) {
      showToast('error', err?.response?.data?.detail || "Couldn't check or schedule that slot — try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleValidateSchedule() {
    setValidating(true);
    try {
      const res = await getConflicts();
      setScheduleAudit(res);
      showToast(res.clean ? 'success' : 'warn',
        res.clean
          ? `Schedule validated — ${res.total_blocks} blocks, no conflicts.`
          : `${res.conflict_count} conflict${res.conflict_count === 1 ? '' : 's'} found across ${res.total_blocks} blocks.`);
    } catch {
      showToast('error', 'Could not validate the schedule — check the backend connection.');
    } finally {
      setValidating(false);
    }
  }

  async function handleCheckConflict() {
    setChecking(true);
    try {
      const res = await checkConflict({ section: form.section, start_hour: form.start_hour, end_hour: form.end_hour, date_offset: form.date_offset });
      setConflict(res);
    } catch {
      setConflict({ has_conflict: false, message: 'Could not check — backend offline' });
    } finally {
      setChecking(false);
    }
  }

  async function handleSave(force = false) {
    if (!form.label) { showToast('warn', 'Give the block a label before scheduling it.'); return; }
    setSaving(true);
    try {
      await createBlock(form, { force });
      showToast('success', force ? `"${form.label}" force-scheduled despite the conflict.` : `"${form.label}" is on the schedule.`);
      setShowModal(false);
      setConflict(null);
      refetch();
      setScheduleAudit(null); // stale until re-validated
    } catch (err) {
      showToast('error', err?.response?.data?.detail || "Couldn't save that block — try again.");
    } finally {
      setSaving(false);
    }
  }

  // Day and Week both render as an hour-precision Gantt; Month renders as a
  // per-day heatmap instead (hour bars 30 days wide would be unreadably thin).
  const spanDays = view === 'day' ? 1 : 7;
  const totalHours = spanDays * 24;
  const displayBlocks = view === 'day'
    ? (blocks || []).filter(b => b.date_offset === dayOffset)
    : (blocks || []).filter(b => b.date_offset < spanDays);

  function getBlockStyle(b) {
    const col = DEPT_COLORS[b.department] || '#64748b';
    const baseHour = view === 'day' ? 0 : b.date_offset * 24;
    const left = ((baseHour + b.start_hour) / totalHours) * 100;
    const width = ((b.end_hour - b.start_hour) / totalHours) * 100;
    return { position: 'absolute', left: `${left}%`, width: `${Math.max(width, view === 'day' ? 3 : 0.6)}%`, top: '4px', bottom: '4px', background: col + '30', border: `1px solid ${col}`, borderRadius: '4px', color: col, fontSize: '0.65rem', padding: '2px 6px', overflow: 'hidden', display: 'flex', alignItems: 'center', whiteSpace: 'nowrap', cursor: 'default' };
  }

  const ganttMinWidth = view === 'week' ? '900px' : 'auto';

  return (
    <div className="view-container">
      {/* Controls */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '4px' }}>
            {['week', 'day', 'month'].map(v => (
              <button key={v} className={view === v ? 'btn-primary' : 'btn-secondary'} style={{ padding: '6px 14px', fontSize: '0.78rem' }} onClick={() => setView(v)}>
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
          {view === 'day' && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button className="btn-secondary" onClick={() => setDayOffset(d => Math.max(0, d - 1))}>‹</button>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{shortLabel(dayOffset)}</span>
              <button className="btn-secondary" onClick={() => setDayOffset(d => d + 1)}>›</button>
            </div>
          )}
          {view === 'week' && (
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{shortLabel(0)} – {shortLabel(6)}</span>
          )}
          {view === 'month' && (
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{shortLabel(0)} – {shortLabel(MONTH_DAYS - 1)}</span>
          )}
          <button className="btn-secondary" style={{ marginLeft: 'auto' }} onClick={handleValidateSchedule} disabled={validating}>
            {validating ? '⚙️ Validating...' : '🛡️ Validate Schedule'}
          </button>
          <button className="btn-primary" onClick={openModal}>+ Add Block</button>
        </div>

        {scheduleAudit && (
          <div style={{
            marginTop: '12px', padding: '10px 14px', borderRadius: '8px',
            border: `1px solid ${scheduleAudit.clean ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
            background: scheduleAudit.clean ? 'rgba(34,197,94,0.05)' : 'rgba(239,68,68,0.05)',
          }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: scheduleAudit.clean ? '#15803d' : '#dc2626' }}>
              {scheduleAudit.clean
                ? `✅ Cross-checked ${scheduleAudit.total_blocks} assigned blocks — no overlaps found`
                : `⚠️ Cross-checked ${scheduleAudit.total_blocks} blocks — ${scheduleAudit.conflict_count} collision${scheduleAudit.conflict_count === 1 ? '' : 's'} found`}
            </div>
            {!scheduleAudit.clean && (
              <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {scheduleAudit.conflicts.map((c, i) => (
                  <div key={i} style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', padding: '6px 8px', background: 'rgba(15,23,42,0.035)', borderRadius: '4px' }}>
                    <strong style={{ color: '#dc2626' }}>{c.overlap_window}</strong> on <strong>{c.section}</strong> (day {c.date_offset}): {c.block_a.block_id} "{c.block_a.label}" ({c.block_a.department.toUpperCase()}) overlaps {c.block_b.block_id} "{c.block_b.label}" ({c.block_b.department.toUpperCase()})
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Gantt / Calendar */}
      <div className="card">
        <div className="card-header"><div className="card-title">🗓️ Maintenance Block Timeline</div></div>

        {view === 'month' ? (
          <div style={{ overflowX: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: `130px repeat(${MONTH_DAYS}, 30px)`, gap: '2px', minWidth: '1050px' }}>
              <div />
              {Array.from({ length: MONTH_DAYS }).map((_, i) => (
                <div key={i} style={{ fontSize: '0.58rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                  {dateFor(i).getDate()}
                </div>
              ))}
              {SECTIONS.map(sec => (
                <Fragment key={sec}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, alignSelf: 'center' }}>{sec}</div>
                  {Array.from({ length: MONTH_DAYS }).map((_, i) => {
                    const dayBlocks = (blocks || []).filter(b => b.section === sec && b.date_offset === i);
                    const col = dayBlocks[0] ? (DEPT_COLORS[dayBlocks[0].department] || '#64748b') : null;
                    return (
                      <div
                        key={i}
                        title={dayBlocks.length ? `${shortLabel(i)}: ${dayBlocks.map(b => b.label).join(', ')}` : `${shortLabel(i)}: no blocks`}
                        style={{
                          height: '26px', borderRadius: '3px',
                          background: col ? col + '22' : 'rgba(15,23,42,0.03)',
                          border: `1px solid ${col || 'var(--border-color)'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.62rem', fontWeight: 700, color: col || 'var(--text-muted)',
                        }}
                      >
                        {dayBlocks.length || ''}
                      </div>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: ganttMinWidth }}>
              {/* Header ticks */}
              <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', marginBottom: '4px' }}>
                <div />
                <div style={{ display: 'flex', position: 'relative', height: '20px' }}>
                  {view === 'day'
                    ? [0, 4, 8, 12, 16, 20, 24].map(h => (
                        <div key={h} style={{ position: 'absolute', left: `${(h / 24) * 100}%`, transform: 'translateX(-50%)', fontSize: '0.65rem', color: 'var(--text-muted)' }}>{h.toString().padStart(2, '0')}:00</div>
                      ))
                    : Array.from({ length: spanDays }).map((_, i) => (
                        <div key={i} style={{ position: 'absolute', left: `${(i * 24 / totalHours) * 100}%`, fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 600 }}>{shortLabel(i)}</div>
                      ))}
                </div>
              </div>

              {/* Rows per section */}
              {SECTIONS.map(sec => {
                const sectionBlocks = displayBlocks.filter(b => b.section === sec);
                return (
                  <div key={sec} style={{ display: 'grid', gridTemplateColumns: '130px 1fr', marginBottom: '2px' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', padding: '4px 8px 4px 0', alignSelf: 'center', fontWeight: 600 }}>{sec}</div>
                    <div style={{ position: 'relative', height: '36px', background: 'var(--bg-glass)', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                      {/* Grid lines: hour marks for Day, day-boundaries for Week */}
                      {view === 'day'
                        ? [6, 12, 18].map(h => (
                            <div key={h} style={{ position: 'absolute', left: `${(h / 24) * 100}%`, top: 0, bottom: 0, borderLeft: '1px solid rgba(15,23,42,0.06)' }} />
                          ))
                        : Array.from({ length: spanDays - 1 }).map((_, i) => (
                            <div key={i} style={{ position: 'absolute', left: `${((i + 1) * 24 / totalHours) * 100}%`, top: 0, bottom: 0, borderLeft: '1px solid rgba(15,23,42,0.1)' }} />
                          ))}
                      {sectionBlocks.map((b, i) => (
                        <div key={i} style={getBlockStyle(b)} title={`${b.label} — ${shortLabel(b.date_offset)} ${b.start_hour}:00-${b.end_hour}:00`}>
                          {b.label}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Legend */}
        <div style={{ display: 'flex', gap: '16px', marginTop: '12px', flexWrap: 'wrap' }}>
          {Object.entries(DEPT_COLORS).map(([k, c]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: c + '40', border: `1px solid ${c}` }} />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{DEPT_LABELS[k]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Add Block Modal */}
      <Modal show={showModal} onClose={() => setShowModal(false)} title="🗓️ Schedule Maintenance Block">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="form-group" style={{ padding: '12px', borderRadius: 'var(--radius-md)', background: 'var(--bg-glass)', border: '1px solid var(--border-color)' }}>
            <label className="form-label">✨ Describe it in plain English</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                className="form-input"
                placeholder="e.g. 2h track inspection on NDLS-MTJ next Tuesday night"
                value={nlText}
                onChange={e => setNlText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleFillWithAI(); } }}
              />
              <button className="btn-secondary" style={{ whiteSpace: 'nowrap' }} onClick={handleFillWithAI} disabled={parsing || !nlText.trim()}>
                {parsing ? '✨ Reading...' : '✨ Fill with AI'}
              </button>
            </div>
            {parseNote && (
              <div style={{ marginTop: '8px', fontSize: '0.72rem', color: parseNote.ok ? 'var(--text-muted)' : 'var(--ink-red)' }}>
                {parseNote.text}
              </div>
            )}
            {nluInfo?.exact_match_accuracy != null && (
              <div style={{ marginTop: '8px', fontSize: '0.66rem', color: 'var(--text-muted)' }} title="Trained on services/nlu_scheduler.py's own generated corpus — GET /api/blocks/parse-model-info">
                🧪 Trained in-house on {nluInfo.train_samples + nluInfo.test_samples} generated phrases — {(nluInfo.exact_match_accuracy * 100).toFixed(0)}% field accuracy on {nluInfo.test_samples} held-out test phrases. No external API.
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Block Label</label>
            <input className="form-input" placeholder="e.g. Rail Fracture Repair" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="form-group">
              <label className="form-label">Section</label>
              <select className="form-select" value={form.section} onChange={e => setForm(f => ({ ...f, section: e.target.value }))}>
                {SECTIONS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Department</label>
              {isCOA ? (
                <select className="form-select" value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}>
                  {DEPTS.map(d => <option key={d} value={d}>{DEPT_LABELS[d]}</option>)}
                </select>
              ) : (
                <div className="form-input" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)', background: 'var(--bg-glass)' }} title="Your department can only schedule its own blocks">
                  {DEPT_LABELS[department] || department}
                </div>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Start Hour</label>
              <select className="form-select" value={form.start_hour} onChange={e => setForm(f => ({ ...f, start_hour: +e.target.value }))}>
                {HOURS.map(h => <option key={h} value={h}>{h.toString().padStart(2, '0')}:00</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">End Hour</label>
              <select className="form-select" value={form.end_hour} onChange={e => setForm(f => ({ ...f, end_hour: +e.target.value }))}>
                {HOURS.map(h => <option key={h} value={h}>{h.toString().padStart(2, '0')}:00</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Day</label>
              <select className="form-select" value={form.date_offset} onChange={e => setForm(f => ({ ...f, date_offset: +e.target.value }))}>
                {Array.from({ length: MODAL_DAY_OPTIONS }).map((_, i) => <option key={i} value={i}>{shortLabel(i)}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Priority</label>
              <select className="form-select" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          <button className="btn-secondary" onClick={handleCheckConflict} disabled={checking}>
            {checking ? '⚙️ Checking...' : '🔍 Check Conflicts'}
          </button>

          {conflict && (
            <div style={{ padding: '10px 14px', borderRadius: '8px', border: `1px solid ${conflict.has_conflict ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`, background: conflict.has_conflict ? 'rgba(239,68,68,0.06)' : 'rgba(34,197,94,0.06)', fontSize: '0.8rem', color: conflict.has_conflict ? '#dc2626' : '#15803d' }}>
              {conflict.has_conflict ? '⚠️ ' : '✅ '}{conflict.message}
              {conflict.suggestion && <div style={{ marginTop: '4px', color: 'var(--text-muted)', fontSize: '0.75rem' }}>{conflict.suggestion}</div>}
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={() => handleSave(conflict?.has_conflict)} disabled={saving}>
              {saving ? 'Saving...' : conflict?.has_conflict ? '⚠️ Force Schedule Anyway' : 'Schedule Block'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
