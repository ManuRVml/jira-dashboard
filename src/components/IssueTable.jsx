import React from 'react';
import { useNavigate } from 'react-router-dom';
import { StatusBadge, PriorityBadge } from './StatusBadge';

export default function IssueTable({ issues, loading, error }) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <span>Cargando tareas...</span>
      </div>
    );
  }

  if (error) {
    return <div className="error-msg">❌ {error}</div>;
  }

  if (!issues || issues.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📋</div>
        <h3>No se encontraron tareas</h3>
        <p>Intenta ajustar los filtros o crear una nueva tarea.</p>
      </div>
    );
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Clave</th>
          <th>Resumen</th>
          <th>Estado</th>
          <th>Prioridad</th>
          <th>Asignado</th>
          <th>Actualizado</th>
        </tr>
      </thead>
      <tbody>
        {issues.map(issue => (
          <tr
            key={issue.id}
            className="clickable"
            onClick={() => navigate(`/tasks/${issue.key}`)}
          >
            <td>
              <span style={{ color: 'var(--accent-light)', fontWeight: 600 }}>
                {issue.key}
              </span>
            </td>
            <td style={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {issue.fields?.summary}
            </td>
            <td>
              <StatusBadge status={issue.fields?.status?.name} />
            </td>
            <td>
              <PriorityBadge priority={issue.fields?.priority?.name} />
            </td>
            <td>
              {issue.fields?.assignee?.displayName || (
                <span className="text-muted">Sin asignar</span>
              )}
            </td>
            <td className="text-muted">
              {issue.fields?.updated
                ? new Date(issue.fields.updated).toLocaleDateString('es-ES')
                : '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
