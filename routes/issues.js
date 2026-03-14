const express = require('express');
const router = express.Router();
const jira = require('../lib/jira-client');
const multer = require('multer');
const fs = require('fs');
const { parseTimeFromComments, detectWarrantyFromComments } = require('../lib/timeParser');

const upload = multer({ dest: '/tmp/jira-uploads/' });

// Search issues via JQL
router.get('/', async (req, res) => {
  try {
    const { jql = '', startAt = 0, maxResults = 50, fields } = req.query;
    const params = new URLSearchParams({
      jql,
      startAt,
      maxResults,
      fields: fields || 'summary,status,assignee,priority,issuetype,created,updated,duedate,labels,project,comment',
    });
    const data = await jira.get(jira.restApi(`/search?${params}`));
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, body: err.body });
  }
});

// List all "block" issues with their child task counts
// NOTE: must be before /:key to avoid Express matching 'blocks' as a key
// LINK_TYPE_ID: 10304 = "multi-level hierarchy [GANTT]" — inward: "is subtask of" / outward: "is parent task of"
const BLOCK_LINK_TYPE_ID = '10304';

// Helper: normalize a Jira issue to a flat child record
function normalizeChild(issue) {
  const f = issue.fields || {};
  const comments = f.comment?.comments || [];
  const timeInfo = parseTimeFromComments(comments);
  // Detect warranty via comments OR Jira's native flag (customfield_10200 = [{value:'Impedimento'}])
  const isFlagged = Array.isArray(f.customfield_10200) && f.customfield_10200.length > 0;
  const isWarrantyComment = detectWarrantyFromComments(comments);
  const isWarranty = isFlagged || isWarrantyComment;
  return {
    key: issue.key,
    summary: f.summary,
    status: f.status?.name,
    statusCategory: f.status?.statusCategory?.key,
    assignee: f.assignee?.displayName || f.fields?.assignee?.displayName || null,
    assigneeInitial: (f.assignee?.displayName || f.fields?.assignee?.displayName || '').charAt(0).toUpperCase() || null,
    priority: f.priority?.name || null,
    updated: f.updated,
    parentKey: f.parent?.key || null,
    via: 'parent',
    timeInfo,    // { estimated, executed, remaining } or null
    isWarranty,  // true if flagged in Jira OR any comment contains "garantia"
    isFlagged,   // true if Jira native flag (customfield_10200) is set
  };
}

