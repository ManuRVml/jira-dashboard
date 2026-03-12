import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

const TYPE_CONFIG = {
  status: { icon: '🔄', label: 'Estado', color: 'var(--accent)' },
  comment: { icon: '💬', label: 'Comentario', color: '#22c55e' },
  assignee: { icon: '👤', label: 'Asignado', color: '#f59e0b' },
  attachment: { icon: '📎', label: 'Adjunto', color: '#8b5cf6' },
  field: { icon: '✏️', label: 'Campo', color: 'var(--text-secondary)' },
};

function timeAgo(dateStr) {
  const now = Date.now();
  const diff = now - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'ahora mismo';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days}d`;
  return new Date(dateStr).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
}

function NotifItem({ notif, onReview, onNavigate }) {
  const cfg = TYPE_CONFIG[notif.type] || TYPE_CONFIG.field;
  const item = notif.items?.[0];

  const changeDesc = useMemo(() => {
    if (!item) return '';
    if (notif.type === 'status') return `${item.from || '?'} → ${item.to || '?'}`;
    if (notif.type === 'comment') return item.to ? `"${item.to.slice(0, 100)}${item.to.length > 100 ? '…' : ''}"` : '';
    if (notif.type === 'assignee') return `→ ${item.to || 'Sin asignar'}`;
    const all = notif.items.map(i => `${i.field}: ${i.to || '-'}`).join(' · ');
    return all.slice(0, 100);
  }, [notif, item]);

  return (
    <div
      className={`notif-item ${notif.reviewed ? 'reviewed' : 'new'}`}
      onClick={() => onNavigate(notif.issueKey)}
    >
      <div className="notif-item-left">
        <div className="notif-type-icon" style={{ background: `${cfg.color}22`, color: cfg.color }}>
          {cfg.icon}
        </div>
      </div>
      <div className="notif-item-body">
        <div className="notif-item-header">
          <span className="notif-issue-key">{notif.issueKey}</span>
          <span className="notif-type-badge" style={{ color: cfg.color }}>{cfg.label}</span>
          <span className="notif-time">{timeAgo(notif.created)}</span>
        </div>
        <div className="notif-summary">{notif.issueSummary}</div>
        <div className="notif-author">
          <span className="notif-author-avatar">
            {notif.author?.avatarUrl
              ? <img src={notif.author.avatarUrl} alt={notif.author.displayName} className="notif-avatar-img" />
              : <span className="notif-avatar-initials">{(notif.author?.displayName || '?').charAt(0).toUpperCase()}</span>
            }
          </span>
          <span className="notif-author-name">{notif.author?.displayName}</span>
        </div>
        {changeDesc && (
          <div className="notif-change-desc">{changeDesc}</div>
        )}
      </div>
      <div className="notif-item-actions" onClick={e => e.stopPropagation()}>
        {!notif.reviewed ? (
          <button
            className="notif-review-btn"
            title="Marcar como revisado"
            onClick={() => onReview(notif.id)}
          >
            ✓
          </button>
        ) : (
          <span className="notif-reviewed-check" title="Revisado">✓</span>
        )}
      </div>
    </div>
  );
}

export default function NotificationPanel({
  notifications,
  unreadCount,
  loading,
  error,
  lastFetched,
  onClose,
  onMarkAsReviewed,
  onMarkAllReviewed,
  onRefresh,
}) {
  const navigate = useNavigate();

  const handleNavigate = (key) => {
    navigate(`/tasks/${key}`);
    onClose();
  };

  const newNotifs = notifications.filter(n => !n.reviewed);
  const reviewedNotifs = notifications.filter(n => n.reviewed);

  return (
    <>
      {/* Backdrop */}
      <div className="notif-backdrop" onClick={onClose} />

      {/* Panel */}
      <div className="notif-panel">
        {/* Header */}
        <div className="notif-panel-header">
          <div className="notif-panel-title">
            <span className="notif-panel-icon">🔔</span>
            <span>Notificaciones</span>
            {unreadCount > 0 && (
              <span className="notif-header-badge">{unreadCount}</span>
            )}
          </div>
          <div className="notif-panel-actions">
            {newNotifs.length > 0 && (
              <button className="notif-action-btn" onClick={onMarkAllReviewed} title="Marcar todo como revisado">
                ✓ Todo revisado
              </button>
            )}
            <button className="notif-action-btn icon-btn" onClick={onRefresh} title="Actualizar">
              🔄
            </button>
            <button className="notif-action-btn icon-btn" onClick={onClose} title="Cerrar">
              ✕
            </button>
          </div>
        </div>

        {/* Last updated info */}
        {lastFetched && (
          <div className="notif-last-fetched">
            Actualizado {timeAgo(lastFetched)}
          </div>
        )}

        {/* Body */}
        <div className="notif-panel-body">
          {loading && notifications.length === 0 ? (
            <div className="notif-loading">
              <div className="spinner small" />
              <span>Buscando actualizaciones…</span>
            </div>
          ) : error ? (
            <div className="notif-error">
              ⚠️ {error}
              <button className="notif-retry-btn" onClick={onRefresh}>Reintentar</button>
            </div>
          ) : notifications.length === 0 ? (
            <div className="notif-empty">
              <div className="notif-empty-icon">🎉</div>
              <div className="notif-empty-title">Todo al día</div>
              <div className="notif-empty-sub">No hay nuevas actualizaciones de otros usuarios en los últimos 7 días.</div>
            </div>
          ) : (
            <>
              {/* New notifications */}
              {newNotifs.length > 0 && (
                <div className="notif-section">
                  <div className="notif-section-label">Nuevas · {newNotifs.length}</div>
                  {newNotifs.map(n => (
                    <NotifItem
                      key={n.id}
                      notif={n}
                      onReview={onMarkAsReviewed}
                      onNavigate={handleNavigate}
                    />
                  ))}
                </div>
              )}

              {/* Reviewed notifications */}
              {reviewedNotifs.length > 0 && (
                <div className="notif-section">
                  <div className="notif-section-label revisadas">Revisadas · {reviewedNotifs.length}</div>
                  {reviewedNotifs.map(n => (
                    <NotifItem
                      key={n.id}
                      notif={n}
                      onReview={onMarkAsReviewed}
                      onNavigate={handleNavigate}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
