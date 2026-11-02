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
    if (!server || server.type !== 'Calagopus') throw new Error(t('csub.noserver'));
    const apikey = await Servers.resolveapikey(server);
    const options = { method, headers: { Authorization: `Bearer ${apikey}`, Accept: 'application/json' } };
    if (body !== null) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    const response = await fetch(`${server.panelUrl.replace(/\/+$/, '')}/api/client/servers/${server.uuid}${endpoint}`, options);
    if (!response.ok) {
      let message = t('cbak.httperror', { status: response.status });
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

  pluralsuffix(n) {
    if (I18n.getlang() !== 'ru') return n === 1 ? '' : 's';
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return '';
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'а';
    return 'ов';
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
      container.innerHTML = `<div class="calagopus-backup-empty"><strong>${t('cbak.loadfail')}</strong><span>${this.safe(error.message)}</span><button class="btn btn-secondary btn-sm" onclick="calagopusbackups.load()">${t('csub.retry')}</button></div>`;
    }
  },

  date(value) {
    if (!value) return t('csub.na');
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? t('csub.na') : parsed.toLocaleString();
  },

  bytes(value) {
    const size = Number(value || 0);
    if (!size) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const unit = Math.min(units.length - 1, Math.floor(Math.log(size) / Math.log(1024)));
    return `${(size / 1024 ** unit).toFixed(unit ? 1 : 0)} ${units[unit]}`;
  },

  sourcehtml(backup) {
    if (backup.kind === 'database_instance') return backup.database_type ? t('cbak.manageddb.type', { type: backup.database_type }) : t('cbak.manageddb');
    return t('cbak.serverfiles');
  },

  render() {
    const container = Utils.el('tabBackups');
    if (!container) return;
    const total = Number(this.pagination.total || this.backups.length);
    const rows = this.backups.map((backup, index) => `<tr><td><strong class="calagopus-backup-name">${this.safe(backup.name)}</strong>${backup.is_successful === false ? `<small class="calagopus-backup-failed">${t('cbak.failed')}</small>` : backup.completed ? '' : `<small>${t('cbak.creating')}</small>`}</td><td>${backup.kind === 'database_instance' ? t('cbak.kind.db') : t('cbak.kind.server')}</td><td>${this.safe(this.sourcehtml(backup))}</td><td><code title="${this.safe(backup.checksum || '')}">${this.safe(backup.checksum ? backup.checksum.slice(0, 16) + '...' : t('csub.na'))}</code></td><td>${this.bytes(backup.bytes)}</td><td>${Number(backup.files || 0).toLocaleString()}</td><td>${this.safe(this.date(backup.created))}</td><td>${backup.is_locked ? `<span class="calagopus-backup-lock">${t('cbak.locked')}</span>` : t('cbak.no')}</td><td><button class="calagopus-backup-menu" title="${t('cbak.options')}" onclick="calagopusbackups.openoptions(${index})"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.7"></circle><circle cx="12" cy="12" r="1.7"></circle><circle cx="19" cy="12" r="1.7"></circle></svg></button></td></tr>`).join('');
    container.innerHTML = `<div class="calagopus-backup-page"><div class="calagopus-backup-header"><div><h2>${t('cbak.heading')}</h2><span>${t('cbak.count', { n: total, plural: this.pluralsuffix(total) })}</span></div><div class="calagopus-backup-header-actions"><label class="calagopus-network-search"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg><input value="${this.safe(this.search)}" placeholder="${t('cbak.search')}" oninput="calagopusbackups.setsearch(this.value)"></label><button class="btn btn-primary btn-sm" onclick="calagopusbackups.opencreate()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"></path></svg>${t('cbak.create')}</button></div></div><div class="calagopus-network-table-wrap"><table class="calagopus-network-table calagopus-backup-table"><thead><tr><th>${t('cbak.h.name')}</th><th>${t('cbak.h.kind')}</th><th>${t('cbak.h.source')}</th><th>${t('cbak.h.checksum')}</th><th>${t('cbak.h.size')}</th><th>${t('cbak.h.files')}</th><th>${t('cbak.h.created')}</th><th>${t('cbak.h.locked')}</th><th></th></tr></thead><tbody>${rows || `<tr><td colspan="9"><div class="calagopus-backup-empty">${t('cbak.empty')}</div></td></tr>`}</tbody></table></div>${this.paginationhtml()}</div>`;
  },

  paginationhtml() {
    const page = Number(this.pagination.page || 1);
    const perpage = Number(this.pagination.per_page || 25);
    const pages = Math.max(1, Math.ceil(Number(this.pagination.total || 0) / perpage));
    if (pages <= 1) return '';
    return `<div class="calagopus-network-pagination"><button class="btn btn-secondary btn-sm" onclick="calagopusbackups.setpage(${page - 1})" ${page <= 1 ? 'disabled' : ''}>${t('csub.previous')}</button><span>${t('csub.page', { page, pages })}</span><button class="btn btn-secondary btn-sm" onclick="calagopusbackups.setpage(${page + 1})" ${page >= pages ? 'disabled' : ''}>${t('csub.next')}</button></div>`;
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
    Modal.open(t('cbak.options.title'), `<div class="calagopus-backup-options"><button onclick="calagopusbackups.openedit(${index})"><svg viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"></path></svg><span><strong>${t('cbak.edit')}</strong><small>${t('cbak.edit.desc')}</small></span></button><button ${disabled ? 'disabled' : ''} onclick="calagopusbackups.download(${index})"><svg viewBox="0 0 24 24"><path d="M12 3v12m0 0 5-5m-5 5-5-5M4 19h16"></path></svg><span><strong>${t('cbak.download')}</strong><small>${t('cbak.download.desc')}</small></span></button><button ${disabled ? 'disabled' : ''} onclick="calagopusbackups.openrestore(${index})"><svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5"></path></svg><span><strong>${t('cbak.restore')}</strong><small>${t('cbak.restore.desc')}</small></span></button><button ${disabled ? 'disabled' : ''} onclick="calagopusbackups.openexport(${index})"><svg viewBox="0 0 24 24"><path d="M12 3v12m0-12 4 4m-4-4-4 4M4 14v6h16v-6"></path></svg><span><strong>${t('cbak.export')}</strong><small>${t('cbak.export.desc')}</small></span></button><button onclick="calagopusbackups.metadata(${index})"><svg viewBox="0 0 24 24"><path d="M4 4h16v16H4zM8 8h8M8 12h8M8 16h5"></path></svg><span><strong>${t('cbak.metadata.title')}</strong><small>${t('cbak.metadata.desc')}</small></span></button><button class="danger" ${backup.is_locked ? 'disabled' : ''} onclick="calagopusbackups.remove(${index})"><svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"></path></svg><span><strong>${t('cbak.delete')}</strong><small>${backup.is_locked ? t('cbak.delete.unlockfirst') : t('cbak.delete.desc')}</small></span></button></div>`);
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
    Modal.open(t('cbak.create.title'), `<div class="calagopus-backup-form"><label class="form-group"><span>${t('cbak.form.name')}</span><input id="calagopus-backup-create-name" maxlength="255" value="${this.safe(this.createname)}" placeholder="${t('cbak.form.name.ph')}" oninput="calagopusbackups.createname=this.value"></label><label class="form-group"><span>${t('cbak.form.source')}</span><select onchange="calagopusbackups.setsource(this.value)"><option value="files" ${this.source === 'files' ? 'selected' : ''}>${t('cbak.serverfiles')}</option><option value="database" ${this.source === 'database' ? 'selected' : ''}>${t('cbak.manageddbs')}</option></select></label>${this.source === 'database' ? `<label class="form-group"><span>${t('cbak.form.db')}</span><select id="calagopus-backup-database" onchange="calagopusbackups.createdatabase=this.value"><option value="">${t('cbak.form.selectdb')}</option>${databaseoptions}</select></label>` : `<label class="form-group"><span>${t('cbak.form.ignored')}</span><small>${t('cbak.form.ignored.desc')}</small><textarea id="calagopus-backup-ignored" rows="6" spellcheck="false" placeholder="*.log&#10;cache/" oninput="calagopusbackups.setignored(this.value)">${this.safe(this.ignoredtext)}</textarea></label><label class="calagopus-preview-toggle"><input type="checkbox" ${this.preview ? 'checked' : ''} onchange="calagopusbackups.togglepreview(this.checked)"><span>${t('cbak.form.preview')}</span></label><div id="calagopus-backup-preview">${this.preview ? this.previewhtml() : ''}</div>`}<div id="calagopus-backup-error"></div><div class="modal-actions"><button class="btn btn-secondary" onclick="Modal.close()">${t('cbak.cancel')}</button><button class="btn btn-primary" onclick="calagopusbackups.create()">${t('cbak.create')}</button></div></div>`);
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
    const breadcrumb = [`<button onclick="calagopusbackups.loadpreview('/')">${t('cbak.container')}</button>`, ...crumbs.map((part, index) => `<span>/</span><button onclick="calagopusbackups.loadpreview('/${this.safe(crumbs.slice(0, index + 1).join('/'))}')">${this.safe(part)}</button>`)].join('');
    if (this.previewloading) return `<div class="calagopus-ignore-browser"><div class="calagopus-ignore-path">${breadcrumb}</div><div class="tab-loading"><span class="spinner spinner-small"></span></div></div>`;
    const entries = [...this.previewentries].sort((left, right) => Number(!right.attributes.is_file) - Number(!left.attributes.is_file) || left.attributes.name.localeCompare(right.attributes.name)).map(entry => {
      const attributes = entry.attributes;
      const directory = !attributes.is_file;
      const path = `${this.previewpath.replace(/\/$/, '')}/${attributes.name}`;
      const ignored = this.isignored(path, directory);
      const icon = directory ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 5h6l2 2h10v12H3z"></path></svg>' : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6v20h12V6z"></path><path d="M14 2v4h4"></path></svg>';
      const content = `${icon}<span>${this.safe(attributes.name)}</span>${ignored ? `<strong>${t('csub.ignored.badge')}</strong>` : ''}`;
      return directory ? `<button class="${ignored ? 'ignored' : ''}" onclick="calagopusbackups.loadpreview('${this.safe(path)}')">${content}</button>` : `<div class="${ignored ? 'ignored' : ''}">${content}</div>`;
    }).join('');
    return `<div class="calagopus-ignore-browser"><div class="calagopus-ignore-path">${breadcrumb}</div><div class="calagopus-ignore-entries">${entries || `<p>${t('csub.emptydir')}</p>`}</div></div>`;
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
    if (!name) return errorbox.innerHTML = `<div class="error-msg">${t('cbak.err.name')}</div>`;
    if (this.source === 'database' && !database) return errorbox.innerHTML = `<div class="error-msg">${t('cbak.err.db')}</div>`;
    try {
      await this.request('/backups', 'POST', { name, backup_group_uuid: null, database_instance_uuid: this.source === 'database' ? database : null, ignored_files: this.source === 'files' ? this.patterns() : [] });
      Modal.close();
      this.toast(t('cbak.created'));
      this.load();
    } catch (error) {
      errorbox.innerHTML = `<div class="error-msg">${this.safe(error.message)}</div>`;
    }
  },

  openedit(index) {
    const backup = this.backups[index];
    Modal.open(t('cbak.edit.title'), `<div class="calagopus-backup-form"><label class="form-group"><span>${t('cbak.form.name')}</span><input id="calagopus-backup-edit-name" maxlength="255" value="${this.safe(backup.name)}"></label><label class="calagopus-preview-toggle"><input id="calagopus-backup-edit-lock" type="checkbox" ${backup.is_locked ? 'checked' : ''}><span>${t('cbak.form.locked')}</span></label><small>${t('cbak.edit.locknote')}</small><div id="calagopus-backup-error"></div><div class="modal-actions"><button class="btn btn-secondary" onclick="Modal.close()">${t('cbak.cancel')}</button><button class="btn btn-primary" onclick="calagopusbackups.saveedit(${index})">${t('csub.save')}</button></div></div>`);
  },

  async saveedit(index) {
    const backup = this.backups[index];
    const name = Utils.el('calagopus-backup-edit-name')?.value.trim() || '';
    const locked = !!Utils.el('calagopus-backup-edit-lock')?.checked;
    try {
      await this.request(`/backups/${backup.uuid}`, 'PATCH', { name, locked, backup_group_uuid: backup.backup_group_uuid || null });
      Modal.close();
      this.toast(t('cbak.updated'));
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
    Modal.open(t('cbak.restore.title'), `<div class="calagopus-backup-form"><p>${t('cbak.restore.confirm', { name: `<strong>${this.safe(backup.name)}</strong>` })}</p><label class="calagopus-preview-toggle"><input id="calagopus-backup-truncate" type="checkbox"><span>${t('cbak.restore.truncate')}</span></label><label class="calagopus-preview-toggle"><input id="calagopus-backup-startup" type="checkbox" ${Object.keys(backup.metadata || {}).length ? '' : 'disabled'}><span>${t('cbak.restore.startup')}</span></label><div id="calagopus-backup-error"></div><div class="modal-actions"><button class="btn btn-secondary" onclick="Modal.close()">${t('cbak.cancel')}</button><button class="btn btn-danger" onclick="calagopusbackups.restore(${index})">${t('cbak.restore.btn')}</button></div></div>`);
  },

  async restore(index) {
    const backup = this.backups[index];
    try {
      await this.request(`/backups/${backup.uuid}/restore`, 'POST', { truncate_directory: !!Utils.el('calagopus-backup-truncate')?.checked, restore_startup: !!Utils.el('calagopus-backup-startup')?.checked });
      Modal.close();
      this.toast(t('cbak.restore.started'));
    } catch (error) {
      Utils.el('calagopus-backup-error').innerHTML = `<div class="error-msg">${this.safe(error.message)}</div>`;
    }
  },

  async restoredatabase(index) {
    const backup = this.backups[index];
    try {
      await this.request(`/backups/${backup.uuid}/restore`, 'POST', { database_instance_uuid: backup.database_instance_uuid });
      Modal.close();
      this.toast(t('cbak.restoredb.started'));
    } catch (error) {
      this.toast(error.message, 'error');
    }
  },

  openexport(index) {
    const backup = this.backups[index];
    Modal.open(t('cbak.export.title'), `<div class="calagopus-backup-form"><label class="form-group"><span>${t('cbak.export.dest')}</span><input id="calagopus-backup-export-directory" value="/"></label><label class="form-group"><span>${t('cbak.export.filename')}</span><input id="calagopus-backup-export-name" value="${this.safe(backup.name)}"></label><label class="form-group"><span>${t('cbak.export.format')}</span><select id="calagopus-backup-export-format"><option value="tar_gz">.tar.gz</option><option value="tar_zstd">.tar.zst</option><option value="zip">.zip</option></select></label><div id="calagopus-backup-error"></div><div class="modal-actions"><button class="btn btn-secondary" onclick="Modal.close()">${t('cbak.cancel')}</button><button class="btn btn-primary" onclick="calagopusbackups.exportfiles(${index})">${t('cbak.export.btn')}</button></div></div>`);
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
      this.toast(t('cbak.export.started'));
    } catch (error) {
      Utils.el('calagopus-backup-error').innerHTML = `<div class="error-msg">${this.safe(error.message)}</div>`;
    }
  },

  metadata(index) {
    const backup = this.backups[index];
    Modal.open(t('cbak.metadata.title'), `<pre class="calagopus-backup-metadata">${this.safe(JSON.stringify(backup.metadata || {}, null, 2))}</pre><div class="modal-actions"><button class="btn btn-secondary" onclick="Modal.close()">${t('cset.close')}</button></div>`);
  },

  remove(index) {
    const backup = this.backups[index];
    Modal.confirm(t('cbak.delete.title'), t('cbak.delete.confirm', { name: this.safe(backup.name) }), async () => {
      try {
        await this.request(`/backups/${backup.uuid}`, 'DELETE');
        Modal.close();
        this.toast(t('cbak.deleted'));
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