router.get('/blocks', async (req, res) => {
  try {
    const { project = 'PY06809' } = req.query;

    // Fetch all block-type tasks — include issuelinks so we can read block assignments
    // NOTE: we build the URL manually for the fields param because URLSearchParams encodes
    // commas as %2C which Jira Server does not accept for multi-value fields.
    const jql = `project = "${project}" AND issuetype = Task AND summary ~ "bloque" ORDER BY created ASC`;
    const blockFields = 'summary,status,created,updated,issuelinks';
    const blockUrl = jira.restApi(`/search?jql=${encodeURIComponent(jql)}&maxResults=50&fields=${blockFields}`);
    const blockData = await jira.get(blockUrl);
    const blocks = blockData.issues || [];

    // For each block, fetch children from BOTH the parent field AND issue links (type 10304)
    const result = await Promise.all(blocks.map(async (block) => {
      try {
        const childrenMap = new Map(); // key → child record (deduplication)

        // Source 1: sub-tasks via Jira parent field (include comment for time parsing)
        const childJql = `parent = "${block.key}" ORDER BY updated DESC`;
        const childUrl = jira.restApi(
          `/search?jql=${encodeURIComponent(childJql)}&maxResults=100&fields=summary,status,assignee,priority,updated,parent,comment,labels,customfield_10200`
        );
        const childData = await jira.get(childUrl);
        for (const c of (childData.issues || [])) {
          childrenMap.set(c.key, normalizeChild(c));
        }

        // Source 2: issue links of type 10304 (multi-level hierarchy / "is subtask of")
        // The block's issuelinks returned from the search include inward issues (tasks)
        const blockLinks = block.fields?.issuelinks || [];
        const linkedTaskKeys = blockLinks
          .filter(l => l.type?.id === BLOCK_LINK_TYPE_ID && l.inwardIssue?.key)
          .map(l => l.inwardIssue.key)
          .filter(k => !childrenMap.has(k)); // only fetch issues not already in map

        if (linkedTaskKeys.length > 0) {
          // Batch-fetch all linked tasks in one JQL call (include comment for time parsing)
          const linkedJql = `issue in (${linkedTaskKeys.map(k => `"${k}"`).join(',')})`;
          const linkedUrl = jira.restApi(
            `/search?jql=${encodeURIComponent(linkedJql)}&maxResults=${linkedTaskKeys.length}&fields=summary,status,assignee,priority,updated,parent,comment,labels,customfield_10200`
          );
          try {
            const linkedData = await jira.get(linkedUrl);
            for (const c of (linkedData.issues || [])) {
              const child = normalizeChild(c);
              child.via = 'link';
              childrenMap.set(c.key, child);
            }
          } catch (linkErr) {
            console.error(`Block ${block.key} linked fetch error:`, linkErr.message);
          }
        }

        // Mark already-in-map (via parent) tasks that also have a block link
        for (const l of blockLinks) {
          if (l.type?.id === BLOCK_LINK_TYPE_ID && l.inwardIssue?.key) {
            const k = l.inwardIssue.key;
            if (childrenMap.has(k) && childrenMap.get(k).via === 'parent') {
              childrenMap.get(k).via = 'both';
            }
          }
        }

        const children = Array.from(childrenMap.values());
        const incomplete = children.filter(c => c.statusCategory !== 'done');

        return {
          key: block.key,
          summary: block.fields?.summary,
          status: block.fields?.status?.name,
          created: block.fields?.created,
          totalTasks: children.length,
          incompleteTasks: incomplete.length,
          children,
        };
      } catch (blockErr) {
        console.error(`Block ${block.key} error:`, blockErr.message);
        return { key: block.key, summary: block.fields?.summary, totalTasks: 0, incompleteTasks: 0, children: [] };
      }
    }));

    res.json({ total: result.length, blocks: result });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, body: err.body });
  }
});


// ── Cross-block warranty scan ─────────────────────────────────────────────────
// GET /issues/blocks/warranty?project=PY06809
// Returns all tasks across ALL blocks that are marked as warranty (flagged or comment-detected)
// NOTE: must be BEFORE /:key to avoid Express matching 'blocks' as a key → already covered
router.get('/blocks/warranty', async (req, res) => {
  try {
    const { project = 'PY06809' } = req.query;

    // Use JQL to find flagged issues (Jira native flag = customfield_10200 = Impedimento)
    // AND/OR issues with comments containing "garantia" — we do both queries and merge
    const flaggedJql = `project = "${project}" AND "Flagged" in ("Impedimento") ORDER BY updated DESC`;
    const flaggedUrl = jira.restApi(
      `/search?jql=${encodeURIComponent(flaggedJql)}&maxResults=50&fields=summary,status,assignee,priority,updated,parent,comment,customfield_10200,issuelinks`
    );

    let warrantyTasks = [];
    const seenKeys = new Set();

    try {
      const flaggedData = await jira.get(flaggedUrl);
      for (const issue of (flaggedData.issues || [])) {
        if (!seenKeys.has(issue.key)) {
          seenKeys.add(issue.key);
          const child = normalizeChild(issue);
          // Find which block this task belongs to via parent or issuelinks
          const parentKey = issue.fields?.parent?.key || null;
          const blockLink = (issue.fields?.issuelinks || [])
            .find(l => l.type?.id === BLOCK_LINK_TYPE_ID && l.outwardIssue?.key)
            ?.outwardIssue?.key || null;
          warrantyTasks.push({
            ...child,
            blockKey: blockLink || parentKey,
          });
        }
      }
    } catch (e) {
      console.log('ℹ️  Flagged JQL failed (may not be supported):', e.message);
    }

    res.json({ total: warrantyTasks.length, warrantyTasks });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, body: err.body });
  }
});






