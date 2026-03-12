const express = require('express');
const router = express.Router();
const jira = require('../lib/jira-client');
const { generateActivityReport, generateBlockReport } = require('../lib/gemini');
const { generateBlockReportDocx } = require('../lib/docx-generator');

// ===== PENDING DEPLOYS: En Validación + PR-request comment =====
const DEPLOY_COMMENT_KEYWORDS = [
  /pr\s+en\s+producci[oó]n/i,
  /generando\s+el\s+pr/i,
  /paso\s+a\s+producci[oó]n/i,
  /deploy\s+(?:a\s+)?producci[oó]n/i,
  /subir\s+a\s+prod/i,
  /se\s+aplicar[aá]/i,
  /aplicar\s+(?:el\s+)?(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|\d{1,2}\/\d{1,2})/i,
];

function extractDeployDate(text) {
  const now = new Date();
  const year = now.getFullYear();
  // Full datetime: 13/03 9:00am  or  13/03/2026 09:00
  const fdtRe = /(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\s+(\d{1,2}:\d{2}\s*(?:am|pm|hrs?)?)/i;
  let m = text.match(fdtRe);
  if (m) {
    const y = m[3] ? (m[3].length === 2 ? 2000 + parseInt(m[3]) : parseInt(m[3])) : year;
    const d = new Date(y, parseInt(m[2]) - 1, parseInt(m[1]));
    if (!isNaN(d.getTime())) {
      const [h, rest] = m[4].split(':');
      let hours = parseInt(h);
      const mins = parseInt(rest) || 0;
      if (/pm/i.test(m[4]) && hours < 12) hours += 12;
      d.setHours(hours, mins, 0, 0);
      return d.toISOString();
    }
  }
  // Date only
  m = text.match(/(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/);
  if (m) {
    const y = m[3] ? (m[3].length === 2 ? 2000 + parseInt(m[3]) : parseInt(m[3])) : year;
    const d = new Date(y, parseInt(m[2]) - 1, parseInt(m[1]));
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  // Weekday reference
  const dayMap = { lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6, domingo: 0 };
  const normalize = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  m = text.match(/(?:el\s+)?(?:pr[oó]ximo\s+|siguiente\s+)?(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)/i);
  if (m) {
    const key = normalize(m[1]);
    if (dayMap[key] !== undefined) {
      const d = new Date(now);
      const diff = (dayMap[key] - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + diff);
      d.setHours(0, 0, 0, 0);
      return d.toISOString();
    }
  }
  return null;
}

router.get('/pending-deploys', async (req, res) => {
  try {
    const { project = 'PY06809' } = req.query;
    const jql = `project = "${project}" AND status = "En Validación" ORDER BY updated DESC`;
    const params = new URLSearchParams({
      jql,
      maxResults: 50,
      fields: 'summary,status,assignee,priority,comment,updated',
    });

    const data = await jira.get(jira.restApi(`/search?${params}`));
    const results = [];

    for (const issue of (data.issues || [])) {
      const comments = issue.fields?.comment?.comments || [];
      let matchedComment = null;
      let deployDate = null;

      // Scan from latest comment backwards
      for (const c of comments.slice().reverse()) {
        const text = typeof c.body === 'string' ? c.body : extractTextFromAdf(c.body);
        const hasKeyword = DEPLOY_COMMENT_KEYWORDS.some(re => re.test(text));
        if (hasKeyword) {
          matchedComment = {
            author: c.author?.displayName || c.author?.emailAddress || 'Desconocido',
            date: c.created,
            snippet: text.trim().slice(0, 160),
          };
          deployDate = extractDeployDate(text);
          break;
        }
      }

      if (matchedComment) {
        results.push({
          key: issue.key,
          summary: issue.fields?.summary,
          status: issue.fields?.status?.name,
          assignee: issue.fields?.assignee?.displayName || null,
          assigneeInitial: issue.fields?.assignee?.displayName?.charAt(0)?.toUpperCase() || null,
          updated: issue.fields?.updated,
          deployDate,
          comment: matchedComment,
        });
      }
    }

    res.json({ total: results.length, issues: results });
  } catch (err) {
    console.error('Pending deploys error:', err);
    res.status(err.status || 500).json({ error: err.message, body: err.body });
  }
});

// Summary report: issues grouped by status, priority, assignee
router.get('/summary', async (req, res) => {


  try {
    const { project, dateFrom, dateTo } = req.query;
    let jql = project ? `project = "${project}"` : '';

    // Filter by updated date so we see all tasks active in the block,
    // not just those created in that period.
    if (dateFrom) {
      jql += (jql ? ' AND ' : '') + `updated >= "${dateFrom}"`;
    }
    if (dateTo) {
      jql += (jql ? ' AND ' : '') + `updated <= "${dateTo} 23:59"`;
    }

    const params = new URLSearchParams({
      jql,
      maxResults: 1000,
      fields: 'status,priority,assignee,issuetype,created,updated,resolutiondate',
    });

    const data = await jira.get(jira.restApi(`/search?${params}`));

    const byStatus = {};
    const byPriority = {};
    const byAssignee = {};
    const byType = {};

    (data.issues || []).forEach(issue => {
      const status = issue.fields?.status?.name || 'Unknown';
      const priority = issue.fields?.priority?.name || 'None';
      const assignee = issue.fields?.assignee?.displayName || 'Unassigned';
      const type = issue.fields?.issuetype?.name || 'Unknown';

      byStatus[status] = (byStatus[status] || 0) + 1;
      byPriority[priority] = (byPriority[priority] || 0) + 1;
      byAssignee[assignee] = (byAssignee[assignee] || 0) + 1;
      byType[type] = (byType[type] || 0) + 1;
    });

    res.json({
      total: data.total,
      byStatus: Object.entries(byStatus).map(([name, count]) => ({ name, count })),
      byPriority: Object.entries(byPriority).map(([name, count]) => ({ name, count })),
      byAssignee: Object.entries(byAssignee).map(([name, count]) => ({ name, count })),
      byType: Object.entries(byType).map(([name, count]) => ({ name, count })),
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, body: err.body });
  }
});

// Created vs Resolved over time
router.get('/created-vs-resolved', async (req, res) => {
  try {
    const { project, dateFrom, dateTo, interval = 'day' } = req.query;

    let createdJql = project ? `project = "${project}" AND ` : '';
    if (dateFrom) createdJql += `created >= "${dateFrom}" AND `;
    if (dateTo) createdJql += `created <= "${dateTo}" AND `;
    createdJql = createdJql.replace(/ AND $/, '') || 'created >= -30d';

    const createdParams = new URLSearchParams({
      jql: createdJql,
      maxResults: 1000,
      fields: 'created,resolutiondate',
    });

    const data = await jira.get(jira.restApi(`/search?${createdParams}`));

    const createdMap = {};
    const resolvedMap = {};

    (data.issues || []).forEach(issue => {
      const createdDate = formatDate(issue.fields?.created, interval);
      const resolvedDate = issue.fields?.resolutiondate
        ? formatDate(issue.fields.resolutiondate, interval)
        : null;

      createdMap[createdDate] = (createdMap[createdDate] || 0) + 1;
      if (resolvedDate) {
        resolvedMap[resolvedDate] = (resolvedMap[resolvedDate] || 0) + 1;
      }
    });

    const allDates = [...new Set([...Object.keys(createdMap), ...Object.keys(resolvedMap)])].sort();
    const timeline = allDates.map(date => ({
      date,
      created: createdMap[date] || 0,
      resolved: resolvedMap[date] || 0,
    }));

    res.json({ total: data.total, timeline });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, body: err.body });
  }
});

// Worklog report
router.get('/worklog', async (req, res) => {
  try {
    const { project, dateFrom, dateTo } = req.query;
    let jql = project ? `project = "${project}"` : '';
    if (dateFrom) jql += (jql ? ' AND ' : '') + `worklogDate >= "${dateFrom}"`;
    if (dateTo) jql += (jql ? ' AND ' : '') + `worklogDate <= "${dateTo}"`;

    if (!jql) jql = 'timespent > 0';

    const params = new URLSearchParams({
      jql,
      maxResults: 200,
      fields: 'summary,worklog,assignee',
    });

    const data = await jira.get(jira.restApi(`/search?${params}`));

    const entries = [];
    (data.issues || []).forEach(issue => {
      const worklogs = issue.fields?.worklog?.worklogs || [];
      worklogs.forEach(wl => {
        entries.push({
          issueKey: issue.key,
          summary: issue.fields?.summary,
          author: wl.author?.displayName || 'Unknown',
          timeSpentSeconds: wl.timeSpentSeconds,
          timeSpent: wl.timeSpent,
          started: wl.started,
        });
      });
    });

    res.json({ total: entries.length, entries });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, body: err.body });
  }
});

