---
name: jira-block-management
description: >
  Skill for managing project blocks (sprints/ciclos) in the app-jira Jira Dashboard.
  Covers how blocks work, the Jira Server API workaround via issue links,
  how to open new blocks, how to carry over incomplete tasks, and how the
  /blocks page and backend routes work end-to-end.
---

# Jira Block Management Skill

## Context & Architecture

This skill applies to the **app-jira** project at `/Users/manuelrodriguez/Documents/app-jira`.

### What is a "Bloque"?
- A Bloque is a **bi-monthly work sprint** (e.g., Enero-Febrero, Marzo-Abril).
- In Jira, blocks are **Task-type issues** with a summary like "BLOQUE I", "Bloque V", "Bloque VI - Marzo/Abril 2026".
- Work stories/HUs are **Sub-task issues** whose `parent` field points to the block.
- Project key: **PY06809**

### Current Blocks (as of March 2026)
| Key | Name | Period |
|-----|------|--------|
| PY06809-2 | BLOQUE I | Earliest |
| PY06809-11 | BLOQUE II | |
| PY06809-40 | BLOQUE III | |
| PY06809-41 | Bloque IV | |
| PY06809-52 | Bloque V | |
| PY06809-68 | Bloque VI - Marzo/Abril 2026 | **Current** |

---

## Critical: Jira Server API Limitation

> **The `parent` field of sub-tasks CANNOT be changed via Jira Server REST API.**
> The field is not on any edit screen in this Jira instance.

**All attempts tested and confirmed to fail:**
- `PUT /issue/:key` with `{ fields: { parent: { key } } }` → silently ignored
- `update.parent[set]` → "Field 'parent' cannot be set. It is not on the appropriate screen"
- `POST /rest/api/2/issue/:key/subtask` → 405 Method Not Allowed
- `convertToIssue` endpoint → 404 Not Found
- WebWork internal actions → blocked by XSRF

**The workaround:** Use **issue link type 10304** ("multi-level hierarchy [GANTT]"):
- Inward: "is subtask of" (task → block)
- Outward: "is parent task of" (block ← task)

### Creating a block assignment link
```bash
curl -X POST "https://jira.the-cocktail.com/rest/api/2/issueLink" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --insecure \
  -d '{
    "type": { "id": "10304" },
    "inwardIssue": { "key": "PY06809-67" },
    "outwardIssue": { "key": "PY06809-68" }
  }'
```

---

## Backend Routes

### `GET /api/issues/blocks?project=PY06809`
File: `/Users/manuelrodriguez/Documents/app-jira/routes/issues.js`

Returns all blocks with their children. Children are collected from **two sources**:
1. **Source 1:** Sub-tasks via Jira `parent` field (JQL: `parent = "BLOCK_KEY"`)
2. **Source 2:** Issues linked via link type 10304 (read from `block.fields.issuelinks`)

> **IMPORTANT:** The block search URL must **not** URL-encode the commas in the `fields` parameter. Use:
> ```js
> const url = jira.restApi(`/search?jql=${encodeURIComponent(jql)}&maxResults=50&fields=summary,status,created,updated,issuelinks`);
> ```
> Using `URLSearchParams` encodes commas as `%2C` which Jira Server ignores for `fields`.

### `PUT /api/issues/:key/parent`
File: `/Users/manuelrodriguez/Documents/app-jira/routes/issues.js`

Moves a task to a new block by:
1. Removing all existing link-type-10304 links from the task
2. Creating a new "is subtask of" link to the target block

### `POST /api/issues` (create block)
Standard Jira issue creation with `issuetype: { name: "Task" }`.

---

## Frontend

### BlocksPage (`src/pages/BlocksPage.jsx`)
- **Left panel:** Lists all blocks with total/incomplete task counts
- **Right panel:** On click, shows incomplete tasks with checkboxes
- **Move bar:** Appears when tasks are selected; dropdown of destination blocks + "Mover →" button
- **New block form:** "+ Nuevo Bloque" button → name input → calls `api.createBlock()`

### API Client (`src/lib/api.js`)
```js
api.getBlocks(project)         // GET /issues/blocks?project=...
api.moveTaskToBlock(key, parentKey)  // PUT /issues/:key/parent
api.createBlock(name, project)      // POST /issues
```

---

## Status Categories in Jira
| Jira Status Name | Category Key | Meaning |
|-----------------|--------------|---------|
| Cerrado, Done | `done` | Completed — NOT shown in incomplete list |
| En Validación, Doing, En Progreso | `indeterminate` | In progress |
| En Atención TCK, Bloqueado | `new` or `indeterminate` | Active |
| Reopen | `indeterminate` | Reopened |
| No Aplica | `done` | Marked as N/A |

Incomplete detection: `statusCategory !== 'done'`

---

## Server Startup Note

> **Always kill the old server before starting a new one** to avoid running stale code.
> The server running on port 3001 caches all Node.js modules on startup.

```bash
pkill -9 -f "node server.js"
node /Users/manuelrodriguez/Documents/app-jira/server.js &
```
