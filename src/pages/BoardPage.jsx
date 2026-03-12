import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBoards, useSprints } from '../hooks/useJira';
import { PriorityBadge } from '../components/StatusBadge';
import { api } from '../lib/api';

export default function BoardPage() {
  const navigate = useNavigate();
  const { data: boards, loading: boardsLoading } = useBoards();
  const [selectedBoard, setSelectedBoard] = useState(null);
  const [columns, setColumns] = useState([]);
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { data: sprints } = useSprints(selectedBoard);
  const [selectedSprint, setSelectedSprint] = useState(null);

  // Auto-select first board
  useEffect(() => {
    if (boards?.length > 0 && !selectedBoard) {
      setSelectedBoard(boards[0].id);
    }
  }, [boards, selectedBoard]);

  // Load board data
  const loadBoard = useCallback(async () => {
    if (!selectedBoard) return;
    setLoading(true);
    setError(null);
    try {
      const [configData, issuesData] = await Promise.all([
        api.getBoardConfig(selectedBoard),
        selectedSprint
          ? api.getSprintIssues(selectedSprint)
          : api.searchIssues(`board = ${selectedBoard} order by rank`, 0, 100).catch(() =>
              api.searchIssues('order by updated DESC', 0, 50)
            ),
      ]);

      // Extract columns from board config
      const cols = configData?.columnConfig?.columns || [];
      setColumns(cols.length > 0 ? cols : [
        { name: 'To Do', statuses: [{ id: 'todo' }] },
        { name: 'In Progress', statuses: [{ id: 'inprogress' }] },
        { name: 'Done', statuses: [{ id: 'done' }] },
      ]);

      setIssues(issuesData?.issues || []);
    } catch (err) {
      setError(err.message);
      // Fallback columns
      setColumns([
        { name: 'To Do' },
        { name: 'In Progress' },
        { name: 'Done' },
      ]);
    } finally {
      setLoading(false);
    }
  }, [selectedBoard, selectedSprint]);

  useEffect(() => { loadBoard(); }, [loadBoard]);

  // Group issues by column
  const getIssuesForColumn = (column) => {
    const statusIds = (column.statuses || []).map(s => s.id);
    if (statusIds.length === 0) {
      // Fallback: match by column name
      const colName = column.name.toLowerCase();
      return issues.filter(issue => {
        const status = (issue.fields?.status?.name || '').toLowerCase();
        const category = (issue.fields?.status?.statusCategory?.name || '').toLowerCase();
        if (colName.includes('done') || colName.includes('cerr')) return category === 'done';
        if (colName.includes('progress')) return category === 'indeterminate' || status.includes('progress');
        return category === 'new' || category === 'to do' || status.includes('to do') || status.includes('open');
      });
    }
    return issues.filter(issue =>
      statusIds.some(id => issue.fields?.status?.id === id)
    );
  };

  if (boardsLoading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <span>Cargando boards...</span>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h2>Board</h2>
        <p>Vista Kanban de tus tareas</p>
      </div>

      <div className="report-controls mb-3">
        <select
          className="form-select"
          value={selectedBoard || ''}
          onChange={(e) => {
            setSelectedBoard(Number(e.target.value));
            setSelectedSprint(null);
          }}
        >
          {(boards || []).map(b => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>

        {sprints?.length > 0 && (
          <select
            className="form-select"
            value={selectedSprint || ''}
            onChange={(e) => setSelectedSprint(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Todos los sprints</option>
            {sprints.map(s => (
              <option key={s.id} value={s.id}>
                {s.name} {s.state === 'active' ? '(Activo)' : ''}
              </option>
            ))}
          </select>
        )}

        <button className="btn btn-secondary btn-sm" onClick={loadBoard}>
          🔄 Actualizar
        </button>
      </div>

      {error && <div className="error-msg mb-3">⚠️ {error}</div>}

      {loading ? (
        <div className="loading">
          <div className="spinner"></div>
          <span>Cargando board...</span>
        </div>
      ) : (
        <div className="board-columns">
          {columns.map((col, idx) => {
            const colIssues = getIssuesForColumn(col);
            return (
              <div key={idx} className="board-column">
                <div className="board-column-header">
                  <span>{col.name}</span>
                  <span className="column-count">{colIssues.length}</span>
                </div>
                <div className="board-column-body">
                  {colIssues.map(issue => (
                    <div
                      key={issue.id}
                      className="board-card"
                      onClick={() => navigate(`/tasks/${issue.key}`)}
                    >
                      <div className="card-key">{issue.key}</div>
                      <div className="card-summary">{issue.fields?.summary}</div>
                      <div className="card-meta">
                        <PriorityBadge priority={issue.fields?.priority?.name} />
                        <div className="card-assignee">
                          {issue.fields?.assignee && (
                            <>
                              <div className="card-assignee-avatar">
                                {issue.fields.assignee.displayName?.charAt(0)}
                              </div>
                              {issue.fields.assignee.displayName?.split(' ')[0]}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {colIssues.length === 0 && (
                    <div className="text-muted" style={{ padding: 16, textAlign: 'center', fontSize: '0.85rem' }}>
                      Sin tareas
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
