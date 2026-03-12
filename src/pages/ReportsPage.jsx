import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import ChartCard from '../components/ChartCard';
import { api } from '../lib/api';
import { useProjects } from '../hooks/useJira';

// PDF / CSV
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import Papa from 'papaparse';

const PRESET_RANGES = [
  { label: 'Hoy', getValue: () => { const d = new Date().toISOString().slice(0, 10); return { dateFrom: d, dateTo: d }; } },
  { label: 'Ayer', getValue: () => { const d = new Date(); d.setDate(d.getDate() - 1); const s = d.toISOString().slice(0, 10); return { dateFrom: s, dateTo: s }; } },
  { label: 'Últimos 7 días', getValue: () => ({ dateFrom: daysAgo(7), dateTo: today() }) },
  { label: 'Últimos 30 días', getValue: () => ({ dateFrom: daysAgo(30), dateTo: today() }) },
  { label: 'Este mes', getValue: () => ({ dateFrom: monthStart(), dateTo: today() }) },
  { label: 'Último mes', getValue: () => ({ dateFrom: prevMonthStart(), dateTo: prevMonthEnd() }) },
];

function today() { return new Date().toISOString().slice(0, 10); }
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }
function monthStart() { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); }
function prevMonthStart() { const d = new Date(); d.setMonth(d.getMonth() - 1); d.setDate(1); return d.toISOString().slice(0, 10); }
function prevMonthEnd() { const d = new Date(); d.setDate(0); return d.toISOString().slice(0, 10); }

