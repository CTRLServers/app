const adminlocations = {
  locations: [],
  pagination: {},
  page: 1,
  perpage: 25,
  search: '',
  searchtimer: null,
  editingid: null,
  deletingid: null,
  panel: null,

  async load(page = 1) {
    const container = Utils.el('tabpanellocations');
    if (!container) return;
    if (this.panel !== App.currentServer) {
      this.panel = App.currentServer;
      this.search = '';
      page = 1;
    }
    this.page = Math.max(1, Number(page) || 1);
    this.renderloading(container);
    try {
      const { server, apikey } = await adminpanel.credentials();
      const query = new URLSearchParams({
        page: String(this.page),
        per_page: String(this.perpage),
        include: 'nodes',
        sort: 'id'
      });
      if (this.search) query.set('filter[short]', this.search);
      const data = await Api.adminrequest(server.panelUrl, apikey, '/api/application/locations?' + query.toString());
      if (App.currentServer !== server) return;
      this.locations = (data.data || []).map(item => ({
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
    container.innerHTML = '<div class="paneladmin-loading"><div class="spinner"></div><span>Loading locations...</span></div>';
  },

  render() {
    const container = Utils.el('tabpanellocations');
    if (!container) return;
    const total = Number(this.pagination.total || this.locations.length);
    container.innerHTML = `
      <div class="paneladmin-page adminlocations-page">
        <div class="paneladmin-heading adminlocations-heading">
          <div>
            <h2>Locations</h2>
            <span class="paneladmin-url">${total} location${total === 1 ? '' : 's'}</span>
          </div>
          <button type="button" class="btn btn-primary" onclick="adminlocations.opencreate()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
            Create location
          </button>
        </div>
        <div class="adminlocations-toolbar">
          <label class="adminlocations-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.7" y2="16.7"/></svg>
            <input type="search" id="adminlocations-search" value="${this.safeattr(this.search)}" placeholder="Search short code" oninput="adminlocations.searchinput(this.value)" />
          </label>
          <button type="button" class="paneladmin-refresh" onclick="adminlocations.load(adminlocations.page)" title="Refresh">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15"/></svg>
          </button>
        </div>
        ${this.locations.length ? this.renderlist() : this.renderempty()}
        ${this.renderpagination()}
      </div>`;
    const search = Utils.el('adminlocations-search');
    if (search) {
      search.focus();
      search.setSelectionRange(search.value.length, search.value.length);
    }
  },

  renderlist() {
    return `<div class="adminlocations-list">${this.locations.map(location => this.rendercard(location)).join('')}</div>`;
  },

  rendercard(location) {
    const id = Number(location.id);
    const nodes = location.relationships?.nodes?.data?.length || 0;
    const disabled = nodes > 0;
    return `
      <div class="adminlocations-card" role="button" tabindex="0" onclick="adminlocations.openedit(${id})" onkeydown="adminlocations.cardkey(event, ${id})">
        <div class="adminlocations-identity">
          <span class="adminlocations-pin">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>
          </span>
          <span>
            <strong>${this.safe(location.short)}</strong>
            <small>${this.safe(location.long || 'No description')}</small>
          </span>
        </div>
        <div class="adminlocations-detail"><small>Nodes</small><strong>${nodes}</strong></div>
        <div class="adminlocations-detail"><small>Created</small><strong>${this.safe(this.formatdate(location.created_at))}</strong></div>
        <div class="adminlocations-actions">
          <button type="button" onclick="event.stopPropagation(); adminlocations.openedit(${id})" title="Edit location">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
          </button>
          <button type="button" class="danger" onclick="event.stopPropagation(); adminlocations.opendelete(${id})" title="${disabled ? 'Move or delete this location nodes first' : 'Delete location'}" ${disabled ? 'disabled' : ''}>
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
      <div class="adminlocations-empty">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>
        <strong>No locations found</strong>
      </div>`;
  },

  renderpagination() {
    const current = Number(this.pagination.current_page || 1);
    const pages = Number(this.pagination.total_pages || 1);
    if (pages <= 1) return '';
    return `
      <div class="adminlocations-pagination">
        <span>Page ${current} of ${pages}</span>
        <div>
          <button type="button" onclick="adminlocations.load(${current - 1})" ${current <= 1 ? 'disabled' : ''} title="Previous page">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <button type="button" onclick="adminlocations.load(${current + 1})" ${current >= pages ? 'disabled' : ''} title="Next page">
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
    Modal.open('Create Location', this.renderform(null));
  },

  openedit(id) {
    const location = this.locations.find(entry => Number(entry.id) === Number(id));
    if (!location) return;
    this.editingid = Number(id);
    Modal.open('Edit Location', this.renderform(location));
  },

  renderform(location) {
    const editing = Boolean(location);
    return `
      <div id="adminlocations-form-error"></div>
      <div class="adminlocations-form">
        <label class="adminlocations-field">
          <span>Short code</span>
          <input type="text" id="adminlocation-short" value="${this.safeattr(location?.short)}" maxlength="60" placeholder="us-east" autocomplete="off" />
        </label>
        <label class="adminlocations-field">
          <span>Description</span>
          <input type="text" id="adminlocation-long" value="${this.safeattr(location?.long)}" maxlength="191" placeholder="Optional" autocomplete="off" />
        </label>
      </div>
      <div class="modal-actions adminlocations-form-actions">
        <button type="button" class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button type="button" class="btn btn-primary" id="adminlocations-form-save" onclick="adminlocations.savelocation()">${editing ? 'Save changes' : 'Create location'}</button>
      </div>`;
  },

  async savelocation() {
    const payload = {
      short: Utils.el('adminlocation-short')?.value.trim() || '',
      long: Utils.el('adminlocation-long')?.value.trim() || null
    };
    const errorbox = Utils.el('adminlocations-form-error');
    const button = Utils.el('adminlocations-form-save');
    if (!payload.short) {
      if (errorbox) errorbox.innerHTML = '<div class="paneladmin-notice error">Enter a short code.</div>';
      return;
    }
    if (button) {
      button.disabled = true;
      button.textContent = this.editingid === null ? 'Creating...' : 'Saving...';
    }
    try {
      const { server, apikey } = await adminpanel.credentials();
      const endpoint = this.editingid === null
        ? '/api/application/locations'
        : '/api/application/locations/' + this.editingid;
      const method = this.editingid === null ? 'POST' : 'PATCH';
      await Api.adminrequest(server.panelUrl, apikey, endpoint, method, payload);
      if (App.currentServer !== server) return;
      Modal.close();
      await this.load(this.page);
    } catch (error) {
      if (errorbox) errorbox.innerHTML = `<div class="paneladmin-notice error">${this.safe(error.message)}</div>`;
      if (button) {
        button.disabled = false;
        button.textContent = this.editingid === null ? 'Create location' : 'Save changes';
      }
    }
  },

  opendelete(id) {
    const location = this.locations.find(entry => Number(entry.id) === Number(id));
    if (!location) return;
    const nodes = location.relationships?.nodes?.data?.length || 0;
    if (nodes > 0) return;
    this.deletingid = Number(id);
    Modal.open('Delete Location', `
      <div id="adminlocations-delete-error"></div>
      <p class="adminlocations-delete-copy">Delete <strong>${this.safe(location.short)}</strong>? This cannot be undone.</p>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button type="button" class="btn btn-danger" id="adminlocations-delete" onclick="adminlocations.deletelocation()">Delete location</button>
      </div>`);
  },

  async deletelocation() {
    if (this.deletingid === null) return;
    const errorbox = Utils.el('adminlocations-delete-error');
    const button = Utils.el('adminlocations-delete');
    if (button) {
      button.disabled = true;
      button.textContent = 'Deleting...';
    }
    try {
      const { server, apikey } = await adminpanel.credentials();
      await Api.adminrequest(server.panelUrl, apikey, '/api/application/locations/' + this.deletingid, 'DELETE');
      if (App.currentServer !== server) return;
      Modal.close();
      const targetpage = this.locations.length === 1 && this.page > 1 ? this.page - 1 : this.page;
      this.deletingid = null;
      await this.load(targetpage);
    } catch (error) {
      if (errorbox) errorbox.innerHTML = `<div class="paneladmin-notice error">${this.safe(error.message)}</div>`;
      if (button) {
        button.disabled = false;
        button.textContent = 'Delete location';
      }
    }
  },

  rendererror(container, error) {
    container.innerHTML = `
      <div class="paneladmin-error-state">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <strong>Unable to load locations</strong>
        <span>${this.safe(error.message)}</span>
        <button type="button" class="btn btn-secondary btn-sm" onclick="adminlocations.load(adminlocations.page)">Retry</button>
      </div>`;
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
