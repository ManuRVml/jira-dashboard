import React, { useState, useMemo } from 'react';
import { useIssues } from '../hooks/useJira';
import IssueTable from '../components/IssueTable';

const DEFAULT_PROJECT = 'PY06809';

const STATUS_OPTIONS = [
  'En Progreso', 'En Validación', 'Por Hacer', 'Hecho',
  'Bloqueado', 'En Revisión', 'Cerrado', 'Abierto', 'Reabierto',
];

const PRIORITY_OPTIONS = ['Highest', 'High', 'Medium', 'Low', 'Lowest'];

const TYPE_OPTIONS = ['Bug', 'Task', 'Story', 'Epic', 'Sub-task', 'Improvement'];

export default function TasksPage() {
  const [searchInput, setSearchInput] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedPriority, setSelectedPriority] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedAssignee, setSelectedAssignee] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 20;

  // Build JQL from all active filters
  const jql = useMemo(() => {
    const clauses = [`project = "${DEFAULT_PROJECT}"`];

    if (searchInput.trim()) {
      const q = searchInput.trim();
      // If it looks like raw JQL, use it directly
      if (q.includes('=') || q.includes(' AND ') || q.includes(' OR ')) {
        return q;
      }
      clauses.push(`text ~ "${q}"`);
    }
    if (selectedStatus) clauses.push(`status = "${selectedStatus}"`);
    if (selectedPriority) clauses.push(`priority = "${selectedPriority}"`);
    if (selectedType) clauses.push(`issuetype = "${selectedType}"`);
    if (selectedAssignee) {
      if (selectedAssignee === '__unassigned__') {
        clauses.push('assignee is EMPTY');
      } else {
        clauses.push(`assignee = "${selectedAssignee}"`);
      }
    }

    const where = clauses.length > 0 ? clauses.join(' AND ') + ' ' : '';
    return `${where}order by updated DESC`;
  }, [searchInput, selectedStatus, selectedPriority, selectedType, selectedAssignee]);

  const { issues, total, loading, error, refresh } = useIssues(jql, page, pageSize);

  // Extract unique assignees from loaded issues for quick-filter
  const assignees = useMemo(() => {
    if (!issues || issues.length === 0) return [];
    const map = new Map();
    issues.forEach(issue => {
      const a = issue.fields?.assignee;
      if (a && a.name && !map.has(a.name)) {
        map.set(a.name, a.displayName || a.name);
      }
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [issues]);

  const hasActiveFilters = selectedStatus || selectedPriority || selectedType || selectedAssignee || searchInput.trim();

  const clearAllFilters = () => {
    setSearchInput('');
    setSelectedStatus('');
    setSelectedPriority('');
    setSelectedType('');
    setSelectedAssignee('');
    setPage(0);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(0);
  };

  const activeFilterCount = [selectedStatus, selectedPriority, selectedType, selectedAssignee]
    .filter(Boolean).length + (searchInput.trim() ? 1 : 0);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div>
      <div className="page-header">
        <h2>Tareas — {DEFAULT_PROJECT}</h2>
        <p>Busca, filtra y gestiona las tareas del proyecto</p>
      </div>

      <div className="table-container">
        {/* Search bar row */}
        <div className="table-toolbar">
          <form onSubmit={handleSearch} className="search-wrapper">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              className="search-input"
              placeholder="Buscar por texto o escribir JQL..."
              value={searchInput}
              onChange={(e) => { setSearchInput(e.target.value); setPage(0); }}
            />
          </form>

          <button className="btn btn-secondary btn-sm" onClick={refresh}>
            🔄 Actualizar
          </button>

          {hasActiveFilters && (
            <button className="btn btn-ghost btn-sm" onClick={clearAllFilters}>
              ✕ Limpiar filtros {activeFilterCount > 0 && <span className="filter-count">{activeFilterCount}</span>}
            </button>
          )}
        </div>

        {/* Filters row */}
        <div className="filters-row">
          <div className="filter-chip-group">

            <select
              id="filter-status"
              className="filter-select"
              value={selectedStatus}
              onChange={(e) => { setSelectedStatus(e.target.value); setPage(0); }}
            >
              <option value="">📊 Estado</option>
              {STATUS_OPTIONS.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            <select
              id="filter-priority"
              className="filter-select"
              value={selectedPriority}
              onChange={(e) => { setSelectedPriority(e.target.value); setPage(0); }}
            >
              <option value="">🔥 Prioridad</option>
              {PRIORITY_OPTIONS.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>

            <select
              id="filter-type"
              className="filter-select"
              value={selectedType}
              onChange={(e) => { setSelectedType(e.target.value); setPage(0); }}
            >
              <option value="">📋 Tipo</option>
              {TYPE_OPTIONS.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>

            <select
              id="filter-assignee"
              className="filter-select"
              value={selectedAssignee}
              onChange={(e) => { setSelectedAssignee(e.target.value); setPage(0); }}
            >
              <option value="">👤 Asignado</option>
              <option value="__unassigned__">Sin asignar</option>
              {assignees.map(([name, display]) => (
                <option key={name} value={name}>{display}</option>
              ))}
            </select>
          </div>

          {hasActiveFilters && (
            <div className="active-filters-summary">

              {selectedStatus && <span className="filter-tag">📊 {selectedStatus} <button onClick={() => setSelectedStatus('')}>×</button></span>}
              {selectedPriority && <span className="filter-tag">🔥 {selectedPriority} <button onClick={() => setSelectedPriority('')}>×</button></span>}
              {selectedType && <span className="filter-tag">📋 {selectedType} <button onClick={() => setSelectedType('')}>×</button></span>}
              {selectedAssignee && <span className="filter-tag">👤 {selectedAssignee === '__unassigned__' ? 'Sin asignar' : assignees.find(a => a[0] === selectedAssignee)?.[1] || selectedAssignee} <button onClick={() => setSelectedAssignee('')}>×</button></span>}
            </div>
          )}
        </div>

        <IssueTable issues={issues} loading={loading} error={error} />

        {total > pageSize && (
          <div className="table-pagination">
            <span>
              Mostrando {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} de {total}
            </span>
            <div className="flex gap-1">
              <button
                className="btn btn-ghost btn-sm"
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
              >
                ← Anterior
              </button>
              <button
                className="btn btn-ghost btn-sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage(p => p + 1)}
              >
                Siguiente →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