// Proxy Jira attachment images (avoids CORS / auth issues in the browser)
// NOTE: This must be BEFORE /:key to avoid Express matching 'attachment-proxy' as an issue key
router.get('/attachment-proxy', async (req, res) => {
  try {
    const targetUrl = req.query.url;
    if (!targetUrl) {
      return res.status(400).json({ error: 'Missing url parameter' });
    }

    // Security: only proxy URLs that belong to the configured Jira instance
    if (!targetUrl.startsWith(jira.baseUrl)) {
      return res.status(403).json({ error: 'URL not allowed' });
    }

    const fetch = require('node-fetch');
    const fetchOptions = {
      method: 'GET',
      headers: {
        'Authorization': jira.authHeader,
      },
    };

    // Disable SSL verification for self-signed certs (Jira Server)
    if (jira.isServer) {
      const https = require('https');
      fetchOptions.agent = new https.Agent({ rejectUnauthorized: false });
    }

    const upstream = await fetch(targetUrl, fetchOptions);

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Jira returned ${upstream.status}` });
    }

    // Forward content-type so browser renders the image correctly
    const contentType = upstream.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);

    // Cache for 1 hour to avoid hammering Jira
    res.setHeader('Cache-Control', 'private, max-age=3600');

    upstream.body.pipe(res);
  } catch (err) {
    console.error('Attachment proxy error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Time info extracted from comments — must be BEFORE /:key
router.get('/:key/time-info', async (req, res) => {
  try {
    const data = await jira.get(jira.restApi(`/issue/${req.params.key}?fields=comment,timetracking,summary`));
    const comments = data.fields?.comment?.comments || [];
    const timeInfo = parseTimeFromComments(comments);
    const nativeTracking = data.fields?.timetracking || {};
    res.json({
      key: req.params.key,
      summary: data.fields?.summary,
      timeInfo,
      native: {
        originalEstimate: nativeTracking.originalEstimate || null,
        timeSpent: nativeTracking.timeSpent || null,
        remainingEstimate: nativeTracking.remainingEstimate || null,
      },
      commentCount: comments.length,
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ── Activity Feed — recent updates by other users ──────────────────────────
// NOTE: Must be BEFORE /:key to avoid Express matching 'activity-feed' as a key
router.get('/activity-feed', async (req, res) => {
  try {
    const { project = 'PY06809', days = 5, maxResults = 30 } = req.query;

    // JQL: issues updated in the last N days
    const jql = `project = "${project}" AND updated >= -${days}d ORDER BY updated DESC`;
    const fields = 'summary,status,assignee,updated,comment,priority';
    const url = jira.restApi(
      `/search?jql=${encodeURIComponent(jql)}&maxResults=${maxResults}&fields=${fields}&expand=changelog`
    );
    const data = await jira.get(url);
    const issues = data.issues || [];

    const entries = [];

    for (const issue of issues) {
      const key = issue.key;
      const summary = issue.fields?.summary || key;
      const issuePriority = issue.fields?.priority?.name || null;
      const issueStatus = issue.fields?.status?.name || null;
      const histories = issue.changelog?.histories || [];

      for (const history of histories) {
        const author = history.author || {};
        // Build a stable entry ID
        const entryId = history.id;
        const created = history.created;

        // Summarize what changed in this history entry
        const items = (history.items || []).map(item => ({
          field: item.field,
          from: item.fromString || item.from || null,
          to: item.toString || item.to || null,
        }));

        if (items.length === 0) continue;

        entries.push({
          id: `${key}-${entryId}`,
          issueKey: key,
          issueSummary: summary,
          issueStatus,
          issuePriority,
          author: {
            displayName: author.displayName || author.name || 'Usuario desconocido',
            email: author.emailAddress || author.name || '',
            avatarUrl: author.avatarUrls?.['24x24'] || null,
          },
          created,
          items,
          type: items.some(i => i.field === 'status') ? 'status'
              : items.some(i => i.field === 'assignee') ? 'assignee'
              : items.some(i => i.field === 'Attachment') ? 'attachment'
              : 'field',
        });
      }

      // Also include recent comments as activity entries
      const comments = issue.fields?.comment?.comments || [];
      for (const comment of comments) {
        const commentDate = new Date(comment.updated || comment.created);
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - parseInt(days, 10));
        if (commentDate < cutoff) continue;

        const author = comment.updateAuthor || comment.author || {};
        const entryId = `c${comment.id}`;

        // Extract plain text body (Jira Server returns strings, Cloud returns ADF)
        const extractText = (node) => {
          if (!node) return '';
          if (typeof node === 'string') return node.slice(0, 200);
          if (node.text) return node.text;
          if (node.content) return node.content.map(extractText).join(' ');
          return '';
        };
        const bodyPreview = extractText(comment.body).trim().slice(0, 200);

        entries.push({
          id: `${key}-${entryId}`,
          issueKey: key,
          issueSummary: summary,
          issueStatus,
          issuePriority,
          author: {
            displayName: author.displayName || author.name || 'Usuario desconocido',
            email: author.emailAddress || author.name || '',
            avatarUrl: author.avatarUrls?.['24x24'] || null,
          },
          created: comment.updated || comment.created,
          items: [{ field: 'comment', from: null, to: bodyPreview }],
          type: 'comment',
          commentId: comment.id,
        });
      }
    }

    // Sort all entries by date descending
    entries.sort((a, b) => new Date(b.created) - new Date(a.created));

    res.json({ total: entries.length, entries });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, body: err.body });
  }
});

// Get single issue
router.get('/:key', async (req, res) => {
  try {
    const data = await jira.get(jira.restApi(`/issue/${req.params.key}?expand=changelog,renderedFields`));
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, body: err.body });
  }
});


// Create issue
router.post('/', async (req, res) => {
  try {
    const data = await jira.post(jira.restApi('/issue'), req.body);
    res.status(201).json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, body: err.body });
  }
});

// Update issue
router.put('/:key', async (req, res) => {
  try {
    await jira.put(jira.restApi(`/issue/${req.params.key}`), req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, body: err.body });
  }
});

// Move task to a different parent block
// Jira Server does NOT allow editing the parent field of a sub-task via REST.
// We work around this by managing "block assignment" as an issue link (type 10304).
// This endpoint: removes existing block link from the task, then creates a new one.
router.put('/:key/parent', async (req, res) => {
  try {
    const { parentKey } = req.body;
    if (!parentKey) return res.status(400).json({ error: 'parentKey required' });
    const issueKey = req.params.key;

    // Step 1: Remove any existing block-assignment links (type 10304) from this task
    try {
      const issueData = await jira.get(jira.restApi(`/issue/${issueKey}?fields=issuelinks`));
      const existingLinks = issueData.fields?.issuelinks || [];
      for (const link of existingLinks) {
        if (link.type?.id === BLOCK_LINK_TYPE_ID) {
          // Delete this link
          try {
            await jira.delete(jira.restApi(`/issueLink/${link.id}`));
          } catch { /* ignore delete errors */ }
        }
      }
    } catch { /* continue even if we can't clean up old links */ }

    // Step 2: Create new "is subtask of" link: task → new block
    await jira.post(jira.restApi('/issueLink'), {
      type: { id: BLOCK_LINK_TYPE_ID },
      inwardIssue: { key: issueKey },   // task "is subtask of"
      outwardIssue: { key: parentKey }, // → new block ("is parent task of")
    });

    res.json({ success: true, method: 'issueLink', linkType: BLOCK_LINK_TYPE_ID });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, body: err.body });
  }
});


// ── Warranty toggle ───────────────────────────────────────────────────────
// POST /issues/:key/warranty  { warranty: true }  → adds a comment "Caso en Garantia"
// POST /issues/:key/warranty  { warranty: false } → (no-op; comment history is immutable)
// The frontend toggles the UI optimistically; the source of truth is the comments.
router.post('/:key/warranty', async (req, res) => {
  try {
    const issueKey = req.params.key;
    const { warranty } = req.body;

    if (warranty) {
      // Add the canonical warranty marker comment
      const markerText =
        '{color:#f4f5f7}[SCv2:warranty]{color}\n' +
        'h2. 🛡️ Caso en Garantia\n\n' +
        'Este caso fue reportado como cubierto en el bloque anterior. ' +
        'Se arrastra como caso en garantía — las horas ejecutadas *no se descuentan* de la bolsa del bloque actual.\n';

      const data = await jira.post(jira.restApi(`/issue/${issueKey}/comment`), {
        body: markerText,
      });
      res.json({ success: true, action: 'marked', commentId: data.id });
    } else {
      // Jira comments are immutable via REST — we cannot delete them.
      // The frontend will handle this by re-fetching and the warranty detection
      // will return false if no warranty comment is present.
      // To truly unmark, the user must delete the comment manually in Jira.
      res.json({ success: true, action: 'unmark_not_supported',
        message: 'Para quitar la garantía, elimina el comentario de garantía desde Jira directamente.' });
    }
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, body: err.body });
  }
});


// Get transitions

router.get('/:key/transitions', async (req, res) => {
  try {
    const data = await jira.get(jira.restApi(`/issue/${req.params.key}/transitions`));
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, body: err.body });
  }
});

// Execute transition (change status)
router.post('/:key/transitions', async (req, res) => {
  try {
    await jira.post(jira.restApi(`/issue/${req.params.key}/transitions`), req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, body: err.body });
  }
});

// Add comment
router.post('/:key/comment', async (req, res) => {
  try {
    // For Jira Server (API v2), comments are plain text
    let body = req.body;
    if (jira.isServer && req.body?.body?.type === 'doc') {
      // Convert ADF to plain text for v2
      const extractText = (node) => {
        if (!node) return '';
        if (node.text) return node.text;
        if (node.content) return node.content.map(extractText).join('');
        return '';
      };
      body = { body: extractText(req.body.body) };
    }
    const data = await jira.post(jira.restApi(`/issue/${req.params.key}/comment`), body);
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, body: err.body });
  }
});

// Update existing comment
router.put('/:key/comment/:commentId', async (req, res) => {
  try {
    let body = req.body;
    // For Jira Server (API v2), comments are plain text
    if (jira.isServer && req.body?.body?.type === 'doc') {
      const extractText = (node) => {
        if (!node) return '';
        if (node.text) return node.text;
        if (node.content) return node.content.map(extractText).join('');
        return '';
      };
      body = { body: extractText(req.body.body) };
    }
    const data = await jira.put(
      jira.restApi(`/issue/${req.params.key}/comment/${req.params.commentId}`),
      body
    );
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, body: err.body });
  }
});

// Upload attachment
router.post('/:key/attachments', upload.array('files'), async (req, res) => {
  try {
    const FormData = require('form-data');
    const results = [];
    for (const file of req.files) {
      const form = new FormData();
      form.append('file', fs.createReadStream(file.path), file.originalname);
      const data = await jira.upload(jira.restApi(`/issue/${req.params.key}/attachments`), form);
      results.push(data);
      fs.unlinkSync(file.path);
    }
    res.json(results.flat());
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, body: err.body });
  }
});

// Get worklogs
router.get('/:key/worklog', async (req, res) => {
  try {
    const data = await jira.get(jira.restApi(`/issue/${req.params.key}/worklog`));
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, body: err.body });
  }
});

// Add worklog
router.post('/:key/worklog', async (req, res) => {
  try {
    const data = await jira.post(jira.restApi(`/issue/${req.params.key}/worklog`), req.body);
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, body: err.body });
  }
});

// Get remote links (PRs, Confluence pages, etc.)
router.get('/:key/remotelinks', async (req, res) => {
  try {
    const data = await jira.get(jira.restApi(`/issue/${req.params.key}/remotelink`));
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Get development info (PRs, branches, commits) — multiple sources
router.get('/:key/dev-info', async (req, res) => {
  try {
    const issueKey = req.params.key;
    let pullRequests = [];
    let branches = [];
    let commits = [];

    // Try 1: Jira dev-status REST API (requires application links)
    try {
      // First get the issue ID (numeric)
      const issue = await jira.get(jira.restApi(`/issue/${issueKey}?fields=summary`));
      const issueId = issue.id;

      const devDetail = await jira.get(
        `/rest/dev-status/1.0/issue/detail?issueId=${issueId}&applicationType=stash&dataType=pullrequest`
      );
      if (devDetail?.detail?.length > 0) {
        for (const repo of devDetail.detail) {
          for (const pr of repo.pullRequests || []) {
            pullRequests.push({
              id: pr.id,
              title: pr.name || pr.title,
              status: pr.status,
              url: pr.url,
              author: pr.author?.name || pr.author?.displayName,
              source: pr.source?.name || '',
              destination: pr.destination?.name || '',
              reviewers: pr.reviewers?.map(r => r.name || r.displayName) || [],
              repo: repo.name || repo.repository?.name || '',
              createdAt: pr.createdOn,
              updatedAt: pr.updatedOn,
            });
          }
          for (const b of repo.branches || []) {
            branches.push({
              name: b.name,
              url: b.url,
              repo: repo.name || '',
            });
          }
        }
      }

      // Also try commits
      try {
        const commitData = await jira.get(
          `/rest/dev-status/1.0/issue/detail?issueId=${issueId}&applicationType=stash&dataType=repository`
        );
        if (commitData?.detail?.length > 0) {
          for (const repo of commitData.detail) {
            for (const c of repo.commits || []) {
              commits.push({
                id: c.id,
                message: c.message,
                author: c.author?.name,
                url: c.url,
                date: c.authorTimestamp,
              });
            }
          }
        }
      } catch (e) { /* commits optional */ }
    } catch (devErr) {
      console.log(`ℹ️  dev-status API not available for ${issueKey}: ${devErr.message}`);
    }

    // Try 2: Remote issue links as fallback (sometimes contains PR URLs)
    try {
      const remoteLinks = await jira.get(jira.restApi(`/issue/${issueKey}/remotelink`));
      if (Array.isArray(remoteLinks)) {
        for (const link of remoteLinks) {
          const obj = link.object || {};
          const url = obj.url || '';
          const title = obj.title || '';
          const isPR = /pull-request|pull\/|merge_request|\/pull\//.test(url) ||
                       /PR|pull request|merge request/i.test(title);
          if (isPR) {
            // Avoid duplicates
            if (!pullRequests.find(pr => pr.url === url)) {
              pullRequests.push({
                id: link.id,
                title: title,
                status: obj.status?.resolved ? 'MERGED' : (obj.status?.icon?.title || 'OPEN'),
                url: url,
                author: '',
                source: '',
                destination: '',
                reviewers: [],
                repo: '',
              });
            }
          }
        }
      }
    } catch (rlErr) {
      console.log(`ℹ️  Remote links not available for ${issueKey}: ${rlErr.message}`);
    }

    // Try 3: Scan Jira comments for PR URLs (Azure DevOps, GitHub, GitLab, Bitbucket)
    try {
      const issueWithComments = await jira.get(
        jira.restApi(`/issue/${issueKey}?fields=comment,summary`)
      );
      const comments = issueWithComments.fields?.comment?.comments || [];

      // Regex to match Azure DevOps PR URLs and generic PR URLs
      const prUrlRe = /https?:\/\/[^\s"'<>)]+(?:pullrequest\/\d+|\/pull\/\d+|\/merge_requests\/\d+)/gi;

      // Keywords for environment classification (from surrounding context)
      const devRe = /\b(dev|develop|desarrollo|feature|staging|qa|test)\b/i;
      const prdRe = /\b(prd|prod|produccion|producción|producción|master|main|release|hotfix)\b/i;

      // Helper: extract PR number from URL
      const prNumFromUrl = (url) => {
        const m = url.match(/(?:pullrequest|pull|merge_requests)\/(\d+)/i);
        return m ? m[1] : null;
      };

      for (const comment of comments) {
        // Get plain text of comment body
        const extractText = (node) => {
          if (!node) return '';
          if (typeof node === 'string') return node;
          if (node.text) return node.text;
          if (node.content) return node.content.map(extractText).join(' ');
          return '';
        };
        const rawText = extractText(comment.body);
        if (!rawText) continue;

        let match;
        prUrlRe.lastIndex = 0;

        while ((match = prUrlRe.exec(rawText)) !== null) {
          const url = match[0].replace(/[.,;)]+$/, ''); // strip trailing punctuation
          // Dedup — skip if already known from earlier sources
          if (pullRequests.find(pr => pr.url === url)) continue;

          // Context window around the URL (±300 chars) for keyword detection
          const start = Math.max(0, match.index - 300);
          const end = Math.min(rawText.length, match.index + url.length + 300);
          const context = rawText.slice(start, end);

          // Try to find a label like "PR_dev_1:", "PR_prd:", "PR produccion:" near the URL.
          // Covers all case/spelling variants: PR_DEV, Pr_dev, PR_Develop, PR_Development,
          // PR_PRD, pr_production, PR_Produccion, PR_Producción, PR_Master, PR_Main, etc.
          const labelMatch = context.match(
            /\bPR[_\s-]?(?:dev(?:elop(?:ment|ado)?)?|desarrollo|staging|qa|test|feature|prd|prod(?:uction|uccion|ucción)?|master|main|release|hotfix)[\w_-]*/i
          );
          const label = labelMatch ? labelMatch[0] : null;

          // Classify environment
          let env = 'OTHER';
          const contextLower = context.toLowerCase();
          const labelLower = (label || '').toLowerCase();

          // Label-based classification (also covers words embedded in the label suffix)
          const labelIsDev = /(?:dev(?:elop(?:ment|ado)?)?|desarrollo|staging|qa|test|feature)/.test(labelLower);
          const labelIsPrd = /(?:prd|prod(?:uction|uccion|ucción)?|master|main|release|hotfix)/.test(labelLower);

          const hasDev = devRe.test(contextLower) || labelIsDev;
          const hasPrd = prdRe.test(contextLower) || labelIsPrd;

          if (hasPrd && !hasDev) env = 'PRD';
          else if (hasDev && !hasPrd) env = 'DEV';
          else if (hasPrd) env = 'PRD'; // PRD wins on tie (safer classification)

          // Build a readable title
          const prNum = prNumFromUrl(url);
          const title = label
            ? label.replace(/_/g, ' ').trim()
            : prNum
              ? `PR #${prNum}`
              : 'Pull Request';

          pullRequests.push({
            id: `comment-${comment.id}-${prNum || Date.now()}`,
            title,
            status: 'OPEN', // status unknown from comments; link lets user check
            url,
            author: comment.author?.displayName || '',
            source: '',
            destination: '',
            reviewers: [],
            repo: '',
            fromComment: true,
            environment: env,
          });
        }
      }
    } catch (commentErr) {
      console.log(`ℹ️  Comment PR scan failed for ${issueKey}: ${commentErr.message}`);
    }

    // Classify PRs by environment based on destination branch (for PRs from sources 1 & 2)
    const classifyEnv = (pr) => {
      // PRs already classified by comment scan skip this
      if (pr.environment) return pr.environment;
      const dest = (pr.destination || '').toLowerCase();
      if (/^(main|master|release|production|hotfix)/.test(dest)) return 'PRD';
      if (/^(develop|dev|staging|qa|test|feature)/.test(dest)) return 'DEV';
      // Try to infer from title/URL
      const titleLower = (pr.title || '').toLowerCase();
      if (/prod|release|hotfix|main|master/.test(titleLower)) return 'PRD';
      if (/dev|develop|staging|feature/.test(titleLower)) return 'DEV';
      return 'OTHER';
    };

    const classified = pullRequests.map(pr => ({
      ...pr,
      environment: classifyEnv(pr),
    }));

    res.json({
      pullRequests: classified,
      branches,
      commits: commits.slice(0, 20), // Limit commits
      total: {
        prs: classified.length,
        branches: branches.length,
        commits: commits.length,
      },
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});


module.exports = router;
