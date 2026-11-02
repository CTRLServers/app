const adminmounts = {
  mounts: [],
  mount: null,
  targetid: null,

  pluralform(n) {
    if (I18n.getlang() !== 'ru') return n === 1 ? 'one' : 'many';
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'one';
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'few';
    return 'many';
  },

  async load() {
    const container = Utils.el('tabpanelmounts');
    if (!container) return;
    if (this.targetid !== null) {
      const id = this.targetid;
      this.targetid = null;
      await this.openmount(id);
      return;
    }
    container.innerHTML = `<div class="paneladmin-loading"><div class="spinner"></div><span>${t('amnt.loading')}</span></div>`;
    try {
      const { server, apikey } = await adminpanel.credentials();
      const data = await Api.adminrequest(server.panelUrl, apikey, '/admin/ctrlservers/mounts');
      if (App.currentServer !== server) return;
      this.mounts = data.mounts || [];
      this.mount = null;
      this.render();
    } catch (error) {
      container.innerHTML = `<div class="paneladmin-error-state"><strong>${t('amnt.loadfail')}</strong><span>${this.safe(error.message)}</span><button type="button" class="btn btn-secondary btn-sm" onclick="adminmounts.load()">${t('csub.retry')}</button></div>`;
    }
  },

  render() {
    const container = Utils.el('tabpanelmounts');
    if (!container) return;
    container.innerHTML = `<div class="paneladmin-page adminmounts-page"><div class="paneladmin-heading adminmounts-heading"><div><h2>${t('cmnt.mounts')}</h2><span class="paneladmin-url">${t(`amnt.count.${this.pluralform(this.mounts.length)}`, { n: this.mounts.length })}</span></div><button type="button" class="btn btn-primary" onclick="adminmounts.opencreate()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>${t('aapi.create')}</button></div><section class="adminmounts-card"><div class="adminmounts-table-wrap">${this.mounts.length ? `<table class="adminmounts-table"><thead><tr><th>${t('amnt.h.id')}</th><th>${t('cmnt.h.name')}</th><th>${t('amnt.h.source')}</th><th>${t('cmnt.h.target')}</th><th>${t('aapi.res.eggs')}</th><th>${t('nav.nodes')}</th><th>${t('nav.servers')}</th></tr></thead><tbody>${this.mounts.map(mount => this.renderrow(mount)).join('')}</tbody></table>` : `<div class="adminmounts-empty">${t('amnt.empty')}</div>`}</div></section></div>`;
  },

  renderrow(mount) {
    return `<tr role="button" tabindex="0" onclick="adminmounts.openmount(${Number(mount.id)})" onkeydown="adminmounts.rowkey(event, ${Number(mount.id)})"><td>${Number(mount.id)}</td><td><strong>${this.safe(mount.name)}</strong></td><td><code>${this.safe(mount.source)}</code></td><td><code>${this.safe(mount.target)}</code></td><td>${Number(mount.eggs || 0)}</td><td>${Number(mount.nodes || 0)}</td><td>${Number(mount.servers || 0)}</td></tr>`;
  },

  rowkey(event, id) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    this.openmount(id);
  },

  openfromserver(id) {
    this.targetid = Number(id);
    App.switchserverpage('panelmounts');
  },

  async openmount(id) {
    const container = Utils.el('tabpanelmounts');
    if (!container) return;
    container.innerHTML = `<div class="paneladmin-loading"><div class="spinner"></div><span>${t('amnt.loadingmount')}</span></div>`;
    try {
      const { server, apikey } = await adminpanel.credentials();
      const data = await Api.adminrequest(server.panelUrl, apikey, '/admin/ctrlservers/mounts/' + Number(id));
      if (App.currentServer !== server) return;
      this.mount = data.mount;
      this.renderdetail();
    } catch (error) {
      container.innerHTML = `<div class="paneladmin-error-state"><strong>${t('amnt.loadmountfail')}</strong><span>${this.safe(error.message)}</span><button type="button" class="btn btn-secondary btn-sm" onclick="adminmounts.openmount(${Number(id)})">${t('csub.retry')}</button></div>`;
    }
  },

  renderdetail() {
    const container = Utils.el('tabpanelmounts');
    if (!container || !this.mount) return;
    const eggs = this.mount.egg_list || [];
    const nodes = this.mount.node_list || [];
    container.innerHTML = `<div class="paneladmin-page adminmounts-page"><div class="adminnodes-detail-heading"><button type="button" class="adminnodes-back" onclick="adminmounts.load()" title="${t('amnt.back')}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg></button><div><h2>${this.safe(this.mount.name)}</h2><span>${this.safe(this.mount.uuid)}</span></div></div><div id="adminmounts-detail-message"></div><div class="adminmounts-detail-layout"><section class="adminmounts-detail-card"><h3>${t('amnt.details')}</h3><div class="adminmounts-form"><label class="adminmounts-field"><span>${t('cmnt.h.name')}</span><input type="text" id="adminmount-detail-name" value="${this.safeattr(this.mount.name)}" maxlength="64" /></label><label class="adminmounts-field"><span>${t('amnt.uuid')}</span><input type="text" value="${this.safeattr(this.mount.uuid)}" readonly /></label><label class="adminmounts-field"><span>${t('cmnt.h.description')}</span><textarea id="adminmount-detail-description" maxlength="191" rows="4">${this.safe(this.mount.description || '')}</textarea></label><label class="adminmounts-field"><span>${t('amnt.source')}</span><input type="text" id="adminmount-detail-source" value="${this.safeattr(this.mount.source)}" /></label><label class="adminmounts-field"><span>${t('cmnt.h.target')}</span><input type="text" id="adminmount-detail-target" value="${this.safeattr(this.mount.target)}" /></label><div class="adminmounts-field"><span>${t('cmnt.h.readonly')}</span>${this.toggle('adminmount-detail-read-only', this.mount.read_only, t('amnt.true'), t('amnt.false'))}</div><div class="adminmounts-field"><span>${t('amnt.usermountable')}</span>${this.toggle('adminmount-detail-user-mountable', this.mount.user_mountable, t('amnt.true'), t('amnt.false'))}</div></div><div class="adminmounts-detail-actions"><button type="button" class="btn btn-danger" onclick="adminmounts.confirmdelete()">${t('amnt.delete')}</button><button type="button" class="btn btn-primary" id="adminmount-detail-save" onclick="adminmounts.save()">${t('amnt.save')}</button></div></section><aside class="adminmounts-relations"><section class="adminmounts-relation-card"><div class="adminmounts-relation-heading"><h3>${t('aapi.res.eggs')}</h3><button type="button" class="btn btn-secondary btn-sm" onclick="adminmounts.openaddegg()">${t('amnt.add.eggs')}</button></div>${eggs.length ? `<div class="adminmounts-relation-list">${eggs.map(egg => `<div><span><small>${t('amnt.idlabel', { n: Number(egg.id) })}</small><strong>${this.safe(egg.name)}</strong><em>${this.safe(egg.nest || '')}</em></span><button type="button" onclick="adminmounts.removeegg(${Number(egg.id)})" title="${t('amnt.removeegg')}">&times;</button></div>`).join('')}</div>` : `<div class="adminmounts-relation-empty">${t('amnt.noeggs')}</div>`}</section><section class="adminmounts-relation-card"><div class="adminmounts-relation-heading"><h3>${t('nav.nodes')}</h3><button type="button" class="btn btn-secondary btn-sm" onclick="adminmounts.openaddnode()">${t('amnt.add.nodes')}</button></div>${nodes.length ? `<div class="adminmounts-node-head"><span>${t('amnt.h.id')}</span><span>${t('cmnt.h.name')}</span><span>${t('amnt.h.fqdn')}</span><span></span></div><div class="adminmounts-node-list">${nodes.map(node => `<div><small>${Number(node.id)}</small><strong>${this.safe(node.name)}</strong><code>${this.safe(node.fqdn)}</code><button type="button" onclick="adminmounts.removenode(${Number(node.id)})" title="${t('amnt.removenode')}">&times;</button></div>`).join('')}</div>` : `<div class="adminmounts-relation-empty">${t('amnt.nonodes')}</div>`}</section></aside></div></div>`;
  },

  opencreate() {
    Modal.open(t('amnt.create.title'), `<div id="adminmounts-form-error"></div><div class="adminmounts-form"><label class="adminmounts-field"><span>${t('cmnt.h.name')}</span><input type="text" id="adminmount-name" maxlength="64" autocomplete="off" /><small>${t('amnt.hint.name')}</small></label><label class="adminmounts-field"><span>${t('cmnt.h.description')}</span><textarea id="adminmount-description" maxlength="191" rows="4"></textarea><small>${t('amnt.hint.description')}</small></label><label class="adminmounts-field"><span>${t('amnt.source')}</span><input type="text" id="adminmount-source" autocomplete="off" /><small>${t('amnt.hint.source')}</small></label><label class="adminmounts-field"><span>${t('cmnt.h.target')}</span><input type="text" id="adminmount-target" autocomplete="off" /><small>${t('amnt.hint.target')}</small></label><div class="adminmounts-field"><span>${t('cmnt.h.readonly')}</span>${this.toggle('adminmount-read-only', false, t('amnt.true'), t('amnt.false'))}<small>${t('amnt.hint.readonly')}</small></div><div class="adminmounts-field"><span>${t('amnt.usermountable')}</span>${this.toggle('adminmount-user-mountable', false, t('amnt.true'), t('amnt.false'))}<small>${t('amnt.hint.usermountable')}</small></div></div><div class="modal-actions"><button type="button" class="btn btn-secondary" onclick="Modal.close()">${t('cset.cancel')}</button><button type="button" class="btn btn-primary" id="adminmount-create" onclick="adminmounts.create()">${t('amnt.createbtn')}</button></div>`, 'modal-wide');
  },

  toggle(id, checked, enabled, disabled) {
    return `<label class="paneladmin-toggle"><input type="checkbox" id="${id}" ${checked ? 'checked' : ''} onchange="adminmounts.togglelabel('${id}', '${enabled}', '${disabled}')" /><span></span><em>${checked ? enabled : disabled}</em></label>`;
  },

  togglelabel(id, enabled, disabled) {
    const input = Utils.el(id);
    const label = input?.closest('.paneladmin-toggle')?.querySelector('em');
    if (label) label.textContent = input.checked ? enabled : disabled;
  },

  async create() {
    const errorbox = Utils.el('adminmounts-form-error');
    const button = Utils.el('adminmount-create');
    const payload = {
      name: Utils.el('adminmount-name')?.value.trim() || '',
      description: Utils.el('adminmount-description')?.value.trim() || null,
      source: Utils.el('adminmount-source')?.value.trim() || '',
      target: Utils.el('adminmount-target')?.value.trim() || '',
      read_only: Utils.el('adminmount-read-only')?.checked || false,
      user_mountable: Utils.el('adminmount-user-mountable')?.checked || false
    };
    if (!payload.name || !payload.source || !payload.target) {
      if (errorbox) errorbox.innerHTML = `<div class="paneladmin-notice error">${t('amnt.err.required')}</div>`;
      return;
    }
    if (button) {
      button.disabled = true;
      button.textContent = t('amnt.creating');
    }
    try {
      const { server, apikey } = await adminpanel.credentials();
      await Api.adminrequest(server.panelUrl, apikey, '/admin/ctrlservers/mounts', 'POST', payload);
      if (App.currentServer !== server) return;
      Modal.close();
      await this.load();
    } catch (error) {
      if (errorbox) errorbox.innerHTML = `<div class="paneladmin-notice error">${this.safe(error.message)}</div>`;
      if (button) {
        button.disabled = false;
        button.textContent = t('amnt.createbtn');
      }
    }
  },

  async save() {
    const message = Utils.el('adminmounts-detail-message');
    const button = Utils.el('adminmount-detail-save');
    const payload = {
      name: Utils.el('adminmount-detail-name')?.value.trim() || '',
      description: Utils.el('adminmount-detail-description')?.value.trim() || null,
      source: Utils.el('adminmount-detail-source')?.value.trim() || '',
      target: Utils.el('adminmount-detail-target')?.value.trim() || '',
      read_only: Utils.el('adminmount-detail-read-only')?.checked || false,
      user_mountable: Utils.el('adminmount-detail-user-mountable')?.checked || false
    };
    if (!payload.name || !payload.source || !payload.target) {
      if (message) message.innerHTML = `<div class="paneladmin-notice error">${t('amnt.err.required')}</div>`;
      return;
    }
    if (button) {
      button.disabled = true;
      button.textContent = t('amnt.saving');
    }
    try {
      const data = await this.request('', 'PATCH', payload);
      this.mount = data.mount;
      this.renderdetail();
      const refreshed = Utils.el('adminmounts-detail-message');
      if (refreshed) refreshed.innerHTML = `<div class="paneladmin-notice success">${t('amnt.saved')}</div>`;
    } catch (error) {
      if (message) message.innerHTML = `<div class="paneladmin-notice error">${this.safe(error.message)}</div>`;
      if (button) {
        button.disabled = false;
        button.textContent = t('amnt.save');
      }
    }
  },

  confirmdelete() {
    Modal.open(t('amnt.delete.title'), `<p class="adminservers-action-warning">${t('amnt.delete.confirm', { name: this.safe(this.mount.name) })}</p><div id="adminmount-delete-error"></div><div class="modal-actions"><button type="button" class="btn btn-secondary" onclick="Modal.close()">${t('cset.cancel')}</button><button type="button" class="btn btn-danger" id="adminmount-delete-confirm" onclick="adminmounts.remove()">${t('amnt.delete.btn')}</button></div>`);
  },

  async remove() {
    const errorbox = Utils.el('adminmount-delete-error');
    const button = Utils.el('adminmount-delete-confirm');
    if (button) button.disabled = true;
    try {
      await this.request('', 'DELETE');
      Modal.close();
      await this.load();
    } catch (error) {
      if (errorbox) errorbox.innerHTML = `<div class="paneladmin-notice error">${this.safe(error.message)}</div>`;
      if (button) button.disabled = false;
    }
  },

  openaddegg() {
    const groups = (this.mount.nest_options || []).map(nest => {
      const eggs = (nest.eggs || []).filter(egg => !egg.assigned);
      return eggs.length ? `<optgroup label="${this.safeattr(nest.name)}">${eggs.map(egg => `<option value="${Number(egg.id)}">${this.safe(egg.name)}</option>`).join('')}</optgroup>` : '';
    }).join('');
    Modal.open(t('amnt.addegg.title'), `<div id="adminmount-relation-error"></div><label class="adminmounts-field"><span>${t('amnt.egg')}</span><select id="adminmount-egg"><option value="">${t('amnt.selectegg')}</option>${groups}</select></label><div class="modal-actions"><button type="button" class="btn btn-secondary" onclick="Modal.close()">${t('cset.cancel')}</button><button type="button" class="btn btn-primary" id="adminmount-relation-add" onclick="adminmounts.addegg()" ${groups ? '' : 'disabled'}>${t('amnt.addegg.btn')}</button></div>`);
  },

  openaddnode() {
    const groups = (this.mount.location_options || []).map(location => {
      const nodes = (location.nodes || []).filter(node => !node.assigned);
      return nodes.length ? `<optgroup label="${this.safeattr(location.name)}">${nodes.map(node => `<option value="${Number(node.id)}">${this.safe(node.name)} (${this.safe(node.fqdn)})</option>`).join('')}</optgroup>` : '';
    }).join('');
    Modal.open(t('amnt.addnode.title'), `<div id="adminmount-relation-error"></div><label class="adminmounts-field"><span>${t('amnt.node')}</span><select id="adminmount-node"><option value="">${t('amnt.selectnode')}</option>${groups}</select></label><div class="modal-actions"><button type="button" class="btn btn-secondary" onclick="Modal.close()">${t('cset.cancel')}</button><button type="button" class="btn btn-primary" id="adminmount-relation-add" onclick="adminmounts.addnode()" ${groups ? '' : 'disabled'}>${t('amnt.addnode.btn')}</button></div>`);
  },

  async addegg() {
    await this.addrelation('eggs', { egg_id: Number(Utils.el('adminmount-egg')?.value || 0) });
  },

  async addnode() {
    await this.addrelation('nodes', { node_id: Number(Utils.el('adminmount-node')?.value || 0) });
  },

  async addrelation(type, payload) {
    const errorbox = Utils.el('adminmount-relation-error');
    const button = Utils.el('adminmount-relation-add');
    if (!Object.values(payload)[0]) {
      if (errorbox) errorbox.innerHTML = `<div class="paneladmin-notice error">${t('amnt.err.select')}</div>`;
      return;
    }
    if (button) button.disabled = true;
    try {
      const data = await this.request('/' + type, 'POST', payload);
      this.mount = data.mount;
      Modal.close();
      this.renderdetail();
    } catch (error) {
      if (errorbox) errorbox.innerHTML = `<div class="paneladmin-notice error">${this.safe(error.message)}</div>`;
      if (button) button.disabled = false;
    }
  },

  async removeegg(id) {
    await this.removerelation('/eggs/' + Number(id));
  },

  async removenode(id) {
    await this.removerelation('/nodes/' + Number(id));
  },

  async removerelation(endpoint) {
    const message = Utils.el('adminmounts-detail-message');
    try {
      const data = await this.request(endpoint, 'DELETE');
      this.mount = data.mount;
      this.renderdetail();
    } catch (error) {
      if (message) message.innerHTML = `<div class="paneladmin-notice error">${this.safe(error.message)}</div>`;
    }
  },

  async request(endpoint, method = 'GET', payload = null) {
    const { server, apikey } = await adminpanel.credentials();
    const data = await Api.adminrequest(server.panelUrl, apikey, '/admin/ctrlservers/mounts/' + Number(this.mount.id) + endpoint, method, payload);
    if (App.currentServer !== server) throw new Error(t('amnt.panelchanged'));
    return data;
  },

  safe(value) {
    return Utils.escape(String(value ?? ''));
  },

  safeattr(value) {
    return this.safe(value).replace(/`/g, '&#96;');
  }
};
