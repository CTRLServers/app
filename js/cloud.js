const CTRLCloud = {
  API: 'https://cloud.ctrlsrv.net',
  AUTH_URL: 'https://authorization.ctrlservers.xyz',
  token: null,
  user: null,
  syncdata: null,
  autosync: { onLaunch: true, onServerAdd: true, onServerDelete: false },
  loading: false,
  _deepLinkBound: false,

  init() {
    this.token = localStorage.getItem('ctrl_cloud_token');
    this.user = JSON.parse(localStorage.getItem('ctrl_cloud_user') || 'null');
    const as = localStorage.getItem('ctrl_cloud_autosync');
    if (as) {
      try { this.autosync = JSON.parse(as); } catch (e) {}
    }
    if (!this._deepLinkBound) {
      this._deepLinkBound = true;
      window.electronAPI.oncloudaction((data) => {
        if (data && data.token && (!data.source || data.source === 'cloud')) {
          this.token = data.token;
          this.saveauth();
          this.checktoken().then(ok => {
            if (ok) {
              this.fetchautosyncsettings().then(() => this.render());
            } else {
              this.loading = false;
              this.render();
            }
          });
        }
      });
    }
  },

  async api(method, path, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (this.token) opts.headers['Authorization'] = 'Bearer ' + this.token;
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(this.API + path, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  },

  saveauth() {
    localStorage.setItem('ctrl_cloud_token', this.token || '');
    localStorage.setItem('ctrl_cloud_user', JSON.stringify(this.user));
  },

  clearauth() {
    this.token = null;
    this.user = null;
    localStorage.removeItem('ctrl_cloud_token');
    localStorage.removeItem('ctrl_cloud_user');
  },

  async checktoken() {
    if (!this.token) return false;
    try {
      const data = await this.api('GET', '/api/me');
      this.user = data.user;
      this.saveauth();
      return true;
    } catch (e) {
      this.clearauth();
      return false;
    }
  },

  render() {
    const el = Utils.el('tabCloud');
    if (!el) return;
    if (this.loading) {
      el.innerHTML = 'div class="cloud-loading"><svg class="spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15A9 9 0 1 1 5.64 5.64L1 10"/></svg></div>';
      return;
    }
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
              <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
            </svg>
          </div>
          <h2 class="cloud-auth-title">CTRLCloud</h2>
          <p class="cloud-auth-sub">Register or login to continue.</p>
          <div class="cloud-auth-form">
            <button class="btn btn-primary cloud-auth-btn" onclick="CTRLCloud.openauth()">Go to Web</button>
          </div>
          <div class="cloud-auth-error" id="cloudAuthError"></div>
        </div>
      </div>`;
  },

  openauth() {
    const url = this.AUTH_URL + '/cloud-login';
    window.electronAPI.openexternal(url);
  },

  showautherror(msg) {
    const el = document.getElementById('cloudAuthError');
    if (el) el.textContent = msg;
  },

  logout() {
    Modal.confirm('Sign Out', 'Are you sure you want to sign out of CTRLCloud?', () => {
      this.clearauth();
      this.syncdata = null;
      this.render();
    });
  },

  async renderdashboard(el) {
    const displayName = this.user?.username || this.user?.nickname || this.user?.email || '?';
    el.innerHTML = `
      <div class="cloud-dashboard">
        <div class="cloud-header">
          <div class="cloud-header-left">
            <div class="cloud-user-avatar">${displayName[0].toUpperCase()}</div>
            <div class="cloud-user-info">
              <h3 class="cloud-user-name">${Utils.escape(displayName)}</h3>
              <span class="cloud-user-email">${Utils.escape(this.user?.email || '')}</span>
            </div>
          </div>
          <div class="cloud-header-actions">
            <button class="btn btn-secondary btn-sm" onclick="CTRLCloud.logout()">Sign Out</button>
          </div>
        </div>

        <div class="cloud-stats" id="cloudStats">
          <div class="cloud-stat-card">
            <div class="cloud-stat-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
            </div>
            <div class="cloud-stat-info">
              <span class="cloud-stat-val" id="cloudServerCount">-</span>
              <span class="cloud-stat-label">Servers Synced</span>
            </div>
          </div>
          <div class="cloud-stat-card">
            <div class="cloud-stat-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <div class="cloud-stat-info">
              <span class="cloud-stat-val" id="cloudKeyCount">-</span>
              <span class="cloud-stat-label">Keys Synced</span>
            </div>
          </div>
          <div class="cloud-stat-card">
            <div class="cloud-stat-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <div class="cloud-stat-info">
              <span class="cloud-stat-val" id="cloudLastSync">-</span>
              <span class="cloud-stat-label">Last Sync</span>
            </div>
          </div>
        </div>

        <div class="cloud-actions">
          <button class="btn btn-primary" id="cloudSyncBtn" onclick="CTRLCloud.syncupload()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15A9 9 0 1 1 5.64 5.64L1 10"/></svg>
            Sync to Cloud
          </button>
          <button class="btn btn-secondary" id="cloudDownloadBtn" onclick="CTRLCloud.syncdownload()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 10 23 16 17 16"/><path d="M3.51 9A9 9 0 0 1 14.85 3.15L20 9M1 14l5.15 5.85A9 9 0 0 0 20.49 15"/></svg>
            Download from Cloud
          </button>
          <button class="btn btn-red-outline btn-sm" onclick="CTRLCloud.deleteall()">Delete All</button>
        </div>

        <div class="cloud-section">
          <div class="cloud-section-header">
            <h3>Synced Servers</h3>
          </div>
          <div class="cloud-server-list" id="cloudServerList">
            <div class="cloud-loading"><svg class="spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15A9 9 0 1 1 5.64 5.64L1 10"/></svg></div>
          </div>
        </div>

        <div class="cloud-section">
          <div class="cloud-section-header">
            <h3>Auto Sync</h3>
            <p class="cloud-section-desc">Automatically sync servers based on events</p>
          </div>
          <div class="cloud-autosync-options" id="cloudAutosyncOptions">
            <label class="cloud-toggle-row">
              <span class="cloud-toggle-label">
                <span class="cloud-toggle-title">Sync on App Launch</span>
                <span class="cloud-toggle-desc">Sync when the application starts</span>
              </span>
              <input type="checkbox" class="cloud-toggle" id="cloudAutoLaunch" onchange="CTRLCloud.updateautosync()" />
            </label>
            <label class="cloud-toggle-row">
              <span class="cloud-toggle-label">
                <span class="cloud-toggle-title">Sync on Server Add</span>
                <span class="cloud-toggle-desc">Upload when a new server is added</span>
              </span>
              <input type="checkbox" class="cloud-toggle" id="cloudAutoAdd" onchange="CTRLCloud.updateautosync()" />
            </label>
            <label class="cloud-toggle-row">
              <span class="cloud-toggle-label">
                <span class="cloud-toggle-title">Sync on Server Delete</span>
                <span class="cloud-toggle-desc">Upload when a server is removed</span>
              </span>
              <input type="checkbox" class="cloud-toggle" id="cloudAutoDelete" onchange="CTRLCloud.updateautosync()" />
            </label>
          </div>
        </div>
      </div>`;

    this.loadsyncdata();
    this.fillautosynctoggles();
  },

  async loadsyncdata() {
    try {
      const data = await this.api('GET', '/api/sync/list');
      this.syncdata = data;
      this.rendsyncstats(data);
      this.rendsyncservers(data);
    } catch (e) {
      console.error(e);
    }
  },

  rendsyncstats(data) {
    const sc = Utils.el('cloudServerCount');
    const kc = Utils.el('cloudKeyCount');
    const ls = Utils.el('cloudLastSync');
    if (sc) sc.textContent = (data.servers || []).length;
    if (kc) kc.textContent = (data.keychain || []).length;
    if (ls) ls.textContent = data.updatedAt ? this.timeago(data.updatedAt) : 'Never';
  },

  rendsyncservers(data) {
    const el = Utils.el('cloudServerList');
    if (!el) return;
    const servers = data.servers || [];
    if (!servers.length) {
      el.innerHTML = `
        <div class="cloud-empty">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>
          <p>No servers in cloud yet. Click "Sync to Cloud" to upload your servers.</p>
        </div>`;
      return;
    }
    el.innerHTML = servers.map(s => `
      <div class="cloud-server-item">
        <div class="cloud-server-icon">
          ${s.type === 'Pterodactyl' ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>' :
            s.type === 'VPS/VDS' ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>' :
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>'}
        </div>
        <div class="cloud-server-info">
          <span class="cloud-server-name">${Utils.escape(s.name)}</span>
          <span class="cloud-server-type">${Utils.escape(s.type)}</span>
        </div>
        <button class="btn-icon btn-danger-sm" onclick="CTRLCloud.deleteserver('${Utils.escape(String(s.id))}')" title="Remove from cloud">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </div>
      </div>`).join('');
  },

  async syncupload() {
    const btn = Utils.el('cloudSyncBtn');
    if (btn) btn.disabled = true;
    try {
      await this.api('POST', '/api/sync/upload', {
        servers: Servers.list,
        keychain: ServerKeychain.keys,
        folders: Servers.folders
      });
      await this.loadsyncdata();
      Modal.alert('Sync Complete', 'Your servers have been uploaded to the cloud.');
    } catch (e) {
      Modal.alert('Sync Failed', e.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  async syncdownload() {
    try {
      const data = await this.api('GET', '/api/sync/list');
      if (!data.servers || !data.servers.length) {
        Modal.alert('No Data', 'There are no servers stored in the cloud.');
        return;
      }
      Modal.confirm('Download from Cloud', `This will replace your current ${Servers.list.length} server(s) with ${data.servers.length} from the cloud. Continue?`, async () => {
        Servers.list = data.servers;
        ServerKeychain.keys = data.keychain || [];
        Servers.folders = data.folders || [];
        Servers.save();
        ServerKeychain.save();
        Servers.render();
        Servers.renderworkspaces();
        ServerKeychain.renderall();
        this.syncdata = data;
        this.rendsyncstats(data);
        this.rendsyncservers(data);
        Modal.alert('Download Complete', `Downloaded ${data.servers.length} server(s) from cloud.`);
      });
    } catch (e) {
      Modal.alert('Download Failed', e.message);
    }
  },

  async deleteserver(id) {
    Modal.confirm('Remove Server', 'Remove this server from cloud? It will not be deleted locally.', async () => {
      try {
        await this.api('DELETE', '/api/sync/servers/' + id);
        await this.loadsyncdata();
      } catch (e) {
        Modal.alert('Error', e.message);
      }
    });
  },

  deleteall() {
    Modal.confirm('Delete All Data', 'This will permanently delete all your synced servers, keys, and folders from the cloud. This cannot be undone.', async () => {
      try {
        await this.api('DELETE', '/api/sync/all');
        this.syncdata = null;
        this.render();
      } catch (e) {
        Modal.alert('Error', e.message);
      }
    });
  },

  async fetchautosyncsettings() {
    try {
      const data = await this.api('GET', '/api/autosync');
      this.autosync = data.settings;
      localStorage.setItem('ctrl_cloud_autosync', JSON.stringify(this.autosync));
    } catch (e) {
      console.error(e);
    }
  },

  fillautosynctoggles() {
    const al = Utils.el('cloudAutoLaunch');
    const aa = Utils.el('cloudAutoAdd');
    const ad = Utils.el('cloudAutoDelete');
    if (al) al.checked = this.autosync.onLaunch;
    if (aa) aa.checked = this.autosync.onServerAdd;
    if (ad) ad.checked = this.autosync.onServerDelete;
  },

  async updateautosync() {
    this.autosync.onLaunch = Utils.el('cloudAutoLaunch')?.checked || false;
    this.autosync.onServerAdd = Utils.el('cloudAutoAdd')?.checked || false;
    this.autosync.onServerDelete = Utils.el('cloudAutoDelete')?.checked || false;
    localStorage.setItem('ctrl_cloud_autosync', JSON.stringify(this.autosync));
    try {
      await this.api('POST', '/api/autosync', this.autosync);
    } catch (e) {
      console.error(e);
    }
  },

  async autosyncupload(event) {
    if (!this.token) return;
    if (event === 'add' && !this.autosync.onServerAdd) return;
    if (event === 'delete' && !this.autosync.onServerDelete) return;
    try {
      await this.api('POST', '/api/sync/upload', {
        servers: Servers.list,
        keychain: ServerKeychain.keys,
        folders: Servers.folders
      });
    } catch (e) {
      console.error('Auto sync failed:', e);
    }
  },

  async autosynconlaunch() {
    if (!this.token) return;
    if (!this.autosync.onLaunch) return;
    try {
      await this.api('POST', '/api/sync/upload', {
        servers: Servers.list,
        keychain: ServerKeychain.keys,
        folders: Servers.folders
      });
    } catch (e) {
      console.error('Auto sync launch failed:', e);
    }
  },

  timeago(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    const days = Math.floor(hrs / 24);
    return days + 'd ago';
  }
};