// ===== AI ACTIVITY REPORT =====
router.get('/activity-report', async (req, res) => {
  try {
    const { project, dateFrom, dateTo, dateTimeFrom, dateTimeTo } = req.query;

    // Support exact datetime or date-only params
    let jqlFrom, jqlTo, filterFrom, filterTo;

    if (dateTimeFrom && dateTimeTo) {
      // Exact datetime: "2026-03-09 08:45" format for JQL
      jqlFrom = dateTimeFrom;
      jqlTo = dateTimeTo;
      filterFrom = new Date(dateTimeFrom.replace(' ', 'T'));
      filterTo = new Date(dateTimeTo.replace(' ', 'T'));
    } else if (dateFrom && dateTo) {
      jqlFrom = dateFrom;
      jqlTo = `${dateTo} 23:59`;
      filterFrom = new Date(dateFrom);
      filterFrom.setHours(0, 0, 0, 0);
      filterTo = new Date(dateTo);
      filterTo.setHours(23, 59, 59, 999);
    } else {
      return res.status(400).json({ error: 'Se requiere dateFrom/dateTo o dateTimeFrom/dateTimeTo' });
    }

    // 1. Search for issues UPDATED in the date range
    let jql = `updated >= "${jqlFrom}" AND updated <= "${jqlTo}"`;
    if (project) {
      jql = `project = "${project}" AND ${jql}`;
    }

    const params = new URLSearchParams({
      jql,
      maxResults: 100,
      fields: 'summary,status,assignee,priority,issuetype,created,updated,comment,project',
      expand: 'changelog',
    });

    console.log(`🤖 Generating activity report: ${jqlFrom} → ${jqlTo}`);
    const data = await jira.get(jira.restApi(`/search?${params}`));

    if (!data.issues || data.issues.length === 0) {
      return res.json({
        report: '## Sin actividades\n\nNo se encontraron tareas actualizadas en el período seleccionado.',
        issuesAnalyzed: 0,
        raw: [],
      });
    }

    // 2. Extract relevant changes per issue within the date range
    const fromDate = filterFrom;
    const toDate = filterTo;

    const activitiesData = data.issues.map(issue => {
      const changelog = issue.changelog?.histories || [];

      // Filter changelog entries within the date range
      const relevantChanges = changelog
        .filter(h => {
          const changeDate = new Date(h.created);
          return changeDate >= fromDate && changeDate <= toDate;
        })
        .map(h => ({
          date: h.created,
          author: h.author?.displayName || 'Desconocido',
          changes: h.items.map(item => ({
            field: item.field,
            from: item.fromString || item.from,
            to: item.toString || item.to,
          })),
        }));

      // Filter comments within the date range
      const comments = (issue.fields?.comment?.comments || [])
        .filter(c => {
          const commentDate = new Date(c.created);
          return commentDate >= fromDate && commentDate <= toDate;
        })
        .map(c => ({
          date: c.created,
          author: c.author?.displayName || 'Desconocido',
          body: typeof c.body === 'string' ? c.body : extractTextFromAdf(c.body),
        }));

      return {
        key: issue.key,
        summary: issue.fields?.summary,
        status: issue.fields?.status?.name,
        priority: issue.fields?.priority?.name,
        type: issue.fields?.issuetype?.name,
        assignee: issue.fields?.assignee?.displayName || 'Sin asignar',
        project: issue.fields?.project?.name,
        changes: relevantChanges,
        comments,
      };
    }).filter(a => a.changes.length > 0 || a.comments.length > 0);

    console.log(`📊 Found ${activitiesData.length} issues with activity in range`);

    // 3. Send to Gemini for report generation
    const report = await generateActivityReport(
      activitiesData,
      { dateFrom, dateTo },
      data.issues[0]?.fields?.assignee?.displayName
    );

    res.json({
      report,
      issuesAnalyzed: activitiesData.length,
      totalIssuesInRange: data.total,
      raw: activitiesData,
    });
  } catch (err) {
    console.error('Activity report error:', err);
    res.status(err.status || 500).json({ error: err.message, body: err.body });
  }
});

