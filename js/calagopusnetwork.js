const calagopusnetwork = {
  allocations: [],
  pagination: {},
  page: 1,
  search: '',
  timer: null,
  selected: new Set(),
  selfassign: false,
  requireprimary: true,
  limit: 0,
  slots: [],
  selectedslots: new Set(),
  view: 'allocations',
  firewall: [],
  firewallsupported: null,
  ruleedit: -1,
  ruleform: null,
  filetimer: null,

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
    if (this.view === 'firewall') return this.loadfirewall();
    this.renderloading();
    try {
      const server = App.currentServer;
      const query = new URLSearchParams({ page: String(this.page), per_page: '25' });
      if (this.search) query.set('search', this.search);
      const [result, detail] = await Promise.all([
        this.request(`/allocations?${query}`),
        Api.fetchcalagopusserver(server.panelUrl, await Servers.resolveapikey(server), server.uuid)
      ]);
      this.pagination = result?.allocations || {};
      this.allocations = this.pagination.data || [];
      const config = detail.egg_configuration || {};
      this.selfassign = !!config.allocation_self_assign_enabled;
      this.requireprimary = config.allocation_self_assign_require_primary !== false;
      this.limit = Number(detail.feature_limits?.allocations ?? server.featurelimits?.allocations ?? 0);
      this.selected = new Set([...this.selected].filter(uuid => this.allocations.some(allocation => allocation.uuid === uuid)));
      this.render();
    } catch (error) {
      this.rendererror(error.message);
    }
  },

  renderloading() {
    const container = Utils.el('tabNetwork');
    if (container) container.innerHTML = `${this.subnav()}<div class="tab-loading"><span class="spinner"></span></div>`;
  },

  rendererror(message) {
    const container = Utils.el('tabNetwork');
    if (container) container.innerHTML = `${this.subnav()}<div class="calagopus-network-empty"><strong>Unable to load ${this.view}</strong><span>${this.safe(message)}</span><button class="btn btn-secondary btn-sm" onclick="calagopusnetwork.load()">Try Again</button></div>`;
  },

  subnav() {
    return `<div class="calagopus-network-subnav"><button class="${this.view === 'allocations' ? 'active' : ''}" onclick="calagopusnetwork.setview('allocations')">Allocations</button><button class="${this.view === 'firewall' ? 'active' : ''}" onclick="calagopusnetwork.setview('firewall')">Firewall</button></div>`;
  },

  setview(view) {
    if (!['allocations', 'firewall'].includes(view) || this.view === view) return;
    this.view = view;
    this.load();
  },

  date(value) {
    if (!value) return 'N/A';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'N/A' : date.toLocaleString();
  },

  render() {
    const container = Utils.el('tabNetwork');
    if (!container) return;
    const total = Number(this.pagination.total || this.allocations.length);
    const atlimit = total >= this.limit;
    const allselected = this.allocations.length > 0 && this.allocations.every(allocation => this.selected.has(allocation.uuid));
    const rows = this.allocations.map((allocation, index) => `<tr class="${this.selected.has(allocation.uuid) ? 'selected' : ''}"><td><input type="checkbox" aria-label="Select allocation" ${this.selected.has(allocation.uuid) ? 'checked' : ''} onchange="calagopusnetwork.toggleselected('${allocation.uuid}',this.checked)"></td><td>${allocation.is_primary ? '<svg class="calagopus-primary-icon" width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1"><path d="m12 2.7 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.3l6.2-.9z"></path></svg>' : ''}</td><td><code>${this.safe(allocation.ip_alias || allocation.ip)}</code></td><td><code>${Number(allocation.port || 0)}</code></td><td><textarea rows="1" maxlength="1024" placeholder="Notes" oninput="calagopusnetwork.notes(${index},this.value)">${this.safe(allocation.notes || '')}</textarea></td><td>${this.safe(this.date(allocation.created))}</td><td><div class="calagopus-network-actions">${allocation.is_primary ? `<button title="Unset primary" ${this.requireprimary ? 'disabled' : ''} onclick="calagopusnetwork.setprimary(${index},false)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 2.7 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.3l6.2-.9z"></path></svg></button>` : `<button title="Set primary" onclick="calagopusnetwork.setprimary(${index},true)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 2.7 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.3l6.2-.9z"></path></svg></button>`}<button class="danger" title="Delete allocation" ${allocation.is_primary ? 'disabled' : ''} onclick="calagopusnetwork.remove(${index})"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"></path></svg></button></div></td></tr>`).join('');
    const addbutton = this.selfassign && !atlimit ? '<button class="btn btn-primary btn-sm" onclick="calagopusnetwork.openadd()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"></path></svg>Add</button>' : '';
    const bulk = this.selected.size ? `<div class="calagopus-network-bulk"><span>${this.selected.size} selected</span><button class="btn btn-danger btn-sm" onclick="calagopusnetwork.removebulk()">Delete Selected</button><button class="btn btn-secondary btn-sm" onclick="calagopusnetwork.clearselected()">Clear</button></div>` : '';
    container.innerHTML = `${this.subnav()}<div class="calagopus-network-page"><div class="calagopus-network-header"><div><h2>Allocations</h2><span>${total} of ${this.limit} allocations</span></div><div class="calagopus-network-header-actions"><label class="calagopus-network-search"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg><input value="${this.safe(this.search)}" placeholder="Search allocations" oninput="calagopusnetwork.setsearch(this.value)"></label>${addbutton}</div></div>${bulk}<div class="calagopus-network-table-wrap"><table class="calagopus-network-table"><thead><tr><th><input type="checkbox" aria-label="Select all allocations" ${allselected ? 'checked' : ''} onchange="calagopusnetwork.selectall(this.checked)"></th><th></th><th>Hostname</th><th>Port</th><th>Notes</th><th>Created</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="7"><div class="calagopus-network-empty">No allocations found.</div></td></tr>'}</tbody></table></div>${this.paginationhtml()}</div>`;
  },

  async loadfirewall() {
    this.renderloading();
    try {
      const result = await this.request('/firewall');
      this.firewall = (result?.rules || []).map(rule => ({
        action: rule.action,
        protocols: rule.protocols || [],
        sources: rule.sources || [],
        ports: rule.ports || null,
        source_file: rule.source_file || null
      }));
      this.firewallsupported = result?.supported ?? null;
      this.renderfirewall();
    } catch (error) {
      this.rendererror(error.message);
    }
  },

  summary(rule) {
    const protocols = rule.protocols.length ? rule.protocols.map(protocol => protocol.toUpperCase()).join(' & ') : 'TCP & UDP';
    const sources = [...rule.sources];
    if (rule.source_file) sources.push(`entries in ${rule.source_file}`);
    const source = sources.length ? sources.join(', ') : 'any source';
    const ports = rule.ports ? this.portranges(rule.ports).join(', ') : 'all allocations';
    return `${protocols} from ${source} to ${ports}`;
  },

  portranges(ports) {
    const sorted = [...new Set(ports)].sort((left, right) => left - right);
    const ranges = [];
    let start = sorted[0];
    let end = sorted[0];
    for (let index = 1; index <= sorted.length; index++) {
      if (sorted[index] === end + 1) {
        end = sorted[index];
      } else if (start !== undefined) {
        ranges.push(start === end ? String(start) : `${start}-${end}`);
        start = sorted[index];
        end = sorted[index];
      }
    }
    return ranges;
  },

  renderfirewall() {
    const container = Utils.el('tabNetwork');
    if (!container) return;
    const cards = this.firewall.map((rule, index) => `<div class="calagopus-firewall-card"><span class="calagopus-firewall-number">${index + 1}</span><div><strong>${rule.action === 'allow' ? 'Allow' : 'Deny'}</strong><span>${this.safe(this.summary(rule))}</span></div><div class="calagopus-network-actions"><button title="Edit rule" onclick="calagopusnetwork.openrule(${index})"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"></path></svg></button><button title="Duplicate rule" onclick="calagopusnetwork.duplicaterule(${index})"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button><button class="danger" title="Delete rule" onclick="calagopusnetwork.removerule(${index})"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"></path></svg></button></div></div>`).join('');
    const warning = this.firewallsupported === false ? '<div class="calagopus-firewall-warning">Firewall rules are not enforced by this server node.</div>' : '';
    container.innerHTML = `${this.subnav()}<div class="calagopus-network-page"><div class="calagopus-network-header"><div><h2>Firewall</h2><span>${this.firewall.length} rule${this.firewall.length === 1 ? '' : 's'}</span></div><button class="btn btn-primary btn-sm" onclick="calagopusnetwork.openrule()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"></path></svg>Create firewall rule</button></div>${warning}<div class="calagopus-firewall-note"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4M12 8h.01"></path></svg><span>Rules cover traffic reaching this server from elsewhere, both through its published ports and directly on its container address. Connections opened by the node itself are not filtered.</span></div><div class="calagopus-firewall-list">${cards || '<div class="calagopus-network-empty"><strong>No firewall rules</strong><span>Traffic is allowed until a matching rule is added.</span></div>'}</div></div>`;
  },

  openrule(index = -1) {
    this.ruleedit = index;
    const rule = index >= 0 ? this.firewall[index] : null;
    this.ruleform = rule ? JSON.parse(JSON.stringify(rule)) : { action: 'deny', protocols: [], sources: [], ports: null, source_file: null };
    this.renderrule();
  },

  renderrule(sourceinput = '', portinput = '') {
    const rule = this.ruleform;
    const sources = rule.sources.map((source, index) => `<span class="calagopus-firewall-tag"><code>${this.safe(source)}</code><button title="Remove source" onclick="calagopusnetwork.removesource(${index})">&times;</button></span>`).join('');
    const ports = rule.ports ? this.portranges(rule.ports).map((port, index) => `<span class="calagopus-firewall-tag"><code>${port}</code><button title="Remove port" onclick="calagopusnetwork.removeport(${index})">&times;</button></span>`).join('') : '';
    Modal.open(this.ruleedit >= 0 ? 'Edit Firewall Rule' : 'Create Firewall Rule', `<div class="calagopus-firewall-form"><label class="form-group"><span>Action</span><select onchange="calagopusnetwork.setrule('action',this.value)"><option value="allow" ${rule.action === 'allow' ? 'selected' : ''}>Allow</option><option value="deny" ${rule.action === 'deny' ? 'selected' : ''}>Deny</option></select></label><div class="form-group"><span>Protocols</span><small>Leave empty to match both TCP and UDP.</small><div class="calagopus-firewall-protocols"><button class="${rule.protocols.includes('tcp') ? 'active' : ''}" onclick="calagopusnetwork.toggleprotocol('tcp')">TCP</button><button class="${rule.protocols.includes('udp') ? 'active' : ''}" onclick="calagopusnetwork.toggleprotocol('udp')">UDP</button></div></div><div class="form-group"><span>Sources</span><small>IP addresses or networks such as 10.0.0.0/8. A network must have its host bits zeroed. Leave empty to match any source.</small><div class="calagopus-firewall-addrow"><input id="calagopus-firewall-source" value="${this.safe(sourceinput)}" placeholder="IP address or network" onkeydown="if(event.key==='Enter'){event.preventDefault();calagopusnetwork.addsource()}"><button class="btn btn-secondary" onclick="calagopusnetwork.addsource()">Add</button></div><div class="calagopus-firewall-tags">${sources}</div><small>${rule.sources.length} of 50 used</small></div><div class="form-group calagopus-firewall-file"><span>Source File</span><small>Path of a file in the server directory with one IP address or network per line, lines starting with # are ignored. Its entries are added to the sources above, and the node picks up edits to the file on its own.</small><input value="${this.safe(rule.source_file || '')}" placeholder="firewall/allowed.txt" oninput="calagopusnetwork.sourcefile(this.value)"><div id="calagopus-firewall-files" class="calagopus-firewall-files"></div></div><div class="form-group"><span>Ports</span><small>Allocation ports this rule applies to, as single ports or ranges like 25565-25570. Leave empty to match every allocation of the server.</small><div class="calagopus-firewall-addrow"><input id="calagopus-firewall-port" value="${this.safe(portinput)}" placeholder="Port or range" onkeydown="if(event.key==='Enter'){event.preventDefault();calagopusnetwork.addport()}"><button class="btn btn-secondary" onclick="calagopusnetwork.addport()">Add</button></div><div class="calagopus-firewall-tags">${ports}</div></div><div class="form-group"><span>Preview</span><div class="calagopus-firewall-preview"><strong>${rule.action === 'allow' ? 'Allow' : 'Deny'}</strong><span>${this.safe(this.summary(rule))}</span></div></div><div id="calagopus-firewall-error"></div><div class="modal-actions"><button class="btn btn-secondary" onclick="Modal.close()">Cancel</button><button class="btn btn-primary" onclick="calagopusnetwork.saverule()">${this.ruleedit >= 0 ? 'Save Rule' : 'Create Rule'}</button></div></div>`);
  },

  setrule(field, value) {
    this.ruleform[field] = value;
    this.renderrule();
  },

  toggleprotocol(protocol) {
    const protocols = this.ruleform.protocols;
    this.ruleform.protocols = protocols.includes(protocol) ? protocols.filter(item => item !== protocol) : [...protocols, protocol];
    this.renderrule();
  },

  validnetwork(value) {
    const match = value.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\/(\d|[12]\d|3[0-2]))?$/);
    if (match) {
      const bytes = match.slice(1, 5).map(Number);
      if (bytes.some(byte => byte > 255)) return false;
      if (match[5] === undefined) return true;
      const bits = Number(match[5]);
      const address = (((bytes[0] << 24) >>> 0) + (bytes[1] << 16) + (bytes[2] << 8) + bytes[3]) >>> 0;
      const hostmask = bits === 32 ? 0 : (2 ** (32 - bits) - 1) >>> 0;
      return (address & hostmask) === 0;
    }
    return /^[0-9a-f:]+(?:\/(?:\d|[1-9]\d|1[01]\d|12[0-8]))?$/i.test(value) && value.includes(':');
  },

  adderror(message) {
    const box = Utils.el('calagopus-firewall-error');
    if (box) box.innerHTML = `<div class="error-msg">${this.safe(message)}</div>`;
  },

  addsource() {
    const input = Utils.el('calagopus-firewall-source');
    const value = input.value.trim();
    if (!value || !this.validnetwork(value)) return this.adderror('Enter a valid IP address or network with host bits zeroed.');
    if (this.ruleform.sources.length >= 50) return this.adderror('A rule can contain at most 50 sources.');
    if (!this.ruleform.sources.includes(value)) this.ruleform.sources.push(value);
    this.renderrule();
  },

  removesource(index) {
    this.ruleform.sources.splice(index, 1);
    this.renderrule();
  },

  parseports(value) {
    const match = value.trim().match(/^(\d{1,5})(?:-(\d{1,5}))?$/);
    if (!match) return null;
    const start = Number(match[1]);
    const end = Number(match[2] || match[1]);
    if (start < 1 || end > 65535 || start > end) return null;
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  },

  addport() {
    const input = Utils.el('calagopus-firewall-port');
    const parsed = this.parseports(input.value);
    if (!parsed) return this.adderror('Enter a valid port or port range.');
    const combined = [...new Set([...(this.ruleform.ports || []), ...parsed])];
    if (combined.length > 1024) return this.adderror('A rule can contain at most 1024 ports.');
    this.ruleform.ports = combined;
    this.renderrule();
  },

  removeport(index) {
    const ranges = this.portranges(this.ruleform.ports);
    const removed = this.parseports(ranges[index]) || [];
    this.ruleform.ports = this.ruleform.ports.filter(port => !removed.includes(port));
    if (!this.ruleform.ports.length) this.ruleform.ports = null;
    this.renderrule();
  },

  sourcefile(value) {
    this.ruleform.source_file = value.trim() || null;
    clearTimeout(this.filetimer);
    this.filetimer = setTimeout(() => this.suggestfiles(value), 300);
    const preview = document.querySelector('.calagopus-firewall-preview span');
    if (preview) preview.textContent = this.summary(this.ruleform);
  },

  async suggestfiles(value) {
    const box = Utils.el('calagopus-firewall-files');
    if (!box || !value.trim()) {
      if (box) box.innerHTML = '';
      return;
    }
    const clean = value.replace(/^\/+/, '');
    const slash = clean.lastIndexOf('/');
    const directory = slash < 0 ? '/' : `/${clean.slice(0, slash)}`;
    const prefix = (slash < 0 ? clean : clean.slice(slash + 1)).toLowerCase();
    try {
      const server = App.currentServer;
      const files = await Api.listcalagopusfiles(server.panelUrl, await Servers.resolveapikey(server), server.uuid, directory);
      const options = files.filter(file => file.attributes.name.toLowerCase().startsWith(prefix)).sort((left, right) => Number(left.attributes.is_file) - Number(right.attributes.is_file) || left.attributes.name.localeCompare(right.attributes.name)).slice(0, 50).map(file => {
        const folder = !file.attributes.is_file;
        const path = `${directory === '/' ? '' : directory.slice(1) + '/'}${file.attributes.name}${folder ? '/' : ''}`;
        const icon = folder ? '<path d="M3 6h6l2 2h10v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"></path>' : '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path>';
        return `<button onclick="calagopusnetwork.selectfile(decodeURIComponent('${encodeURIComponent(path)}'),${folder})"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${icon}</svg><span>${this.safe(path)}</span></button>`;
      }).join('');
      box.innerHTML = options;
    } catch (error) {
      box.innerHTML = '';
    }
  },

  selectfile(path, folder = false) {
    this.ruleform.source_file = path;
    this.renderrule();
    if (folder) {
      const input = document.querySelector('.calagopus-firewall-file input');
      if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
      this.suggestfiles(path);
    }
  },

  async saverule() {
    const rules = [...this.firewall];
    if (this.ruleedit >= 0) rules[this.ruleedit] = this.ruleform;
    else rules.push(this.ruleform);
    try {
      await this.request('/firewall', 'PUT', { rules });
      Modal.close();
      this.toast(this.ruleedit >= 0 ? 'Firewall rule updated' : 'Firewall rule created');
      this.loadfirewall();
    } catch (error) {
      this.adderror(error.message);
    }
  },

  async duplicaterule(index) {
    const rules = this.firewall.map(rule => JSON.parse(JSON.stringify(rule)));
    rules.splice(index + 1, 0, JSON.parse(JSON.stringify(rules[index])));
    try {
      await this.request('/firewall', 'PUT', { rules });
      this.toast('Firewall rule duplicated');
      this.loadfirewall();
    } catch (error) {
      this.toast(error.message, 'error');
    }
  },

  removerule(index) {
    Modal.confirm('Delete Firewall Rule', `Delete rule ${index + 1}?`, async () => {
      try {
        await this.request('/firewall', 'PUT', { rules: this.firewall.filter((rule, ruleindex) => ruleindex !== index) });
        Modal.close();
        this.toast('Firewall rule deleted');
        this.loadfirewall();
      } catch (error) {
        this.toast(error.message, 'error');
      }
    });
  },

  paginationhtml() {
    const page = Number(this.pagination.page || 1);
    const perpage = Number(this.pagination.per_page || 25);
    const pages = Math.max(1, Math.ceil(Number(this.pagination.total || 0) / perpage));
    if (pages <= 1) return '';
    return `<div class="calagopus-network-pagination"><button class="btn btn-secondary btn-sm" onclick="calagopusnetwork.setpage(${page - 1})" ${page <= 1 ? 'disabled' : ''}>Previous</button><span>Page ${page} of ${pages}</span><button class="btn btn-secondary btn-sm" onclick="calagopusnetwork.setpage(${page + 1})" ${page >= pages ? 'disabled' : ''}>Next</button></div>`;
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

  toggleselected(uuid, checked) {
    if (checked) this.selected.add(uuid);
    else this.selected.delete(uuid);
    this.render();
  },

  selectall(checked) {
    this.allocations.forEach(allocation => checked ? this.selected.add(allocation.uuid) : this.selected.delete(allocation.uuid));
    this.render();
  },

  clearselected() {
    this.selected.clear();
    this.render();
  },

  notes(index, value) {
    const allocation = this.allocations[index];
    allocation.notes = value;
    clearTimeout(allocation.notestimer);
    allocation.notestimer = setTimeout(async () => {
      try {
        await this.request(`/allocations/${allocation.uuid}`, 'PATCH', { notes: value || null });
        this.toast('Notes updated');
      } catch (error) {
        this.toast(error.message, 'error');
      }
    }, 500);
  },

  async setprimary(index, primary) {
    const allocation = this.allocations[index];
    try {
      await this.request(`/allocations/${allocation.uuid}`, 'PATCH', { primary });
      this.toast(primary ? 'Primary allocation set' : 'Primary allocation unset');
      this.load();
    } catch (error) {
      this.toast(error.message, 'error');
    }
  },

  remove(index) {
    const allocation = this.allocations[index];
    Modal.confirm('Delete Allocation', `Delete ${this.safe(allocation.ip_alias || allocation.ip)}:${Number(allocation.port || 0)}?`, async () => {
      try {
        await this.request(`/allocations/${allocation.uuid}`, 'DELETE');
        Modal.close();
        this.toast('Allocation deleted');
        this.load();
      } catch (error) {
        this.toast(error.message, 'error');
      }
    });
  },

  removebulk() {
    const removable = this.allocations.filter(allocation => this.selected.has(allocation.uuid) && !allocation.is_primary);
    Modal.confirm('Delete Allocations', `Delete ${removable.length} selected allocation${removable.length === 1 ? '' : 's'}? Primary allocations will be skipped.`, async () => {
      const results = await Promise.allSettled(removable.map(allocation => this.request(`/allocations/${allocation.uuid}`, 'DELETE')));
      const failures = results.filter(result => result.status === 'rejected').length;
      Modal.close();
      this.selected.clear();
      this.toast(failures ? `${failures} allocation${failures === 1 ? '' : 's'} could not be deleted` : 'Allocations deleted', failures ? 'error' : 'success');
      this.load();
    });
  },

  openadd() {
    const remaining = Math.max(0, this.limit - Number(this.pagination.total || this.allocations.length));
    this.slots = Array.from({ length: remaining }, (_, index) => ({ id: index + 1, label: `Available allocation ${index + 1}` }));
    this.selectedslots = new Set();
    this.renderadd();
  },

  renderadd(filter = '') {
    const term = filter.trim().toLowerCase();
    const slots = this.slots.filter(slot => slot.label.toLowerCase().includes(term)).map(slot => `<label class="calagopus-allocation-option"><input type="checkbox" ${this.selectedslots.has(slot.id) ? 'checked' : ''} onchange="calagopusnetwork.toggleslot(${slot.id},this.checked)"><span><strong>${this.safe(slot.label)}</strong><small>The panel will assign the next available hostname and port.</small></span></label>`).join('');
    Modal.open('Add Allocations', `<div class="calagopus-allocation-add"><label class="calagopus-allocation-filter"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg><input placeholder="Search available allocations" value="${this.safe(filter)}" oninput="calagopusnetwork.filteradd(this.value)"></label><div id="calagopus-allocation-options" class="calagopus-allocation-options">${slots || '<p>No available allocations found.</p>'}</div><div id="calagopus-allocation-add-error"></div><div class="modal-actions"><button class="btn btn-secondary" onclick="Modal.close()">Cancel</button><button class="btn btn-primary" onclick="calagopusnetwork.addselected()" ${this.selectedslots.size ? '' : 'disabled'}>Add Selected (${this.selectedslots.size})</button></div></div>`);
  },

  filteradd(value) {
    this.renderadd(value);
  },

  toggleslot(id, checked) {
    if (checked) this.selectedslots.add(id);
    else this.selectedslots.delete(id);
    const filter = document.querySelector('.calagopus-allocation-filter input')?.value || '';
    this.renderadd(filter);
  },

  async addselected() {
    const errorbox = Utils.el('calagopus-allocation-add-error');
    try {
      for (const id of this.selectedslots) await this.request('/allocations', 'POST');
      Modal.close();
      this.toast('Allocations added');
      this.load();
    } catch (error) {
      errorbox.innerHTML = `<div class="error-msg">${this.safe(error.message)}</div>`;
    }
  },

  toast(message, type = 'success') {
    document.querySelector('.calagopus-network-toast')?.remove();
    const toast = document.createElement('div');
    toast.className = `toast file-toast calagopus-network-toast file-toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
  }
};
