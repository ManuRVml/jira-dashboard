const {
  Document, Packer, Paragraph, Table, TableRow, TableCell,
  TextRun, HeadingLevel, AlignmentType, BorderStyle,
  WidthType, ShadingType, TabStopPosition, TabStopType,
  Header, Footer, PageNumber, NumberFormat,
} = require('docx');

// Color palette
const COLORS = {
  primary: '2D3748',      // Dark slate
  accent: '6C5CE7',       // Purple
  accentLight: 'A29BFE',  // Light purple
  success: '00B894',      // Green
  warning: 'FDCB6E',      // Yellow
  danger: 'E17055',       // Red
  textDark: '2D3748',
  textMuted: '718096',
  bgLight: 'F7FAFC',
  bgHeader: 'EBF4FF',
  border: 'E2E8F0',
  white: 'FFFFFF',
};

function createBorders(color = COLORS.border) {
  const border = { style: BorderStyle.SINGLE, size: 1, color };
  return { top: border, bottom: border, left: border, right: border };
}

function headerCell(text, width) {
  return new TableCell({
    children: [new Paragraph({
      children: [new TextRun({ text, bold: true, color: COLORS.white, size: 20, font: 'Calibri' })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 60, after: 60 },
    })],
    shading: { type: ShadingType.SOLID, color: COLORS.accent },
    borders: createBorders(COLORS.accent),
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    verticalAlign: 'center',
  });
}

function dataCell(text, options = {}) {
  const runs = [];
  if (options.bold) {
    runs.push(new TextRun({ text: text || '-', bold: true, size: 19, font: 'Calibri', color: options.color || COLORS.textDark }));
  } else {
    runs.push(new TextRun({ text: text || '-', size: 19, font: 'Calibri', color: options.color || COLORS.textDark }));
  }
  return new TableCell({
    children: [new Paragraph({
      children: runs,
      alignment: options.align || AlignmentType.LEFT,
      spacing: { before: 40, after: 40 },
    })],
    shading: options.shading ? { type: ShadingType.SOLID, color: options.shading } : undefined,
    borders: createBorders(),
    width: options.width ? { size: options.width, type: WidthType.PERCENTAGE } : undefined,
    verticalAlign: 'center',
  });
}

function statusColor(status) {
  const s = (status || '').toLowerCase();
  if (s.includes('cerrado') || s.includes('done') || s.includes('completado') || s.includes('closed')) return COLORS.success;
  if (s.includes('doing') || s.includes('progreso') || s.includes('progress')) return COLORS.warning;
  if (s.includes('block') || s.includes('reopen')) return COLORS.danger;
  return COLORS.textMuted;
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function sectionTitle(text) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 26, font: 'Calibri', color: COLORS.accent })],
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: COLORS.accent } },
  });
}

function bodyText(text) {
  return new Paragraph({
    children: [new TextRun({ text, size: 21, font: 'Calibri', color: COLORS.textDark })],
    spacing: { before: 60, after: 60 },
    alignment: AlignmentType.JUSTIFIED,
  });
}

function bulletText(text, bold = false) {
  return new Paragraph({
    children: [new TextRun({ text, size: 20, font: 'Calibri', color: COLORS.textDark, bold })],
    bullet: { level: 0 },
    spacing: { before: 40, after: 40 },
  });
}