function extractTextFromAdf(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (node.text) return node.text;
  if (node.content) return node.content.map(extractTextFromAdf).join(' ');
  return '';
}

function formatDate(dateStr, interval) {
  if (!dateStr) return 'Unknown';
  const d = new Date(dateStr);
  switch (interval) {
    case 'week': {
      const start = new Date(d);
      start.setDate(d.getDate() - d.getDay());
      return start.toISOString().slice(0, 10);
    }
    case 'month':
      return d.toISOString().slice(0, 7);
    case 'day':
    default:
      return d.toISOString().slice(0, 10);
  }
}

// ===== BLOCK REPORT (AVANCE / CIERRE) =====
router.post('/block-report', async (req, res) => {
  try {
    const { type, period, cases } = req.body;
    // type: 'avance' or 'cierre'
    // period: { label, months, year }
    // cases: [{ key, hours }]

    if (!type || !period || !cases?.length) {
      return res.status(400).json({ error: 'Se requiere type, period y cases' });
    }

    console.log(`📊 Generating ${type} report for ${period.label} with ${cases.length} cases`);

    // Fetch details for each case from Jira
    const caseDetails = await Promise.all(
      cases.map(async (c) => {
        try {
          const issue = await jira.get(jira.restApi(`/issue/${c.key}?expand=changelog&fields=summary,status,assignee,priority,issuetype,created,updated,comment,description,resolution,resolutiondate`));

          // Extract comments
          const comments = (issue.fields?.comment?.comments || [])
            .slice(-10) // Last 10 comments
            .map(cm => ({
              date: cm.created,
              author: cm.author?.displayName || 'Desconocido',
              body: typeof cm.body === 'string' ? cm.body : extractTextFromAdf(cm.body),
            }));

          // Extract changelog summary
          const changelogSummary = (issue.changelog?.histories || [])
            .slice(-15) // Last 15 changes
            .map(h => ({
              date: h.created,
              author: h.author?.displayName || 'Desconocido',
              changes: h.items.map(item => `${item.field}: ${item.fromString || ''} → ${item.toString || ''}`).join(', '),
            }));

          return {
            key: c.key,
            hours: c.hours,
            summary: issue.fields?.summary || 'Sin título',
            status: issue.fields?.status?.name || 'Desconocido',
            priority: issue.fields?.priority?.name || 'Media',
            type: issue.fields?.issuetype?.name || 'Task',
            assignee: issue.fields?.assignee?.displayName || 'Sin asignar',
            resolution: issue.fields?.resolution?.name || null,
            resolutionDate: issue.fields?.resolutiondate || null,
            created: issue.fields?.created,
            updated: issue.fields?.updated,
            description: typeof issue.fields?.description === 'string'
              ? issue.fields.description.slice(0, 500)
              : extractTextFromAdf(issue.fields?.description)?.slice(0, 500) || '',
            comments,
            recentChanges: changelogSummary,
          };
        } catch (err) {
          console.warn(`⚠️ Could not fetch ${c.key}: ${err.message}`);
          return {
            key: c.key,
            hours: c.hours,
            summary: `No se pudo obtener detalles (${err.message})`,
            status: 'Desconocido',
            comments: [],
            recentChanges: [],
          };
        }
      })
    );

    // Use the configured user (the one generating the report), not the ticket assignee
    const userName = process.env.JIRA_EMAIL || caseDetails.find(c => c.assignee && c.assignee !== 'Sin asignar')?.assignee;

    // Generate report with Gemini
    const report = await generateBlockReport(type, period, caseDetails, userName);

    res.json({
      report,
      type,
      period,
      casesCount: cases.length,
      totalHours: cases.reduce((sum, c) => sum + (c.hours || 0), 0),
      raw: caseDetails,
    });
  } catch (err) {
    console.error('Block report error:', err);
    res.status(err.status || 500).json({ error: err.message, body: err.body });
  }
});

