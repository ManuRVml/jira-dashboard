const express = require('express');
const router = express.Router();
const jira = require('../lib/jira-client');

// List all boards
router.get('/', async (req, res) => {
  try {
    const { startAt = 0, maxResults = 50, type, name } = req.query;
    const params = new URLSearchParams({ startAt, maxResults });
    if (type) params.append('type', type);
    if (name) params.append('name', name);
    const data = await jira.agile(`/board?${params}`);
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, body: err.body });
  }
});

// Get board details
router.get('/:id', async (req, res) => {
  try {
    const data = await jira.agile(`/board/${req.params.id}`);
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, body: err.body });
  }
});

// Get sprints for a board
router.get('/:id/sprints', async (req, res) => {
  try {
    const { state = 'active,future' } = req.query;
    const data = await jira.agile(`/board/${req.params.id}/sprint?state=${state}`);
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, body: err.body });
  }
});

// Get issues for a sprint
router.get('/sprints/:sprintId/issues', async (req, res) => {
  try {
    const { jql = '', startAt = 0, maxResults = 50 } = req.query;
    const params = new URLSearchParams({ startAt, maxResults });
    if (jql) params.append('jql', jql);
    const data = await jira.agile(`/sprint/${req.params.sprintId}/issue?${params}`);
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, body: err.body });
  }
});

// Get board configuration (columns)
router.get('/:id/configuration', async (req, res) => {
  try {
    const data = await jira.agile(`/board/${req.params.id}/configuration`);
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, body: err.body });
  }
});

module.exports = router;