const TOOLTIP_STYLE = {
  contentStyle: { background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f8fafc' },
};

// Enhanced markdown to HTML renderer
function renderMarkdown(md) {
  if (!md) return '';
  // Strip code fences Gemini sometimes wraps output in
  let text = md.replace(/^```(?:markdown)?\s*\n?/gm, '').replace(/\n?```\s*$/gm, '').trim();
  const lines = text.split('\n');
  const html = [];
  let inUl = false;
  let inOl = false;
  let inNestedUl = false;

  const closeList = () => {
    if (inNestedUl) { html.push('</ul></li>'); inNestedUl = false; }
    if (inUl) { html.push('</ul>'); inUl = false; }
    if (inOl) { html.push('</ol>'); inOl = false; }
  };

  const inline = (s) => s
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Headers
    if (/^###\s+(.+)/.test(line)) { closeList(); html.push(`<h3>${inline(line.replace(/^###\s+/, ''))}</h3>`); continue; }
    if (/^##\s+(.+)/.test(line)) { closeList(); html.push(`<h2>${inline(line.replace(/^##\s+/, ''))}</h2>`); continue; }
    if (/^#\s+(.+)/.test(line)) { closeList(); html.push(`<h1>${inline(line.replace(/^#\s+/, ''))}</h1>`); continue; }
    // Horizontal rule
    if (/^---+$/.test(line.trim())) { closeList(); html.push('<hr/>'); continue; }
    // Numbered list item
    if (/^\d+\.\s+(.+)/.test(line)) {
      if (inNestedUl) { html.push('</ul></li>'); inNestedUl = false; }
      if (inUl) { html.push('</ul>'); inUl = false; }
      if (!inOl) { html.push('<ol>'); inOl = true; }
      html.push(`<li>${inline(line.replace(/^\d+\.\s+/, ''))}</li>`);
      continue;
    }
    // Nested bullet (3+ spaces or tab + - or *)
    if (/^[\s]{2,}[-*•]\s+(.+)/.test(line)) {
      if (!inNestedUl) {
        // Replace last </li> with open nested ul
        const lastItem = html[html.length - 1];
        if (lastItem && lastItem.endsWith('</li>')) {
          html[html.length - 1] = lastItem.slice(0, -5); // remove </li>
          html.push('<ul>');
          inNestedUl = true;
        }
      }
      html.push(`<li>${inline(line.replace(/^[\s]+[-*•]\s+/, ''))}</li>`);
      continue;
    }
    // Top-level bullet
    if (/^[-*•]\s+(.+)/.test(line)) {
      if (inNestedUl) { html.push('</ul></li>'); inNestedUl = false; }
      if (inOl) { html.push('</ol>'); inOl = false; }
      if (!inUl) { html.push('<ul>'); inUl = true; }
      html.push(`<li>${inline(line.replace(/^[-*•]\s+/, ''))}</li>`);
      continue;
    }
    // Empty line
    if (line.trim() === '') { closeList(); continue; }
    // Regular paragraph
    closeList();
    html.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  return html.join('\n');
}

export default function ReportsPage() {
  const { data: projects } = useProjects();
  const [params, setParams] = useState({ dateFrom: daysAgo(30), dateTo: today() });
  const [summary, setSummary] = useState(null);
  const [timeline, setTimeline] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  // AI Report state
  const [aiReport, setAiReport] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [copied, setCopied] = useState(false);
  const reportRef = useRef(null);

  // Block Report state
  const [blockType, setBlockType] = useState('cierre');
  const [blockMonthFrom, setBlockMonthFrom] = useState('Enero');
  const [blockMonthTo, setBlockMonthTo] = useState('Febrero');
  const [blockYear, setBlockYear] = useState('2026');
  const [blockCases, setBlockCases] = useState([
    { key: 'PY06809-44', hours: 1 },
    { key: 'PY06809-46', hours: 11 },
    { key: 'PY06809-53', hours: 9 },
    { key: 'PY06809-54', hours: 1 },
    { key: 'PY06809-55', hours: 1 },
    { key: 'PY06809-58', hours: 1 },
    { key: 'PY06809-56', hours: 64 },
    { key: 'PY06809-57', hours: 4 },
    { key: 'PY06809-61', hours: 1 },
    { key: 'PY06809-64', hours: 1 },
    { key: 'PY06809-65', hours: 4 },
    { key: 'PY06809-63', hours: 2 },
  ]);
  const [blockReport, setBlockReport] = useState(null);
  const [blockLoading, setBlockLoading] = useState(false);
  const [blockError, setBlockError] = useState(null);
  const [blockCopied, setBlockCopied] = useState(false);
  const blockReportRef = useRef(null);

  const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  const addBlockCase = () => setBlockCases(prev => [...prev, { key: '', hours: 0 }]);
  const removeBlockCase = (idx) => setBlockCases(prev => prev.filter((_, i) => i !== idx));
  const updateBlockCase = (idx, field, value) => {
    setBlockCases(prev => prev.map((c, i) => i === idx ? { ...c, [field]: field === 'hours' ? Number(value) || 0 : value } : c));
  };
  const blockTotalHours = blockCases.reduce((s, c) => s + (c.hours || 0), 0);

  const generateBlockReportFn = async () => {
    setBlockLoading(true);
    setBlockError(null);
    setBlockReport(null);
    try {
      const data = await api.generateBlockReport({
        type: blockType,
        period: { label: `${blockMonthFrom} - ${blockMonthTo} ${blockYear}`, months: [blockMonthFrom, blockMonthTo], year: blockYear },
        cases: blockCases.filter(c => c.key.trim()),
      });
      setBlockReport(data);
    } catch (err) {
      setBlockError(err.message);
    } finally {
      setBlockLoading(false);
    }
  };

  const copyBlockReport = async () => {
    if (!blockReport?.report) return;
    try {
      await navigator.clipboard.writeText(blockReport.report);
      setBlockCopied(true);
      setTimeout(() => setBlockCopied(false), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = blockReport.report;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setBlockCopied(true);
      setTimeout(() => setBlockCopied(false), 2000);
    }
  };

  const [wordLoading, setWordLoading] = useState(false);
  const [wordSavedTo, setWordSavedTo] = useState(null);
  const [wordFilename, setWordFilename] = useState('');
  const generateWordReport = async () => {
    setWordLoading(true);
    setBlockError(null);
    setWordSavedTo(null);
    try {
      const result = await api.generateBlockReportDocx({
        type: blockType,
        period: { label: `${blockMonthFrom} - ${blockMonthTo} ${blockYear}`, months: [blockMonthFrom, blockMonthTo], year: blockYear },
        cases: blockCases.filter(c => c.key.trim()),
      });
      setWordSavedTo(result.savedTo);
      setWordFilename(result.filename);
    } catch (err) {
      setBlockError(err.message);
    } finally {
      setWordLoading(false);
    }
  };
  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sumData, tlData] = await Promise.all([
        api.getSummaryReport(params),
        api.getCreatedVsResolved(params),
      ]);
      setSummary(sumData);
      setTimeline(tlData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [JSON.stringify(params)]);

  useEffect(() => { loadReports(); }, [loadReports]);

  const applyPreset = (preset) => {
    setParams(prev => ({ ...prev, ...preset.getValue() }));
  };

  // Calculate daily standup window: yesterday 8:45 AM → today 8:00 AM
  const getDailyWindow = () => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);
    return {
      dateTimeFrom: `${yesterdayStr} 08:45`,
      dateTimeTo: `${todayStr} 08:00`,
      label: `${yesterdayStr} 8:45 AM → ${todayStr} 8:00 AM`,
    };
  };

  const [dailyWindow, setDailyWindow] = useState(getDailyWindow());

  const generateAiReport = async () => {
    setAiLoading(true);
    setAiError(null);
    setAiReport(null);
    const window = getDailyWindow();
    setDailyWindow(window);
    try {
      const reportParams = {
        dateTimeFrom: window.dateTimeFrom,
        dateTimeTo: window.dateTimeTo,
        project: params.project || 'PY06809',
      };
      const data = await api.getActivityReport(reportParams);
      setAiReport(data);
    } catch (err) {
      setAiError(err.message);
    } finally {
      setAiLoading(false);
    }
  };

  const copyReport = async () => {
    if (!aiReport?.report) return;
    try {
      await navigator.clipboard.writeText(aiReport.report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = aiReport.report;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const exportReportPDF = () => {
    if (!aiReport?.report) return;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('Reporte de Actividades — Jira', 14, 20);
    doc.setFontSize(10);
    doc.text(`Período: ${params.dateFrom} a ${params.dateTo}`, 14, 28);
    doc.text(`Tareas analizadas: ${aiReport.issuesAnalyzed}`, 14, 34);
    doc.setFontSize(10);

    // Split report text into lines that fit the page width
    const lines = doc.splitTextToSize(aiReport.report.replace(/[#*`]/g, ''), 180);
    doc.text(lines, 14, 44);

    doc.save(`reporte-actividades-${params.dateFrom}-${params.dateTo}.pdf`);
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Reporte Jira Dashboard', 14, 22);
    doc.setFontSize(11);
    doc.text(`Período: ${params.dateFrom} a ${params.dateTo}`, 14, 32);
    doc.text(`Total de tareas: ${summary?.total || 0}`, 14, 40);

    if (summary?.byStatus?.length > 0) {
      doc.setFontSize(13);
      doc.text('Por Estado', 14, 52);
      doc.autoTable({
        startY: 56,
        head: [['Estado', 'Cantidad']],
        body: summary.byStatus.map(s => [s.name, s.count]),
        styles: { fontSize: 10 },
        headStyles: { fillColor: [108, 92, 231] },
      });
    }

    if (summary?.byAssignee?.length > 0) {
      const y = doc.lastAutoTable?.finalY || 70;
      doc.setFontSize(13);
      doc.text('Por Asignado', 14, y + 12);
      doc.autoTable({
        startY: y + 16,
        head: [['Asignado', 'Cantidad']],
        body: summary.byAssignee.map(a => [a.name, a.count]),
        styles: { fontSize: 10 },
        headStyles: { fillColor: [108, 92, 231] },
      });
    }

    doc.save(`jira-report-${params.dateFrom}-${params.dateTo}.pdf`);
  };

  const exportCSV = () => {
    if (!summary) return;
    const rows = [
      ...(summary.byStatus || []).map(s => ({ category: 'Estado', name: s.name, count: s.count })),
      ...(summary.byPriority || []).map(p => ({ category: 'Prioridad', name: p.name, count: p.count })),
      ...(summary.byAssignee || []).map(a => ({ category: 'Asignado', name: a.name, count: a.count })),
    ];
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jira-report-${params.dateFrom}-${params.dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="page-header">
        <h2>Reportes</h2>
        <p>Analíticas e informes de tu espacio Jira</p>
      </div>

      <div className="report-controls">
        <select
          className="form-select"
          value={params.project || ''}
          onChange={(e) => setParams(prev => ({ ...prev, project: e.target.value || undefined }))}
        >
          <option value="">Todos los proyectos</option>
          {(projects || []).map(p => (
            <option key={p.key || p.id} value={p.key}>{p.name}</option>
          ))}
        </select>

        <input
          type="date"
          className="form-input"
          value={params.dateFrom || ''}
          onChange={(e) => setParams(prev => ({ ...prev, dateFrom: e.target.value }))}
          style={{ width: 'auto' }}
        />
        <span className="text-muted">→</span>
        <input
          type="date"
          className="form-input"
          value={params.dateTo || ''}
          onChange={(e) => setParams(prev => ({ ...prev, dateTo: e.target.value }))}
          style={{ width: 'auto' }}
        />

        {PRESET_RANGES.map(preset => (
          <button
            key={preset.label}
            className="btn btn-ghost btn-sm"
            onClick={() => applyPreset(preset)}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2 mb-3">
        <button className="btn btn-primary btn-sm" onClick={exportPDF}>
          📄 Exportar PDF
        </button>
        <button className="btn btn-secondary btn-sm" onClick={exportCSV}>
          📊 Exportar CSV
        </button>
      </div>

      {error && <div className="error-msg mb-3">❌ {error}</div>}

      {loading ? (
        <div className="loading">
          <div className="spinner"></div>
          <span>Generando reportes...</span>
        </div>
      ) : (
        <>
          <div className="tab-nav">
            <button className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
              Resumen
            </button>
            <button className={`tab-btn ${activeTab === 'timeline' ? 'active' : ''}`} onClick={() => setActiveTab('timeline')}>
              Creados vs Resueltos
            </button>
            <button className={`tab-btn ${activeTab === 'team' ? 'active' : ''}`} onClick={() => setActiveTab('team')}>
              Por Persona
            </button>
            <button className={`tab-btn ${activeTab === 'ai-report' ? 'active' : ''}`} onClick={() => setActiveTab('ai-report')}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <span style={{ fontSize: '1.1em' }}>🤖</span> Reporte IA
            </button>
            <button className={`tab-btn ${activeTab === 'block-report' ? 'active' : ''}`} onClick={() => setActiveTab('block-report')}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <span style={{ fontSize: '1.1em' }}>📊</span> Reporte por Bloque
            </button>
          </div>

          {activeTab === 'overview' && (
            <div className="charts-grid">
              <ChartCard title={`Distribución por Estado (${summary?.total || 0} tareas)`}>
                {summary?.byStatus?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={summary.byStatus} barSize={36}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={{ stroke: '#334155' }} />
                      <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={{ stroke: '#334155' }} />
                      <Tooltip {...TOOLTIP_STYLE} />
                      <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} name="Tareas" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <div className="empty-state"><p>Sin datos</p></div>}
              </ChartCard>

              <ChartCard title="Por Prioridad">
                {summary?.byPriority?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={summary.byPriority} barSize={36}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={{ stroke: '#334155' }} />
                      <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={{ stroke: '#334155' }} />
                      <Tooltip {...TOOLTIP_STYLE} />
                      <Bar dataKey="count" fill="#14b8a6" radius={[4, 4, 0, 0]} name="Tareas" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <div className="empty-state"><p>Sin datos</p></div>}
              </ChartCard>
            </div>
          )}

          {activeTab === 'timeline' && (
            <div className="chart-card">
              <div className="chart-title">Tareas Creadas vs Resueltas en el Tiempo</div>
              {timeline?.timeline?.length > 0 ? (
                <ResponsiveContainer width="100%" height={360}>
                  <LineChart data={timeline.timeline}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={{ stroke: '#334155' }} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={{ stroke: '#334155' }} />
                    <Tooltip {...TOOLTIP_STYLE} />
                    <Legend wrapperStyle={{ fontSize: '0.85rem' }} />
                    <Line type="monotone" dataKey="created" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} name="Creadas" />
                    <Line type="monotone" dataKey="resolved" stroke="#14b8a6" strokeWidth={2} dot={{ r: 3 }} name="Resueltas" />
                  </LineChart>
                </ResponsiveContainer>
              ) : <div className="empty-state"><p>Sin datos en este período</p></div>}
            </div>
          )}

          {activeTab === 'team' && (
            <div className="chart-card">
              <div className="chart-title">Tareas por Persona</div>
              {summary?.byAssignee?.length > 0 ? (
                <ResponsiveContainer width="100%" height={360}>
                  <BarChart data={summary.byAssignee} layout="vertical" barSize={20}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={{ stroke: '#334155' }} />
                    <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} width={150} axisLine={{ stroke: '#334155' }} />
                    <Tooltip {...TOOLTIP_STYLE} />
                    <Bar dataKey="count" fill="#818cf8" radius={[0, 4, 4, 0]} name="Tareas" />
                  </BarChart>
                </ResponsiveContainer>
              ) : <div className="empty-state"><p>Sin datos</p></div>}
            </div>
          )}

          {activeTab === 'ai-report' && (
            <div className="ai-report-section">
              {/* Header Card */}
              <div className="ai-report-header">
                <div className="ai-report-header-left">
                  <div className="ai-report-icon">🤖</div>
                  <div>
                    <h3 className="ai-report-title">Reporte para la Daily</h3>
                    <div className="ai-report-window">
                      <span className="ai-report-window-icon">🕐</span>
                      <span>{dailyWindow.label}</span>
                    </div>
                  </div>
                </div>
                <button
                  className={`btn btn-primary ai-generate-btn ${aiLoading ? 'loading' : ''}`}
                  onClick={generateAiReport}
                  disabled={aiLoading}
                >
                  {aiLoading ? (
                    <>
                      <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }}></div>
                      Analizando...
                    </>
                  ) : (
                    <>✨ Generar Reporte</>
                  )}
                </button>
              </div>

              {aiError && (
                <div className="error-msg" style={{ marginBottom: 16, marginTop: 16 }}>
                  ❌ {aiError}
                </div>
              )}

              {aiLoading && (
                <div className="ai-loading-state">
                  <div className="ai-loading-pulse"></div>
                  <div className="ai-loading-text">
                    <p className="ai-loading-title">Preparando tu reporte para la daily...</p>
                    <p className="ai-loading-subtitle">
                      Analizando changelogs y comentarios · {dailyWindow.label}
                    </p>
                  </div>
                  <div className="ai-loading-skeleton">
                    <div className="skeleton-line wide"></div>
                    <div className="skeleton-line medium"></div>
                    <div className="skeleton-line narrow"></div>
                    <div className="skeleton-line wide"></div>
                    <div className="skeleton-line medium"></div>
                  </div>
                </div>
              )}

              {aiReport && !aiLoading && (
                <>
                  {/* Stats Row */}
                  <div className="ai-report-stats">
                    <div className="ai-stat-badge">
                      <span className="ai-stat-icon">📊</span>
                      <span><strong>{aiReport.issuesAnalyzed}</strong> analizadas</span>
                    </div>
                    <div className="ai-stat-badge">
                      <span className="ai-stat-icon">📋</span>
                      <span><strong>{aiReport.totalIssuesInRange}</strong> actualizadas</span>
                    </div>
                    <div style={{ flex: 1 }}></div>
                    <button className="ai-action-btn" onClick={copyReport}>
                      {copied ? '✅ Copiado' : '📋 Copiar'}
                    </button>
                    <button className="ai-action-btn" onClick={exportReportPDF}>
                      📄 PDF
                    </button>
                  </div>

                  {/* Report Document */}
                  <div className="ai-report-document">
                    <div className="ai-report-doc-header">
                      <div className="ai-report-doc-bar"></div>
                      <span>Daily Standup Report</span>
                      <span className="ai-report-doc-date">
                        {new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                      </span>
                    </div>
                    <div
                      ref={reportRef}
                      className="ai-report-content"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(aiReport.report) }}
                    />
                  </div>
                </>
              )}

              {!aiReport && !aiLoading && !aiError && (
                <div className="ai-empty-state">
                  <div className="ai-empty-icon">☕</div>
                  <h4 className="ai-empty-title">Listo para tu daily</h4>
                  <p className="ai-empty-desc">
                    Presiona <strong>"Generar Reporte"</strong> para obtener un resumen de lo que
                    trabajaste desde ayer 8:45 AM hasta hoy 8:00 AM.
                  </p>
                  <div className="ai-empty-features">
                    <div className="ai-empty-feature"><span>📝</span> Resumen ejecutivo</div>
                    <div className="ai-empty-feature"><span>🔄</span> Cambios de estado</div>
                    <div className="ai-empty-feature"><span>💬</span> Comentarios clave</div>
                    <div className="ai-empty-feature"><span>🚧</span> Bloqueantes</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'block-report' && (
            <div className="block-report-section">
              {/* Config Card */}
              <div className="block-config-card">
                <div className="block-config-header">
                  <div className="block-config-icon">📊</div>
                  <div>
                    <h3 className="block-config-title">Reporte por Bloque</h3>
                    <p className="block-config-subtitle">Genera un reporte ejecutivo de avance o cierre para un bloque bimestral</p>
                  </div>
                </div>

                {/* Report type toggle */}
                <div className="block-field">
                  <label className="block-field-label">Tipo de reporte</label>
                  <div className="block-type-toggle">
                    <button
                      type="button"
                      className={`block-type-btn ${blockType === 'avance' ? 'active avance' : ''}`}
                      onClick={() => setBlockType('avance')}
                    >
                      📈 Avance
                    </button>
                    <button
                      type="button"
                      className={`block-type-btn ${blockType === 'cierre' ? 'active cierre' : ''}`}
                      onClick={() => setBlockType('cierre')}
                    >
                      ✅ Cierre
                    </button>
                  </div>
                </div>

                {/* Period selector */}
                <div className="block-field">
                  <label className="block-field-label">Período del bloque</label>
                  <div className="block-period-row">
                    <select className="form-input block-select" value={blockMonthFrom} onChange={e => setBlockMonthFrom(e.target.value)}>
                      {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <span className="block-period-sep">→</span>
                    <select className="form-input block-select" value={blockMonthTo} onChange={e => setBlockMonthTo(e.target.value)}>
                      {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <input
                      type="number"
                      className="form-input block-year-input"
                      value={blockYear}
                      onChange={e => setBlockYear(e.target.value)}
                      min="2020"
                      max="2030"
                    />
                  </div>
                </div>

                {/* Cases table */}
                <div className="block-field">
                  <label className="block-field-label">Casos y horas consumidas</label>
                  <div className="block-cases-table">
                    <div className="block-cases-header">
                      <span className="block-col-key">Caso</span>
                      <span className="block-col-hours">Horas</span>
                      <span className="block-col-action"></span>
                    </div>
                    {blockCases.map((c, idx) => (
                      <div key={idx} className="block-case-row">
                        <input
                          type="text"
                          className="form-input block-case-key"
                          placeholder="PY06809-XX"
                          value={c.key}
                          onChange={e => updateBlockCase(idx, 'key', e.target.value)}
                        />
                        <input
                          type="number"
                          className="form-input block-case-hours"
                          min="0"
                          value={c.hours}
                          onChange={e => updateBlockCase(idx, 'hours', e.target.value)}
                        />
                        <button
                          type="button"
                          className="sf-remove-btn"
                          onClick={() => removeBlockCase(idx)}
                        >✕</button>
                      </div>
                    ))}
                    <div className="block-cases-footer">
                      <button type="button" className="btn btn-ghost block-add-case" onClick={addBlockCase}>
                        + Agregar caso
                      </button>
                      <div className="block-total">
                        <span>Total:</span>
                        <strong>{blockTotalHours}h</strong>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Generate buttons */}
                <div className="block-actions">
                  <button
                    className={`btn btn-ghost ${wordLoading ? 'loading' : ''}`}
                    onClick={generateWordReport}
                    disabled={wordLoading || blockCases.filter(c => c.key.trim()).length === 0}
                  >
                    {wordLoading ? (
                      <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }}></div> Generando Word...</>
                    ) : (
                      <>📄 Generar Word</>
                    )}
                  </button>
                  {wordSavedTo && (
                    <div
                      className="btn btn-ghost"
                      style={{ background: '#00b894', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'default', fontSize: 13 }}
                    >
                      ✅ Guardado en: ~/Downloads/{wordFilename}
                    </div>
                  )}
                  <button
                    className={`btn btn-primary ai-generate-btn ${blockLoading ? 'loading' : ''}`}
                    onClick={generateBlockReportFn}
                    disabled={blockLoading || blockCases.filter(c => c.key.trim()).length === 0}
                  >
                    {blockLoading ? (
                      <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }}></div> Generando...</>
                    ) : (
                      <>✨ Generar Reporte IA de {blockType === 'cierre' ? 'Cierre' : 'Avance'}</>
                    )}
                  </button>
                </div>
              </div>

              {/* Error */}
              {blockError && (
                <div className="error-msg" style={{ marginTop: 16 }}>❌ {blockError}</div>
              )}

              {/* Loading */}
              {blockLoading && (
                <div className="ai-loading-state" style={{ marginTop: 16 }}>
                  <div className="ai-loading-pulse"></div>
                  <div className="ai-loading-text">
                    <p className="ai-loading-title">Generando reporte de {blockType}...</p>
                    <p className="ai-loading-subtitle">
                      Consultando {blockCases.filter(c => c.key.trim()).length} casos en Jira y generando reporte con IA
                    </p>
                  </div>
                </div>
              )}

              {/* Report Output */}
              {blockReport && (
                <>
                  <div className="ai-report-actions" style={{ marginTop: 20 }}>
                    <button className="btn btn-ghost btn-sm" onClick={copyBlockReport}>
                      {blockCopied ? '✅ Copiado!' : '📋 Copiar reporte'}
                    </button>
                    {wordSavedTo && (
                      <span
                        className="btn btn-ghost btn-sm"
                        style={{ background: '#00b894', color: '#fff', cursor: 'default', marginLeft: 8, fontSize: 12 }}
                      >
                        ✅ ~/Downloads/{wordFilename}
                      </span>
                    )}
                  </div>

                  <div className="ai-report-doc" style={{ marginTop: 12 }}>
                    <div className="ai-report-doc-header">
                      <div className="ai-report-doc-bar"></div>
                      <span className="ai-report-doc-title">
                        Reporte de {blockType === 'cierre' ? 'Cierre' : 'Avance'} · {blockMonthFrom} - {blockMonthTo} {blockYear}
                      </span>
                      <span className="ai-report-doc-date">
                        {blockReport.casesCount} casos · {blockReport.totalHours}h
                      </span>
                    </div>
                    <div
                      ref={blockReportRef}
                      className="ai-report-content"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(blockReport.report) }}
                    />
                  </div>
                </>
              )}

              {/* Empty state */}
              {!blockReport && !blockLoading && !blockError && (
                <div className="ai-empty-state" style={{ marginTop: 20 }}>
                  <div className="ai-empty-icon">📊</div>
                  <h4 className="ai-empty-title">Reportes por bloque bimestral</h4>
                  <p className="ai-empty-desc">
                    Configura el período, agrega los casos con sus horas consumidas y genera un reporte ejecutivo.
                  </p>
                  <div className="ai-empty-features">
                    <div className="ai-empty-feature"><span>📈</span> Reporte de avance (mitad de bloque)</div>
                    <div className="ai-empty-feature"><span>✅</span> Reporte de cierre (fin de bloque)</div>
                    <div className="ai-empty-feature"><span>📋</span> Detalle por caso con horas</div>
                    <div className="ai-empty-feature"><span>🤖</span> Generado con IA</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
