const fetch = require('node-fetch');

class JiraClient {
  constructor() {
    this.baseUrl = process.env.JIRA_BASE_URL;
    this.email = process.env.JIRA_EMAIL;
    this.apiToken = process.env.JIRA_API_TOKEN;

    if (!this.baseUrl || !this.apiToken) {
      console.warn('⚠️  Jira credentials not configured. Set JIRA_BASE_URL and JIRA_API_TOKEN in .env');
    }

    // Detect auth type: Jira Server PAT (base64-ish token) vs Cloud (email:token)
    this.isServer = !this.baseUrl?.includes('.atlassian.net');
    if (this.isServer) {
      console.log('🔧 Detected Jira Server/Data Center — using Bearer token auth + API v2');
    } else {
      console.log('☁️  Detected Jira Cloud — using Basic auth + API v3');
    }
  }

  get apiVersion() {
    return this.isServer ? '2' : '3';
  }

  get authHeader() {
    if (this.isServer) {
      // Jira Server Personal Access Token — Bearer auth
      return `Bearer ${this.apiToken}`;
    }
    // Jira Cloud — Basic auth (email:token)
    const encoded = Buffer.from(`${this.email}:${this.apiToken}`).toString('base64');
    return `Basic ${encoded}`;
  }

  get headers() {
    return {
      'Authorization': this.authHeader,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const config = {
      headers: { ...this.headers },
      ...options,
    };

    // Override headers if provided in options
    if (options.headers) {
      config.headers = { ...this.headers, ...options.headers };
    }

    // For file uploads, remove Content-Type (let multipart handle it)
    if (options.isUpload) {
      delete config.headers['Content-Type'];
      config.headers['X-Atlassian-Token'] = 'no-check';
      delete config.isUpload;
    }

    console.log(`→ ${config.method || 'GET'} ${url}`);

    // Disable SSL verification for self-signed certs (common in Jira Server)
    if (this.isServer) {
      const https = require('https');
      config.agent = new https.Agent({ rejectUnauthorized: false });
    }

    const response = await fetch(url, config);

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`← ${response.status} ${response.statusText}: ${errorBody.substring(0, 200)}`);
      const err = new Error(`Jira API Error: ${response.status} ${response.statusText}`);
      err.status = response.status;
      err.body = errorBody;
      throw err;
    }

    // Some endpoints return no content
    if (response.status === 204) return null;

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return response.json();
    }
    return response.text();
  }

  // REST API shortcuts — auto-detect version
  get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  }

  post(endpoint, body) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  put(endpoint, body) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }

  // Helper: build REST API path with correct version
  restApi(path) {
    return `/rest/api/${this.apiVersion}${path}`;
  }

  // Agile API
  agile(endpoint) {
    return this.get(`/rest/agile/1.0${endpoint}`);
  }

  // Upload file
  upload(endpoint, formData) {
    return this.request(endpoint, {
      method: 'POST',
      body: formData,
      isUpload: true,
      headers: {
        ...this.headers,
        ...formData.getHeaders(),
      },
    });
  }
}

module.exports = new JiraClient();
