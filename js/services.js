const Services = {
  server: null,
  loading: false,
  services: [],
  filter: '',

  async load() {
    this.server = App.currentserver;
    if (!this.server || this.server.type !== 'VPS/VDS') return;

    this.loading = true;
    this.render();

    try {
      await this.fetchservices();
    } catch (e) {
      console.error('Services load error:', e);
    }

    this.loading = false;
    this.render();
  },

  async fetchservices() {
    this.services = [];
    const r = await this.exec('systemctl list-units --type=service --all --no-pager --no-legend --plain 2>/dev/null');
    if (r.exitcode !== 0 || !r.stdout.trim()) return;

    for (const line of r.stdout.split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 4) continue;
      const [unit, load, active, sub] = parts;
      if (!unit.endsWith('.service')) continue;
      this.services.push({
        name: unit.replace('.service', ''),
        unit,
        load,
        active,
        sub,
        description: parts.slice(4).join(' ')
      });
    }
    this.services.sort((a, b) => {
      const order = { active: 0, inactive: 1, failed: 2 };
      return (order[a.active] ?? 3) - (order[b.active] ?? 3) || a.name.localeCompare(b.name);
    });
  },

  async exec(command) {
    const cfg = {
      host: this.server.host,
      port: this.server.port || 22,
      username: this.server.username || 'root'
    };
    if (this.server.authtype === 'key' && this.server.privatekey) {
      cfg.authtype = 'privatekey';
      cfg.privatekey = this.server.privatekey;
    } else {
      cfg.authtype = 'password';
      cfg.password = this.server.password || '';
    }
    const isroot = (this.server.username || 'root') === 'root';
    if (isroot) {
      return await window.electronapi.sshexec(cfg, command);
    }
    const pass = (this.server.password || '').replace(/'/g, "'\\''");
    const wrapped = command.replace(/'/g, "'\\''");
    return await window.electronapi.sshexec(cfg, `echo '${pass}' | sudo -S sh -c '${wrapped}' 2>/dev/null`);
  },

  async action(name, act) {
    await this.exec(`systemctl ${act} ${name}`);
    await this.fetchservices();
    this.render();
  },

  render() {
    const tab = Utils.el('tabservices');
    if (!tab) return;

    if (this.loading) {
      tab.innerHTML = '<div class="loading"><div class="spinner"></div><div class="loading-text">Loading services...</div></div>';
      return;
    }

    const filtered = this.filter
      ? this.services.filter(s => s.name.toLowerCase().includes(this.filter.toLowerCase()))
      : this.services;

    const activecount = this.services.filter(s => s.active === 'active').length;
    const failedcount = this.services.filter(s => s.active === 'failed').length;

    let html = `<div class="svc-container">
      <div class="svc-stats">
        <div class="svc-stat">
          <span class="svc-stat-value">${this.services.length}</span>
          <span class="svc-stat-label">Total</span>
        </div>
        <div class="svc-stat svc-stat-active">
          <span class="svc-stat-value">${activecount}</span>
          <span class="svc-stat-label">Active</span>
        </div>
        ${failedcount > 0 ? `<div class="svc-stat svc-stat-failed">
          <span class="svc-stat-value">${failedcount}</span>
          <span class="svc-stat-label">Failed</span>
        </div>` : ''}
      </div>

      <div class="svc-search-wrap">
        <svg width="16" height="16" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" class="svc-search" id="svcsearch" placeholder="Search services..." value="${Utils.escape(this.filter)}" oninput="Services.onsearch(this.value)" />
      </div>

      <div class="svc-list">`;

    for (const s of filtered) {
      const statusclass = s.active === 'active' ? 'svc-active' : s.active === 'failed' ? 'svc-failed' : 'svc-inactive';
      const isrunning = s.active === 'active';
      const isenabled = s.load === 'loaded';

      html += `<div class="svc-card">
        <div class="svc-card-main">
          <div class="svc-status-dot ${statusclass}"></div>
          <div class="svc-card-info">
            <div class="svc-card-name">${Utils.escape(s.name)}</div>
            <div class="svc-card-desc">${Utils.escape(s.description || s.unit)}</div>
          </div>
          <span class="svc-state-badge ${statusclass}">${s.active}/${s.sub}</span>
        </div>
        <div class="svc-card-actions">
          ${isrunning
            ? `<button class="btn btn-sm btn-yellow" onclick="Services.action('${s.name}', 'stop')" title="Stop">Stop</button>
               <button class="btn btn-sm btn-secondary" onclick="Services.action('${s.name}', 'restart')" title="Restart">Restart</button>`
            : `<button class="btn btn-sm btn-green" onclick="Services.action('${s.name}', 'start')" title="Start">Start</button>`}
          <button class="btn btn-sm btn-secondary" onclick="Services.action('${s.name}', 'enable')" title="Enable">Enable</button>
          <button class="btn btn-sm btn-secondary" onclick="Services.action('${s.name}', 'disable')" title="Disable">Disable</button>
        </div>
      </div>`;
    }

    if (!filtered.length) {
      html += '<div class="fw-empty">No services found</div>';
    }

    html += '</div></div>';
    tab.innerHTML = html;
  },

  onsearch(val) {
    this.filter = val;
    const list = document.querySelector('.svc-list');
    if (list) this.renderlistonly();
  },

  renderlistonly() {
    const filtered = this.filter
      ? this.services.filter(s => s.name.toLowerCase().includes(this.filter.toLowerCase()))
      : this.services;

    const container = Utils.el('tabservices');
    const listel = container.querySelector('.svc-list');
    if (!listel) { this.render(); return; }

    let html = '';
    for (const s of filtered) {
      const statusclass = s.active === 'active' ? 'svc-active' : s.active === 'failed' ? 'svc-failed' : 'svc-inactive';
      const isrunning = s.active === 'active';

      html += `<div class="svc-card">
        <div class="svc-card-main">
          <div class="svc-status-dot ${statusclass}"></div>
          <div class="svc-card-info">
            <div class="svc-card-name">${Utils.escape(s.name)}</div>
            <div class="svc-card-desc">${Utils.escape(s.description || s.unit)}</div>
          </div>
          <span class="svc-state-badge ${statusclass}">${s.active}/${s.sub}</span>
        </div>
        <div class="svc-card-actions">
          ${isrunning
            ? `<button class="btn btn-sm btn-yellow" onclick="Services.action('${s.name}', 'stop')">Stop</button>
               <button class="btn btn-sm btn-secondary" onclick="Services.action('${s.name}', 'restart')">Restart</button>`
            : `<button class="btn btn-sm btn-green" onclick="Services.action('${s.name}', 'start')">Start</button>`}
          <button class="btn btn-sm btn-secondary" onclick="Services.action('${s.name}', 'enable')">Enable</button>
          <button class="btn btn-sm btn-secondary" onclick="Services.action('${s.name}', 'disable')">Disable</button>
        </div>
      </div>`;
    }

    if (!filtered.length) {
      html = '<div class="fw-empty">No services found</div>';
    }

    listel.innerHTML = html;
  }
};
