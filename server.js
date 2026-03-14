require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const issuesRouter = require('./routes/issues');
const boardsRouter = require('./routes/boards');
const projectsRouter = require('./routes/projects');
const reportsRouter = require('./routes/reports');
const { formatText, reformatCommentForJira } = require('./lib/gemini');

const app = express();
const PORT = process.env.PORT || 3001;
const HOST = '0.0.0.0';

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/issues', issuesRouter);
app.use('/api/boards', boardsRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/reports', reportsRouter);

// AI text formatting
app.post('/api/ai/format-text', async (req, res) => {
  try {
    const { text, context } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'El campo "text" es requerido' });
    }
    const formatted = await formatText(text.trim(), context || 'general');
    res.json({ formatted });
  } catch (err) {
    console.error('Error formatting text:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// AI comment reformatting (restructure existing comments to SCv2 format)
app.post('/api/ai/reformat-comment', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'El campo "text" es requerido' });
    }
    const { formatted, detectedType } = await reformatCommentForJira(text.trim());
    res.json({ formatted, detectedType });
  } catch (err) {
    console.error('Error reformatting comment:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Serve generated report downloads as static files
const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });
app.use('/downloads', express.static(downloadsDir));

// Health check & connection test
app.get('/api/health', async (req, res) => {
  try {
    const jira = require('./lib/jira-client');
    const data = await jira.get(jira.restApi('/myself'));
    res.json({
      status: 'connected',
      user: data.displayName,
      email: data.emailAddress,
      avatarUrl: data.avatarUrls?.['48x48'],
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      error: err.message,
    });
  }
});


// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
  // Catch-all: only serve index.html for non-API routes
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

app.listen(PORT, HOST, () => {
  console.log(`🚀 Jira Dashboard API running on http://${HOST}:${PORT}`);
  console.log(`   Jira URL: ${process.env.JIRA_BASE_URL || '⚠️  NOT CONFIGURED'}`);
});
