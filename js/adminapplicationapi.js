const adminapplicationapi = {
  keys: [],
  createdkey: '',
  deletingid: null,
  resources: [
    ['allocations', 'Allocations'],
    ['database_hosts', 'Database Hosts'],
    ['eggs', 'Eggs'],
    ['locations', 'Locations'],
    ['nests', 'Nests'],
    ['nodes', 'Nodes'],
    ['server_databases', 'Server Databases'],
    ['servers', 'Servers'],
    ['users', 'Users']
  ],

  async load() {
    const container = Utils.el('tabpanelapplicationapi');
    if (!container) return;
    container.innerHTML = '<div class="paneladmin-loading"><div class="spinner"></div><span>Loading API keys...</span></div>';
    try {
      const { server, apikey } = await adminpanel.credentials();
      const data = await Api.adminrequest(server.panelUrl, apikey, '/admin/ctrlservers/application-api');
      if (App.currentServer !== server) return;
      this.keys = data.keys || [];
      this.render();
    } catch (error) {
      container.innerHTML = `<div class="paneladmin-error-state"><strong>Unable to load API keys</strong><span>${this.safe(error.message)}</span><button type="button" class="btn btn-secondary btn-sm" onclick="adminapplicationapi.load()">Retry</button></div>`;
    }
  },

  render() {
    const container = Utils.el('tabpanelapplicationapi');
    if (!container) return;
    container.innerHTML = `
      <div class="paneladmin-page adminapplicationapi-page">
        <div class="paneladmin-heading adminapplicationapi-heading">
          <div><h2>Application API</h2><span class="paneladmin-url">${this.keys.length} key${this.keys.length === 1 ? '' : 's'}</span></div>
          <button type="button" class="btn btn-primary" onclick="adminapplicationapi.opencreate()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="M12 12l8-8M15 5l4 4M18 7l2-2"/></svg>
            Create new
          </button>
        </div>
        <section class="adminapplicationapi-card">
          ${this.keys.length ? `
            <div class="adminapplicationapi-table-wrap">
              <table class="adminapplicationapi-table">
                <thead><tr><th>Key Value</th><th>Note</th><th>Last Used</th><th>Created At</th><th>Created By</th><th></th></tr></thead>
                <tbody>${this.keys.map(key => this.renderrow(key)).join('')}</tbody>
              </table>
            </div>` : '<div class="adminapplicationapi-empty"><strong>No application API keys</strong><span>Create a key to access this panel through the Application API.</span></div>'}
        </section>
      </div>`;
  },

  renderrow(key) {
    const creator = key.created_by
      ? [key.created_by.first_name, key.created_by.last_name].filter(Boolean).join(' ') || key.created_by.username
      : 'Unknown';
    return `
      <tr>
        <td><span class="adminapplicationapi-key"><code>${this.safe(key.value)}</code><button type="button" onclick="adminapplicationapi.copykey(${Number(key.id)})" title="Copy key"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button></span></td>
        <td>${this.safe(key.note || '-')}</td>
        <td>${this.safe(this.formatdate(key.last_used_at, 'Never'))}</td>
        <td>${this.safe(this.formatdate(key.created_at, 'Unknown'))}</td>
        <td>${this.safe(creator)}</td>
        <td><button type="button" class="adminapplicationapi-delete" onclick="adminapplicationapi.opendelete(${Number(key.id)})" title="Delete key"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6m3 0V4h8v2"/></svg></button></td>
      </tr>`;
  },

  opencreate() {
    Modal.open('Create Application API Key', `
      <div id="adminapplicationapi-form-error"></div>
      <div class="adminapplicationapi-form">
        <label class="adminapplicationapi-description"><span>Description</span><input type="text" id="adminapplicationapi-description" maxlength="500" autocomplete="off" /></label>
        <div class="adminapplicationapi-bulk">
          <span>Set all permissions</span>
          <div>
            <button type="button" onclick="adminapplicationapi.setallpermissions(1)">Read all</button>
            <button type="button" onclick="adminapplicationapi.setallpermissions(3)">Read &amp; Write all</button>
            <button type="button" onclick="adminapplicationapi.setallpermissions(0)">None all</button>
          </div>
        </div>
        <div class="adminapplicationapi-permissions">
          ${this.resources.map(resource => this.permissionrow(resource[0], resource[1])).join('')}
        </div>
      </div>
      <div class="modal-actions"><button type="button" class="btn btn-secondary" onclick="Modal.close()">Cancel</button><button type="button" class="btn btn-primary" id="adminapplicationapi-create" onclick="adminapplicationapi.createkey()">Create key</button></div>`, 'modal-wide');
  },

  permissionrow(resource, label) {
    return `
      <div class="adminapplicationapi-permission">
        <span class="adminapplicationapi-permission-label">${this.safe(label)}</span>
        <div class="adminapplicationapi-segmented">
          <label><input type="radio" name="adminapplicationapi-${resource}" value="1" /><span>Read</span></label>
          <label><input type="radio" name="adminapplicationapi-${resource}" value="3" /><span>Read &amp; Write</span></label>
          <label><input type="radio" name="adminapplicationapi-${resource}" value="0" checked /><span>None</span></label>
        </div>
      </div>`;
  },

  setallpermissions(value) {
    this.resources.forEach(resource => {
      const input = document.querySelector(`input[name="adminapplicationapi-${resource[0]}"][value="${Number(value)}"]`);
      if (input) input.checked = true;
    });
  },

  async createkey() {
    const description = Utils.el('adminapplicationapi-description')?.value.trim() || '';
    const errorbox = Utils.el('adminapplicationapi-form-error');
    const button = Utils.el('adminapplicationapi-create');
    if (!description) {
      if (errorbox) errorbox.innerHTML = '<div class="paneladmin-notice error">Description is required.</div>';
      return;
    }
    const permissions = {};
    this.resources.forEach(resource => {
      permissions[resource[0]] = Number(document.querySelector(`input[name="adminapplicationapi-${resource[0]}"]:checked`)?.value || 0);
    });
    if (button) { button.disabled = true; button.textContent = 'Creating...'; }
    try {
      const { server, apikey } = await adminpanel.credentials();
      const data = await Api.adminrequest(server.panelUrl, apikey, '/admin/ctrlservers/application-api', 'POST', { description, permissions });
      if (App.currentServer !== server) return;
      this.createdkey = data.value || '';
      Modal.open('Application API Key Created', `
        <div class="adminapplicationapi-created">
          <p>Store this key securely. It grants the permissions you selected.</p>
          <div><code>${this.safe(this.createdkey)}</code><button type="button" onclick="adminapplicationapi.copycreated()" title="Copy key"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button></div>
        </div>
        <div class="modal-actions"><button type="button" class="btn btn-primary" onclick="adminapplicationapi.closecreated()">Done</button></div>`, 'modal-wide');
    } catch (error) {
      if (errorbox) errorbox.innerHTML = `<div class="paneladmin-notice error">${this.safe(error.message)}</div>`;
      if (button) { button.disabled = false; button.textContent = 'Create key'; }
    }
  },

  async copykey(id) {
    const key = this.keys.find(entry => Number(entry.id) === Number(id));
    if (key) await navigator.clipboard.writeText(key.value || '');
  },

  async copycreated() {
    await navigator.clipboard.writeText(this.createdkey || '');
  },

  closecreated() {
    Modal.close();
    this.createdkey = '';
    this.load();
  },

  opendelete(id) {
    const key = this.keys.find(entry => Number(entry.id) === Number(id));
    if (!key) return;
    this.deletingid = Number(id);
    Modal.open('Delete Application API Key', `<div id="adminapplicationapi-delete-error"></div><p class="adminapplicationapi-delete-copy">Delete <strong>${this.safe(key.note || key.value)}</strong>? Any integration using this key will immediately lose access.</p><div class="modal-actions"><button type="button" class="btn btn-secondary" onclick="Modal.close()">Cancel</button><button type="button" class="btn btn-danger" id="adminapplicationapi-delete" onclick="adminapplicationapi.deletekey()">Delete key</button></div>`);
  },

  async deletekey() {
    if (this.deletingid === null) return;
    const button = Utils.el('adminapplicationapi-delete');
    const errorbox = Utils.el('adminapplicationapi-delete-error');
    if (button) { button.disabled = true; button.textContent = 'Deleting...'; }
    try {
      const { server, apikey } = await adminpanel.credentials();
      await Api.adminrequest(server.panelUrl, apikey, '/admin/ctrlservers/application-api/' + this.deletingid, 'DELETE');
      if (App.currentServer !== server) return;
      Modal.close();
      this.deletingid = null;
      await this.load();
    } catch (error) {
      if (errorbox) errorbox.innerHTML = `<div class="paneladmin-notice error">${this.safe(error.message)}</div>`;
      if (button) { button.disabled = false; button.textContent = 'Delete key'; }
    }
  },

  formatdate(value, fallback) {
    if (!value) return fallback;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return fallback;
    return date.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  },

  safe(value) {
    return Utils.escape(String(value ?? ''));
  }
};
