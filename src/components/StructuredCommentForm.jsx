import React, { useState, useEffect, useRef, useCallback } from 'react';

// ─── Comment Type Definitions ─────────────────────────────────────────────────
const COMMENT_TYPES = [
  {
    id: 'review',
    icon: '📋',
    label: 'Revisión de solicitud',
    color: 'blue',
    description: 'Se revisó el requerimiento y se da el estimado',
  },
  {
    id: 'delivery',
    icon: '🚀',
    label: 'Entrega / Avance',
    color: 'green',
    description: 'PR hacia develop, cambios en Contentful dev, capturas',
  },
  {
    id: 'adjustment',
    icon: '🔧',
    label: 'Ajuste',
    color: 'orange',
    description: 'El PR anterior requiere un ajuste',
  },
  {
    id: 'production',
    icon: '🏁',
    label: 'PR a Producción',
    color: 'purple',
    description: 'PR hacia master, ajustes en Contentful master, capturas',
  },
  {
    id: 'warranty',
    icon: '🛡️',
    label: 'Garantía',
    color: 'red',
    description: 'Re-ajuste post-producción por problema detectado',
  },
];

const PR_STATUSES = ['Abierto', 'En revisión', 'Aprobado', 'Mergeado'];

const EMPTY_CONTENTFUL = {
  url: '',
  environment: 'develop',
  description: '',
  images: [],
};

const EMPTY_PR = {
  url: '',
  branchSource: '',
  branchDest: '',
  status: 'Abierto',
};

// ─── Image Processing ─────────────────────────────────────────────────────────
const MAX_WIDTH = 1280;
const MAX_HEIGHT = 720;
const JPEG_QUALITY = 0.85;

