const calagopusactivity = {
  server: null,
  serverkey: '',
  activities: [],
  permissions: [],
  routevisible: true,
  filesroutevisible: true,
  page: 1,
  total: 0,
  perpage: 25,
  search: '',
  user: null,
  loading: false,
  error: '',
  requestid: 0,
  controller: null,
  searchtimer: null,
  whentimer: null,
  keyhandler: null,
  diff: null,
  routingrevision: false,
  discardnavigation: false,

  safe(value) {
    return Utils.escape(String(value ?? '')).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  key(server = this.server) {
    return server ? `${server.panelUrl.replace(/\/+$/, '')}|${server.uuid}` : '';
  },

  active(server = this.server) {
    return !!server && App.currentServer === server && this.serverkey === this.key(server);
  },

  rolepermissions(account) {
    return account?.role?.server_permissions || account?.role?.serverPermissions || [];
  },

  can(permission) {
    return this.permissions.includes('*') || this.permissions.includes(permission);
  },

  start(server) {
    this.requestid++;
    this.controller?.abort();
    this.controller = null;
    clearTimeout(this.searchtimer);
    clearInterval(this.whentimer);
    this.unbindkeys();
    this.closediff(true);
    this.server = server?.type === 'Calagopus' ? server : null;
    this.serverkey = this.key(this.server);
    this.activities = [];
    this.permissions = [];
    this.routevisible = true;
    this.filesroutevisible = true;
    this.page = 1;
    this.total = 0;
    this.perpage = 25;
    this.search = '';
    this.user = null;
    this.loading = false;
    this.error = '';
    this.permissionpromise = Promise.resolve(false);
    const container = Utils.el('tabActivity');
    if (this.server && container) container.innerHTML = '<div class="calagopus-activity-empty" role="status"><span class="spinner"></span><span>Loading activity access...</span></div>';
  },

  async syncnav(server) {
    const nav = document.querySelector('#serverNav .nav-item[data-server-page="activity"]');
    if (nav) nav.classList.add('hidden');
    const key = this.key(server);
    try {
      const apikey = await Servers.resolveapikey(server);
      const [detailresult, accountresult] = await Promise.allSettled([
        Api.fetchcalagopusserver(server.panelUrl, apikey, server.uuid),
        Api.fetchcalagopusaccount(server.panelUrl, apikey)
      ]);
      if (!this.active(server) || this.serverkey !== key) return false;
      if (detailresult.status === 'rejected') throw detailresult.reason;
      const detail = detailresult.value;
      const account = accountresult.status === 'fulfilled' ? accountresult.value : null;
      this.permissions = [...new Set([...(detail.permissions || []), ...this.rolepermissions(account)])];
      const routeorder = detail.egg_configuration?.route_order;
      this.routevisible = !Array.isArray(routeorder) || routeorder.some(item => item?.type === 'route' && item.path === '/activity');
      this.filesroutevisible = !Array.isArray(routeorder) || routeorder.some(item => item?.type === 'route' && item.path === '/files');
      const visible = this.can('activity.read') && this.routevisible;
      if (nav) nav.classList.toggle('hidden', !visible);
      return visible;
    } catch (error) {
      if (this.active(server)) this.error = error?.message || String(error);
      return false;
    }
  },

  async request(path, options = {}, server = this.server) {
    if (!server || !this.active(server)) throw new Error('No Calagopus server selected');
    const apikey = await Servers.resolveapikey(server);
    if (!this.active(server)) throw new Error('The selected server changed');
    const response = await fetch(`${server.panelUrl.replace(/\/+$/, '')}/api/client/servers/${encodeURIComponent(server.uuid)}${path}`, {
      ...options,
      headers: { ...Api.calagopusheaders(apikey), ...(options.headers || {}) }
    });
    const raw = await response.text();
    if (!response.ok) {
      let message = `Request failed (HTTP ${response.status})`;
      try {
        const data = raw ? JSON.parse(raw) : {};
        const errors = Array.isArray(data.errors) ? data.errors : Object.values(data.errors || {});
        message = errors.map(item => typeof item === 'string' ? item : item.detail || item.message || JSON.stringify(item)).join('; ') || data.message || message;
      } catch (error) {}
      throw new Error(message);
    }
    return { raw, response };
  },

  async load(page = this.page) {
    const server = App.currentServer;
    if (!server || server.type !== 'Calagopus') return;
    if (!this.active(server)) this.start(server);
    const allowed = await this.permissionpromise;
    if (!this.active(server) || App.currentServerPage !== 'activity') return;
    if (!allowed) {
      this.renderdenied();
      return;
    }
    this.page = Math.max(1, Number(page) || 1);
    const requestid = ++this.requestid;
    this.controller?.abort();
    this.controller = new AbortController();
    this.loading = true;
    this.error = '';
    this.render();
    const query = new URLSearchParams({ page: String(this.page) });
    if (this.search) query.set('search', this.search);
    if (this.user) query.set('user', this.user);
    try {
      const result = await this.request(`/activity?${query}`, { signal: this.controller.signal }, server);
      if (!this.active(server) || requestid !== this.requestid || App.currentServerPage !== 'activity') return;
      let payload;
      try { payload = result.raw ? JSON.parse(result.raw) : {}; }
      catch (error) { throw new Error('The panel returned an invalid activity response'); }
      const pagination = payload.activities;
      if (!pagination || !Array.isArray(pagination.data)) throw new Error('The panel returned incomplete activity data');
      this.activities = pagination.data;
      this.total = Number(pagination.total) || 0;
      this.perpage = Math.max(1, Number(pagination.per_page) || 25);
      this.page = Math.max(1, Number(pagination.page) || this.page);
      const pages = Math.max(1, Math.ceil(this.total / this.perpage));
      if ((this.total === 0 && this.page !== 1) || this.page > pages) {
        this.loading = false;
        this.load(this.total === 0 ? 1 : pages);
        return;
      }
    } catch (error) {
      if (error.name === 'AbortError' || !this.active(server) || requestid !== this.requestid) return;
      this.error = error.message;
    } finally {
      if (this.active(server) && requestid === this.requestid) {
        this.loading = false;
        this.render();
      }
    }
  },

  renderdenied() {
    const container = Utils.el('tabActivity');
    if (!container) return;
    if (this.error) {
      container.innerHTML = `<div class="calagopus-activity-empty error" role="alert"><strong>Unable to load activity access</strong><span>${this.safe(this.error)}</span><button type="button" class="btn btn-secondary btn-sm" onclick="calagopusactivity.retrypermissions()">Try Again</button></div>`;
    } else if (!this.routevisible) {
      container.innerHTML = '<div class="calagopus-activity-empty"><strong>Activity unavailable</strong><span>Activity is not enabled for this server.</span></div>';
    } else {
      container.innerHTML = '<div class="calagopus-activity-empty"><strong>No access</strong><span>You do not have permission to view activity for this server.</span></div>';
    }
  },

  async retrypermissions() {
    const server = this.server;
    if (!server || !this.active(server)) return;
    this.error = '';
    this.permissionpromise = this.syncnav(server);
    const allowed = await this.permissionpromise;
    if (!this.active(server) || App.currentServerPage !== 'activity') return;
    if (allowed) this.load(1);
    else this.renderdenied();
  },

  setsearch(value) {
    this.search = String(value || '').slice(0, 128);
    clearTimeout(this.searchtimer);
    this.searchtimer = setTimeout(() => this.load(this.page), 150);
  },

  setuser(uuid) {
    this.user = uuid || null;
    this.load(this.page);
  },

  setpage(page) {
    if (this.loading) return;
    const pages = Math.max(1, Math.ceil(this.total / this.perpage));
    const next = Math.max(1, Math.min(pages, Number(page) || 1));
    if (next !== this.page) this.load(next);
  },

  bindkeys() {
    this.unbindkeys();
    this.keyhandler = event => {
      if (App.currentServerPage !== 'activity' || !this.active() || this.loading) return;
      const tag = event.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || event.target?.isContentEditable) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        this.setpage(event.shiftKey ? 1 : this.page - 1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        this.setpage(event.shiftKey ? Math.ceil(this.total / this.perpage) : this.page + 1);
      }
    };
    document.addEventListener('keydown', this.keyhandler);
  },

  unbindkeys() {
    if (this.keyhandler) document.removeEventListener('keydown', this.keyhandler);
    this.keyhandler = null;
  },

  pagechanged(page) {
    clearInterval(this.whentimer);
    this.unbindkeys();
    if (page === 'activity' && this.active()) this.bindkeys();
  },

  avatar(user) {
    const username = user?.username || '';
    const initials = username ? username.slice(0, 2).toUpperCase() : '';
    let source = '';
    if (user?.avatar) {
      try {
        const url = new URL(user.avatar, this.server.panelUrl);
        if (['http:', 'https:'].includes(url.protocol)) source = url.href;
      } catch (error) {}
    }
    return `<span class="calagopus-activity-avatar">${this.safe(initials)}${source ? `<img src="${this.safe(source)}" alt="${this.safe(username)}">` : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"></circle><path d="M4 21a8 8 0 0 1 16 0"></path></svg>'}</span>`;
  },

  actor(item) {
    const method = item.is_api ? 'API' : 'Web';
    const impersonated = item.impersonator?.username ? ` (Impersonated by ${this.safe(item.impersonator.username)})` : '';
    if (item.user) return `<button type="button" class="calagopus-activity-actor" data-user="${this.safe(item.user.uuid)}">${this.safe(item.user.username)}</button> (${method})${impersonated}`;
    return `${item.is_schedule ? 'Schedule' : 'System'}${impersonated}`;
  },

  formatwhen(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return 'N/A';
    const seconds = Math.round((date.getTime() - Date.now()) / 1000);
    const absolute = Math.abs(seconds);
    const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
    if (absolute < 60) return formatter.format(seconds, 'second');
    const minutes = Math.round(seconds / 60);
    if (Math.abs(minutes) < 60) return formatter.format(minutes, 'minute');
    const hours = Math.round(minutes / 60);
    if (Math.abs(hours) < 24) return formatter.format(hours, 'hour');
    const days = Math.round(hours / 24);
    if (Math.abs(days) < 7) return formatter.format(days, 'day');
    return date.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric' });
  },

  formattitle(value) {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleString(undefined, { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric', timeZoneName: 'short' }) : '';
  },

  updatewhen() {
    document.querySelectorAll('#tabActivity [data-activity-time]').forEach(element => {
      element.textContent = this.formatwhen(element.dataset.activityTime);
    });
  },

  hasdata(data) {
    return Object.keys(data ?? {}).length > 0;
  },

  paginationhtml() {
    const pages = Math.ceil(this.total / this.perpage);
    if (pages <= 1) return '';
    const start = (this.page - 1) * this.perpage + 1;
    const end = Math.min(this.page * this.perpage, this.total);
    const numberstart = Math.max(1, Math.min(this.page - 1, pages - 2));
    const numberend = Math.min(pages, numberstart + 2);
    const numbers = [];
    for (let page = numberstart; page <= numberend; page++) numbers.push(`<button type="button" class="${page === this.page ? 'active' : ''}" onclick="calagopusactivity.setpage(${page})" ${page === this.page ? 'aria-current="page"' : ''}>${page}</button>`);
    return `<div class="calagopus-activity-pagination"><span>${start}-${end} of ${this.total}</span><div><button type="button" title="First page" onclick="calagopusactivity.setpage(1)" ${this.page <= 1 ? 'disabled' : ''}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m11 17-5-5 5-5M18 17l-5-5 5-5"></path></svg></button><button type="button" title="Previous page" onclick="calagopusactivity.setpage(${this.page - 1})" ${this.page <= 1 ? 'disabled' : ''}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"></path></svg></button>${numbers.join('')}<button type="button" title="Next page" onclick="calagopusactivity.setpage(${this.page + 1})" ${this.page >= pages ? 'disabled' : ''}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"></path></svg></button><button type="button" title="Last page" onclick="calagopusactivity.setpage(${pages})" ${this.page >= pages ? 'disabled' : ''}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 17 5-5-5-5M13 17l5-5-5-5"></path></svg></button></div></div>`;
  },

  row(item, index) {
    const details = this.hasdata(item.data);
    const revisionid = Number(item.data?.revision_id);
    const revision = item.event === 'server:file.write' && item.data?.file && Number.isInteger(revisionid) && revisionid > 0;
    return `<tr><td>${this.avatar(item.user)}</td><td>${this.actor(item)}</td><td><code>${this.safe(item.event)}</code></td><td><code>${this.safe(item.ip || 'N/A')}</code></td><td><time data-activity-time="${this.safe(item.created)}" datetime="${this.safe(item.created)}" title="${this.safe(this.formattitle(item.created))}">${this.safe(this.formatwhen(item.created))}</time></td><td><div class="calagopus-activity-row-actions">${revision ? `<button type="button" title="View file revision" aria-label="View file revision" onclick="calagopusactivity.openrevision(${index})"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="2"></circle><circle cx="18" cy="6" r="2"></circle><circle cx="12" cy="18" r="2"></circle><path d="M6 8v2a8 8 0 0 0 6 8M18 8v1a5 5 0 0 1-5 5"></path></svg></button>` : ''}${details ? `<button type="button" title="Activity details" aria-label="Activity details" onclick="calagopusactivity.details(${index})"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"></circle><path d="M12 11v5M12 8h.01"></path></svg></button>` : ''}</div></td></tr>`;
  },

  render() {
    const container = Utils.el('tabActivity');
    if (!container || !this.active()) return;
    const oldsearch = Utils.el('calagopus-activity-search');
    const restorefocus = document.activeElement === oldsearch;
    const selectionstart = oldsearch?.selectionStart;
    const selectionend = oldsearch?.selectionEnd;
    const pagination = this.paginationhtml();
    const rows = this.activities.map((item, index) => this.row(item, index)).join('');
    const empty = !this.loading && !this.error && !this.activities.length ? '<div class="calagopus-activity-empty"><svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 19V5M4 12h16M20 5v14"></path></svg><span>No activity found.</span></div>' : '';
    const error = this.error ? `<div class="calagopus-activity-empty error" role="alert"><strong>Unable to load activity</strong><span>${this.safe(this.error)}</span><button type="button" class="btn btn-secondary btn-sm" onclick="calagopusactivity.load()">Try Again</button></div>` : '';
    container.innerHTML = `<div class="calagopus-activity-page"><div class="calagopus-activity-header"><h2>Activity</h2><div class="calagopus-activity-tools"><label class="calagopus-activity-search"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg><input id="calagopus-activity-search" type="search" maxlength="128" placeholder="Search activity" value="${this.safe(this.search)}" oninput="calagopusactivity.setsearch(this.value)"></label>${this.user ? '<button type="button" class="btn btn-secondary btn-sm" onclick="calagopusactivity.setuser(null)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m18 6-12 12M6 6l12 12"></path></svg>Clear User Filter</button>' : ''}</div></div><div class="calagopus-activity-tablebox">${pagination}<div class="calagopus-activity-tablewrap"><table><thead><tr><th></th><th>Actor</th><th>Event</th><th>IP</th><th>When</th><th></th></tr></thead><tbody>${!this.error ? rows : ''}</tbody></table>${this.loading ? '<div class="calagopus-activity-loading" role="status"><span class="spinner"></span></div>' : ''}</div>${error || empty}${pagination}</div></div>`;
    if (restorefocus) {
      const search = Utils.el('calagopus-activity-search');
      search?.focus();
      if (selectionstart !== null && selectionstart !== undefined) search?.setSelectionRange(selectionstart, selectionend);
    }
    container.querySelectorAll('[data-user]').forEach(button => button.onclick = () => this.setuser(button.dataset.user));
    clearInterval(this.whentimer);
    if (App.currentServerPage === 'activity') {
      this.whentimer = setInterval(() => this.updatewhen(), 1000);
      this.bindkeys();
    } else {
      this.unbindkeys();
    }
  },

  details(index) {
    const item = this.activities[index];
    if (!item || !this.hasdata(item.data)) return;
    const json = JSON.stringify(item.data, null, 2);
    Modal.open('Activity Details', `<pre class="calagopus-activity-json"><code>${this.safe(json)}</code></pre><div class="modal-actions"><button type="button" class="btn btn-secondary" onclick="Modal.close()">Close</button></div>`, 'calagopus-activity-modal');
  },

  async openrevision(index) {
    const item = this.activities[index];
    const file = item?.data?.file;
    const revision = Number(item?.data?.revision_id);
    if (!item || item.event !== 'server:file.write' || !file || !Number.isInteger(revision) || revision < 1) return;
    if (!this.can('files.read-content')) {
      this.toast('You do not have permission to read file revisions.', 'error');
      return;
    }
    if (!this.filesroutevisible) {
      this.toast('File revisions are not enabled for this server.', 'error');
      return;
    }
    this.diff = { server: this.server, file, revision, revisioncontent: '', currentcontent: '', baseline: '', dirty: false, loading: true, saving: false, error: '', left: null, right: null };
    this.routingrevision = true;
    App.switchserverpage('files');
  },

  usefileview() {
    if (this.routingrevision && this.diff) {
      this.routingrevision = false;
      this.renderrevision();
      return true;
    }
    if (this.diff) this.closediff(true);
    return false;
  },

  blocknavigation(page) {
    if (!this.diff || this.routingrevision || this.discardnavigation || !this.diff.dirty) return false;
    this.pendingpage = page;
    Modal.confirm('Unsaved Changes', 'You have unsaved changes in the revision comparison. Leave this page and discard them?', () => {
      this.discardnavigation = true;
      this.closediff(true);
      const next = this.pendingpage;
      this.pendingpage = null;
      App.switchserverpage(next);
      this.discardnavigation = false;
    });
    return true;
  },

  closediff(force = false) {
    if (this.diff?.left) this.diff.left.toTextArea();
    if (this.diff?.right) this.diff.right.toTextArea();
    const view = Utils.el('calagopus-revision-view');
    if (view) view.remove();
    const files = Utils.el('filesContainer');
    if (files) files.style.display = '';
    if (force) this.diff = null;
  },

  async renderrevision() {
    const diff = this.diff;
    if (!diff || !this.active(diff.server)) return;
    const tab = Utils.el('tabFiles');
    const files = Utils.el('filesContainer');
    if (!tab || !files) return;
    files.style.display = 'none';
    let view = Utils.el('calagopus-revision-view');
    if (!view) {
      view = document.createElement('div');
      view.id = 'calagopus-revision-view';
      view.className = 'calagopus-revision-view';
      tab.appendChild(view);
    }
    view.innerHTML = `<div class="calagopus-revision-header"><div><button type="button" class="calagopus-revision-back" title="Back to Activity" onclick="calagopusactivity.backfromrevision()"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"></path></svg></button><h2>${this.safe(diff.file.split('/').pop())}</h2><span>Revision #${diff.revision} vs current</span></div><div class="calagopus-revision-actions">${this.can('files.create') ? '<button type="button" class="btn btn-secondary btn-sm" data-restore disabled>Restore Revision</button><button type="button" class="btn btn-primary btn-sm" data-save disabled>Save</button>' : ''}</div></div><div class="calagopus-revision-labels"><span>Revision #${diff.revision}</span><span>Current file</span></div><div class="calagopus-revision-editors"><div><textarea data-original></textarea></div><div><textarea data-current></textarea></div></div><div class="calagopus-revision-state" role="status"><span class="spinner"></span>Loading revision...</div>`;
    view.querySelector('[data-restore]')?.addEventListener('click', () => this.restorerevision());
    view.querySelector('[data-save]')?.addEventListener('click', () => this.saverevision());
    try {
      const query = `?file=${encodeURIComponent(diff.file)}`;
      const [revisionresult, currentresult] = await Promise.all([
        this.request(`/files/revisions/${diff.revision}${query}`, {}, diff.server),
        this.request(`/files/contents${query}`, {}, diff.server)
      ]);
      if (this.diff !== diff || !this.active(diff.server)) return;
      diff.revisioncontent = revisionresult.raw;
      diff.currentcontent = currentresult.raw;
      diff.baseline = currentresult.raw;
      diff.loading = false;
      this.mountrevisioneditors(diff);
    } catch (error) {
      if (this.diff !== diff || !this.active(diff.server)) return;
      diff.loading = false;
      diff.error = error.message;
      view.querySelector('.calagopus-revision-state').innerHTML = `<strong>Unable to load revision</strong><span>${this.safe(error.message)}</span><button type="button" class="btn btn-secondary btn-sm" onclick="calagopusactivity.renderrevision()">Try Again</button>`;
    }
  },

  mountrevisioneditors(diff) {
    const view = Utils.el('calagopus-revision-view');
    if (!view || this.diff !== diff) return;
    view.querySelector('.calagopus-revision-state').remove();
    const name = diff.file.split('/').pop();
    const mode = ServerFiles.getmode(name);
    const theme = ['dark', 'oled'].includes(document.documentElement.getAttribute('data-theme')) ? 'material-darker' : 'default';
    diff.left = CodeMirror.fromTextArea(view.querySelector('[data-original]'), { value: diff.revisioncontent, mode, theme, lineNumbers: true, lineWrapping: false, readOnly: 'nocursor' });
    diff.left.setValue(diff.revisioncontent);
    diff.right = CodeMirror.fromTextArea(view.querySelector('[data-current]'), { value: diff.currentcontent, mode, theme, lineNumbers: true, lineWrapping: false, readOnly: this.can('files.create') ? false : 'nocursor', extraKeys: { 'Ctrl-S': () => this.saverevision(), 'Cmd-S': () => this.saverevision() } });
    diff.right.setValue(diff.currentcontent);
    diff.left.setSize('100%', '100%');
    diff.right.setSize('100%', '100%');
    diff.right.on('change', editor => {
      if (this.diff !== diff) return;
      diff.currentcontent = editor.getValue();
      diff.dirty = diff.currentcontent !== diff.baseline;
      this.updatediffbuttons();
    });
    this.updatediffbuttons();
    setTimeout(() => { diff.left?.refresh(); diff.right?.refresh(); }, 0);
  },

  updatediffbuttons() {
    const diff = this.diff;
    const view = Utils.el('calagopus-revision-view');
    if (!diff || !view) return;
    const save = view.querySelector('[data-save]');
    const restore = view.querySelector('[data-restore]');
    if (save) save.disabled = diff.loading || diff.saving || !diff.dirty;
    if (restore) restore.disabled = diff.loading || diff.saving || diff.currentcontent === diff.revisioncontent;
  },

  restorerevision() {
    const diff = this.diff;
    if (!diff?.right || !this.can('files.create') || diff.saving) return;
    const restore = () => {
      if (this.diff !== diff || !diff.right) return;
      diff.right.setValue(diff.revisioncontent);
      diff.right.focus();
    };
    if (diff.dirty) {
      Modal.confirm('Unsaved Changes', 'Restore this revision and discard your unsaved changes in the current comparison?', restore);
    } else {
      restore();
    }
  },

  async saverevision() {
    const diff = this.diff;
    if (!diff?.right || !diff.dirty || diff.saving || !this.can('files.create') || !this.active(diff.server)) return;
    diff.saving = true;
    this.updatediffbuttons();
    const content = diff.right.getValue();
    try {
      await this.request(`/files/write?file=${encodeURIComponent(diff.file)}`, { method: 'POST', body: content, headers: { 'Content-Type': 'text/plain; charset=UTF-8' } }, diff.server);
      if (this.diff !== diff) return;
      diff.baseline = content;
      diff.currentcontent = content;
      diff.dirty = false;
      this.toast('File updated successfully.');
    } catch (error) {
      if (this.diff === diff) this.toast(error.message, 'error');
    } finally {
      if (this.diff === diff) {
        diff.saving = false;
        this.updatediffbuttons();
      }
    }
  },

  backfromrevision() {
    if (this.blocknavigation('activity')) return;
    this.closediff(true);
    App.switchserverpage('activity');
  },

  toast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast file-toast file-toast-${type}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 4000);
  }
};
