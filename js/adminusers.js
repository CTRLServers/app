const adminusers = {
  users: [],
  pagination: {},
  page: 1,
  perpage: 25,
  search: '',
  searchtimer: null,
  editingid: null,
  deletingid: null,
  panel: null,
  languages: [],

  async load(page = 1) {
    const container = Utils.el('tabpanelusers');
    if (!container) return;
    if (this.panel !== App.currentServer) {
      this.panel = App.currentServer;
      this.search = '';
      this.languages = [];
      page = 1;
    }
    this.page = Math.max(1, Number(page) || 1);
    this.renderloading(container);
    try {
      const { server, apikey } = await adminpanel.credentials();
      const query = new URLSearchParams({
        page: String(this.page),
        per_page: String(this.perpage),
        include: 'servers',
        sort: 'id'
      });
      if (this.search) {
        const filter = this.search.includes('@') ? 'filter[email]' : 'filter[username]';
        query.set(filter, this.search);
      }
      const [data, settings] = await Promise.all([
        Api.adminrequest(server.panelUrl, apikey, '/api/application/users?' + query.toString()),
        this.languages.length
          ? Promise.resolve(null)
          : Api.adminrequest(server.panelUrl, apikey, '/admin/ctrlservers/settings/general').catch(() => null)
      ]);
      if (App.currentServer !== server) return;
      if (settings?.options?.languages) this.languages = settings.options.languages;
      this.users = (data.data || []).map(item => ({
        ...(item.attributes || {}),
        relationships: item.relationships || {}
      }));
      this.pagination = data.meta?.pagination || {};
      this.render();
    } catch (error) {
      this.rendererror(container, error);
    }
  },

  renderloading(container) {
    container.innerHTML = '<div class="paneladmin-loading"><div class="spinner"></div><span>Loading users...</span></div>';
  },

  render() {
    const container = Utils.el('tabpanelusers');
    if (!container) return;
    const total = Number(this.pagination.total || this.users.length);
    container.innerHTML = `
      <div class="paneladmin-page adminusers-page">
        <div class="paneladmin-heading adminusers-heading">
          <div>
            <h2>Users</h2>
            <span class="paneladmin-url">${total} account${total === 1 ? '' : 's'}</span>
          </div>
          <button type="button" class="btn btn-primary" onclick="adminusers.opencreate()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
            Create user
          </button>
        </div>
        <div class="adminusers-toolbar">
          <label class="adminusers-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.7" y2="16.7"/></svg>
            <input type="search" id="adminusers-search" value="${this.safeattr(this.search)}" placeholder="Search username or email" oninput="adminusers.searchinput(this.value)" />
          </label>
          <button type="button" class="paneladmin-refresh" onclick="adminusers.load(adminusers.page)" title="Refresh">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15"/></svg>
          </button>
        </div>
        ${this.users.length ? this.renderlist() : this.renderempty()}
        ${this.renderpagination()}
      </div>`;
    const search = Utils.el('adminusers-search');
    if (search) {
      search.focus();
      search.setSelectionRange(search.value.length, search.value.length);
    }
  },

  renderlist() {
    return `
      <div class="adminusers-list">
        ${this.users.map(user => this.rendercard(user)).join('')}
      </div>`;
  },

  rendercard(user) {
    const servers = user.relationships?.servers?.data?.length || 0;
    const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username;
    const id = Number(user.id);
    return `
      <div class="adminusers-card" role="button" tabindex="0" onclick="adminusers.openedit(${id})" onkeydown="adminusers.cardkey(event, ${id})">
        <div class="adminusers-identity">
          ${this.avatar(user)}
          <span class="adminusers-identity-text">
            <strong>${this.safe(name)}</strong>
            <span>${this.safe(user.email)}</span>
            <small>@${this.safe(user.username)}</small>
          </span>
        </div>
        <div class="adminusers-card-field"><small>Role</small><span class="adminusers-role ${user.root_admin ? 'admin' : ''}">${user.root_admin ? 'Administrator' : 'User'}</span></div>
        <div class="adminusers-card-field"><small>Servers</small><span class="adminusers-count">${servers}</span></div>
        <div class="adminusers-card-field"><small>2FA</small><span class="adminusers-security ${user['2fa'] ? 'enabled' : ''}">${user['2fa'] ? 'Enabled' : 'Disabled'}</span></div>
        <div class="adminusers-card-field"><small>Created</small><span class="adminusers-date">${this.safe(this.formatdate(user.created_at))}</span></div>
        <div class="adminusers-actions">
          <button type="button" onclick="event.stopPropagation(); adminusers.openedit(${id})" title="Edit user">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
          </button>
          <button type="button" class="danger" onclick="event.stopPropagation(); adminusers.opendelete(${id})" title="Delete user">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6m3 0V4h8v2"/></svg>
          </button>
        </div>
      </div>`;
  },

  cardkey(event, id) {
    if (event.target.closest('button')) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    this.openedit(id);
  },

  renderempty() {
    return `
      <div class="adminusers-empty">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9"/></svg>
        <strong>No users found</strong>
      </div>`;
  },

  renderpagination() {
    const current = Number(this.pagination.current_page || 1);
    const pages = Number(this.pagination.total_pages || 1);
    if (pages <= 1) return '';
    return `
      <div class="adminusers-pagination">
        <span>Page ${current} of ${pages}</span>
        <div>
          <button type="button" onclick="adminusers.load(${current - 1})" ${current <= 1 ? 'disabled' : ''} title="Previous page">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <button type="button" onclick="adminusers.load(${current + 1})" ${current >= pages ? 'disabled' : ''} title="Next page">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </div>`;
  },

  searchinput(value) {
    this.search = value.trim();
    clearTimeout(this.searchtimer);
    this.searchtimer = setTimeout(() => this.load(1), 350);
  },

  opencreate() {
    this.editingid = null;
    Modal.open('Create User', this.renderform(null), 'modal-wide');
  },

  openedit(id) {
    const user = this.users.find(entry => Number(entry.id) === Number(id));
    if (!user) return;
    this.editingid = Number(id);
    Modal.open('Edit User', this.renderform(user), 'modal-wide');
  },

  async openremote(id) {
    try {
      const { server, apikey } = await adminpanel.credentials();
      const requests = [Api.adminrequest(server.panelUrl, apikey, '/api/application/users/' + Number(id))];
      if (!this.languages.length) requests.push(Api.adminrequest(server.panelUrl, apikey, '/admin/ctrlservers/settings/general').catch(() => null));
      const [data, settings] = await Promise.all(requests);
      if (App.currentServer !== server) return;
      if (settings?.options?.languages) this.languages = settings.options.languages;
      const item = data.data || data;
      const user = { ...(item.attributes || item), relationships: item.relationships || {} };
      const existing = this.users.findIndex(entry => Number(entry.id) === Number(user.id));
      if (existing >= 0) this.users[existing] = user;
      else this.users.push(user);
      this.editingid = Number(user.id);
      Modal.open('Edit User', this.renderform(user), 'modal-wide');
    } catch (error) {
      Modal.alert('Unable to load user', this.safe(error.message));
    }
  },

  renderform(user) {
    const editing = Boolean(user);
    return `
      <div id="adminusers-form-error"></div>
      <div class="adminusers-form">
        <label class="adminusers-field"><span>Email</span><input type="email" id="adminuser-email" value="${this.safeattr(user?.email)}" autocomplete="off" /></label>
        <label class="adminusers-field"><span>Username</span><input type="text" id="adminuser-username" value="${this.safeattr(user?.username)}" autocomplete="off" /></label>
        <label class="adminusers-field"><span>First name</span><input type="text" id="adminuser-first-name" value="${this.safeattr(user?.first_name)}" autocomplete="off" /></label>
        <label class="adminusers-field"><span>Last name</span><input type="text" id="adminuser-last-name" value="${this.safeattr(user?.last_name)}" autocomplete="off" /></label>
        <label class="adminusers-field"><span>Password</span><input type="password" id="adminuser-password" value="" placeholder="${editing ? 'Unchanged' : 'Optional'}" autocomplete="new-password" /></label>
        <label class="adminusers-field"><span>Language</span><select id="adminuser-language">${this.languageoptions(user?.language || 'en')}</select></label>
        <label class="adminusers-field adminusers-field-wide">
          <span>External ID</span>
          <input type="text" id="adminuser-external-id" value="${this.safeattr(user?.external_id)}" />
          <small class="adminusers-field-note">An optional ID from another system, such as billing or customer software. It lets integrations match this panel user without relying on their email or username.</small>
        </label>
        <div class="adminusers-field adminusers-field-wide">
          <span>Administrator</span>
          <label class="paneladmin-toggle"><input type="checkbox" id="adminuser-root-admin" ${user?.root_admin ? 'checked' : ''} onchange="adminpanel.statustoggle('adminuser-root-admin')" /><span></span><em>${user?.root_admin ? 'Enabled' : 'Disabled'}</em></label>
        </div>
      </div>
      <div class="modal-actions adminusers-form-actions">
        <button type="button" class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button type="button" class="btn btn-primary" id="adminusers-form-save" onclick="adminusers.saveuser()">${editing ? 'Save changes' : 'Create user'}</button>
      </div>`;
  },

  languageoptions(selected) {
    const options = [...this.languages];
    if (!options.some(option => String(option.value) === String(selected))) {
      options.unshift({ value: selected, label: selected });
    }
    if (!options.length) options.push({ value: 'en', label: 'English' });
    return options.map(option => `<option value="${this.safeattr(option.value)}" ${String(option.value) === String(selected) ? 'selected' : ''}>${this.safe(option.label)}</option>`).join('');
  },

  formpayload() {
    const payload = {
      email: Utils.el('adminuser-email')?.value.trim() || '',
      username: Utils.el('adminuser-username')?.value.trim() || '',
      first_name: Utils.el('adminuser-first-name')?.value.trim() || '',
      last_name: Utils.el('adminuser-last-name')?.value.trim() || '',
      language: Utils.el('adminuser-language')?.value.trim() || 'en',
      root_admin: Utils.el('adminuser-root-admin')?.checked || false,
      external_id: Utils.el('adminuser-external-id')?.value.trim() || null
    };
    const password = Utils.el('adminuser-password')?.value || '';
    if (password) payload.password = password;
    return payload;
  },

  async saveuser() {
    const payload = this.formpayload();
    const errorbox = Utils.el('adminusers-form-error');
    const button = Utils.el('adminusers-form-save');
    if (!payload.email || !payload.username || !payload.first_name || !payload.last_name) {
      if (errorbox) errorbox.innerHTML = '<div class="paneladmin-notice error">Complete all required fields.</div>';
      return;
    }
    if (button) {
      button.disabled = true;
      button.textContent = this.editingid === null ? 'Creating...' : 'Saving...';
    }
    try {
      const { server, apikey } = await adminpanel.credentials();
      const endpoint = this.editingid === null
        ? '/api/application/users'
        : '/api/application/users/' + this.editingid;
      const method = this.editingid === null ? 'POST' : 'PATCH';
      await Api.adminrequest(server.panelUrl, apikey, endpoint, method, payload);
      if (App.currentServer !== server) return;
      Modal.close();
      await this.load(this.page);
    } catch (error) {
      if (errorbox) errorbox.innerHTML = `<div class="paneladmin-notice error">${this.safe(error.message)}</div>`;
      if (button) {
        button.disabled = false;
        button.textContent = this.editingid === null ? 'Create user' : 'Save changes';
      }
    }
  },

  opendelete(id) {
    const user = this.users.find(entry => Number(entry.id) === Number(id));
    if (!user) return;
    this.deletingid = Number(id);
    const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username;
    Modal.open('Delete User', `
      <div id="adminusers-delete-error"></div>
      <p class="adminusers-delete-copy">Delete <strong>${this.safe(name)}</strong> from this panel? This cannot be undone.</p>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button type="button" class="btn btn-danger" id="adminusers-delete" onclick="adminusers.deleteuser()">Delete user</button>
      </div>`);
  },

  async deleteuser() {
    if (this.deletingid === null) return;
    const errorbox = Utils.el('adminusers-delete-error');
    const button = Utils.el('adminusers-delete');
    if (button) {
      button.disabled = true;
      button.textContent = 'Deleting...';
    }
    try {
      const { server, apikey } = await adminpanel.credentials();
      await Api.adminrequest(server.panelUrl, apikey, '/api/application/users/' + this.deletingid, 'DELETE');
      if (App.currentServer !== server) return;
      Modal.close();
      const targetpage = this.users.length === 1 && this.page > 1 ? this.page - 1 : this.page;
      this.deletingid = null;
      await this.load(targetpage);
    } catch (error) {
      if (errorbox) errorbox.innerHTML = `<div class="paneladmin-notice error">${this.safe(error.message)}</div>`;
      if (button) {
        button.disabled = false;
        button.textContent = 'Delete user';
      }
    }
  },

  rendererror(container, error) {
    container.innerHTML = `
      <div class="paneladmin-error-state">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <strong>Unable to load users</strong>
        <span>${this.safe(error.message)}</span>
        <button type="button" class="btn btn-secondary btn-sm" onclick="adminusers.load(adminusers.page)">Retry</button>
      </div>`;
  },

  avatar(user) {
    const url = String(user.avatar || '');
    if (!/^https?:\/\//i.test(url)) return '';
    return `<img class="adminusers-avatar" src="${this.safeattr(url)}" alt="" />`;
  },

  formatdate(value) {
    if (!value) return 'Unknown';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown';
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  },

  safe(value) {
    return Utils.escape(String(value ?? ''));
  },

  safeattr(value) {
    return this.safe(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
};
