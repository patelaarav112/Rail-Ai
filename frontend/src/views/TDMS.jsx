import { useRef, useState } from 'react';
import { useAPI } from '../hooks/useAPI';
import { useToast } from '../hooks/useToast';
import { getAssets, syncTDMS, setAssetWorkStatus } from '../api/tdms';
import DataTable from '../components/DataTable';
import WorkStatusActions from '../components/WorkStatusActions';

export default function TDMS() {
  const showToast = useToast();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [busyId, setBusyId] = useState(null);
  const tableRef = useRef(null);

  // Unfiltered — the stat strip always reflects the true totals, regardless
  // of whatever filter is currently applied to the table below it.
  const { data: allData, refetch: refetchAll } = useAPI(getAssets, [], []);
  const { data, loading, refetch } = useAPI(
    () => getAssets({ search: search || undefined, status: statusFilter || undefined }),
    [search, statusFilter], []
  );

  async function handleSync() {
    try {
      const res = await syncTDMS();
      showToast('success', res.message);
      refetch();
      refetchAll();
    } catch {
      showToast('error', "TDMS sync failed — check the backend connection.");
    }
  }

  async function handleWorkStatus(id, work_status) {
    setBusyId(id);
    try {
      await setAssetWorkStatus(id, work_status);
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
    { key: 'asset_id', label: 'Asset ID' },
    { key: 'location', label: 'Location' },
    { key: 'asset_type', label: 'Asset Type' },
    { key: 'voltage', label: 'Voltage' },
    { key: 'status', label: 'Status', type: 'status' },
    { key: 'last_inspection', label: 'Last Inspection' },
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
    setStatusFilter('');
    scrollToTable();
  }
  function showStatus(st) {
    setStatusFilter(st);
    scrollToTable();
  }

  const allAssets = allData || [];
  const assets = data || [];
  const defects = allAssets.filter(a => a.status === 'Defect').length;
  const warnings = allAssets.filter(a => a.status === 'Warning').length;
  const normal = allAssets.length - defects - warnings;

  const STATS = [
    { label: 'Total Assets', val: allAssets.length, col: 'var(--text-primary)', active: !statusFilter, onClick: showAll },
    { label: 'Defects', val: defects, col: '#dc2626', active: statusFilter === 'Defect', onClick: () => showStatus('Defect') },
    { label: 'Warnings', val: warnings, col: '#c2410c', active: statusFilter === 'Warning', onClick: () => showStatus('Warning') },
    { label: 'Normal', val: normal, col: '#15803d', active: statusFilter === 'Normal', onClick: () => showStatus('Normal') },
  ];

  const activeFilterLabel = statusFilter ? `Status: ${statusFilter}` : null;

  return (
    <div className="view-container">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
        {STATS.map((s, i) => (
          <div
            key={i}
            className="card"
            onClick={s.onClick}
            role="button"
            tabIndex={0}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); s.onClick(); } }}
            title={`Show ${s.label.toLowerCase()} assets`}
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
          <div className="card-title">⚡ TDMS — Traction Distribution System</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input className="form-input" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} style={{ padding: '6px 12px', fontSize: '0.8rem' }} />
            <select className="form-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: '6px 10px', fontSize: '0.8rem' }}>
              <option value="">All Statuses</option>
              <option value="Defect">Defect</option>
              <option value="Warning">Warning</option>
              <option value="Normal">Normal</option>
            </select>
            <button className="btn-primary" style={{ fontSize: '0.78rem', padding: '6px 14px' }} onClick={handleSync}>🔄 Sync TDMS</button>
          </div>
        </div>

        {activeFilterLabel && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Filtering by <strong style={{ color: 'var(--text-secondary)' }}>{activeFilterLabel}</strong>
            <button className="btn-secondary" style={{ padding: '2px 10px', fontSize: '0.7rem' }} onClick={showAll}>✕ Clear</button>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Loading assets...</div>
        ) : (
          <DataTable columns={COLUMNS} rows={assets} emptyMsg="No assets matching filter" />
        )}
      </div>
    </div>
  );
}
