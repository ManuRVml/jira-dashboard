/**
 * timeParser.js
 * Extracts time estimates, executed hours and remaining hours from Jira comment text.
 * Patterns found in this project's comments (Spanish):
 *   - "Tiempo estimado 3h" / "Tiempo estimado: 3h"
 *   - "Tiempo ejecutado: 2h" / "Tiempo ejecutado 2h 30m"
 *   - "Tiempo por ejecutar: 1h"
 *   - "proceder con las X horas" → treated as approval / estimated
 *   - "aprueba(n) las X horas" → estimated / authorized
 *   - "se aprueban las X horas para consumir" → estimated
 *   - "X horas estimadas" 
 */

// Convert "Xh Ym" or "Xh" or "X horas" to decimal hours
function toHours(str = '') {
  if (!str) return null;
  str = str.trim().toLowerCase();
  let total = 0;
  // Match "X.Y horas" or "X horas"
  const hoursDecimal = str.match(/(\d+(?:\.\d+)?)\s*hora/);
  if (hoursDecimal) return parseFloat(hoursDecimal[1]);
  // Match "Xh Ym" or "Xh" or "Ym"
  const h = str.match(/(\d+)\s*h/);
  const m = str.match(/(\d+)\s*m/);
  if (h) total += parseInt(h[1]);
  if (m) total += parseInt(m[1]) / 60;
  return total > 0 ? Math.round(total * 10) / 10 : null;
}

// Main parser: scans all comment bodies and returns { estimated, executed, remaining, source }
function parseTimeFromComments(comments = []) {
  let estimated = null;
  let executed = null;
  let remaining = null;

  // Process comments in order (later comments can update values)
  for (const comment of comments) {
    const body = (comment.body || comment.renderedBody || '').replace(/\!.+?\!/g, ''); // remove attachments syntax

    // --- ESTIMATED time patterns ---
    // "Tiempo estimado: 3h" / "Tiempo estimado 3h"
    let m = body.match(/tiempo\s+estimado\s*[:\-]?\s*([\d.,]+\s*h(?:\s*\d+\s*m)?|\d+(?:\.\d+)?\s*hora\w*)/i);
    if (m) { const v = toHours(m[1]); if (v) estimated = v; }

    // "X horas estimadas"
    m = body.match(/([\d.,]+)\s*hora\w*\s+estimad/i);
    if (m) { const v = toHours(m[1] + ' horas'); if (v) estimated = v; }

    // "proceder con las X horas" / "aprueba(n) las X horas" / "se aprueban las X horas para consumir"
    m = body.match(/(?:proceder\s+con\s+las?|aprobar|aprueba[n]?\s+las?|consumir\s+(?:en\s+el\s+bloque)?)\s+([\d.,]+)\s*hora/i);
    if (m) { const v = toHours(m[1] + ' horas'); if (v) estimated = (estimated || 0) + v; }

    // "| X |" pattern (table), look for hour values next to keywords
    m = body.match(/\|.*?(\bBanner\b|\bcomponente\b).*?\|\s*(\d+)\s*\|/i);
    if (m) { const v = parseFloat(m[2]); if (v) estimated = (estimated || 0) + v; }

    // --- EXECUTED time patterns ---
    // "Tiempo ejecutado: 2h" / "Tiempo ejecutado 2h 30m"
    m = body.match(/tiempo\s+ejecutado\s*[:\-]?\s*([\d.,]+\s*h(?:\s*\d+\s*m)?|\d+(?:\.\d+)?\s*hora\w*)/i);
    if (m) { const v = toHours(m[1]); if (v) executed = v; }

    // "Horas ejecutadas: X"
    m = body.match(/hora\w*\s+ejecutad\w*\s*[:\-]?\s*([\d.,]+)/i);
    if (m) { const v = parseFloat(m[1]); if (v) executed = v; }

    // "Tiempo invertido: Xh"
    m = body.match(/tiempo\s+(?:invertido|trabajado)\s*[:\-]?\s*([\d.,]+\s*h(?:\s*\d+\s*m)?)/i);
    if (m) { const v = toHours(m[1]); if (v) executed = v; }

    // --- REMAINING time patterns ---
    // "Tiempo por ejecutar: Xh" / "Tiempo restante: Xh"
    m = body.match(/tiempo\s+(?:por\s+ejecutar|restante|pendiente)\s*[:\-]?\s*([\d.,]+\s*h(?:\s*\d+\s*m)?|\d+(?:\.\d+)?\s*hora\w*)/i);
    if (m) { const v = toHours(m[1]); if (v) remaining = v; }
  }

  // If we have estimated and executed but no remaining, derive it
  if (estimated !== null && executed !== null && remaining === null) {
    remaining = Math.max(0, Math.round((estimated - executed) * 10) / 10);
  }

  // If we only have estimated, remaining = estimated (nothing executed yet)
  if (estimated !== null && executed === null && remaining === null) {
    remaining = estimated;
  }

  const hasAnyData = estimated !== null || executed !== null || remaining !== null;
  return hasAnyData ? { estimated, executed, remaining } : null;
}

/**
 * detectWarrantyFromComments
 * Returns true if ANY comment contains any of:
 *   1. "caso en garantia" (full phrase, case/accent insensitive)
 *   2. "garantia" as a standalone word (e.g. short comment "Garantia")
 *   3. Jira flag system comment format: "Flag added\n\nGarantia"
 *   4. Structured comment marker <!-- COMMENT_TYPE:warranty -->
 */
function detectWarrantyFromComments(comments = []) {
  // Full phrase: "Caso en garantia" (wiki markup *, bold **, quotes around it, etc.)
  const phraseRe = /caso\s+en\s+garant[ií]a/i;
  // Standalone word "garantia" (whole-word, allows surrounding punctuation/quotes)
  const wordRe = /(?:^|[\s\*\-\"\(])garant[ií]a(?:$|[\s\.\,\"\!\)\*])/im;
  // Structured comment type marker
  const typeRe = /COMMENT_TYPE:warranty/;

  for (const comment of comments) {
    const body = comment.body || comment.renderedBody || '';
    // body can be ADF (object) or plain string
    const text = typeof body === 'string' ? body : extractTextFromAdf(body);
    if (!text) continue;
    if (phraseRe.test(text) || wordRe.test(text) || typeRe.test(text)) return true;
  }
  return false;
}


// Minimal ADF text extractor (shared util)
function extractTextFromAdf(node) {
  if (!node) return '';
  if (node.text) return node.text;
  if (node.content && Array.isArray(node.content)) {
    return node.content.map(extractTextFromAdf).join(' ');
  }
  return '';
}

module.exports = { parseTimeFromComments, toHours, detectWarrantyFromComments };
