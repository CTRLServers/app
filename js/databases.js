const ServerDatabases = {
  loading: false,
  databases: [],

  async load() {
    const s = App.currentServer;
    if (!s || s.type !== 'Pterodactyl') return;
    this.loading = true;
    this.render();
    try {
      const data = await Api.fetchdatabases(s.panelUrl, s.apiKey, s.uuid);
      this.databases = data.map(d => {
        const attrs = d.attributes || d;
        attrs._password = attrs.relationships?.password?.attributes?.password || '';
        attrs._id = d.id || attrs.id;
        return attrs;
      });
    } catch (e) {
      console.error(e);
      this.databases = [];
    } finally {
      this.loading = false;
    }
    this.render();
  },

  opencreatemodal() {
    Modal.open('New Database', `
      <div class="form-group">
        <label class="form-label">Database Name</label>
        <p style="font-size:12px;color:var(--text-muted);margin:0 0 6px;">The name of the database to create on the server.</p>
        <input type="text" class="form-input" id="dbName" placeholder="e.g. my_database" />
      </div>
      <div class="form-group">
        <label class="form-label">Connections From</label>
        <p style="font-size:12px;color:var(--text-muted);margin:0 0 6px;">Comma-separated list of hostnames/IPs that can connect. Use % for any host.</p>
        <input type="text" class="form-input" id="dbRemote" placeholder="e.g. %" />
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" id="dbCreateBtn">Create Database</button>
      </div>
    `);
    setTimeout(() => {
      const btn = Utils.el('dbCreateBtn');
      if (btn) btn.addEventListener('click', async () => {
        const s = App.currentServer;
        if (!s) return;
        const name = document.getElementById('dbName').value.trim();
        const remote = document.getElementById('dbRemote').value.trim();
        if (!name) return;
        btn.disabled = true;
        btn.textContent = 'Creating...';
        try {
          const ok = await Api.createdatabase(s.panelUrl, s.apiKey, s.uuid, name, remote || '%');
          if (ok) {
            Modal.close();
            await this.load();
          } else {
            alert('Failed to create database');
            btn.disabled = false;
            btn.textContent = 'Create Database';
          }
        } catch (e) {
          console.error(e);
          alert('Failed to create database');
          btn.disabled = false;
          btn.textContent = 'Create Database';
        }
      });
    }, 0);
  },

  showdetails(idx) {
    const db = this.databases[idx];
    if (!db) return;
    const hostAddr = db.host?.address || '';
    const hostPort = db.host?.port || '';
    const password = db._password || '';
    const username = db.username || '';
    const dbName = db.name || '';
    const connFrom = db.connections_from || '%';
    const jdbcUrl = `jdbc:mysql://${username}:${encodeURIComponent(password)}@${hostAddr}:${hostPort}/${dbName}`;
    const copySvg = '<svg class="copy-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

    Modal.open('Database Connection Details', `
      <div style="display:flex;flex-direction:column;gap:14px;">
        <div class="db-detail-row">
          <span class="db-detail-label">Endpoint</span>
          <div class="copy-field">
            <code>${Utils.escape(hostAddr)}:${hostPort}</code>
            <span class="copy-btn" onclick="ServerDatabases.copytext('${Utils.escape(hostAddr + ':' + hostPort)}')" title="Copy">${copySvg}</span>
          </div>
        </div>
        <div class="db-detail-row">
          <span class="db-detail-label">Connections From</span>
          <div class="copy-field">
            <code>${Utils.escape(connFrom)}</code>
            <span class="copy-btn" onclick="ServerDatabases.copytext('${Utils.escape(connFrom)}')" title="Copy">${copySvg}</span>
          </div>
        </div>
        <div class="db-detail-row">
          <span class="db-detail-label">Username</span>
          <div class="copy-field">
            <code>${Utils.escape(username)}</code>
            <span class="copy-btn" onclick="ServerDatabases.copytext('${Utils.escape(username)}')" title="Copy">${copySvg}</span>
          </div>
        </div>
        <div class="db-detail-row">
          <span class="db-detail-label">Password</span>
          <div class="copy-field">
            <code>${Utils.escape(password)}</code>
            <span class="copy-btn" onclick="ServerDatabases.copytext('${Utils.escape(password)}')" title="Copy">${copySvg}</span>
          </div>
        </div>
        <div class="db-detail-row">
          <span class="db-detail-label">JDBC Connection String</span>
          <div class="copy-field">
            <code style="font-size:11px;word-break:break-all;">${Utils.escape(jdbcUrl)}</code>
            <span class="copy-btn" onclick="ServerDatabases.copytext(ServerDatabases._jdbcUrl)" title="Copy">${copySvg}</span>
          </div>
        </div>
      </div>
    `);
    this._jdbcUrl = jdbcUrl;
  },

  async rotatepassword(idx) {
    const db = this.databases[idx];
    if (!db) return;
    Modal.confirm('Rotate Password', 'Are you sure you want to rotate this database password? The old password will stop working immediately.', async () => {
      const s = App.currentServer;
      if (!s) return;
      try {
        await Api.rotatedatabasepassword(s.panelUrl, s.apiKey, s.uuid, db._id || db.id);
        await this.load();
      } catch (e) {
        console.error(e);
      }
    });
  },

  async remove(idx) {
    const db = this.databases[idx];
    if (!db) return;
    Modal.confirm('Delete Database', 'Are you sure you want to delete this database? All data will be permanently lost.', async () => {
      const s = App.currentServer;
      if (!s) return;
      try {
        await Api.deletedatabase(s.panelUrl, s.apiKey, s.uuid, db._id || db.id);
        await this.load();
      } catch (e) {
        console.error(e);
      }
    });
  },

  copytext(text) {
    navigator.clipboard.writeText(text).catch(() => {});
  },

  render() {
    const container = Utils.el('tabDatabases');
    if (!container) return;
    if (this.loading) {
      container.innerHTML = '<div class="tab-loading"><svg class="spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15A9 9 0 1 1 5.64 5.64L1 10"/></svg></div>';
      return;
    }
    let html = `
      <div class="db-content">
        <div class="network-header">
          <div class="network-info-box">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
            <span>Databases allow you to store and manage structured data for your applications.</span>
          </div>
          <button class="btn btn-primary btn-sm" onclick="ServerDatabases.opencreatemodal()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Database
          </button>
        </div>
        <div class="db-list">`;
    for (let i = 0; i < this.databases.length; i++) {
      const db = this.databases[i];
      const hostAddr = db.host?.address || '';
      html += `
          <div class="db-card">
            <div class="db-card-header">
              <div class="db-title-box">
                <div class="db-icon-wrap">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
                </div>
                <div class="db-name-box">
                  <h4>${Utils.escape(db.name)}</h4>
                  <span>${Utils.escape(hostAddr)}</span>
                </div>
              </div>
              <div class="db-actions-top">
                <button class="btn btn-secondary btn-sm" onclick="ServerDatabases.showdetails(${i})">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                  Credentials
                </button>
                <button class="btn-icon" onclick="ServerDatabases.rotatepassword(${i})" title="Rotate Password">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15A9 9 0 1 1 5.64 5.64L1 10"/></svg>
                </button>
                <button class="btn-icon btn-danger-sm" onclick="ServerDatabases.remove(${i})" title="Delete">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </div>
            </div>
          </div>`;
    }
    if (!this.databases.length) {
      html += '<div class="tab-empty">No databases found. Create one to get started.</div>';
    }
    html += '</div></div>';
    container.innerHTML = html;
  },
};