// ===== BLOCK REPORT WORD EXPORT (two-step: POST to generate, GET to download) =====


// Step 1: POST — generate the DOCX, store it, return downloadId
router.post('/block-report/docx', async (req, res) => {
  try {
    const { type, period, cases } = req.body;
    if (!type || !period || !cases?.length) {
      return res.status(400).json({ error: 'Se requiere type, period y cases' });
    }

    console.log(`📄 Generating ${type} DOCX report for ${period.label}`);

    const caseDetails = await Promise.all(
      cases.map(async (c) => {
        try {
          const issue = await jira.get(jira.restApi(`/issue/${c.key}?expand=changelog&fields=summary,status,assignee,priority,issuetype,created,updated,comment,description,resolution,resolutiondate`));
          const comments = (issue.fields?.comment?.comments || [])
            .slice(-10)
            .map(cm => ({
              date: cm.created,
              author: cm.author?.displayName || 'Desconocido',
              body: typeof cm.body === 'string' ? cm.body : extractTextFromAdf(cm.body),
            }));
          return {
            key: c.key,
            hours: c.hours,
            summary: issue.fields?.summary || 'Sin título',
            status: issue.fields?.status?.name || 'Desconocido',
            priority: issue.fields?.priority?.name || 'Media',
            type: issue.fields?.issuetype?.name || 'Task',
            assignee: issue.fields?.assignee?.displayName || 'Sin asignar',
            resolution: issue.fields?.resolution?.name || null,
            resolutionDate: issue.fields?.resolutiondate || null,
            created: issue.fields?.created,
            updated: issue.fields?.updated,
            description: typeof issue.fields?.description === 'string'
              ? issue.fields.description.slice(0, 500)
              : extractTextFromAdf(issue.fields?.description)?.slice(0, 500) || '',
            comments,
          };
        } catch (err) {
          return { key: c.key, hours: c.hours, summary: `Error: ${err.message}`, status: 'Desconocido', comments: [] };
        }
      })
    );

    const userName = process.env.JIRA_EMAIL || 'No especificado';
    const totalHours = cases.reduce((sum, c) => sum + (c.hours || 0), 0);
    const buffer = await generateBlockReportDocx(type, period, caseDetails, totalHours, userName);

    var monthFrom = (period.months && period.months[0]) || 'Mes1';
    var monthTo = (period.months && period.months[1]) || 'Mes2';
    var yr = period.year || new Date().getFullYear();
    var rType = type === 'cierre' ? 'Cierre' : 'Avance';
    var filename = 'Reporte_' + rType + '_' + monthFrom + '_' + monthTo + '_' + yr + '.docx';

    // Save to downloads directory on disk
    const fs = require('fs');
    const path = require('path');
    const downloadsDir = path.join(__dirname, '..', 'downloads');
    if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

    const filePath = path.join(downloadsDir, filename);
    fs.writeFileSync(filePath, buffer);

    // Also copy to user's macOS Downloads folder for easy access
    const userDownloads = path.join(require('os').homedir(), 'Downloads', filename);
    fs.copyFileSync(filePath, userDownloads);

    const relativeUrl = '/downloads/' + encodeURIComponent(filename);

    console.log('📄 DOCX saved: ' + filePath + ' (' + buffer.length + ' bytes)');
    console.log('📄 Also copied to: ' + userDownloads);
    res.json({ url: relativeUrl, filename: filename, savedTo: userDownloads });
  } catch (err) {
    console.error('Block report DOCX error:', err);
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;

