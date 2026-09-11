import { useRef, useState } from 'react';
import { useAPI } from '../hooks/useAPI';
import { useToast } from '../hooks/useToast';
import { getAssets, syncSMMS, setAssetWorkStatus } from '../api/smms';
import DataTable from '../components/DataTable';
import WorkStatusActions from '../components/WorkStatusActions';

export default function SMMS() {
  const showToast = useToast();
  const [search, setSearch] = useState('');
  const [conditionFilter, setConditionFilter] = useState('');
  const [overdueFilter, setOverdueFilter] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const tableRef = useRef(null);

  // Unfiltered — the stat strip always reflects the true totals, regardless
  // of whatever filter is currently applied to the table below it.
  const { data: allData, refetch: refetchAll } = useAPI(getAssets, [], []);
  const { data, loading, refetch } = useAPI(
    () => getAssets({ search: search || undefined, condition: conditionFilter || undefined, overdue: overdueFilter || undefined }),
    [search, conditionFilter, overdueFilter], []
  );

  async function handleSync() {
    try {
      const res = await syncSMMS();
      showToast('success', res.message);
      refetch();
      refetchAll();
    } catch {
      showToast('error', "SMMS sync failed — check the backend connection.");
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
    { key: 'condition', label: 'Condition', type: 'condition' },
    { key: 'last_maintenance', label: 'Last Maint.' },
    { key: 'next_due', label: 'Next Due' },
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
    setConditionFilter('');
    setOverdueFilter(false);
    scrollToTable();
  }
  function showCondition(cond) {
    setConditionFilter(cond);
    setOverdueFilter(false);
    scrollToTable();
  }
  function showOverdue() {
    setOverdueFilter(true);
    setConditionFilter('');
    scrollToTable();
  }

  const allAssets = allData || [];
  const assets = data || [];
  const critical = allAssets.filter(a => a.condition === 'critical').length;
  const high = allAssets.filter(a => a.condition === 'high').length;
  const overdue = allAssets.filter(a => a.next_due && a.next_due < new Date().toISOString().slice(0, 10)).length;

  const STATS = [
    { label: 'Total Assets', val: allAssets.length, col: 'var(--text-primary)', active: !conditionFilter && !overdueFilter, onClick: showAll },
    { label: 'Critical Condition', val: critical, col: '#dc2626', active: conditionFilter === 'critical', onClick: () => showCondition('critical') },
    { label: 'High Risk', val: high, col: '#c2410c', active: conditionFilter === 'high', onClick: () => showCondition('high') },
    { label: 'Maintenance Overdue', val: overdue, col: '#a16207', active: overdueFilter, onClick: showOverdue },
  ];

  const activeFilterLabel = overdueFilter ? 'Maintenance overdue' : conditionFilter ? `Condition: ${conditionFilter}` : null;

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
          <div className="card-title">🚦 SMMS — Signal Maintenance System</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input className="form-input" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} style={{ padding: '6px 12px', fontSize: '0.8rem' }} />
            <select className="form-select" value={conditionFilter} onChange={e => { setConditionFilter(e.target.value); setOverdueFilter(false); }} style={{ padding: '6px 10px', fontSize: '0.8rem' }}>
              <option value="">All Conditions</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <button className="btn-primary" style={{ fontSize: '0.78rem', padding: '6px 14px' }} onClick={handleSync}>🔄 Sync SMMS</button>
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
