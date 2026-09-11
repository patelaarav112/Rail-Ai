import { useState } from 'react';
import { useAPI } from '../hooks/useAPI';
import { getCorridors } from '../api/corridors';
import { getBlocks } from '../api/blocks';
import Modal from '../components/Modal';

// Block Planner schedules against these specific station-pair sections —
// a different, finer-grained naming scheme than the named corridors here
// (e.g. "Delhi – Mumbai (WR)"). Only a corridor whose corridor_id happens to
// exactly match one of these has real block-level schedule data to show;
// for the rest we say so honestly instead of inventing a schedule.
const TRACKED_SECTIONS = ['NDLS-MTJ', 'MTJ-AGC', 'AGC-CNB', 'CNB-ALD', 'ALD-MGS', 'BPL-ET'];
const DEPT_LABELS = { engg: 'Engineering', trd: 'Traction', st: 'Signal & Telecom' };

function DetailRow({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-color)', fontSize: '0.82rem' }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontWeight: 700, color: color || 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

function CorridorDetails({ corridor }) {
  const trackedSection = TRACKED_SECTIONS.includes(corridor.corridor_id) ? corridor.corridor_id : null;
  const { data: blocks, loading } = useAPI(
    () => trackedSection ? getBlocks({ section: trackedSection }) : Promise.resolve([]),
    [trackedSection], []
  );
  const statusColors = { normal: '#15803d', warning: '#a16207', critical: '#dc2626' };
  const col = statusColors[corridor.status] || '#15803d';

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem', color: 'var(--text-muted)' }}>{corridor.corridor_id}</span>
        <span style={{ background: col + '22', color: col, padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>{corridor.status.toUpperCase()}</span>
      </div>

      <div style={{ marginTop: '6px', marginBottom: '4px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Availability: {corridor.availability}%</div>
      <div style={{ height: '8px', background: 'var(--border-color)', borderRadius: '4px', overflow: 'hidden', marginBottom: '14px' }}>
        <div style={{ width: `${corridor.availability}%`, height: '100%', background: corridor.availability >= 85 ? '#22c55e' : corridor.availability >= 70 ? '#f97316' : '#ef4444' }} />
      </div>

      <DetailRow label="Length" value={`${corridor.length_km} km`} />
      <DetailRow label="Zone" value={corridor.zone} />
      <DetailRow label="Administrative division" value={corridor.department} />
      <DetailRow label="Trains today" value={corridor.trains_today} />
      <DetailRow label="Active blocks (reported)" value={corridor.active_blocks} color={corridor.active_blocks > 2 ? 'var(--ink-red)' : undefined} />

      <div style={{ marginTop: '16px', marginBottom: '6px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
        Scheduled maintenance blocks
      </div>
      {!trackedSection ? (
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
          This corridor doesn't map to a single Block Planner section, so block-level scheduling for it isn't tracked individually — see Block Planner for the full section-by-section schedule.
        </div>
      ) : loading ? (
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Loading…</div>
      ) : blocks.length === 0 ? (
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No blocks currently scheduled on {trackedSection}.</div>
      ) : (
        blocks.slice(0, 6).map(b => (
          <DetailRow
            key={b.id}
            label={`${b.label} — ${DEPT_LABELS[b.department] || b.department}`}
            value={`Day ${b.date_offset + 1}, ${b.start_hour}:00-${b.end_hour}:00`}
          />
        ))
      )}
    </div>
  );
}

export default function CorridorMap({ onNavigate }) {
  const { data, loading } = useAPI(getCorridors, [], []);
  const corridors = data || [];
  const [zoneFilter, setZoneFilter] = useState('all');
  const [selected, setSelected] = useState(null);

  const zones = [...new Set(corridors.map(c => c.zone))].sort();
  const filtered = zoneFilter === 'all' ? corridors : corridors.filter(c => c.zone === zoneFilter);

  return (
    <div className="view-container">
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'center' }}>
        <select
          className="form-select"
          style={{ width: '200px', fontSize: '0.8rem', padding: '6px 10px' }}
          value={zoneFilter}
          onChange={e => setZoneFilter(e.target.value)}
        >
          <option value="all">All Zones</option>
          {zones.map(z => <option key={z} value={z}>{z}</option>)}
        </select>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          {filtered.length} of {corridors.length} corridors
        </span>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>Loading corridors...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>No corridors in this zone.</div>
      ) : (
        <div className="corridor-grid" id="corridorGridFull">
          {filtered.map(c => {
            const statusColors = { normal: '#15803d', warning: '#a16207', critical: '#dc2626' };
            const avBg = c.availability >= 85 ? '#22c55e' : c.availability >= 70 ? '#f97316' : '#ef4444';
            const col = statusColors[c.status] || '#15803d';

            return (
              <div key={c.corridor_id} className="corridor-card">
                <div className="cc-header">
                  <div className="cc-name">{c.name}</div>
                  <span className="cc-status" style={{ background: col + '22', color: col }}>{c.status.toUpperCase()}</span>
                </div>
                <div className="cc-availability">
                  <div className="cc-avail-label">Availability: {c.availability}%</div>
                  <div className="cc-avail-bar">
                    <div className="cc-avail-fill" style={{ width: `${c.availability}%`, background: avBg }} />
                  </div>
                </div>
                <div className="cc-meta">
                  <div className="cc-meta-item">Length: <strong>{c.length_km} km</strong></div>
                  <div className="cc-meta-item">Active Blocks: <strong style={{ color: c.active_blocks > 2 ? 'var(--ink-red)' : 'var(--text-primary)' }}>{c.active_blocks}</strong></div>
                  <div className="cc-meta-item">Trains Today: <strong>{c.trains_today}</strong></div>
                  <div className="cc-meta-item">Zone: <strong>{c.zone}</strong></div>
                </div>
                <div style={{ marginTop: '10px', display: 'flex', gap: '6px' }}>
                  <button className="btn-secondary" style={{ flex: 1, padding: '6px', fontSize: '0.72rem' }} onClick={() => setSelected(c)}>View Details</button>
                  <button className="btn-primary" style={{ flex: 1, padding: '6px', fontSize: '0.72rem' }} onClick={() => onNavigate?.('block-planner')}>Plan Block</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal show={!!selected} onClose={() => setSelected(null)} title={selected ? `🗺️ ${selected.name}` : ''}>
        {selected && <CorridorDetails corridor={selected} />}
      </Modal>
    </div>
  );
}
