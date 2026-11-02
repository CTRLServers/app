const adminapplicationapi = {
  keys: [],
  createdkey: '',
  deletingid: null,
  resources: [
    ['allocations', 'aapi.res.allocations'],
    ['database_hosts', 'aapi.res.database_hosts'],
    ['eggs', 'aapi.res.eggs'],
    ['locations', 'aapi.res.locations'],
    ['nests', 'aapi.res.nests'],
    ['nodes', 'aapi.res.nodes'],
    ['server_databases', 'aapi.res.server_databases'],
    ['servers', 'aapi.res.servers'],
    ['users', 'aapi.res.users']
  ],

  pluralform(n) {
    if (I18n.getlang() !== 'ru') return n === 1 ? 'one' : 'many';
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'one';
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'few';
    return 'many';
  },

  async load() {
    const container = Utils.el('tabpanelapplicationapi');
    if (!container) return;
    container.innerHTML = `<div class="paneladmin-loading"><div class="spinner"></div><span>${t('aapi.loading')}</span></div>`;
    try {
      const { server, apikey } = await adminpanel.credentials();
      const data = await Api.adminrequest(server.panelUrl, apikey, '/admin/ctrlservers/application-api');
      if (App.currentServer !== server) return;
      this.keys = data.keys || [];
      this.render();
    } catch (error) {
      container.innerHTML = `<div class="paneladmin-error-state"><strong>${t('aapi.loadfail')}</strong><span>${this.safe(error.message)}</span><button type="button" class="btn btn-secondary btn-sm" onclick="adminapplicationapi.load()">${t('csub.retry')}</button></div>`;
    }
  },

  render() {
    const container = Utils.el('tabpanelapplicationapi');
    if (!container) return;
    container.innerHTML = `
      <div class="paneladmin-page adminapplicationapi-page">
        <div class="paneladmin-heading adminapplicationapi-heading">
          <div><h2>${t('nav.applicationapi')}</h2><span class="paneladmin-url">${t(`aapi.count.${this.pluralform(this.keys.length)}`, { n: this.keys.length })}</span></div>
          <button type="button" class="btn btn-primary" onclick="adminapplicationapi.opencreate()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="M12 12l8-8M15 5l4 4M18 7l2-2"/></svg>
            ${t('aapi.create')}
          </button>
        </div>
        <section class="adminapplicationapi-card">
          ${this.keys.length ? `
            <div class="adminapplicationapi-table-wrap">
              <table class="adminapplicationapi-table">
                <thead><tr><th>${t('aapi.h.key')}</th><th>${t('aapi.h.note')}</th><th>${t('aapi.h.lastused')}</th><th>${t('aapi.h.createdat')}</th><th>${t('aapi.h.createdby')}</th><th></th></tr></thead>
                <tbody>${this.keys.map(key => this.renderrow(key)).join('')}</tbody>
              </table>
            </div>` : `<div class="adminapplicationapi-empty"><strong>${t('aapi.empty.title')}</strong><span>${t('aapi.empty.desc')}</span></div>`}
        </section>
      </div>`;
  },

  renderrow(key) {
    const creator = key.created_by
      ? [key.created_by.first_name, key.created_by.last_name].filter(Boolean).join(' ') || key.created_by.username
      : t('aapi.unknown');
    return `
      <tr>
        <td><span class="adminapplicationapi-key"><code>${this.safe(key.value)}</code><button type="button" onclick="adminapplicationapi.copykey(${Number(key.id)})" title="${t('aapi.copykey')}"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button></span></td>
        <td>${this.safe(key.note || '-')}</td>
        <td>${this.safe(this.formatdate(key.last_used_at, t('aapi.never')))}</td>
        <td>${this.safe(this.formatdate(key.created_at, t('aapi.unknown')))}</td>
        <td>${this.safe(creator)}</td>
        <td><button type="button" class="adminapplicationapi-delete" onclick="adminapplicationapi.opendelete(${Number(key.id)})" title="${t('aapi.deletekey')}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6m3 0V4h8v2"/></svg></button></td>
      </tr>`;
  },

  opencreate() {
    Modal.open(t('aapi.create.title'), `
      <div id="adminapplicationapi-form-error"></div>
      <div class="adminapplicationapi-form">
        <label class="adminapplicationapi-description"><span>${t('aapi.description')}</span><input type="text" id="adminapplicationapi-description" maxlength="500" autocomplete="off" /></label>
        <div class="adminapplicationapi-bulk">
          <span>${t('aapi.setall')}</span>
          <div>
            <button type="button" onclick="adminapplicationapi.setallpermissions(1)">${t('aapi.readall')}</button>
            <button type="button" onclick="adminapplicationapi.setallpermissions(3)">${t('aapi.writeall')}</button>
            <button type="button" onclick="adminapplicationapi.setallpermissions(0)">${t('aapi.noneall')}</button>
          </div>
        </div>
        <div class="adminapplicationapi-permissions">
          ${this.resources.map(resource => this.permissionrow(resource[0], resource[1])).join('')}
        </div>
      </div>
      <div class="modal-actions"><button type="button" class="btn btn-secondary" onclick="Modal.close()">${t('cset.cancel')}</button><button type="button" class="btn btn-primary" id="adminapplicationapi-create" onclick="adminapplicationapi.createkey()">${t('aapi.createkey')}</button></div>`, 'modal-wide');
  },

  permissionrow(resource, label) {
    return `
      <div class="adminapplicationapi-permission">
        <span class="adminapplicationapi-permission-label">${this.safe(t(label))}</span>
        <div class="adminapplicationapi-segmented">
          <label><input type="radio" name="adminapplicationapi-${resource}" value="1" /><span>${t('aapi.read')}</span></label>
          <label><input type="radio" name="adminapplicationapi-${resource}" value="3" /><span>${t('aapi.readwrite')}</span></label>
          <label><input type="radio" name="adminapplicationapi-${resource}" value="0" checked /><span>${t('aapi.none')}</span></label>
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
      if (errorbox) errorbox.innerHTML = `<div class="paneladmin-notice error">${t('aapi.err.description')}</div>`;
      return;
    }
    const permissions = {};
    this.resources.forEach(resource => {
      permissions[resource[0]] = Number(document.querySelector(`input[name="adminapplicationapi-${resource[0]}"]:checked`)?.value || 0);
    });
    if (button) { button.disabled = true; button.textContent = t('aapi.creating'); }
    try {
      const { server, apikey } = await adminpanel.credentials();
      const data = await Api.adminrequest(server.panelUrl, apikey, '/admin/ctrlservers/application-api', 'POST', { description, permissions });
      if (App.currentServer !== server) return;
      this.createdkey = data.value || '';
      Modal.open(t('aapi.created.title'), `
        <div class="adminapplicationapi-created">
          <p>${t('aapi.created.desc')}</p>
          <div><code>${this.safe(this.createdkey)}</code><button type="button" onclick="adminapplicationapi.copycreated()" title="${t('aapi.copykey')}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button></div>
        </div>
        <div class="modal-actions"><button type="button" class="btn btn-primary" onclick="adminapplicationapi.closecreated()">${t('aapi.done')}</button></div>`, 'modal-wide');
    } catch (error) {
      if (errorbox) errorbox.innerHTML = `<div class="paneladmin-notice error">${this.safe(error.message)}</div>`;
      if (button) { button.disabled = false; button.textContent = t('aapi.createkey'); }
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
    Modal.open(t('aapi.delete.title'), `<div id="adminapplicationapi-delete-error"></div><p class="adminapplicationapi-delete-copy">${t('aapi.delete.confirm', { name: this.safe(key.note || key.value) })}</p><div class="modal-actions"><button type="button" class="btn btn-secondary" onclick="Modal.close()">${t('cset.cancel')}</button><button type="button" class="btn btn-danger" id="adminapplicationapi-delete" onclick="adminapplicationapi.deletekey()">${t('aapi.deletekey')}</button></div>`);
  },

  async deletekey() {
    if (this.deletingid === null) return;
    const button = Utils.el('adminapplicationapi-delete');
    const errorbox = Utils.el('adminapplicationapi-delete-error');
    if (button) { button.disabled = true; button.textContent = t('aapi.deleting'); }
    try {
      const { server, apikey } = await adminpanel.credentials();
      await Api.adminrequest(server.panelUrl, apikey, '/admin/ctrlservers/application-api/' + this.deletingid, 'DELETE');
      if (App.currentServer !== server) return;
      Modal.close();
      this.deletingid = null;
      await this.load();
    } catch (error) {
      if (errorbox) errorbox.innerHTML = `<div class="paneladmin-notice error">${this.safe(error.message)}</div>`;
      if (button) { button.disabled = false; button.textContent = t('aapi.deletekey'); }
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