async function generateBlockReportDocx(type, period, casesData, totalHours, userName) {
  const isClosing = type === 'cierre';
  const closedCases = casesData.filter(c => {
    const s = (c.status || '').toLowerCase();
    return s.includes('cerrado') || s.includes('done') || s.includes('closed') || s.includes('completado');
  });
  const inProgressCases = casesData.filter(c => !closedCases.includes(c));

  const children = [];

  // ──── Title ────
  children.push(new Paragraph({
    children: [
      new TextRun({ text: `REPORTE DE ${isClosing ? 'CIERRE' : 'AVANCE'}`, bold: true, size: 36, font: 'Calibri', color: COLORS.accent }),
    ],
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 60 },
  }));

  children.push(new Paragraph({
    children: [
      new TextRun({ text: `Bloque ${period.label}`, size: 28, font: 'Calibri', color: COLORS.textMuted }),
    ],
    alignment: AlignmentType.CENTER,
    spacing: { after: 100 },
  }));

  // Info bar
  children.push(new Paragraph({
    children: [
      new TextRun({ text: 'Elaborado por: ', size: 20, font: 'Calibri', color: COLORS.textMuted }),
      new TextRun({ text: userName || 'No especificado', bold: true, size: 20, font: 'Calibri', color: COLORS.textDark }),
      new TextRun({ text: '    |    ', size: 20, font: 'Calibri', color: COLORS.border }),
      new TextRun({ text: 'Fecha: ', size: 20, font: 'Calibri', color: COLORS.textMuted }),
      new TextRun({ text: formatDate(new Date().toISOString()), bold: true, size: 20, font: 'Calibri', color: COLORS.textDark }),
    ],
    alignment: AlignmentType.CENTER,
    spacing: { after: 300 },
  }));

  // Divider
  children.push(new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 3, color: COLORS.accent } },
    spacing: { after: 200 },
  }));

  // ──── 1. Métricas Generales ────
  children.push(sectionTitle('1. Métricas del Bloque'));

  const metricsTable = new Table({
    rows: [
      new TableRow({
        children: [
          headerCell('Métrica', 50),
          headerCell('Valor', 50),
        ],
      }),
      new TableRow({
        children: [
          dataCell('Total de horas consumidas', { bold: true }),
          dataCell(`${totalHours}h`, { align: AlignmentType.CENTER, bold: true, color: COLORS.accent }),
        ],
      }),
      new TableRow({
        children: [
          dataCell('Total de casos', { shading: COLORS.bgLight }),
          dataCell(`${casesData.length}`, { align: AlignmentType.CENTER, shading: COLORS.bgLight }),
        ],
      }),
      new TableRow({
        children: [
          dataCell('Casos cerrados'),
          dataCell(`${closedCases.length}`, { align: AlignmentType.CENTER, color: COLORS.success, bold: true }),
        ],
      }),
      new TableRow({
        children: [
          dataCell('Casos en progreso', { shading: COLORS.bgLight }),
          dataCell(`${inProgressCases.length}`, { align: AlignmentType.CENTER, shading: COLORS.bgLight, color: COLORS.warning.replace('FD', 'B8').replace('6E', '00'), bold: true }),
        ],
      }),
    ],
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
  children.push(metricsTable);

  // ──── 2. Detalle por Caso ────
  children.push(sectionTitle('2. Detalle por Caso'));

  // Main cases table
  const caseRows = [
    new TableRow({
      children: [
        headerCell('Caso', 15),
        headerCell('Descripción', 30),
        headerCell('Horas', 8),
        headerCell('Estado', 12),
        headerCell('F. Creación', 12),
        headerCell(isClosing ? 'F. Cierre' : 'Ult. Actualización', 13),
      ],
      tableHeader: true,
    }),
  ];

  casesData.forEach((c, idx) => {
    const isEven = idx % 2 === 0;
    const bg = isEven ? COLORS.bgLight : COLORS.white;
    const completionDate = c.resolutionDate ? formatDate(c.resolutionDate) : `En progreso`;
    const completionColor = c.resolutionDate ? COLORS.success : COLORS.textMuted;

    caseRows.push(new TableRow({
      children: [
        dataCell(c.key, { bold: true, shading: bg, color: COLORS.accent }),
        dataCell(c.summary || 'Sin título', { shading: bg }),
        dataCell(`${c.hours}h`, { align: AlignmentType.CENTER, bold: true, shading: bg }),
        dataCell(c.status || 'Desconocido', { color: statusColor(c.status), bold: true, shading: bg }),
        dataCell(formatDate(c.created), { align: AlignmentType.CENTER, shading: bg }),
        dataCell(completionDate, { align: AlignmentType.CENTER, color: completionColor, shading: bg }),
      ],
    }));
  });

  // Total row
  caseRows.push(new TableRow({
    children: [
      new TableCell({
        children: [new Paragraph({
          children: [new TextRun({ text: 'TOTAL', bold: true, size: 20, font: 'Calibri', color: COLORS.white })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 50, after: 50 },
        })],
        shading: { type: ShadingType.SOLID, color: COLORS.primary },
        borders: createBorders(COLORS.primary),
        columnSpan: 2,
      }),
      new TableCell({
        children: [new Paragraph({
          children: [new TextRun({ text: `${totalHours}h`, bold: true, size: 22, font: 'Calibri', color: COLORS.white })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 50, after: 50 },
        })],
        shading: { type: ShadingType.SOLID, color: COLORS.primary },
        borders: createBorders(COLORS.primary),
      }),
      dataCell(`${closedCases.length} cerrados`, { color: COLORS.success, bold: true }),
      new TableCell({
        children: [new Paragraph({ children: [], spacing: { before: 50, after: 50 } })],
        borders: createBorders(),
        columnSpan: 2,
      }),
    ],
  }));

  children.push(new Table({ rows: caseRows, width: { size: 100, type: WidthType.PERCENTAGE } }));

  // ──── 3. Descripción detallada por caso ────
  children.push(sectionTitle('3. Descripción Detallada'));

  casesData.forEach(c => {
    // Case header
    children.push(new Paragraph({
      children: [
        new TextRun({ text: `${c.key}`, bold: true, size: 24, font: 'Calibri', color: COLORS.accent }),
        new TextRun({ text: ` — ${c.summary || 'Sin título'}`, size: 22, font: 'Calibri', color: COLORS.textDark }),
      ],
      spacing: { before: 200, after: 80 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: COLORS.border } },
    }));

    // Detail mini-table for this case
    const detailRows = [
      new TableRow({ children: [
        dataCell('Estado', { bold: true, width: 25, shading: COLORS.bgLight }),
        dataCell(c.status || 'Desconocido', { color: statusColor(c.status), bold: true }),
      ]}),
      new TableRow({ children: [
        dataCell('Horas consumidas', { bold: true, width: 25 }),
        dataCell(`${c.hours}h`, { bold: true, color: COLORS.accent }),
      ]}),
      new TableRow({ children: [
        dataCell('Fecha de creación', { bold: true, width: 25, shading: COLORS.bgLight }),
        dataCell(formatDate(c.created), { shading: COLORS.bgLight }),
      ]}),
      new TableRow({ children: [
        dataCell(c.resolutionDate ? 'Fecha de cierre' : 'Última actualización', { bold: true, width: 25 }),
        dataCell(c.resolutionDate ? formatDate(c.resolutionDate) : `${formatDate(c.updated)} (En progreso)`, {
          color: c.resolutionDate ? COLORS.success : COLORS.textMuted,
        }),
      ]}),
      new TableRow({ children: [
        dataCell('Prioridad', { bold: true, width: 25, shading: COLORS.bgLight }),
        dataCell(c.priority || 'Media', { shading: COLORS.bgLight }),
      ]}),
      new TableRow({ children: [
        dataCell('Asignado a', { bold: true, width: 25 }),
        dataCell(c.assignee || 'Sin asignar'),
      ]}),
    ];

    if (c.description) {
      detailRows.push(new TableRow({ children: [
        dataCell('Descripción', { bold: true, width: 25, shading: COLORS.bgLight }),
        dataCell(c.description.slice(0, 300) + (c.description.length > 300 ? '...' : ''), { shading: COLORS.bgLight }),
      ]}));
    }

    children.push(new Table({ rows: detailRows, width: { size: 100, type: WidthType.PERCENTAGE } }));

    // Recent comments summary
    if (c.comments && c.comments.length > 0) {
      children.push(new Paragraph({
        children: [new TextRun({ text: 'Actividad reciente:', bold: true, size: 19, font: 'Calibri', color: COLORS.textMuted, italics: true })],
        spacing: { before: 80, after: 40 },
      }));
      c.comments.slice(-3).forEach(cm => {
        const commentText = typeof cm.body === 'string' ? cm.body.slice(0, 200) : '';
        children.push(bulletText(`${formatDate(cm.date)} — ${cm.author}: ${commentText}`));
      });
    }
  });

  // ──── 4. Resumen de estado ────
  children.push(sectionTitle(isClosing ? '4. Logros del Bloque' : '4. Estado Actual'));

  if (closedCases.length > 0) {
    children.push(bodyText(isClosing ? 'Casos completados exitosamente:' : 'Casos finalizados:'));
    closedCases.forEach(c => {
      children.push(bulletText(`${c.key} — ${c.summary} (${c.hours}h)`, true));
    });
  }

  if (inProgressCases.length > 0) {
    children.push(new Paragraph({ spacing: { before: 120 } }));
    children.push(bodyText(isClosing ? 'Casos que quedan pendientes para el siguiente bloque:' : 'Casos en progreso:'));
    inProgressCases.forEach(c => {
      children.push(bulletText(`${c.key} — ${c.summary} (${c.hours}h)`));
    });
  }

  // ──── Build document ────
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 22, color: COLORS.textDark },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          margin: { top: 1000, right: 900, bottom: 1000, left: 900 },
        },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            children: [
              new TextRun({ text: `Reporte de ${isClosing ? 'Cierre' : 'Avance'} · ${period.label}`, size: 16, font: 'Calibri', color: COLORS.textMuted, italics: true }),
            ],
            alignment: AlignmentType.RIGHT,
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            children: [
              new TextRun({ text: 'Página ', size: 16, font: 'Calibri', color: COLORS.textMuted }),
              new TextRun({ children: [PageNumber.CURRENT], size: 16, font: 'Calibri', color: COLORS.textMuted }),
              new TextRun({ text: ' de ', size: 16, font: 'Calibri', color: COLORS.textMuted }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, font: 'Calibri', color: COLORS.textMuted }),
            ],
            alignment: AlignmentType.CENTER,
          })],
        }),
      },
      children,
    }],
  });

  return Packer.toBuffer(doc);
}

module.exports = { generateBlockReportDocx };
