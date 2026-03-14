import React, { useRef, useState, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '';

// Jira wiki markup formatting actions
const TOOLBAR_ACTIONS = [
  { id: 'bold',    icon: 'B',  title: 'Negrita',          wrap: ['*', '*'] },
  { id: 'italic',  icon: 'I',  title: 'Itálica',          wrap: ['_', '_'] },
  { id: 'code',    icon: '</>',title: 'Código',           wrap: ['{{', '}}'] },
  { id: 'h3',      icon: 'H3', title: 'Encabezado',       prefix: 'h3. ' },
  { id: 'h4',      icon: 'H4', title: 'Sub-encabezado',   prefix: 'h4. ' },
  { id: 'ul',      icon: '•',  title: 'Lista',            prefix: '* ' },
  { id: 'ol',      icon: '1.', title: 'Lista numerada',   prefix: '# ' },
];

export default function RichTextArea({
  value,
  onChange,
  placeholder,
  rows = 4,
  context = 'general',
  className = '',
}) {
  const textareaRef = useRef(null);
  const [formatting, setFormatting] = useState(false);

  // Insert markup around selection or at cursor
  const applyFormat = useCallback((action) => {
    const ta = textareaRef.current;
    if (!ta) return;

    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const text = value || '';
    const selected = text.substring(start, end);

    let newText;
    let cursorPos;

    if (action.wrap) {
      // Wrap selection with markers
      const [before, after] = action.wrap;
      if (selected) {
        newText = text.substring(0, start) + before + selected + after + text.substring(end);
        cursorPos = start + before.length + selected.length + after.length;
      } else {
        newText = text.substring(0, start) + before + after + text.substring(end);
        cursorPos = start + before.length;
      }
    } else if (action.prefix) {
      // Add prefix at start of line
      const lineStart = text.lastIndexOf('\n', start - 1) + 1;
      const currentLine = text.substring(lineStart, end);

      // If there's a selection spanning multiple lines, prefix each
      if (selected && selected.includes('\n')) {
        const prefixed = selected.split('\n').map(line => action.prefix + line).join('\n');
        newText = text.substring(0, start) + prefixed + text.substring(end);
        cursorPos = start + prefixed.length;
      } else {
        newText = text.substring(0, lineStart) + action.prefix + text.substring(lineStart);
        cursorPos = start + action.prefix.length;
      }
    }

    onChange(newText);

    // Restore cursor position
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(cursorPos, cursorPos);
    });
  }, [value, onChange]);

  // AI auto-format
  const handleAIFormat = useCallback(async () => {
    if (!value || !value.trim() || formatting) return;
    setFormatting(true);
    try {
      const res = await fetch(`${API_BASE}/api/ai/format-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: value, context }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error al formatear');
      }
      const data = await res.json();
      if (data.formatted) {
        onChange(data.formatted);
      }
    } catch (err) {
      console.error('AI format error:', err);
      // Could show a toast here — for now just log
    } finally {
      setFormatting(false);
    }
  }, [value, context, formatting, onChange]);

  const hasText = value && value.trim().length > 0;

  return (
    <div className="rta-wrapper">
      <div className="rta-toolbar">
        <div className="rta-toolbar-left">
          {TOOLBAR_ACTIONS.map((action) => (
            <button
              key={action.id}
              type="button"
              className={`rta-btn rta-btn-${action.id}`}
              title={action.title}
              onClick={() => applyFormat(action)}
              tabIndex={-1}
            >
              {action.icon}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`rta-ai-btn ${formatting ? 'loading' : ''}`}
          onClick={handleAIFormat}
          disabled={!hasText || formatting}
          title="Reorganiza y mejora el texto usando IA"
          tabIndex={-1}
        >
          {formatting ? (
            <>
              <span className="rta-spinner" />
              Formateando…
            </>
          ) : (
            <>✨ Formatear con IA</>
          )}
        </button>
      </div>
      <textarea
        ref={textareaRef}
        className={`form-textarea sf-textarea rta-textarea ${className}`}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
      />
    </div>
  );
}
