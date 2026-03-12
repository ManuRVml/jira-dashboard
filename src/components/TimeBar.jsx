import React from 'react';

/**
 * TimeBar — compact time progress visualization
 * Shows estimated, executed, and remaining hours.
 * Used in dashboard task table and task detail page.
 */
export default function TimeBar({ timeInfo, compact = false }) {
  if (!timeInfo) return null;
  const { estimated, executed, remaining } = timeInfo;

  const hasData = estimated !== null || executed !== null || remaining !== null;
  if (!hasData) return null;

  const fmtH = (h) => {
    if (h === null || h === undefined) return '–';
    if (h === 0) return '0h';
    const hrs = Math.floor(h);
    const mins = Math.round((h - hrs) * 60);
    if (mins === 0) return `${hrs}h`;
    return `${hrs}h ${mins}m`;
  };

  const pct = estimated > 0 && executed !== null
    ? Math.min(100, Math.round((executed / estimated) * 100))
    : null;

  const barColor = pct === null ? '#6366f1'
    : pct >= 100 ? '#ef4444'
    : pct >= 80 ? '#f59e0b'
    : '#14b8a6';

  if (compact) {
    // Tiny badge used in the task table row
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {estimated !== null && (
          <span style={{ fontSize: '0.68rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
            ⏱ {fmtH(estimated)}
          </span>
        )}
        {executed !== null && (
          <span style={{ fontSize: '0.68rem', color: '#14b8a6', whiteSpace: 'nowrap' }}>
            ✔ {fmtH(executed)}
          </span>
        )}
        {remaining !== null && remaining > 0 && (
          <span style={{ fontSize: '0.68rem', color: '#f59e0b', whiteSpace: 'nowrap' }}>
            ⏳ {fmtH(remaining)}
          </span>
        )}
        {pct !== null && (
          <div style={{ width: 40, height: 4, background: '#1e293b', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: 99 }} />
          </div>
        )}
      </div>
    );
  }

  // Full view for task detail
  return (
    <div style={{
      background: 'rgba(99,102,241,0.07)',
      border: '1px solid rgba(99,102,241,0.18)',
      borderRadius: 10,
      padding: '14px 18px',
    }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', marginBottom: 12 }}>
        ⏱ Seguimiento de Tiempo
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: pct !== null ? 14 : 0 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#818cf8' }}>{fmtH(estimated)}</div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2 }}>Estimado</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#14b8a6' }}>{fmtH(executed)}</div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2 }}>Ejecutado</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: remaining > 0 ? '#f59e0b' : '#22c55e' }}>
            {remaining !== null && remaining <= 0 ? '✓ 0h' : fmtH(remaining)}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2 }}>Por ejecutar</div>
        </div>
      </div>

      {pct !== null && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: '0.7rem', color: '#64748b' }}>Progreso</span>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: barColor }}>{pct}%</span>
          </div>
          <div style={{ height: 7, background: '#1e293b', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{
              width: `${pct}%`,
              height: '100%',
              background: `linear-gradient(90deg, ${barColor}, ${barColor}cc)`,
              borderRadius: 99,
              transition: 'width 0.6s ease',
            }} />
          </div>
        </div>
      )}
    </div>
  );
}
