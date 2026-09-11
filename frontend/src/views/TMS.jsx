import { useRef, useState } from 'react';
import { useAPI } from '../hooks/useAPI';
import { useToast } from '../hooks/useToast';
import { getDefects, syncTMS, setDefectWorkStatus } from '../api/tms';
import DataTable from '../components/DataTable';
import WorkStatusActions from '../components/WorkStatusActions';

export default function TMS() {
  const showToast = useToast();
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const tableRef = useRef(null);

  // Unfiltered — the stat strip always reflects the true totals, regardless
  // of whatever filter is currently applied to the table below it.
  const { data: allData, refetch: refetchAll } = useAPI(getDefects, [], []);
  const { data, loading, refetch } = useAPI(
    () => getDefects({ search: search || undefined, severity: severityFilter || undefined, status: statusFilter || undefined }),
    [search, severityFilter, statusFilter], []
  );

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await syncTMS();
      showToast('success', res.message);
      refetch();
      refetchAll();
    } catch {
      showToast('error', "TMS sync failed — check the backend connection.");
    } finally {
      setSyncing(false);
    }
  }

  async function handleWorkStatus(id, work_status) {
    setBusyId(id);
    try {
      await setDefectWorkStatus(id, work_status);
      showToast('success', work_status === 'done' ? 'Marked as done.' : 'Marked as cancelled.');
      refetch();
      refetchAll();
    } catch (err) {
      showToast('error', err?.response?.data?.detail || "Couldn't update — try again.");
    } finally {
      setBusyId(null);
    }
  }

  const COLUMNS = [
    { key: 'defect_id', label: 'ID' },
    { key: 'location', label: 'Location' },
    { key: 'defect_type', label: 'Defect Type' },
    { key: 'severity', label: 'Severity', type: 'severity' },
    { key: 'reported_date', label: 'Reported' },
    { key: 'status', label: 'Status', type: 'status' },
    { key: 'ai_priority', label: 'AI Priority', type: 'priority' },
    {
      key: 'actions', label: 'Actions',
      render: row => (
        <WorkStatusActions
          workStatus={row.work_status}
          busy={busyId === row.id}
          onDone={() => handleWorkStatus(row.id, 'done')}
          onCancel={() => handleWorkStatus(row.id, 'cancelled')}
        />
      ),
    },
  ];

  function scrollToTable() {
    tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function showAll() {
    setSeverityFilter('');
    setStatusFilter('');
    scrollToTable();
  }
  function showSeverity(sev) {
    setSeverityFilter(sev);
    setStatusFilter('');
    scrollToTable();
  }
  function showStatus(st) {
    setStatusFilter(st);
    setSeverityFilter('');
    scrollToTable();
  }

  const allDefects = allData || [];
  const defects = data || [];
  const critical = allDefects.filter(d => d.severity === 'critical').length;
  const high = allDefects.filter(d => d.severity === 'high').length;
  const overdue = allDefects.filter(d => d.status === 'Overdue').length;

  const STATS = [
    { label: 'Total Defects', val: allDefects.length, col: 'var(--text-primary)', active: !severityFilter && !statusFilter, onClick: showAll },
    { label: 'Critical', val: critical, col: '#dc2626', active: severityFilter === 'critical', onClick: () => showSeverity('critical') },
    { label: 'High', val: high, col: '#c2410c', active: severityFilter === 'high', onClick: () => showSeverity('high') },
    { label: 'Overdue', val: overdue, col: '#a16207', active: statusFilter === 'Overdue', onClick: () => showStatus('Overdue') },
  ];

  const activeFilterLabel = statusFilter ? `Status: ${statusFilter}` : severityFilter ? `Severity: ${severityFilter}` : null;

  return (
    <div className="view-container">
      {/* Stats strip — click any card to filter the register below to exactly that set */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
        {STATS.map((s, i) => (
          <div
            key={i}
            className="card"
            onClick={s.onClick}
            role="button"
            tabIndex={0}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); s.onClick(); } }}
            title={`Show ${s.label.toLowerCase()} defects`}
            style={{
              padding: '16px', textAlign: 'center', cursor: 'pointer',
              border: s.active ? `1.5px solid ${s.col}` : '1px solid var(--border-color)',
              background: s.active ? s.col + '0d' : 'var(--bg-card)',
            }}
          >
            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: s.col }}>{s.val}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div className="card" ref={tableRef}>
        <div className="card-header">
          <div className="card-title">🛤️ TMS — Track Defect Register</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input className="form-input" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} style={{ padding: '6px 12px', fontSize: '0.8rem' }} />
            <select className="form-select" value={severityFilter} onChange={e => { setSeverityFilter(e.target.value); setStatusFilter(''); }} style={{ padding: '6px 10px', fontSize: '0.8rem' }}>
              <option value="">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <button className="btn-primary" style={{ fontSize: '0.78rem', padding: '6px 14px', whiteSpace: 'nowrap' }} onClick={handleSync} disabled={syncing}>
              {syncing ? '⚙️ Syncing...' : '🔄 Sync TMS'}
            </button>
          </div>
        </div>

        {activeFilterLabel && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Filtering by <strong style={{ color: 'var(--text-secondary)' }}>{activeFilterLabel}</strong>
            <button className="btn-secondary" style={{ padding: '2px 10px', fontSize: '0.7rem' }} onClick={showAll}>✕ Clear</button>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Loading defects...</div>
        ) : (
          <DataTable columns={COLUMNS} rows={defects} emptyMsg="No defects matching filter" />
        )}
      </div>
    </div>
  );
}
