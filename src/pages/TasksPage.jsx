import React, { useState } from 'react';
import { useIssues, useProjects } from '../hooks/useJira';
import IssueTable from '../components/IssueTable';

export default function TasksPage() {
  const [jql, setJql] = useState('order by updated DESC');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const { issues, total, loading, error, refresh } = useIssues(jql, page, pageSize);
  const { data: projects } = useProjects();

  const handleSearch = (e) => {
    e.preventDefault();
    const query = searchInput.trim();
    if (query) {
      // If it looks like JQL, use directly; otherwise search text
      if (query.includes('=') || query.includes(' AND ') || query.includes(' OR ')) {
        setJql(query);
      } else {
        setJql(`text ~ "${query}" order by updated DESC`);
      }
    } else {
      setJql('order by updated DESC');
    }
    setPage(0);
  };

  const filterByProject = (projectKey) => {
    if (projectKey) {
      setJql(`project = "${projectKey}" order by updated DESC`);
    } else {
      setJql('order by updated DESC');
    }
    setPage(0);
  };

  const filterByStatus = (status) => {
    let base = jql.replace(/ AND status = "[^"]*"/g, '').replace(/^status = "[^"]*"( AND )?/, '');
    if (!base || base === 'order by updated DESC') base = '';
    if (status) {
      const prefix = base ? `${base.replace(/ order by.*$/i, '')} AND ` : '';
      setJql(`${prefix}status = "${status}" order by updated DESC`);
    } else {
      setJql(base || 'order by updated DESC');
    }
    setPage(0);
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div>
      <div className="page-header">
        <h2>Tareas</h2>
        <p>Busca, filtra y gestiona todas tus tareas de Jira</p>
      </div>

      <div className="table-container">
        <div className="table-toolbar">
          <form onSubmit={handleSearch} className="search-wrapper">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              className="search-input"
              placeholder="Buscar por texto o escribir JQL..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </form>

          <select
            className="form-select"
            onChange={(e) => filterByProject(e.target.value)}
            style={{ width: 'auto', minWidth: 160 }}
          >
            <option value="">Todos los proyectos</option>
            {(projects || []).map(p => (
              <option key={p.key || p.id} value={p.key}>
                {p.name}
              </option>
            ))}
          </select>

          <select
            className="form-select"
            onChange={(e) => filterByStatus(e.target.value)}
            style={{ width: 'auto', minWidth: 140 }}
          >
            <option value="">Todos los estados</option>
            <option value="To Do">To Do</option>
            <option value="In Progress">In Progress</option>
            <option value="Done">Done</option>
            <option value="Blocked">Blocked</option>
          </select>

          <button className="btn btn-secondary btn-sm" onClick={refresh}>
            🔄 Actualizar
          </button>
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
