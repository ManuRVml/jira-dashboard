import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import KpiCard from '../components/KpiCard';
import ChartCard from '../components/ChartCard';
import TimeBar from '../components/TimeBar';
import { WarrantyBadge } from '../components/StatusBadge';
import { api } from '../lib/api';

const PIE_COLORS = ['#6366f1', '#14b8a6', '#f59e0b', '#ef4444', '#818cf8', '#34d399', '#fb923c', '#e879f9'];

function getStatusCounts(children = []) {
  const map = {};
  for (const c of children) {
    const s = c.status || 'Desconocido';
    map[s] = (map[s] || 0) + 1;
  }
  return Object.entries(map).map(([name, count]) => ({ name, count }));
}

function getPriorityCounts(children = []) {
  const map = {};
  for (const c of children) {
    const p = c.priority || 'Sin prioridad';
    map[p] = (map[p] || 0) + 1;
  }
  return Object.entries(map).map(([name, count]) => ({ name, count }));
}

function isDone(statusCategory) {
  return statusCategory === 'done';
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [blocks, setBlocks] = useState([]);
  const [selectedBlockKey, setSelectedBlockKey] = useState(null);
  const [pendingDeploys, setPendingDeploys] = useState([]);
  const [warrantyList, setWarrantyList] = useState([]);  // cross-block warranty tasks
  const [warrantyOpen, setWarrantyOpen] = useState(true);
  const [deploysOpen, setDeploysOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const blocksData = await api.getBlocks('PY06809');
      const allBlocks = blocksData.blocks || [];
      setBlocks(allBlocks);
      if (allBlocks.length > 0) {
        setSelectedBlockKey(prev => prev || allBlocks[allBlocks.length - 1].key);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
    try {
      const pendingData = await api.getPendingDeploys({ project: 'PY06809' });
      setPendingDeploys(pendingData.issues || []);
    } catch {
      setPendingDeploys([]);
    }
    // Load cross-block warranty tasks
    try {
      const wData = await api.getWarrantyTasks('PY06809');
      setWarrantyList(wData.warrantyTasks || []);
    } catch {
      setWarrantyList([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const selectedBlock = blocks.find(b => b.key === selectedBlockKey) || null;
  const children = selectedBlock?.children || [];
  const isLastBlock = selectedBlock && blocks.length > 0 && selectedBlock.key === blocks[blocks.length - 1].key;

  const totalTasks = children.length;
  const completedTasks = children.filter(c => isDone(c.statusCategory)).length;
  const incompleteTasks = children.filter(c => !isDone(c.statusCategory)).length;
  const carryOverTasks = children.filter(c => c.via === 'link').length;
  const warrantyTasks = children.filter(c => c.isWarranty).length;

  const byStatus = getStatusCounts(children);
  const byPriority = getPriorityCounts(children);

  const recentIssues = [...children]
    .sort((a, b) => (isDone(a.statusCategory) ? 1 : -1))
    .slice(0, 15)
    .map(c => ({
      key: c.key,
      fields: {
        summary: c.summary,
        status: { name: c.status, statusCategory: { key: c.statusCategory } },
        priority: { name: c.priority },
        assignee: c.assignee ? { displayName: c.assignee } : null,
        updated: c.updated,
      }
    }));

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Dashboard</h2>
          <p>Estadísticas por bloque de trabajo — proyecto PY06809</p>
        </div>
      </div>

      {/* Block selector */}
      <div className="block-selector" style={{ marginBottom: 24 }}>
        <div className="block-selector-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b' }}>
              Bloque activo
            </span>
            {isLastBlock && (
              <span style={{
                background: 'rgba(99,102,241,0.15)',
                color: '#818cf8',
                border: '1px solid rgba(99,102,241,0.25)',
                fontSize: '0.7rem',
                fontWeight: 700,
                padding: '1px 8px',
                borderRadius: 99,
              }}>
                En curso
              </span>
            )}
          </div>
          <button
            onClick={load}
            style={{ background: 'transparent', border: '1px solid #334155', borderRadius: 6, color: '#94a3b8', padding: '3px 10px', cursor: 'pointer', fontSize: '0.78rem' }}
          >
            ↺ Actualizar
          </button>
        </div>
        <div className="block-selector-grid">
          {blocks.map((block, idx) => {
            const isActive = block.key === selectedBlockKey;
            const isCurrent = idx === blocks.length - 1;
            const shortName = block.summary
              ?.replace(/bloque\s+/i, 'B')
              ?.replace(/\s*-\s*.+/, '')
              || block.key;
            return (
              <button
                key={block.key}
                onClick={() => setSelectedBlockKey(block.key)}
                className={`block-chip ${isActive ? 'active' : ''} ${isCurrent ? 'current' : ''}`}
                title={`${block.summary} · ${block.totalTasks} tareas · ${block.incompleteTasks} incompletas`}
              >
                {isCurrent && <span className="block-chip-dot"></span>}
                {shortName}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="loading">
          <div className="spinner"></div>
          <span>Cargando bloques...</span>
        </div>
      ) : error ? (
        <div className="error-msg">❌ {error}</div>
      ) : !selectedBlock ? (
        <div className="empty-state"><p>No hay bloques disponibles</p></div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="kpi-grid">
            <KpiCard icon="📋" value={totalTasks} label="Total en Bloque" color="purple" />
            <KpiCard icon="⏳" value={incompleteTasks} label="Incompletas" color="orange" />
            <KpiCard icon="✅" value={completedTasks} label="Completadas" color="teal" />
            <KpiCard icon="↩️" value={carryOverTasks} label="Continuación" color="blue" />
            <KpiCard icon="🛡️" value={warrantyTasks} label="En Garantía" color="amber" />
          </div>

          {/* Charts */}
          <div className="charts-grid">
            <ChartCard title={`Por Estado — ${selectedBlock.summary}`}>
              {byStatus.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={byStatus} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={95} innerRadius={50} paddingAngle={3}>
                      {byStatus.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#e2e8f0' }} />
                    <Legend wrapperStyle={{ fontSize: '0.8rem', color: '#64748b' }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="empty-state"><p>Sin tareas en este bloque</p></div>
              )}
            </ChartCard>

            <ChartCard title="Por Prioridad">
              {byPriority.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={byPriority} barSize={32}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={{ stroke: '#334155' }} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={{ stroke: '#334155' }} />
                    <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#e2e8f0' }} />
                    <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="empty-state"><p>Sin datos de prioridad</p></div>
              )}
            </ChartCard>
          </div>

          {/* Accordions — Garantía + PRs — below charts, same row */}
          {(warrantyList.length > 0 || pendingDeploys.length > 0) && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: (warrantyList.length > 0 && pendingDeploys.length > 0) ? '1fr 1fr' : '1fr',
              gap: 20,
              marginBottom: 24,
              alignItems: 'start',
            }}>

              {/* Warranty Panel */}
              {warrantyList.length > 0 && (
                <div className="warranty-panel">
                  <div
                    className="warranty-panel-header"
                    onClick={() => setWarrantyOpen(o => !o)}
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
                      <span style={{ fontSize: '1.1rem' }}>🛡️</span>
                      <div style={{ flex: 1 }}>
                        <div className="warranty-panel-title">Casos en Garantía</div>
                        <div className="warranty-panel-subtitle">
                          {warrantyList.length} {warrantyList.length === 1 ? 'caso' : 'casos'}
                          <span style={{ opacity: 0.7 }}> — sin descontar horas del bloque</span>
                        </div>
                      </div>
                      <span className="warranty-panel-count">{warrantyList.length}</span>
                      <span style={{ fontSize: '0.85rem', color: '#f59e0b', marginLeft: 8, transition: 'transform 0.25s', display: 'inline-block', transform: warrantyOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▾</span>
                    </div>
                  </div>
                  <div style={{ overflow: 'hidden', maxHeight: warrantyOpen ? 600 : 0, transition: 'max-height 0.3s ease' }}>
                    <div className="warranty-panel-list">
                      {warrantyList.map(task => (
                        <div
                          key={task.key}
                          className="warranty-panel-item"
                          onClick={() => navigate(`/tasks/${task.key}`)}
                          title={task.summary}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#fbbf24', flexShrink: 0 }}>
                                {task.key}
                              </span>
                              {task.blockKey && (
                                <span style={{ fontSize: '0.64rem', color: '#1c1402', background: '#d97706', padding: '1px 7px', borderRadius: 8, fontWeight: 800, flexShrink: 0, letterSpacing: '0.01em' }}>
                                  {task.blockKey}
                                </span>
                              )}
                              <span style={{ fontSize: '0.82rem', color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {task.summary}
                              </span>
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                            <span style={{ fontSize: '0.7rem', color: '#fcd34d', background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.35)', padding: '2px 9px', borderRadius: 6, fontWeight: 600, whiteSpace: 'nowrap' }}>{task.status}</span>
                            {task.assigneeInitial && (
                              <span className="warranty-avatar" title={task.assignee}>{task.assigneeInitial}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Pending Deploys Panel */}
              {pendingDeploys.length > 0 && (
                <div className="pending-deploy-panel">
                  <div
                    className="pending-deploy-header"
                    onClick={() => setDeploysOpen(o => !o)}
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
                      <span style={{ fontSize: '1.1rem' }}>🚀</span>
                      <div style={{ flex: 1 }}>
                        <div className="pending-deploy-title">PRs Pendientes para Producción</div>
                        <div className="pending-deploy-subtitle">
                          {pendingDeploys.length} {pendingDeploys.length === 1 ? 'tarea lista' : 'tareas listas'} para hacer deploy
                        </div>
                      </div>
                      <span className="pending-deploy-count">{pendingDeploys.length}</span>
                      <span style={{ fontSize: '0.85rem', color: '#14b8a6', marginLeft: 8, transition: 'transform 0.25s', display: 'inline-block', transform: deploysOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▾</span>
                    </div>
                  </div>
                  <div style={{ overflow: 'hidden', maxHeight: deploysOpen ? 600 : 0, transition: 'max-height 0.3s ease' }}>
                    <div className="pending-deploy-list">
                      {pendingDeploys.map(issue => {
                        const deployDate = issue.deployDate ? new Date(issue.deployDate) : null;
                        const daysAway = deployDate ? Math.round((deployDate - Date.now()) / (1000 * 60 * 60 * 24)) : null;
                        const dateLabel = deployDate
                          ? deployDate.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
                            + (deployDate.getHours() > 0 ? ' ' + deployDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '')
                          : null;
                        const badgeClass = daysAway === null ? '' : daysAway < 0 ? 'deploy-badge-past' : daysAway === 0 ? 'deploy-badge-today' : daysAway <= 3 ? 'deploy-badge-soon' : 'deploy-badge-future';
                        const badgeLabel = daysAway === null ? null : daysAway < 0 ? `Hace ${Math.abs(daysAway)}d` : daysAway === 0 ? 'Hoy 🔴' : `En ${daysAway}d`;
                        return (
                          <div key={issue.key} className="pending-deploy-item" onClick={() => navigate(`/tasks/${issue.key}`)} title={issue.summary}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div className="pending-deploy-item-left">
                                <span className="pending-deploy-key">{issue.key}</span>
                                <span className="pending-deploy-summary">{issue.summary}</span>
                              </div>
                              {issue.comment && (
                                <div className="pending-deploy-comment-snippet">
                                  💬 {issue.comment.author}: "{issue.comment.snippet.slice(0, 100)}{issue.comment.snippet.length > 100 ? '…' : ''}"
                                </div>
                              )}
                            </div>
                            <div className="pending-deploy-item-right">
                              {issue.assigneeInitial && <span className="pending-deploy-avatar" title={issue.assignee}>{issue.assigneeInitial}</span>}
                              {dateLabel && (
                                <div style={{ textAlign: 'right' }}>
                                  <div style={{ fontSize: '0.78rem', color: '#e2e8f0', fontWeight: 600 }}>{dateLabel}</div>
                                  {badgeLabel && <span className={`deploy-badge ${badgeClass}`} style={{ fontSize: '0.65rem', padding: '1px 6px' }}>{badgeLabel}</span>}
                                </div>
                              )}
                              {!dateLabel && <span className="pending-deploy-status">{issue.status}</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* Task Grid */}
          <div className="card" style={{ padding: '20px 24px' }}>
            <div className="card-header" style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span className="card-title">Tareas del {selectedBlock.summary}</span>
                {carryOverTasks > 0 && (
                  <span style={{
                    fontSize: '0.7rem', color: '#818cf8', fontWeight: 700,
                    background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)',
                    padding: '2px 10px', borderRadius: 99,
                  }}>
                    ↩ {carryOverTasks} continuación
                  </span>
                )}
              </div>
              <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 500 }}>
                {children.length} tareas
              </span>
            </div>
            {children.length === 0 ? (
              <div className="empty-state"><p>Sin tareas en este bloque</p></div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
                gap: 12,
              }}>
                {[...children]
                  .sort((a, b) => {
                    if (a.statusCategory === 'done' && b.statusCategory !== 'done') return 1;
                    if (a.statusCategory !== 'done' && b.statusCategory === 'done') return -1;
                    return 0;
                  })
                  .map(task => {
                    const statusColor = task.statusCategory === 'done'
                      ? '#14b8a6'
                      : task.statusCategory === 'new'
                        ? '#64748b'
                        : task.status?.toLowerCase().includes('block')
                          ? '#ef4444'
                          : task.status?.toLowerCase().includes('validaci')
                            ? '#3b82f6'
                            : '#6366f1';

                    const statusBg = task.statusCategory === 'done'
                      ? 'rgba(20,184,166,0.12)'
                      : task.statusCategory === 'new'
                        ? 'rgba(100,116,139,0.12)'
                        : task.status?.toLowerCase().includes('block')
                          ? 'rgba(239,68,68,0.12)'
                          : task.status?.toLowerCase().includes('validaci')
                            ? 'rgba(59,130,246,0.12)'
                            : 'rgba(99,102,241,0.12)';

                    return (
                      <div
                        key={task.key}
                        onClick={() => navigate(`/tasks/${task.key}`)}
                        style={{
                          background: 'rgba(15,23,42,0.6)',
                          border: '1px solid #1e293b',
                          borderLeft: `3px solid ${statusColor}`,
                          borderRadius: 10,
                          padding: '12px 14px',
                          cursor: 'pointer',
                          transition: 'all 0.18s ease',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                          opacity: task.statusCategory === 'done' ? 0.65 : 1,
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = 'rgba(99,102,241,0.06)';
                          e.currentTarget.style.borderColor = `${statusColor}`;
                          e.currentTarget.style.transform = 'translateY(-1px)';
                          e.currentTarget.style.boxShadow = `0 4px 16px rgba(0,0,0,0.2)`;
                          e.currentTarget.style.opacity = '1';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = 'rgba(15,23,42,0.6)';
                          e.currentTarget.style.borderColor = '#1e293b';
                          e.currentTarget.style.borderLeftColor = statusColor;
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = 'none';
                          e.currentTarget.style.opacity = task.statusCategory === 'done' ? '0.65' : '1';
                        }}
                      >
                        {/* Top row: key + badges */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{
                            fontSize: '0.68rem', color: statusColor, fontWeight: 800,
                            letterSpacing: '0.03em', flexShrink: 0,
                          }}>
                            {task.key}
                          </span>
                          <span style={{
                            fontSize: '0.62rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                            background: statusBg, color: statusColor, flexShrink: 0,
                          }}>
                            {task.status}
                          </span>
                          {task.via === 'link' && (
                            <span style={{
                              fontSize: '0.6rem', color: '#f59e0b', fontWeight: 700,
                              background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)',
                              padding: '1px 6px', borderRadius: 99, flexShrink: 0,
                            }}>↩ continuación</span>
                          )}
                          {task.isWarranty && <WarrantyBadge small />}
                        </div>

                        {/* Summary */}
                        <div style={{
                          fontSize: '0.82rem', color: '#cbd5e1', lineHeight: 1.45,
                          display: '-webkit-box', WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical', overflow: 'hidden',
                          flex: 1,
                        }}>
                          {task.summary}
                        </div>

                        {/* Bottom row: time bar + avatar */}
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {task.timeInfo && <TimeBar timeInfo={task.timeInfo} compact={true} />}
                          </div>
                          {task.assigneeInitial && (
                            <div style={{
                              width: 28, height: 28, borderRadius: '50%',
                              background: `${statusColor}22`,
                              border: `1.5px solid ${statusColor}55`,
                              color: statusColor, fontSize: '0.72rem', fontWeight: 800,
                              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            }} title={task.assignee}>
                              {task.assigneeInitial}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
