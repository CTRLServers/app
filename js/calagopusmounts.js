const calagopusmounts = {
  view: 'mounts',
  mounts: [],
  devices: [],
  pagination: {},
  permissions: [],
  selected: new Set(),
  page: 1,
  search: '',
  timer: null,
  keyhandler: null,
  serveruuid: null,
  dragging: false,
  dragstart: -1,
  dragbase: new Set(),
  dragmode: 'replace',

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
      let message = t('cset.httperror', { status: response.status });
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

  pluralform(n, one, few, many) {
    if (I18n.getlang() !== 'ru') return n === 1 ? one : many;
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  },

  countlabel(n) {
    const kind = this.view === 'mounts' ? 'mount' : 'device';
    const noun = this.pluralform(n, t(`cmnt.noun.${kind}.one`), t(`cmnt.noun.${kind}.few`), t(`cmnt.noun.${kind}.many`));
    return `${n} ${noun}`;
  },

  can(permission) {
    return this.permissions.includes('*') || this.permissions.includes(permission);
  },

  canselect() {
    const prefix = this.view === 'mounts' ? 'mounts' : 'devices';
    return this.can(`${prefix}.attach`) || this.can(`${prefix}.detach`);
  },

  async syncnav(server) {
    try {
      const detail = await Api.fetchcalagopusserver(server.panelUrl, await Servers.resolveapikey(server), server.uuid);
      if (App.currentServer !== server) return;
      const permissions = detail.permissions || [];
      const visible = permissions.includes('*') || permissions.includes('mounts.read') || permissions.includes('devices.read');
      document.querySelector('#serverNav .nav-item[data-server-page="mounts"]')?.classList.toggle('hidden', !visible);
    } catch (error) {}
  },

  items() {
    return this.view === 'mounts' ? this.mounts : this.devices;
  },

  async load() {
    const activeuuid = App.currentServer?.uuid || null;
    if (this.serveruuid !== activeuuid) {
      this.serveruuid = activeuuid;
      this.permissions = [];
      this.selected.clear();
      this.view = 'mounts';
      this.page = 1;
      this.search = '';
    }
    this.renderloading();
    try {
      const current = App.currentServer;
      const detail = await Api.fetchcalagopusserver(current.panelUrl, await Servers.resolveapikey(current), current.uuid);
      this.permissions = detail.permissions || [];
      if (!this.can('mounts.read') && this.can('devices.read')) this.view = 'devices';
      if (this.view === 'devices' && !this.can('devices.read') && this.can('mounts.read')) this.view = 'mounts';
      this.bindkeys();
      await this.loadview();
    } catch (error) {
      this.rendererror(error.message);
    }
  },

  async loadview() {
    this.renderloading();
    try {
      if (this.view === 'mounts') {
        if (!this.can('mounts.read')) return this.renderdenied();
        const result = await this.request('/mounts');
        this.pagination = result?.mounts || {};
        this.mounts = this.pagination.data || [];
      } else {
        if (!this.can('devices.read')) return this.renderdenied();
        const query = new URLSearchParams({ page: String(this.page) });
        if (this.search) query.set('search', this.search);
        const result = await this.request(`/devices?${query}`);
        this.pagination = result?.devices || {};
        this.devices = this.pagination.data || [];
      }
      const uuids = new Set(this.items().map(item => item.uuid));
      this.selected = new Set([...this.selected].filter(uuid => uuids.has(uuid)));
      this.render();
    } catch (error) {
      this.rendererror(error.message);
    }
  },

  renderloading() {
    const container = Utils.el('tabMounts');
    if (container) container.innerHTML = `${this.subnav()}<div class="tab-loading"><span class="spinner"></span></div>`;
  },

  rendererror(message) {
    const container = Utils.el('tabMounts');
    if (container) container.innerHTML = `${this.subnav()}<div class="calagopus-mount-empty error"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4M12 17h.01"></path><path d="m10.3 3.7-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.3l-8-14a2 2 0 0 0-3.4 0Z"></path></svg><strong>${t(`cmnt.loadfail.${this.view}`)}</strong><span>${this.safe(message)}</span><button class="btn btn-secondary btn-sm" onclick="calagopusmounts.loadview()">${t('csub.retry')}</button></div>`;
  },

  renderdenied() {
    const container = Utils.el('tabMounts');
    if (container) container.innerHTML = `<div class="calagopus-mount-empty"><strong>${t('cmnt.noaccess')}</strong><span>${t('cmnt.noaccess.desc')}</span></div>`;
  },

  subnav() {
    const entries = [];
    if (this.can('mounts.read')) entries.push(`<button class="${this.view === 'mounts' ? 'active' : ''}" onclick="calagopusmounts.setview('mounts')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 5h6l2 2h10v12H3Z"></path></svg>${t('cmnt.mounts')}</button>`);
    if (this.can('devices.read')) entries.push(`<button class="${this.view === 'devices' ? 'active' : ''}" onclick="calagopusmounts.setview('devices')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="6" width="12" height="12" rx="2"></rect><path d="M9 1v5M15 1v5M9 18v5M15 18v5M1 9h5M18 9h5M1 15h5M18 15h5"></path></svg>${t('cmnt.devices')}</button>`);
    return entries.length > 1 ? `<div class="calagopus-mount-subnav">${entries.join('')}</div>` : '';
  },

  setview(view) {
    if (view === this.view || !['mounts', 'devices'].includes(view)) return;
    if (!this.can(`${view}.read`)) return;
    this.view = view;
    this.selected.clear();
    this.page = 1;
    this.search = '';
    this.loadview();
  },

  render() {
    const container = Utils.el('tabMounts');
    if (!container) return;
    const items = this.items();
    const select = this.canselect();
    const allselected = items.length > 0 && items.every(item => this.selected.has(item.uuid));
    const rows = items.map((item, index) => this.rowhtml(item, index, select)).join('');
    const title = t(`cmnt.${this.view}`);
    const columns = this.view === 'mounts' ? ['cmnt.h.name', 'cmnt.h.description', 'cmnt.h.target', 'cmnt.h.mounted', 'cmnt.h.readonly', ''] : ['cmnt.h.name', 'cmnt.h.description', 'cmnt.h.target', 'cmnt.h.attached', 'cmnt.h.permissions', ''];
    const heading = `${select ? `<th><input type="checkbox" aria-label="${t('cmnt.selectall', { view: t(`cmnt.${this.view}`) })}" ${allselected ? 'checked' : ''} onchange="calagopusmounts.selectall(this.checked)"></th>` : ''}${columns.map(column => `<th>${column ? t(column) : ''}</th>`).join('')}`;
    const search = this.view === 'devices' ? `<label class="calagopus-network-search"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg><input value="${this.safe(this.search)}" placeholder="${t('cmnt.search')}" oninput="calagopusmounts.setsearch(this.value)"></label>` : '';
    container.innerHTML = `${this.subnav()}<div class="calagopus-mount-page"><div class="calagopus-mount-header"><div><h2>${title}</h2><span>${t('cmnt.available', { n: Number(this.pagination.total || items.length) })}</span></div>${search}</div>${this.bulkhtml()}<div class="calagopus-network-table-wrap"><table class="calagopus-network-table calagopus-mount-table"><thead><tr>${heading}</tr></thead><tbody>${rows || `<tr><td colspan="${columns.length + (select ? 1 : 0)}"><div class="calagopus-mount-empty">${t(`cmnt.empty.${this.view}`)}</div></td></tr>`}</tbody></table></div>${this.view === 'devices' ? this.paginationhtml() : ''}</div>`;
  },

  rowhtml(item, index, select) {
    const attached = !!item.created;
    const prefix = this.view === 'mounts' ? 'mounts' : 'devices';
    const action = attached ? 'detach' : 'attach';
    const allowed = this.can(`${prefix}.${action}`);
    const actionbutton = allowed ? `<button class="${attached ? 'detach' : 'attach'}" title="${t(attached ? 'cmnt.detach' : 'cmnt.attach')}" onclick="calagopusmounts.confirmone(${index})"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14${attached ? '' : 'M12 5v14'}"></path></svg></button>` : '';
    const selected = this.selected.has(item.uuid);
    const boolean = value => value ? '<svg class="calagopus-mount-yes" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m5 12 4 4L19 6"></path></svg>' : '<svg class="calagopus-mount-no" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m6 6 12 12M18 6 6 18"></path></svg>';
    const final = this.view === 'mounts' ? boolean(!!item.read_only) : `<code>${this.safe(item.permissions)}</code>`;
    return `<tr class="${selected ? 'selected' : ''}" data-mount-index="${index}" onmousedown="calagopusmounts.startselection(event,${index})" onmouseenter="calagopusmounts.moveselection(${index})">${select ? `<td><input type="checkbox" aria-label="${t('cmnt.select', { name: this.safe(item.name) })}" ${selected ? 'checked' : ''} onchange="calagopusmounts.toggleselected('${item.uuid}',this.checked)"></td>` : ''}<td><strong>${this.safe(item.name)}</strong></td><td>${this.safe(item.description || '')}</td><td><code>${this.safe(item.target)}</code></td><td>${boolean(attached)}</td><td>${final}</td><td><div class="calagopus-mount-actions">${actionbutton}</div></td></tr>`;
  },

  bulkhtml() {
    if (!this.selected.size || !this.canselect()) return '';
    const items = this.items().filter(item => this.selected.has(item.uuid));
    const attachable = items.filter(item => !item.created).length;
    const detachable = items.filter(item => item.created).length;
    const prefix = this.view === 'mounts' ? 'mounts' : 'devices';
    return `<div class="calagopus-mount-bulk"><span>${t('cmnt.selected', { n: this.selected.size })}</span>${this.can(`${prefix}.attach`) ? `<button class="btn btn-primary btn-sm" onclick="calagopusmounts.bulkattach()" ${attachable ? '' : 'disabled'}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"></path></svg>${t('cmnt.attachcount', { n: attachable })}</button>` : ''}${this.can(`${prefix}.detach`) ? `<button class="btn btn-danger btn-sm" onclick="calagopusmounts.confirmbulkdetach()" ${detachable ? '' : 'disabled'}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"></path></svg>${t('cmnt.detachcount', { n: detachable })}</button>` : ''}<button class="btn btn-secondary btn-sm" onclick="calagopusmounts.clearselected()">${t('cmnt.clear')}</button></div>`;
  },

  toggleselected(uuid, checked) {
    if (checked) this.selected.add(uuid);
    else this.selected.delete(uuid);
    this.render();
  },

  selectall(checked) {
    this.selected = checked ? new Set(this.items().map(item => item.uuid)) : new Set();
    this.render();
  },

  clearselected() {
    this.selected.clear();
    this.render();
  },

  startselection(event, index) {
    if (!this.canselect() || event.button !== 0 || event.target.closest('input, button, a, textarea, select')) return;
    this.dragging = true;
    this.dragstart = index;
    this.dragbase = new Set(this.selected);
    this.dragmode = event.ctrlKey || event.metaKey ? 'toggle' : event.shiftKey ? 'add' : 'replace';
  },

  moveselection(index) {
    if (!this.dragging || index === this.dragstart) return;
    const range = this.items().slice(Math.min(index, this.dragstart), Math.max(index, this.dragstart) + 1).map(item => item.uuid);
    const selected = this.dragmode === 'replace' ? new Set() : new Set(this.dragbase);
    range.forEach(uuid => {
      if (this.dragmode === 'toggle' && this.dragbase.has(uuid)) selected.delete(uuid);
      else selected.add(uuid);
    });
    this.selected = selected;
    this.render();
  },

  confirmone(index) {
    const item = this.items()[index];
    const attached = !!item.created;
    const kind = t(this.view === 'mounts' ? 'cmnt.mount' : 'cmnt.device');
    const action = t(attached ? 'cmnt.detach' : 'cmnt.attach');
    Modal.open(`${action} ${kind}`, `<div class="calagopus-mount-confirm"><p>${t(attached ? 'cmnt.confirm.detach' : 'cmnt.confirm.attach', { name: this.safe(item.name), target: this.safe(item.target) })}</p><div id="calagopus-mount-modal-error"></div><div class="modal-actions"><button class="btn btn-secondary" onclick="Modal.close()">${t('cset.cancel')}</button><button class="btn ${attached ? 'btn-danger' : 'btn-primary'}" onclick="calagopusmounts.runone(${index})">${action}</button></div></div>`);
  },

  async runone(index) {
    const item = this.items()[index];
    const attached = !!item.created;
    try {
      await this.change(item, attached ? 'detach' : 'attach');
      Modal.close();
      this.toast(this.message(item, attached ? 'detach' : 'attach'));
      await this.loadview();
    } catch (error) {
      const box = Utils.el('calagopus-mount-modal-error');
      if (box) box.innerHTML = `<div class="error-msg">${this.safe(error.message)}</div>`;
    }
  },

  change(item, action) {
    const endpoint = this.view === 'mounts' ? '/mounts' : '/devices';
    if (action === 'attach') {
      const key = this.view === 'mounts' ? 'mount_uuid' : 'device_uuid';
      return this.request(endpoint, 'POST', { [key]: item.uuid });
    }
    return this.request(`${endpoint}/${item.uuid}`, 'DELETE');
  },

  message(item, action) {
    const kind = this.view === 'mounts' ? 'mount' : 'device';
    return t(`cmnt.msg.${kind}.${action}`, { name: item.name });
  },

  bulkattach() {
    const items = this.items().filter(item => this.selected.has(item.uuid) && !item.created);
    this.runbulk(items, 'attach', this.selected.size - items.length);
  },

  confirmbulkdetach() {
    const items = this.items().filter(item => this.selected.has(item.uuid) && item.created);
    const skipped = this.selected.size - items.length;
    Modal.open(t(`cmnt.bulk.detach.${this.view}`), `<div class="calagopus-mount-confirm"><p>${t('cmnt.bulk.detach.confirm', { items: this.countlabel(items.length) })}</p>${skipped ? `<div class="calagopus-mount-warning"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4M12 17h.01"></path><path d="m10.3 3.7-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.3l-8-14a2 2 0 0 0-3.4 0Z"></path></svg><span>${t('cmnt.bulk.skip', { items: this.countlabel(skipped) })}</span></div>` : ''}<div class="modal-actions"><button class="btn btn-secondary" onclick="Modal.close()">${t('cset.cancel')}</button><button class="btn btn-danger" onclick="calagopusmounts.bulkdetach()">${t('cmnt.detach')}</button></div></div>`);
  },

  bulkdetach() {
    const items = this.items().filter(item => this.selected.has(item.uuid) && item.created);
    const skipped = this.selected.size - items.length;
    Modal.close();
    this.runbulk(items, 'detach', skipped);
  },

  async runbulk(items, action, skipped) {
    if (!items.length) {
      this.toast(t('cmnt.nothing'), 'info');
      this.selected.clear();
      return this.render();
    }
    const results = await Promise.allSettled(items.map(item => this.change(item, action)));
    const successful = results.filter(result => result.status === 'fulfilled').length;
    const failed = results.length - successful;
    const resultmessage = t(`cmnt.result.${action}`, { items: this.countlabel(successful) });
    if (failed && !successful) {
      const result = results.find(entry => entry.status === 'rejected');
      this.toast(result?.reason?.message || t(`cmnt.err.${action}`), 'error');
    } else if (failed) {
      this.toast(t('cmnt.result.failed', { result: resultmessage, failed }), 'warning');
    } else if (skipped) {
      this.toast(t('cmnt.result.skipped', { result: resultmessage, skipped }));
    } else {
      this.toast(resultmessage);
    }
    this.selected.clear();
    await this.loadview();
  },

  setsearch(value) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.search = value.trim();
      this.page = 1;
      this.loadview();
    }, 350);
  },

  setpage(page) {
    const perpage = Number(this.pagination.per_page || 10);
    const pages = Math.max(1, Math.ceil(Number(this.pagination.total || 0) / perpage));
    if (page < 1 || page > pages || page === this.page) return;
    this.page = page;
    this.selected.clear();
    this.loadview();
  },

  paginationhtml() {
    const page = Number(this.pagination.page || 1);
    const perpage = Number(this.pagination.per_page || 10);
    const pages = Math.ceil(Number(this.pagination.total || 0) / perpage);
    if (pages <= 1) return '';
    return `<div class="calagopus-mount-pagination"><span>${t('cmnt.range', { start: (page - 1) * perpage + 1, end: Math.min(page * perpage, this.pagination.total), total: this.pagination.total })}</span><div><button class="btn btn-secondary btn-sm" onclick="calagopusmounts.setpage(${page - 1})" ${page <= 1 ? 'disabled' : ''}>${t('csub.previous')}</button><button class="btn btn-secondary btn-sm" onclick="calagopusmounts.setpage(${page + 1})" ${page >= pages ? 'disabled' : ''}>${t('csub.next')}</button></div></div>`;
  },

  bindkeys() {
    if (this.keyhandler) return;
    this.keyhandler = event => {
      if (App.currentServerPage !== 'mounts' || !this.canselect()) return;
      const target = event.target;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName) || target?.isContentEditable) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        this.selectall(true);
      } else if (event.key === 'Escape') {
        this.clearselected();
      } else if (this.view === 'devices' && event.key === 'ArrowLeft') {
        event.preventDefault();
        this.setpage(event.shiftKey ? 1 : this.page - 1);
      } else if (this.view === 'devices' && event.key === 'ArrowRight') {
        event.preventDefault();
        const perpage = Number(this.pagination.per_page || 10);
        const pages = Math.max(1, Math.ceil(Number(this.pagination.total || 0) / perpage));
        this.setpage(event.shiftKey ? pages : this.page + 1);
      }
    };
    window.addEventListener('keydown', this.keyhandler);
    window.addEventListener('mouseup', () => {
      this.dragging = false;
      this.dragstart = -1;
    });
  },

  toast(message, type = 'success') {
    document.querySelector('.calagopus-mount-toast')?.remove();
    const toast = document.createElement('div');
    toast.className = `toast file-toast calagopus-mount-toast file-toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
  }
};
