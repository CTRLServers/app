const adminmounts = {
  mounts: [],
  mount: null,
  targetid: null,

  async load() {
    const container = Utils.el('tabpanelmounts');
    if (!container) return;
    if (this.targetid !== null) {
      const id = this.targetid;
      this.targetid = null;
      await this.openmount(id);
      return;
    }
    container.innerHTML = '<div class="paneladmin-loading"><div class="spinner"></div><span>Loading mounts...</span></div>';
    try {
      const { server, apikey } = await adminpanel.credentials();
      const data = await Api.adminrequest(server.panelUrl, apikey, '/admin/ctrlservers/mounts');
      if (App.currentServer !== server) return;
      this.mounts = data.mounts || [];
      this.mount = null;
      this.render();
    } catch (error) {
      container.innerHTML = `<div class="paneladmin-error-state"><strong>Unable to load mounts</strong><span>${this.safe(error.message)}</span><button type="button" class="btn btn-secondary btn-sm" onclick="adminmounts.load()">Retry</button></div>`;
    }
  },

  render() {
    const container = Utils.el('tabpanelmounts');
    if (!container) return;
    container.innerHTML = `<div class="paneladmin-page adminmounts-page"><div class="paneladmin-heading adminmounts-heading"><div><h2>Mounts</h2><span class="paneladmin-url">${this.mounts.length} mount${this.mounts.length === 1 ? '' : 's'}</span></div><button type="button" class="btn btn-primary" onclick="adminmounts.opencreate()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>Create new</button></div><section class="adminmounts-card"><div class="adminmounts-table-wrap">${this.mounts.length ? `<table class="adminmounts-table"><thead><tr><th>ID</th><th>Name</th><th>Source</th><th>Target</th><th>Eggs</th><th>Nodes</th><th>Servers</th></tr></thead><tbody>${this.mounts.map(mount => this.renderrow(mount)).join('')}</tbody></table>` : '<div class="adminmounts-empty">No mounts have been created.</div>'}</div></section></div>`;
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
    container.innerHTML = '<div class="paneladmin-loading"><div class="spinner"></div><span>Loading mount...</span></div>';
    try {
      const { server, apikey } = await adminpanel.credentials();
      const data = await Api.adminrequest(server.panelUrl, apikey, '/admin/ctrlservers/mounts/' + Number(id));
      if (App.currentServer !== server) return;
      this.mount = data.mount;
      this.renderdetail();
    } catch (error) {
      container.innerHTML = `<div class="paneladmin-error-state"><strong>Unable to load mount</strong><span>${this.safe(error.message)}</span><button type="button" class="btn btn-secondary btn-sm" onclick="adminmounts.openmount(${Number(id)})">Retry</button></div>`;
    }
  },

  renderdetail() {
    const container = Utils.el('tabpanelmounts');
    if (!container || !this.mount) return;
    const eggs = this.mount.egg_list || [];
    const nodes = this.mount.node_list || [];
    container.innerHTML = `<div class="paneladmin-page adminmounts-page"><div class="adminnodes-detail-heading"><button type="button" class="adminnodes-back" onclick="adminmounts.load()" title="Back to mounts"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg></button><div><h2>${this.safe(this.mount.name)}</h2><span>${this.safe(this.mount.uuid)}</span></div></div><div id="adminmounts-detail-message"></div><div class="adminmounts-detail-layout"><section class="adminmounts-detail-card"><h3>Mount Details</h3><div class="adminmounts-form"><label class="adminmounts-field"><span>Name</span><input type="text" id="adminmount-detail-name" value="${this.safeattr(this.mount.name)}" maxlength="64" /></label><label class="adminmounts-field"><span>Unique ID</span><input type="text" value="${this.safeattr(this.mount.uuid)}" readonly /></label><label class="adminmounts-field"><span>Description</span><textarea id="adminmount-detail-description" maxlength="191" rows="4">${this.safe(this.mount.description || '')}</textarea></label><label class="adminmounts-field"><span>Source</span><input type="text" id="adminmount-detail-source" value="${this.safeattr(this.mount.source)}" /></label><label class="adminmounts-field"><span>Target</span><input type="text" id="adminmount-detail-target" value="${this.safeattr(this.mount.target)}" /></label><div class="adminmounts-field"><span>Read Only</span>${this.toggle('adminmount-detail-read-only', this.mount.read_only, 'True', 'False')}</div><div class="adminmounts-field"><span>User Mountable</span>${this.toggle('adminmount-detail-user-mountable', this.mount.user_mountable, 'True', 'False')}</div></div><div class="adminmounts-detail-actions"><button type="button" class="btn btn-danger" onclick="adminmounts.confirmdelete()">Delete</button><button type="button" class="btn btn-primary" id="adminmount-detail-save" onclick="adminmounts.save()">Save changes</button></div></section><aside class="adminmounts-relations"><section class="adminmounts-relation-card"><div class="adminmounts-relation-heading"><h3>Eggs</h3><button type="button" class="btn btn-secondary btn-sm" onclick="adminmounts.openaddegg()">Add eggs</button></div>${eggs.length ? `<div class="adminmounts-relation-list">${eggs.map(egg => `<div><span><small>ID ${Number(egg.id)}</small><strong>${this.safe(egg.name)}</strong><em>${this.safe(egg.nest || '')}</em></span><button type="button" onclick="adminmounts.removeegg(${Number(egg.id)})" title="Remove egg">&times;</button></div>`).join('')}</div>` : '<div class="adminmounts-relation-empty">No eggs assigned.</div>'}</section><section class="adminmounts-relation-card"><div class="adminmounts-relation-heading"><h3>Nodes</h3><button type="button" class="btn btn-secondary btn-sm" onclick="adminmounts.openaddnode()">Add nodes</button></div>${nodes.length ? `<div class="adminmounts-node-head"><span>ID</span><span>Name</span><span>FQDN</span><span></span></div><div class="adminmounts-node-list">${nodes.map(node => `<div><small>${Number(node.id)}</small><strong>${this.safe(node.name)}</strong><code>${this.safe(node.fqdn)}</code><button type="button" onclick="adminmounts.removenode(${Number(node.id)})" title="Remove node">&times;</button></div>`).join('')}</div>` : '<div class="adminmounts-relation-empty">No nodes assigned.</div>'}</section></aside></div></div>`;
  },

  opencreate() {
    Modal.open('Create Mount', `<div id="adminmounts-form-error"></div><div class="adminmounts-form"><label class="adminmounts-field"><span>Name</span><input type="text" id="adminmount-name" maxlength="64" autocomplete="off" /><small>Unique name used to separate this mount from another.</small></label><label class="adminmounts-field"><span>Description</span><textarea id="adminmount-description" maxlength="191" rows="4"></textarea><small>A longer description for this mount, must be less than 191 characters.</small></label><label class="adminmounts-field"><span>Source</span><input type="text" id="adminmount-source" autocomplete="off" /><small>File path on the host system to mount to a container.</small></label><label class="adminmounts-field"><span>Target</span><input type="text" id="adminmount-target" autocomplete="off" /><small>Where the mount will be accessible inside a container.</small></label><div class="adminmounts-field"><span>Read Only</span>${this.toggle('adminmount-read-only', false, 'True', 'False')}<small>Is the mount read only inside the container?</small></div><div class="adminmounts-field"><span>User Mountable</span>${this.toggle('adminmount-user-mountable', false, 'True', 'False')}<small>Should users be able to mount this themselves?</small></div></div><div class="modal-actions"><button type="button" class="btn btn-secondary" onclick="Modal.close()">Cancel</button><button type="button" class="btn btn-primary" id="adminmount-create" onclick="adminmounts.create()">Create</button></div>`, 'modal-wide');
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
      if (errorbox) errorbox.innerHTML = '<div class="paneladmin-notice error">Name, source, and target are required.</div>';
      return;
    }
    if (button) {
      button.disabled = true;
      button.textContent = 'Creating...';
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
        button.textContent = 'Create';
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
      if (message) message.innerHTML = '<div class="paneladmin-notice error">Name, source, and target are required.</div>';
      return;
    }
    if (button) {
      button.disabled = true;
      button.textContent = 'Saving...';
    }
    try {
      const data = await this.request('', 'PATCH', payload);
      this.mount = data.mount;
      this.renderdetail();
      const refreshed = Utils.el('adminmounts-detail-message');
      if (refreshed) refreshed.innerHTML = '<div class="paneladmin-notice success">Mount saved.</div>';
    } catch (error) {
      if (message) message.innerHTML = `<div class="paneladmin-notice error">${this.safe(error.message)}</div>`;
      if (button) {
        button.disabled = false;
        button.textContent = 'Save changes';
      }
    }
  },

  confirmdelete() {
    Modal.open('Delete Mount', `<p class="adminservers-action-warning">Delete <strong>${this.safe(this.mount.name)}</strong>? This action cannot be reversed.</p><div id="adminmount-delete-error"></div><div class="modal-actions"><button type="button" class="btn btn-secondary" onclick="Modal.close()">Cancel</button><button type="button" class="btn btn-danger" id="adminmount-delete-confirm" onclick="adminmounts.remove()">Delete mount</button></div>`);
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
    Modal.open('Add Egg', `<div id="adminmount-relation-error"></div><label class="adminmounts-field"><span>Egg</span><select id="adminmount-egg"><option value="">Select an egg</option>${groups}</select></label><div class="modal-actions"><button type="button" class="btn btn-secondary" onclick="Modal.close()">Cancel</button><button type="button" class="btn btn-primary" id="adminmount-relation-add" onclick="adminmounts.addegg()" ${groups ? '' : 'disabled'}>Add egg</button></div>`);
  },

  openaddnode() {
    const groups = (this.mount.location_options || []).map(location => {
      const nodes = (location.nodes || []).filter(node => !node.assigned);
      return nodes.length ? `<optgroup label="${this.safeattr(location.name)}">${nodes.map(node => `<option value="${Number(node.id)}">${this.safe(node.name)} (${this.safe(node.fqdn)})</option>`).join('')}</optgroup>` : '';
    }).join('');
    Modal.open('Add Node', `<div id="adminmount-relation-error"></div><label class="adminmounts-field"><span>Node</span><select id="adminmount-node"><option value="">Select a node</option>${groups}</select></label><div class="modal-actions"><button type="button" class="btn btn-secondary" onclick="Modal.close()">Cancel</button><button type="button" class="btn btn-primary" id="adminmount-relation-add" onclick="adminmounts.addnode()" ${groups ? '' : 'disabled'}>Add node</button></div>`);
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
      if (errorbox) errorbox.innerHTML = '<div class="paneladmin-notice error">Select an item to add.</div>';
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
    if (App.currentServer !== server) throw new Error('The selected panel changed.');
    return data;
  },

  safe(value) {
    return Utils.escape(String(value ?? ''));
  },

  safeattr(value) {
    return this.safe(value).replace(/`/g, '&#96;');
  }
};