async function resizeImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width <= MAX_WIDTH && height <= MAX_HEIGHT) {
          // No resize needed — return original as processed file
          resolve({ file, width, height, resized: false });
          return;
        }
        const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            const resizedFile = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
              type: 'image/jpeg',
            });
            resolve({ file: resizedFile, width, height, resized: true });
          },
          'image/jpeg',
          JPEG_QUALITY
        );
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ImageUploadZone({ images, onAdd, onRemove, label = '📎 Capturas de pantalla' }) {
  const inputRef = useRef();
  const [processing, setProcessing] = useState(false);

  const handleFiles = async (files) => {
    setProcessing(true);
    const results = await Promise.all(Array.from(files).map(resizeImage));
    onAdd(results.map((r) => ({ file: r.file, preview: URL.createObjectURL(r.file), resized: r.resized, width: r.width, height: r.height })));
    setProcessing(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  };

  return (
    <div className="sf-field">
      <span className="sf-field-label">{label}</span>
      <div
        className="sf-image-zone"
        onClick={() => inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
        />
        {processing
          ? <span>⏳ Procesando imágenes...</span>
          : <span>📷 Clic o arrastra para agregar imágenes <em style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>(máx. 1280×720, JPEG)</em></span>
        }
      </div>
      {images.length > 0 && (
        <div className="sf-image-list">
          {images.map((img, i) => (
            <div key={i} className="sf-image-item">
              <img src={img.preview} alt={img.file.name} className="sf-image-thumb" />
              <div className="sf-image-info">
                <span className="sf-image-name">{img.file.name}</span>
                <span className="sf-image-meta">{img.width}×{img.height}{img.resized ? ' · redimensionada' : ''}</span>
              </div>
              <button type="button" className="sf-remove-btn small" onClick={() => onRemove(i)}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PrFields({ pr, onChange, destPlaceholder = 'develop' }) {
  return (
    <div className="sf-pr-block">
      <div className="sf-row">
        <div className="sf-field sf-field-grow">
          <span className="sf-field-label">URL del PR</span>
          <input
            type="url"
            className="form-input"
            placeholder="https://bitbucket.org/.../pull-requests/123"
            value={pr.url}
            onChange={(e) => onChange('url', e.target.value)}
          />
        </div>
      </div>
      <div className="sf-row">
        <div className="sf-field sf-field-grow">
          <span className="sf-field-label">Branch origen</span>
          <input
            type="text"
            className="form-input sf-mono"
            placeholder="feature/PY06809-XX"
            value={pr.branchSource}
            onChange={(e) => onChange('branchSource', e.target.value)}
          />
        </div>
        <div className="sf-arrow">→</div>
        <div className="sf-field sf-field-grow">
          <span className="sf-field-label">Branch destino</span>
          <input
            type="text"
            className="form-input sf-mono"
            placeholder={destPlaceholder}
            value={pr.branchDest}
            onChange={(e) => onChange('branchDest', e.target.value)}
          />
        </div>
      </div>
      <div className="sf-row">
        <div className="sf-field">
          <span className="sf-field-label">Estado</span>
          <div className="sf-status-grid">
            {PR_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                className={`sf-status-btn ${pr.status === s ? 'active' : ''}`}
                onClick={() => onChange('status', s)}
              >
                {s === 'Mergeado' ? '✅' : s === 'Aprobado' ? '👍' : s === 'En revisión' ? '👀' : '🔵'} {s}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ContentfulFields({ item, onChange }) {
  const handleAddImages = (newImgs) => {
    onChange('images', [...item.images, ...newImgs]);
  };
  const handleRemoveImage = (idx) => {
    onChange('images', item.images.filter((_, i) => i !== idx));
  };

  return (
    <div className="sf-contentful-block">
      <div className="sf-row">
        <div className="sf-field sf-field-grow">
          <span className="sf-field-label">URL de Contentful</span>
          <input
            type="url"
            className="form-input"
            placeholder="https://app.contentful.com/spaces/.../entries/..."
            value={item.url}
            onChange={(e) => onChange('url', e.target.value)}
          />
        </div>
        <div className="sf-field">
          <span className="sf-field-label">Ambiente</span>
          <div className="sf-env-toggle">
            <button
              type="button"
              className={`sf-env-btn ${item.environment === 'develop' ? 'active dev' : ''}`}
              onClick={() => onChange('environment', 'develop')}
            >
              <span className="sf-env-dot dev" /> develop
            </button>
            <button
              type="button"
              className={`sf-env-btn ${item.environment === 'master' ? 'active prd' : ''}`}
              onClick={() => onChange('environment', 'master')}
            >
              <span className="sf-env-dot prd" /> master
            </button>
          </div>
        </div>
      </div>
      <div className="sf-field">
        <span className="sf-field-label">Descripción del cambio</span>
        <input
          type="text"
          className="form-input"
          placeholder="Ej: Se actualizó el banner principal..."
          value={item.description}
          onChange={(e) => onChange('description', e.target.value)}
        />
      </div>
      <ImageUploadZone
        images={item.images}
        onAdd={handleAddImages}
        onRemove={handleRemoveImage}
        label="📷 Capturas de Contentful"
      />
    </div>
  );
}

function TimeFields({ hours, onHoursChange, label = '⏱ Tiempo invertido' }) {
  return (
    <div className="sf-section sf-time-section">
      <label className="sf-label">{label} <span className="sf-optional">(opcional)</span></label>
      <div className="sf-row sf-time-row">
        <div className="sf-field">
          <input
            type="number"
            className="form-input sf-time-input"
            placeholder="0"
            min="0"
            max="99"
            step="1"
            value={hours}
            onChange={(e) => onHoursChange(e.target.value)}
          />
          <span className="sf-time-label">horas</span>
        </div>
      </div>
    </div>
  );
}

// ─── Markdown Generators ──────────────────────────────────────────────────────

function prMarkdown(pr, label = 'Pull Request') {
  if (!pr.url && !pr.branchSource && !pr.branchDest) return '';
  let md = `h3. 🔀 ${label}\n`;
  md += `||Campo||Valor||\n`;
  if (pr.url) md += `|URL|[${pr.url}|${pr.url}]|\n`;
  if (pr.branchSource || pr.branchDest) md += `|Branch|{{${pr.branchSource}}} → {{${pr.branchDest}}}|\n`;
  md += `|Estado|${pr.status}|\n`;
  md += `\n`;
  return md;
}

function contentfulMarkdown(item, idx, totalImages) {
  if (!item.url && !item.description && item.images.length === 0) return '';
  let md = `h4. Cambio Contentful${totalImages > 1 ? ` ${idx + 1}` : ''}${item.description ? ': ' + item.description : ''}\n`;
  if (item.url) md += `* *URL:* [${item.url}|${item.url}]\n`;
  md += `* *Ambiente:* ${item.environment}\n`;
  if (item.images.length > 0) md += `* *Capturas:* ${item.images.length} imagen(es) adjunta(s)\n`;
  md += `\n`;
  return md;
}

function timeMarkdown(hours) {
  const h = parseInt(hours) || 0;
  if (h === 0) return '';
  return `h3. ⏱ Tiempo invertido\n${h}h\n\n`;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function StructuredCommentForm({ issueKey, onSubmit, submitting }) {
  const [commentType, setCommentType] = useState('review');
  const [showPreview, setShowPreview] = useState(false);

  // ── Universal attachments (all types)
  const [generalFiles, setGeneralFiles] = useState([]); // { file, preview|null, isImage }

  // ── Type 1: Review fields
  const [reviewNotes, setReviewNotes] = useState('');
  const [estimatedHours, setEstimatedHours] = useState('');

  // ── Type 2: Delivery fields
  const [deliveryKind, setDeliveryKind] = useState('avance'); // 'avance' | 'final'
  const [deliverySummary, setDeliverySummary] = useState('');
  const [deliveryPr, setDeliveryPr] = useState({ ...EMPTY_PR, branchDest: 'develop' });
  const [deliveryContentful, setDeliveryContentful] = useState([{ ...EMPTY_CONTENTFUL, environment: 'develop' }]);
  const [deliveryHours, setDeliveryHours] = useState('');
  const [deliveryMinutes, setDeliveryMinutes] = useState('');

  // ── Type 3: Adjustment fields
  const [adjustPrevPrUrl, setAdjustPrevPrUrl] = useState('');
  const [adjustDescription, setAdjustDescription] = useState('');
  const [adjustPr, setAdjustPr] = useState({ ...EMPTY_PR, branchDest: 'develop' });
  const [adjustHours, setAdjustHours] = useState('');
  const [adjustMinutes, setAdjustMinutes] = useState('');

  // ── Type 4: Production PR fields
  const [prodSummary, setProdSummary] = useState('');
  const [prodPr, setProdPr] = useState({ ...EMPTY_PR, branchDest: 'master' });
  const [prodContentful, setProdContentful] = useState([{ ...EMPTY_CONTENTFUL, environment: 'master' }]);
  const [prodHours, setProdHours] = useState('');
  const [prodMinutes, setProdMinutes] = useState('');

  // ── Type 5: Warranty fields
  const [warrantyProblem, setWarrantyProblem] = useState('');
  const [warrantyContentful, setWarrantyContentful] = useState([{ ...EMPTY_CONTENTFUL, environment: 'develop' }]);
  const [warrantyHotfixPr, setWarrantyHotfixPr] = useState({ ...EMPTY_PR, branchDest: 'develop' });
  const [warrantyProdPr, setWarrantyProdPr] = useState({ ...EMPTY_PR, branchDest: 'master' });
  const [warrantyHours, setWarrantyHours] = useState('');
  const [warrantyMinutes, setWarrantyMinutes] = useState('');

  const draftKey = `sc-draft-v2-${issueKey}`;

  // Auto-save and restore draft
  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        const d = JSON.parse(saved);
        if (d.commentType) setCommentType(d.commentType);
        if (d.reviewNotes !== undefined) setReviewNotes(d.reviewNotes);
        if (d.estimatedHours !== undefined) setEstimatedHours(d.estimatedHours);
        if (d.deliveryKind) setDeliveryKind(d.deliveryKind);
        if (d.deliverySummary !== undefined) setDeliverySummary(d.deliverySummary);
        if (d.deliveryPr) setDeliveryPr(d.deliveryPr);
        if (d.deliveryHours !== undefined) setDeliveryHours(d.deliveryHours);
        if (d.deliveryMinutes !== undefined) setDeliveryMinutes(d.deliveryMinutes);
        if (d.adjustPrevPrUrl !== undefined) setAdjustPrevPrUrl(d.adjustPrevPrUrl);
        if (d.adjustDescription !== undefined) setAdjustDescription(d.adjustDescription);
        if (d.adjustPr) setAdjustPr(d.adjustPr);
        if (d.adjustHours !== undefined) setAdjustHours(d.adjustHours);
        if (d.adjustMinutes !== undefined) setAdjustMinutes(d.adjustMinutes);
        if (d.prodSummary !== undefined) setProdSummary(d.prodSummary);
        if (d.prodPr) setProdPr(d.prodPr);
        if (d.prodHours !== undefined) setProdHours(d.prodHours);
        if (d.prodMinutes !== undefined) setProdMinutes(d.prodMinutes);
        if (d.warrantyProblem !== undefined) setWarrantyProblem(d.warrantyProblem);
        if (d.warrantyHotfixPr) setWarrantyHotfixPr(d.warrantyHotfixPr);
        if (d.warrantyProdPr) setWarrantyProdPr(d.warrantyProdPr);
        if (d.warrantyHours !== undefined) setWarrantyHours(d.warrantyHours);
        if (d.warrantyMinutes !== undefined) setWarrantyMinutes(d.warrantyMinutes);
      }
    } catch (e) { /* ignore */ }
  }, [draftKey]);

  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem(draftKey, JSON.stringify({
        commentType, reviewNotes, estimatedHours,
        deliveryKind, deliverySummary, deliveryPr, deliveryHours, deliveryMinutes,
        adjustPrevPrUrl, adjustDescription, adjustPr, adjustHours, adjustMinutes,
        prodSummary, prodPr, prodHours, prodMinutes,
        warrantyProblem, warrantyHotfixPr, warrantyProdPr, warrantyHours, warrantyMinutes,
      }));
    }, 600);
    return () => clearTimeout(timer);
  }, [
    commentType, reviewNotes, estimatedHours,
    deliveryKind, deliverySummary, deliveryPr, deliveryHours, deliveryMinutes,
    adjustPrevPrUrl, adjustDescription, adjustPr, adjustHours, adjustMinutes,
    prodSummary, prodPr, prodHours, prodMinutes,
    warrantyProblem, warrantyHotfixPr, warrantyProdPr, warrantyHours, warrantyMinutes,
    draftKey,
  ]);

  // Helpers for contentful list mutations (images excluded from draft)
  const updateContentfulItem = (list, setList, idx, field, value) => {
    setList(list.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  };
  const addContentfulItem = (list, setList, env) => {
    setList([...list, { ...EMPTY_CONTENTFUL, environment: env }]);
  };
  const removeContentfulItem = (list, setList, idx) => {
    setList(list.filter((_, i) => i !== idx));
  };

  // Update PR helper
  const updatePr = (setPr, field, value) => setPr((prev) => ({ ...prev, [field]: value }));

  // Collect all images/files for upload
  const collectImages = () => {
    const all = [];
    // Type-specific Contentful images
    if (commentType === 'delivery') {
      deliveryContentful.forEach((c) => c.images.forEach((img) => all.push(img.file)));
    } else if (commentType === 'production') {
      prodContentful.forEach((c) => c.images.forEach((img) => all.push(img.file)));
    } else if (commentType === 'warranty') {
      warrantyContentful.forEach((c) => c.images.forEach((img) => all.push(img.file)));
    }
    // Universal attachments (always)
    generalFiles.forEach((gf) => all.push(gf.file));
    return all;
  };

  // ── Markdown Generator ──────────────────────────────────────────────────────
  const generateMarkdown = useCallback(() => {
    const typeInfo = COMMENT_TYPES.find((t) => t.id === commentType);
    const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
    let md = `<!-- STRUCTURED_COMMENT:v2 -->\n`;
    md += `<!-- COMMENT_TYPE:${commentType} -->\n`;
    md += `h2. ${typeInfo.icon} ${typeInfo.label}\n`;
    md += `*Fecha:* ${now}\n\n`;

    if (commentType === 'review') {
      // ── Type 1
      if (estimatedHours) {
        md += `h3. ⏱ Estimado\n`;
        md += `*${estimatedHours} hora(s)* de trabajo estimadas para este requerimiento.\n\n`;
      }
      if (reviewNotes.trim()) {
        md += `h3. 📝 Notas de revisión\n`;
        md += `${reviewNotes.trim()}\n\n`;
      }

    } else if (commentType === 'delivery') {
      // ── Type 2
      md += `*Tipo de entrega:* ${deliveryKind === 'final' ? '✅ Entrega final' : '🔄 Avance parcial'}\n\n`;
      if (deliverySummary.trim()) {
        md += `h3. 📝 Resumen\n${deliverySummary.trim()}\n\n`;
      }
      md += prMarkdown(deliveryPr, 'Pull Request → develop');
      if (deliveryContentful.some((c) => c.url || c.description || c.images.length > 0)) {
        md += `h3. 📦 Cambios en Contentful (develop)\n\n`;
        deliveryContentful.forEach((c, i) => {
          md += contentfulMarkdown(c, i, deliveryContentful.length);
        });
      }
      md += timeMarkdown(deliveryHours);

    } else if (commentType === 'adjustment') {
      // ── Type 3
      if (adjustPrevPrUrl) {
        md += `h3. 🔗 PR anterior\n`;
        md += `[${adjustPrevPrUrl}|${adjustPrevPrUrl}]\n\n`;
      }
      if (adjustDescription.trim()) {
        md += `h3. 📝 Descripción del ajuste\n${adjustDescription.trim()}\n\n`;
      }
      if (adjustPr.url || adjustPr.branchSource) {
        md += prMarkdown(adjustPr, 'PR actualizado');
      }
      md += timeMarkdown(adjustHours);

    } else if (commentType === 'production') {
      // ── Type 4
      if (prodSummary.trim()) {
        md += `h3. 📝 Resumen\n${prodSummary.trim()}\n\n`;
      }
      md += prMarkdown(prodPr, 'Pull Request → master');
      if (prodContentful.some((c) => c.url || c.description || c.images.length > 0)) {
        md += `h3. 📦 Cambios en Contentful (master)\n\n`;
        prodContentful.forEach((c, i) => {
          md += contentfulMarkdown(c, i, prodContentful.length);
        });
      }
      md += timeMarkdown(prodHours);

    } else if (commentType === 'warranty') {
      // ── Type 5
      if (warrantyProblem.trim()) {
        md += `h3. 🚨 Problema detectado\n${warrantyProblem.trim()}\n\n`;
      }
      if (warrantyContentful.some((c) => c.url || c.description || c.images.length > 0)) {
        md += `h3. 📦 Ajustes en Contentful\n\n`;
        warrantyContentful.forEach((c, i) => {
          md += contentfulMarkdown(c, i, warrantyContentful.length);
        });
      }
      if (warrantyHotfixPr.url || warrantyHotfixPr.branchSource) {
        md += prMarkdown(warrantyHotfixPr, 'PR Hotfix → develop');
      }
      if (warrantyProdPr.url || warrantyProdPr.branchSource) {
        md += prMarkdown(warrantyProdPr, 'PR Re-deploy → master');
      }
      md += timeMarkdown(warrantyHours);
    }

    // General attachments note
    if (generalFiles.length > 0) {
      const imgs = generalFiles.filter(f => f.isImage);
      const pdfs = generalFiles.filter(f => !f.isImage);
      md += `h3. 📎 Adjuntos\n`;
      if (imgs.length > 0) md += `* 🖼 ${imgs.length} imagen(es) adjunta(s)\n`;
      if (pdfs.length > 0) md += `* 📄 ${pdfs.length} PDF/archivo(s) adjunto(s): ${pdfs.map(f => f.file.name).join(', ')}\n`;
      md += `\n`;
    }

    md += `<!-- /STRUCTURED_COMMENT -->`;
    return md;
  }, [
    commentType, estimatedHours, reviewNotes,
    deliveryKind, deliverySummary, deliveryPr, deliveryContentful, deliveryHours, deliveryMinutes,
    adjustPrevPrUrl, adjustDescription, adjustPr, adjustHours, adjustMinutes,
    prodSummary, prodPr, prodContentful, prodHours, prodMinutes,
    warrantyProblem, warrantyContentful, warrantyHotfixPr, warrantyProdPr, warrantyHours, warrantyMinutes,
    generalFiles,
  ]);

  // Validation
  const isValid = () => {
    if (commentType === 'review') return !!estimatedHours && parseInt(estimatedHours) > 0;
    if (commentType === 'delivery') return !!(deliveryPr.url || deliverySummary.trim());
    if (commentType === 'adjustment') return !!(adjustDescription.trim() || adjustPrevPrUrl);
    if (commentType === 'production') return !!(prodPr.url || prodSummary.trim());
    if (commentType === 'warranty') return !!(warrantyProblem.trim());
    return false;
  };

  const resetForm = () => {
    setReviewNotes(''); setEstimatedHours('');
    setDeliveryKind('avance'); setDeliverySummary('');
    setDeliveryPr({ ...EMPTY_PR, branchDest: 'develop' });
    setDeliveryContentful([{ ...EMPTY_CONTENTFUL, environment: 'develop' }]);
    setDeliveryHours(''); setDeliveryMinutes('');
    setAdjustPrevPrUrl(''); setAdjustDescription('');
    setAdjustPr({ ...EMPTY_PR, branchDest: 'develop' });
    setAdjustHours(''); setAdjustMinutes('');
    setProdSummary('');
    setProdPr({ ...EMPTY_PR, branchDest: 'master' });
    setProdContentful([{ ...EMPTY_CONTENTFUL, environment: 'master' }]);
    setProdHours(''); setProdMinutes('');
    setWarrantyProblem('');
    setWarrantyContentful([{ ...EMPTY_CONTENTFUL, environment: 'develop' }]);
    setWarrantyHotfixPr({ ...EMPTY_PR, branchDest: 'develop' });
    setWarrantyProdPr({ ...EMPTY_PR, branchDest: 'master' });
    setWarrantyHours(''); setWarrantyMinutes('');
    setGeneralFiles([]);
    localStorage.removeItem(draftKey);
  };

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!isValid()) return;
    const markdown = generateMarkdown();
    const images = collectImages();
    const timeData = (() => {
      if (commentType === 'delivery') return { hours: parseInt(deliveryHours) || 0, minutes: 0 };
      if (commentType === 'adjustment') return { hours: parseInt(adjustHours) || 0, minutes: 0 };
      if (commentType === 'production') return { hours: parseInt(prodHours) || 0, minutes: 0 };
      if (commentType === 'warranty') return { hours: parseInt(warrantyHours) || 0, minutes: 0 };
      return null;
    })();
    await onSubmit(markdown, images, timeData?.hours > 0 ? timeData : null);
    resetForm();
  };

  const typeInfo = COMMENT_TYPES.find((t) => t.id === commentType);

  // ── Render Comment-Type-Specific Fields ──────────────────────────────────────
  const renderTypeFields = () => {
    if (commentType === 'review') {
      return (
        <>
          <div className="sf-section">
            <label className="sf-label">⏱ Estimado en horas <span className="sf-required">*</span></label>
            <div className="sf-estimate-row">
              <input
                type="number"
                className="form-input sf-estimate-input"
                placeholder="0"
                min="0"
                max="999"
                value={estimatedHours}
                onChange={(e) => setEstimatedHours(e.target.value)}
              />
              <span className="sf-time-label">horas estimadas</span>
            </div>
            <p className="sf-hint">Indica el esfuerzo estimado en horas para completar este requerimiento.</p>
          </div>
          <div className="sf-section">
            <label className="sf-label">📝 Notas de revisión <span className="sf-optional">(opcional)</span></label>
            <textarea
              className="form-textarea sf-textarea"
              placeholder="Observaciones, supuestos, alcance, riesgos o condiciones especiales..."
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              rows={4}
            />
          </div>
        </>
      );
    }

    if (commentType === 'delivery') {
      return (
        <>
          <div className="sf-section">
            <label className="sf-label">Tipo de entrega</label>
            <div className="sf-env-toggle">
              <button type="button" className={`sf-env-btn ${deliveryKind === 'avance' ? 'active dev' : ''}`} onClick={() => setDeliveryKind('avance')}>
                🔄 Avance parcial
              </button>
              <button type="button" className={`sf-env-btn ${deliveryKind === 'final' ? 'active prd' : ''}`} onClick={() => setDeliveryKind('final')}>
                ✅ Entrega final
              </button>
            </div>
          </div>
          <div className="sf-section">
            <label className="sf-label">📝 Resumen de cambios</label>
            <textarea
              className="form-textarea sf-textarea"
              placeholder="Describe brevemente qué se implementó..."
              value={deliverySummary}
              onChange={(e) => setDeliverySummary(e.target.value)}
              rows={3}
            />
          </div>
          <div className="sf-section sf-section-bordered sf-pr-section">
            <label className="sf-label">🔀 Pull Request → <code>develop</code></label>
            <PrFields pr={deliveryPr} onChange={(f, v) => updatePr(setDeliveryPr, f, v)} destPlaceholder="develop" />
          </div>
          <div className="sf-section sf-section-bordered sf-cms-section">
            <label className="sf-label">📦 Cambios en Contentful <span className="sf-env-chip dev">develop</span></label>
            {deliveryContentful.map((item, idx) => (
              <div key={idx} className="sf-contentful-card">
                <div className="sf-contentful-header">
                  <span className="sf-contentful-num">Cambio {idx + 1}</span>
                  {deliveryContentful.length > 1 && (
                    <button type="button" className="sf-remove-btn" onClick={() => removeContentfulItem(deliveryContentful, setDeliveryContentful, idx)}>✕</button>
                  )}
                </div>
                <ContentfulFields
                  item={item}
                  onChange={(f, v) => updateContentfulItem(deliveryContentful, setDeliveryContentful, idx, f, v)}
                />
              </div>
            ))}
            <button type="button" className="btn btn-ghost sf-add-btn" onClick={() => addContentfulItem(deliveryContentful, setDeliveryContentful, 'develop')}>
              + Agregar otro cambio en Contentful
            </button>
          </div>
          <TimeFields hours={deliveryHours} onHoursChange={setDeliveryHours} />
        </>
      );
    }

    if (commentType === 'adjustment') {
      return (
        <>
          <div className="sf-section">
            <label className="sf-label">🔗 URL del PR anterior</label>
            <input
              type="url"
              className="form-input"
              placeholder="https://bitbucket.org/.../pull-requests/123"
              value={adjustPrevPrUrl}
              onChange={(e) => setAdjustPrevPrUrl(e.target.value)}
            />
            <p className="sf-hint">El PR que requiere el ajuste.</p>
          </div>
          <div className="sf-section">
            <label className="sf-label">📝 Descripción del ajuste <span className="sf-required">*</span></label>
            <textarea
              className="form-textarea sf-textarea"
              placeholder="Describe qué se ajusta y por qué..."
              value={adjustDescription}
              onChange={(e) => setAdjustDescription(e.target.value)}
              rows={4}
            />
          </div>
          <div className="sf-section sf-section-bordered sf-pr-section">
            <label className="sf-label">🔀 PR actualizado <span className="sf-optional">(si aplica)</span></label>
            <PrFields pr={adjustPr} onChange={(f, v) => updatePr(setAdjustPr, f, v)} destPlaceholder="develop" />
          </div>
          <TimeFields hours={adjustHours} onHoursChange={setAdjustHours} />
        </>
      );
    }

    if (commentType === 'production') {
      return (
        <>
          <div className="sf-section">
            <label className="sf-label">📝 Resumen / Notas de despliegue</label>
            <textarea
              className="form-textarea sf-textarea"
              placeholder="Describe los cambios que van a producción, consideraciones especiales, rollback si aplica..."
              value={prodSummary}
              onChange={(e) => setProdSummary(e.target.value)}
              rows={3}
            />
          </div>
          <div className="sf-section sf-section-bordered sf-pr-section">
            <label className="sf-label">🔀 Pull Request → <code>master</code></label>
            <PrFields pr={prodPr} onChange={(f, v) => updatePr(setProdPr, f, v)} destPlaceholder="master" />
          </div>
          <div className="sf-section sf-section-bordered sf-cms-section cms-prd">
            <label className="sf-label">📦 Cambios en Contentful <span className="sf-env-chip prd">master</span></label>
            {prodContentful.map((item, idx) => (
              <div key={idx} className="sf-contentful-card">
                <div className="sf-contentful-header">
                  <span className="sf-contentful-num">Cambio {idx + 1}</span>
                  {prodContentful.length > 1 && (
                    <button type="button" className="sf-remove-btn" onClick={() => removeContentfulItem(prodContentful, setProdContentful, idx)}>✕</button>
                  )}
                </div>
                <ContentfulFields
                  item={{ ...item, environment: 'master' }}
                  onChange={(f, v) => updateContentfulItem(prodContentful, setProdContentful, idx, f, v)}
                />
              </div>
            ))}
            <button type="button" className="btn btn-ghost sf-add-btn" onClick={() => addContentfulItem(prodContentful, setProdContentful, 'master')}>
              + Agregar otro cambio en Contentful
            </button>
          </div>
          <TimeFields hours={prodHours} onHoursChange={setProdHours} />
        </>
      );
    }

    if (commentType === 'warranty') {
      return (
        <>
          <div className="sf-section">
            <label className="sf-label">🚨 Problema detectado <span className="sf-required">*</span></label>
            <textarea
              className="form-textarea sf-textarea"
              placeholder="Describe el problema encontrado en producción: qué falló, cómo se reprodujo, impacto..."
              value={warrantyProblem}
              onChange={(e) => setWarrantyProblem(e.target.value)}
              rows={4}
            />
          </div>
          <div className="sf-section sf-section-bordered sf-cms-section">
            <label className="sf-label">📦 Ajustes en Contentful <span className="sf-optional">(develop y/o master)</span></label>
            {warrantyContentful.map((item, idx) => (
              <div key={idx} className="sf-contentful-card">
                <div className="sf-contentful-header">
                  <span className="sf-contentful-num">Ajuste {idx + 1}</span>
                  {warrantyContentful.length > 1 && (
                    <button type="button" className="sf-remove-btn" onClick={() => removeContentfulItem(warrantyContentful, setWarrantyContentful, idx)}>✕</button>
                  )}
                </div>
                <ContentfulFields
                  item={item}
                  onChange={(f, v) => updateContentfulItem(warrantyContentful, setWarrantyContentful, idx, f, v)}
                />
              </div>
            ))}
            <button type="button" className="btn btn-ghost sf-add-btn" onClick={() => addContentfulItem(warrantyContentful, setWarrantyContentful, 'develop')}>
              + Agregar otro ajuste en Contentful
            </button>
          </div>
          <div className="sf-section sf-section-bordered sf-pr-section">
            <label className="sf-label">🔀 PR Hotfix → <code>develop</code></label>
            <p className="sf-hint">PR con la corrección hacia develop primero.</p>
            <PrFields pr={warrantyHotfixPr} onChange={(f, v) => updatePr(setWarrantyHotfixPr, f, v)} destPlaceholder="develop" />
          </div>
          <div className="sf-section sf-section-bordered sf-pr-section sf-pr-prd">
            <label className="sf-label">🔀 PR Re-deploy → <code>master</code></label>
            <p className="sf-hint">PR de merge hacia master para volver a producción.</p>
            <PrFields pr={warrantyProdPr} onChange={(f, v) => updatePr(setWarrantyProdPr, f, v)} destPlaceholder="master" />
          </div>
          <TimeFields hours={warrantyHours} onHoursChange={setWarrantyHours} />
        </>
      );
    }

    return null;
  };

  return (
    <form onSubmit={handleSubmit} className="structured-form">
      {/* Comment Type Selector */}
      <div className="sf-section">
        <label className="sf-label">Tipo de comentario</label>
        <div className="sf-comment-type-grid">
          {COMMENT_TYPES.map((type) => (
            <button
              key={type.id}
              type="button"
              className={`sf-comment-type-btn ct-${type.color} ${commentType === type.id ? 'active' : ''}`}
              onClick={() => setCommentType(type.id)}
            >
              <span className="sf-ct-icon">{type.icon}</span>
              <span className="sf-ct-label">{type.label}</span>
              <span className="sf-ct-desc">{type.description}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Type-specific fields */}
      {renderTypeFields()}

      {/* Universal attachments — all types */}
      <div className="sf-section sf-section-bordered sf-general-attachments">
        <label className="sf-label">📎 Adjuntos generales <span className="sf-optional">(PDF, imágenes — opcional)</span></label>
        <div
          className="sf-image-zone"
          onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*,.pdf,.doc,.docx';
            input.multiple = true;
            input.onchange = async (e) => {
              const files = Array.from(e.target.files);
              const processed = await Promise.all(
                files.map(async (f) => {
                  if (f.type.startsWith('image/')) {
                    const r = await resizeImage(f);
                    return { file: r.file, preview: URL.createObjectURL(r.file), isImage: true, resized: r.resized };
                  }
                  return { file: f, preview: null, isImage: false };
                })
              );
              setGeneralFiles((prev) => [...prev, ...processed]);
            };
            input.click();
          }}
          onDrop={async (e) => {
            e.preventDefault();
            const files = Array.from(e.dataTransfer.files);
            const processed = await Promise.all(
              files.map(async (f) => {
                if (f.type.startsWith('image/')) {
                  const r = await resizeImage(f);
                  return { file: r.file, preview: URL.createObjectURL(r.file), isImage: true, resized: r.resized };
                }
                return { file: f, preview: null, isImage: false };
              })
            );
            setGeneralFiles((prev) => [...prev, ...processed]);
          }}
          onDragOver={(e) => e.preventDefault()}
        >
          <span>📷 Imágenes o 📄 PDFs — clic o arrastra para adjuntar</span>
        </div>
        {generalFiles.length > 0 && (
          <div className="sf-image-list">
            {generalFiles.map((gf, i) => (
              <div key={i} className="sf-image-item">
                {gf.isImage
                  ? <img src={gf.preview} alt={gf.file.name} className="sf-image-thumb" />
                  : <div className="sf-file-icon">📄</div>
                }
                <div className="sf-image-info">
                  <span className="sf-image-name">{gf.file.name}</span>
                  <span className="sf-image-meta">
                    {gf.isImage ? `imagen${gf.resized ? ' · redimensionada' : ''}` : 'PDF / archivo'}
                  </span>
                </div>
                <button type="button" className="sf-remove-btn small" onClick={() => setGeneralFiles((prev) => prev.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}

      <div className="sf-actions">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setShowPreview(true)}
          disabled={!isValid()}
        >
          👁 Vista previa
        </button>
        <button
          type="submit"
          className={`btn btn-ct-${typeInfo.color}`}
          disabled={!isValid() || submitting}
        >
          {submitting ? '⏳ Enviando...' : `${typeInfo.icon} Enviar — ${typeInfo.label}`}
        </button>
      </div>

      {/* Preview Modal */}
      {showPreview && (
        <div className="modal-overlay" onClick={() => setShowPreview(false)}>
          <div className="modal-content sc-preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Vista previa</h3>
              <button className="modal-close" onClick={() => setShowPreview(false)}>✕</button>
            </div>
            <div className="sc-preview-body">
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem', color: 'var(--text-muted)', background: 'var(--bg-card)', padding: '16px', borderRadius: '8px', margin: 0 }}>
                {generateMarkdown()}
              </pre>
            </div>
            <div className="sf-actions" style={{ padding: '16px 24px', borderTop: '1px solid var(--border)' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setShowPreview(false)}>Cerrar</button>
              <button
                type="button"
                className={`btn btn-ct-${typeInfo.color}`}
                onClick={() => { setShowPreview(false); handleSubmit(); }}
                disabled={submitting}
              >
                📤 Enviar
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
