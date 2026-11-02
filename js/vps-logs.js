const VPSLogs = {
  server: null,
  _interval: null,
  _streaming: false,
  _lines: 500,
  _logpath: '/var/log/syslog',
  _logfiles: [
    { label: 'logs.file.syslog', path: '/var/log/syslog' },
    { label: 'logs.file.auth', path: '/var/log/auth.log' },
    { label: 'logs.file.kern', path: '/var/log/kern.log' },
    { label: 'logs.file.nginx', path: '/var/log/nginx/error.log' },
    { label: 'logs.file.apache', path: '/var/log/apache2/error.log' },
    { label: 'logs.file.docker', path: '/var/log/docker.log' },
    { label: 'logs.file.mysql', path: '/var/log/mysql/error.log' },
    { label: 'logs.file.postgres', path: '/var/log/postgresql/postgresql.log' },
    { label: 'logs.file.journal', path: '__journal__' },
    { label: 'logs.file.dmesg', path: '__dmesg__' }
  ],

  load() {
    this.server = App.currentServer;
    this.renderloading();
    this.loadlog();
  },

  destroy() {
    this._streaming = false;
    if (this._interval) { clearInterval(this._interval); this._interval = null; }
  },

  renderloading() {
    const c = Utils.el('tabLogs');
    if (c) c.innerHTML = `<div class="loading"><div class="spinner"></div><div class="loading-text">${t('common.loading')}</div></div>`;
  },

  render() {
    const c = Utils.el('tabLogs');
    const opts = this._logfiles.map(f =>
      `<option value="${f.path}" ${f.path === this._logpath ? 'selected' : ''}>${t(f.label)}</option>`
    ).join('');
    c.innerHTML = `
      <div class="vps-section-header">
        <h2>${t('logs.heading')}</h2>
        <div class="vps-log-controls">
          <select class="vps-log-select" id="logFileSelect" onchange="VPSLogs.changelog(this.value)">${opts}</select>
          <select class="vps-log-select" id="logLinesSelect" onchange="VPSLogs.changelines(this.value)">
            <option value="100">${t('logs.lines', { n: 100 })}</option>
            <option value="250">${t('logs.lines', { n: 250 })}</option>
            <option value="500" selected>${t('logs.lines', { n: 500 })}</option>
            <option value="1000">${t('logs.lines', { n: 1000 })}</option>
          </select>
          <button class="btn btn-sm btn-secondary" id="logStreamBtn" onclick="VPSLogs.togglestream()">${t('logs.start')}</button>
          <button class="btn btn-sm btn-secondary" onclick="VPSLogs.loadlog()">${t('logs.refresh')}</button>
          <button class="btn btn-sm btn-secondary" onclick="VPSLogs.clearlog()">${t('logs.clear')}</button>
        </div>
      </div>
      <div class="vps-log-wrap">
        <div class="vps-log-output" id="logOutput"></div>
      </div>
      <div class="vps-log-search">
        <input type="text" class="vps-log-search-input" id="logSearchInput" placeholder="${t('logs.filter')}" oninput="VPSLogs.filterlogs(this.value)" />
      </div>`;
  },

  async loadlog() {
    if (!this.server) return;
    let cmd;
    if (this._logpath === '__journal__') {
      cmd = `journalctl --no-pager -n ${this._lines}`;
    } else if (this._logpath === '__dmesg__') {
      cmd = `dmesg | tail -n ${this._lines}`;
    } else {
      cmd = `tail -n ${this._lines} ${this._logpath}`;
    }
    const res = await this.exec(cmd);
    if (res?.error) return;
    if (!Utils.el('logOutput')) this.render();
    const output = Utils.el('logOutput');
    if (!output) return;
    const text = (res?.stdout || '') + (res?.stderr || '');
    if (!text.trim()) {
      output.innerHTML = `<div class="vps-log-empty">${t('logs.empty')}</div>`;
      return;
    }
    this.renderlines(text.split('\n'));
  },

  renderlines(lines) {
    const output = Utils.el('logOutput');
    if (!output) return;
    const filter = (Utils.el('logSearchInput')?.value || '').toLowerCase();
    let filtered = lines;
    if (filter) filtered = lines.filter(l => l.toLowerCase().includes(filter));

    output.innerHTML = filtered.map(l => {
      let cls = 'vps-log-line';
      const lower = l.toLowerCase();
      if (lower.includes('error') || lower.includes('fatal') || lower.includes('panic')) cls += ' log-error';
      else if (lower.includes('warn')) cls += ' log-warn';
      else if (lower.includes('info')) cls += ' log-info';
      return `<div class="${cls}">${Utils.escape(l)}</div>`;
    }).join('');
    output.scrollTop = output.scrollHeight;
  },

  filterlogs(q) {
    const output = Utils.el('logOutput');
    if (!output) return;
    const lines = output.querySelectorAll('.vps-log-line');
    const ql = q.toLowerCase();
    lines.forEach(l => {
      l.style.display = !ql || l.textContent.toLowerCase().includes(ql) ? '' : 'none';
    });
  },

  changelog(path) {
    this._logpath = path;
    this._streaming = false;
    if (this._interval) { clearInterval(this._interval); this._interval = null; }
    const btn = Utils.el('logStreamBtn');
    if (btn) btn.textContent = t('logs.start');
    this.loadlog();
  },

  changelines(val) {
    this._lines = parseInt(val) || 500;
    this.loadlog();
  },

  togglestream() {
    this._streaming = !this._streaming;
    const btn = Utils.el('logStreamBtn');
    if (this._streaming) {
      if (btn) btn.textContent = t('logs.stop');
      this._interval = setInterval(() => this.loadlog(), 2000);
    } else {
      if (btn) btn.textContent = t('logs.start');
      if (this._interval) { clearInterval(this._interval); this._interval = null; }
    }
  },

  clearlog() {
    const output = Utils.el('logOutput');
    if (output) output.innerHTML = '';
  },

  async exec(command) {
    const cfg = { host: this.server.host, port: this.server.port || 22, username: this.server.username || 'root' };
    if (this.server.authType === 'key') { const pk = await Servers.resolvevpsprivatekey(this.server); if (pk) { cfg.authType = 'privateKey'; cfg.privateKey = pk; } }
    if (!cfg.authType) { cfg.authType = 'password'; cfg.password = this.server.password || ''; }
    if ((this.server.username || 'root') !== 'root') {
      const pass = (this.server.password || '').replace(/'/g, "'\\''");
      return await window.electronAPI.sshexec(cfg, `echo '${pass}' | sudo -S sh -c '${command.replace(/'/g, "'\\''")}' 2>/dev/null`);
    }
    return await window.electronAPI.sshexec(cfg, command);
  }
};
