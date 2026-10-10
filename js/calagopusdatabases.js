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
    if (!server || server.type !== 'Calagopus') throw new Error('No Calagopus server selected');
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
      let message = `HTTP ${response.status}`;
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
    if (container) container.innerHTML = `<div class="calagopus-database-error"><strong>Unable to load databases</strong><span>${this.safe(message)}</span><button class="btn btn-secondary" onclick="calagopusdatabases.load()">Try Again</button></div>`;
  },

  header() {
    const createbutton = this.view === 'databases' && this.hosts.length
      ? '<button class="btn btn-primary btn-sm" onclick="calagopusdatabases.opencreate()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>New Database</button>'
      : '';
    return `<div class="calagopus-database-header">
      <div><h2>Databases</h2><span>Manage database services and application data.</span></div>
      <div class="calagopus-database-header-actions">
        <label class="calagopus-database-search"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg><input value="${this.safe(this.search)}" placeholder="Search databases" oninput="calagopusdatabases.setsearch(this.value)" /></label>
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
    return `<div class="calagopus-database-pagination"><button class="btn btn-secondary btn-sm" onclick="calagopusdatabases.setpage(${page - 1})" ${page <= 1 ? 'disabled' : ''}>Previous</button><span>Page ${page} of ${pages}</span><button class="btn btn-secondary btn-sm" onclick="calagopusdatabases.setpage(${page + 1})" ${page >= pages ? 'disabled' : ''}>Next</button></div>`;
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
        <td><span class="calagopus-lock ${locked ? 'locked' : ''}">${locked ? 'Locked' : 'Unlocked'}</span></td>
        <td><div class="calagopus-row-actions"><button title="Credentials" onclick="calagopusdatabases.details(${index})"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg></button><button title="Open explorer" onclick="calagopusdatabases.openexplorer(${index})"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3h18v18H3zM3 9h18M9 9v12"/></svg></button><button title="Edit" onclick="calagopusdatabases.edit(${index})"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button><button title="Recreate" onclick="calagopusdatabases.recreate(${index})" ${locked ? 'disabled' : ''}>↻</button><button class="danger" title="Delete" onclick="calagopusdatabases.remove(${index})"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg></button></div></td>
      </tr>`;
    }).join('');
    container.innerHTML = `<div class="calagopus-database-page">${this.header()}<div class="calagopus-database-table-wrap"><table class="calagopus-database-table"><thead><tr><th>Name</th><th>Engine</th><th>Address</th><th>Username</th><th>Size</th><th>Status</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="7"><div class="calagopus-database-empty">No databases found.</div></td></tr>'}</tbody></table></div>${this.paginationhtml()}</div>`;
  },

  renderinstances() {
    const container = Utils.el('tabDatabases');
    if (!container) return;
    const rows = this.instances.map((instance, index) => {
      const address = instance.host ? `${instance.host}${instance.port ? `:${instance.port}` : ''}` : 'Not allocated';
      return `<tr>
        <td><button class="calagopus-database-name" onclick="calagopusdatabases.openinstance(${index})">${this.safe(instance.name)}</button></td>
        <td><span class="calagopus-database-type">${this.safe(instance.type)}</span></td>
        <td>${this.safe(address)}</td>
        <td>${this.formatbytes(Number(instance.memory || 0) * 1024 * 1024)}</td>
        <td>${this.formatbytes(Number(instance.disk || 0) * 1024 * 1024)}</td>
        <td>${instance.update_available ? '<span class="calagopus-update">Update available</span>' : '<span class="calagopus-lock">Current</span>'}</td>
        <td><div class="calagopus-row-actions"><button title="Start" onclick="calagopusdatabases.power(${index},'start')">▶</button><button title="Restart" onclick="calagopusdatabases.power(${index},'restart')">↻</button><button title="Stop" onclick="calagopusdatabases.power(${index},'stop')">■</button><button class="danger" title="Delete" onclick="calagopusdatabases.removeinstance(${index})">×</button></div></td>
      </tr>`;
    }).join('');
    container.innerHTML = `<div class="calagopus-database-page">${this.header()}<div class="calagopus-database-table-wrap"><table class="calagopus-database-table"><thead><tr><th>Name</th><th>Engine</th><th>Address</th><th>Memory</th><th>Disk</th><th>Version</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="7"><div class="calagopus-database-empty">No database instances found.</div></td></tr>'}</tbody></table></div>${this.paginationhtml()}</div>`;
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
    const options = this.hosts.map(host => `<option value="${this.safe(host.uuid)}" ${host.maintenance_enabled ? 'disabled' : ''}>${this.safe(host.name)} · ${this.safe(host.type)}${host.maintenance_enabled ? ' · maintenance' : ''}</option>`).join('');
    Modal.open('New Database', `<div class="form-group"><label class="form-label">Database Name</label><input class="form-input" id="calagopus-database-create-name" maxlength="31" placeholder="application_data" /></div><div class="form-group"><label class="form-label">Database Host</label><select class="form-input" id="calagopus-database-create-host"><option value="">Select a host</option>${options}</select></div><div id="calagopus-database-create-error"></div><div class="modal-actions"><button class="btn btn-secondary" onclick="Modal.close()">Cancel</button><button class="btn btn-primary" onclick="calagopusdatabases.createdatabase()">Create</button></div>`);
  },

  async createdatabase() {
    const name = Utils.el('calagopus-database-create-name').value.trim();
    const host = Utils.el('calagopus-database-create-host').value;
    if (!/^[a-zA-Z0-9_]{1,31}$/.test(name) || !host) return;
    try {
      await this.request('/databases', 'POST', { name, database_host_uuid: host });
      Modal.close();
      this.toast('Database created');
      this.load('databases');
    } catch (error) {
      Utils.el('calagopus-database-create-error').innerHTML = `<div class="error-msg">${this.safe(error.message)}</div>`;
    }
  },

  createinstancemodal() {
    const options = this.templates.map(template => `<option value="${this.safe(template.uuid)}">${this.safe(template.name)} · ${this.safe(template.type)}</option>`).join('');
    Modal.open('New Database Instance', `<div class="form-group"><label class="form-label">Instance Name</label><input class="form-input" id="calagopus-instance-create-name" maxlength="31" /></div><div class="form-group"><label class="form-label">Template</label><select class="form-input" id="calagopus-instance-create-template" onchange="calagopusdatabases.templatechanged()"><option value="">Select a template</option>${options}</select></div><div class="form-group"><label class="form-label">Image</label><select class="form-input" id="calagopus-instance-create-image"><option value="">Select a template first</option></select></div><div id="calagopus-instance-create-error"></div><div class="modal-actions"><button class="btn btn-secondary" onclick="Modal.close()">Cancel</button><button class="btn btn-primary" onclick="calagopusdatabases.createinstance()">Create</button></div>`);
  },

  templatechanged() {
    const uuid = Utils.el('calagopus-instance-create-template').value;
    const template = this.templates.find(item => item.uuid === uuid);
    const images = template?.docker_images || {};
    Utils.el('calagopus-instance-create-image').innerHTML = Object.entries(images).map(([name, image]) => `<option value="${this.safe(image)}">${this.safe(name)}</option>`).join('') || '<option value="">No images available</option>';
  },

  async createinstance() {
    const name = Utils.el('calagopus-instance-create-name').value.trim();
    const template = Utils.el('calagopus-instance-create-template').value;
    const image = Utils.el('calagopus-instance-create-image').value;
    if (!name || !template || !image) return;
    try {
      await this.request('/databases/instances', 'POST', { template_uuid: template, name, image });
      Modal.close();
      this.toast('Database instance created');
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
    Modal.open('Database Credentials', `<div class="calagopus-credentials"><label><span>Database</span><div><code>${this.safe(database.name)}</code><button onclick="calagopusdatabases.copyencoded('${encodeURIComponent(database.name)}')">Copy</button></div></label><label><span>Address</span><div><code>${this.safe(address)}</code><button onclick="calagopusdatabases.copyencoded('${encodeURIComponent(address)}')">Copy</button></div></label><label><span>Username</span><div><code>${this.safe(database.username)}</code><button onclick="calagopusdatabases.copyencoded('${encodeURIComponent(database.username)}')">Copy</button></div></label><label><span>Password</span><div><code>${this.safe(password)}</code><button onclick="calagopusdatabases.copyencoded('${encodeURIComponent(password)}')">Copy</button></div></label><label><span>JDBC Connection String</span><div><code>${this.safe(connection)}</code><button onclick="calagopusdatabases.copyjdbc()">Copy</button></div></label></div><div class="modal-actions"><button class="btn btn-danger" onclick="calagopusdatabases.rotate(${index})" ${database.is_locked ? 'disabled' : ''}>Rotate Password</button><button class="btn btn-secondary" onclick="Modal.close()">Close</button></div>`);
  },

  copy(value) {
    navigator.clipboard.writeText(value).then(() => this.toast('Copied to clipboard')).catch(() => {});
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
    Modal.open('Edit Database', `<label class="calagopus-toggle"><input type="checkbox" id="calagopus-database-lock" ${database.is_locked ? 'checked' : ''}/><span>Locked</span></label><p class="modal-text">Locked databases cannot be recreated, deleted, or have their password rotated.</p><div class="modal-actions"><button class="btn btn-secondary" onclick="Modal.close()">Cancel</button><button class="btn btn-primary" onclick="calagopusdatabases.saveedit(${index})">Save</button></div>`);
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
    Modal.confirm('Rotate Password', 'The previous password will immediately stop working.', async () => {
      try {
        await this.request(`/databases/${database.uuid}/rotate-password`, 'POST', {});
        Modal.close();
        this.toast('Password rotated');
        this.load('databases');
      } catch (error) {
        this.toast(error.message, 'error');
      }
    });
  },

  remove(index) {
    const database = this.databases[index];
    if (!database) return;
    Modal.confirm('Delete Database', `Delete ${database.name} and all stored data?`, async () => {
      try {
        await this.request(`/databases/${database.uuid}`, 'DELETE');
        Modal.close();
        this.toast('Database deleted');
        this.load('databases');
      } catch (error) {
        this.toast(error.message, 'error');
      }
    });
  },

  recreate(index) {
    const database = this.databases[index];
    if (!database) return;
    Modal.confirm('Recreate Database', `Erase and recreate ${database.name}? All current data will be lost.`, async () => {
      try {
        await this.request(`/databases/${database.uuid}/recreate`, 'POST', {});
        Modal.close();
        this.toast('Database recreated');
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
      this.toast(`${instance.name}: ${action} requested`);
    } catch (error) {
      this.toast(error.message, 'error');
    }
  },

  removeinstance(index) {
    const instance = this.instances[index];
    if (!instance) return;
    Modal.confirm('Delete Database Instance', `Delete ${instance.name} and all of its databases?`, async () => {
      try {
        await this.request(`/databases/instances/${instance.uuid}`, 'DELETE');
        Modal.close();
        this.toast('Database instance deleted');
        this.load('instances');
      } catch (error) {
        this.toast(error.message, 'error');
      }
    });
  },

  async openexplorer(index) {
    const database = this.databases[index];
    if (!database || database.type === 'mongodb') {
      if (database) this.toast('MongoDB explorer is not supported by Calagopus', 'error');
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
    container.innerHTML = `<div class="calagopus-explorer"><div class="calagopus-explorer-top"><button class="btn btn-secondary btn-sm" onclick="calagopusdatabases.load('databases')">Back</button><div><h2>${this.safe(this.currentdatabase.name)}</h2><span>${this.safe(this.currentdatabase.type)}</span></div><button class="btn btn-primary btn-sm" onclick="calagopusdatabases.createtablemodal()">New Table</button></div><div class="calagopus-explorer-layout"><aside><div class="calagopus-explorer-aside-title">Tables</div><div class="calagopus-explorer-tables">${this.schema ? tablelist || '<div class="calagopus-database-empty">No tables</div>' : '<div class="tab-loading"><span class="spinner"></span></div>'}</div></aside><main><div class="calagopus-explorer-tabs"><button class="active" data-explorer-view="rows" onclick="calagopusdatabases.explorerview('rows')">Rows</button><button data-explorer-view="structure" onclick="calagopusdatabases.explorerview('structure')">Structure</button><button data-explorer-view="query" onclick="calagopusdatabases.explorerview('query')">Query</button></div><div id="calagopus-explorer-content">${this.currenttable ? '<div class="tab-loading"><span class="spinner"></span></div>' : '<div class="calagopus-database-empty">Select or create a table.</div>'}</div></main></div></div>`;
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
    return `<div class="calagopus-result-wrap"><table class="calagopus-result"><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${Math.max(columns.length, 1)}">No rows returned.</td></tr>`}</tbody></table></div>${result.truncated ? '<div class="calagopus-result-note">Results were truncated by the panel.</div>' : ''}`;
  },

  renderrows() {
    const content = Utils.el('calagopus-explorer-content');
    if (!content) return;
    const result = this.rows;
    const columns = result?.columns || [];
    const rows = result?.rows || [];
    const head = columns.map(column => `<th>${this.safe(column.name)}<small>${this.safe(column.type_name)}</small></th>`).join('');
    const body = rows.map((row, index) => `<tr>${row.map(value => `<td>${value.type === 'null' ? '<em>NULL</em>' : value.type === 'binary' ? '<code>[binary]</code>' : this.safe(value.value)}</td>`).join('')}<td><div class="calagopus-row-actions"><button onclick="calagopusdatabases.editrowmodal(${index})">Edit</button><button class="danger" onclick="calagopusdatabases.deleterow(${index})">Delete</button></div></td></tr>`).join('');
    content.innerHTML = `<div class="calagopus-explorer-toolbar"><span>${this.safe(this.tablekey(this.currenttable))}</span><div><button class="btn btn-primary btn-sm" onclick="calagopusdatabases.insertrowmodal()">New Row</button><button class="btn btn-secondary btn-sm" onclick="calagopusdatabases.loadrows()">Refresh</button></div></div><div class="calagopus-result-wrap"><table class="calagopus-result"><thead><tr>${head}<th></th></tr></thead><tbody>${body || `<tr><td colspan="${Math.max(columns.length + 1, 1)}">No rows returned.</td></tr>`}</tbody></table></div>${result?.truncated ? '<div class="calagopus-result-note">Results were truncated by the panel.</div>' : ''}`;
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
    Modal.open('New Row', `<div class="calagopus-row-form">${this.rowfields()}</div><div class="modal-actions"><button class="btn btn-secondary" onclick="Modal.close()">Cancel</button><button class="btn btn-primary" onclick="calagopusdatabases.insertrow()">Insert</button></div>`);
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
      this.toast('Row inserted');
      this.loadrows();
    } catch (error) {
      this.toast(error.message, 'error');
    }
  },

  editrowmodal(index) {
    const row = this.rows?.rows?.[index];
    if (!row) return;
    this.editingrow = index;
    Modal.open('Edit Row', `<div class="calagopus-row-form">${this.rowfields(row)}</div><div class="modal-actions"><button class="btn btn-secondary" onclick="Modal.close()">Cancel</button><button class="btn btn-primary" onclick="calagopusdatabases.updaterow()">Save</button></div>`);
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
      this.toast('Row updated');
      this.loadrows();
    } catch (error) {
      this.toast(error.message, 'error');
    }
  },

  deleterow(index) {
    if (!this.currentdatabase || !this.currenttable) return;
    Modal.confirm('Delete Row', 'Delete this row permanently?', async () => {
      try {
        await this.request(`/databases/${this.currentdatabase.uuid}/explorer/rows/delete`, 'POST', { schema: this.currenttable.schema || null, table: this.currenttable.name, rows: [{ keys: this.rowkeys(index) }] }, true);
        Modal.close();
        this.toast('Row deleted');
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
    const rows = columns.map((column, index) => `<tr><td><code>${this.safe(column.name)}</code></td><td>${this.safe(column.type_name)}</td><td>${column.nullable ? 'Yes' : 'No'}</td><td>${column.primary_key ? 'Yes' : 'No'}</td><td>${column.auto_increment ? 'Yes' : 'No'}</td><td><div class="calagopus-row-actions"><button onclick="calagopusdatabases.renamecolumnmodal(${index})">Rename</button><button class="danger" onclick="calagopusdatabases.deletecolumn(${index})">Delete</button></div></td></tr>`).join('');
    content.innerHTML = `<div class="calagopus-explorer-toolbar"><span>${this.safe(this.tablekey(this.currenttable))}</span><div><button class="btn btn-secondary btn-sm" onclick="calagopusdatabases.renametablemodal()">Rename Table</button><button class="btn btn-primary btn-sm" onclick="calagopusdatabases.createcolumnmodal()">New Column</button><button class="btn btn-danger btn-sm" onclick="calagopusdatabases.deletetable()">Delete Table</button></div></div><div class="calagopus-database-table-wrap"><table class="calagopus-database-table"><thead><tr><th>Column</th><th>Type</th><th>Nullable</th><th>Primary</th><th>Automatic</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  },

  renderquery() {
    const content = Utils.el('calagopus-explorer-content');
    if (!content) return;
    content.innerHTML = `<div class="calagopus-query"><div class="calagopus-query-toolbar"><label class="calagopus-toggle"><input type="checkbox" id="calagopus-query-readonly" checked/><span>Read only</span></label><button class="btn btn-primary btn-sm" onclick="calagopusdatabases.runquery()">Run Query</button></div><textarea id="calagopus-query-input" spellcheck="false" placeholder="SELECT * FROM table_name LIMIT 100;"></textarea><div id="calagopus-query-results"></div></div>`;
  },

  async runquery() {
    const query = Utils.el('calagopus-query-input').value.trim();
    if (!query || !this.currentdatabase) return;
    try {
      const result = await this.request(`/databases/${this.currentdatabase.uuid}/explorer/query`, 'POST', { query, rows: 1000, read_only: Utils.el('calagopus-query-readonly').checked }, true);
      this.queryresults = result?.results || [];
      Utils.el('calagopus-query-results').innerHTML = this.queryresults.map((item, index) => `<section><h4>Result ${index + 1}${item.rows_affected ? ` · ${item.rows_affected} affected` : ''}</h4>${this.resulttable(item)}</section>`).join('') || '<div class="calagopus-database-empty">Query completed without a result set.</div>';
    } catch (error) {
      this.toast(error.message, 'error');
    }
  },

  createtablemodal() {
    Modal.open('New Table', `<div class="form-group"><label class="form-label">Table Name</label><input class="form-input" id="calagopus-table-name" /></div><div class="form-group"><label class="form-label">First Column</label><input class="form-input" id="calagopus-table-column" value="id" /></div><div class="form-group"><label class="form-label">Column Type</label><input class="form-input" id="calagopus-table-type" value="BIGINT" /></div><label class="calagopus-toggle"><input type="checkbox" id="calagopus-table-primary" checked/><span>Primary key</span></label><label class="calagopus-toggle"><input type="checkbox" id="calagopus-table-auto" checked/><span>Auto increment</span></label><div class="modal-actions"><button class="btn btn-secondary" onclick="Modal.close()">Cancel</button><button class="btn btn-primary" onclick="calagopusdatabases.createtable()">Create</button></div>`);
  },

  async createtable() {
    const table = Utils.el('calagopus-table-name').value.trim();
    const name = Utils.el('calagopus-table-column').value.trim();
    const type = Utils.el('calagopus-table-type').value.trim();
    if (!table || !name || !type) return;
    await this.structureaction('/tables', { schema: null, table, columns: [{ name, type, nullable: false, primary_key: Utils.el('calagopus-table-primary').checked, auto_increment: Utils.el('calagopus-table-auto').checked }] });
  },

  renametablemodal() {
    Modal.open('Rename Table', `<div class="form-group"><label class="form-label">New Name</label><input class="form-input" id="calagopus-table-rename" value="${this.safe(this.currenttable?.name)}" /></div><div class="modal-actions"><button class="btn btn-secondary" onclick="Modal.close()">Cancel</button><button class="btn btn-primary" onclick="calagopusdatabases.renametable()">Rename</button></div>`);
  },

  async renametable() {
    const name = Utils.el('calagopus-table-rename').value.trim();
    if (!name) return;
    await this.structureaction('/tables/rename', { schema: this.currenttable.schema || null, table: this.currenttable.name, name });
  },

  deletetable() {
    Modal.confirm('Delete Table', `Delete ${this.currenttable?.name} and every row in it?`, () => this.structureaction('/tables/delete', { schema: this.currenttable.schema || null, table: this.currenttable.name }));
  },

  createcolumnmodal() {
    Modal.open('New Column', `<div class="form-group"><label class="form-label">Column Name</label><input class="form-input" id="calagopus-column-name" /></div><div class="form-group"><label class="form-label">Type</label><input class="form-input" id="calagopus-column-type" value="VARCHAR(255)" /></div><label class="calagopus-toggle"><input type="checkbox" id="calagopus-column-nullable"/><span>Nullable</span></label><div class="modal-actions"><button class="btn btn-secondary" onclick="Modal.close()">Cancel</button><button class="btn btn-primary" onclick="calagopusdatabases.createcolumn()">Create</button></div>`);
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
    Modal.open('Rename Column', `<div class="form-group"><label class="form-label">New Name</label><input class="form-input" id="calagopus-column-rename" value="${this.safe(column.name)}" /></div><div class="modal-actions"><button class="btn btn-secondary" onclick="Modal.close()">Cancel</button><button class="btn btn-primary" onclick="calagopusdatabases.renamecolumn(${index})">Rename</button></div>`);
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
    Modal.confirm('Delete Column', `Delete ${column.name} and all data stored in it?`, () => this.structureaction('/tables/columns/delete', { schema: this.currenttable.schema || null, table: this.currenttable.name, column: column.name }));
  },

  async structureaction(endpoint, body) {
    if (!this.currentdatabase) return;
    try {
      await this.request(`/databases/${this.currentdatabase.uuid}/explorer${endpoint}`, 'POST', body);
      Modal.close();
      this.toast('Database structure updated');
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
    const databaserows = databases.map((database, index) => `<tr><td>${this.safe(database.name)}</td><td>${this.safe(database.created || '')}</td><td><button class="btn btn-danger btn-sm" onclick="calagopusdatabases.removeinstancedatabase('${this.safe(database.uuid)}')">Delete</button></td></tr>`).join('');
    const userrows = users.map((user, index) => `<tr><td><code>${this.safe(user.username)}</code></td><td><button class="calagopus-copy" onclick="calagopusdatabases.copyencoded('${encodeURIComponent(user.password)}')">${this.safe(user.password)}</button></td><td>${Number(user.databases?.length || 0)}</td><td><div class="calagopus-row-actions"><button onclick="calagopusdatabases.rotateinstanceuser('${this.safe(user.uuid)}')">Rotate</button><button class="danger" onclick="calagopusdatabases.removeinstanceuser('${this.safe(user.uuid)}')">Delete</button></div></td></tr>`).join('');
    container.innerHTML = `<div class="calagopus-database-page"><div class="calagopus-instance-top"><button class="btn btn-secondary btn-sm" onclick="calagopusdatabases.load('instances')">Back</button><div><h2>${this.safe(instance.name)}</h2><span>${this.safe(instance.type)}</span></div><div class="calagopus-instance-power"><button class="btn btn-green btn-sm" onclick="calagopusdatabases.instancepower('start')">Start</button><button class="btn btn-secondary btn-sm" onclick="calagopusdatabases.instancepower('restart')">Restart</button><button class="btn btn-red btn-sm" onclick="calagopusdatabases.instancepower('stop')">Stop</button></div></div><div class="calagopus-instance-stats"><div><span>Address</span><strong>${this.safe(instance.host ? `${instance.host}:${instance.port || ''}` : 'Not allocated')}</strong></div><div><span>Memory</span><strong>${this.formatbytes(Number(instance.memory || 0) * 1024 * 1024)}</strong></div><div><span>Disk</span><strong>${this.formatbytes(Number(instance.disk || 0) * 1024 * 1024)}</strong></div><div><span>CPU</span><strong>${Number(instance.cpu || 0)}%</strong></div></div><section class="calagopus-instance-section"><div class="calagopus-instance-section-head"><h3>Databases</h3><button class="btn btn-primary btn-sm" onclick="calagopusdatabases.createinstancedatabasemodal()">New Database</button></div><div class="calagopus-database-table-wrap"><table class="calagopus-database-table"><thead><tr><th>Name</th><th>Created</th><th></th></tr></thead><tbody>${databaserows || '<tr><td colspan="3">No databases.</td></tr>'}</tbody></table></div></section><section class="calagopus-instance-section"><div class="calagopus-instance-section-head"><h3>Users</h3><button class="btn btn-primary btn-sm" onclick="calagopusdatabases.createinstanceusermodal()">New User</button></div><div class="calagopus-database-table-wrap"><table class="calagopus-database-table"><thead><tr><th>Username</th><th>Password</th><th>Databases</th><th></th></tr></thead><tbody>${userrows || '<tr><td colspan="4">No users.</td></tr>'}</tbody></table></div></section></div>`;
  },

  async instancepower(action) {
    if (!this.currentinstance) return;
    try {
      await this.request(`/databases/instances/${this.currentinstance.uuid}/power`, 'POST', { action });
      this.toast(`${action} requested`);
    } catch (error) {
      this.toast(error.message, 'error');
    }
  },

  createinstancedatabasemodal() {
    Modal.open('New Database', `<div class="form-group"><label class="form-label">Database Name</label><input class="form-input" id="calagopus-instance-database-name" /></div><div class="modal-actions"><button class="btn btn-secondary" onclick="Modal.close()">Cancel</button><button class="btn btn-primary" onclick="calagopusdatabases.createinstancedatabase()">Create</button></div>`);
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
    Modal.open('New Database User', `<div class="form-group"><label class="form-label">Username</label><input class="form-input" id="calagopus-instance-user-name" /></div><div class="modal-actions"><button class="btn btn-secondary" onclick="Modal.close()">Cancel</button><button class="btn btn-primary" onclick="calagopusdatabases.createinstanceuser()">Create</button></div>`);
  },

  async createinstanceuser() {
    const username = Utils.el('calagopus-instance-user-name').value.trim();
    if (!username || !this.currentinstance) return;
    try {
      const result = await this.request(`/databases/instances/${this.currentinstance.uuid}/users`, 'POST', { username, databases: [] });
      Modal.close();
      this.toast(`User created${result?.user?.password ? ` · password: ${result.user.password}` : ''}`);
      this.openinstance(this.instances.findIndex(instance => instance.uuid === this.currentinstance.uuid));
    } catch (error) {
      this.toast(error.message, 'error');
    }
  },

  removeinstancedatabase(uuid) {
    if (!this.currentinstance) return;
    Modal.confirm('Delete Database', 'Delete this database and all stored data?', async () => {
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
      this.toast(`Password rotated: ${result?.password || ''}`);
      this.openinstance(this.instances.findIndex(instance => instance.uuid === this.currentinstance.uuid));
    } catch (error) {
      this.toast(error.message, 'error');
    }
  },

  removeinstanceuser(uuid) {
    if (!this.currentinstance) return;
    Modal.confirm('Delete User', 'Delete this database user?', async () => {
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
