import React from 'react';

export default function ChartCard({ title, children }) {
  return (
    <div className="chart-card">
      <div className="chart-title">{title}</div>
      {children}
    </div>
  );
}
