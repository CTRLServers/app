const calagopusdatabases = {
  view: 'databases',
  page: 1,
  search: '',
  databases: [],
  instances: [],
  hosts: [],
  templates: [],
  pagination: {},
  sizes: {},
  currentdatabase: null,
  currenttable: null,
  currentinstance: null,
  schema: null,
  rows: null,
  queryresults: [],
  timer: null,

  async request(endpoint, method = 'GET', body = null, packed = false) {
    const server = App.currentServer;
    if (!server || server.type !== 'Calagopus') throw new Error(t('csub.noserver'));
    const apikey = await Servers.resolveapikey(server);
    const headers = { Authorization: `Bearer ${apikey}`, Accept: packed ? 'application/msgpack' : 'application/json' };
    let payload = null;
    if (body !== null) {
      if (packed) {
        headers['Content-Type'] = 'application/msgpack';
        payload = MessagePack.encode(body);
      } else {
        headers['Content-Type'] = 'application/json';
        payload = JSON.stringify(body);
      }
    }
    const response = await fetch(`${server.panelUrl.replace(/\/+$/, '')}/api/client/servers/${server.uuid}${endpoint}`, { method, headers, body: payload });
    if (!response.ok) {
      let message = t('cset.httperror', { status: response.status });
      try {
        const error = await response.json();
        message = error.errors?.[0] || error.message || message;
      } catch (error) {}
      throw new Error(message);
    }
    if (response.status === 204) return null;
    const type = response.headers.get('content-type') || '';
    if (type.includes('application/msgpack')) return MessagePack.decode(new Uint8Array(await response.arrayBuffer()));
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  },

  safe(value) {
    return Utils.escape(String(value ?? ''));
  },

  formatbytes(bytes) {
    const value = Number(bytes || 0);
    if (!value) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
    return `${(value / Math.pow(1024, index)).toFixed(index ? 1 : 0)} ${units[index]}`;
  },

  toast(message, type = 'success') {
    document.querySelector('.calagopus-database-toast')?.remove();
    const toast = document.createElement('div');
    toast.className = `toast file-toast calagopus-database-toast file-toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },

  async load(view = this.view) {
    this.view = view;
    this.renderloading();
    try {
      if (view === 'instances') await this.loadinstances();
      else await this.loaddatabases();
    } catch (error) {
      this.rendererror(error.message);
    }
  },

  async loaddatabases() {
    const query = new URLSearchParams({ page: String(this.page) });
    if (this.search) query.set('search', this.search);
    query.set('include_password', 'true');
    const [result, hostresult] = await Promise.all([
      this.request(`/databases?${query}`),
      this.request('/databases/hosts')
    ]);
    const pagination = result?.databases || {};
    this.databases = pagination.data || [];
    this.pagination = pagination;
    this.hosts = hostresult?.database_hosts || [];
    this.renderdatabases();
    this.loadsizes();
  },

  async loadsizes() {
    await Promise.all(this.databases.map(async database => {
      try {
        const result = await this.request(`/databases/${database.uuid}/size`);
        this.sizes[database.uuid] = result?.size || 0;
      } catch (error) {}
    }));
    if (this.view === 'databases') this.renderdatabases();
  },

  async loadinstances() {
    const query = new URLSearchParams({ page: String(this.page) });
    if (this.search) query.set('search', this.search);
    const [result, templateresult] = await Promise.all([
      this.request(`/databases/instances?${query}`),
      this.request('/databases/instances/templates')
    ]);
    const pagination = result?.instances || {};
    this.instances = pagination.data || [];
    this.pagination = pagination;
    this.templates = templateresult?.templates || [];
    this.renderinstances();
  },

  renderloading() {
    const container = Utils.el('tabDatabases');
    if (container) container.innerHTML = '<div class="tab-loading"><span class="spinner"></span></div>';
  },

  rendererror(message) {
    const container = Utils.el('tabDatabases');
    if (container) container.innerHTML = `<div class="calagopus-database-error"><strong>${t('cdb.loadfail')}</strong><span>${this.safe(message)}</span><button class="btn btn-secondary" onclick="calagopusdatabases.load()">${t('csub.retry')}</button></div>`;
  },

  header() {
    const createbutton = this.view === 'databases' && this.hosts.length
      ? `<button class="btn btn-primary btn-sm" onclick="calagopusdatabases.opencreate()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>${t('cdb.newdb')}</button>`
      : '';
    return `<div class="calagopus-database-header">
      <div><h2>${t('cdb.heading')}</h2><span>${t('cdb.subtitle')}</span></div>
      <div class="calagopus-database-header-actions">
        <label class="calagopus-database-search"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg><input value="${this.safe(this.search)}" placeholder="${t('cdb.search')}" oninput="calagopusdatabases.setsearch(this.value)" /></label>
        ${createbutton}
      </div>
    </div>`;
  },

  paginationhtml() {
    const page = Number(this.pagination.page || 1);
    const perpage = Number(this.pagination.per_page || 20);
    const total = Number(this.pagination.total || 0);
    const pages = Math.max(1, Math.ceil(total / perpage));
    if (pages <= 1) return '';
    return `<div class="calagopus-database-pagination"><button class="btn btn-secondary btn-sm" onclick="calagopusdatabases.setpage(${page - 1})" ${page <= 1 ? 'disabled' : ''}>${t('csub.previous')}</button><span>${t('csub.page', { page, pages })}</span><button class="btn btn-secondary btn-sm" onclick="calagopusdatabases.setpage(${page + 1})" ${page >= pages ? 'disabled' : ''}>${t('csub.next')}</button></div>`;
  },

  renderdatabases() {
    const container = Utils.el('tabDatabases');
    if (!container) return;
    const rows = this.databases.map((database, index) => {
      const locked = !!database.is_locked;
      return `<tr>
        <td><button class="calagopus-database-name" onclick="calagopusdatabases.openexplorer(${index})">${this.safe(database.name)}</button></td>
        <td><span class="calagopus-database-type">${this.safe(database.type)}</span></td>
        <td><button class="calagopus-copy" onclick="calagopusdatabases.copyencoded('${encodeURIComponent(`${database.host}:${database.port}`)}')">${this.safe(database.host)}:${Number(database.port || 0)}</button></td>
        <td><code>${this.safe(database.username)}</code></td>
        <td>${this.sizes[database.uuid] === undefined ? '<span class="spinner spinner-small"></span>' : this.formatbytes(this.sizes[database.uuid])}</td>
        <td><span class="calagopus-lock ${locked ? 'locked' : ''}">${locked ? t('cdb.locked') : t('cdb.unlocked')}</span></td>
        <td><div class="calagopus-row-actions"><button title="${t('cdb.credentials')}" onclick="calagopusdatabases.details(${index})"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg></button><button title="${t('cdb.openexplorer')}" onclick="calagopusdatabases.openexplorer(${index})"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3h18v18H3zM3 9h18M9 9v12"/></svg></button><button title="${t('cdb.edit')}" onclick="calagopusdatabases.edit(${index})"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button><button title="${t('cdb.recreate')}" onclick="calagopusdatabases.recreate(${index})" ${locked ? 'disabled' : ''}>↻</button><button class="danger" title="${t('cdb.delete')}" onclick="calagopusdatabases.remove(${index})"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg></button></div></td>
      </tr>`;
    }).join('');
    container.innerHTML = `<div class="calagopus-database-page">${this.header()}<div class="calagopus-database-table-wrap"><table class="calagopus-database-table"><thead><tr><th>${t('cdb.h.name')}</th><th>${t('cdb.h.engine')}</th><th>${t('cdb.h.address')}</th><th>${t('cdb.h.username')}</th><th>${t('cdb.h.size')}</th><th>${t('cdb.h.status')}</th><th></th></tr></thead><tbody>${rows || `<tr><td colspan="7"><div class="calagopus-database-empty">${t('cdb.empty')}</div></td></tr>`}</tbody></table></div>${this.paginationhtml()}</div>`;
  },

  renderinstances() {
    const container = Utils.el('tabDatabases');
    if (!container) return;
    const rows = this.instances.map((instance, index) => {
      const address = instance.host ? `${instance.host}${instance.port ? `:${instance.port}` : ''}` : t('cdb.notallocated');
      return `<tr>
        <td><button class="calagopus-database-name" onclick="calagopusdatabases.openinstance(${index})">${this.safe(instance.name)}</button></td>
        <td><span class="calagopus-database-type">${this.safe(instance.type)}</span></td>
        <td>${this.safe(address)}</td>
        <td>${this.formatbytes(Number(instance.memory || 0) * 1024 * 1024)}</td>
        <td>${this.formatbytes(Number(instance.disk || 0) * 1024 * 1024)}</td>
        <td>${instance.update_available ? `<span class="calagopus-update">${t('cdb.updateavailable')}</span>` : `<span class="calagopus-lock">${t('cdb.current')}</span>`}</td>
        <td><div class="calagopus-row-actions"><button title="${t('cdb.start')}" onclick="calagopusdatabases.power(${index},'start')">▶</button><button title="${t('cdb.restart')}" onclick="calagopusdatabases.power(${index},'restart')">↻</button><button title="${t('cdb.stop')}" onclick="calagopusdatabases.power(${index},'stop')">■</button><button class="danger" title="${t('cdb.delete')}" onclick="calagopusdatabases.removeinstance(${index})">×</button></div></td>
      </tr>`;
    }).join('');
    container.innerHTML = `<div class="calagopus-database-page">${this.header()}<div class="calagopus-database-table-wrap"><table class="calagopus-database-table"><thead><tr><th>${t('cdb.h.name')}</th><th>${t('cdb.h.engine')}</th><th>${t('cdb.h.address')}</th><th>${t('cdb.h.memory')}</th><th>${t('cdb.h.disk')}</th><th>${t('cdb.h.version')}</th><th></th></tr></thead><tbody>${rows || `<tr><td colspan="7"><div class="calagopus-database-empty">${t('cdb.emptyinstances')}</div></td></tr>`}</tbody></table></div>${this.paginationhtml()}</div>`;
  },

  setview(view) {
    this.page = 1;
    this.search = '';
    this.load(view);
  },

  setpage(page) {
    if (page < 1) return;
    this.page = page;
    this.load();
  },

  setsearch(value) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.search = value.trim();
      this.page = 1;
      this.load();
    }, 350);
  },

  opencreate() {
    if (this.view === 'instances') this.createinstancemodal();
    else this.createdatabasemodal();
  },

  createdatabasemodal() {
    const options = this.hosts.map(host => `<option value="${this.safe(host.uuid)}" ${host.maintenance_enabled ? 'disabled' : ''}>${this.safe(host.name)} · ${this.safe(host.type)}${host.maintenance_enabled ? ` · ${t('cdb.form.maintenance')}` : ''}</option>`).join('');
    Modal.open(t('cdb.newdb.title'), `<div class="form-group"><label class="form-label">${t('cdb.form.name')}</label><input class="form-input" id="calagopus-database-create-name" maxlength="31" placeholder="application_data" /></div><div class="form-group"><label class="form-label">${t('cdb.form.host')}</label><select class="form-input" id="calagopus-database-create-host"><option value="">${t('cdb.form.selecthost')}</option>${options}</select></div><div id="calagopus-database-create-error"></div><div class="modal-actions"><button class="btn btn-secondary" onclick="Modal.close()">${t('cset.cancel')}</button><button class="btn btn-primary" onclick="calagopusdatabases.createdatabase()">${t('cdb.create')}</button></div>`);
  },

  async createdatabase() {
    const name = Utils.el('calagopus-database-create-name').value.trim();
    const host = Utils.el('calagopus-database-create-host').value;
    if (!/^[a-zA-Z0-9_]{1,31}$/.test(name) || !host) return;
    try {
      await this.request('/databases', 'POST', { name, database_host_uuid: host });
      Modal.close();
      this.toast(t('cdb.created'));
      this.load('databases');
    } catch (error) {
      Utils.el('calagopus-database-create-error').innerHTML = `<div class="error-msg">${this.safe(error.message)}</div>`;
    }
  },

  createinstancemodal() {
    const options = this.templates.map(template => `<option value="${this.safe(template.uuid)}">${this.safe(template.name)} · ${this.safe(template.type)}</option>`).join('');
    Modal.open(t('cdb.newinstance.title'), `<div class="form-group"><label class="form-label">${t('cdb.form.instance.name')}</label><input class="form-input" id="calagopus-instance-create-name" maxlength="31" /></div><div class="form-group"><label class="form-label">${t('cdb.form.template')}</label><select class="form-input" id="calagopus-instance-create-template" onchange="calagopusdatabases.templatechanged()"><option value="">${t('cdb.form.selecttemplate')}</option>${options}</select></div><div class="form-group"><label class="form-label">${t('cdb.form.image')}</label><select class="form-input" id="calagopus-instance-create-image"><option value="">${t('cdb.form.selecttemplatefirst')}</option></select></div><div id="calagopus-instance-create-error"></div><div class="modal-actions"><button class="btn btn-secondary" onclick="Modal.close()">${t('cset.cancel')}</button><button class="btn btn-primary" onclick="calagopusdatabases.createinstance()">${t('cdb.create')}</button></div>`);
  },

  templatechanged() {
    const uuid = Utils.el('calagopus-instance-create-template').value;
    const template = this.templates.find(item => item.uuid === uuid);
    const images = template?.docker_images || {};
    Utils.el('calagopus-instance-create-image').innerHTML = Object.entries(images).map(([name, image]) => `<option value="${this.safe(image)}">${this.safe(name)}</option>`).join('') || `<option value="">${t('cdb.form.noimages')}</option>`;
  },

  async createinstance() {
    const name = Utils.el('calagopus-instance-create-name').value.trim();
    const template = Utils.el('calagopus-instance-create-template').value;
    const image = Utils.el('calagopus-instance-create-image').value;
    if (!name || !template || !image) return;
    try {
      await this.request('/databases/instances', 'POST', { template_uuid: template, name, image });
      Modal.close();
      this.toast(t('cdb.instancecreated'));
      this.load('instances');
    } catch (error) {
      Utils.el('calagopus-instance-create-error').innerHTML = `<div class="error-msg">${this.safe(error.message)}</div>`;
    }
  },

  details(index) {
    const database = this.databases[index];
    if (!database) return;
    const address = `${database.host}:${database.port}`;
    const password = database.password || '';
    const protocol = database.type === 'postgres' ? 'postgresql' : database.type;
    const connection = `jdbc:${protocol}://${database.username}:${encodeURIComponent(password)}@${address}/${database.name}`;
    this.copyvalue = connection;
    Modal.open(t('cdb.credentials.title'), `<div class="calagopus-credentials"><label><span>${t('cdb.form.database')}</span><div><code>${this.safe(database.name)}</code><button onclick="calagopusdatabases.copyencoded('${encodeURIComponent(database.name)}')">${t('cdb.copy')}</button></div></label><label><span>${t('cdb.h.address')}</span><div><code>${this.safe(address)}</code><button onclick="calagopusdatabases.copyencoded('${encodeURIComponent(address)}')">${t('cdb.copy')}</button></div></label><label><span>${t('cdb.h.username')}</span><div><code>${this.safe(database.username)}</code><button onclick="calagopusdatabases.copyencoded('${encodeURIComponent(database.username)}')">${t('cdb.copy')}</button></div></label><label><span>${t('cdb.form.password')}</span><div><code>${this.safe(password)}</code><button onclick="calagopusdatabases.copyencoded('${encodeURIComponent(password)}')">${t('cdb.copy')}</button></div></label><label><span>${t('cdb.form.jdbc')}</span><div><code>${this.safe(connection)}</code><button onclick="calagopusdatabases.copyjdbc()">${t('cdb.copy')}</button></div></label></div><div class="modal-actions"><button class="btn btn-danger" onclick="calagopusdatabases.rotate(${index})" ${database.is_locked ? 'disabled' : ''}>${t('cdb.rotate')}</button><button class="btn btn-secondary" onclick="Modal.close()">${t('cset.close')}</button></div>`);
  },

  copy(value) {
    navigator.clipboard.writeText(value).then(() => this.toast(t('cset.copiedtoast'))).catch(() => {});
  },

  copyencoded(value) {
    this.copy(decodeURIComponent(value));
  },

  copyjdbc() {
    this.copy(this.copyvalue || '');
  },

  edit(index) {
    const database = this.databases[index];
    if (!database) return;
    Modal.open(t('cdb.edit.title'), `<label class="calagopus-toggle"><input type="checkbox" id="calagopus-database-lock" ${database.is_locked ? 'checked' : ''}/><span>${t('cdb.locked')}</span></label><p class="modal-text">${t('cdb.edit.locknote')}</p><div class="modal-actions"><button class="btn btn-secondary" onclick="Modal.close()">${t('cset.cancel')}</button><button class="btn btn-primary" onclick="calagopusdatabases.saveedit(${index})">${t('cset.save')}</button></div>`);
  },

  async saveedit(index) {
    const database = this.databases[index];
    if (!database) return;
    try {
      await this.request(`/databases/${database.uuid}`, 'PATCH', { locked: Utils.el('calagopus-database-lock').checked });
      Modal.close();
      this.load('databases');
    } catch (error) {
      this.toast(error.message, 'error');
    }
  },

  rotate(index) {
    const database = this.databases[index];
    if (!database) return;
    Modal.confirm(t('cdb.rotate.title'), t('cdb.rotate.confirm'), async () => {
      try {
        await this.request(`/databases/${database.uuid}/rotate-password`, 'POST', {});
        Modal.close();
        this.toast(t('cdb.rotated'));
        this.load('databases');
      } catch (error) {
        this.toast(error.message, 'error');
      }
    });
  },

  remove(index) {
    const database = this.databases[index];
    if (!database) return;
    Modal.confirm(t('cdb.delete.title'), t('cdb.delete.confirm', { name: this.safe(database.name) }), async () => {
      try {
        await this.request(`/databases/${database.uuid}`, 'DELETE');
        Modal.close();
        this.toast(t('cdb.deleted'));
        this.load('databases');
      } catch (error) {
        this.toast(error.message, 'error');
      }
    });
  },

  recreate(index) {
    const database = this.databases[index];
    if (!database) return;
    Modal.confirm(t('cdb.recreate.title'), t('cdb.recreate.confirm', { name: this.safe(database.name) }), async () => {
      try {
        await this.request(`/databases/${database.uuid}/recreate`, 'POST', {});
        Modal.close();
        this.toast(t('cdb.recreated'));
        this.load('databases');
      } catch (error) {
        this.toast(error.message, 'error');
      }
    });
  },

  async power(index, action) {
    const instance = this.instances[index];
    if (!instance) return;
    try {
      await this.request(`/databases/instances/${instance.uuid}/power`, 'POST', { action });
      this.toast(t('cdb.power.requested', { name: instance.name, action: t('cdb.' + action) }));
    } catch (error) {
      this.toast(error.message, 'error');
    }
  },

  removeinstance(index) {
    const instance = this.instances[index];
    if (!instance) return;
    Modal.confirm(t('cdb.deleteinstance.title'), t('cdb.deleteinstance.confirm', { name: this.safe(instance.name) }), async () => {
      try {
        await this.request(`/databases/instances/${instance.uuid}`, 'DELETE');
        Modal.close();
        this.toast(t('cdb.instancedeleted'));
        this.load('instances');
      } catch (error) {
        this.toast(error.message, 'error');
      }
    });
  },

  async openexplorer(index) {
    const database = this.databases[index];
    if (!database || database.type === 'mongodb') {
      if (database) this.toast(t('cdb.mongodb.unsupported'), 'error');
      return;
    }
    this.currentdatabase = database;
    this.currenttable = null;
    this.schema = null;
    this.rows = null;
    this.renderexplorer();
    try {
      const result = await this.request(`/databases/${database.uuid}/explorer/schema`, 'GET', null, true);
      this.schema = result;
      this.currenttable = result?.tables?.[0] || null;
      this.renderexplorer();
      if (this.currenttable) this.loadrows();
    } catch (error) {
      this.toast(error.message, 'error');
    }
  },

  tablekey(table) {
    return table?.schema ? `${table.schema}.${table.name}` : table?.name || '';
  },

  renderexplorer() {
    const container = Utils.el('tabDatabases');
    if (!container || !this.currentdatabase) return;
    const tables = this.schema?.tables || [];
    const tablelist = tables.map((table, index) => `<button class="${this.tablekey(table) === this.tablekey(this.currenttable) ? 'active' : ''}" onclick="calagopusdatabases.selecttable(${index})"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3h18v18H3zM3 9h18M9 9v12"/></svg><span>${this.safe(this.tablekey(table))}</span>${table.row_estimate !== null && table.row_estimate !== undefined ? `<em>${Number(table.row_estimate).toLocaleString()}</em>` : ''}</button>`).join('');
    container.innerHTML = `<div class="calagopus-explorer"><div class="calagopus-explorer-top"><button class="btn btn-secondary btn-sm" onclick="calagopusdatabases.load('databases')">${t('cdb.back')}</button><div><h2>${this.safe(this.currentdatabase.name)}</h2><span>${this.safe(this.currentdatabase.type)}</span></div><button class="btn btn-primary btn-sm" onclick="calagopusdatabases.createtablemodal()">${t('cdb.newtable')}</button></div><div class="calagopus-explorer-layout"><aside><div class="calagopus-explorer-aside-title">${t('cdb.tables')}</div><div class="calagopus-explorer-tables">${this.schema ? tablelist || `<div class="calagopus-database-empty">${t('cdb.notables')}</div>` : '<div class="tab-loading"><span class="spinner"></span></div>'}</div></aside><main><div class="calagopus-explorer-tabs"><button class="active" data-explorer-view="rows" onclick="calagopusdatabases.explorerview('rows')">${t('cdb.rows')}</button><button data-explorer-view="structure" onclick="calagopusdatabases.explorerview('structure')">${t('cdb.structure')}</button><button data-explorer-view="query" onclick="calagopusdatabases.explorerview('query')">${t('cdb.query')}</button></div><div id="calagopus-explorer-content">${this.currenttable ? '<div class="tab-loading"><span class="spinner"></span></div>' : `<div class="calagopus-database-empty">${t('cdb.selecttable')}</div>`}</div></main></div></div>`;
  },

  async selecttable(index) {
    this.currenttable = this.schema?.tables?.[index] || null;
    this.renderexplorer();
    if (this.currenttable) this.loadrows();
  },

  explorerview(view) {
    document.querySelectorAll('.calagopus-explorer-tabs button').forEach(button => button.classList.toggle('active', button.getAttribute('data-explorer-view') === view));
    if (view === 'structure') this.renderstructure();
    else if (view === 'query') this.renderquery();
    else this.renderrows();
  },

  async loadrows(offset = 0) {
    if (!this.currentdatabase || !this.currenttable) return;
    const table = this.currenttable;
    try {
      const result = await this.request(`/databases/${this.currentdatabase.uuid}/explorer/rows`, 'POST', { schema: table.schema || null, table: table.name, order_by: null, descending: false, limit: 100, offset, filters: [] }, true);
      this.rows = result?.result || result;
      this.renderrows();
    } catch (error) {
      this.toast(error.message, 'error');
    }
  },

  resulttable(result) {
    if (!result) return '<div class="tab-loading"><span class="spinner"></span></div>';
    const columns = result.columns || [];
    const rows = result.rows || [];
    const head = columns.map(column => `<th>${this.safe(column.name)}<small>${this.safe(column.type_name)}</small></th>`).join('');
    const body = rows.map(row => `<tr>${row.map(value => `<td>${value.type === 'null' ? '<em>NULL</em>' : value.type === 'binary' ? '<code>[binary]</code>' : this.safe(value.value)}</td>`).join('')}</tr>`).join('');
    return `<div class="calagopus-result-wrap"><table class="calagopus-result"><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${Math.max(columns.length, 1)}">${t('cdb.norows')}</td></tr>`}</tbody></table></div>${result.truncated ? `<div class="calagopus-result-note">${t('cdb.truncated')}</div>` : ''}`;
  },

  renderrows() {
    const content = Utils.el('calagopus-explorer-content');
    if (!content) return;
    const result = this.rows;
    const columns = result?.columns || [];
    const rows = result?.rows || [];
    const head = columns.map(column => `<th>${this.safe(column.name)}<small>${this.safe(column.type_name)}</small></th>`).join('');
    const body = rows.map((row, index) => `<tr>${row.map(value => `<td>${value.type === 'null' ? '<em>NULL</em>' : value.type === 'binary' ? '<code>[binary]</code>' : this.safe(value.value)}</td>`).join('')}<td><div class="calagopus-row-actions"><button onclick="calagopusdatabases.editrowmodal(${index})">${t('cdb.edit')}</button><button class="danger" onclick="calagopusdatabases.deleterow(${index})">${t('cdb.delete')}</button></div></td></tr>`).join('');
    content.innerHTML = `<div class="calagopus-explorer-toolbar"><span>${this.safe(this.tablekey(this.currenttable))}</span><div><button class="btn btn-primary btn-sm" onclick="calagopusdatabases.insertrowmodal()">${t('cdb.newrow')}</button><button class="btn btn-secondary btn-sm" onclick="calagopusdatabases.loadrows()">${t('cdb.refresh')}</button></div></div><div class="calagopus-result-wrap"><table class="calagopus-result"><thead><tr>${head}<th></th></tr></thead><tbody>${body || `<tr><td colspan="${Math.max(columns.length + 1, 1)}">${t('cdb.norows')}</td></tr>`}</tbody></table></div>${result?.truncated ? `<div class="calagopus-result-note">${t('cdb.truncated')}</div>` : ''}`;
  },

  rowfields(row = null) {
    const columns = this.rows?.columns || [];
    return columns.map((column, index) => {
      const value = row?.[index];
      const text = value && value.type !== 'null' && value.type !== 'binary' ? value.value : '';
      return `<div class="form-group"><label class="form-label">${this.safe(column.name)} <small>${this.safe(column.type_name)}</small></label><input class="form-input" id="calagopus-row-value-${index}" value="${this.safe(text)}" placeholder="NULL" /></div>`;
    }).join('');
  },

  insertrowmodal() {
    Modal.open(t('cdb.newrow'), `<div class="calagopus-row-form">${this.rowfields()}</div><div class="modal-actions"><button class="btn btn-secondary" onclick="Modal.close()">${t('cset.cancel')}</button><button class="btn btn-primary" onclick="calagopusdatabases.insertrow()">${t('cdb.insert')}</button></div>`);
  },

  rowvalues() {
    return (this.rows?.columns || []).map((column, index) => {
      const value = Utils.el(`calagopus-row-value-${index}`).value;
      return { column: column.name, value: value === '' ? null : value };
    });
  },

  async insertrow() {
    if (!this.currentdatabase || !this.currenttable) return;
    try {
      await this.request(`/databases/${this.currentdatabase.uuid}/explorer/rows/insert`, 'POST', { schema: this.currenttable.schema || null, table: this.currenttable.name, rows: [{ values: this.rowvalues() }] }, true);
      Modal.close();
      this.toast(t('cdb.rowinserted'));
      this.loadrows();
    } catch (error) {
      this.toast(error.message, 'error');
    }
  },

  editrowmodal(index) {
    const row = this.rows?.rows?.[index];
    if (!row) return;
    this.editingrow = index;
    Modal.open(t('cdb.editrow.title'), `<div class="calagopus-row-form">${this.rowfields(row)}</div><div class="modal-actions"><button class="btn btn-secondary" onclick="Modal.close()">${t('cset.cancel')}</button><button class="btn btn-primary" onclick="calagopusdatabases.updaterow()">${t('cset.save')}</button></div>`);
  },

  rowkeys(index) {
    const row = this.rows?.rows?.[index] || [];
    const columns = this.rows?.columns || [];
    const primary = this.currenttable?.columns?.filter(column => column.primary_key).map(column => column.name) || [];
    const names = primary.length ? primary : columns.map(column => column.name);
    return names.map(name => {
      const index = columns.findIndex(column => column.name === name);
      const value = row[index];
      return { column: name, value: !value || value.type === 'null' ? null : value.value };
    });
  },

  async updaterow() {
    if (!this.currentdatabase || !this.currenttable || this.editingrow === undefined) return;
    try {
      await this.request(`/databases/${this.currentdatabase.uuid}/explorer/rows/update`, 'POST', { schema: this.currenttable.schema || null, table: this.currenttable.name, rows: [{ keys: this.rowkeys(this.editingrow), values: this.rowvalues() }] }, true);
      Modal.close();
      this.toast(t('cdb.rowupdated'));
      this.loadrows();
    } catch (error) {
      this.toast(error.message, 'error');
    }
  },

  deleterow(index) {
    if (!this.currentdatabase || !this.currenttable) return;
    Modal.confirm(t('cdb.deleterow.title'), t('cdb.deleterow.confirm'), async () => {
      try {
        await this.request(`/databases/${this.currentdatabase.uuid}/explorer/rows/delete`, 'POST', { schema: this.currenttable.schema || null, table: this.currenttable.name, rows: [{ keys: this.rowkeys(index) }] }, true);
        Modal.close();
        this.toast(t('cdb.rowdeleted'));
        this.loadrows();
      } catch (error) {
        this.toast(error.message, 'error');
      }
    });
  },

  renderstructure() {
    const content = Utils.el('calagopus-explorer-content');
    if (!content || !this.currenttable) return;
    const columns = this.currenttable.columns || [];
    const rows = columns.map((column, index) => `<tr><td><code>${this.safe(column.name)}</code></td><td>${this.safe(column.type_name)}</td><td>${column.nullable ? t('cdb.yes') : t('cdb.no')}</td><td>${column.primary_key ? t('cdb.yes') : t('cdb.no')}</td><td>${column.auto_increment ? t('cdb.yes') : t('cdb.no')}</td><td><div class="calagopus-row-actions"><button onclick="calagopusdatabases.renamecolumnmodal(${index})">${t('cdb.rename')}</button><button class="danger" onclick="calagopusdatabases.deletecolumn(${index})">${t('cdb.delete')}</button></div></td></tr>`).join('');
    content.innerHTML = `<div class="calagopus-explorer-toolbar"><span>${this.safe(this.tablekey(this.currenttable))}</span><div><button class="btn btn-secondary btn-sm" onclick="calagopusdatabases.renametablemodal()">${t('cdb.renametable')}</button><button class="btn btn-primary btn-sm" onclick="calagopusdatabases.createcolumnmodal()">${t('cdb.newcolumn')}</button><button class="btn btn-danger btn-sm" onclick="calagopusdatabases.deletetable()">${t('cdb.deletetable')}</button></div></div><div class="calagopus-database-table-wrap"><table class="calagopus-database-table"><thead><tr><th>${t('cdb.h.column')}</th><th>${t('cdb.h.type')}</th><th>${t('cdb.h.nullable')}</th><th>${t('cdb.h.primary')}</th><th>${t('cdb.h.automatic')}</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  },

  renderquery() {
    const content = Utils.el('calagopus-explorer-content');
    if (!content) return;
    content.innerHTML = `<div class="calagopus-query"><div class="calagopus-query-toolbar"><label class="calagopus-toggle"><input type="checkbox" id="calagopus-query-readonly" checked/><span>${t('cdb.readonly')}</span></label><button class="btn btn-primary btn-sm" onclick="calagopusdatabases.runquery()">${t('cdb.runquery')}</button></div><textarea id="calagopus-query-input" spellcheck="false" placeholder="SELECT * FROM table_name LIMIT 100;"></textarea><div id="calagopus-query-results"></div></div>`;
  },

  async runquery() {
    const query = Utils.el('calagopus-query-input').value.trim();
    if (!query || !this.currentdatabase) return;
    try {
      const result = await this.request(`/databases/${this.currentdatabase.uuid}/explorer/query`, 'POST', { query, rows: 1000, read_only: Utils.el('calagopus-query-readonly').checked }, true);
      this.queryresults = result?.results || [];
      Utils.el('calagopus-query-results').innerHTML = this.queryresults.map((item, index) => `<section><h4>${t('cdb.result', { n: index + 1 })}${item.rows_affected ? ` · ${t('cdb.result.affected', { n: item.rows_affected })}` : ''}</h4>${this.resulttable(item)}</section>`).join('') || `<div class="calagopus-database-empty">${t('cdb.query.empty')}</div>`;
    } catch (error) {
      this.toast(error.message, 'error');
    }
  },

  createtablemodal() {
    Modal.open(t('cdb.newtable'), `<div class="form-group"><label class="form-label">${t('cdb.form.tablename')}</label><input class="form-input" id="calagopus-table-name" /></div><div class="form-group"><label class="form-label">${t('cdb.form.firstcolumn')}</label><input class="form-input" id="calagopus-table-column" value="id" /></div><div class="form-group"><label class="form-label">${t('cdb.form.columntype')}</label><input class="form-input" id="calagopus-table-type" value="BIGINT" /></div><label class="calagopus-toggle"><input type="checkbox" id="calagopus-table-primary" checked/><span>${t('cdb.form.primary')}</span></label><label class="calagopus-toggle"><input type="checkbox" id="calagopus-table-auto" checked/><span>${t('cdb.form.autoincrement')}</span></label><div class="modal-actions"><button class="btn btn-secondary" onclick="Modal.close()">${t('cset.cancel')}</button><button class="btn btn-primary" onclick="calagopusdatabases.createtable()">${t('cdb.create')}</button></div>`);
  },

  async createtable() {
    const table = Utils.el('calagopus-table-name').value.trim();
    const name = Utils.el('calagopus-table-column').value.trim();
    const type = Utils.el('calagopus-table-type').value.trim();
    if (!table || !name || !type) return;
    await this.structureaction('/tables', { schema: null, table, columns: [{ name, type, nullable: false, primary_key: Utils.el('calagopus-table-primary').checked, auto_increment: Utils.el('calagopus-table-auto').checked }] });
  },

  renametablemodal() {
    Modal.open(t('cdb.renametable'), `<div class="form-group"><label class="form-label">${t('cdb.form.newname')}</label><input class="form-input" id="calagopus-table-rename" value="${this.safe(this.currenttable?.name)}" /></div><div class="modal-actions"><button class="btn btn-secondary" onclick="Modal.close()">${t('cset.cancel')}</button><button class="btn btn-primary" onclick="calagopusdatabases.renametable()">${t('cdb.rename')}</button></div>`);
  },

  async renametable() {
    const name = Utils.el('calagopus-table-rename').value.trim();
    if (!name) return;
    await this.structureaction('/tables/rename', { schema: this.currenttable.schema || null, table: this.currenttable.name, name });
  },

  deletetable() {
    Modal.confirm(t('cdb.deletetable'), t('cdb.deletetable.confirm', { name: this.safe(this.currenttable?.name) }), () => this.structureaction('/tables/delete', { schema: this.currenttable.schema || null, table: this.currenttable.name }));
  },

  createcolumnmodal() {
    Modal.open(t('cdb.newcolumn'), `<div class="form-group"><label class="form-label">${t('cdb.form.columnname')}</label><input class="form-input" id="calagopus-column-name" /></div><div class="form-group"><label class="form-label">${t('cdb.h.type')}</label><input class="form-input" id="calagopus-column-type" value="VARCHAR(255)" /></div><label class="calagopus-toggle"><input type="checkbox" id="calagopus-column-nullable"/><span>${t('cdb.form.nullable')}</span></label><div class="modal-actions"><button class="btn btn-secondary" onclick="Modal.close()">${t('cset.cancel')}</button><button class="btn btn-primary" onclick="calagopusdatabases.createcolumn()">${t('cdb.create')}</button></div>`);
  },

  async createcolumn() {
    const name = Utils.el('calagopus-column-name').value.trim();
    const type = Utils.el('calagopus-column-type').value.trim();
    if (!name || !type) return;
    await this.structureaction('/tables/columns', { schema: this.currenttable.schema || null, table: this.currenttable.name, column: { name, type, nullable: Utils.el('calagopus-column-nullable').checked, primary_key: false, auto_increment: false } });
  },

  renamecolumnmodal(index) {
    const column = this.currenttable?.columns?.[index];
    if (!column) return;
    Modal.open(t('cdb.renamecolumn'), `<div class="form-group"><label class="form-label">${t('cdb.form.newname')}</label><input class="form-input" id="calagopus-column-rename" value="${this.safe(column.name)}" /></div><div class="modal-actions"><button class="btn btn-secondary" onclick="Modal.close()">${t('cset.cancel')}</button><button class="btn btn-primary" onclick="calagopusdatabases.renamecolumn(${index})">${t('cdb.rename')}</button></div>`);
  },

  async renamecolumn(index) {
    const column = this.currenttable?.columns?.[index];
    const name = Utils.el('calagopus-column-rename').value.trim();
    if (!column || !name) return;
    await this.structureaction('/tables/columns/rename', { schema: this.currenttable.schema || null, table: this.currenttable.name, column: column.name, name });
  },

  deletecolumn(index) {
    const column = this.currenttable?.columns?.[index];
    if (!column) return;
    Modal.confirm(t('cdb.deletecolumn'), t('cdb.deletecolumn.confirm', { name: this.safe(column.name) }), () => this.structureaction('/tables/columns/delete', { schema: this.currenttable.schema || null, table: this.currenttable.name, column: column.name }));
  },

  async structureaction(endpoint, body) {
    if (!this.currentdatabase) return;
    try {
      await this.request(`/databases/${this.currentdatabase.uuid}/explorer${endpoint}`, 'POST', body);
      Modal.close();
      this.toast(t('cdb.structureupdated'));
      const result = await this.request(`/databases/${this.currentdatabase.uuid}/explorer/schema`, 'GET', null, true);
      this.schema = result;
      this.currenttable = result?.tables?.find(table => table.name === (body.name || body.table)) || result?.tables?.[0] || null;
      this.renderexplorer();
      if (this.currenttable) this.loadrows();
    } catch (error) {
      this.toast(error.message, 'error');
    }
  },

  async openinstance(index) {
    const instance = this.instances[index];
    if (!instance) return;
    this.currentinstance = instance;
    this.renderinstancedetail([], []);
    try {
      const [databases, users] = await Promise.all([
        this.request(`/databases/instances/${instance.uuid}/databases`),
        this.request(`/databases/instances/${instance.uuid}/users`)
      ]);
      this.renderinstancedetail(databases?.databases || [], users?.users || []);
    } catch (error) {
      this.toast(error.message, 'error');
    }
  },

  renderinstancedetail(databases, users) {
    const container = Utils.el('tabDatabases');
    const instance = this.currentinstance;
    if (!container || !instance) return;
    const databaserows = databases.map((database, index) => `<tr><td>${this.safe(database.name)}</td><td>${this.safe(database.created || '')}</td><td><button class="btn btn-danger btn-sm" onclick="calagopusdatabases.removeinstancedatabase('${this.safe(database.uuid)}')">${t('cdb.delete')}</button></td></tr>`).join('');
    const userrows = users.map((user, index) => `<tr><td><code>${this.safe(user.username)}</code></td><td><button class="calagopus-copy" onclick="calagopusdatabases.copyencoded('${encodeURIComponent(user.password)}')">${this.safe(user.password)}</button></td><td>${Number(user.databases?.length || 0)}</td><td><div class="calagopus-row-actions"><button onclick="calagopusdatabases.rotateinstanceuser('${this.safe(user.uuid)}')">${t('cdb.rotatebtn')}</button><button class="danger" onclick="calagopusdatabases.removeinstanceuser('${this.safe(user.uuid)}')">${t('cdb.delete')}</button></div></td></tr>`).join('');
    container.innerHTML = `<div class="calagopus-database-page"><div class="calagopus-instance-top"><button class="btn btn-secondary btn-sm" onclick="calagopusdatabases.load('instances')">${t('cdb.back')}</button><div><h2>${this.safe(instance.name)}</h2><span>${this.safe(instance.type)}</span></div><div class="calagopus-instance-power"><button class="btn btn-green btn-sm" onclick="calagopusdatabases.instancepower('start')">${t('cdb.start')}</button><button class="btn btn-secondary btn-sm" onclick="calagopusdatabases.instancepower('restart')">${t('cdb.restart')}</button><button class="btn btn-red btn-sm" onclick="calagopusdatabases.instancepower('stop')">${t('cdb.stop')}</button></div></div><div class="calagopus-instance-stats"><div><span>${t('cdb.h.address')}</span><strong>${this.safe(instance.host ? `${instance.host}:${instance.port || ''}` : t('cdb.notallocated'))}</strong></div><div><span>${t('cdb.h.memory')}</span><strong>${this.formatbytes(Number(instance.memory || 0) * 1024 * 1024)}</strong></div><div><span>${t('cdb.h.disk')}</span><strong>${this.formatbytes(Number(instance.disk || 0) * 1024 * 1024)}</strong></div><div><span>CPU</span><strong>${Number(instance.cpu || 0)}%</strong></div></div><section class="calagopus-instance-section"><div class="calagopus-instance-section-head"><h3>${t('cdb.heading')}</h3><button class="btn btn-primary btn-sm" onclick="calagopusdatabases.createinstancedatabasemodal()">${t('cdb.newdb')}</button></div><div class="calagopus-database-table-wrap"><table class="calagopus-database-table"><thead><tr><th>${t('cdb.h.name')}</th><th>${t('cdb.h.created')}</th><th></th></tr></thead><tbody>${databaserows || `<tr><td colspan="3">${t('cdb.nodatabases')}</td></tr>`}</tbody></table></div></section><section class="calagopus-instance-section"><div class="calagopus-instance-section-head"><h3>${t('cdb.users')}</h3><button class="btn btn-primary btn-sm" onclick="calagopusdatabases.createinstanceusermodal()">${t('cdb.newuser')}</button></div><div class="calagopus-database-table-wrap"><table class="calagopus-database-table"><thead><tr><th>${t('cdb.h.username')}</th><th>${t('cdb.form.password')}</th><th>${t('cdb.h.databases')}</th><th></th></tr></thead><tbody>${userrows || `<tr><td colspan="4">${t('cdb.nousers')}</td></tr>`}</tbody></table></div></section></div>`;
  },

  async instancepower(action) {
    if (!this.currentinstance) return;
    try {
      await this.request(`/databases/instances/${this.currentinstance.uuid}/power`, 'POST', { action });
      this.toast(t('cdb.power.actionrequested', { action: t('cdb.' + action) }));
    } catch (error) {
      this.toast(error.message, 'error');
    }
  },

  createinstancedatabasemodal() {
    Modal.open(t('cdb.newdb'), `<div class="form-group"><label class="form-label">${t('cdb.form.name')}</label><input class="form-input" id="calagopus-instance-database-name" /></div><div class="modal-actions"><button class="btn btn-secondary" onclick="Modal.close()">${t('cset.cancel')}</button><button class="btn btn-primary" onclick="calagopusdatabases.createinstancedatabase()">${t('cdb.create')}</button></div>`);
  },

  async createinstancedatabase() {
    const name = Utils.el('calagopus-instance-database-name').value.trim();
    if (!name || !this.currentinstance) return;
    try {
      await this.request(`/databases/instances/${this.currentinstance.uuid}/databases`, 'POST', { name });
      Modal.close();
      this.openinstance(this.instances.findIndex(instance => instance.uuid === this.currentinstance.uuid));
    } catch (error) {
      this.toast(error.message, 'error');
    }
  },

  createinstanceusermodal() {
    Modal.open(t('cdb.newuser.title'), `<div class="form-group"><label class="form-label">${t('cdb.h.username')}</label><input class="form-input" id="calagopus-instance-user-name" /></div><div class="modal-actions"><button class="btn btn-secondary" onclick="Modal.close()">${t('cset.cancel')}</button><button class="btn btn-primary" onclick="calagopusdatabases.createinstanceuser()">${t('cdb.create')}</button></div>`);
  },

  async createinstanceuser() {
    const username = Utils.el('calagopus-instance-user-name').value.trim();
    if (!username || !this.currentinstance) return;
    try {
      const result = await this.request(`/databases/instances/${this.currentinstance.uuid}/users`, 'POST', { username, databases: [] });
      Modal.close();
      this.toast(result?.user?.password ? t('cdb.usercreated.pw', { pw: result.user.password }) : t('cdb.usercreated'));
      this.openinstance(this.instances.findIndex(instance => instance.uuid === this.currentinstance.uuid));
    } catch (error) {
      this.toast(error.message, 'error');
    }
  },

  removeinstancedatabase(uuid) {
    if (!this.currentinstance) return;
    Modal.confirm(t('cdb.delete.title'), t('cdb.delete.confirm.short'), async () => {
      try {
        await this.request(`/databases/instances/${this.currentinstance.uuid}/databases/${uuid}`, 'DELETE');
        Modal.close();
        this.openinstance(this.instances.findIndex(instance => instance.uuid === this.currentinstance.uuid));
      } catch (error) {
        this.toast(error.message, 'error');
      }
    });
  },

  async rotateinstanceuser(uuid) {
    if (!this.currentinstance) return;
    try {
      const result = await this.request(`/databases/instances/${this.currentinstance.uuid}/users/${uuid}/rotate-password`, 'POST', {});
      this.toast(t('cdb.rotateuser.toast', { pw: result?.password || '' }));
      this.openinstance(this.instances.findIndex(instance => instance.uuid === this.currentinstance.uuid));
    } catch (error) {
      this.toast(error.message, 'error');
    }
  },

  removeinstanceuser(uuid) {
    if (!this.currentinstance) return;
    Modal.confirm(t('cdb.deleteuser.title'), t('cdb.deleteuser.confirm'), async () => {
      try {
        await this.request(`/databases/instances/${this.currentinstance.uuid}/users/${uuid}`, 'DELETE');
        Modal.close();
        this.openinstance(this.instances.findIndex(instance => instance.uuid === this.currentinstance.uuid));
      } catch (error) {
        this.toast(error.message, 'error');
      }
    });
  }
};
