import React, { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import NotificationPanel from './components/NotificationPanel';
import { useNotifications } from './hooks/useNotifications';
import DashboardPage from './pages/DashboardPage';
import TasksPage from './pages/TasksPage';
import TaskDetailPage from './pages/TaskDetailPage';
import CreateTaskPage from './pages/CreateTaskPage';
import BoardPage from './pages/BoardPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import BlocksPage from './pages/BlocksPage';

function NotificationBell() {
  const [panelOpen, setPanelOpen] = useState(false);
  const {
    notifications,
    unreadCount,
    loading,
    error,
    lastFetched,
    markAsReviewed,
    markAllReviewed,
    refresh,
  } = useNotifications();

  return (
    <>
      {/* Fixed bell button — top right */}
      <button
        id="notif-bell-global"
        className={`notif-bell-global ${unreadCount > 0 ? 'has-unread' : ''} ${panelOpen ? 'active' : ''}`}
        onClick={() => setPanelOpen(p => !p)}
        title={unreadCount > 0 ? `${unreadCount} actualizaciones nuevas` : 'Notificaciones'}
        aria-label="Notificaciones"
      >
        <span className="notif-bell-shake-wrapper">
          <span className={`notif-bell-global-icon ${unreadCount > 0 ? 'shaking' : ''}`}>
            🔔
          </span>
        </span>
        {unreadCount > 0 && (
          <span className="notif-bell-global-badge">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Panel dropdown */}
      {panelOpen && (
        <NotificationPanel
          notifications={notifications}
          unreadCount={unreadCount}
          loading={loading}
          error={error}
          lastFetched={lastFetched}
          onClose={() => setPanelOpen(false)}
          onMarkAsReviewed={markAsReviewed}
          onMarkAllReviewed={markAllReviewed}
          onRefresh={refresh}
        />
      )}
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-layout">
        <Sidebar />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/tasks/:key" element={<TaskDetailPage />} />
            <Route path="/create" element={<CreateTaskPage />} />
            <Route path="/board" element={<BoardPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/blocks" element={<BlocksPage />} />
          </Routes>
        </main>
        {/* Global notification bell — fixed top-right */}
        <NotificationBell />
      </div>
    </BrowserRouter>
  );
}

