const SFTP = {
  id: null,
  currentPath: '/',
  files: [],
  selected: new Set(),
  savedConnections: [],

  load() {
    this.savedConnections = this.loadsaved();
    this.render();
  },

  loadsaved() {
    try { return JSON.parse(localStorage.getItem('ctrlservers_sftp') || '[]'); }
    catch { return []; }
  },

  savesaved() {
    localStorage.setItem('ctrlservers_sftp', JSON.stringify(this.savedConnections));
  },

  async connect(cfg) {
    this._lastError = null;
    try {
      this.id = await window.electronAPI.sftpconnect({
        host: cfg.host,
        port: cfg.port || 22,
        username: cfg.username,
        authType: cfg.authType || 'password',
        password: cfg.password || '',
        privateKey: cfg.privateKey || ''
      });
      this.currentPath = '/';
      await this.listfiles('/');
      this.showbrowser();
    } catch (e) {
      this.render();
      this.showauth();
      setTimeout(() => {
        const errEl = document.getElementById('sftpAuthError');
        if (errEl) {
          errEl.style.display = '';
          errEl.textContent = 'Connection failed: ' + (e.message || String(e));
        }
      }, 20);
    }
  },

  async disconnect() {
    if (this.id) {
      try { await window.electronAPI.sftpdisconnect(this.id); } catch {}
      this.id = null;
    }
    this.files = [];
    this.selected.clear();
    this.showauth();
  },

  async listfiles(dir) {
    this.currentPath = dir || '/';
    this.selected.clear();
    this.files = [];
    this._listError = null;
    try {
      const list = await window.electronAPI.sftplist(this.id, this.currentPath);
      this.files = list
        .filter(f => f.filename !== '.' && f.filename !== '..')
        .map(f => ({
          name: f.filename,
          isDir: (f.attrs.mode & 0o40000) !== 0,
          size: f.attrs.size,
          mtime: f.attrs.mtime,
          mode: f.attrs.mode
        }))
        .sort((a, b) => {
          if (a.isDir && !b.isDir) return -1;
          if (!a.isDir && b.isDir) return 1;
          return a.name.localeCompare(b.name);
        });
    } catch (e) {
      const msg = e.message || String(e);
      if (msg.includes('not connected') || msg.includes('ECONNRESET') || msg.includes('EPIPE')) {
        this._listError = 'Connection lost';
        this.id = null;
        setTimeout(() => this.showauth(), 1500);
      } else {
        this._listError = msg.includes('Permission denied') ? 'Permission denied' :
                          msg.includes('No such file') ? 'Directory not found' :
                          'Cannot access: ' + msg;
      }
      console.error('SFTP list error:', e);
    }
    this.renderbrowser();
  },

  navigate(name) {
    if (name === '..') {
      const parts = this.currentPath.replace(/\/$/, '').split('/');
      parts.pop();
      this.listfiles(parts.join('/') || '/');
    } else {
      const sep = this.currentPath.endsWith('/') ? '' : '/';
      this.listfiles(this.currentPath + sep + name);
    }
  },

  async createfile() {
    const name = await this.promptmodal('Create File', 'File name:');
    if (!name) return;
    const sep = this.currentPath.endsWith('/') ? '' : '/';
    try {
      await window.electronAPI.sftpwrite(this.id, this.currentPath + sep + name, '');
      await this.listfiles(this.currentPath);
    } catch (e) { alert('Error: ' + e.message); }
  },

  async createfolder() {
    const name = await this.promptmodal('Create Folder', 'Folder name:');
    if (!name) return;
    const sep = this.currentPath.endsWith('/') ? '' : '/';
    try {
      await window.electronAPI.sftpmkdir(this.id, this.currentPath + sep + name);
      await this.listfiles(this.currentPath);
    } catch (e) { alert('Error: ' + e.message); }
  },

  async uploadfile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = async () => {
      for (const file of input.files) {
        const buf = await file.arrayBuffer();
        const sep = this.currentPath.endsWith('/') ? '' : '/';
        try {
          await window.electronAPI.sftpupload(this.id, this.currentPath + sep + file.name, buf);
        } catch (e) { alert('Upload failed: ' + e.message); }
      }
      await this.listfiles(this.currentPath);
    };
    input.click();
  },

  async deletefile(name) {
    const sep = this.currentPath.endsWith('/') ? '' : '/';
    const fullPath = this.currentPath + sep + name;
    try {
      await window.electronAPI.sftpdelete(this.id, fullPath);
      await this.listfiles(this.currentPath);
    } catch (e) {
      try {
        await window.electronAPI.sftprmdir(this.id, fullPath);
        await this.listfiles(this.currentPath);
      } catch (e2) { alert('Error: ' + e2.message); }
    }
  },

  async deleteselected() {
    if (!this.selected.size) return;
    const sep = this.currentPath.endsWith('/') ? '' : '/';
    for (const name of this.selected) {
      try {
        const p = this.currentPath + sep + name;
        try { await window.electronAPI.sftpdelete(this.id, p); }
        catch { await window.electronAPI.sftprmdir(this.id, p); }
      } catch {}
    }
    await this.listfiles(this.currentPath);
  },

  async renamefile(oldName) {
    const newName = await this.promptmodal('Rename', 'New name:', oldName);
    if (!newName || newName === oldName) return;
    const sep = this.currentPath.endsWith('/') ? '' : '/';
    try {
      await window.electronAPI.sftprename(this.id, this.currentPath + sep + oldName, this.currentPath + sep + newName);
      await this.listfiles(this.currentPath);
    } catch (e) { alert('Error: ' + e.message); }
  },

  async downloadfile(name) {
    const sep = this.currentPath.endsWith('/') ? '' : '/';
    try {
      const buf = await window.electronAPI.sftpdownload(this.id, this.currentPath + sep + name);
      const blob = new Blob([buf]);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) { alert('Download failed: ' + e.message); }
  },

  promptmodal(title, label, defaultVal) {
    return new Promise(resolve => {
      Modal.open(title, `
        <div style="display:flex;flex-direction:column;gap:12px;">
          <label style="font-size:13px;color:var(--text-secondary);">${label}</label>
          <input type="text" id="sftpPromptInput" class="form-input" value="${Utils.escape(defaultVal || '')}" style="width:100%;" />
          <div class="modal-actions">
            <button class="btn btn-secondary" onclick="Modal.close();window._sftpPromptResolve(null);">Cancel</button>
            <button class="btn btn-primary" onclick="Modal.close();window._sftpPromptResolve(document.getElementById('sftpPromptInput').value);">OK</button>
          </div>
        </div>
      `);
      window._sftpPromptResolve = resolve;
      setTimeout(() => {
        const inp = document.getElementById('sftpPromptInput');
        if (inp) { inp.focus(); inp.select(); }
      }, 50);
    });
  },

  showauth() {
    Utils.el('sftpAuthScreen').style.display = '';
    Utils.el('sftpBrowserScreen').style.display = 'none';
  },

  showbrowser() {
    Utils.el('sftpAuthScreen').style.display = 'none';
    Utils.el('sftpBrowserScreen').style.display = '';
    this.renderbrowser();
  },

  toggleselectall() {
    if (this.selected.size === this.files.length) {
      this.selected.clear();
    } else {
      this.files.forEach(f => this.selected.add(f.name));
    }
    this.renderbrowser();
  },

  toggleselect(name) {
    if (this.selected.has(name)) this.selected.delete(name);
    else this.selected.add(name);
    this.renderbrowser();
  },

  saveconnection(cfg) {
    const existing = this.savedConnections.findIndex(c =>
      c.host === cfg.host && c.port === cfg.port && c.username === cfg.username
    );
    if (existing >= 0) {
      this.savedConnections[existing] = cfg;
    } else {
      this.savedConnections.push(cfg);
    }
    this.savesaved();
  },

  deletesavedconnection(index) {
    this.savedConnections.splice(index, 1);
    this.savesaved();
    this.render();
  },

  formatsize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
  },

  formatdate(ts) {
    if (!ts) return '';
    const d = new Date(ts * 1000);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' +
      d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  },

  render() {
    const el = Utils.el('tabSftp');
    if (!el) return;

    const servers = (Servers.list || []).filter(s => s.type === 'VPS/VDS');
    const keys = ServerKeychain.keys || [];

    el.innerHTML = `
      <div class="sftp-container">
        <div class="sftp-auth" id="sftpAuthScreen">
          <div class="sftp-auth-card">
            <div class="sftp-auth-header">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
              <h2>Connect via SFTP</h2>
            </div>

            ${servers.length ? `
            <div class="sftp-quick-section">
              <label class="form-label">Quick connect from saved servers</label>
              <div class="sftp-servers-grid">
                ${servers.map((s, i) => `
                  <button class="sftp-server-btn" onclick="SFTP.quickconnect(${Servers.list.indexOf(s)})">
                    <span class="sftp-server-btn-icon">${s.type === 'VPS/VDS' ? '🖥️' : '☁️'}</span>
                    <span class="sftp-server-btn-name">${Utils.escape(s.name)}</span>
                    <span class="sftp-server-btn-host">${Utils.escape(s.host)}:${s.port || 22}</span>
                  </button>
                `).join('')}
              </div>
            </div>
            <div class="sftp-divider"><span>or enter manually</span></div>
            ` : ''}

            <div class="sftp-form">
              <div class="form-row">
                <div class="form-group" style="flex:2;">
                  <label class="form-label">Host / IP</label>
                  <input type="text" class="form-input" id="sftpHost" placeholder="192.168.1.100" />
                </div>
                <div class="form-group" style="flex:1;">
                  <label class="form-label">Port</label>
                  <input type="number" class="form-input" id="sftpPort" value="22" />
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Username</label>
                <input type="text" class="form-input" id="sftpUser" placeholder="root" />
              </div>
              <div class="form-group">
                <label class="form-label">Authentication</label>
                <div class="auth-toggle" id="sftpAuthToggle">
                  <button class="auth-toggle-btn active" onclick="SFTP.toggleauthtype('password')">Password</button>
                  <button class="auth-toggle-btn" onclick="SFTP.toggleauthtype('key')">Key</button>
                </div>
              </div>
              <div id="sftpPasswordField">
                <div class="form-group">
                  <label class="form-label">Password</label>
                  <input type="password" class="form-input" id="sftpPass" />
                </div>
              </div>
              <div id="sftpKeyField" style="display:none;">
                <div class="form-group">
                  <label class="form-label">Private Key</label>
                  <select class="form-input" id="sftpKeySelect">
                    <option value="">Select a key...</option>
                    ${keys.map((k, i) => `<option value="${i}">${Utils.escape(k.name)}</option>`).join('')}
                  </select>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label" style="display:flex;align-items:center;gap:6px;">
                  <input type="checkbox" id="sftpSaveCheck" /> Save this connection
                </label>
              </div>
              <div id="sftpAuthError" class="form-error" style="display:none;"></div>
              <button class="btn btn-primary" style="width:100%;margin-top:8px;" onclick="SFTP.handleconnect()">Connect</button>
            </div>

            ${this.savedConnections.length ? `
            <div class="sftp-saved-section">
              <div class="sftp-saved-header">
                <h3>Saved Connections</h3>
              </div>
              <div class="sftp-saved-list">
                ${this.savedConnections.map((c, i) => `
                  <div class="sftp-saved-item">
                    <div class="sftp-saved-info" onclick="SFTP.connectsaved(${i})">
                      <div class="sftp-saved-name">${Utils.escape(c.username)}@${Utils.escape(c.host)}:${c.port}</div>
                      <div class="sftp-saved-detail">${c.authType === 'key' ? 'Key auth' : 'Password'}</div>
                    </div>
                    <button class="btn btn-sm btn-red-outline" onclick="SFTP.deletesavedconnection(${i})">Remove</button>
                  </div>
                `).join('')}
              </div>
            </div>
            ` : ''}
          </div>
        </div>

        <div class="sftp-browser" id="sftpBrowserScreen" style="display:none;">
          <div class="sftp-toolbar">
            <div class="sftp-breadcrumb" id="sftpBreadcrumb"></div>
            <div class="sftp-toolbar-actions">
              <button class="btn btn-sm btn-secondary" onclick="SFTP.createfile()">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
                New File
              </button>
              <button class="btn btn-sm btn-secondary" onclick="SFTP.createfolder()">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
                New Folder
              </button>
              <button class="btn btn-sm btn-primary" onclick="SFTP.uploadfile()">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Upload
              </button>
              ${this.selected.size > 0 ? `
                <button class="btn btn-sm btn-red" onclick="SFTP.deleteselected()">Delete (${this.selected.size})</button>
              ` : ''}
              <button class="btn btn-sm btn-red-outline" onclick="SFTP.disconnect()">Disconnect</button>
            </div>
          </div>
          <div class="sftp-file-list" id="sftpFileList"></div>
        </div>
      </div>`;
  },

  toggleauthtype(type) {
    const btns = document.querySelectorAll('#sftpAuthToggle .auth-toggle-btn');
    btns.forEach(b => {
      b.classList.toggle('active', (type === 'key' && b.textContent.trim() === 'Key') || (type === 'password' && b.textContent.trim() === 'Password'));
    });
    const passField = document.getElementById('sftpPasswordField');
    const keyField = document.getElementById('sftpKeyField');
    if (passField) passField.style.display = type === 'key' ? 'none' : '';
    if (keyField) keyField.style.display = type === 'key' ? '' : 'none';
  },

  async handleconnect() {
    const host = Utils.el('sftpHost').value.trim();
    const port = Utils.el('sftpPort').value || 22;
    const username = Utils.el('sftpUser').value.trim();
    const authType = Utils.el('sftpKeyField').style.display === 'none' ? 'password' : 'key';

    if (!host || !username) {
      const errEl = Utils.el('sftpAuthError');
      errEl.style.display = '';
      errEl.textContent = 'Host and username are required';
      return;
    }

    let password = '';
    let privateKey = '';

    if (authType === 'password') {
      password = Utils.el('sftpPass').value;
    } else {
      const keyIdx = Utils.el('sftpKeySelect').value;
      if (keyIdx === '') {
        const errEl = Utils.el('sftpAuthError');
        errEl.style.display = '';
        errEl.textContent = 'Please select a key';
        return;
      }
      const key = ServerKeychain.keys[parseInt(keyIdx)];
      privateKey = key.privateKey;
    }

    const cfg = { host, port: parseInt(port), username, authType, password, privateKey };

    if (Utils.el('sftpSaveCheck').checked) {
      this.saveconnection({ ...cfg });
    }

    const errEl = Utils.el('sftpAuthError');
    errEl.style.display = 'none';
    errEl.textContent = '';

    await this.connect(cfg);
  },

  async quickconnect(index) {
    const server = Servers.list[index];
    if (!server) return;
    const cfg = {
      host: server.host,
      port: server.port || 22,
      username: server.username || 'root',
      authType: server.authType === 'key' ? 'key' : 'password',
      password: server.password || '',
      privateKey: server.privateKey || ''
    };
    if (cfg.authType === 'password' && !cfg.password) {
      const errEl = document.getElementById('sftpAuthError');
      if (errEl) {
        errEl.style.display = '';
        errEl.textContent = 'No password saved for this server. Use the form below to enter credentials.';
      }
      this.fillform(cfg);
      return;
    }
    if (cfg.authType === 'key' && !cfg.privateKey) {
      const errEl = document.getElementById('sftpAuthError');
      if (errEl) {
        errEl.style.display = '';
        errEl.textContent = 'No key saved for this server. Use the form below to select a key.';
      }
      this.fillform(cfg);
      return;
    }
    await this.connect(cfg);
  },

  async connectsaved(index) {
    const cfg = this.savedConnections[index];
    if (!cfg) return;
    await this.connect(cfg);
  },

  fillform(cfg) {
    const hostEl = document.getElementById('sftpHost');
    const portEl = document.getElementById('sftpPort');
    const userEl = document.getElementById('sftpUser');
    const passEl = document.getElementById('sftpPass');
    if (hostEl) hostEl.value = cfg.host || '';
    if (portEl) portEl.value = cfg.port || 22;
    if (userEl) userEl.value = cfg.username || '';
    if (passEl) passEl.value = cfg.password || '';
    if (cfg.authType === 'key') {
      this.toggleauthtype('key');
    } else {
      this.toggleauthtype('password');
    }
  },

  renderbrowser() {
    const breadcrumb = Utils.el('sftpBreadcrumb');
    const fileList = Utils.el('sftpFileList');
    if (!breadcrumb || !fileList) return;

    const parts = this.currentPath.split('/').filter(Boolean);
    let html = `<span class="sftp-crumb" onclick="SFTP.listfiles('/')">/</span>`;
    let acc = '';
    for (const p of parts) {
      acc += '/' + p;
      const path = acc;
      html += `<span class="sftp-crumb-sep">/</span><span class="sftp-crumb" onclick="SFTP.listfiles('${path}')">${Utils.escape(p)}</span>`;
    }
    breadcrumb.innerHTML = html;

    let listHtml = `<div class="sftp-file-header">
      <input type="checkbox" class="sftp-checkbox" ${this.selected.size === this.files.length && this.files.length ? 'checked' : ''} onchange="SFTP.toggleselectall()" />
      <span class="sftp-file-name-h">Name</span>
      <span class="sftp-file-size-h">Size</span>
      <span class="sftp-file-date-h">Modified</span>
      <span class="sftp-file-actions-h"></span>
    </div>`;

    if (this.currentPath !== '/') {
      listHtml += `<div class="sftp-file-row sftp-dir-row" onclick="SFTP.navigate('..')">
        <input type="checkbox" class="sftp-checkbox" style="visibility:hidden;" />
        <div class="sftp-file-name"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg> <span>..</span></div>
        <span class="sftp-file-size">-</span>
        <span class="sftp-file-date">-</span>
        <span class="sftp-file-actions"></span>
      </div>`;
    }

    for (const f of this.files) {
      const checked = this.selected.has(f.name) ? 'checked' : '';
      const icon = f.isDir
        ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>'
        : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';

      listHtml += `<div class="sftp-file-row ${f.isDir ? 'sftp-dir-row' : ''}" ondblclick="${f.isDir ? `SFTP.navigate('${f.name.replace(/'/g, "\\'")}')` : ''}">
        <input type="checkbox" class="sftp-checkbox" ${checked} onchange="SFTP.toggleselect('${Utils.escape(f.name)}')" onclick="event.stopPropagation()" />
        <div class="sftp-file-name" ${f.isDir ? `onclick="SFTP.navigate('${f.name.replace(/'/g, "\\'")}')"` : ''}>
          ${icon} <span>${Utils.escape(f.name)}</span>
        </div>
        <span class="sftp-file-size">${f.isDir ? '-' : this.formatsize(f.size)}</span>
        <span class="sftp-file-date">${this.formatdate(f.mtime)}</span>
        <div class="sftp-file-actions">
          ${!f.isDir ? `<button class="btn-icon" onclick="SFTP.downloadfile('${Utils.escape(f.name)}')" title="Download"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>` : ''}
          <button class="btn-icon" onclick="SFTP.renamefile('${Utils.escape(f.name)}')" title="Rename"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg></button>
          <button class="btn-icon sftp-delete-btn" onclick="SFTP.deletefile('${Utils.escape(f.name)}')" title="Delete"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
        </div>
      </div>`;
    }

    if (!this.files.length && this._listError) {
      const isConnLost = this._listError === 'Connection lost';
      listHtml += `<div class="sftp-list-error">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
        <div class="sftp-list-error-text">${Utils.escape(this._listError)}</div>
        <div class="sftp-list-error-hint">${isConnLost ? 'Reconnecting...' : 'This directory may be restricted. Try navigating to another path.'}</div>
        ${!isConnLost ? `<button class="btn btn-sm btn-secondary" onclick="SFTP.listfiles(SFTP.currentPath)" style="margin-top:8px;">Retry</button>` : ''}
      </div>`;
    } else if (!this.files.length) {
      listHtml += '<div class="fw-empty" style="padding:48px;">This directory is empty</div>';
    }

    fileList.innerHTML = listHtml;
  }
};
