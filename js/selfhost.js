const SelfHost = {
  AUTH_URL: 'https://authorization.ctrlservers.xyz',
  API_URL: 'https://nsrv.ctrlservers.xyz',
  token: null,
  user: null,
  hostingServers: [],
  selectedHosting: null,
  connections: [],
  rules: [],
  monitoredServers: [],
  logs: [],
  tab: 'connections',
  cooldown: 30,
  autoSync: false,
  scriptData: null,
  _deepLinkBound: false,
  _logPoll: null,
  loading: false,

  init() {
    this.token = localStorage.getItem('selfhost_token');
    this.user = JSON.parse(localStorage.getItem('selfhost_user') || 'null');
    if (!this._deepLinkBound) {
      this._deepLinkBound = true;
      window.electronAPI.oncloudaction((data) => {
        if (data && data.token && data.source === 'selfhost') {
          this.token = data.token;
          this.fetchuserinfo().then(() => {
            this.saveauth();
            this.fetchhosting().then(() => this.render());
          });
        }
      });
    }
    if (this.token) {
      this.fetchhosting().then(() => this.render());
    }
  },

  async api(method, path, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (this.token) opts.headers.Authorization = 'Bearer ' + this.token;
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(this.API_URL + path, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  },

  async fetchuserinfo() {
    if (!this.token) return;
    try {
      const res = await fetch(this.AUTH_URL + '/api/check/token?token=' + this.token);
      const data = await res.json();
      if (data && data.user) this.user = data.user;
      else this.clearauth();
    } catch (e) {
      this.clearauth();
    }
  },

  async fetchhosting() {
    if (!this.token) return;
    try {
      const data = await this.api('GET', '/api/hosting');
      this.hostingServers = data.servers || [];
    } catch (e) {
      this.hostingServers = [];
    }
  },

  async fetchhostingdata(hostingId) {
    if (!this.token) return;
    try {
      const [connData, ruleData, monData, logData, userData] = await Promise.all([
        this.api('GET', `/api/hosting/${hostingId}/connections`).catch(() => ({ connections: [] })),
        this.api('GET', `/api/hosting/${hostingId}/rules`).catch(() => ({ rules: [] })),
        this.api('GET', `/api/hosting/${hostingId}/servers`).catch(() => ({ servers: [] })),
        this.api('GET', `/api/hosting/${hostingId}/logs`).catch(() => ({ logs: [] })),
        this.api('GET', '/api/settings').catch(() => ({ auto_sync: false })),
      ]);
      this.connections = connData.connections || [];
      this.rules = ruleData.rules || [];
      this.monitoredServers = monData.servers || [];
      this.logs = logData.logs || [];
      this.autoSync = !!userData.auto_sync;
    } catch (e) {}
  },

  saveauth() {
    if (this.token) localStorage.setItem('selfhost_token', this.token);
    if (this.user) localStorage.setItem('selfhost_user', JSON.stringify(this.user));
  },

  clearauth() {
    this.token = null;
    this.user = null;
    this.hostingServers = [];
    this.selectedHosting = null;
    this.connections = [];
    this.rules = [];
    this.monitoredServers = [];
    this.logs = [];
    this.scriptData = null;
    this.stoplogpoll();
    localStorage.removeItem('selfhost_token');
    localStorage.removeItem('selfhost_user');
  },

  openauth() {
    window.electronAPI.openexternal(this.AUTH_URL + '/login?redirect=http://127.0.0.1:12747/selfhost-callback');
  },

  logout() {
    Modal.confirm('Sign Out', 'Are you sure you want to sign out of Self-Host?', () => {
      this.clearauth();
      this.render();
    });
  },

  showtoast(msg, type) {
    const existing = document.querySelector('.sh-toast');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.className = 'sh-toast' + (type === 'error' ? ' sh-toast-error' : '');
    el.textContent = msg;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('sh-toast-show'));
    setTimeout(() => {
      el.classList.remove('sh-toast-show');
      setTimeout(() => el.remove(), 300);
    }, 3000);
  },

  escape(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  async resolveapikey(ds) {
    let apiKey = ds.apiKey || '';
    if (apiKey.startsWith('enc:') && window.electronAPI?.cryptodecrypt) {
      apiKey = await window.electronAPI.cryptodecrypt(apiKey.slice(4));
    }
    return apiKey;
  },

  async buildserverpayload(ds, idx) {
    const apiKey = await this.resolveapikey(ds);
    const payload = {
      dashboard_idx: idx,
      server_name: ds.name || ds.host || 'Server',
      server_type: ds.type || 'VPS/VDS',
      server_ip: ds.host || '',
      panel_url: ds.panelUrl || ds.host || '',
      api_key: apiKey,
      server_uuid: ds.uuid || '',
      server_port: ds.type === 'VPS/VDS' ? (ds.port || 22) : 443,
      ssh_username: ds.username || 'root',
      ssh_password: '',
      ssh_auth_type: ds.authType === 'key' ? 'key' : 'password',
      ssh_private_key: '',
    };

    if (ds.type === 'VPS/VDS') {
      if (ds.authType === 'key' && typeof Servers !== 'undefined' && Servers.resolvevpsprivatekey) {
        payload.ssh_private_key = await Servers.resolvevpsprivatekey(ds) || '';
        if (!payload.ssh_private_key) payload.ssh_password = ds.password || '';
      } else {
        payload.ssh_password = ds.password || '';
      }
    }

    return payload;
  },

  render() {
    const el = Utils.el('tabSelfHost');
    if (!el) return;
    if (!this.token) {
      this.renderauth(el);
      return;
    }
    this.renderdashboard(el);
  },

  renderauth(el) {
    el.innerHTML = `
      <div class="cloud-auth">
        <div class="cloud-auth-card">
          <div class="cloud-auth-logo">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>
            </svg>
          </div>
          <h2 class="cloud-auth-title">Self-Host</h2>
          <p class="cloud-auth-sub">Login with your CTRLServers account to monitor self-hosted servers.</p>
          <div class="cloud-auth-form">
            <button class="btn btn-primary cloud-auth-btn" onclick="SelfHost.openauth()">Go to Web</button>
          </div>
        </div>
      </div>`;
  },

  renderdashboard(el) {
    const displayName = this.user?.username || this.user?.nickname || this.user?.email || '?';
    let bodyHtml = '';

    if (this.selectedHosting) {
      const h = this.selectedHosting;
      const serverTabs = [
        { id: 'connections', label: 'Connections', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' },
        { id: 'rules', label: 'Rules', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>' },
        { id: 'logs', label: 'Recent Logs', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' },
        { id: 'servers', label: 'Servers', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/></svg>' },
        { id: 'script', label: 'Script', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>' },
        { id: 'settings', label: 'Settings', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>' },
      ];
      const tabsHtml = serverTabs.map((t) =>
        `<button class="sh-tab ${this.tab === t.id ? 'sh-tab-active' : ''}" onclick="SelfHost.switchtab('${t.id}')">${t.icon}<span>${t.label}</span></button>`
      ).join('');

      let contentHtml = '';
      if (this.tab === 'connections') contentHtml = this.renderconnectionstab();
      else if (this.tab === 'rules') contentHtml = this.renderrulestab();
      else if (this.tab === 'logs') contentHtml = this.renderlogstab();
      else if (this.tab === 'servers') contentHtml = this.renderserverstab();
      else if (this.tab === 'script') contentHtml = this.renderscripttab();
      else if (this.tab === 'settings') contentHtml = this.rendersettingstab();

      const statusClass = h.status === 'online' ? 'sh-status-online' : h.status === 'offline' ? 'sh-status-offline' : 'sh-status-unknown';
      const statusText = h.status === 'online' ? 'Online' : h.status === 'offline' ? 'Offline' : 'Unknown';

      bodyHtml = `
        <div class="sh-section-header">
          <h3 style="display:flex;align-items:center;gap:10px;">
            <button class="sh-action-btn" onclick="SelfHost.goback()" style="font-size:16px;">&#8592;</button>
            ${this.escape(h.name)}
            <span class="sh-status-dot ${statusClass}"></span>
            <span class="sh-status-text">${statusText}</span>
            <span class="sh-muted" style="font-size:12px;">${this.escape(h.ip)}</span>
          </h3>
        </div>
        <div class="sh-tabs">${tabsHtml}</div>
        <div class="sh-tab-content" id="shTabContent">${contentHtml}</div>`;

      if (this.tab === 'logs') this.startlogpoll();
    } else {
      this.stoplogpoll();
      let hostingHtml = '';
      for (const h of this.hostingServers) {
        const statusClass = h.status === 'online' ? 'sh-status-online' : h.status === 'offline' ? 'sh-status-offline' : 'sh-status-unknown';
        const statusText = h.status === 'online' ? 'Online' : h.status === 'offline' ? 'Offline' : 'Unknown';
        hostingHtml += `
          <div class="sh-server-card" style="cursor:pointer;" onclick="SelfHost.selecthosting(${h.id})">
            <div class="sh-server-header">
              <div class="sh-server-name">${this.escape(h.name)}</div>
              <div class="sh-server-actions">
                <span class="sh-status-dot ${statusClass}"></span>
                <span class="sh-status-text">${statusText}</span>
                <button class="sh-action-btn sh-action-danger" onclick="event.stopPropagation();SelfHost.deletehosting(${h.id})" title="Delete">Delete</button>
              </div>
            </div>
            <div class="sh-server-info">
              <span class="sh-server-ip">${this.escape(h.ip)}:6055</span>
              <span class="sh-muted">Cooldown: ${h.cooldown}s</span>
            </div>
          </div>`;
      }

      bodyHtml = `
        <div class="sh-section-header">
          <h3>Hosting Servers (${this.hostingServers.length})</h3>
          <button class="btn btn-primary btn-sm" onclick="document.getElementById('shCreateForm').style.display=document.getElementById('shCreateForm').style.display==='none'?'':'none'">+ Add Hosting Server</button>
        </div>
        <div class="sh-warning" style="background:rgba(255,193,7,0.1);border:1px solid rgba(255,193,7,0.3);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:13px;color:#ffb300;">
          Warning! Self-Host agent consumes high CPU when checking servers. We recommend setting the checking interval to 10s, 15s, 20s or more.
        </div>
        <div id="shCreateForm" style="display:none;">
          <div class="sh-create-form">
            <div class="sh-form-group">
              <label>Server Name</label>
              <input type="text" id="shNewName" class="sh-input" placeholder="My Monitoring Server">
            </div>
            <div class="sh-form-group">
              <label>Server IP</label>
              <input type="text" id="shNewIp" class="sh-input" placeholder="192.168.1.100">
            </div>
            <div class="sh-form-actions">
              <button class="btn btn-secondary btn-sm" onclick="document.getElementById('shCreateForm').style.display='none'">Cancel</button>
              <button class="btn btn-primary btn-sm" onclick="SelfHost.addhosting()" ${this.loading ? 'disabled' : ''}>Add Server</button>
            </div>
          </div>
        </div>
        <div class="sh-servers-grid">${hostingHtml || '<div class="sh-empty"><p>No hosting servers yet. Add a VPS server to start monitoring.</p></div>'}</div>`;
    }

    el.innerHTML = `
      <div class="sh-container">
        <div class="sh-header">
          <div class="sh-header-left">
            <div class="sh-user-avatar">${displayName[0].toUpperCase()}</div>
            <div class="sh-user-info">
              <h3 class="sh-user-name">${this.escape(displayName)}</h3>
              <span class="sh-user-email">${this.escape(this.user?.email || '')}</span>
            </div>
          </div>
          <div class="sh-header-actions">
            ${this.selectedHosting ? '' : '<button class="btn btn-secondary btn-sm" onclick="SelfHost.logout()">Sign Out</button>'}
          </div>
        </div>
        ${bodyHtml}
      </div>`;
  },

  selecthosting(id) {
    this.selectedHosting = this.hostingServers.find((h) => h.id === id) || null;
    this.tab = 'connections';
    this.scriptData = null;
    if (this.selectedHosting) {
      this.fetchhostingdata(id).then(() => this.render());
    }
  },

  goback() {
    this.selectedHosting = null;
    this.connections = [];
    this.rules = [];
    this.monitoredServers = [];
    this.logs = [];
    this.scriptData = null;
    this.stoplogpoll();
    this.fetchhosting().then(() => this.render());
  },

  switchtab(tab) {
    this.tab = tab;
    if (tab === 'logs') this.startlogpoll();
    else this.stoplogpoll();
    this.render();
  },

  startlogpoll() {
    this.stoplogpoll();
    if (!this.selectedHosting) return;
    this._logPoll = setInterval(async () => {
      try {
        const data = await this.api('GET', `/api/hosting/${this.selectedHosting.id}/logs`);
        this.logs = data.logs || [];
        this.renderlogscontent();
      } catch (e) {}
    }, 5000);
  },

  stoplogpoll() {
    if (this._logPoll) {
      clearInterval(this._logPoll);
      this._logPoll = null;
    }
  },

  async addhosting() {
    const name = document.getElementById('shNewName')?.value?.trim();
    const ip = document.getElementById('shNewIp')?.value?.trim();
    if (!name || !ip) {
      this.showtoast('Please fill in all fields', 'error');
      return;
    }
    this.loading = true;
    this.render();
    try {
      const data = await this.api('POST', '/api/hosting', { name, ip });
      this.hostingServers.push(data.server);
      this.showtoast('Hosting server added!');
    } catch (e) {
      this.showtoast(e.message || 'Failed to add server', 'error');
    } finally {
      this.loading = false;
      this.render();
    }
  },

  async deletehosting(id) {
    Modal.confirm('Delete Hosting Server', 'Are you sure? This will delete all connections, rules, and monitored servers for this hosting server.', async () => {
      try {
        await this.api('DELETE', `/api/hosting/${id}`);
        this.hostingServers = this.hostingServers.filter((h) => h.id !== id);
        this.showtoast('Hosting server deleted!');
        this.render();
      } catch (e) {
        this.showtoast(e.message || 'Delete failed', 'error');
      }
    });
  },

  renderconnectionstab() {
    let connsHtml = '';
    for (const c of this.connections) {
      connsHtml += `
        <div class="sh-conn-card">
          <div class="sh-conn-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </div>
          <div class="sh-conn-info">
            <div class="sh-conn-name">${this.escape(c.name)}</div>
            <div class="sh-conn-type">${c.type}</div>
          </div>
          <div class="sh-conn-actions">
            <span class="sh-conn-status ${c.enabled ? 'sh-conn-enabled' : 'sh-conn-disabled'}">${c.enabled ? 'Active' : 'Disabled'}</span>
            <button class="sh-action-btn" onclick="SelfHost.openembededitor(${c.id})">Embeds</button>
            <button class="sh-action-btn sh-action-danger" onclick="SelfHost.deleteconnection(${c.id})">Delete</button>
          </div>
        </div>`;
    }
    return `
      <div class="sh-connections">
        <div class="sh-section-header">
          <h3>Discord Connections (${this.connections.length})</h3>
          <button class="btn btn-primary btn-sm" onclick="document.getElementById('shConnForm').style.display=document.getElementById('shConnForm').style.display==='none'?'':'none'">+ Add Connection</button>
        </div>
        <div id="shConnForm" style="display:none;">
          <div class="sh-create-form">
            <div class="sh-form-group">
              <label>Connection Name</label>
              <input type="text" id="shConnName" class="sh-input" placeholder="My Discord">
            </div>
            <div class="sh-form-group">
              <label>Discord Webhook URL</label>
              <input type="text" id="shConnWebhook" class="sh-input" placeholder="https://discord.com/api/webhooks/...">
            </div>
            <div class="sh-form-actions">
              <button class="btn btn-secondary btn-sm" onclick="document.getElementById('shConnForm').style.display='none'">Cancel</button>
              <button class="btn btn-primary btn-sm" onclick="SelfHost.addconnection()" ${this.loading ? 'disabled' : ''}>Add Connection</button>
            </div>
          </div>
        </div>
        <div id="shEmbedEditor" style="display:none;"></div>
        <div class="sh-conn-list">${connsHtml || '<div class="sh-empty"><p>No connections yet. Add a Discord webhook to receive notifications.</p></div>'}</div>
      </div>`;
  },

  _defaultEmbedTemplates() {
    return {
      offline: { title: 'Server OFFLINE', description: '**{name}** is now OFFLINE.', color: 16734264 },
      online: { title: 'Server ONLINE', description: '**{name}** is now ONLINE.', color: 65280 },
      starting: { title: 'Server STARTING', description: '**{name}** is now STARTING.', color: 16776960 },
      ram: { title: 'RAM Alert', description: '**{name}**: RAM at {ram_pct}% (threshold: {thr}%).', color: 16734264 },
      cpu: { title: 'CPU Alert', description: '**{name}**: CPU at {cpu_load}% (threshold: {thr}%).', color: 16734264 },
      disk: { title: 'Disk Alert', description: '**{name}**: Disk at {disk_pct}% (threshold: {thr}%).', color: 16734264 },
    };
  },

  openembededitor(connId) {
    const conn = this.connections.find((c) => c.id === connId);
    if (!conn) return;
    const existing = conn.embed_templates ? (typeof conn.embed_templates === 'string' ? JSON.parse(conn.embed_templates) : conn.embed_templates) : {};
    const defaults = this._defaultEmbedTemplates();
    const templates = { ...defaults, ...existing };
    const events = ['offline', 'online', 'starting', 'ram', 'cpu', 'disk'];
    const vars = '{name} {status} {ram_pct} {ram_used} {ram_total} {cpu_load} {disk_pct} {disk_used} {disk_total} {type}';

    let html = `
      <div class="sh-create-form" style="margin-bottom:16px;">
        <div class="sh-form-group">
          <label style="font-weight:600;font-size:14px;">Edit Embed Messages — ${this.escape(conn.name)}</label>
          <div class="sh-muted" style="font-size:12px;margin-bottom:12px;">Available variables: <code style="background:rgba(255,255,255,0.08);padding:2px 6px;border-radius:4px;font-size:11px;">${vars}</code></div>
        </div>`;

    for (const ev of events) {
      const t = templates[ev] || defaults[ev];
      const colorHex = '#' + (t.color || 16734264).toString(16).padStart(6, '0');
      html += `
        <div class="sh-form-group" style="border-bottom:1px solid rgba(255,255,255,0.06);padding-bottom:12px;margin-bottom:12px;">
          <label style="font-weight:500;text-transform:capitalize;">${ev} Embed</label>
          <div style="display:flex;gap:8px;margin-top:6px;">
            <input type="text" class="sh-input sh-embed-title" data-event="${ev}" value="${this.escape(t.title || '')}" placeholder="Title" style="flex:1;">
            <input type="color" class="sh-embed-color" data-event="${ev}" value="${colorHex}" style="width:40px;height:34px;padding:2px;cursor:pointer;border:1px solid rgba(255,255,255,0.1);border-radius:6px;background:transparent;">
          </div>
          <textarea class="sh-input sh-embed-desc" data-event="${ev}" rows="2" placeholder="Description" style="margin-top:6px;width:100%;resize:vertical;">${this.escape(t.description || '')}</textarea>
        </div>`;
    }

    html += `
        <div class="sh-form-actions">
          <button class="btn btn-secondary btn-sm" onclick="document.getElementById('shEmbedEditor').style.display='none'">Cancel</button>
          <button class="btn btn-primary btn-sm" onclick="SelfHost.saveembedtemplates(${connId})">Save</button>
        </div>
      </div>`;

    const editor = document.getElementById('shEmbedEditor');
    editor.innerHTML = html;
    editor.style.display = '';
  },

  async saveembedtemplates(connId) {
    const events = ['offline', 'online', 'starting', 'ram', 'cpu', 'disk'];
    const templates = {};
    for (const ev of events) {
      const title = document.querySelector(`.sh-embed-title[data-event="${ev}"]`)?.value || '';
      const desc = document.querySelector(`.sh-embed-desc[data-event="${ev}"]`)?.value || '';
      const colorHex = document.querySelector(`.sh-embed-color[data-event="${ev}"]`)?.value || '#ff0000';
      const color = parseInt(colorHex.replace('#', ''), 16);
      templates[ev] = { title, description: desc, color };
    }
    try {
      const data = await this.api('PUT', `/api/hosting/${this.selectedHosting.id}/connections/${connId}`, {
        embed_templates: templates,
      });
      const idx = this.connections.findIndex((c) => c.id === connId);
      if (idx >= 0) this.connections[idx] = data.connection;
      document.getElementById('shEmbedEditor').style.display = 'none';
      this.showtoast('Embed templates saved!');
    } catch (e) {
      this.showtoast(e.message || 'Failed to save', 'error');
    }
  },

  async addconnection() {
    const name = document.getElementById('shConnName')?.value?.trim();
    const webhook = document.getElementById('shConnWebhook')?.value?.trim();
    if (!name || !webhook) {
      this.showtoast('Please fill in all fields', 'error');
      return;
    }
    this.loading = true;
    this.render();
    try {
      const data = await this.api('POST', `/api/hosting/${this.selectedHosting.id}/connections`, {
        name,
        webhook_url: webhook,
      });
      this.connections.push(data.connection);
      this.showtoast('Connection added!');
    } catch (e) {
      this.showtoast(e.message || 'Failed to add connection', 'error');
    } finally {
      this.loading = false;
      this.render();
    }
  },

  async deleteconnection(id) {
    Modal.confirm('Delete Connection', 'Are you sure?', async () => {
      try {
        await this.api('DELETE', `/api/hosting/${this.selectedHosting.id}/connections/${id}`);
        this.connections = this.connections.filter((c) => c.id !== id);
        this.rules = this.rules.filter((r) => {
          const ids = String(r.connection_ids || '').split(',').map(Number);
          return !ids.includes(id);
        });
        this.showtoast('Connection deleted!');
        this.render();
      } catch (e) {
        this.showtoast(e.message || 'Delete failed', 'error');
      }
    });
  },

  onruletypechange() {
    const type = document.getElementById('shRuleType')?.value;
    const thr = document.getElementById('shRuleThresholdGroup');
    const start = document.getElementById('shRuleStartingGroup');
    const desc = document.getElementById('shRuleStartingDesc');
    const metric = type === 'ram' || type === 'cpu' || type === 'disk';
    if (thr) thr.style.display = (type === 'offline' || type === 'online' || type === 'starting') ? 'none' : '';
    if (start) start.style.display = (type === 'starting') ? 'none' : '';
    if (desc) {
      if (type === 'offline') {
        desc.textContent = 'When on, notifies when server goes offline from Starting state (e.g. server tried to start but failed). When off, only notifies when going offline from Online.';
      } else if (type === 'online') {
        desc.textContent = 'When on, notifies when server comes online from Starting state. When off, only notifies when coming online from Offline.';
      } else {
        desc.textContent = 'When off, RAM/CPU/Disk alerts are skipped while a Pterodactyl server is starting.';
      }
    }
  },

  renderrulestab() {
    let rulesHtml = '';
    for (const r of this.rules) {
      const monServer = this.monitoredServers.find((s) => s.id === r.monitored_server_id);
      const serverName = monServer ? monServer.server_name : 'All Servers';
      const connNames = String(r.connection_ids || '').split(',').map((id) => {
        const conn = this.connections.find((c) => c.id === parseInt(id, 10));
        return conn ? conn.name : 'Unknown';
      }).join(', ');
      const metric = r.rule_type === 'ram' || r.rule_type === 'cpu' || r.rule_type === 'disk';
      const statusRule = r.rule_type === 'offline' || r.rule_type === 'online';
      const thrText = (r.rule_type === 'offline' || r.rule_type === 'online' || r.rule_type === 'starting')
        ? 'No threshold'
        : 'Threshold: ' + r.threshold;
      const startText = (metric || statusRule) ? (r.on_starting ? ' | Starting: on' : ' | Starting: off') : '';
      rulesHtml += `
        <div class="sh-rule-card">
          <div class="sh-rule-info">
            <div class="sh-rule-type">${r.rule_type.toUpperCase()}</div>
            <div class="sh-rule-desc">${thrText}${startText} | Server: ${this.escape(serverName)}</div>
            <div class="sh-rule-conns">Notifications: ${this.escape(connNames)}</div>
          </div>
          <button class="sh-action-btn sh-action-danger" onclick="SelfHost.deleterule(${r.id})">Delete</button>
        </div>`;
    }

    const serverOptions = this.monitoredServers.map((s) =>
      `<option value="${s.id}">${this.escape(s.server_name)}</option>`
    ).join('');
    const connCheckboxes = this.connections.map((c) =>
      `<label class="sh-checkbox"><input type="checkbox" class="sh-rule-conn" value="${c.id}"> ${this.escape(c.name)}</label>`
    ).join('');

    return `
      <div class="sh-rules">
        <div class="sh-section-header">
          <h3>Alert Rules (${this.rules.length})</h3>
          <button class="btn btn-primary btn-sm" onclick="document.getElementById('shRuleForm').style.display=document.getElementById('shRuleForm').style.display==='none'?'':'none'">+ Add Rule</button>
        </div>
        <div id="shRuleForm" style="display:none;">
          <div class="sh-create-form">
            <div class="sh-form-row">
              <div class="sh-form-group">
                <label>Server</label>
                <select id="shRuleServer" class="sh-input">
                  <option value="">All Servers</option>
                  ${serverOptions}
                </select>
              </div>
              <div class="sh-form-group">
                <label>Rule Type</label>
                <select id="shRuleType" class="sh-input" onchange="SelfHost.onruletypechange()">
                  <option value="ram">RAM Usage (%)</option>
                  <option value="cpu">CPU Load</option>
                  <option value="disk">Disk Usage (%)</option>
                  <option value="offline">Went Offline</option>
                  <option value="online">Went Online</option>
                  <option value="starting">Went Starting</option>
                </select>
              </div>
              <div class="sh-form-group" id="shRuleThresholdGroup">
                <label>Threshold</label>
                <input type="number" id="shRuleThreshold" class="sh-input" placeholder="90" min="0" max="100">
              </div>
            </div>
            <div class="sh-form-group" id="shRuleStartingGroup">
              <label class="sh-checkbox">
                <input type="checkbox" id="shRuleOnStarting"> Working on Starting state
              </label>
              <div class="sh-muted" style="margin-top:6px;font-size:12px;" id="shRuleStartingDesc">When on, RAM/CPU/Disk alerts are skipped while a Pterodactyl server is starting.</div>
            </div>
            <div class="sh-form-group">
              <label>Send notifications to:</label>
              <div class="sh-checkbox-group">${connCheckboxes || '<span class="sh-muted">No connections available</span>'}</div>
            </div>
            <div class="sh-form-actions">
              <button class="btn btn-secondary btn-sm" onclick="document.getElementById('shRuleForm').style.display='none'">Cancel</button>
              <button class="btn btn-primary btn-sm" onclick="SelfHost.addrule()" ${this.loading ? 'disabled' : ''}>Add Rule</button>
            </div>
          </div>
        </div>
        <div class="sh-rules-list">${rulesHtml || '<div class="sh-empty"><p>No rules yet. Add a rule to get notifications when thresholds are exceeded.</p></div>'}</div>
      </div>`;
  },

  async addrule() {
    const serverId = document.getElementById('shRuleServer')?.value;
    const ruleType = document.getElementById('shRuleType')?.value;
    const threshold = document.getElementById('shRuleThreshold')?.value;
    const onStarting = !!document.getElementById('shRuleOnStarting')?.checked;
    const connIds = Array.from(document.querySelectorAll('.sh-rule-conn:checked')).map((c) => c.value);
    if (!ruleType || connIds.length === 0) {
      this.showtoast('Please fill in all fields and select at least one connection', 'error');
      return;
    }
    const needsThreshold = ruleType !== 'offline' && ruleType !== 'online' && ruleType !== 'starting';
    if (needsThreshold && !threshold) {
      this.showtoast('Threshold is required for this rule type', 'error');
      return;
    }
    this.loading = true;
    this.render();
    try {
      const data = await this.api('POST', `/api/hosting/${this.selectedHosting.id}/rules`, {
        monitored_server_id: serverId ? parseInt(serverId, 10) : null,
        rule_type: ruleType,
        threshold: needsThreshold ? parseFloat(threshold) : 0,
        connection_ids: connIds.join(','),
        on_starting: onStarting,
      });
      this.rules.push(data.rule);
      this.showtoast('Rule added!');
    } catch (e) {
      this.showtoast(e.message || 'Failed to add rule', 'error');
    } finally {
      this.loading = false;
      this.render();
    }
  },

  async deleterule(id) {
    Modal.confirm('Delete Rule', 'Are you sure?', async () => {
      try {
        await this.api('DELETE', `/api/hosting/${this.selectedHosting.id}/rules/${id}`);
        this.rules = this.rules.filter((r) => r.id !== id);
        this.showtoast('Rule deleted!');
        this.render();
      } catch (e) {
        this.showtoast(e.message || 'Delete failed', 'error');
      }
    });
  },

  _logicon(event) {
    if (event === 'server_online') return '<span class="sh-log-icon sh-log-online">ON</span>';
    if (event === 'server_offline') return '<span class="sh-log-icon sh-log-offline">OFF</span>';
    if (event === 'alert_triggered') return '<span class="sh-log-icon sh-log-alert">!</span>';
    return '<span class="sh-log-icon sh-log-default">i</span>';
  },

  _logeventname(event) {
    const map = {
      'server_online': 'Server Online',
      'server_offline': 'Server Offline',
      'alert_triggered': 'Alert Triggered',
      'rule_added': 'Rule Added',
      'server_added': 'Server Added',
      'hosting_added': 'Hosting Added',
      'hosting_removed': 'Hosting Removed',
      'server_removed': 'Server Removed',
      'rule_removed': 'Rule Removed',
    };
    return map[event] || event.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  },

  _logitemshtml() {
    let logsHtml = '';
    for (const l of this.logs) {
      logsHtml += `
        <div class="sh-log-item">
          ${this._logicon(l.event)}
          <div class="sh-log-info">
            <div class="sh-log-title">${this.escape(l.server_name || 'System')} &mdash; ${this._logeventname(l.event)}</div>
            <div class="sh-log-details">${this.escape(l.details || '')}</div>
          </div>
          <div class="sh-log-time">${this.escape(l.created_at || '')}</div>
        </div>`;
    }
    return logsHtml || '<div class="sh-empty"><p>No logs yet.</p></div>';
  },

  renderlogstab() {
    return `
      <div class="sh-logs">
        <div class="sh-section-header">
          <h3>Recent Logs (${this.logs.length})</h3>
        </div>
        <div class="sh-logs-list" id="shLogsList">${this._logitemshtml()}</div>
      </div>`;
  },

  renderlogscontent() {
    const list = document.getElementById('shLogsList');
    if (!list) return;
    list.innerHTML = this._logitemshtml();
  },

  renderserverstab() {
    const dashServers = (typeof Servers !== 'undefined' && Servers.list) ? Servers.list : [];
    let monitoredHtml = '';
    for (const m of this.monitoredServers) {
      const statusClass = m.status === 'online' ? 'sh-status-online' : m.status === 'offline' ? 'sh-status-offline' : 'sh-status-unknown';
      const statusText = m.status === 'online' ? 'Online' : m.status === 'offline' ? 'Offline' : 'Unknown';
      const ramPct = m.ram_total > 0 ? Math.round((m.ram_used / m.ram_total) * 100) : 0;
      const diskPct = m.disk_total > 0 ? Math.round((m.disk_used / m.disk_total) * 100) : 0;
      const cpuVal = Math.round(Number(m.cpu_load) || 0);
      monitoredHtml += `
        <div class="sh-server-card">
          <div class="sh-server-header">
            <div class="sh-server-name">${this.escape(m.server_name)}</div>
            <div class="sh-server-actions">
              <span class="sh-status-dot ${statusClass}"></span>
              <span class="sh-status-text">${statusText}</span>
              <button class="sh-action-btn sh-action-danger" onclick="SelfHost.removeserver(${m.id})">Remove</button>
            </div>
          </div>
          <div class="sh-server-info">
            <span class="sh-server-ip">${this.escape(m.server_ip || '')}:${m.server_port || ''}</span>
            <span class="sh-server-ram">RAM: ${ramPct}%</span>
            <span class="sh-server-cpu">CPU: ${cpuVal}%</span>
            <span class="sh-server-disk">Disk: ${diskPct}%</span>
          </div>
        </div>`;
    }

    const unmonitored = dashServers.filter((ds) =>
      !this.monitoredServers.some((m) => m.dashboard_idx === dashServers.indexOf(ds))
    );
    const optionsHtml = unmonitored.map((ds) => {
      const idx = dashServers.indexOf(ds);
      return `<option value="${idx}">${this.escape(ds.name || ds.host || 'Server ' + (idx + 1))}</option>`;
    }).join('');

    return `
      <div class="sh-servers">
        <div class="sh-section-header">
          <h3>Monitored Servers (${this.monitoredServers.length})</h3>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-secondary btn-sm" onclick="SelfHost.fetchhostingdata(${this.selectedHosting.id}).then(()=>SelfHost.render())">Refresh</button>
          </div>
        </div>
        <div id="shAddServerForm" style="display:none;margin-bottom:16px;">
          <div class="sh-create-form">
            <div class="sh-form-row">
              <div class="sh-form-group">
                <label>Select Dashboard Server</label>
                <select id="shAddServerIdx" class="sh-input">${optionsHtml || '<option value="">No servers available</option>'}</select>
              </div>
              <div class="sh-form-group" style="display:flex;align-items:flex-end;">
                <button class="btn btn-primary btn-sm" onclick="SelfHost.addserver()" ${this.loading ? 'disabled' : ''}>Add</button>
              </div>
            </div>
          </div>
        </div>
        <div class="sh-servers-grid">${monitoredHtml || '<div class="sh-empty"><p>No servers being monitored. Click "Add Server" to start.</p></div>'}</div>
        <div style="margin-top:12px;display:flex;gap:8px;">
          ${unmonitored.length > 0 ? `<button class="btn btn-primary btn-sm" onclick="document.getElementById('shAddServerForm').style.display=document.getElementById('shAddServerForm').style.display==='none'?'':'none'">+ Add Server</button>` : ''}
          ${unmonitored.length > 0 ? `<button class="btn btn-secondary btn-sm" onclick="SelfHost.addallservers()">Add All</button>` : ''}
        </div>
      </div>`;
  },

  async addserver() {
    const idx = parseInt(document.getElementById('shAddServerIdx')?.value, 10);
    if (isNaN(idx)) {
      this.showtoast('Select a server', 'error');
      return;
    }
    const dashServers = (typeof Servers !== 'undefined' && Servers.list) ? Servers.list : [];
    const ds = dashServers[idx];
    if (!ds) {
      this.showtoast('Server not found', 'error');
      return;
    }
    this.loading = true;
    this.render();
    try {
      const payload = await this.buildserverpayload(ds, idx);
      const data = await this.api('POST', `/api/hosting/${this.selectedHosting.id}/servers`, payload);
      this.monitoredServers.push(data.server);
      this.showtoast('Server added to monitoring!');
    } catch (e) {
      this.showtoast(e.message || 'Failed to add server', 'error');
    } finally {
      this.loading = false;
      this.render();
    }
  },

  async addallservers() {
    const dashServers = (typeof Servers !== 'undefined' && Servers.list) ? Servers.list : [];
    const unmonitored = dashServers
      .map((ds, i) => ({ ds, i }))
      .filter((x) => !this.monitoredServers.some((m) => m.dashboard_idx === x.i));
    if (unmonitored.length === 0) {
      this.showtoast('No new servers to add', 'error');
      return;
    }
    this.loading = true;
    this.render();
    try {
      const payload = [];
      for (const x of unmonitored) {
        payload.push(await this.buildserverpayload(x.ds, x.i));
      }
      const data = await this.api('POST', `/api/hosting/${this.selectedHosting.id}/servers/add-all`, { servers: payload });
      this.showtoast(`${data.added} servers added!`);
      await this.fetchhostingdata(this.selectedHosting.id);
    } catch (e) {
      this.showtoast(e.message || 'Failed to add servers', 'error');
    } finally {
      this.loading = false;
      this.render();
    }
  },

  async removeserver(id) {
    Modal.confirm('Remove Server', 'Remove this server from monitoring?', async () => {
      try {
        await this.api('DELETE', `/api/hosting/${this.selectedHosting.id}/servers/${id}`);
        this.monitoredServers = this.monitoredServers.filter((m) => m.id !== id);
        this.rules = this.rules.filter((r) => r.monitored_server_id !== id);
        this.showtoast('Server removed!');
        this.render();
      } catch (e) {
        this.showtoast(e.message || 'Remove failed', 'error');
      }
    });
  },

  renderscripttab() {
    const hosting = this.selectedHosting;
    return `
      <div class="sh-script">
        <div class="sh-section-header">
          <h3>Installation Script</h3>
        </div>
        <div class="sh-script-card">
          <p class="sh-muted">Generate an installation command for your VPS. The agent listens on port 6055 for live config pushes and keeps one SSH session open per monitored VPS.</p>
          <div class="sh-form-row">
            <div class="sh-form-group">
              <label>Report Cooldown (seconds)</label>
              <select id="shCooldown" class="sh-input" onchange="document.getElementById('shCustomCooldown').style.display=this.value==='custom'?'':'none'">
                <option value="5">5s</option>
                <option value="10">10s</option>
                <option value="15">15s</option>
                <option value="20">20s</option>
                <option value="25">25s</option>
                <option value="30" ${hosting.cooldown === 30 ? 'selected' : ''}>30s</option>
                <option value="35">35s</option>
                <option value="40">40s</option>
                <option value="45">45s</option>
                <option value="50">50s</option>
                <option value="55">55s</option>
                <option value="60">60s</option>
                <option value="custom">Custom (5-300s)</option>
              </select>
            </div>
            <div class="sh-form-group" id="shCustomCooldown" style="display:none;">
              <label>Custom Cooldown (5-300s)</label>
              <input type="number" id="shCustomCooldownInput" class="sh-input" placeholder="${hosting.cooldown}" min="5" max="300" value="${hosting.cooldown}">
            </div>
          </div>
          <button class="btn btn-primary" onclick="SelfHost.generatescript()">Generate Script</button>
        </div>
        ${this.scriptData ? `
          <div class="sh-script-result">
            <div class="sh-script-section">
              <h4>API Key</h4>
              <div class="sh-cmd">
                <span>${this.escape(this.scriptData.api_key)}</span>
                <button class="sh-copy-btn" onclick="SelfHost.copytoclipboard(SelfHost.scriptData.api_key)">Copy</button>
              </div>
            </div>
            <div class="sh-script-section">
              <h4>Install Command</h4>
              <p class="sh-muted">Run as root. Allow inbound TCP 6055 so nsrv.ctrlservers.xyz can push new servers/rules instantly.</p>
              <div class="sh-cmd">
                <span>${this.escape(this.scriptData.install_command)}</span>
                <button class="sh-copy-btn" onclick="SelfHost.copytoclipboard(SelfHost.scriptData.install_command)">Copy</button>
              </div>
            </div>
          </div>
        ` : ''}
      </div>`;
  },

  async generatescript() {
    const cdSelect = document.getElementById('shCooldown');
    let cooldown = cdSelect?.value === 'custom'
      ? parseInt(document.getElementById('shCustomCooldownInput')?.value, 10)
      : parseInt(cdSelect?.value, 10);
    cooldown = Math.max(5, Math.min(300, cooldown || 30));
    this.loading = true;
    this.render();
    try {
      await this.api('POST', `/api/hosting/${this.selectedHosting.id}/cooldown`, { cooldown });
      this.selectedHosting.cooldown = cooldown;
      this.scriptData = await this.api('GET', `/api/hosting/${this.selectedHosting.id}/script`);
      this.showtoast('Script generated!');
    } catch (e) {
      this.showtoast(e.message || 'Failed to generate script', 'error');
    } finally {
      this.loading = false;
      this.render();
    }
  },

  copytoclipboard(text) {
    navigator.clipboard.writeText(text)
      .then(() => this.showtoast('Copied to clipboard!'))
      .catch(() => this.showtoast('Copy failed', 'error'));
  },

  rendersettingstab() {
    return `
      <div class="sh-settings">
        <div class="sh-section-header">
          <h3>Settings</h3>
        </div>
        <div class="sh-settings-card">
          <div class="sh-setting-item">
            <div class="sh-setting-info">
              <div class="sh-setting-title">Auto-sync servers when added locally</div>
              <div class="sh-setting-desc">When enabled, adding a server in the dashboard will automatically register it with the monitoring system.</div>
            </div>
            <button class="sh-toggle ${this.autoSync ? 'sh-toggle-on' : ''}" id="shAutoSync" onclick="SelfHost.togglesettings()">
              <div class="sh-toggle-knob"></div>
            </button>
          </div>
        </div>
      </div>`;
  },

  async togglesettings() {
    try {
      this.autoSync = !this.autoSync;
      await this.api('POST', '/api/settings', { auto_sync: this.autoSync });
      this.showtoast('Settings updated!');
      this.render();
    } catch (e) {
      this.autoSync = !this.autoSync;
      this.showtoast('Failed to update settings', 'error');
    }
  },
};
