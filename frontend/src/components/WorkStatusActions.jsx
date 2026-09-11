// Done/Cancel controls for a department's own work items (TMS/SMMS/TDMS
// registers). Once resolved, the buttons are replaced by a plain badge —
// the item stays visible in the register for the record, but the AI
// recommendation/risk-alert pipeline stops surfacing it (see
// services/live_data.load_live_assets, which only scores "pending" items).
export default function WorkStatusActions({ workStatus, onDone, onCancel, busy }) {
  if (workStatus === 'done') {
    return (
      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--ink-green)', background: 'rgba(34,197,94,0.12)', padding: '3px 8px', borderRadius: '4px', whiteSpace: 'nowrap' }}>
        ✓ Done
      </span>
    );
  }
  if (workStatus === 'cancelled') {
    return (
      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', background: 'rgba(100,116,139,0.12)', padding: '3px 8px', borderRadius: '4px', whiteSpace: 'nowrap' }}>
        ✕ Cancelled
      </span>
    );
  }
  return (
    <div style={{ display: 'flex', gap: '4px' }}>
      <button
        className="btn-secondary"
        style={{ padding: '3px 8px', fontSize: '0.68rem', color: 'var(--ink-green)', borderColor: 'rgba(34,197,94,0.35)' }}
        onClick={onDone}
        disabled={busy}
        title="Mark this work item as done"
      >
        ✓ Done
      </button>
      <button
        className="btn-secondary"
        style={{ padding: '3px 8px', fontSize: '0.68rem', color: 'var(--ink-red)', borderColor: 'rgba(239,68,68,0.35)' }}
        onClick={onCancel}
        disabled={busy}
        title="Cancel this work item"
      >
        ✕ Cancel
      </button>
    </div>
  );
}
