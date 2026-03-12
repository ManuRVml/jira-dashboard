const API_BASE = '/api';

async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const config = {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  };

  // Don't set Content-Type for FormData
  if (options.body instanceof FormData) {
    delete config.headers['Content-Type'];
  }

  const response = await fetch(url, config);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  return data;
}

export const api = {
  // Health
  health: () => request('/health'),

  // Activity Feed (notifications)
  getActivityFeed: (project = 'PY06809', days = 5, maxResults = 30) =>
    request(`/issues/activity-feed?project=${encodeURIComponent(project)}&days=${days}&maxResults=${maxResults}`),

  // Issues
  searchIssues: (jql = '', startAt = 0, maxResults = 50) =>
    request(`/issues?jql=${encodeURIComponent(jql)}&startAt=${startAt}&maxResults=${maxResults}`),

  getIssue: (key) => request(`/issues/${key}`),

  getTimeInfo: (key) => request(`/issues/${key}/time-info`),

  createIssue: (body) => request('/issues', { method: 'POST', body: JSON.stringify(body) }),

  updateIssue: (key, body) => request(`/issues/${key}`, { method: 'PUT', body: JSON.stringify(body) }),

  // Blocks
  getBlocks: (project = 'PY06809') => request(`/issues/blocks?project=${encodeURIComponent(project)}`),

  getWarrantyTasks: (project = 'PY06809') => request(`/issues/blocks/warranty?project=${encodeURIComponent(project)}`),

  moveTaskToBlock: (taskKey, parentKey) =>
    request(`/issues/${taskKey}/parent`, { method: 'PUT', body: JSON.stringify({ parentKey }) }),

  createBlock: (name, project = 'PY06809') =>
    request('/issues', {
      method: 'POST',
      body: JSON.stringify({
        fields: {
          project: { key: project },
          summary: name,
          issuetype: { name: 'Task' },
        },
      }),
    }),

  getTransitions: (key) => request(`/issues/${key}/transitions`),

  doTransition: (key, body) =>
    request(`/issues/${key}/transitions`, { method: 'POST', body: JSON.stringify(body) }),

  addComment: (key, body) =>
    request(`/issues/${key}/comment`, { method: 'POST', body: JSON.stringify(body) }),

  uploadAttachment: (key, files) => {
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }
    return request(`/issues/${key}/attachments`, { method: 'POST', body: formData });
  },

  getWorklogs: (key) => request(`/issues/${key}/worklog`),

  addWorklog: (key, body) =>
    request(`/issues/${key}/worklog`, { method: 'POST', body: JSON.stringify(body) }),

  getDevInfo: (key) => request(`/issues/${key}/dev-info`),

  // Projects
  getProjects: () => request('/projects'),
  getProject: (key) => request(`/projects/${key}`),

  // Boards
  getBoards: () => request('/boards'),
  getBoardSprints: (boardId) => request(`/boards/${boardId}/sprints`),
  getSprintIssues: (sprintId) => request(`/boards/sprints/${sprintId}/issues`),
  getBoardConfig: (boardId) => request(`/boards/${boardId}/configuration`),

  // Reports
  getSummaryReport: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/reports/summary?${qs}`);
  },
  getCreatedVsResolved: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/reports/created-vs-resolved?${qs}`);
  },
  getWorklogReport: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/reports/worklog?${qs}`);
  },
  getActivityReport: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/reports/activity-report?${qs}`);
  },
  getPendingDeploys: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/reports/pending-deploys?${qs}`);
  },

  generateBlockReport: (body) =>
    request('/reports/block-report', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // Word download: POST generates disk file, returns { url, filename }
  generateBlockReportDocx: (body) =>
    request('/reports/block-report/docx', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // Warranty: mark/unmark a task as a warranty case
  markAsWarranty: (key, warranty = true) =>
    request(`/issues/${key}/warranty`, {
      method: 'POST',
      body: JSON.stringify({ warranty }),
    }),
};
