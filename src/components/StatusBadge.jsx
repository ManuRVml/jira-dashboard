import React from 'react';

const STATUS_MAP = {
  'to do': 'status-todo',
  'open': 'status-todo',
  'backlog': 'status-todo',
  'new': 'status-todo',
  'in progress': 'status-in-progress',
  'in review': 'status-in-progress',
  'in development': 'status-in-progress',
  'done': 'status-done',
  'closed': 'status-done',
  'resolved': 'status-done',
  'complete': 'status-done',
  'blocked': 'status-blocked',
  'garantia': 'status-warranty',
  'garantía': 'status-warranty',
};

const PRIORITY_MAP = {
  'highest': 'priority-highest',
  'high': 'priority-high',
  'medium': 'priority-medium',
  'low': 'priority-low',
  'lowest': 'priority-lowest',
};

export function StatusBadge({ status }) {
  const key = (status || '').toLowerCase();
  const cls = STATUS_MAP[key] || 'status-todo';
  return <span className={`badge ${cls}`}>{status}</span>;
}

export function PriorityBadge({ priority }) {
  const key = (priority || '').toLowerCase();
  const cls = PRIORITY_MAP[key] || 'priority-medium';
  return <span className={`badge ${cls}`}>{priority}</span>;
}

export function WarrantyBadge({ small = false }) {
  return (
    <span className={`badge-warranty ${small ? 'badge-warranty-sm' : ''}`}>
      🛡️ Garantía
    </span>
  );
}

