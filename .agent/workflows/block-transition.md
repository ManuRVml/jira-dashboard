---
description: Workflow for transitioning from one Jira block to the next (bi-monthly sprint cycle)
---

# Block Transition Workflow

> **Trigger:** Run this at the start of each new bi-monthly period (e.g., start of March, start of May).
> This closes the previous block cycle and opens a new one, carrying forward all incomplete tasks.

## Pre-requisites

Read and follow the skills in this order:
1. `.agent/skills/block-management/SKILL.md` — understand the architecture
2. `.agent/skills/block-transition/SKILL.md` — understand the step-by-step flow

## Steps

### 1. Get current block status
// turbo
```bash
curl -s "http://localhost:3001/api/issues/blocks?project=PY06809" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for b in d['blocks']:
    mark = '← CURRENT' if b == d['blocks'][-1] else ''
    print(f\"{b['key']} | {b['summary'][:40]} | total:{b['totalTasks']} incomplete:{b['incompleteTasks']} {mark}\")
"
```

### 2. Identify the previous (current) block key and new block name

Ask the user:
- What is the name for the new block? (e.g., "Bloque VII - Mayo/Junio 2026")
- Confirm the list of incomplete tasks that should be carried over

### 3. Create the new block
```bash
curl -s -X POST "http://localhost:3001/api/issues" \
  -H "Content-Type: application/json" \
  -d '{"fields":{"project":{"key":"PY06809"},"summary":"BLOCK_NAME_HERE","issuetype":{"name":"Task"}}}'
```
Save the returned `key` (e.g., `PY06809-XX`).

### 4. Move incomplete tasks from the previous block to the new block

For each incomplete task key (from step 1), run:
```bash
curl -s -X PUT "http://localhost:3001/api/issues/TASK_KEY/parent" \
  -H "Content-Type: application/json" \
  -d '{"parentKey":"NEW_BLOCK_KEY"}'
```

Or use the UI: go to `/blocks` → click the source block → select all incomplete tasks → choose destination → click "Mover →".

### 5. Move tasks from Jira board that belong to this sprint

Ask the user to share the Kanban board screenshot or list additional tasks not in any block that should be associated with the new sprint. Move each:
```bash
curl -s -X PUT "http://localhost:3001/api/issues/TASK_KEY/parent" \
  -H "Content-Type: application/json" \
  -d '{"parentKey":"NEW_BLOCK_KEY"}'
```

### 6. Verify the new block
// turbo
```bash
curl -s "http://localhost:3001/api/issues/blocks?project=PY06809" | python3 -c "
import json,sys
d=json.load(sys.stdin)
b=d['blocks'][-1]
print(f\"New block: {b['key']} | {b['summary']}\")
print(f\"Total: {b['totalTasks']} | Incomplete: {b['incompleteTasks']}\")
for c in b.get('children', []):
    carry = '↩ carry-over' if c.get('via') == 'link' else '• original'
    print(f\"  {carry} {c['key']} [{c['status']}] {c['summary'][:50]}\")
"
```

### 7. Restart the backend server to pick up any code changes

If any backend code was modified:
```bash
pkill -9 -f "node server.js" && sleep 1 && node /Users/manuelrodriguez/Documents/app-jira/server.js &
```

### 8. Confirm with user

Open the browser at `http://localhost:5173/blocks` and verify the new block shows all expected tasks with correct statuses.
