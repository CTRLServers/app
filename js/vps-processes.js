const VPSProcesses = {
  server: null,
  _interval: null,
  _sort: 'cpu',
  _sortdir: -1,
  _processes: [],

  load() {
    this.server = App.currentServer;
    this.render();
    this.fetch();
    this._interval = setInterval(() => this.fetch(), 3000);
  },

  destroy() {
    if (this._interval) { clearInterval(this._interval); this._interval = null; }
  },

  render() {
    const c = Utils.el('tabProcesses');
    c.innerHTML = `
      <div class="vps-section-header">
        <h2>Process Manager</h2>
        <div class="vps-proc-controls">
          <input type="text" class="vps-proc-search" id="procSearch" placeholder="Filter processes..." oninput="VPSProcesses.filter(this.value)" />
          <button class="btn btn-sm btn-secondary" onclick="VPSProcesses.fetch()">Refresh</button>
        </div>
      </div>
      <div class="vps-proc-summary" id="procSummary"></div>
      <div class="vps-proc-table-wrap">
        <table class="vps-proc-table" id="procTable">
          <thead>
            <tr>
              <th class="sortable" data-sort="pid" onclick="VPSProcesses.sort('pid')">PID <span class="sort-arrow"></span></th>
              <th class="sortable" data-sort="user" onclick="VPSProcesses.sort('user')">User <span class="sort-arrow"></span></th>
              <th class="sortable" data-sort="cpu" onclick="VPSProcesses.sort('cpu')">CPU% <span class="sort-arrow"></span></th>
              <th class="sortable" data-sort="mem" onclick="VPSProcesses.sort('mem')">RAM% <span class="sort-arrow"></span></th>
              <th class="sortable" data-sort="vsz" onclick="VPSProcesses.sort('vsz')">VSZ <span class="sort-arrow"></span></th>
              <th class="sortable" data-sort="rss" onclick="VPSProcesses.sort('rss')">RSS <span class="sort-arrow"></span></th>
              <th>Command</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody id="procBody"></tbody>
        </table>
      </div>`;
  },

  async fetch() {
    if (!this.server) return;
    const cmd = 'ps aux --sort=-' + (this._sort === 'cpu' ? '%cpu' : this._sort === 'mem' ? '%mem' : this._sort === 'rss' ? 'rss' : this._sort === 'vsz' ? 'vsz' : this._sort === 'pid' ? 'pid' : this._sort === 'user' ? 'user' : 'comm');
    const res = await this.exec(cmd);
    if (!res || !res.stdout) return;
    const lines = res.stdout.trim().split('\n');
    this._processes = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].trim().split(/\s+/);
      if (parts.length < 11) continue;
      this._processes.push({
        user: parts[0],
        pid: parseInt(parts[1]),
        cpu: parseFloat(parts[2]),
        mem: parseFloat(parts[3]),
        vsz: parseInt(parts[4]),
        rss: parseInt(parts[5]),
        command: parts.slice(10).join(' ')
      });
    }
    this.update();
  },

  update() {
    const summary = Utils.el('procSummary');
    const body = Utils.el('procBody');
    if (!summary || !body) return;

    const total = this._processes.length;
    const running = this._processes.filter(p => p.command.includes('[') === false).length;
    const highcpu = this._processes.filter(p => p.cpu > 50).length;
    summary.innerHTML = `
      <div class="vps-proc-stat"><span class="vps-proc-stat-val">${total}</span><span class="vps-proc-stat-lbl">Total</span></div>
      <div class="vps-proc-stat"><span class="vps-proc-stat-val">${running}</span><span class="vps-proc-stat-lbl">Active</span></div>
      <div class="vps-proc-stat ${highcpu > 0 ? 'vps-proc-warn' : ''}"><span class="vps-proc-stat-val">${highcpu}</span><span class="vps-proc-stat-lbl">High CPU</span></div>`;

    const filter = (Utils.el('procSearch')?.value || '').toLowerCase();
    let filtered = this._processes;
    if (filter) filtered = filtered.filter(p => p.command.toLowerCase().includes(filter) || p.user.toLowerCase().includes(filter) || String(p.pid).includes(filter));

    this._sortlist(filtered);

    body.innerHTML = filtered.map(p => {
      const cpuclass = p.cpu > 50 ? 'proc-high' : p.cpu > 20 ? 'proc-med' : '';
      const memclass = p.mem > 50 ? 'proc-high' : p.mem > 20 ? 'proc-med' : '';
      return `<tr>
        <td>${p.pid}</td>
        <td>${Utils.escape(p.user)}</td>
        <td class="${cpuclass}">${p.cpu.toFixed(1)}</td>
        <td class="${memclass}">${p.mem.toFixed(1)}</td>
        <td>${Utils.formatbytes(p.vsz * 1024)}</td>
        <td>${Utils.formatbytes(p.rss * 1024)}</td>
        <td class="proc-cmd" title="${Utils.escape(p.command)}">${Utils.escape(p.command.substring(0, 80))}</td>
        <td><button class="btn btn-xs btn-danger" onclick="VPSProcesses.kill(${p.pid})" title="Kill process">Kill</button></td>
      </tr>`;
    }).join('');

    document.querySelectorAll('.vps-proc-table th.sortable').forEach(th => {
      th.classList.toggle('sort-active', th.dataset.sort === this._sort);
      const arrow = th.querySelector('.sort-arrow');
      if (arrow) arrow.textContent = th.dataset.sort === this._sort ? (this._sortdir > 0 ? '\u25B2' : '\u25BC') : '';
    });
  },

  _sortlist(list) {
    const key = this._sort;
    const dir = this._sortdir;
    list.sort((a, b) => {
      let va = a[key], vb = b[key];
      if (typeof va === 'string') return va.localeCompare(vb) * dir;
      return (va - vb) * dir;
    });
  },

  sort(col) {
    if (this._sort === col) { this._sortdir *= -1; }
    else { this._sort = col; this._sortdir = -1; }
    this.update();
  },

  filter(q) {
    this.update();
  },

  async kill(pid) {
    Modal.confirm('Kill Process', `Send SIGKILL to PID ${pid}?`, async () => {
      await this.exec(`kill -9 ${pid}`);
      setTimeout(() => this.fetch(), 500);
    });
  },

  async exec(command) {
    const cfg = { host: this.server.host, port: this.server.port || 22, username: this.server.username || 'root' };
    if (this.server.authType === 'key' && this.server.privateKey) { cfg.authType = 'privateKey'; cfg.privateKey = this.server.privateKey; }
    else { cfg.authType = 'password'; cfg.password = this.server.password || ''; }
    if ((this.server.username || 'root') !== 'root') {
      const pass = (this.server.password || '').replace(/'/g, "'\\''");
      return await window.electronAPI.sshexec(cfg, `echo '${pass}' | sudo -S sh -c '${command.replace(/'/g, "'\\''")}' 2>/dev/null`);
    }
    return await window.electronAPI.sshexec(cfg, command);
  }
};
