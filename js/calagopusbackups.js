const calagopusbackups = {
  backups: [],
  pagination: {},
  databases: [],
  page: 1,
  search: '',
  timer: null,
  ignoredtext: '',
  preview: false,
  previewpath: '/',
  previewentries: [],
  previewloading: false,
  source: 'files',
  createname: '',
  createdatabase: '',

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
        const data = await response.json();
        message = data.errors?.[0]?.detail || data.errors?.[0] || data.message || message;
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
    const container = Utils.el('tabBackups');
    if (!container) return;
    container.innerHTML = '<div class="tab-loading"><span class="spinner"></span></div>';
    try {
      const query = new URLSearchParams({ page: String(this.page), per_page: '25' });
      if (this.search) query.set('search', this.search);
      const result = await this.request(`/backups?${query}`);
      this.pagination = result?.backups || {};
      this.backups = this.pagination.data || [];
      this.render();
    } catch (error) {
      container.innerHTML = `<div class="calagopus-backup-empty"><strong>Unable to load backups</strong><span>${this.safe(error.message)}</span><button class="btn btn-secondary btn-sm" onclick="calagopusbackups.load()">Try Again</button></div>`;
    }
  },

  date(value) {
    if (!value) return 'N/A';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? 'N/A' : parsed.toLocaleString();
  },

  bytes(value) {
    const size = Number(value || 0);
    if (!size) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const unit = Math.min(units.length - 1, Math.floor(Math.log(size) / Math.log(1024)));
    return `${(size / 1024 ** unit).toFixed(unit ? 1 : 0)} ${units[unit]}`;
  },

  sourcehtml(backup) {
    if (backup.kind === 'database_instance') return backup.database_type ? `Managed Database (${backup.database_type})` : 'Managed Database';
    return 'Server Files';
  },

  render() {
    const container = Utils.el('tabBackups');
    if (!container) return;
    const total = Number(this.pagination.total || this.backups.length);
    const rows = this.backups.map((backup, index) => `<tr><td><strong class="calagopus-backup-name">${this.safe(backup.name)}</strong>${backup.is_successful === false ? '<small class="calagopus-backup-failed">Failed</small>' : backup.completed ? '' : '<small>Creating</small>'}</td><td>${backup.kind === 'database_instance' ? 'Database' : 'Server'}</td><td>${this.safe(this.sourcehtml(backup))}</td><td><code title="${this.safe(backup.checksum || '')}">${this.safe(backup.checksum ? backup.checksum.slice(0, 16) + '...' : 'N/A')}</code></td><td>${this.bytes(backup.bytes)}</td><td>${Number(backup.files || 0).toLocaleString()}</td><td>${this.safe(this.date(backup.created))}</td><td>${backup.is_locked ? '<span class="calagopus-backup-lock">Locked</span>' : 'No'}</td><td><button class="calagopus-backup-menu" title="Backup options" onclick="calagopusbackups.openoptions(${index})"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.7"></circle><circle cx="12" cy="12" r="1.7"></circle><circle cx="19" cy="12" r="1.7"></circle></svg></button></td></tr>`).join('');
    container.innerHTML = `<div class="calagopus-backup-page"><div class="calagopus-backup-header"><div><h2>Backups</h2><span>${total} backup${total === 1 ? '' : 's'}</span></div><div class="calagopus-backup-header-actions"><label class="calagopus-network-search"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg><input value="${this.safe(this.search)}" placeholder="Search backups" oninput="calagopusbackups.setsearch(this.value)"></label><button class="btn btn-primary btn-sm" onclick="calagopusbackups.opencreate()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"></path></svg>Create Backup</button></div></div><div class="calagopus-network-table-wrap"><table class="calagopus-network-table calagopus-backup-table"><thead><tr><th>Name</th><th>Kind</th><th>Source</th><th>Checksum</th><th>Size</th><th>Files</th><th>Created</th><th>Locked?</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="9"><div class="calagopus-backup-empty">No backups found.</div></td></tr>'}</tbody></table></div>${this.paginationhtml()}</div>`;
  },

  paginationhtml() {
    const page = Number(this.pagination.page || 1);
    const perpage = Number(this.pagination.per_page || 25);
    const pages = Math.max(1, Math.ceil(Number(this.pagination.total || 0) / perpage));
    if (pages <= 1) return '';
    return `<div class="calagopus-network-pagination"><button class="btn btn-secondary btn-sm" onclick="calagopusbackups.setpage(${page - 1})" ${page <= 1 ? 'disabled' : ''}>Previous</button><span>Page ${page} of ${pages}</span><button class="btn btn-secondary btn-sm" onclick="calagopusbackups.setpage(${page + 1})" ${page >= pages ? 'disabled' : ''}>Next</button></div>`;
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

  openoptions(index) {
    const backup = this.backups[index];
    const disabled = backup.is_successful !== true;
    Modal.open('Backup Options', `<div class="calagopus-backup-options"><button onclick="calagopusbackups.openedit(${index})"><svg viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"></path></svg><span><strong>Edit</strong><small>Rename or lock this backup</small></span></button><button ${disabled ? 'disabled' : ''} onclick="calagopusbackups.download(${index})"><svg viewBox="0 0 24 24"><path d="M12 3v12m0 0 5-5m-5 5-5-5M4 19h16"></path></svg><span><strong>Download</strong><small>Download an archive</small></span></button><button ${disabled ? 'disabled' : ''} onclick="calagopusbackups.openrestore(${index})"><svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5"></path></svg><span><strong>Restore</strong><small>Restore from this backup</small></span></button><button ${disabled ? 'disabled' : ''} onclick="calagopusbackups.openexport(${index})"><svg viewBox="0 0 24 24"><path d="M12 3v12m0-12 4 4m-4-4-4 4M4 14v6h16v-6"></path></svg><span><strong>Export to Files</strong><small>Create an archive in server files</small></span></button><button onclick="calagopusbackups.metadata(${index})"><svg viewBox="0 0 24 24"><path d="M4 4h16v16H4zM8 8h8M8 12h8M8 16h5"></path></svg><span><strong>Backup Metadata</strong><small>View stored metadata</small></span></button><button class="danger" ${backup.is_locked ? 'disabled' : ''} onclick="calagopusbackups.remove(${index})"><svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"></path></svg><span><strong>Delete</strong><small>${backup.is_locked ? 'Unlock this backup first' : 'Permanently delete this backup'}</small></span></button></div>`);
  },

  async opencreate() {
    this.source = 'files';
    this.createname = '';
    this.createdatabase = '';
    this.ignoredtext = '';
    this.preview = false;
    this.previewpath = '/';
    this.databases = [];
    this.rendercreate();
    try {
      const result = await this.request('/databases/instances?page=1&per_page=100');
      this.databases = result?.instances?.data || [];
      this.rendercreate();
    } catch (error) {}
  },

  rendercreate() {
    const databaseoptions = this.databases.map(database => `<option value="${this.safe(database.uuid)}">${this.safe(database.name)} (${this.safe(database.type)})</option>`).join('');
    Modal.open('Create Backup', `<div class="calagopus-backup-form"><label class="form-group"><span>Name *</span><input id="calagopus-backup-create-name" maxlength="255" value="${this.safe(this.createname)}" placeholder="Backup name" oninput="calagopusbackups.createname=this.value"></label><label class="form-group"><span>Source Backup</span><select onchange="calagopusbackups.setsource(this.value)"><option value="files" ${this.source === 'files' ? 'selected' : ''}>Server Files</option><option value="database" ${this.source === 'database' ? 'selected' : ''}>Managed Databases</option></select></label>${this.source === 'database' ? `<label class="form-group"><span>Managed Database *</span><select id="calagopus-backup-database" onchange="calagopusbackups.createdatabase=this.value"><option value="">Select a database</option>${databaseoptions}</select></label>` : `<label class="form-group"><span>Ignored Files</span><small>One pattern per line.</small><textarea id="calagopus-backup-ignored" rows="6" spellcheck="false" placeholder="*.log&#10;cache/" oninput="calagopusbackups.setignored(this.value)">${this.safe(this.ignoredtext)}</textarea></label><label class="calagopus-preview-toggle"><input type="checkbox" ${this.preview ? 'checked' : ''} onchange="calagopusbackups.togglepreview(this.checked)"><span>Preview ignored files</span></label><div id="calagopus-backup-preview">${this.preview ? this.previewhtml() : ''}</div>`}<div id="calagopus-backup-error"></div><div class="modal-actions"><button class="btn btn-secondary" onclick="Modal.close()">Cancel</button><button class="btn btn-primary" onclick="calagopusbackups.create()">Create Backup</button></div></div>`);
    const databaseselect = Utils.el('calagopus-backup-database');
    if (databaseselect) databaseselect.value = this.createdatabase;
    if (this.preview) this.loadpreview(this.previewpath);
  },

  setsource(source) {
    this.source = source;
    this.rendercreate();
  },

  setignored(value) {
    this.ignoredtext = value;
    if (this.preview) this.renderpreview();
  },

  patterns() {
    return this.ignoredtext.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
  },

  togglepreview(enabled) {
    this.preview = enabled;
    this.previewpath = '/';
    if (enabled) this.loadpreview();
    else {
      const preview = Utils.el('calagopus-backup-preview');
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
    const preview = Utils.el('calagopus-backup-preview');
    if (preview && this.preview) preview.innerHTML = this.previewhtml();
  },

  previewhtml() {
    const crumbs = this.previewpath.split('/').filter(Boolean);
    const breadcrumb = [`<button onclick="calagopusbackups.loadpreview('/')">container</button>`, ...crumbs.map((part, index) => `<span>/</span><button onclick="calagopusbackups.loadpreview('/${this.safe(crumbs.slice(0, index + 1).join('/'))}')">${this.safe(part)}</button>`)].join('');
    if (this.previewloading) return `<div class="calagopus-ignore-browser"><div class="calagopus-ignore-path">${breadcrumb}</div><div class="tab-loading"><span class="spinner spinner-small"></span></div></div>`;
    const entries = [...this.previewentries].sort((left, right) => Number(!right.attributes.is_file) - Number(!left.attributes.is_file) || left.attributes.name.localeCompare(right.attributes.name)).map(entry => {
      const attributes = entry.attributes;
      const directory = !attributes.is_file;
      const path = `${this.previewpath.replace(/\/$/, '')}/${attributes.name}`;
      const ignored = this.isignored(path, directory);
      const icon = directory ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 5h6l2 2h10v12H3z"></path></svg>' : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6v20h12V6z"></path><path d="M14 2v4h4"></path></svg>';
      const content = `${icon}<span>${this.safe(attributes.name)}</span>${ignored ? '<strong>Ignored</strong>' : ''}`;
      return directory ? `<button class="${ignored ? 'ignored' : ''}" onclick="calagopusbackups.loadpreview('${this.safe(path)}')">${content}</button>` : `<div class="${ignored ? 'ignored' : ''}">${content}</div>`;
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

  async create() {
    const name = this.createname.trim();
    const database = this.createdatabase || null;
    const errorbox = Utils.el('calagopus-backup-error');
    if (!name) return errorbox.innerHTML = '<div class="error-msg">Enter a backup name.</div>';
    if (this.source === 'database' && !database) return errorbox.innerHTML = '<div class="error-msg">Select a managed database.</div>';
    try {
      await this.request('/backups', 'POST', { name, backup_group_uuid: null, database_instance_uuid: this.source === 'database' ? database : null, ignored_files: this.source === 'files' ? this.patterns() : [] });
      Modal.close();
      this.toast('Backup creation started');
      this.load();
    } catch (error) {
      errorbox.innerHTML = `<div class="error-msg">${this.safe(error.message)}</div>`;
    }
  },

  openedit(index) {
    const backup = this.backups[index];
    Modal.open('Edit Backup', `<div class="calagopus-backup-form"><label class="form-group"><span>Name *</span><input id="calagopus-backup-edit-name" maxlength="255" value="${this.safe(backup.name)}"></label><label class="calagopus-preview-toggle"><input id="calagopus-backup-edit-lock" type="checkbox" ${backup.is_locked ? 'checked' : ''}><span>Locked</span></label><small>Locked backups cannot be deleted until they are unlocked.</small><div id="calagopus-backup-error"></div><div class="modal-actions"><button class="btn btn-secondary" onclick="Modal.close()">Cancel</button><button class="btn btn-primary" onclick="calagopusbackups.saveedit(${index})">Save Changes</button></div></div>`);
  },

  async saveedit(index) {
    const backup = this.backups[index];
    const name = Utils.el('calagopus-backup-edit-name')?.value.trim() || '';
    const locked = !!Utils.el('calagopus-backup-edit-lock')?.checked;
    try {
      await this.request(`/backups/${backup.uuid}`, 'PATCH', { name, locked, backup_group_uuid: backup.backup_group_uuid || null });
      Modal.close();
      this.toast('Backup updated');
      this.load();
    } catch (error) {
      Utils.el('calagopus-backup-error').innerHTML = `<div class="error-msg">${this.safe(error.message)}</div>`;
    }
  },

  async download(index) {
    const backup = this.backups[index];
    try {
      const result = await this.request(`/backups/${backup.uuid}/download?archive_format=tar_gz`);
      Modal.close();
      window.open(result.url, '_blank');
    } catch (error) {
      this.toast(error.message, 'error');
    }
  },

  openrestore(index) {
    const backup = this.backups[index];
    if (backup.kind === 'database_instance') return this.restoredatabase(index);
    Modal.open('Restore Backup', `<div class="calagopus-backup-form"><p>Restore <strong>${this.safe(backup.name)}</strong> to this server.</p><label class="calagopus-preview-toggle"><input id="calagopus-backup-truncate" type="checkbox"><span>Truncate directory before restoring</span></label><label class="calagopus-preview-toggle"><input id="calagopus-backup-startup" type="checkbox" ${Object.keys(backup.metadata || {}).length ? '' : 'disabled'}><span>Restore startup configuration</span></label><div id="calagopus-backup-error"></div><div class="modal-actions"><button class="btn btn-secondary" onclick="Modal.close()">Cancel</button><button class="btn btn-danger" onclick="calagopusbackups.restore(${index})">Restore Backup</button></div></div>`);
  },

  async restore(index) {
    const backup = this.backups[index];
    try {
      await this.request(`/backups/${backup.uuid}/restore`, 'POST', { truncate_directory: !!Utils.el('calagopus-backup-truncate')?.checked, restore_startup: !!Utils.el('calagopus-backup-startup')?.checked });
      Modal.close();
      this.toast('Backup restoration started');
    } catch (error) {
      Utils.el('calagopus-backup-error').innerHTML = `<div class="error-msg">${this.safe(error.message)}</div>`;
    }
  },

  async restoredatabase(index) {
    const backup = this.backups[index];
    try {
      await this.request(`/backups/${backup.uuid}/restore`, 'POST', { database_instance_uuid: backup.database_instance_uuid });
      Modal.close();
      this.toast('Database restoration started');
    } catch (error) {
      this.toast(error.message, 'error');
    }
  },

  openexport(index) {
    const backup = this.backups[index];
    Modal.open('Export Backup to Files', `<div class="calagopus-backup-form"><label class="form-group"><span>Destination Directory</span><input id="calagopus-backup-export-directory" value="/"></label><label class="form-group"><span>File Name</span><input id="calagopus-backup-export-name" value="${this.safe(backup.name)}"></label><label class="form-group"><span>Archive Format</span><select id="calagopus-backup-export-format"><option value="tar_gz">.tar.gz</option><option value="tar_zstd">.tar.zst</option><option value="zip">.zip</option></select></label><div id="calagopus-backup-error"></div><div class="modal-actions"><button class="btn btn-secondary" onclick="Modal.close()">Cancel</button><button class="btn btn-primary" onclick="calagopusbackups.exportfiles(${index})">Export</button></div></div>`);
  },

  async exportfiles(index) {
    const backup = this.backups[index];
    const directory = Utils.el('calagopus-backup-export-directory')?.value.trim() || '/';
    const name = Utils.el('calagopus-backup-export-name')?.value.trim() || backup.name;
    const format = Utils.el('calagopus-backup-export-format')?.value || 'tar_gz';
    const extensions = { tar_gz: '.tar.gz', tar_zstd: '.tar.zst', zip: '.zip' };
    const path = `${directory.replace(/\/+$/, '')}/${name}${extensions[format]}`;
    try {
      await this.request(`/backups/${backup.uuid}/export`, 'POST', { path, archive_format: format, foreground: false });
      Modal.close();
      this.toast('Backup export started');
    } catch (error) {
      Utils.el('calagopus-backup-error').innerHTML = `<div class="error-msg">${this.safe(error.message)}</div>`;
    }
  },

  metadata(index) {
    const backup = this.backups[index];
    Modal.open('Backup Metadata', `<pre class="calagopus-backup-metadata">${this.safe(JSON.stringify(backup.metadata || {}, null, 2))}</pre><div class="modal-actions"><button class="btn btn-secondary" onclick="Modal.close()">Close</button></div>`);
  },

  remove(index) {
    const backup = this.backups[index];
    Modal.confirm('Delete Backup', `Delete ${this.safe(backup.name)}? This cannot be undone.`, async () => {
      try {
        await this.request(`/backups/${backup.uuid}`, 'DELETE');
        Modal.close();
        this.toast('Backup deletion started');
        this.load();
      } catch (error) {
        this.toast(error.message, 'error');
      }
    });
  },

  toast(message, type = 'success') {
    document.querySelector('.calagopus-backup-toast')?.remove();
    const toast = document.createElement('div');
    toast.className = `toast file-toast calagopus-backup-toast file-toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
  }
};
