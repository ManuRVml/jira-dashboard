const express = require('express');
const router = express.Router();
const jira = require('../lib/jira-client');

// List all accessible projects
router.get('/', async (req, res) => {
  try {
    // v2 uses /rest/api/2/project (returns array), v3 uses /rest/api/3/project/search
    let data;
    if (jira.isServer) {
      data = await jira.get(jira.restApi('/project'));
      // Wrap in consistent format
      if (Array.isArray(data)) {
        data = { values: data };
      }
    } else {
      data = await jira.get(jira.restApi('/project/search?expand=description,lead'));
    }
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, body: err.body });
  }
});

// Get project details with issue types
router.get('/:key', async (req, res) => {
  try {
    const data = await jira.get(jira.restApi(`/project/${req.params.key}`));
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, body: err.body });
  }
});

// Get issue types for a project
router.get('/:key/statuses', async (req, res) => {
  try {
    const data = await jira.get(jira.restApi(`/project/${req.params.key}/statuses`));
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, body: err.body });
  }
});

module.exports = router;
