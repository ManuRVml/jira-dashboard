---
name: block-transition
description: >
  Step-by-step workflow for closing a Jira block cycle and opening a new one.
  Includes: creating the new block, identifying carry-over tasks (incomplete from
  previous block), linking them to the new block, and visualizing block status
  in the dashboard. Run this at the start of each bi-monthly sprint.
---

# Block Transition Workflow

> **When to use:** At the start of each new bi-monthly period (e.g., transition from Bloque V → Bloque VI).
> Run these steps in order. Each step includes the exact API calls to use.

---

## Step 1: Create the New Block in Jira

Name convention: `Bloque [Roman numeral] - [Month1]/[Month2] [Year]`

```bash
curl -X POST "http://localhost:3001/api/issues" \
  -H "Content-Type: application/json" \
  -d '{
    "fields": {
      "project": { "key": "PY06809" },
      "summary": "Bloque VII - Mayo/Junio 2026",
      "issuetype": { "name": "Task" }
    }
  }'
# Returns: { "key": "PY06809-XX" } — save this key for the next steps
```

Or use the **"+ Nuevo Bloque"** button in `/blocks`.

---

## Step 2: Identify Incomplete Tasks from the Previous Block

These are tasks in the previous block with `statusCategory !== 'done'`.
Check the `/blocks` page — click the previous block to see its incomplete list.

Or via API:
```bash
curl "http://localhost:3001/api/issues/blocks?project=PY06809"
# Find the previous block's "children" array where statusCategory !== "done"
```

**Status values considered incomplete:**
- Doing / En Progreso / En Atención TCK / Bloqueado / Reopen / En Validación

**Status values considered complete (DO NOT move):**
- Cerrado / Done / No Aplica

---

## Step 3: Move Incomplete Tasks to the New Block

For each carry-over task, create an issue link via the app's API:

```bash
# Using our app's move endpoint (recommended — handles old link cleanup automatically)
curl -X PUT "http://localhost:3001/api/issues/PY06809-XX/parent" \
  -H "Content-Type: application/json" \
  -d '{ "parentKey": "PY06809-NEW_BLOCK_KEY" }'
```

Or use the **"Mover →"** button in `/blocks`:
1. Click the source block → check all incomplete tasks → select destination → click Mover

> **Technical note:** This creates a Jira issue link of type 10304 ("is subtask of"),
> NOT a Jira parent field change (which is blocked in this Jira Server instance).

---

## Step 4: Move Tasks from Other Blocks Also Being Worked

Sometimes tasks from older blocks are still active. Ask the user which tasks
from Jira's Kanban board should be associated with the new block.

For each additional task:
```bash
curl -X PUT "http://localhost:3001/api/issues/PY06809-XX/parent" \
  -H "Content-Type: application/json" \
  -d '{ "parentKey": "PY06809-NEW_BLOCK_KEY" }'
```

---

## Step 5: Verify the New Block Status

After moving tasks, reload `/blocks` and click the new block. Confirm:
- All carry-over tasks appear with `via: link` indicator
- Counts match expected (e.g., Bloqueado: 1, En Progreso: 5, En Validación: 3)
- No tasks were accidentally moved that were already closed

Also check via API:
```bash
curl "http://localhost:3001/api/issues/blocks?project=PY06809" | \
  python3 -c "
import json,sys
d=json.load(sys.stdin)
b=next(x for x in d['blocks'] if 'nuevo_bloque_key' in x['key'])
print('Total:', b['totalTasks'], 'Incomplete:', b['incompleteTasks'])
for c in b['children']: print(' ', c['key'], c['status'], c.get('via'))
"
```

---

## Step 6: Update Dashboard (Optional)

If you want the Dashboard to show the current block's status:
- The `/` dashboard automatically shows the current period's data based on the block dates
- The `/blocks` page always shows all blocks — the current one is the latest

---

## Carry-over Task Visualization Rules

When displaying a task that was carried over from a previous block, it should be marked visually with:
- A badge: `"Continuación"` or `"↩ Bloque anterior"`
- The `via: 'link'` field indicates it was carried over (vs `via: 'parent'` for original tasks)
- In the `/blocks` UI, carried-over tasks show a purple dot (statusCategory: indeterminate)

**Future enhancement idea:** Add a `"Continúa desde Bloque X"` label in the task list 
by reading the task's original `parentKey` field (vs current block) and comparing.

---

## Quick Reference: Available Issue Link Types

| ID | Name | Inward → | Outward → |
|----|------|----------|-----------|
| **10304** | multi-level hierarchy [GANTT] | is subtask of | is parent task of |
| 10003 | Relates | relates to | relates to |
| 10000 | Blocks | is blocked by | blocks |

Block assignment always uses **10304**.

---

## Troubleshooting

### Bloque VI shows 0 children
- Check if the server is using stale code: `lsof -i :3001` → kill old PID → restart
- The `fields=` param in the search URL must NOT url-encode commas (use manual URL, not URLSearchParams)

### "Field 'parent' cannot be set" error
- Expected behavior on Jira Server — use issue link type 10304 instead
- The `PUT /api/issues/:key/parent` endpoint already handles this correctly

### Link creation returns 400
- Check that both issue keys exist in Jira
- Verify the token has permission to create issue links
