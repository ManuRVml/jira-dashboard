import React from 'react';
import { NavLink } from 'react-router-dom';
import { useHealth } from '../hooks/useJira';

export default function Sidebar() {
  const { data: user } = useHealth();

  const links = [
    { path: '/', icon: '📊', label: 'Dashboard' },
    { path: '/tasks', icon: '📋', label: 'Tareas' },
    { path: '/create', icon: '➕', label: 'Nueva Tarea' },
    { path: '/board', icon: '🗂️', label: 'Board' },
    { path: '/blocks', icon: '📦', label: 'Bloques' },
    { path: '/reports', icon: '📈', label: 'Reportes' },
    { path: '/settings', icon: '⚙️', label: 'Configuración' },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-icon">⚡</div>
        <h1>Jira Dashboard</h1>
      </div>

      <nav className="sidebar-nav">
        {links.map(link => (
          <NavLink
            key={link.path}
            to={link.path}
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            end={link.path === '/'}
          >
            <span className="nav-icon">{link.icon}</span>
            {link.label}
          </NavLink>
        ))}
      </nav>

      {user && user.status === 'connected' && (
        <div className="sidebar-user">
          <div className="user-avatar">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.user} />
            ) : (
              user.user?.charAt(0)?.toUpperCase()
            )}
          </div>
          <div className="user-info">
            <div className="user-name">{user.user}</div>
            <div className="user-status">Conectado</div>
          </div>
        </div>
      )}
    </aside>
  );
}
