/**
 * Jira Wiki Markup → HTML parser
 * Shared utility for rendering structured comments in the dashboard.
 */

const escHtml = (str) =>
  str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const formatInline = (text) =>
  text
    .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
    .replace(/_([^_\n]+)_/g, '<em>$1</em>')
    .replace(/\{\{([^}]+)\}\}/g, '<code>$1</code>')
    .replace(/\[([^|\]]+)\|([^\]]+)\]/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\[([^\]]+)\]/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/!([^|!\s]+)\|thumbnail!/g, '<img src="/api/issues/attachment-proxy?name=$1" alt="$1" class="sc-thumbnail" />')
    .replace(/!([^|!\s]+)!/g, '<img src="/api/issues/attachment-proxy?name=$1" alt="$1" class="sc-thumbnail" />');

/**
 * Convert Jira wiki markup text to HTML string.
 * @param {string} text - raw wiki markup
 * @returns {string} HTML string
 */
export function wikiToHtml(text) {
  if (!text) return '';

  // Strip structured comment markers
  let cleaned = text
    .replace(/\{color:#f4f5f7\}\[SCv2:\w+\]\{color\}/g, '')
    .replace(/<!-- STRUCTURED_COMMENT:v[12] -->/g, '')
    .replace(/<!-- COMMENT_TYPE:\w+ -->/g, '')
    .replace(/<!-- \/STRUCTURED_COMMENT -->/g, '')
    .trim();

  // Process code blocks first (preserve content)
  const codeBlocks = [];
  let processed = cleaned.replace(/\{code(?::[^}]*)?\}([\s\S]*?)\{code\}/g, (_, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(code.trim());
    return `%%CODEBLOCK_${idx}%%`;
  });

  // Process {noformat} blocks
  processed = processed.replace(/\{noformat\}([\s\S]*?)\{noformat\}/g, (_, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(code.trim());
    return `%%CODEBLOCK_${idx}%%`;
  });

  // Process {color} tags (strip them, they're just Jira styling)
  processed = processed.replace(/\{color:[^}]*\}(.*?)\{color\}/g, '$1');

  const lines = processed.split('\n');
  const htmlParts = [];
  let inTable = false;
  let tableHasHeader = false;
  let listItems = [];
  let numListItems = [];

  const flushList = () => {
    if (listItems.length > 0) {
      htmlParts.push(`<ul class="sc-list">${listItems.map(li => `<li>${li}</li>`).join('')}</ul>`);
      listItems = [];
    }
    if (numListItems.length > 0) {
      htmlParts.push(`<ol class="sc-list">${numListItems.map(li => `<li>${li}</li>`).join('')}</ol>`);
      numListItems = [];
    }
  };

  const flushTable = () => {
    if (inTable) {
      htmlParts.push('</tbody></table>');
      inTable = false;
      tableHasHeader = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Header row: ||col1||col2||
    if (/^\|\|(.+)\|\|$/.test(line)) {
      flushList();
      if (!inTable) {
        htmlParts.push('<table class="sc-table"><thead>');
        inTable = true;
        tableHasHeader = true;
      }
      const cols = line.replace(/^\|\|/, '').replace(/\|\|$/, '').split('||');
      const cells = cols.map(c => `<th>${formatInline(c.trim())}</th>`).join('');
      if (tableHasHeader) {
        htmlParts.push(`<tr>${cells}</tr></thead><tbody>`);
        tableHasHeader = false;
      } else {
        htmlParts.push(`<tr>${cells}</tr>`);
      }
      continue;
    }

    // Data row: |col1|col2|
    if (/^\|(.+)\|$/.test(line)) {
      flushList();
      if (!inTable) {
        htmlParts.push('<table class="sc-table"><tbody>');
        inTable = true;
      }
      const cols = line.replace(/^\|/, '').replace(/\|$/, '').split('|');
      const cells = cols.map(c => `<td>${formatInline(c.trim())}</td>`).join('');
      htmlParts.push(`<tr>${cells}</tr>`);
      continue;
    }

    // Not a table row — close table if open
    flushTable();

    // Headings
    const h2 = line.match(/^h2\.\s*(.+)$/);
    if (h2) { flushList(); htmlParts.push(`<h3 class="sc-h2">${formatInline(h2[1])}</h3>`); continue; }
    const h3 = line.match(/^h3\.\s*(.+)$/);
    if (h3) { flushList(); htmlParts.push(`<h4 class="sc-h3">${formatInline(h3[1])}</h4>`); continue; }
    const h4 = line.match(/^h4\.\s*(.+)$/);
    if (h4) { flushList(); htmlParts.push(`<h5 class="sc-h4">${formatInline(h4[1])}</h5>`); continue; }

    // Unordered list items: * item
    const li = line.match(/^\*\s+(.+)$/);
    if (li) { flushTable(); numListItems.length > 0 && flushList(); listItems.push(formatInline(li[1])); continue; }

    // Ordered list items: # item
    const numLi = line.match(/^#\s+(.+)$/);
    if (numLi) { flushTable(); listItems.length > 0 && flushList(); numListItems.push(formatInline(numLi[1])); continue; }

    // Code block placeholder
    if (/^%%CODEBLOCK_\d+%%$/.test(line.trim())) {
      flushList();
      const idx = parseInt(line.match(/%%CODEBLOCK_(\d+)%%/)[1]);
      htmlParts.push(`<pre class="sc-code-block">${escHtml(codeBlocks[idx])}</pre>`);
      continue;
    }

    // Empty line → break
    if (line.trim() === '') {
      flushList();
      continue;
    }

    // Regular text
    flushList();
    htmlParts.push(`<p class="sc-p">${formatInline(line)}</p>`);
  }

  flushList();
  flushTable();

  return htmlParts.join('');
}
