const admindatabases = {
  hosts: [],
  nodes: [],
  host: null,

  pluralform(n) {
    if (I18n.getlang() !== 'ru') return n === 1 ? 'one' : 'many';
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'one';
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'few';
    return 'many';
  },

  async load() {
    const container = Utils.el('tabpaneldatabases');
    if (!container) return;
    container.innerHTML = `<div class="paneladmin-loading"><div class="spinner"></div><span>${t('adhost.loading')}</span></div>`;
    try {
      const { server, apikey } = await adminpanel.credentials();
      const data = await Api.adminrequest(server.panelUrl, apikey, '/admin/ctrlservers/database-hosts');
      if (App.currentServer !== server) return;
      this.hosts = data.hosts || [];
      this.render();
    } catch (error) {
      container.innerHTML = `<div class="paneladmin-error-state"><strong>${t('adhost.loadfail')}</strong><span>${this.safe(error.message)}</span><button type="button" class="btn btn-secondary btn-sm" onclick="admindatabases.load()">${t('csub.retry')}</button></div>`;
    }
  },

  render() {
    const container = Utils.el('tabpaneldatabases');
    if (!container) return;
    container.innerHTML = `
      <div class="paneladmin-page admindatabases-page">
        <div class="paneladmin-heading admindatabases-heading">
          <div><h2>${t('nav.databases')}</h2><span class="paneladmin-url">${t(`adhost.count.${this.pluralform(this.hosts.length)}`, { n: this.hosts.length })}</span></div>
          <button type="button" class="btn btn-primary" onclick="admindatabases.opencreate()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5M3 12c0 1.7 4 3 9 3s9-1.3 9-3"/><path d="M19 14v6M16 17h6"/></svg>
            ${t('adhost.create')}
          </button>
        </div>
        <section class="admindatabases-card">
          <div class="admindatabases-card-heading"><h3>${t('adhost.hostlist')}</h3></div>
          ${this.hosts.length ? `<div class="admindatabases-table-wrap"><table class="admindatabases-table"><thead><tr><th>${t('adhost.h.id')}</th><th>${t('adhost.h.name')}</th><th>${t('adhost.h.host')}</th><th>${t('adhost.h.port')}</th><th>${t('adhost.h.username')}</th><th>${t('adhost.h.databases')}</th><th>${t('adhost.h.node')}</th></tr></thead><tbody>${this.hosts.map(host => this.renderrow(host)).join('')}</tbody></table></div>` : `<div class="admindatabases-empty">${t('adhost.empty')}</div>`}
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
    container.innerHTML = `<div class="paneladmin-loading"><div class="spinner"></div><span>${t('adhost.loadinghost')}</span></div>`;
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
      container.innerHTML = `<div class="paneladmin-error-state"><strong>${t('adhost.loadhostfail')}</strong><span>${this.safe(error.message)}</span><button type="button" class="btn btn-secondary btn-sm" onclick="admindatabases.openhost(${Number(id)})">${t('csub.retry')}</button></div>`;
    }
  },

  renderhost() {
    const container = Utils.el('tabpaneldatabases');
    if (!container || !this.host) return;
    const databases = this.host.database_list || [];
    container.innerHTML = `
      <div class="paneladmin-page admindatabases-page">
        <div class="adminnodes-detail-heading">
          <button type="button" class="adminnodes-back" onclick="admindatabases.host=null;admindatabases.load()" title="${t('adhost.back')}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg></button>
          <div><h2>${this.safe(this.host.name)}</h2><span>${this.safe(this.host.host)}:${Number(this.host.port)}</span></div>
        </div>
        <div id="admindatabases-detail-message"></div>
        <div class="admindatabases-detail-layout">
          <section class="admindatabases-detail-card">
            <h3>${t('adhost.hostdetails')}</h3>
            <div class="admindatabases-form">
              ${this.field('admindatabase-detail-name', t('adhost.name'), 'text', this.host.name)}
              ${this.field('admindatabase-detail-host', t('adhost.host'), 'text', this.host.host)}
              ${this.field('admindatabase-detail-port', t('adhost.port'), 'number', this.host.port)}
              <label class="admindatabases-field"><span>${t('adhost.linkednode')}</span><select id="admindatabase-detail-node">${this.nodeoptions(this.host.node?.id)}</select></label>
            </div>
          </section>
          <section class="admindatabases-detail-card">
            <h3>${t('adhost.userdetails')}</h3>
            <div class="admindatabases-form">
              ${this.field('admindatabase-detail-username', t('adhost.username'), 'text', this.host.username)}
              <label class="admindatabases-field"><span>${t('adhost.password')}</span><input type="password" id="admindatabase-detail-password" value="" placeholder="${t('adhost.unchanged')}" autocomplete="new-password" /></label>
            </div>
            <div class="admindatabases-detail-actions"><button type="button" class="btn btn-primary" id="admindatabase-save" onclick="admindatabases.savehost()">${t('cset.save')}</button></div>
          </section>
        </div>
        <section class="admindatabases-card admindatabases-database-list">
          <div class="admindatabases-card-heading"><h3>${t('adhost.databases')}</h3></div>
          ${databases.length ? `<div class="admindatabases-table-wrap"><table class="admindatabases-table"><thead><tr><th>${t('adhost.h.server')}</th><th>${t('adhost.h.dbname')}</th><th>${t('adhost.h.username')}</th><th>${t('adhost.h.connections')}</th><th>${t('adhost.h.maxconnections')}</th></tr></thead><tbody>${databases.map(database => `<tr><td>${this.safe(database.server || '-')}</td><td><code>${this.safe(database.database)}</code></td><td>${this.safe(database.username)}</td><td>${this.safe(database.remote)}</td><td>${Number(database.max_connections || 0) === 0 ? t('adhost.unlimited') : Number(database.max_connections)}</td></tr>`).join('')}</tbody></table></div>` : `<div class="admindatabases-empty">${t('adhost.nodb')}</div>`}
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
      Modal.open(t('adhost.createhost.title'), `
        <div id="admindatabases-form-error"></div>
        <div class="admindatabases-warning">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 2.9L1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <p>${t('adhost.warning')}</p>
        </div>
        <div class="admindatabases-form">
          ${this.field('admindatabase-name', t('adhost.name'), 'text')}
          ${this.field('admindatabase-host', t('adhost.host'), 'text')}
          ${this.field('admindatabase-port', t('adhost.port'), 'number', '3306')}
          ${this.field('admindatabase-username', t('adhost.username'), 'text')}
          ${this.field('admindatabase-password', t('adhost.password'), 'password')}
          <label class="admindatabases-field"><span>${t('adhost.linkednode')}</span><select id="admindatabase-node">${this.nodeoptions()}</select></label>
        </div>
        <div class="modal-actions"><button type="button" class="btn btn-secondary" onclick="Modal.close()">${t('cset.cancel')}</button><button type="button" class="btn btn-primary" id="admindatabase-create" onclick="admindatabases.createhost()">${t('adhost.createbtn')}</button></div>`, 'modal-wide');
    } catch (error) {
      Modal.alert(t('adhost.loadnodesfail'), this.safe(error.message));
    }
  },

  field(id, label, type, value = '') {
    return `<label class="admindatabases-field"><span>${this.safe(label)}</span><input type="${type}" id="${id}" value="${this.safe(value)}" autocomplete="off" /></label>`;
  },

  nodeoptions(selected = null) {
    if (!this.nodes.length) return `<option value="">${t('adhost.nonodes')}</option>`;
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
      if (errorbox) errorbox.innerHTML = `<div class="paneladmin-notice error">${t('adhost.required')}</div>`;
      return;
    }
    if (button) { button.disabled = true; button.textContent = t('adhost.creating'); }
    try {
      const { server, apikey } = await adminpanel.credentials();
      await Api.adminrequest(server.panelUrl, apikey, '/admin/ctrlservers/database-hosts', 'POST', payload);
      if (App.currentServer !== server) return;
      Modal.close();
      await this.load();
    } catch (error) {
      if (errorbox) errorbox.innerHTML = `<div class="paneladmin-notice error">${this.safe(error.message)}</div>`;
      if (button) { button.disabled = false; button.textContent = t('adhost.createbtn'); }
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
      if (message) message.innerHTML = `<div class="paneladmin-notice error">${t('adhost.required')}</div>`;
      return;
    }
    if (button) { button.disabled = true; button.textContent = t('adhost.saving'); }
    try {
      const { server, apikey } = await adminpanel.credentials();
      const data = await Api.adminrequest(server.panelUrl, apikey, '/admin/ctrlservers/database-hosts/' + Number(this.host.id), 'PATCH', payload);
      if (App.currentServer !== server) return;
      this.host = data.host;
      this.renderhost();
      const refreshed = Utils.el('admindatabases-detail-message');
      if (refreshed) refreshed.innerHTML = `<div class="paneladmin-notice success">${t('adhost.saved')}</div>`;
    } catch (error) {
      if (message) message.innerHTML = `<div class="paneladmin-notice error">${this.safe(error.message)}</div>`;
      if (button) { button.disabled = false; button.textContent = t('cset.save'); }
    }
  },

  safe(value) {
    return Utils.escape(String(value ?? ''));
  }
};
