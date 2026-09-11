const SEV_COLORS = {
  critical: '#dc2626', high: '#c2410c', medium: '#a16207',
  low: '#15803d', normal: '#15803d', Defect: '#dc2626', Warning: '#c2410c', Normal: '#15803d',
};

export default function DataTable({ columns, rows, emptyMsg = 'No data' }) {
  if (!rows?.length) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
        {emptyMsg}
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="data-table">
        <thead>
          <tr>
            {columns.map(c => (
              <th key={c.key}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id ?? i}>
              {columns.map(c => {
                const val = row[c.key];
                if (c.render) {
                  return <td key={c.key}>{c.render(row)}</td>;
                }
                if (c.type === 'severity' || c.type === 'condition' || c.type === 'status') {
                  const col = SEV_COLORS[val] || '#64748b';
                  return (
                    <td key={c.key}>
                      <span style={{
                        background: col + '20', color: col,
                        padding: '2px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 600,
                      }}>
                        {val}
                      </span>
                    </td>
                  );
                }
                if (c.type === 'priority') {
                  const pct = typeof val === 'number' ? val : 50;
                  const col = pct >= 80 ? '#dc2626' : pct >= 60 ? '#c2410c' : '#a16207';
                  return (
                    <td key={c.key}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ flex: 1, height: '4px', background: 'var(--border-color)', borderRadius: '2px' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: col, borderRadius: '2px' }} />
                        </div>
                        <span style={{ color: col, fontSize: '0.72rem', minWidth: '28px' }}>{pct}</span>
                      </div>
                    </td>
                  );
                }
                return <td key={c.key}>{val ?? '—'}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
