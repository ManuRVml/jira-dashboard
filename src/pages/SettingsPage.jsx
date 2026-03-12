import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';

export default function SettingsPage() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkConnection();
  }, []);

  const checkConnection = async () => {
    setLoading(true);
    try {
      const data = await api.health();
      setStatus(data);
    } catch (err) {
      setStatus({ status: 'error', error: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h2>Configuración</h2>
        <p>Estado de conexión y configuración de la aplicación</p>
      </div>

      <div className="card settings-card">
        <h3 style={{ marginBottom: 20, fontWeight: 700 }}>Conexión a Jira</h3>

        {loading ? (
          <div className="loading" style={{ padding: 30 }}>
            <div className="spinner"></div>
            <span>Verificando conexión...</span>
          </div>
        ) : status?.status === 'connected' ? (
          <>
            <div className="connection-status connected">
              ✅ Conectado a Jira como <strong>{status.user}</strong>
            </div>

            <div className="detail-field">
              <span className="field-label">Usuario</span>
              <span>{status.user}</span>
            </div>
            <div className="detail-field">
              <span className="field-label">Email</span>
              <span>{status.email}</span>
            </div>
          </>
        ) : (
          <>
            <div className="connection-status disconnected">
              ❌ No conectado — {status?.error || 'No se pudo conectar'}
            </div>
          </>
        )}

        <div className="mt-3">
          <button className="btn btn-primary" onClick={checkConnection}>
            🔄 Probar Conexión
          </button>
        </div>

        <div className="mt-4">
          <h4 style={{ fontWeight: 700, marginBottom: 12 }}>Cómo configurar</h4>
          <div style={{ color: 'var(--text-secondary)', lineHeight: 1.8, fontSize: '0.9rem' }}>
            <p>1. Copia el archivo <code>.env.example</code> a <code>.env</code></p>
            <p>2. Edita el archivo <code>.env</code> con tus credenciales:</p>
            <div style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '16px',
              marginTop: 8,
              fontFamily: 'monospace',
              fontSize: '0.85rem',
            }}>
              <div><span style={{ color: 'var(--accent-light)' }}>JIRA_BASE_URL</span>=https://tu-empresa.atlassian.net</div>
              <div><span style={{ color: 'var(--accent-light)' }}>JIRA_EMAIL</span>=tu-email@example.com</div>
              <div><span style={{ color: 'var(--accent-light)' }}>JIRA_API_TOKEN</span>=tu-token-aqui</div>
            </div>
            <p className="mt-2">
              3. Genera tu API Token en{' '}
              <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noopener noreferrer">
                id.atlassian.com
              </a>
            </p>
            <p>4. Reinicia el servidor backend (<code>node server.js</code>)</p>
          </div>
        </div>
      </div>
    </div>
  );
}
