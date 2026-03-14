import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useIssue } from '../hooks/useJira';
import { StatusBadge, PriorityBadge, WarrantyBadge } from '../components/StatusBadge';
import { api } from '../lib/api';
import { wikiToHtml } from '../lib/wikiMarkup';
import StructuredCommentForm from '../components/StructuredCommentForm';
import TimeBar from '../components/TimeBar';

export default function TaskDetailPage() {
  const { key } = useParams();
  const navigate = useNavigate();
  const { data: issue, loading, error, refresh } = useIssue(key);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const [toast, setToast] = useState(null); // { type: 'success'|'error', msg: string }
  const fileInputRef = useRef();
  const [activeTab, setActiveTab] = useState('details');
  const [commentMode, setCommentMode] = useState('structured');

  // AI comment formatting state
  const [aiFormatState, setAiFormatState] = useState({}); // { [commentId]: 'idle'|'formatting'|'preview'|'editing'|'updating' }
  const [aiFormatResult, setAiFormatResult] = useState({}); // { [commentId]: { formatted, detectedType } }
  const [aiEditText, setAiEditText] = useState({}); // { [commentId]: string }

  // Dev info (PRs, branches)
  const [devInfo, setDevInfo] = useState(null);
  const [devLoading, setDevLoading] = useState(false);

  // Time tracking from comments
  const [timeInfo, setTimeInfo] = useState(null);

  // Warranty state
  const [markingWarranty, setMarkingWarranty] = useState(false);
  const WARRANTY_RE = /caso\s+en\s+garant[ií]a/i;
  const WARRANTY_TYPE_RE = /COMMENT_TYPE:warranty|\[SCv2:warranty\]/;
  const detectWarranty = (cmts) =>
    cmts.some(c => {
      const body = c.body || '';
      const text = typeof body === 'string' ? body
        : (body.content ? body.content.map(n => n.text || (n.content?.map(m => m.text || '').join('') || '')).join(' ') : '');
      return WARRANTY_RE.test(text) || WARRANTY_TYPE_RE.test(text);
    });

  useEffect(() => {
    if (!key) return;
    setDevLoading(true);
    api.getDevInfo(key)
      .then(data => setDevInfo(data))
      .catch(() => setDevInfo({ pullRequests: [], branches: [], commits: [], total: { prs: 0 } }))
      .finally(() => setDevLoading(false));

    // Fetch time info from comments
    api.getTimeInfo(key)
      .then(data => setTimeInfo(data?.timeInfo || null))
      .catch(() => setTimeInfo(null));
  }, [key]);

  // Auto-dismiss toast after 4 seconds
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <span>Cargando tarea {key}...</span>
      </div>
    );
  }

  if (error) {
    return <div className="error-msg">❌ {error}</div>;
  }

  if (!issue) return null;

  const fields = issue.fields || {};
  const comments = fields.comment?.comments || [];
  const attachments = fields.attachment || [];
  const changelog = issue.changelog?.histories || [];
  const isWarranty = detectWarranty(comments);

  const handleMarkWarranty = async () => {
    if (isWarranty) return; // already marked
    setMarkingWarranty(true);
    try {
      await api.markAsWarranty(key, true);
      refresh(); // reload comments so detection picks it up
    } catch (err) {
      alert('Error al marcar como Garantía: ' + err.message);
    } finally {
      setMarkingWarranty(false);
    }
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    setSubmitting(true);
    try {
      await api.addComment(key, {
        body: {
          type: 'doc',
          version: 1,
          content: [{
            type: 'paragraph',
            content: [{ type: 'text', text: commentText }],
          }],
        },
      });
      setCommentText('');
      setToast({ type: 'success', msg: '✅ Comentario agregado correctamente' });
      refresh();
    } catch (err) {
      setToast({ type: 'error', msg: '❌ Error al agregar comentario: ' + err.message });
    } finally {
      setSubmitting(false);
    }
  };

  // Structured comment submit handler
  const handleStructuredSubmit = async (markdown, images, timeData) => {
    setSubmitting(true);
    try {
      let finalMarkdown = markdown;

      // Upload images first if any, then embed them in the comment
      if (images.length > 0) {
        const uploadResult = await api.uploadAttachment(key, images);
        // Jira returns an array of attachment objects with { filename, ... }
        const attachedFiles = Array.isArray(uploadResult) ? uploadResult : [];
        const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];
        const imageAttachments = attachedFiles.filter(a => {
          const ext = a.filename?.split('.').pop()?.toLowerCase();
          return imageExts.includes(ext);
        });

        if (imageAttachments.length > 0) {
          finalMarkdown += '\nh3. 📸 Capturas adjuntas\n';
          imageAttachments.forEach(a => {
            finalMarkdown += `!${a.filename}|thumbnail!\n`;
          });
        }
      }

      // Send structured comment as plain text (Jira Server v2)
      await api.addComment(key, {
        body: {
          type: 'doc',
          version: 1,
          content: [{ type: 'paragraph', content: [{ type: 'text', text: finalMarkdown }] }],
        },
      });
      // Log worklog if time provided
      if (timeData) {
        const seconds = (timeData.hours * 3600) + (timeData.minutes * 60);
        if (seconds > 0) {
          try {
            await api.addWorklog(key, { timeSpentSeconds: seconds });
          } catch (e) { /* worklog optional */ }
        }
      }
      setToast({ type: 'success', msg: '✅ Comentario estructurado enviado correctamente' });
      refresh();
    } catch (err) {
      setToast({ type: 'error', msg: '❌ Error al enviar comentario: ' + err.message });
    } finally {
      setSubmitting(false);
    }
  };

  // Comment type metadata for badge rendering
  const COMMENT_TYPE_META = {
    review:     { icon: '📋', label: 'Revisión de solicitud', color: 'blue' },
    delivery:   { icon: '🚀', label: 'Entrega / Avance',      color: 'green' },
    adjustment: { icon: '🔧', label: 'Ajuste',                color: 'orange' },
    production: { icon: '🏁', label: 'PR a Producción',       color: 'purple' },
    warranty:   { icon: '🛡️', label: 'Garantía',              color: 'red' },
  };

  const detectCommentType = (text) => {
    // New format: {color:#f4f5f7}[SCv2:adjustment]{color}
    const m2 = text.match(/\[SCv2:(\w+)\]/);
    if (m2) return m2[1];
    // Legacy format: <!-- COMMENT_TYPE:adjustment -->
    const m = text.match(/<!-- COMMENT_TYPE:(\w+) -->/);
    return m ? m[1] : null;
  };

  // ── AI Comment Formatting Handlers ──────────────────────────────────────────
  const handleAiFormat = async (commentId, text) => {
    setAiFormatState(prev => ({ ...prev, [commentId]: 'formatting' }));
    try {
      const data = await api.reformatComment(text);
      setAiFormatResult(prev => ({ ...prev, [commentId]: data }));
      setAiEditText(prev => ({ ...prev, [commentId]: data.formatted }));
      setAiFormatState(prev => ({ ...prev, [commentId]: 'preview' }));
    } catch (err) {
      setToast({ type: 'error', msg: '❌ Error al formatear: ' + err.message });
      setAiFormatState(prev => ({ ...prev, [commentId]: 'idle' }));
    }
  };

  const handleAiUpdate = async (commentId) => {
    setAiFormatState(prev => ({ ...prev, [commentId]: 'updating' }));
    try {
      const formattedBody = aiEditText[commentId] || aiFormatResult[commentId]?.formatted;
      await api.updateComment(key, commentId, { body: formattedBody });
      setToast({ type: 'success', msg: '✅ Comentario actualizado y formateado en Jira' });
      setAiFormatState(prev => ({ ...prev, [commentId]: 'idle' }));
      setAiFormatResult(prev => { const n = { ...prev }; delete n[commentId]; return n; });
      setAiEditText(prev => { const n = { ...prev }; delete n[commentId]; return n; });
      refresh();
    } catch (err) {
      setToast({ type: 'error', msg: '❌ Error al actualizar: ' + err.message });
      setAiFormatState(prev => ({ ...prev, [commentId]: 'preview' }));
    }
  };

  const handleAiCancel = (commentId) => {
    setAiFormatState(prev => ({ ...prev, [commentId]: 'idle' }));
    setAiFormatResult(prev => { const n = { ...prev }; delete n[commentId]; return n; });
    setAiEditText(prev => { const n = { ...prev }; delete n[commentId]; return n; });
  };

  const renderStructuredComment = (text) => {
    const commentType = detectCommentType(text);
    const typeMeta = commentType ? COMMENT_TYPE_META[commentType] : null;
    const html = wikiToHtml(text);
    const badgeHtml = typeMeta
      ? `<div class="sc-type-badge ct-${typeMeta.color}"><span>${typeMeta.icon}</span><span>${typeMeta.label}</span></div>`
      : '';

    return (
      <div>
        <div dangerouslySetInnerHTML={{ __html: badgeHtml }} />
        <div className="sc-rendered" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    );
  };

  const escHtml = (str) => str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const handleFileUpload = async (e) => {
    const files = e.target.files;
    if (!files?.length) return;
    setUploadMsg('Subiendo...');
    try {
      await api.uploadAttachment(key, files);
      setUploadMsg('✅ Archivo(s) subido(s)');
      refresh();
    } catch (err) {
      setUploadMsg('❌ Error: ' + err.message);
    }
  };

  // Rewrite Jira URLs to go through our backend proxy (avoids CORS / auth)
  const proxyJiraUrl = (url) => {
    if (!url) return url;
    return `/api/issues/attachment-proxy?url=${encodeURIComponent(url)}`;
  };

  const rewriteJiraImgUrls = (html) => {
    if (!html) return html;
    // Rewrite <img src="https://jira.../secure/attachment/..."> to proxy
    return html.replace(
      /(<img\s[^>]*src=["'])([^"']*\/secure\/(?:attachment|thumbnail)\/[^"']*)(["'])/gi,
      (_, before, url, after) => `${before}${proxyJiraUrl(url)}${after}`
    );
  };

  const renderDescription = () => {
    const rendered = issue.renderedFields?.description;
    if (rendered) {
      return <div className="jira-rendered-html" dangerouslySetInnerHTML={{ __html: rewriteJiraImgUrls(rendered) }} />;
    }
    // ADF fallback
    const desc = fields.description;
    if (!desc) return <span className="text-muted">Sin descripción</span>;
    if (typeof desc === 'string') return <p>{desc}</p>;
    // Extract text from ADF
    const extractText = (node) => {
      if (!node) return '';
      if (node.text) return node.text;
      if (node.content) return node.content.map(extractText).join('');
      return '';
    };
    return <p>{extractText(desc)}</p>;
  };

  const getCommentText = (body) => {
    if (!body) return '';
    if (typeof body === 'string') return body;
    const extractText = (node) => {
      if (!node) return '';
      if (node.text) return node.text;
      if (node.content) return node.content.map(extractText).join('');
      return '';
    };
    return extractText(body);
  };

  const getFileIcon = (filename) => {
    const ext = filename?.split('.').pop()?.toLowerCase();
    if (['jpg','jpeg','png','gif','webp','svg'].includes(ext)) return '🖼️';
    if (['pdf'].includes(ext)) return '📕';
    if (['doc','docx'].includes(ext)) return '📝';
    if (['xls','xlsx','csv'].includes(ext)) return '📊';
    if (['zip','rar','7z'].includes(ext)) return '🗜️';
    return '📄';
  };

  const isImageFile = (filename) => {
    const ext = filename?.split('.').pop()?.toLowerCase();
    return ['jpg','jpeg','png','gif','webp','svg','bmp'].includes(ext);
  };

  // ─── Deployment date extractor ─────────────────────────────────────────────
  const extractDeploymentDates = () => {
    const results = [];
    const now = new Date();
    const currentYear = now.getFullYear();

    const dayMap = { lunes: 1, martes: 2, 'miércoles': 3, jueves: 4, viernes: 5, sábado: 6, domingo: 0 };
    const deployKeywords = /(paso|deploy|producción|prd|se aplica|aplicar|subir a prod|paso a prod|release)/i;

    const parseDate = (day, month, year, timeStr) => {
      const y = year ? (year.length === 2 ? 2000 + parseInt(year) : parseInt(year)) : currentYear;
      const d = new Date(y, parseInt(month) - 1, parseInt(day));
      if (isNaN(d.getTime())) return null;
      if (timeStr) {
        const [h, rest] = timeStr.split(':');
        const mins = parseInt(rest) || 0;
        let hours = parseInt(h);
        if (/pm/i.test(timeStr) && hours < 12) hours += 12;
        d.setHours(hours, mins, 0, 0);
      }
      return d;
    };

    const resolveWeekday = (dayName) => {
      const targetDay = dayMap[dayName.toLowerCase()];
      if (targetDay === undefined) return null;
      const d = new Date(now);
      const diff = (targetDay - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + diff);
      return d;
    };

    const daysFrom = (d) => Math.round((d - now) / (1000 * 60 * 60 * 24));

    const addResult = (date, label, author, commentId) => {
      const exists = results.some(r => Math.abs(r.date - date) < 6 * 3600 * 1000);
      if (!exists) results.push({ date, label, author, commentId, days: daysFrom(date) });
    };

    // Duedate from Jira field
    if (fields.duedate) {
      const d = new Date(fields.duedate);
      if (!isNaN(d.getTime())) addResult(d, 'Fecha límite Jira', null, null);
    }

    // Scan comments
    comments.forEach(c => {
      const raw = getCommentText(c.body);
      if (!raw) return;
      const sentences = raw.split(/[.\n]+/);
      sentences.forEach(sentence => {
        if (!deployKeywords.test(sentence)) return;

        // Full datetime: 15/03/2026 09:00am  or  15/03 9:00am
        const fdtRe = /(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\s+(\d{1,2}:\d{2}\s*(?:am|pm|hrs?)?)/gi;
        let m;
        while ((m = fdtRe.exec(sentence)) !== null) {
          const d = parseDate(m[1], m[2], m[3], m[4]);
          if (d) addResult(d, sentence.trim().slice(0, 80), c.author?.displayName, c.id);
        }

        // Date only: 15/03 or 15/03/2026
        const doRe = /(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/g;
        while ((m = doRe.exec(sentence)) !== null) {
          const d = parseDate(m[1], m[2], m[3], null);
          if (d && !results.some(r => r.commentId === c.id && Math.abs(r.date - d) < 86400000)) {
            addResult(d, sentence.trim().slice(0, 80), c.author?.displayName, c.id);
          }
        }

        // Weekday: "el próximo viernes", "este jueves"
        const wdRe = /(?:el|este|próximo|siguiente)\s+(lunes|martes|miércoles|jueves|viernes|sábado|domingo)/gi;
        while ((m = wdRe.exec(sentence)) !== null) {
          const d = resolveWeekday(m[1]);
          if (d) addResult(d, sentence.trim().slice(0, 80), c.author?.displayName, c.id);
        }
      });
    });

    return results.sort((a, b) => a.date - b.date);
  };

  const deployDates = extractDeploymentDates();


  return (
    <div>
      {/* Toast notification */}
      {toast && (
        <div className={`toast-notification toast-${toast.type}`} onClick={() => setToast(null)}>
          {toast.msg}
        </div>
      )}
      <div className="task-hero">
        <div className="task-hero-meta">
          <button className="task-back-btn" onClick={() => navigate(-1)}>
            ← Volver
          </button>
          <span className="task-key-badge">🔖 {key}</span>
          {isWarranty && <WarrantyBadge />}
        </div>
        <h2>{fields.summary}</h2>
      </div>

      <div className="detail-layout">
        <div className="detail-main">
          <div className="tab-nav">
            <button
              className={`tab-btn ${activeTab === 'details' ? 'active' : ''}`}
              onClick={() => setActiveTab('details')}
            >
              📄 Detalles
            </button>
            <button
              className={`tab-btn ${activeTab === 'comments' ? 'active' : ''}`}
              onClick={() => setActiveTab('comments')}
            >
              💬 Comentarios {comments.length > 0 && `(${comments.length})`}
            </button>
            <button
              className={`tab-btn ${activeTab === 'attachments' ? 'active' : ''}`}
              onClick={() => setActiveTab('attachments')}
            >
              📎 Adjuntos {attachments.length > 0 && `(${attachments.length})`}
            </button>
            <button
              className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
              onClick={() => setActiveTab('history')}
            >
              🕐 Historial
            </button>
            <button
              className={`tab-btn ${activeTab === 'prs' ? 'active' : ''}`}
              onClick={() => setActiveTab('prs')}
            >
              🔀 Pull Requests {devInfo?.total?.prs > 0 ? `(${devInfo.total.prs})` : ''}
            </button>
          </div>

          {activeTab === 'details' && (
            <div className="detail-description-card">
              <div className="detail-description-header">
                <div className="detail-description-header-icon">📋</div>
                <span className="detail-description-title">Descripción</span>
              </div>
              <div className="detail-description-body">
                {renderDescription()}
              </div>
            </div>
          )}

          {activeTab === 'comments' && (
            <div>
              {/* Comment mode toggle */}
              <div className="comment-mode-toggle mb-3">
                <button
                  type="button"
                  className={`comment-mode-btn ${commentMode === 'structured' ? 'active' : ''}`}
                  onClick={() => setCommentMode('structured')}
                >
                  📋 Plantilla estructurada
                </button>
                <button
                  type="button"
                  className={`comment-mode-btn ${commentMode === 'free' ? 'active' : ''}`}
                  onClick={() => setCommentMode('free')}
                >
                  💬 Comentario libre
                </button>
              </div>

              {commentMode === 'free' ? (
                <form onSubmit={handleAddComment} className="card mb-3">
                  <textarea
                    className="form-textarea"
                    placeholder="Escribe un comentario..."
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    rows={3}
                  />
                  <div className="mt-2">
                    <button
                      className="btn btn-primary btn-sm"
                      type="submit"
                      disabled={submitting || !commentText.trim()}
                    >
                      {submitting ? 'Enviando...' : '💬 Agregar Comentario'}
                    </button>
                  </div>
                </form>
              ) : (
                <StructuredCommentForm
                  issueKey={key}
                  onSubmit={handleStructuredSubmit}
                  submitting={submitting}
                />
              )}

              <div className="comment-list" style={{ marginTop: 8 }}>
                {comments.length === 0 ? (
                  <div className="empty-state">
                    <p>No hay comentarios aún.</p>
                  </div>
                ) : (
                  comments.map((c, idx) => {
                    const text = getCommentText(c.body);
                    const isStructured = text.includes('STRUCTURED_COMMENT') || text.includes('[SCv2:');
                    const commentType = isStructured ? detectCommentType(text) : null;
                    const typeMeta = commentType ? COMMENT_TYPE_META[commentType] : null;
                    // Use Jira's pre-rendered HTML for regular comments when available
                    const renderedComments = issue.renderedFields?.comment?.comments;
                    const renderedHtml = renderedComments?.[idx]?.body;
                    const initial = c.author?.displayName?.charAt(0)?.toUpperCase() || '?';
                    const cState = aiFormatState[c.id] || 'idle';
                    const cResult = aiFormatResult[c.id];
                    const cEditText = aiEditText[c.id] || '';
                    return (
                      <div key={c.id} className={`comment-item ${isStructured ? `comment-structured ct-border-${typeMeta?.color || 'default'}` : ''}`}>
                        <div className={`comment-avatar ${typeMeta ? `ct-avatar-${typeMeta.color}` : ''}`}>{initial}</div>
                        <div className="comment-body">
                          <div className="comment-meta">
                            <strong>{c.author?.displayName}</strong>
                            {typeMeta
                              ? <span className={`comment-structured-badge ct-${typeMeta.color}`}>{typeMeta.icon} {typeMeta.label}</span>
                              : isStructured && <span className="comment-structured-badge">📋 Estructurado</span>
                            }
                            <span className="comment-time">· {new Date(c.created).toLocaleString('es-ES')}</span>
                            {/* AI Format button — only for non-structured comments */}
                            {!isStructured && cState === 'idle' && (
                              <button
                                type="button"
                                className="ai-format-btn"
                                onClick={() => handleAiFormat(c.id, text)}
                                title="Reformatear este comentario con IA al formato estructurado"
                              >
                                ✨ Formatear con IA
                              </button>
                            )}
                            {cState === 'formatting' && (
                              <span className="ai-format-loading">⏳ Formateando con IA...</span>
                            )}
                          </div>
                          <div className="comment-text">
                            {isStructured
                              ? renderStructuredComment(text)
                              : renderedHtml
                                ? <div className="jira-rendered-html" dangerouslySetInnerHTML={{ __html: rewriteJiraImgUrls(renderedHtml) }} />
                                : <span style={{ whiteSpace: 'pre-wrap' }}>{text}</span>
                            }
                          </div>

                          {/* AI Format Preview / Edit Panel */}
                          {(cState === 'preview' || cState === 'editing' || cState === 'updating') && cResult && (
                            <div className="ai-format-preview">
                              <div className="ai-format-preview-header">
                                <span className="ai-format-preview-title">✨ Vista previa — Comentario formateado con IA</span>
                                {cResult.detectedType && COMMENT_TYPE_META[cResult.detectedType] && (
                                  <span className={`comment-structured-badge ct-${COMMENT_TYPE_META[cResult.detectedType].color}`}>
                                    {COMMENT_TYPE_META[cResult.detectedType].icon} {COMMENT_TYPE_META[cResult.detectedType].label}
                                  </span>
                                )}
                              </div>

                              {cState !== 'editing' ? (
                                <div className="ai-format-preview-body">
                                  <div className="sc-rendered" dangerouslySetInnerHTML={{ __html: wikiToHtml(cEditText || cResult.formatted) }} />
                                </div>
                              ) : (
                                <div className="ai-format-editor">
                                  <textarea
                                    className="ai-format-textarea"
                                    value={cEditText}
                                    onChange={(e) => setAiEditText(prev => ({ ...prev, [c.id]: e.target.value }))}
                                    rows={12}
                                  />
                                  <div className="ai-format-editor-hint">Formato: Jira Wiki Markup (h2., *negrita*, ||tablas||, etc.)</div>
                                </div>
                              )}

                              <div className="ai-format-actions">
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm ai-update-btn"
                                  onClick={() => handleAiUpdate(c.id)}
                                  disabled={cState === 'updating'}
                                >
                                  {cState === 'updating' ? '⏳ Actualizando...' : '✅ Actualizar en Jira'}
                                </button>
                                <button
                                  type="button"
                                  className={`btn btn-ghost btn-sm ${cState === 'editing' ? 'ai-edit-active' : ''}`}
                                  onClick={() => setAiFormatState(prev => ({ ...prev, [c.id]: cState === 'editing' ? 'preview' : 'editing' }))}
                                  disabled={cState === 'updating'}
                                >
                                  {cState === 'editing' ? '👁 Ver preview' : '✏️ Editar manualmente'}
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  onClick={() => handleAiCancel(c.id)}
                                  disabled={cState === 'updating'}
                                >
                                  ❌ Cancelar
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {activeTab === 'attachments' && (
            <div>
              <div
                className="drop-zone mb-3"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="drop-zone-icon">📎</div>
                <div className="drop-zone-text">Haz clic o arrastra archivos aquí</div>
                <div className="drop-zone-hint">PNG, JPG, PDF, DOCX y más</div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  style={{ display: 'none' }}
                  onChange={handleFileUpload}
                />
                {uploadMsg && <p className="mt-1" style={{ fontSize: '0.85rem' }}>{uploadMsg}</p>}
              </div>

              {attachments.length > 0 ? (
                <div className="attachment-grid">
                  {attachments.map(a => (
                    <a
                      key={a.id}
                      href={proxyJiraUrl(a.content)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`attachment-card ${isImageFile(a.filename) ? 'attachment-card-image' : ''}`}
                    >
                      {isImageFile(a.filename) ? (
                        <div className="attachment-preview">
                          <img
                            src={proxyJiraUrl(a.thumbnail || a.content)}
                            alt={a.filename}
                            className="attachment-preview-img"
                            onError={e => {
                              e.target.style.display = 'none';
                              e.target.nextSibling.style.display = 'flex';
                            }}
                          />
                          <div className="attachment-preview-fallback" style={{ display: 'none' }}>
                            🖼️
                          </div>
                        </div>
                      ) : (
                        <div className="attachment-card-icon">{getFileIcon(a.filename)}</div>
                      )}
                      <div className="attachment-card-name" title={a.filename}>{a.filename}</div>
                      <div className="attachment-card-size">{(a.size / 1024).toFixed(1)} KB</div>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="empty-state"><p>Sin adjuntos.</p></div>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="detail-description-card">
              <div className="detail-description-header">
                <div className="detail-description-header-icon">🕐</div>
                <span className="detail-description-title">Historial de cambios</span>
              </div>
              <div style={{ padding: '20px' }}>
                {changelog.length === 0 ? (
                  <div className="empty-state"><p>Sin historial de cambios.</p></div>
                ) : (
                  <div className="history-timeline">
                    {changelog.slice(0, 30).map(h => (
                      <div key={h.id} className="history-entry">
                        <div className="history-line">
                          <div className="history-dot"></div>
                          <div className="history-connector"></div>
                        </div>
                        <div className="history-content">
                          <div className="history-header">
                            <span className="history-author">{h.author?.displayName}</span>
                            <span className="history-date">· {new Date(h.created).toLocaleString('es-ES')}</span>
                          </div>
                          {h.items?.map((item, idx) => (
                            <div key={idx} className="history-change">
                              <span className="history-change-field">{item.field}</span>
                              <span className="history-change-from">{item.fromString || '—'}</span>
                              <span className="history-change-arrow">→</span>
                              <span className="history-change-to">{item.toString || '—'}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'prs' && (
            <div className="pr-section">
              {devLoading ? (
                <div className="card" style={{ padding: 32 }}>
                  <div className="loading">
                    <div className="spinner" style={{ width: 32, height: 32 }}></div>
                    <span>Buscando PRs y branches...</span>
                  </div>
                </div>
              ) : !devInfo?.pullRequests?.length ? (
                <div className="detail-description-card">
                  <div className="empty-state" style={{ padding: '48px 20px' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🔀</div>
                    <p style={{ fontWeight: 600, fontSize: '1.05rem', color: '#e2e8f0' }}>No se encontraron Pull Requests</p>
                    <p style={{ color: '#64748b', fontSize: '0.85rem', maxWidth: 400, margin: '8px auto 0' }}>
                      Los PRs aparecerán aquí cuando incluyan <code style={{ color: '#818cf8', background: 'rgba(99,102,241,0.1)', padding: '1px 6px', borderRadius: 4 }}>{key}</code> en su nombre.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {devInfo.pullRequests.filter(pr => pr.environment === 'DEV').length > 0 && (
                    <div className="pr-env-group">
                      <div className="pr-env-header pr-env-dev">
                        <span className="pr-env-dot dev"></span>
                        <span>Desarrollo (DEV)</span>
                        <span className="pr-env-count">
                          {devInfo.pullRequests.filter(pr => pr.environment === 'DEV').length}
                        </span>
                      </div>
                      {devInfo.pullRequests.filter(pr => pr.environment === 'DEV').map(pr => (
                        <div key={pr.id || pr.url} className="pr-card">
                          <div className="pr-card-header">
                            <span className={`pr-status-badge ${pr.status?.toLowerCase()}`}>
                              {pr.status === 'MERGED' ? '✅' : pr.status === 'DECLINED' ? '❌' : '🔵'}
                              {' '}{pr.status || 'OPEN'}
                            </span>
                            <a href={pr.url} target="_blank" rel="noopener noreferrer" className="pr-link">↗ Ver PR</a>
                          </div>
                          <div className="pr-title">{pr.title || 'Sin título'}</div>
                          {(pr.source || pr.destination) && (
                            <div className="pr-branches">
                              <code>{pr.source}</code><span className="pr-arrow">→</span><code>{pr.destination}</code>
                            </div>
                          )}
                          <div className="pr-meta">
                            {pr.author && <span>👤 {pr.author}</span>}
                            {pr.repo && <span>📦 {pr.repo}</span>}
                            {pr.reviewers?.length > 0 && <span>👥 {pr.reviewers.join(', ')}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {devInfo.pullRequests.filter(pr => pr.environment === 'PRD').length > 0 && (
                    <div className="pr-env-group">
                      <div className="pr-env-header pr-env-prd">
                        <span className="pr-env-dot prd"></span>
                        <span>Producción (PRD)</span>
                        <span className="pr-env-count">
                          {devInfo.pullRequests.filter(pr => pr.environment === 'PRD').length}
                        </span>
                      </div>
                      {devInfo.pullRequests.filter(pr => pr.environment === 'PRD').map(pr => (
                        <div key={pr.id || pr.url} className="pr-card">
                          <div className="pr-card-header">
                            <span className={`pr-status-badge ${pr.status?.toLowerCase()}`}>
                              {pr.status === 'MERGED' ? '✅' : pr.status === 'DECLINED' ? '❌' : '🔵'}
                              {' '}{pr.status || 'OPEN'}
                            </span>
                            <a href={pr.url} target="_blank" rel="noopener noreferrer" className="pr-link">↗ Ver PR</a>
                          </div>
                          <div className="pr-title">{pr.title || 'Sin título'}</div>
                          {(pr.source || pr.destination) && (
                            <div className="pr-branches">
                              <code>{pr.source}</code><span className="pr-arrow">→</span><code>{pr.destination}</code>
                            </div>
                          )}
                          <div className="pr-meta">
                            {pr.author && <span>👤 {pr.author}</span>}
                            {pr.repo && <span>📦 {pr.repo}</span>}
                            {pr.reviewers?.length > 0 && <span>👥 {pr.reviewers.join(', ')}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {devInfo.branches?.length > 0 && (
                    <div className="pr-env-group" style={{ marginTop: 16 }}>
                      <div className="pr-env-header" style={{ background: 'rgba(245,158,11,0.07)', borderColor: 'rgba(245,158,11,0.18)', color: '#f59e0b' }}>
                        <span>🌿</span>
                        <span>Branches</span>
                        <span className="pr-env-count">{devInfo.branches.length}</span>
                      </div>
                      {devInfo.branches.map((b, i) => (
                        <div key={i} className="pr-card" style={{ padding: '10px 16px' }}>
                          <code style={{ color: '#818cf8' }}>{b.name}</code>
                          {b.url && (
                            <a href={b.url} target="_blank" rel="noopener noreferrer" className="pr-link" style={{ float: 'right' }}>↗ Ver</a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="detail-sidebar">
          <div className="card">


            <div className="sidebar-field">
              <div className="sidebar-field-icon">🔄</div>
              <div className="sidebar-field-content">
                <div className="sidebar-field-label">Estado</div>
                <div className="sidebar-field-value">
                  <StatusBadge status={fields.status?.name} />
                </div>
              </div>
            </div>
            <div className="sidebar-field">
              <div className="sidebar-field-icon">⚡</div>
              <div className="sidebar-field-content">
                <div className="sidebar-field-label">Prioridad</div>
                <div className="sidebar-field-value">
                  <PriorityBadge priority={fields.priority?.name} />
                </div>
              </div>
            </div>
            <div className="sidebar-field">
              <div className="sidebar-field-icon">🏷️</div>
              <div className="sidebar-field-content">
                <div className="sidebar-field-label">Tipo</div>
                <div className="sidebar-field-value">{fields.issuetype?.name || '—'}</div>
              </div>
            </div>
            <div className="sidebar-field">
              <div className="sidebar-field-icon">👤</div>
              <div className="sidebar-field-content">
                <div className="sidebar-field-label">Asignado</div>
                <div className="sidebar-field-value">
                  {fields.assignee ? (
                    <div className="sidebar-assignee">
                      <div className="sidebar-assignee-avatar">
                        {fields.assignee.displayName.charAt(0).toUpperCase()}
                      </div>
                      {fields.assignee.displayName}
                    </div>
                  ) : 'Sin asignar'}
                </div>
              </div>
            </div>
            <div className="sidebar-field">
              <div className="sidebar-field-icon">📣</div>
              <div className="sidebar-field-content">
                <div className="sidebar-field-label">Reportado por</div>
                <div className="sidebar-field-value">{fields.reporter?.displayName || '—'}</div>
              </div>
            </div>
            <div className="sidebar-field">
              <div className="sidebar-field-icon">📁</div>
              <div className="sidebar-field-content">
                <div className="sidebar-field-label">Proyecto</div>
                <div className="sidebar-field-value">{fields.project?.name || '—'}</div>
              </div>
            </div>
            <div className="sidebar-field">
              <div className="sidebar-field-icon">📅</div>
              <div className="sidebar-field-content">
                <div className="sidebar-field-label">Creado</div>
                <div className="sidebar-field-value muted">
                  {fields.created ? new Date(fields.created).toLocaleString('es-ES') : '—'}
                </div>
              </div>
            </div>
            <div className="sidebar-field">
              <div className="sidebar-field-icon">✏️</div>
              <div className="sidebar-field-content">
                <div className="sidebar-field-label">Actualizado</div>
                <div className="sidebar-field-value muted">
                  {fields.updated ? new Date(fields.updated).toLocaleString('es-ES') : '—'}
                </div>
              </div>
            </div>
            {fields.duedate && (
              <div className="sidebar-field">
                <div className="sidebar-field-icon">⏰</div>
                <div className="sidebar-field-content">
                  <div className="sidebar-field-label">Fecha límite</div>
                  <div className="sidebar-field-value" style={{ color: '#f59e0b' }}>
                    {new Date(fields.duedate).toLocaleDateString('es-ES')}
                  </div>
                </div>
              </div>
            )}
            {fields.labels?.length > 0 && (
              <div className="sidebar-field">
                <div className="sidebar-field-icon">🔖</div>
                <div className="sidebar-field-content">
                  <div className="sidebar-field-label">Labels</div>
                  <div className="sidebar-field-value">
                    <div className="flex gap-1" style={{ flexWrap: 'wrap', marginTop: 4 }}>
                      {fields.labels.map(l => (
                        <span key={l} className="badge status-in-progress">{l}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

             {/* Time tracking from comments */}
             {timeInfo && (
               <div style={{ marginTop: 16 }}>
                 <TimeBar timeInfo={timeInfo} compact={false} />
               </div>
             )}

             {/* Warranty section */}
             <div className="sidebar-warranty-section">
               {isWarranty ? (
                 <div className="sidebar-warranty-active">
                   <div className="sidebar-warranty-badge-row">
                     <WarrantyBadge />
                   </div>
                   <p className="sidebar-warranty-note">
                     Este caso se gestiona como <strong>garantía</strong>. Las horas ejecutadas no se descuentan de la bolsa del bloque.
                   </p>
                 </div>
               ) : (
                 <button
                   className="btn-warranty-mark"
                   onClick={handleMarkWarranty}
                   disabled={markingWarranty}
                   title="Marca este caso como Garantía (caso reportado al cliente como cubierto, gestionado sin descontar horas del bloque)"
                 >
                   {markingWarranty ? 'Marcando...' : '🛡️ Marcar como Garantía'}
                 </button>
               )}
             </div>
           </div>
        </div>
      </div>
    </div>
  );
}
