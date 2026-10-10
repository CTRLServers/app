const admindatabases = {
  hosts: [],
  nodes: [],
  host: null,

  async load() {
    const container = Utils.el('tabpaneldatabases');
    if (!container) return;
    container.innerHTML = '<div class="paneladmin-loading"><div class="spinner"></div><span>Loading database hosts...</span></div>';
    try {
      const { server, apikey } = await adminpanel.credentials();
      const data = await Api.adminrequest(server.panelUrl, apikey, '/admin/ctrlservers/database-hosts');
      if (App.currentServer !== server) return;
      this.hosts = data.hosts || [];
      this.render();
    } catch (error) {
      container.innerHTML = `<div class="paneladmin-error-state"><strong>Unable to load database hosts</strong><span>${this.safe(error.message)}</span><button type="button" class="btn btn-secondary btn-sm" onclick="admindatabases.load()">Retry</button></div>`;
    }
  },

  render() {
    const container = Utils.el('tabpaneldatabases');
    if (!container) return;
    container.innerHTML = `
      <div class="paneladmin-page admindatabases-page">
        <div class="paneladmin-heading admindatabases-heading">
          <div><h2>Databases</h2><span class="paneladmin-url">${this.hosts.length} host${this.hosts.length === 1 ? '' : 's'}</span></div>
          <button type="button" class="btn btn-primary" onclick="admindatabases.opencreate()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5M3 12c0 1.7 4 3 9 3s9-1.3 9-3"/><path d="M19 14v6M16 17h6"/></svg>
            Create new database
          </button>
        </div>
        <section class="admindatabases-card">
          <div class="admindatabases-card-heading"><h3>Host List</h3></div>
          ${this.hosts.length ? `<div class="admindatabases-table-wrap"><table class="admindatabases-table"><thead><tr><th>ID</th><th>Name</th><th>Host</th><th>Port</th><th>Username</th><th>Databases</th><th>Node</th></tr></thead><tbody>${this.hosts.map(host => this.renderrow(host)).join('')}</tbody></table></div>` : '<div class="admindatabases-empty">No database hosts have been configured.</div>'}
        </section>
      </div>`;
  },

  renderrow(host) {
    return `<tr role="button" tabindex="0" onclick="admindatabases.openhost(${Number(host.id)})" onkeydown="admindatabases.hostkey(event, ${Number(host.id)})"><td>${Number(host.id)}</td><td>${this.safe(host.name)}</td><td><code>${this.safe(host.host)}</code></td><td>${Number(host.port)}</td><td>${this.safe(host.username)}</td><td>${Number(host.databases || 0)}</td><td>${this.safe(host.node?.name || '-')}</td></tr>`;
  },

  hostkey(event, id) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    this.openhost(id);
  },

  async openhost(id) {
    const container = Utils.el('tabpaneldatabases');
    if (!container) return;
    container.innerHTML = '<div class="paneladmin-loading"><div class="spinner"></div><span>Loading database host...</span></div>';
    try {
      const { server, apikey } = await adminpanel.credentials();
      const requests = [Api.adminrequest(server.panelUrl, apikey, '/admin/ctrlservers/database-hosts/' + Number(id))];
      if (!this.nodes.length) requests.push(Api.adminrequest(server.panelUrl, apikey, '/api/application/nodes?per_page=100&sort=id'));
      const [data, nodes] = await Promise.all(requests);
      if (App.currentServer !== server) return;
      if (nodes) this.nodes = (nodes.data || []).map(item => item.attributes || item);
      this.host = data.host;
      this.renderhost();
    } catch (error) {
      container.innerHTML = `<div class="paneladmin-error-state"><strong>Unable to load database host</strong><span>${this.safe(error.message)}</span><button type="button" class="btn btn-secondary btn-sm" onclick="admindatabases.openhost(${Number(id)})">Retry</button></div>`;
    }
  },

  renderhost() {
    const container = Utils.el('tabpaneldatabases');
    if (!container || !this.host) return;
    const databases = this.host.database_list || [];
    container.innerHTML = `
      <div class="paneladmin-page admindatabases-page">
        <div class="adminnodes-detail-heading">
          <button type="button" class="adminnodes-back" onclick="admindatabases.host=null;admindatabases.load()" title="Back to database hosts"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg></button>
          <div><h2>${this.safe(this.host.name)}</h2><span>${this.safe(this.host.host)}:${Number(this.host.port)}</span></div>
        </div>
        <div id="admindatabases-detail-message"></div>
        <div class="admindatabases-detail-layout">
          <section class="admindatabases-detail-card">
            <h3>Host Details</h3>
            <div class="admindatabases-form">
              ${this.field('admindatabase-detail-name', 'Name', 'text', this.host.name)}
              ${this.field('admindatabase-detail-host', 'Host', 'text', this.host.host)}
              ${this.field('admindatabase-detail-port', 'Port', 'number', this.host.port)}
              <label class="admindatabases-field"><span>Linked Node</span><select id="admindatabase-detail-node">${this.nodeoptions(this.host.node?.id)}</select></label>
            </div>
          </section>
          <section class="admindatabases-detail-card">
            <h3>User Details</h3>
            <div class="admindatabases-form">
              ${this.field('admindatabase-detail-username', 'Username', 'text', this.host.username)}
              <label class="admindatabases-field"><span>Password</span><input type="password" id="admindatabase-detail-password" value="" placeholder="Unchanged" autocomplete="new-password" /></label>
            </div>
            <div class="admindatabases-detail-actions"><button type="button" class="btn btn-primary" id="admindatabase-save" onclick="admindatabases.savehost()">Save</button></div>
          </section>
        </div>
        <section class="admindatabases-card admindatabases-database-list">
          <div class="admindatabases-card-heading"><h3>Databases</h3></div>
          ${databases.length ? `<div class="admindatabases-table-wrap"><table class="admindatabases-table"><thead><tr><th>Server</th><th>Database Name</th><th>Username</th><th>Connections From</th><th>Max Connections</th></tr></thead><tbody>${databases.map(database => `<tr><td>${this.safe(database.server || '-')}</td><td><code>${this.safe(database.database)}</code></td><td>${this.safe(database.username)}</td><td>${this.safe(database.remote)}</td><td>${Number(database.max_connections || 0) === 0 ? 'Unlimited' : Number(database.max_connections)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="admindatabases-empty">No databases are using this host.</div>'}
        </section>
      </div>`;
  },

  async opencreate() {
    try {
      if (!this.nodes.length) {
        const { server, apikey } = await adminpanel.credentials();
        const data = await Api.adminrequest(server.panelUrl, apikey, '/api/application/nodes?per_page=100&sort=id');
        if (App.currentServer !== server) return;
        this.nodes = (data.data || []).map(item => item.attributes || item);
      }
      Modal.open('Create Database Host', `
        <div id="admindatabases-form-error"></div>
        <div class="admindatabases-warning">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 2.9L1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <p>The account defined for this database host must have the WITH GRANT OPTION permission. If the defined account does not have this permission requests to create databases will fail. Do not use the same account details for MySQL that you have defined for this panel.</p>
        </div>
        <div class="admindatabases-form">
          ${this.field('admindatabase-name', 'Name', 'text')}
          ${this.field('admindatabase-host', 'Host', 'text')}
          ${this.field('admindatabase-port', 'Port', 'number', '3306')}
          ${this.field('admindatabase-username', 'Username', 'text')}
          ${this.field('admindatabase-password', 'Password', 'password')}
          <label class="admindatabases-field"><span>Linked Node</span><select id="admindatabase-node">${this.nodeoptions()}</select></label>
        </div>
        <div class="modal-actions"><button type="button" class="btn btn-secondary" onclick="Modal.close()">Cancel</button><button type="button" class="btn btn-primary" id="admindatabase-create" onclick="admindatabases.createhost()">Create</button></div>`, 'modal-wide');
    } catch (error) {
      Modal.alert('Unable to load nodes', this.safe(error.message));
    }
  },

  field(id, label, type, value = '') {
    return `<label class="admindatabases-field"><span>${this.safe(label)}</span><input type="${type}" id="${id}" value="${this.safe(value)}" autocomplete="off" /></label>`;
  },

  nodeoptions(selected = null) {
    if (!this.nodes.length) return '<option value="">No nodes available</option>';
    return this.nodes.map(node => `<option value="${Number(node.id)}" ${Number(node.id) === Number(selected) ? 'selected' : ''}>${this.safe(node.name)}</option>`).join('');
  },

  async createhost() {
    const errorbox = Utils.el('admindatabases-form-error');
    const button = Utils.el('admindatabase-create');
    const payload = {
      name: Utils.el('admindatabase-name')?.value.trim() || '',
      host: Utils.el('admindatabase-host')?.value.trim() || '',
      port: Number(Utils.el('admindatabase-port')?.value || 0),
      username: Utils.el('admindatabase-username')?.value.trim() || '',
      password: Utils.el('admindatabase-password')?.value || '',
      node_id: Number(Utils.el('admindatabase-node')?.value || 0)
    };
    if (!payload.name || !payload.host || !payload.port || !payload.username || !payload.password || !payload.node_id) {
      if (errorbox) errorbox.innerHTML = '<div class="paneladmin-notice error">Complete all required fields.</div>';
      return;
    }
    if (button) { button.disabled = true; button.textContent = 'Creating...'; }
    try {
      const { server, apikey } = await adminpanel.credentials();
      await Api.adminrequest(server.panelUrl, apikey, '/admin/ctrlservers/database-hosts', 'POST', payload);
      if (App.currentServer !== server) return;
      Modal.close();
      await this.load();
    } catch (error) {
      if (errorbox) errorbox.innerHTML = `<div class="paneladmin-notice error">${this.safe(error.message)}</div>`;
      if (button) { button.disabled = false; button.textContent = 'Create'; }
    }
  },

  async savehost() {
    if (!this.host) return;
    const message = Utils.el('admindatabases-detail-message');
    const button = Utils.el('admindatabase-save');
    const payload = {
      name: Utils.el('admindatabase-detail-name')?.value.trim() || '',
      host: Utils.el('admindatabase-detail-host')?.value.trim() || '',
      port: Number(Utils.el('admindatabase-detail-port')?.value || 0),
      node_id: Number(Utils.el('admindatabase-detail-node')?.value || 0),
      username: Utils.el('admindatabase-detail-username')?.value.trim() || '',
      password: Utils.el('admindatabase-detail-password')?.value || null
    };
    if (!payload.name || !payload.host || !payload.port || !payload.node_id || !payload.username) {
      if (message) message.innerHTML = '<div class="paneladmin-notice error">Complete all required fields.</div>';
      return;
    }
    if (button) { button.disabled = true; button.textContent = 'Saving...'; }
    try {
      const { server, apikey } = await adminpanel.credentials();
      const data = await Api.adminrequest(server.panelUrl, apikey, '/admin/ctrlservers/database-hosts/' + Number(this.host.id), 'PATCH', payload);
      if (App.currentServer !== server) return;
      this.host = data.host;
      this.renderhost();
      const refreshed = Utils.el('admindatabases-detail-message');
      if (refreshed) refreshed.innerHTML = '<div class="paneladmin-notice success">Database host saved.</div>';
    } catch (error) {
      if (message) message.innerHTML = `<div class="paneladmin-notice error">${this.safe(error.message)}</div>`;
      if (button) { button.disabled = false; button.textContent = 'Save'; }
    }
  },

  safe(value) {
    return Utils.escape(String(value ?? ''));
  }
};
