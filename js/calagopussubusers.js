const calagopussubusers = {
  subusers: [],
  pagination: {},
  page: 1,
  search: '',
  timer: null,
  selected: new Set(),
  expanded: new Set(),
  email: '',
  ignoredtext: '',
  editinguuid: '',
  preview: false,
  previewpath: '/',
  previewentries: [],
  previewloading: false,

  groups: [
    { key: 'control', label: 'Console', permissions: ['read-console','console','start','stop','restart'] },
    { key: 'subusers', label: 'Subusers', permissions: ['create','read','update','delete'] },
    { key: 'files', label: 'Files', permissions: ['create','read','read-content','update','delete','archive','sftp','query-raw'] },
    { key: 'backups', label: 'Backups', permissions: ['create','read','download','restore','update','delete'] },
    { key: 'backup-groups', label: 'Backup Groups', permissions: ['create','read','update','delete'] },
    { key: 'schedules', label: 'Schedules', permissions: ['create','read','update','delete'] },
    { key: 'allocations', label: 'Allocations', permissions: ['read','create','update','delete'] },
    { key: 'firewall', label: 'Firewall', permissions: ['read','update'] },
    { key: 'connections', label: 'Connections', permissions: ['create','read','update','delete'] },
    { key: 'startup', label: 'Startup', permissions: ['read','update','command','docker-image'] },
    { key: 'databases', label: 'Databases', permissions: ['create','read','read-password','update','recreate','delete','query','query-raw','edit-rows','edit-structure','delete-structure'] },
    { key: 'database-instances', label: 'Database Instances', permissions: ['create','read','update','apply-update','delete','power','logs','databases','recreate','users','import','export','query','query-raw','edit-rows','edit-structure','delete-structure'] },
    { key: 'mounts', label: 'Mounts', permissions: ['attach','read','detach'] },
    { key: 'devices', label: 'Devices', permissions: ['attach','read','detach'] },
    { key: 'settings', label: 'Settings', permissions: ['rename','timezone','auto-kill','auto-start','install','cancel-install'] },
    { key: 'activity', label: 'Activity', permissions: ['read','read-ip'] }
  ],

  async request(endpoint, method = 'GET', body = null) {
    const server = App.currentServer;
    if (!server || server.type !== 'Calagopus') throw new Error('No Calagopus server selected');
    const apikey = await Servers.resolveapikey(server);
    const options = { method, headers: { Authorization: `Bearer ${apikey}`, Accept: 'application/json' } };
    if (body !== null) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    const response = await fetch(`${server.panelUrl.replace(/\/+$/, '')}/api/client/servers/${server.uuid}${endpoint}`, options);
    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try {
        const error = await response.json();
        message = error.errors?.[0] || error.message || message;
      } catch (error) {}
      throw new Error(message);
    }
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  },

  safe(value) {
    return Utils.escape(String(value ?? ''));
  },

  async load() {
    const container = Utils.el('tabUsers');
    if (container) container.innerHTML = '<div class="tab-loading"><span class="spinner"></span></div>';
    try {
      const query = new URLSearchParams({ page: String(this.page), per_page: '25' });
      if (this.search) query.set('search', this.search);
      const result = await this.request(`/subusers?${query}`);
      this.pagination = result?.subusers || {};
      this.subusers = this.pagination.data || [];
      this.render();
    } catch (error) {
      if (container) container.innerHTML = `<div class="calagopus-subuser-empty"><strong>Unable to load subusers</strong><span>${this.safe(error.message)}</span><button class="btn btn-secondary btn-sm" onclick="calagopussubusers.load()">Try Again</button></div>`;
    }
  },

  render() {
    const container = Utils.el('tabUsers');
    if (!container) return;
    const rows = this.subusers.map((subuser, index) => {
      const user = subuser.user || {};
      const ignored = subuser.ignored_files || [];
      return `<tr><td><div class="calagopus-subuser-identity"><span>${this.safe((user.username || user.email || '?').charAt(0).toUpperCase())}</span><div><strong>${this.safe(user.username || 'Unknown')}</strong><small>${this.safe(user.email || '')}</small></div></div></td><td>${(subuser.permissions || []).length}</td><td>${ignored.length}</td><td>${user.two_factor_enabled ? 'Enabled' : 'Disabled'}</td><td>${this.safe(this.date(subuser.created))}</td><td><div class="calagopus-subuser-actions"><button title="Edit subuser" onclick="calagopussubusers.openedit(${index})"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path></svg></button><button class="danger" title="Remove subuser" onclick="calagopussubusers.remove(${index})"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"></path></svg></button></div></td></tr>`;
    }).join('');
    container.innerHTML = `<div class="calagopus-subuser-page"><div class="calagopus-subuser-header"><div><h2>Subusers</h2><span>${Number(this.pagination.total || this.subusers.length)} users with server access</span></div><div class="calagopus-subuser-header-actions"><label class="calagopus-subuser-search"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg><input value="${this.safe(this.search)}" placeholder="Search subusers" oninput="calagopussubusers.setsearch(this.value)"></label><button class="btn btn-primary btn-sm" onclick="calagopussubusers.opencreate()">New Subuser</button></div></div><div class="calagopus-subuser-table-wrap"><table class="calagopus-subuser-table"><thead><tr><th>User</th><th>Permissions</th><th>Ignored Files</th><th>Two-Factor</th><th>Created</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="6"><div class="calagopus-subuser-empty">No subusers found.</div></td></tr>'}</tbody></table></div>${this.paginationhtml()}</div>`;
  },

  date(value) {
    if (!value) return 'N/A';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'N/A' : date.toLocaleString();
  },

  paginationhtml() {
    const page = Number(this.pagination.page || 1);
    const perpage = Number(this.pagination.per_page || 25);
    const pages = Math.max(1, Math.ceil(Number(this.pagination.total || 0) / perpage));
    if (pages <= 1) return '';
    return `<div class="calagopus-subuser-pagination"><button class="btn btn-secondary btn-sm" onclick="calagopussubusers.setpage(${page - 1})" ${page <= 1 ? 'disabled' : ''}>Previous</button><span>Page ${page} of ${pages}</span><button class="btn btn-secondary btn-sm" onclick="calagopussubusers.setpage(${page + 1})" ${page >= pages ? 'disabled' : ''}>Next</button></div>`;
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
    this.email = '';
    this.editinguuid = '';
    this.selected = new Set();
    this.expanded = new Set();
    this.ignoredtext = '';
    this.preview = false;
    this.previewpath = '/';
    this.rendermodal();
  },

  openedit(index) {
    const subuser = this.subusers[index];
    this.email = subuser.user?.email || '';
    this.editinguuid = subuser.user?.uuid || '';
    this.selected = new Set(subuser.permissions || []);
    this.expanded = new Set();
    this.ignoredtext = (subuser.ignored_files || []).join('\n');
    this.preview = false;
    this.previewpath = '/';
    this.rendermodal();
  },

  rendermodal() {
    const title = this.editinguuid ? 'Edit Subuser' : 'Create Subuser';
    const groups = this.groups.map(group => this.grouphtml(group)).join('');
    const selected = [...this.selected].sort().map(permission => `<div class="calagopus-selected-permission"><code>${this.safe(permission)}</code><button title="Remove permission" onclick="calagopussubusers.togglepermission('${permission}')">&times;</button></div>`).join('');
    Modal.open(title, `<div class="calagopus-subuser-form"><label class="form-group"><span class="form-label">Email *</span><input class="form-input" type="email" value="${this.safe(this.email)}" ${this.editinguuid ? 'disabled' : ''} placeholder="user@example.com" oninput="calagopussubusers.email=this.value"></label><div class="calagopus-permission-layout"><div class="calagopus-permission-groups">${groups}</div><aside class="calagopus-selected-panel"><div class="calagopus-selected-title"><strong>Selected Permissions</strong><span>${this.selected.size}</span></div><div class="calagopus-selected-list">${selected || '<p>No permissions selected.</p>'}</div><div class="calagopus-permission-tools"><button class="btn btn-primary btn-sm" onclick="calagopussubusers.selectall()">Select All</button><button class="btn btn-secondary btn-sm" onclick="calagopussubusers.deselectall()">Deselect All</button><button class="btn btn-secondary btn-sm" title="Copy permissions" onclick="calagopussubusers.copypermissions()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>Copy</button><button class="btn btn-secondary btn-sm" title="Paste permissions" onclick="calagopussubusers.pastepermissions()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5h6M9 3h6v4H9z"></path><path d="M9 5H6a2 2 0 0 0-2 2v13h16V7a2 2 0 0 0-2-2h-3"></path></svg>Paste</button></div></aside></div><section class="calagopus-ignored-section"><label class="form-label">Ignored Files</label><p>Files and directories matching these patterns will be hidden from this subuser. Uses gitignore-style glob patterns (e.g. <code>*.env</code>, <code>secrets/</code>). Prefix a pattern with <code>!</code> to un-hide a path that a broader pattern would otherwise exclude.</p><textarea class="form-input" rows="5" spellcheck="false" placeholder="*.env\nsecrets/" oninput="calagopussubusers.setignored(this.value)">${this.safe(this.ignoredtext)}</textarea><label class="calagopus-preview-toggle"><input type="checkbox" ${this.preview ? 'checked' : ''} onchange="calagopussubusers.togglepreview(this.checked)"><span>Preview ignored files</span></label><div id="calagopus-subuser-preview">${this.preview ? this.previewhtml() : ''}</div></section><div id="calagopus-subuser-error"></div><div class="modal-actions"><button class="btn btn-secondary" onclick="Modal.close()">Cancel</button><button class="btn btn-primary" onclick="calagopussubusers.save()">${this.editinguuid ? 'Save Changes' : 'Create Subuser'}</button></div></div>`);
    if (this.preview) this.loadpreview();
  },

  grouphtml(group) {
    const keys = group.permissions.map(permission => `${group.key}.${permission}`);
    const count = keys.filter(permission => this.selected.has(permission)).length;
    const expanded = this.expanded.has(group.key);
    const permissions = expanded ? `<div class="calagopus-permission-items">${group.permissions.map(permission => { const key = `${group.key}.${permission}`; return `<label><input type="checkbox" ${this.selected.has(key) ? 'checked' : ''} onchange="calagopussubusers.togglepermission('${key}')"><span><strong>${this.safe(this.permissionlabel(permission))}</strong><small>${this.safe(key)}</small></span></label>`; }).join('')}</div>` : '';
    return `<section class="calagopus-permission-group"><div class="calagopus-permission-group-head"><button title="${expanded ? 'Collapse' : 'Expand'} ${this.safe(group.label)}" onclick="calagopussubusers.togglegroup('${group.key}')"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="${expanded ? 'm18 15-6-6-6 6' : 'm9 18 6-6-6-6'}"></path></svg><strong>${this.safe(group.label)}</strong><span>${count} / ${keys.length}</span></button><input type="checkbox" aria-label="Toggle all ${this.safe(group.label)} permissions" ${count === keys.length ? 'checked' : ''} ${count > 0 && count < keys.length ? 'data-partial="true"' : ''} onchange="calagopussubusers.togglecategory('${group.key}')"></div>${permissions}</section>`;
  },

  permissionlabel(permission) {
    return permission.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
  },

  togglegroup(group) {
    if (this.expanded.has(group)) this.expanded.delete(group);
    else this.expanded.add(group);
    this.rendermodal();
  },

  togglepermission(permission) {
    if (this.selected.has(permission)) this.selected.delete(permission);
    else this.selected.add(permission);
    this.rendermodal();
  },

  togglecategory(groupkey) {
    const group = this.groups.find(item => item.key === groupkey);
    const keys = group.permissions.map(permission => `${group.key}.${permission}`);
    const all = keys.every(permission => this.selected.has(permission));
    keys.forEach(permission => all ? this.selected.delete(permission) : this.selected.add(permission));
    this.rendermodal();
  },

  allpermissions() {
    return this.groups.flatMap(group => group.permissions.map(permission => `${group.key}.${permission}`));
  },

  selectall() {
    this.selected = new Set(this.allpermissions());
    this.rendermodal();
  },

  deselectall() {
    this.selected = new Set();
    this.rendermodal();
  },

  async copypermissions() {
    try {
      await navigator.clipboard.writeText([...this.selected].sort().join('\n'));
      this.toast('Permissions copied');
    } catch (error) {
      this.toast('Unable to copy permissions', 'error');
    }
  },

  async pastepermissions() {
    try {
      const allowed = new Set(this.allpermissions());
      const text = await navigator.clipboard.readText();
      this.selected = new Set(text.split(/\r?\n/).map(value => value.trim()).filter(value => allowed.has(value)));
      this.rendermodal();
      this.toast('Permissions pasted');
    } catch (error) {
      this.toast('Unable to paste permissions', 'error');
    }
  },

  setignored(value) {
    this.ignoredtext = value;
    if (this.preview) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.renderpreview(), 250);
    }
  },

  patterns() {
    return this.ignoredtext.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
  },

  togglepreview(enabled) {
    this.preview = enabled;
    this.previewpath = '/';
    if (enabled) this.loadpreview();
    else {
      const preview = Utils.el('calagopus-subuser-preview');
      if (preview) preview.innerHTML = '';
    }
  },

  async loadpreview(path = this.previewpath) {
    this.previewpath = path;
    this.previewloading = true;
    this.renderpreview();
    try {
      const server = App.currentServer;
      this.previewentries = await Api.listcalagopusfiles(server.panelUrl, await Servers.resolveapikey(server), server.uuid, path);
    } catch (error) {
      this.previewentries = [];
    }
    this.previewloading = false;
    this.renderpreview();
  },

  renderpreview() {
    const preview = Utils.el('calagopus-subuser-preview');
    if (preview && this.preview) preview.innerHTML = this.previewhtml();
  },

  previewhtml() {
    const crumbs = this.previewpath.split('/').filter(Boolean);
    const breadcrumb = [`<button onclick="calagopussubusers.loadpreview('/')">container</button>`, ...crumbs.map((part, index) => `<span>/</span><button onclick="calagopussubusers.loadpreview('/${this.safe(crumbs.slice(0, index + 1).join('/'))}')">${this.safe(part)}</button>`)].join('');
    if (this.previewloading) return `<div class="calagopus-ignore-browser"><div class="calagopus-ignore-path">${breadcrumb}</div><div class="tab-loading"><span class="spinner spinner-small"></span></div></div>`;
    const entries = [...this.previewentries].sort((left, right) => Number(right.attributes?.mimetype === 'inode/directory') - Number(left.attributes?.mimetype === 'inode/directory') || (left.attributes?.name || '').localeCompare(right.attributes?.name || '')).map(entry => {
      const attributes = entry.attributes || entry;
      const directory = attributes.mimetype === 'inode/directory' || !attributes.is_file;
      const path = `${this.previewpath.replace(/\/$/, '')}/${attributes.name}`;
      const ignored = this.isignored(path, directory);
      const icon = directory ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 5h6l2 2h10v12H3z"></path></svg>' : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6v20h12V6z"></path><path d="M14 2v4h4"></path></svg>';
      const content = `${icon}<span>${this.safe(attributes.name)}</span>${ignored ? '<strong>Ignored</strong>' : ''}`;
      return directory ? `<button class="${ignored ? 'ignored' : ''}" onclick="calagopussubusers.loadpreview('${this.safe(path)}')">${content}</button>` : `<div class="${ignored ? 'ignored' : ''}">${content}</div>`;
    }).join('');
    return `<div class="calagopus-ignore-browser"><div class="calagopus-ignore-path">${breadcrumb}</div><div class="calagopus-ignore-entries">${entries || '<p>This directory is empty.</p>'}</div></div>`;
  },

  globregex(pattern) {
    let source = pattern.replace(/^\/+/, '').replace(/[.+^${}()|[\]\\]/g, '\\$&');
    source = source.replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]').replace(/\u0000/g, '.*');
    if (source.endsWith('/')) source += '.*';
    return new RegExp(`(^|.*/)${source}$`);
  },

  isignored(path, directory) {
    const clean = path.replace(/^\/+/, '').replace(/\/+$/, '');
    const targets = directory ? [clean, `${clean}/`] : [clean];
    let ignored = false;
    for (const raw of this.patterns()) {
      const exception = raw.startsWith('!');
      const pattern = exception ? raw.slice(1) : raw;
      try {
        if (targets.some(target => this.globregex(pattern).test(target))) ignored = !exception;
      } catch (error) {}
    }
    return ignored;
  },

  async save() {
    const errorbox = Utils.el('calagopus-subuser-error');
    if (!this.editinguuid && !/^\S+@\S+\.\S+$/.test(this.email)) {
      errorbox.innerHTML = '<div class="error-msg">Enter a valid email address.</div>';
      return;
    }
    const data = { permissions: [...this.selected], ignored_files: this.patterns() };
    if (!this.editinguuid) {
      data.email = this.email.trim();
      data.captcha = null;
    }
    try {
      await this.request(this.editinguuid ? `/subusers/${this.editinguuid}` : '/subusers', this.editinguuid ? 'PATCH' : 'POST', data);
      Modal.close();
      this.toast(this.editinguuid ? 'Subuser updated' : 'Subuser created');
      this.load();
    } catch (error) {
      errorbox.innerHTML = `<div class="error-msg">${this.safe(error.message)}</div>`;
    }
  },

  remove(index) {
    const subuser = this.subusers[index];
    const user = subuser.user || {};
    Modal.confirm('Remove Subuser', `Remove ${this.safe(user.email || user.username)} from this server?`, async () => {
      try {
        await this.request(`/subusers/${user.uuid}`, 'DELETE');
        Modal.close();
        this.toast('Subuser removed');
        this.load();
      } catch (error) {
        this.toast(error.message, 'error');
      }
    });
  },

  toast(message, type = 'success') {
    document.querySelector('.calagopus-subuser-toast')?.remove();
    const toast = document.createElement('div');
    toast.className = `toast file-toast calagopus-subuser-toast file-toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
  }
};
