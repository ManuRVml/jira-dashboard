import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { WarrantyBadge } from '../components/StatusBadge';

const STATUS_COLORS = {
  done: '#10b981',
  indeterminate: '#6366f1',
  new: '#64748b',
};

function StatusDot({ category }) {
  const color = STATUS_COLORS[category] || STATUS_COLORS.new;
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: color, marginRight: 6, flexShrink: 0,
    }} />
  );
}

export default function BlocksPage() {
  const navigate = useNavigate();
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // New block creation
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState(null);

  // Task mover
  const [sourceBlock, setSourceBlock] = useState(null);  // block object
  const [showIncomplete, setShowIncomplete] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [destBlockKey, setDestBlockKey] = useState('');
  const [moving, setMoving] = useState(false);
  const [moveResult, setMoveResult] = useState(null); // { success: n, failed: n }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getBlocks('PY06809');
      setBlocks(data.blocks || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Create new block ──────────────────────────────────────────
  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreateLoading(true);
    setCreateError(null);
    try {
      await api.createBlock(newName.trim());
      setNewName('');
      setCreating(false);
      await load();
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreateLoading(false);
    }
  };

  // ── Task selection ────────────────────────────────────────────
  const toggleTask = (key) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = (tasks) => {
    if (selected.size === tasks.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(tasks.map(t => t.key)));
    }
  };

  const openMover = (block) => {
    setSourceBlock(block);
    setShowIncomplete(true);
    setSelected(new Set());
    setDestBlockKey('');
    setMoveResult(null);
  };

  // ── Move tasks ────────────────────────────────────────────────
  const handleMove = async () => {
    if (!destBlockKey || selected.size === 0) return;
    setMoving(true);
    setMoveResult(null);
    let success = 0, failed = 0;
    for (const taskKey of selected) {
      try {
        await api.moveTaskToBlock(taskKey, destBlockKey);
        success++;
      } catch {
        failed++;
      }
    }
    setMoveResult({ success, failed });
    setMoving(false);
    setSelected(new Set());
    await load();
    // Refresh source block view
    if (success > 0) {
      const updated = await api.getBlocks('PY06809');
      const refreshed = (updated.blocks || []).find(b => b.key === sourceBlock.key);
      if (refreshed) setSourceBlock(refreshed);
    }
  };

  const incompleteTasks = sourceBlock
    ? sourceBlock.children.filter(t => t.statusCategory !== 'done')
    : [];

  const destOptions = blocks.filter(b => b.key !== sourceBlock?.key);

  return (
    <div className="page-blocks">
      {/* ── Header ── */}
      <div className="blocks-header">
        <div>
          <h2 className="blocks-title">📦 Gestión de Bloques</h2>
          <p className="blocks-subtitle">Bloques de trabajo del proyecto PY06809</p>
        </div>
        <button className="btn-primary" onClick={() => { setCreating(true); setCreateError(null); }}>
          + Nuevo Bloque
        </button>
      </div>

      {/* ── New block form ── */}
      {creating && (
        <div className="block-create-form">
          <input
            className="block-create-input"
            type="text"
            placeholder="Nombre del bloque (ej. Bloque VI)"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            autoFocus
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" onClick={handleCreate} disabled={createLoading || !newName.trim()}>
              {createLoading ? 'Creando…' : 'Crear'}
            </button>
            <button className="btn-secondary" onClick={() => setCreating(false)}>Cancelar</button>
          </div>
          {createError && <div className="block-create-error">❌ {createError}</div>}
        </div>
      )}

      {/* ── Content ── */}
      {loading ? (
        <div className="loading"><div className="spinner" /><span>Cargando bloques…</span></div>
      ) : error ? (
        <div className="error-msg">❌ {error}</div>
      ) : (
        <div className="blocks-layout">
          {/* ── LEFT: Block list ── */}
          <div className="blocks-list-panel">
            <div className="blocks-panel-title">Bloques ({blocks.length})</div>
            {blocks.length === 0 ? (
              <div className="blocks-empty">No se encontraron bloques</div>
            ) : (
              blocks.map(block => {
                const isActive = sourceBlock?.key === block.key && showIncomplete;
                return (
                  <div
                    key={block.key}
                    className={`block-card ${isActive ? 'block-card-active' : ''}`}
                    onClick={() => openMover(block)}
                  >
                    <div className="block-card-header">
                      <div>
                        <div className="block-card-key">{block.key}</div>
                        <div className="block-card-name">{block.summary}</div>
                      </div>
                      <div className="block-card-badges">
                        <span className="block-badge block-badge-total" title="Total tareas">
                          {block.totalTasks}
                        </span>
                        {block.incompleteTasks > 0 && (
                          <span className="block-badge block-badge-incomplete" title="Incompletas">
                            {block.incompleteTasks} ⏳
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* ── RIGHT: Task mover ── */}
          <div className="blocks-mover-panel">
            {!sourceBlock ? (
              <div className="blocks-mover-empty">
                <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>👈</div>
                <div>Selecciona un bloque para ver sus tareas incompletas</div>
              </div>
            ) : (
              <>
                <div className="blocks-mover-header">
                  <div>
                    <div className="blocks-mover-title">{sourceBlock.summary}</div>
                    <div className="blocks-mover-subtitle">
                      {incompleteTasks.length} tarea{incompleteTasks.length !== 1 ? 's' : ''} incompleta{incompleteTasks.length !== 1 ? 's' : ''} de {sourceBlock.totalTasks} total
                    </div>
                  </div>
                  <button
                    className="btn-secondary btn-sm"
                    onClick={() => navigate(`/tasks/${sourceBlock.key}`)}
                  >
                    Ver bloque ↗
                  </button>
                </div>

                {incompleteTasks.length === 0 ? (
                  <div className="blocks-mover-empty" style={{ marginTop: 24 }}>
                    <div style={{ fontSize: '2rem' }}>✅</div>
                    <div>Todas las tareas están completas en este bloque</div>
                  </div>
                ) : (
                  <>
                    {/* Move bar */}
                    {selected.size > 0 && (
                      <div className="move-bar">
                        <span className="move-bar-count">{selected.size} seleccionada{selected.size !== 1 ? 's' : ''}</span>
                        <select
                          className="move-bar-select"
                          value={destBlockKey}
                          onChange={e => setDestBlockKey(e.target.value)}
                        >
                          <option value="">— Seleccionar bloque destino —</option>
                          {destOptions.map(b => (
                            <option key={b.key} value={b.key}>{b.summary} ({b.key})</option>
                          ))}
                        </select>
                        <button
                          className="btn-primary btn-sm"
                          onClick={handleMove}
                          disabled={!destBlockKey || moving}
                        >
                          {moving ? 'Moviendo…' : 'Mover →'}
                        </button>
                        <button className="btn-secondary btn-sm" onClick={() => setSelected(new Set())}>
                          Cancelar
                        </button>
                      </div>
                    )}

                    {/* Move result */}
                    {moveResult && (
                      <div className={`move-result ${moveResult.failed > 0 ? 'move-result-warn' : 'move-result-ok'}`}>
                        {moveResult.success > 0 && <span>✅ {moveResult.success} tarea{moveResult.success !== 1 ? 's' : ''} movida{moveResult.success !== 1 ? 's' : ''}</span>}
                        {moveResult.failed > 0 && <span>❌ {moveResult.failed} falló</span>}
                      </div>
                    )}

                    {/* Task list */}
                    <div className="task-mover-list">
                      <div className="task-mover-list-header">
                        <label className="task-checkbox-label">
                          <input
                            type="checkbox"
                            checked={selected.size === incompleteTasks.length}
                            onChange={() => toggleAll(incompleteTasks)}
                          />
                          Seleccionar todas
                        </label>
                      </div>
                      {incompleteTasks.map(task => (
                        <div
                          key={task.key}
                          className={`task-mover-item ${selected.has(task.key) ? 'selected' : ''}`}
                          onClick={() => toggleTask(task.key)}
                        >
                          <input
                            type="checkbox"
                            checked={selected.has(task.key)}
                            onChange={() => toggleTask(task.key)}
                            onClick={e => e.stopPropagation()}
                            className="task-mover-checkbox"
                          />
                          <div className="task-mover-item-body">
                            <div className="task-mover-item-top">
                              <StatusDot category={task.statusCategory} />
                              <span className="task-mover-key" onClick={e => { e.stopPropagation(); navigate(`/tasks/${task.key}`); }}>
                                {task.key}
                              </span>
                              <span className="task-mover-summary">{task.summary}</span>
                              {task.isWarranty && <WarrantyBadge small />}
                            </div>
                            <div className="task-mover-item-meta">
                              <span className="task-mover-status">{task.status}</span>
                              {task.assignee && (
                                <span className="task-mover-assignee">
                                  <span className="task-mover-avatar">{task.assigneeInitial}</span>
                                  {task.assignee}
                                </span>
                              )}
                              {task.updated && (
                                <span className="task-mover-updated">
                                  ↻ {new Date(task.updated).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
