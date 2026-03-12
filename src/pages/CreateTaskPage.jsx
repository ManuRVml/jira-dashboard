import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjects } from '../hooks/useJira';
import { api } from '../lib/api';

export default function CreateTaskPage() {
  const navigate = useNavigate();
  const { data: projects } = useProjects();
  const [form, setForm] = useState({
    projectKey: '',
    issueType: 'Task',
    summary: '',
    description: '',
    priority: 'Medium',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.projectKey || !form.summary) {
      setError('Proyecto y resumen son requeridos.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const body = {
        fields: {
          project: { key: form.projectKey },
          summary: form.summary,
          issuetype: { name: form.issueType },
          priority: { name: form.priority },
        },
      };
      if (form.description) {
        body.fields.description = {
          type: 'doc',
          version: 1,
          content: [{
            type: 'paragraph',
            content: [{ type: 'text', text: form.description }],
          }],
        };
      }
      const result = await api.createIssue(body);
      navigate(`/tasks/${result.key}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h2>Nueva Tarea</h2>
        <p>Crea una nueva tarea en tu proyecto de Jira</p>
      </div>

      <div className="card settings-card">
        {error && <div className="error-msg">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Proyecto *</label>
            <select
              name="projectKey"
              className="form-select"
              value={form.projectKey}
              onChange={handleChange}
              required
            >
              <option value="">Seleccionar proyecto...</option>
              {(projects || []).map(p => (
                <option key={p.key || p.id} value={p.key}>
                  {p.name} ({p.key})
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Tipo de Issue</label>
            <select
              name="issueType"
              className="form-select"
              value={form.issueType}
              onChange={handleChange}
            >
              <option value="Task">Task</option>
              <option value="Bug">Bug</option>
              <option value="Story">Story</option>
              <option value="Epic">Epic</option>
              <option value="Sub-task">Sub-task</option>
            </select>
          </div>

          <div className="form-group">
            <label>Resumen *</label>
            <input
              name="summary"
              type="text"
              className="form-input"
              placeholder="Título de la tarea..."
              value={form.summary}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label>Descripción</label>
            <textarea
              name="description"
              className="form-textarea"
              placeholder="Descripción detallada de la tarea..."
              value={form.description}
              onChange={handleChange}
            />
          </div>

          <div className="form-group">
            <label>Prioridad</label>
            <select
              name="priority"
              className="form-select"
              value={form.priority}
              onChange={handleChange}
            >
              <option value="Highest">Highest</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
              <option value="Lowest">Lowest</option>
            </select>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
            >
              {submitting ? 'Creando...' : '✨ Crear Tarea'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate('/tasks')}
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
