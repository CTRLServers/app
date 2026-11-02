const adminnodes = {
  nodes: [],
  pagination: {},
  page: 1,
  perpage: 25,
  search: '',
  searchtimer: null,
  statuses: {},
  panel: null,
  node: null,
  information: null,
  locations: [],
  section: 'about',
  configsection: 'file',
  configuration: null,
  deploymentcommand: '',
  allocations: [],
  selectedallocations: [],
  nodeservers: [],
  deletingid: null,
  targetid: null,

  async load(page = 1) {
    const container = Utils.el('tabpanelnodes');
    if (!container) return;
    if (this.targetid !== null) {
      const id = this.targetid;
      this.targetid = null;
      await this.opennode(id);
      return;
    }
    if (this.panel !== App.currentServer) {
      this.panel = App.currentServer;
      this.search = '';
      this.locations = [];
      this.node = null;
      this.configuration = null;
      this.allocations = [];
      this.selectedallocations = [];
      this.nodeservers = [];
      page = 1;
    }
    this.page = Math.max(1, Number(page) || 1);
    this.renderloading(container);
    try {
      const { server, apikey } = await adminpanel.credentials();
      const query = new URLSearchParams({
        page: String(this.page),
        per_page: String(this.perpage),
        include: 'location,servers',
        sort: 'id'
      });
      if (this.search) query.set('filter[name]', this.search);
      const data = await Api.adminrequest(server.panelUrl, apikey, '/api/application/nodes?' + query.toString());
      if (App.currentServer !== server) return;
      this.nodes = (data.data || []).map(item => ({
        ...(item.attributes || {}),
        relationships: item.relationships || {}
      }));
      this.pagination = data.meta?.pagination || {};
      this.statuses = {};
      this.render();
      await this.loadstatuses(server, apikey);
    } catch (error) {
      this.rendererror(container, error);
    }
  },

  renderloading(container) {
    container.innerHTML = `<div class="paneladmin-loading"><div class="spinner"></div><span>${t('anode.loading.nodes')}</span></div>`;
  },

  count(base, value) {
    const n = Number(value || 0);
    const key = n % 10 === 1 && n % 100 !== 11
      ? base + '.one'
      : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)
        ? base + '.few'
        : base + '.many';
    return t(key, { count: n });
  },

  render() {
    const container = Utils.el('tabpanelnodes');
    if (!container) return;
    const total = Number(this.pagination.total || this.nodes.length);
    container.innerHTML = `
      <div class="paneladmin-page adminnodes-page">
        <div class="paneladmin-heading adminnodes-heading">
          <div>
            <h2>${t('anode.title')}</h2>
            <span class="paneladmin-url">${this.count('anode.count', total)}</span>
          </div>
          <button type="button" class="btn btn-primary" onclick="adminnodes.opencreate()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 8v8M8 12h8"/></svg>
            ${t('anode.create')}
          </button>
        </div>
        <div class="adminnodes-toolbar">
          <label class="adminnodes-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.7" y2="16.7"/></svg>
            <input type="search" id="adminnodes-search" value="${this.safeattr(this.search)}" placeholder="${t('anode.search')}" oninput="adminnodes.searchinput(this.value)" />
          </label>
          <button type="button" class="paneladmin-refresh" onclick="adminnodes.load(adminnodes.page)" title="${t('aloc.refresh')}">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15"/></svg>
          </button>
        </div>
        ${this.nodes.length ? this.renderlist() : this.renderempty()}
        ${this.renderpagination()}
      </div>`;
    const search = Utils.el('adminnodes-search');
    if (search) {
      search.focus();
      search.setSelectionRange(search.value.length, search.value.length);
    }
  },

  renderlist() {
    return `
      <div class="adminnodes-list">
        <div class="adminnodes-list-heading" aria-hidden="true">
          <span>${t('anode.h.status')}</span>
          <span>${t('anode.h.name')}</span>
          <span>${t('anode.h.location')}</span>
          <span>${t('anode.h.memory')}</span>
          <span>${t('anode.h.disk')}</span>
          <span>${t('anode.h.servers')}</span>
          <span>${t('anode.h.ssl')}</span>
          <span>${t('anode.h.visibility')}</span>
        </div>
        ${this.nodes.map(node => this.renderrow(node)).join('')}
      </div>`;
  },

  renderrow(node) {
    const id = Number(node.id);
    const location = node.relationships?.location?.attributes || node.relationships?.location?.data?.attributes || {};
    const servers = this.listservercount(node);
    const ssl = String(node.scheme || '').toLowerCase() === 'https';
    return `
      <div class="adminnodes-row" role="button" tabindex="0" onclick="adminnodes.opennode(${id})" onkeydown="adminnodes.nodekey(event, ${id})">
        <span class="adminnodes-status" id="adminnode-status-${id}">${this.renderstatus(this.statuses[id])}</span>
        <span class="adminnodes-name"><span><strong>${this.safe(node.name || t('anode.unnamed'))}</strong>${node.maintenance_mode ? `<em class="adminnodes-maintenance-badge">${t('anode.maintenance')}</em>` : ''}</span><small>${this.safe(node.fqdn || '')}</small></span>
        <span class="adminnodes-value"><small>${t('anode.h.location')}</small><strong>${this.safe(location.short || location.long || ('#' + Number(node.location_id || 0)))}</strong></span>
        <span class="adminnodes-value"><small>${t('anode.h.memory')}</small><strong>${this.formatcapacity(node.memory)}</strong></span>
        <span class="adminnodes-value"><small>${t('anode.h.disk')}</small><strong>${this.formatcapacity(node.disk)}</strong></span>
        <span class="adminnodes-value"><small>${t('anode.h.servers')}</small><strong id="adminnode-servers-${id}">${servers}</strong></span>
        <span class="adminnodes-security ${ssl ? 'secure' : 'insecure'}" aria-label="${ssl ? t('anode.ssl.enabled') : t('anode.ssl.disabled')}">
          ${ssl
            ? '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'
            : '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>'}
        </span>
        <span class="adminnodes-visibility ${node.public ? 'public' : 'private'}">${node.public ? t('anode.public') : t('anode.private')}</span>
      </div>`;
  },

  renderstatus(status) {
    if (status === true) {
      return `<span class="adminnodes-heart online" aria-label="${t('anode.online')}"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg></span>`;
    }
    if (status === false) {
      return `<span class="adminnodes-heart offline" aria-label="${t('anode.offline')}"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg></span>`;
    }
    return '';
  },

  async loadstatuses(server, apikey) {
    await Promise.all(this.nodes.map(async node => {
      const id = Number(node.id);
      try {
        const data = await Api.adminrequest(server.panelUrl, apikey, '/admin/ctrlservers/nodes/' + id + '/status');
        this.statuses[id] = data.online === true;
        if (Number.isFinite(Number(data.server_count))) {
          node.server_count = Number(data.server_count);
        }
      } catch (error) {
        this.statuses[id] = null;
      }
      if (App.currentServer !== server) return;
      const status = Utils.el('adminnode-status-' + id);
      if (status) status.innerHTML = this.renderstatus(this.statuses[id]);
      const servercount = Utils.el('adminnode-servers-' + id);
      if (servercount) servercount.textContent = String(this.listservercount(node));
    }));
  },

  renderempty() {
    return `
      <div class="adminnodes-empty">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="6" rx="1"/><rect x="4" y="14" width="16" height="6" rx="1"/><path d="M8 7h.01M8 17h.01"/></svg>
        <strong>${t('anode.empty')}</strong>
      </div>`;
  },

  renderpagination() {
    const current = Number(this.pagination.current_page || 1);
    const pages = Number(this.pagination.total_pages || 1);
    if (pages <= 1) return '';
    return `
      <div class="adminnodes-pagination">
        <span>${t('aloc.page', { current, pages })}</span>
        <div>
          <button type="button" onclick="adminnodes.load(${current - 1})" ${current <= 1 ? 'disabled' : ''} title="${t('aloc.prevpage')}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg></button>
          <button type="button" onclick="adminnodes.load(${current + 1})" ${current >= pages ? 'disabled' : ''} title="${t('aloc.nextpage')}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></button>
        </div>
      </div>`;
  },

  searchinput(value) {
    this.search = value.trim();
    clearTimeout(this.searchtimer);
    this.searchtimer = setTimeout(() => this.load(1), 350);
  },

  nodekey(event, id) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    this.opennode(id);
  },

  openfromlink(id) {
    this.targetid = Number(id);
    App.switchserverpage('panelnodes');
  },

  async opencreate() {
    const container = Utils.el('tabpanelnodes');
    if (!container) return;
    container.innerHTML = `<div class="paneladmin-loading"><div class="spinner"></div><span>${t('anode.loading.form')}</span></div>`;
    try {
      if (!this.locations.length) {
        const { server, apikey } = await adminpanel.credentials();
        const data = await Api.adminrequest(server.panelUrl, apikey, '/api/application/locations?per_page=100&sort=id');
        if (App.currentServer !== server) return;
        this.locations = (data.data || []).map(item => item.attributes || item);
      }
      this.rendercreate();
    } catch (error) {
      container.innerHTML = `<div class="paneladmin-error-state"><strong>${t('anode.err.form')}</strong><span>${this.safe(error.message)}</span><button type="button" class="btn btn-secondary btn-sm" onclick="adminnodes.opencreate()">${t('cset.banner.retry')}</button></div>`;
    }
  },

  rendercreate() {
    const container = Utils.el('tabpanelnodes');
    if (!container) return;
    container.innerHTML = `
      <div class="paneladmin-page adminnodes-page">
        <div class="adminnodes-detail-heading">
          <button type="button" class="adminnodes-back" onclick="adminnodes.load(adminnodes.page)" title="${t('anode.back.nodes')}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg></button>
          <div><h2>${t('anode.new.title')}</h2><span>${t('anode.new.subtitle')}</span></div>
        </div>
        <div id="adminnodes-create-message"></div>
        <div class="adminnodes-create-layout">
          <section class="adminnodes-settings-section">
            <h3>${t('anode.basic')}</h3>
            <div class="adminnodes-create-fields">
              ${this.textfield('adminnode-create-name', t('anode.name'), '', 'text', true)}
              <label class="adminnodes-field adminnodes-field-wide"><span>${t('anode.description')}</span><textarea id="adminnode-create-description" rows="5"></textarea></label>
              <label class="adminnodes-field adminnodes-field-wide"><span>${t('anode.location')}</span><select id="adminnode-create-location">${this.createlocationoptions()}</select></label>
              <div class="adminnodes-field adminnodes-field-wide"><span>${t('anode.visibility')}</span>${this.toggle('adminnode-create-public', true, t('anode.public'), t('anode.private'))}</div>
              ${this.textfield('adminnode-create-fqdn', t('anode.fqdn'), '', 'text', true)}
              <label class="adminnodes-field"><span>${t('anode.ssl.title')}</span><select id="adminnode-create-scheme"><option value="https">${t('anode.ssl.use')}</option><option value="http">${t('anode.http.use')}</option></select></label>
              <div class="adminnodes-field"><span>${t('anode.proxy')}</span>${this.toggle('adminnode-create-proxy', false, t('anode.proxy.behind'), t('anode.proxy.notbehind'))}</div>
            </div>
          </section>
          <section class="adminnodes-settings-section">
            <h3>${t('anode.configuration')}</h3>
            <div class="adminnodes-create-fields adminnodes-create-configuration">
              ${this.textfield('adminnode-create-base', t('anode.base'), '/var/lib/pterodactyl/volumes', 'text', true)}
              ${this.numberfield('adminnode-create-memory', t('anode.totalmemory'), '', 'MiB')}
              ${this.numberfield('adminnode-create-memory-overallocate', t('anode.memoryover'), 0, '%')}
              ${this.numberfield('adminnode-create-disk', t('anode.totaldisk'), '', 'MiB')}
              ${this.numberfield('adminnode-create-disk-overallocate', t('anode.diskover'), 0, '%')}
              ${this.numberfield('adminnode-create-daemon-port', t('anode.daemonport'), 8080, '')}
              ${this.numberfield('adminnode-create-sftp-port', t('anode.sftpport'), 2022, '')}
            </div>
            <div class="adminnodes-create-actions"><button type="button" class="btn btn-primary" id="adminnode-create-submit" onclick="adminnodes.createnode()">${t('anode.createbtn')}</button></div>
          </section>
        </div>
      </div>`;
  },

  createlocationoptions() {
    return this.locations.map(location => `<option value="${Number(location.id)}">${this.safe(location.long || location.short)} (${this.safe(location.short)})</option>`).join('');
  },

  async createnode() {
    const message = Utils.el('adminnodes-create-message');
    const button = Utils.el('adminnode-create-submit');
    const payload = {
      name: Utils.el('adminnode-create-name')?.value.trim() || '',
      description: Utils.el('adminnode-create-description')?.value.trim() || null,
      location_id: Number(Utils.el('adminnode-create-location')?.value || 0),
      public: Boolean(Utils.el('adminnode-create-public')?.checked),
      fqdn: Utils.el('adminnode-create-fqdn')?.value.trim() || '',
      scheme: Utils.el('adminnode-create-scheme')?.value || 'https',
      behind_proxy: Boolean(Utils.el('adminnode-create-proxy')?.checked),
      memory: Number(Utils.el('adminnode-create-memory')?.value || 0),
      memory_overallocate: Number(Utils.el('adminnode-create-memory-overallocate')?.value || 0),
      disk: Number(Utils.el('adminnode-create-disk')?.value || 0),
      disk_overallocate: Number(Utils.el('adminnode-create-disk-overallocate')?.value || 0),
      daemon_base: Utils.el('adminnode-create-base')?.value.trim() || '/var/lib/pterodactyl/volumes',
      daemon_listen: Number(Utils.el('adminnode-create-daemon-port')?.value || 0),
      daemon_sftp: Number(Utils.el('adminnode-create-sftp-port')?.value || 0)
    };
    if (!payload.name || !payload.location_id || !payload.fqdn || payload.memory < 1 || payload.disk < 1 || payload.daemon_listen < 1 || payload.daemon_sftp < 1) {
      if (message) message.innerHTML = `<div class="paneladmin-notice error">${t('anode.err.required')}</div>`;
      return;
    }
    if (button) { button.disabled = true; button.textContent = t('aloc.creating'); }
    try {
      const { server, apikey } = await adminpanel.credentials();
      const data = await Api.adminrequest(server.panelUrl, apikey, '/api/application/nodes', 'POST', payload);
      if (App.currentServer !== server) return;
      const item = data.data || data;
      this.node = { ...(item.attributes || item), relationships: item.relationships || {} };
      this.information = null;
      this.configuration = null;
      this.allocations = [];
      this.selectedallocations = [];
      this.nodeservers = [];
      this.section = 'allocation';
      this.renderdetail();
      const detailmessage = Utils.el('adminnodes-detail-message');
      if (detailmessage) detailmessage.innerHTML = `<div class="paneladmin-notice success">${t('anode.created')}</div>`;
    } catch (error) {
      if (message) message.innerHTML = `<div class="paneladmin-notice error">${this.safe(error.message)}</div>`;
      if (button) { button.disabled = false; button.textContent = t('anode.createbtn'); }
    }
  },

  async opennode(id) {
    const container = Utils.el('tabpanelnodes');
    if (!container) return;
    this.renderloading(container);
    try {
      const { server, apikey } = await adminpanel.credentials();
      const [nodedata, information] = await Promise.all([
        Api.adminrequest(server.panelUrl, apikey, `/api/application/nodes/${Number(id)}?include=location,servers`),
        Api.adminrequest(server.panelUrl, apikey, `/admin/ctrlservers/nodes/${Number(id)}/information`).catch(() => null)
      ]);
      if (App.currentServer !== server) return;
      const item = nodedata.data || nodedata;
      this.node = {
        ...(item.attributes || item),
        relationships: item.relationships || {}
      };
      this.information = information;
      this.section = 'about';
      this.configsection = 'file';
      this.configuration = null;
      this.allocations = [];
      this.selectedallocations = [];
      this.nodeservers = [];
      this.renderdetail();
    } catch (error) {
      this.renderdetailerror(container, error, id);
    }
  },

  renderdetail() {
    const container = Utils.el('tabpanelnodes');
    if (!container || !this.node) return;
    container.innerHTML = `
      <div class="paneladmin-page adminnodes-page">
        <div class="adminnodes-detail-heading">
          <button type="button" class="adminnodes-back" onclick="adminnodes.load(adminnodes.page)" title="${t('anode.back.nodes')}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg></button>
          <div><h2>${this.safe(this.node.name)}</h2><span>${this.safe(this.node.fqdn || '')}</span></div>
        </div>
        <div class="adminnodes-subtabs">
          <button type="button" data-adminnodes-section="about" onclick="adminnodes.switchsection('about')">${t('anode.tab.about')}</button>
          <button type="button" data-adminnodes-section="settings" onclick="adminnodes.switchsection('settings')">${t('anode.tab.settings')}</button>
          <button type="button" data-adminnodes-section="configuration" onclick="adminnodes.switchsection('configuration')">${t('anode.tab.configuration')}</button>
          <button type="button" data-adminnodes-section="allocation" onclick="adminnodes.switchsection('allocation')">${t('anode.tab.allocation')}</button>
          <button type="button" data-adminnodes-section="servers" onclick="adminnodes.switchsection('servers')">${t('anode.tab.servers')}</button>
        </div>
        <div id="adminnodes-detail-message"></div>
        <div id="adminnodes-detail-body"></div>
      </div>`;
    this.marksection();
    if (this.section === 'settings') this.opensettings();
    else if (this.section === 'configuration') this.openconfiguration();
    else if (this.section === 'allocation') this.openallocations();
    else if (this.section === 'servers') this.opennodeservers();
    else this.renderabout();
  },

  marksection() {
    document.querySelectorAll('[data-adminnodes-section]').forEach(button => {
      button.classList.toggle('active', button.getAttribute('data-adminnodes-section') === this.section);
    });
  },

  switchsection(section) {
    if (!this.node || !['about', 'settings', 'configuration', 'allocation', 'servers'].includes(section)) return;
    this.section = section;
    this.marksection();
    const message = Utils.el('adminnodes-detail-message');
    if (message) message.innerHTML = '';
    if (section === 'settings') this.opensettings();
    else if (section === 'configuration') this.openconfiguration();
    else if (section === 'allocation') this.openallocations();
    else if (section === 'servers') this.opennodeservers();
    else this.renderabout();
  },

  async openallocations() {
    const body = Utils.el('adminnodes-detail-body');
    if (!body || !this.node) return;
    body.innerHTML = `<div class="paneladmin-loading adminnodes-section-loading"><div class="spinner"></div><span>${t('anode.loading.alloc')}</span></div>`;
    try {
      const { server, apikey } = await adminpanel.credentials();
      const data = await Api.adminrequest(server.panelUrl, apikey, `/admin/ctrlservers/nodes/${Number(this.node.id)}/allocations`);
      if (App.currentServer !== server || this.section !== 'allocation') return;
      this.allocations = data.allocations || [];
      this.selectedallocations = [];
      this.renderallocations();
    } catch (error) {
      body.innerHTML = `<div class="paneladmin-error-state"><strong>${t('anode.err.alloc')}</strong><span>${this.safe(error.message)}</span><button type="button" class="btn btn-secondary btn-sm" onclick="adminnodes.openallocations()">${t('cset.banner.retry')}</button></div>`;
    }
  },

  renderallocations() {
    const body = Utils.el('adminnodes-detail-body');
    if (!body) return;
    const ips = [...new Set(this.allocations.map(allocation => allocation.ip))];
    body.innerHTML = `
      <div class="adminnodes-allocation-layout">
        <section class="adminnodes-resource-card">
          <div class="adminnodes-resource-heading">
            <div><h3>${t('anode.alloc.title')}</h3><span>${this.count('anode.alloc.count', this.allocations.length)}</span></div>
            <div class="adminnodes-allocation-actions">
              <button type="button" class="btn btn-danger btn-sm" id="adminnode-delete-selected" onclick="adminnodes.confirmallocationdelete()" disabled>${t('anode.alloc.delete_selected')}</button>
            </div>
          </div>
          <div class="adminnodes-ip-action">
            <select id="adminnode-delete-ip" ${ips.length ? '' : 'disabled'}>${ips.map(ip => `<option value="${this.safeattr(ip)}">${this.safe(ip)}</option>`).join('')}</select>
            <button type="button" class="adminnodes-minus" onclick="adminnodes.confirmipdelete()" title="${t('anode.alloc.ipblock.title')}" ${ips.length ? '' : 'disabled'}>&minus;</button>
            <span>${t('anode.alloc.deleteip')}</span>
          </div>
          ${this.allocations.length ? `
            <div class="adminnodes-table-wrap">
              <table class="adminnodes-table">
                <thead><tr><th><input type="checkbox" id="adminnode-allocation-all" onchange="adminnodes.toggleallallocations(this.checked)" aria-label="${t('anode.alloc.selectall')}" /></th><th>${t('anode.alloc.h.ip')}</th><th>${t('anode.alloc.h.alias')}</th><th>${t('anode.alloc.h.port')}</th><th>${t('anode.alloc.h.assigned')}</th></tr></thead>
                <tbody>${this.allocations.map(allocation => this.renderallocationrow(allocation)).join('')}</tbody>
              </table>
            </div>` : `<div class="adminnodes-table-empty">${t('anode.alloc.empty')}</div>`}
        </section>
        <section class="adminnodes-resource-card">
          <div class="adminnodes-resource-heading"><div><h3>${t('anode.alloc.assign')}</h3><span>${t('anode.alloc.assign.note')}</span></div></div>
          <div class="adminnodes-allocation-form">
            <label class="adminnodes-field"><span>${t('anode.alloc.h.ip')}</span><input type="text" id="adminnode-allocation-ip" autocomplete="off" /></label>
            <label class="adminnodes-field"><span>${t('anode.alloc.h.alias')}</span><input type="text" id="adminnode-allocation-alias" autocomplete="off" /></label>
            <label class="adminnodes-field adminnodes-field-wide"><span>${t('anode.alloc.ports')}</span><textarea id="adminnode-allocation-ports" rows="5" placeholder="${t('anode.alloc.ports.placeholder')}"></textarea><small>${t('anode.alloc.ports.note')}</small></label>
          </div>
          <div class="adminnodes-card-actions"><button type="button" class="btn btn-primary" id="adminnode-create-allocations" onclick="adminnodes.createallocations()">${t('anode.alloc.submit')}</button></div>
        </section>
      </div>`;
  },

  renderallocationrow(allocation) {
    const assigned = allocation.server?.name || t('anode.alloc.unassigned');
    return `<tr class="${allocation.assigned ? 'adminnodes-allocation-assigned' : ''}"><td><input type="checkbox" data-adminnode-allocation value="${Number(allocation.id)}" onchange="adminnodes.toggleallocation(${Number(allocation.id)}, this.checked)" aria-label="${t('anode.alloc.select', { target: `${this.safeattr(allocation.ip)}:${Number(allocation.port)}` })}" ${allocation.assigned ? 'disabled' : ''} /></td><td>${this.safe(allocation.ip)}</td><td>${this.safe(allocation.alias || '-')}</td><td>${Number(allocation.port)}</td><td>${this.safe(assigned)}</td></tr>`;
  },

  toggleallocation(id, checked) {
    const allocationid = Number(id);
    this.selectedallocations = checked
      ? [...new Set([...this.selectedallocations, allocationid])]
      : this.selectedallocations.filter(value => value !== allocationid);
    this.updateallocationactions();
  },

  toggleallallocations(checked) {
    this.selectedallocations = checked ? this.allocations.filter(allocation => !allocation.assigned).map(allocation => Number(allocation.id)) : [];
    document.querySelectorAll('[data-adminnode-allocation]:not(:disabled)').forEach(input => { input.checked = checked; });
    this.updateallocationactions();
  },

  updateallocationactions() {
    const button = Utils.el('adminnode-delete-selected');
    if (button) {
      button.disabled = this.selectedallocations.length === 0;
      button.textContent = this.selectedallocations.length > 1 ? this.count('anode.alloc.delete_n', this.selectedallocations.length) : t('anode.alloc.delete_selected');
    }
    const all = Utils.el('adminnode-allocation-all');
    if (all) {
      const available = this.allocations.filter(allocation => !allocation.assigned).length;
      all.disabled = available === 0;
      all.checked = available > 0 && this.selectedallocations.length === available;
      all.indeterminate = this.selectedallocations.length > 0 && this.selectedallocations.length < available;
    }
  },

  confirmallocationdelete() {
    if (!this.selectedallocations.length) return;
    const count = this.selectedallocations.length;
    Modal.open(t('anode.alloc.delete.title'), `<div id="adminnode-allocation-delete-error"></div><p class="adminnodes-delete-copy">${this.count('anode.alloc.delete.confirm', count)}</p><div class="modal-actions"><button type="button" class="btn btn-secondary" onclick="Modal.close()">${t('cset.cancel')}</button><button type="button" class="btn btn-danger" id="adminnode-allocation-delete" onclick="adminnodes.deleteallocations()">${t('anode.alloc.delete.btn')}</button></div>`);
  },

  confirmipdelete() {
    const ip = Utils.el('adminnode-delete-ip')?.value || '';
    if (!ip) return;
    this.selectedallocations = this.allocations.filter(allocation => allocation.ip === ip && !allocation.assigned).map(allocation => Number(allocation.id));
    if (!this.selectedallocations.length) {
      const message = Utils.el('adminnodes-detail-message');
      if (message) message.innerHTML = `<div class="paneladmin-notice error">${t('anode.alloc.ipdelete.err')}</div>`;
      return;
    }
    Modal.open(t('anode.alloc.ipdelete.title'), `<div id="adminnode-allocation-delete-error"></div><p class="adminnodes-delete-copy">${t('anode.alloc.ipdelete.confirm', { ip: this.safe(ip) })}</p><div class="modal-actions"><button type="button" class="btn btn-secondary" onclick="Modal.close()">${t('cset.cancel')}</button><button type="button" class="btn btn-danger" id="adminnode-allocation-delete" onclick="adminnodes.deleteallocations()">${t('anode.alloc.ipdelete.btn')}</button></div>`);
  },

  async deleteallocations() {
    if (!this.node || !this.selectedallocations.length) return;
    const button = Utils.el('adminnode-allocation-delete');
    const errorbox = Utils.el('adminnode-allocation-delete-error');
    if (button) { button.disabled = true; button.textContent = t('aloc.deleting'); }
    try {
      const { server, apikey } = await adminpanel.credentials();
      for (const id of this.selectedallocations) {
        await Api.adminrequest(server.panelUrl, apikey, `/api/application/nodes/${Number(this.node.id)}/allocations/${id}`, 'DELETE');
      }
      if (App.currentServer !== server) return;
      Modal.close();
      await this.openallocations();
    } catch (error) {
      if (errorbox) errorbox.innerHTML = `<div class="paneladmin-notice error">${this.safe(error.message)}</div>`;
      if (button) { button.disabled = false; button.textContent = t('anode.alloc.delete.btn'); }
    }
  },

  parseports(value) {
    const ports = new Set();
    const parts = String(value || '').split(',').map(part => part.trim()).filter(Boolean);
    if (!parts.length) throw new Error(t('anode.err.port.empty'));
    for (const part of parts) {
      const range = part.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
      if (!range) throw new Error(t('anode.err.port.invalid', { value: part }));
      const start = Number(range[1]);
      const end = Number(range[2] || range[1]);
      if (start < 1025 || end > 65535 || end < start) throw new Error(t('anode.err.port.range'));
      if (end - start + 1 + ports.size > 1000) throw new Error(t('anode.err.port.limit'));
      for (let port = start; port <= end; port++) ports.add(port);
      if (ports.size > 1000) throw new Error(t('anode.err.port.limit'));
    }
    return [...ports].map(port => String(port));
  },

  async createallocations() {
    if (!this.node) return;
    const message = Utils.el('adminnodes-detail-message');
    const button = Utils.el('adminnode-create-allocations');
    const ip = Utils.el('adminnode-allocation-ip')?.value.trim() || '';
    const alias = Utils.el('adminnode-allocation-alias')?.value.trim() || null;
    let ports;
    try {
      if (!ip) throw new Error(t('anode.err.ip.required'));
      ports = this.parseports(Utils.el('adminnode-allocation-ports')?.value);
    } catch (error) {
      if (message) message.innerHTML = `<div class="paneladmin-notice error">${this.safe(error.message)}</div>`;
      return;
    }
    if (button) { button.disabled = true; button.textContent = t('anode.alloc.assigning'); }
    try {
      const { server, apikey } = await adminpanel.credentials();
      await Api.adminrequest(server.panelUrl, apikey, `/api/application/nodes/${Number(this.node.id)}/allocations`, 'POST', { ip, alias, ports });
      if (App.currentServer !== server) return;
      if (message) message.innerHTML = `<div class="paneladmin-notice success">${t('anode.alloc.assigned')}</div>`;
      await this.openallocations();
    } catch (error) {
      if (message) message.innerHTML = `<div class="paneladmin-notice error">${this.safe(error.message)}</div>`;
      if (button) { button.disabled = false; button.textContent = t('anode.alloc.submit'); }
    }
  },

  async opennodeservers() {
    const body = Utils.el('adminnodes-detail-body');
    if (!body || !this.node) return;
    body.innerHTML = `<div class="paneladmin-loading adminnodes-section-loading"><div class="spinner"></div><span>${t('anode.loading.servers')}</span></div>`;
    try {
      const { server, apikey } = await adminpanel.credentials();
      const data = await Api.adminrequest(server.panelUrl, apikey, `/admin/ctrlservers/nodes/${Number(this.node.id)}/servers`);
      if (App.currentServer !== server || this.section !== 'servers') return;
      this.nodeservers = data.servers || [];
      this.rendernodeservers();
    } catch (error) {
      body.innerHTML = `<div class="paneladmin-error-state"><strong>${t('anode.err.servers')}</strong><span>${this.safe(error.message)}</span><button type="button" class="btn btn-secondary btn-sm" onclick="adminnodes.opennodeservers()">${t('cset.banner.retry')}</button></div>`;
    }
  },

  rendernodeservers() {
    const body = Utils.el('adminnodes-detail-body');
    if (!body) return;
    body.innerHTML = `
      <section class="adminnodes-resource-card">
        <div class="adminnodes-resource-heading"><div><h3>${t('anode.servers.title')}</h3><span>${this.count('anode.servers.count', this.nodeservers.length)}</span></div></div>
        ${this.nodeservers.length ? `<div class="adminnodes-table-wrap"><table class="adminnodes-table adminnodes-server-table"><thead><tr><th>${t('anode.servers.h.id')}</th><th>${t('anode.servers.h.name')}</th><th>${t('anode.servers.h.owner')}</th><th>${t('anode.servers.h.service')}</th></tr></thead><tbody>${this.nodeservers.map(server => `<tr><td>${Number(server.id)}</td><td><button type="button" class="adminnodes-table-link" onclick="adminnodes.openserver(${Number(server.id)})">${this.safe(server.name)}</button></td><td>${server.owner ? `<button type="button" class="adminnodes-table-link" onclick="adminnodes.openowner(${Number(server.owner.id)})">${this.safe([server.owner.first_name, server.owner.last_name].filter(Boolean).join(' ') || server.owner.username)}</button>` : '-'}</td><td>${this.safe(server.service || '-')}</td></tr>`).join('')}</tbody></table></div>` : `<div class="adminnodes-table-empty">${t('anode.servers.empty')}</div>`}
      </section>`;
  },

  openserver(id) {
    const server = this.nodeservers.find(entry => Number(entry.id) === Number(id));
    if (!server) return;
    adminservers.openfromlink(server.id);
  },

  async openowner(id) {
    await adminusers.openremote(id);
  },

  renderabout() {
    const body = Utils.el('adminnodes-detail-body');
    if (!body || !this.node) return;
    const information = this.information || {};
    const system = information.online === true
      ? `${this.safe(information.os || t('aapi.unknown'))} (${this.safe(information.architecture || t('aapi.unknown'))}) ${this.safe(information.kernel_version || '')}`
      : t('cset.unavailable');
    const servers = this.servercount();
    const allocated = this.node.allocated_resources || {};
    body.innerHTML = `
      ${this.node.maintenance_mode ? `<div class="adminnodes-maintenance-banner"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5-5L7.6 3.4l3 3 2.1-2.1a4 4 0 0 0 2 5l-8.8 8.8a2.1 2.1 0 0 0 3 3l8.8-8.8a4 4 0 0 0 5-5l-2.1 2.1-3-3 2.1-2.1z"/></svg><strong>${t('anode.maint.banner')}</strong></div>` : ''}
      <div class="adminnodes-about-layout">
        <div class="adminnodes-about-main">
          <section class="adminnodes-detail-section">
            <h3>${t('anode.about.info')}</h3>
            <dl class="adminnodes-information-list">
              <div><dt>${t('anode.about.daemon')}</dt><dd>${this.safe(information.version || t('cset.unavailable'))}</dd></div>
              <div><dt>${t('anode.about.system')}</dt><dd>${system}</dd></div>
              <div><dt>${t('anode.about.threads')}</dt><dd>${information.cpu_count == null ? t('cset.unavailable') : Number(information.cpu_count)}</dd></div>
            </dl>
          </section>
          ${this.node.description ? `<section class="adminnodes-detail-section"><h3>${t('anode.about.description')}</h3><p class="adminnodes-description">${this.safe(this.node.description)}</p></section>` : ''}
          <section class="adminnodes-delete-section">
            <div><h3>${t('anode.delete.title')}</h3><p>${t('anode.delete.text')}</p></div>
            <button type="button" class="btn btn-danger" onclick="adminnodes.confirmdelete()" ${servers > 0 ? 'disabled' : ''}>${t('anode.delete.btn')}</button>
          </section>
        </div>
        <aside class="adminnodes-glance">
          <h3>${t('anode.glance')}</h3>
          ${this.renderresource(t('anode.memory.allocated'), allocated.memory, this.node.memory)}
          ${this.renderresource(t('anode.disk.allocated'), allocated.disk, this.node.disk)}
          <div class="adminnodes-server-total"><span>${t('anode.total.servers')}</span><strong>${servers}</strong></div>
        </aside>
      </div>`;
  },

  renderresource(label, value, total) {
    const used = Math.max(0, Number(value || 0));
    const maximum = Math.max(0, Number(total || 0));
    const percent = maximum > 0 ? (used / maximum) * 100 : 0;
    const barpercent = Math.min(100, percent);
    return `
      <div class="adminnodes-resource">
        <div><span>${this.safe(label)}</span><strong>${this.formatcapacity(used)} / ${this.formatcapacity(maximum)}</strong></div>
        <div class="adminnodes-resource-track"><span style="width:${barpercent.toFixed(2)}%"></span></div>
        <small>${t('anode.allocated.percent', { percent: percent.toFixed(1) })}</small>
      </div>`;
  },

  async opensettings() {
    const body = Utils.el('adminnodes-detail-body');
    if (!body || !this.node) return;
    if (!this.locations.length) {
      body.innerHTML = `<div class="paneladmin-loading adminnodes-section-loading"><div class="spinner"></div><span>${t('anode.loading.settings')}</span></div>`;
      try {
        const { server, apikey } = await adminpanel.credentials();
        const data = await Api.adminrequest(server.panelUrl, apikey, '/api/application/locations?per_page=100&sort=id');
        if (App.currentServer !== server || this.section !== 'settings') return;
        this.locations = (data.data || []).map(item => item.attributes || item);
      } catch (error) {
        body.innerHTML = `<div class="paneladmin-error-state"><strong>${t('anode.err.settings')}</strong><span>${this.safe(error.message)}</span><button type="button" class="btn btn-secondary btn-sm" onclick="adminnodes.opensettings()">${t('cset.banner.retry')}</button></div>`;
        return;
      }
    }
    this.rendersettings();
  },

  async openconfiguration() {
    const body = Utils.el('adminnodes-detail-body');
    if (!body || !this.node) return;
    if (!this.configuration) {
      body.innerHTML = `<div class="paneladmin-loading adminnodes-section-loading"><div class="spinner"></div><span>${t('anode.loading.config')}</span></div>`;
      try {
        const { server, apikey } = await adminpanel.credentials();
        const data = await Api.adminrequest(server.panelUrl, apikey, `/admin/ctrlservers/nodes/${Number(this.node.id)}/configuration`);
        if (App.currentServer !== server || this.section !== 'configuration') return;
        this.configuration = data.config_yml || '';
      } catch (error) {
        body.innerHTML = `<div class="paneladmin-error-state"><strong>${t('anode.err.config')}</strong><span>${this.safe(error.message)}</span><button type="button" class="btn btn-secondary btn-sm" onclick="adminnodes.openconfiguration()">${t('cset.banner.retry')}</button></div>`;
        return;
      }
    }
    this.renderconfiguration();
  },

  renderconfiguration() {
    const body = Utils.el('adminnodes-detail-body');
    if (!body) return;
    body.innerHTML = `
      <div class="adminnodes-config-tabs">
        <button type="button" data-adminnodes-config="file" onclick="adminnodes.switchconfig('file')">${t('anode.config.tab.file')}</button>
        <button type="button" data-adminnodes-config="deploy" onclick="adminnodes.switchconfig('deploy')">${t('anode.config.tab.deploy')}</button>
      </div>
      <div id="adminnodes-config-body"></div>`;
    this.markconfig();
    this.renderconfigbody();
  },

  switchconfig(section) {
    if (!['file', 'deploy'].includes(section)) return;
    this.configsection = section;
    this.markconfig();
    this.renderconfigbody();
  },

  markconfig() {
    document.querySelectorAll('[data-adminnodes-config]').forEach(button => {
      button.classList.toggle('active', button.getAttribute('data-adminnodes-config') === this.configsection);
    });
  },

  renderconfigbody() {
    const body = Utils.el('adminnodes-config-body');
    if (!body) return;
    if (this.configsection === 'deploy') {
      body.innerHTML = `
        <section class="adminnodes-deploy">
          <h3>${t('anode.config.tab.deploy')}</h3>
          <p>${t('anode.deploy.text')}</p>
          <button type="button" class="btn btn-primary" id="adminnode-generate-token" onclick="adminnodes.generatedeployment()">${t('anode.deploy.btn')}</button>
        </section>`;
      return;
    }
    body.innerHTML = `
      <section class="adminnodes-config-file">
        <div class="adminnodes-config-heading"><h3>config.yml</h3><button type="button" class="adminnodes-copy" onclick="adminnodes.copyconfiguration()" title="${t('anode.config.copy')}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button></div>
        <pre>${this.safe(this.configuration)}</pre>
        <p>${t('anode.config.note')}</p>
      </section>`;
  },

  async copyconfiguration() {
    await navigator.clipboard.writeText(this.configuration || '');
  },

  async generatedeployment() {
    if (!this.node) return;
    const button = Utils.el('adminnode-generate-token');
    if (button) {
      button.disabled = true;
      button.textContent = t('anode.generating');
    }
    try {
      const { server, apikey } = await adminpanel.credentials();
      const data = await Api.adminrequest(server.panelUrl, apikey, `/admin/ctrlservers/nodes/${Number(this.node.id)}/deployment`, 'POST', {});
      if (App.currentServer !== server) return;
      this.deploymentcommand = data.command || '';
      Modal.open(t('anode.deploy.title'), `
        <p class="adminnodes-deployment-note">${t('anode.deploy.note')}</p>
        <pre class="adminnodes-deployment-command" id="adminnodes-deployment-command">${this.safe(this.deploymentcommand)}</pre>
        <div class="modal-actions"><button type="button" class="btn btn-secondary" onclick="Modal.close()">${t('anode.deploy.close')}</button><button type="button" class="btn btn-primary" onclick="adminnodes.copydeployment()">${t('anode.deploy.copy')}</button></div>`, 'modal-wide');
    } catch (error) {
      const message = Utils.el('adminnodes-detail-message');
      if (message) message.innerHTML = `<div class="paneladmin-notice error">${this.safe(error.message)}</div>`;
      if (button) {
        button.disabled = false;
        button.textContent = t('anode.deploy.btn');
      }
    }
  },

  async copydeployment() {
    await navigator.clipboard.writeText(this.deploymentcommand || '');
  },

  rendersettings() {
    const body = Utils.el('adminnodes-detail-body');
    if (!body || !this.node) return;
    body.innerHTML = `
      <div class="adminnodes-settings-layout">
        <section class="adminnodes-settings-section adminnodes-settings-primary">
          <h3>${t('anode.settings.title')}</h3>
          <div class="adminnodes-settings-fields">
            ${this.textfield('adminnode-name', t('anode.settings.name'), this.node.name, 'text')}
            <label class="adminnodes-field adminnodes-field-wide"><span>${t('anode.description')}</span><textarea id="adminnode-description" rows="4">${this.safe(this.node.description || '')}</textarea></label>
            <label class="adminnodes-field adminnodes-field-wide"><span>${t('anode.location')}</span><select id="adminnode-location">${this.locationoptions()}</select></label>
            <div class="adminnodes-field adminnodes-field-wide"><span>${t('anode.settings.allowalloc')}</span>${this.toggle('adminnode-public', this.node.public, t('anode.settings.yes'), t('anode.settings.no'))}</div>
            ${this.textfield('adminnode-fqdn', t('anode.settings.fqdn'), this.node.fqdn, 'text', true)}
            <label class="adminnodes-field"><span>${t('anode.ssl.title')}</span><select id="adminnode-scheme"><option value="https" ${this.node.scheme === 'https' ? 'selected' : ''}>${t('anode.ssl.use')}</option><option value="http" ${this.node.scheme !== 'https' ? 'selected' : ''}>${t('anode.http.use')}</option></select></label>
            <div class="adminnodes-field"><span>${t('anode.proxy')}</span>${this.toggle('adminnode-proxy', this.node.behind_proxy)}</div>
            <div class="adminnodes-field"><span>${t('anode.settings.maint')}</span>${this.toggle('adminnode-maintenance', this.node.maintenance_mode)}</div>
          </div>
        </section>
        <div class="adminnodes-settings-side">
          <section class="adminnodes-settings-section">
            <h3>${t('anode.limits')}</h3>
            <div class="adminnodes-settings-fields adminnodes-settings-pairs">
              ${this.numberfield('adminnode-memory', t('anode.totalmemory'), this.node.memory, 'MiB')}
              ${this.numberfield('adminnode-memory-overallocate', t('anode.overallocate'), this.node.memory_overallocate, '%')}
              ${this.numberfield('adminnode-disk', t('anode.disk.space'), this.node.disk, 'MiB')}
              ${this.numberfield('adminnode-disk-overallocate', t('anode.overallocate'), this.node.disk_overallocate, '%')}
            </div>
          </section>
          <section class="adminnodes-settings-section">
            <h3>${t('anode.general')}</h3>
            <div class="adminnodes-settings-fields adminnodes-settings-pairs">
              ${this.numberfield('adminnode-upload-size', t('anode.upload'), this.node.upload_size, 'MiB', true)}
              ${this.numberfield('adminnode-daemon-port', t('anode.daemonport'), this.node.daemon_listen, '', false)}
              ${this.numberfield('adminnode-sftp-port', t('anode.sftpport'), this.node.daemon_sftp, '', false)}
            </div>
          </section>
        </div>
      </div>
      <section class="adminnodes-save-section">
        <div><h3>${t('anode.save.title')}</h3>${this.toggle('adminnode-reset-secret', false, t('anode.resetkey'), t('anode.keepkey'))}</div>
        <button type="button" class="btn btn-primary" id="adminnode-save" onclick="adminnodes.savesettings()">${t('aloc.save')}</button>
      </section>`;
  },

  textfield(id, label, value, type = 'text', wide = false) {
    return `<label class="adminnodes-field ${wide ? 'adminnodes-field-wide' : ''}"><span>${this.safe(label)}</span><input type="${type}" id="${id}" value="${this.safeattr(value)}" autocomplete="off" /></label>`;
  },

  numberfield(id, label, value, suffix, wide = false) {
    if (!suffix) return `<label class="adminnodes-field ${wide ? 'adminnodes-field-wide' : ''}"><span>${this.safe(label)}</span><input type="number" id="${id}" value="${Number(value || 0)}" /></label>`;
    return `<label class="adminnodes-field ${wide ? 'adminnodes-field-wide' : ''}"><span>${this.safe(label)}</span><span class="adminnodes-number"><input type="number" id="${id}" value="${Number(value || 0)}" /><em>${this.safe(suffix)}</em></span></label>`;
  },

  toggle(id, checked, enabled = t('csub.enabled'), disabled = t('csub.disabled')) {
    return `<label class="paneladmin-toggle"><input type="checkbox" id="${id}" data-enabled="${this.safeattr(enabled)}" data-disabled="${this.safeattr(disabled)}" ${checked ? 'checked' : ''} onchange="adminnodes.togglelabel('${id}')" /><span></span><em>${checked ? this.safe(enabled) : this.safe(disabled)}</em></label>`;
  },

  togglelabel(id) {
    const input = Utils.el(id);
    const label = input?.closest('.paneladmin-toggle')?.querySelector('em');
    if (input && label) label.textContent = input.checked ? input.dataset.enabled : input.dataset.disabled;
  },

  locationoptions() {
    return this.locations.map(location => `<option value="${Number(location.id)}" ${Number(location.id) === Number(this.node.location_id) ? 'selected' : ''}>${this.safe(location.long || location.short)} (${this.safe(location.short)})</option>`).join('');
  },

  async savesettings() {
    if (!this.node) return;
    const button = Utils.el('adminnode-save');
    const message = Utils.el('adminnodes-detail-message');
    const payload = {
      name: Utils.el('adminnode-name')?.value.trim() || '',
      description: Utils.el('adminnode-description')?.value.trim() || null,
      location_id: Number(Utils.el('adminnode-location')?.value || 0),
      public: Boolean(Utils.el('adminnode-public')?.checked),
      fqdn: Utils.el('adminnode-fqdn')?.value.trim() || '',
      scheme: Utils.el('adminnode-scheme')?.value || 'https',
      behind_proxy: Boolean(Utils.el('adminnode-proxy')?.checked),
      maintenance_mode: Boolean(Utils.el('adminnode-maintenance')?.checked),
      memory: Number(Utils.el('adminnode-memory')?.value || 0),
      memory_overallocate: Number(Utils.el('adminnode-memory-overallocate')?.value || 0),
      disk: Number(Utils.el('adminnode-disk')?.value || 0),
      disk_overallocate: Number(Utils.el('adminnode-disk-overallocate')?.value || 0),
      upload_size: Number(Utils.el('adminnode-upload-size')?.value || 0),
      daemon_listen: Number(Utils.el('adminnode-daemon-port')?.value || 0),
      daemon_sftp: Number(Utils.el('adminnode-sftp-port')?.value || 0),
      daemon_base: this.node.daemon_base || '/var/lib/pterodactyl/volumes',
      reset_secret: Boolean(Utils.el('adminnode-reset-secret')?.checked)
    };
    if (!payload.name || !payload.fqdn || !payload.location_id) {
      if (message) message.innerHTML = `<div class="paneladmin-notice error">${t('anode.err.settings.required')}</div>`;
      return;
    }
    if (button) {
      button.disabled = true;
      button.textContent = t('cset.saving');
    }
    try {
      const { server, apikey } = await adminpanel.credentials();
      const data = await Api.adminrequest(server.panelUrl, apikey, `/api/application/nodes/${Number(this.node.id)}`, 'PATCH', payload);
      if (App.currentServer !== server) return;
      const item = data.data || data;
      this.node = {
        ...this.node,
        ...(item.attributes || item),
        relationships: this.node.relationships
      };
      this.configuration = null;
      this.renderdetail();
      const refreshed = Utils.el('adminnodes-detail-message');
      if (refreshed) refreshed.innerHTML = `<div class="paneladmin-notice success">${t('anode.saved')}</div>`;
    } catch (error) {
      if (message) message.innerHTML = `<div class="paneladmin-notice error">${this.safe(error.message)}</div>`;
      if (button) {
        button.disabled = false;
        button.textContent = t('aloc.save');
      }
    }
  },

  confirmdelete() {
    if (!this.node || this.servercount() > 0) return;
    this.deletingid = Number(this.node.id);
    Modal.open(t('anode.delete.title'), `
      <div id="adminnode-delete-error"></div>
      <p class="adminnodes-delete-copy">${t('anode.delete.confirm', { name: this.safe(this.node.name) })}</p>
      <div class="modal-actions"><button type="button" class="btn btn-secondary" onclick="Modal.close()">${t('cset.cancel')}</button><button type="button" class="btn btn-danger" id="adminnode-delete" onclick="adminnodes.deletenode()">${t('anode.delete.btn')}</button></div>`);
  },

  async deletenode() {
    if (this.deletingid === null) return;
    const button = Utils.el('adminnode-delete');
    const errorbox = Utils.el('adminnode-delete-error');
    if (button) {
      button.disabled = true;
      button.textContent = t('aloc.deleting');
    }
    try {
      const { server, apikey } = await adminpanel.credentials();
      await Api.adminrequest(server.panelUrl, apikey, '/api/application/nodes/' + this.deletingid, 'DELETE');
      if (App.currentServer !== server) return;
      Modal.close();
      this.node = null;
      this.deletingid = null;
      await this.load(this.page);
    } catch (error) {
      if (errorbox) errorbox.innerHTML = `<div class="paneladmin-notice error">${this.safe(error.message)}</div>`;
      if (button) {
        button.disabled = false;
        button.textContent = t('anode.delete.btn');
      }
    }
  },

  servercount() {
    if (Number.isFinite(Number(this.information?.server_count))) return Number(this.information.server_count);
    const relationship = this.node?.relationships?.servers;
    if (Array.isArray(relationship?.data)) return relationship.data.length;
    if (Array.isArray(relationship?.attributes)) return relationship.attributes.length;
    if (Array.isArray(relationship)) return relationship.length;
    if (Number.isFinite(Number(relationship?.meta?.pagination?.total))) return Number(relationship.meta.pagination.total);
    if (Number.isFinite(Number(this.node?.servers_count))) return Number(this.node.servers_count);
    return 0;
  },

  listservercount(node) {
    if (Number.isFinite(Number(node?.server_count))) return Number(node.server_count);
    const relationship = node?.relationships?.servers;
    if (Array.isArray(relationship?.data)) return relationship.data.length;
    if (Array.isArray(relationship?.attributes)) return relationship.attributes.length;
    if (Array.isArray(relationship)) return relationship.length;
    if (Number.isFinite(Number(relationship?.meta?.pagination?.total))) return Number(relationship.meta.pagination.total);
    return 0;
  },

  renderdetailerror(container, error, id) {
    container.innerHTML = `
      <div class="paneladmin-error-state">
        <strong>${t('anode.err.node')}</strong>
        <span>${this.safe(error.message)}</span>
        <button type="button" class="btn btn-secondary btn-sm" onclick="adminnodes.opennode(${Number(id)})">${t('cset.banner.retry')}</button>
      </div>`;
  },

  formatcapacity(value) {
    const mib = Number(value || 0);
    if (mib >= 1024) {
      const gib = mib / 1024;
      return `${gib >= 10 || Number.isInteger(gib) ? gib.toFixed(0) : gib.toFixed(1)} GiB`;
    }
    return `${mib.toLocaleString()} MiB`;
  },

  rendererror(container, error) {
    container.innerHTML = `
      <div class="paneladmin-error-state">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <strong>${t('anode.err.nodes')}</strong>
        <span>${this.safe(error.message)}</span>
        <button type="button" class="btn btn-secondary btn-sm" onclick="adminnodes.load(adminnodes.page)">${t('cset.banner.retry')}</button>
      </div>`;
  },

  safe(value) {
    return Utils.escape(String(value ?? ''));
  },

  safeattr(value) {
    return this.safe(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
};
