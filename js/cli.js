const CLI = {
  _open: false,
  _history: [],
  _histidx: -1,
  _cmdlog: [],

  init() {
    document.getElementById('cliToggle')?.addEventListener('click', () => this.toggle());
  },

  toggle() {
    this._open ? this.close() : this.open();
  },

  open() {
    let panel = document.getElementById('cliPanel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'cliPanel';
      panel.className = 'cli-panel';
      panel.innerHTML = `
        <div class="cli-header">
          <span class="cli-title">CTRLServers</span>
          <button class="cli-close" onclick="CLI.close()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="cli-output" id="cliOutput"></div>
        <div class="cli-input-row">
          <span class="cli-prompt">&gt;</span>
          <input class="cli-input" id="cliInput" type="text" autocomplete="off" spellcheck="false" placeholder="${Utils.escape(t('cli.placeholder'))}" />
        </div>`;
      document.querySelector('.app-body').appendChild(panel);
      document.getElementById('cliInput').addEventListener('keydown', (e) => this.onkey(e));
    }
    this._open = true;
    panel.classList.add('open');
    this.print(t('cli.welcome'), 'cli-info');
    setTimeout(() => document.getElementById('cliInput')?.focus(), 100);
  },

  close() {
    const panel = document.getElementById('cliPanel');
    if (panel) panel.classList.remove('open');
    this._open = false;
  },

  print(text, cls) {
    const out = document.getElementById('cliOutput');
    if (!out) return;
    const line = document.createElement('div');
    line.className = 'cli-line' + (cls ? ' ' + cls : '');
    line.textContent = text;
    out.appendChild(line);
    out.scrollTop = out.scrollHeight;
  },

  printhtml(html, cls) {
    const out = document.getElementById('cliOutput');
    if (!out) return;
    const line = document.createElement('div');
    line.className = 'cli-line' + (cls ? ' ' + cls : '');
    line.innerHTML = html;
    out.appendChild(line);
    out.scrollTop = out.scrollHeight;
  },

  onkey(e) {
    if (e.key === 'Enter') {
      const input = document.getElementById('cliInput');
      const cmd = (input.value || '').trim();
      input.value = '';
      if (!cmd) return;
      this._history.push(cmd);
      this._histidx = this._history.length;
      this.print('> ' + cmd, 'cli-cmd');
      this.exec(cmd);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (this._histidx > 0) {
        this._histidx--;
        document.getElementById('cliInput').value = this._history[this._histidx];
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (this._histidx < this._history.length - 1) {
        this._histidx++;
        document.getElementById('cliInput').value = this._history[this._histidx];
      } else {
        this._histidx = this._history.length;
        document.getElementById('cliInput').value = '';
      }
    } else if (e.key === 'Escape') {
      this.close();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      this.autocomplete();
    }
  },

  autocomplete() {
    const input = document.getElementById('cliInput');
    const val = input.value.toLowerCase();
    const cmds = ['help', 'list servers', 'start', 'stop', 'restart', 'status', 'add server', 'remove server', 'theme', 'lock', 'monitor start', 'monitor stop', 'monitor status', 'clear', 'export', 'import'];
    const match = cmds.find(c => c.startsWith(val) && c !== val);
    if (match) input.value = match;
  },

  exec(raw) {
    const parts = raw.split(/\s+/);
    const cmd = parts[0]?.toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {
      case 'help': return this.cmdhelp(args);
      case 'list': return this.cmdlist(args);
      case 'start': return this.cmdstart(args);
      case 'stop': return this.cmdstop(args);
      case 'restart': return this.cmdrestart(args);
      case 'status': return this.cmdstatus(args);
      case 'add': return this.cmdadd(args);
      case 'remove': return this.cmdremove(args);
      case 'theme': return this.cmdtheme(args);
      case 'lock': return this.cmdlock();
      case 'monitor': return this.cmdmonitor(args);
      case 'clear': return this.cmdclear();
      case 'export': return this.cmdexport();
      case 'import': return this.cmdimport();
      default:
        this.print(t('cli.unknown', { cmd }), 'cli-error');
    }
  },

  _findserver(name) {
    const q = name.toLowerCase();
    return Servers.list.find(s => s.name.toLowerCase() === q || s.name.toLowerCase().includes(q));
  },

  cmdhelp() {
    const lines = [
      ['help', t('cli.help.help')],
      ['list servers', t('cli.help.list')],
      ['start <name>', t('cli.help.start')],
      ['stop <name>', t('cli.help.stop')],
      ['restart <name>', t('cli.help.restart')],
      ['status <name>', t('cli.help.status')],
      ['add server', t('cli.help.add')],
      ['remove <name>', t('cli.help.remove')],
      ['theme <dark|light|oled>', t('cli.help.theme')],
      ['lock', t('cli.help.lock')],
      ['monitor start', t('cli.help.monitor_start')],
      ['monitor stop', t('cli.help.monitor_stop')],
      ['monitor status', t('cli.help.monitor_status')],
      ['export', t('cli.help.export')],
      ['import', t('cli.help.import')],
      ['clear', t('cli.help.clear')],
    ];
    this.print(t('cli.available_commands'), 'cli-info');
    lines.forEach(([cmd, desc]) => {
      this.printhtml(`<span class="cli-cmd-name">${cmd}</span> <span class="cli-cmd-desc">${Utils.escape(desc)}</span>`);
    });
  },

  cmdlist(args) {
    const q = args.join(' ').toLowerCase();
    if (q && q !== 'servers') {
      this.print(t('cli.usage.list'), 'cli-error');
      return;
    }
    const list = Servers.list;
    if (!list.length) { this.print(t('cli.no_servers'), 'cli-info'); return; }
    this.print(t('cli.servers_count', { count: list.length }), 'cli-info');
    list.forEach((s, i) => {
      const status = s.status || t('cli.unknown_status');
      const stcls = status === 'online' || status === 'running' ? 'cli-ok' : status === 'offline' ? 'cli-err' : '';
      this.printhtml(`<span class="cli-idx">${i + 1}.</span> <span class="cli-srv-name">${Utils.escape(s.name)}</span> <span class="cli-tag">[${s.type}]</span> <span class="${stcls}">${status}</span>`);
    });
  },

  async cmdstart(args) {
    const name = args.join(' ');
    if (!name) { this.print(t('cli.usage.start'), 'cli-error'); return; }
    const server = this._findserver(name);
    if (!server) { this.print(t('cli.server_not_found', { name }), 'cli-error'); return; }
    if (server.type !== 'Pterodactyl') { this.print(t('cli.ptero_only'), 'cli-error'); return; }
    const idx = Servers.list.indexOf(server);
    await Servers.quickpower(idx, 'start');
    this.print(t('cli.starting', { name: server.name }), 'cli-ok');
  },

  async cmdstop(args) {
    const name = args.join(' ');
    if (!name) { this.print(t('cli.usage.stop'), 'cli-error'); return; }
    const server = this._findserver(name);
    if (!server) { this.print(t('cli.server_not_found', { name }), 'cli-error'); return; }
    if (server.type !== 'Pterodactyl') { this.print(t('cli.ptero_only'), 'cli-error'); return; }
    const idx = Servers.list.indexOf(server);
    await Servers.quickpower(idx, 'stop');
    this.print(t('cli.stopping', { name: server.name }), 'cli-ok');
  },

  async cmdrestart(args) {
    const name = args.join(' ');
    if (!name) { this.print(t('cli.usage.restart'), 'cli-error'); return; }
    const server = this._findserver(name);
    if (!server) { this.print(t('cli.server_not_found', { name }), 'cli-error'); return; }
    if (server.type !== 'Pterodactyl') { this.print(t('cli.ptero_only'), 'cli-error'); return; }
    const idx = Servers.list.indexOf(server);
    await Servers.quickpower(idx, 'restart');
    this.print(t('cli.restarting', { name: server.name }), 'cli-ok');
  },

  cmdstatus(args) {
    const name = args.join(' ');
    if (!name) { this.print(t('cli.usage.status'), 'cli-error'); return; }
    const server = this._findserver(name);
    if (!server) { this.print(t('cli.server_not_found', { name }), 'cli-error'); return; }
    const st = server.status || t('cli.unknown_status');
    const res = Servers.resources[server.uuid] || {};
    const vst = Servers.vpsstats[server.id];
    this.printhtml(`<span class="cli-srv-name">${Utils.escape(server.name)}</span>`);
    this.print(t('cli.status.type', { type: server.type }));
    this.print(t('cli.status.status', { status: st }));
    this.print(t('cli.status.host', { host: `${server.host || t('cli.na')}:${server.port || ''}` }));
    if (server.type === 'Pterodactyl') {
      if (res.cpu !== undefined) this.print(t('cli.status.cpu', { value: res.cpu?.toFixed(1) }));
      if (res.memory_bytes !== undefined) this.print(t('cli.status.ram', { used: Utils.formatbytes(res.memory_bytes), total: Utils.formatmb(server.limits?.memory) }));
      if (res.disk_bytes !== undefined) this.print(t('cli.status.disk', { used: Utils.formatbytes(res.disk_bytes), total: Utils.formatmb(server.limits?.disk) }));
      if (res.uptime) this.print(t('cli.status.uptime', { value: Utils.formatuptime(res.uptime) }));
    }
    if (vst) {
      this.print(t('cli.status.ram', { used: Utils.formatbytes(vst.memUsed), total: Utils.formatbytes(vst.memTotal) }));
      this.print(t('cli.status.disk', { used: Utils.formatbytes(vst.diskUsed), total: Utils.formatbytes(vst.diskTotal) }));
      this.print(t('cli.status.swap', { used: Utils.formatbytes(vst.swapUsed), total: Utils.formatbytes(vst.swapTotal) }));
      this.print(t('cli.status.load', { one: vst.load1.toFixed(2), five: vst.load5.toFixed(2), fifteen: vst.load15.toFixed(2) }));
    }
  },

  cmdadd(args) {
    Servers.openaddmodal();
    this.print(t('cli.add_opening'), 'cli-info');
  },

  cmdremove(args) {
    const name = args.join(' ');
    if (!name) { this.print(t('cli.usage.remove'), 'cli-error'); return; }
    const server = this._findserver(name);
    if (!server) { this.print(t('cli.server_not_found', { name }), 'cli-error'); return; }
    const idx = Servers.list.indexOf(server);
    Servers.deleteserver(idx);
    this.print(t('cli.removed', { name: server.name }), 'cli-ok');
  },

  cmdtheme(args) {
    const theme = args[0]?.toLowerCase();
    if (!theme || !['dark', 'light', 'oled'].includes(theme)) {
      this.print(t('cli.usage.theme'), 'cli-error');
      return;
    }
    Theme.settheme(theme);
    this.print(t('cli.theme_set', { theme }), 'cli-ok');
  },

  cmdlock() {
    LockScreen.lock();
    this.print(t('cli.locked'), 'cli-info');
  },

  async cmdmonitor(args) {
    const action = args[0]?.toLowerCase();
    if (action === 'start') {
      await AppSettings.startmonitor();
      this.print(t('cli.monitor.started'), 'cli-ok');
    } else if (action === 'stop') {
      await AppSettings.stopmonitor();
      this.print(t('cli.monitor.stopped'), 'cli-ok');
    } else if (action === 'status') {
      const status = await window.electronAPI?.monitorstatus?.();
      this.print(t('cli.monitor.line', { state: status?.running ? t('cli.monitor.running') : t('cli.monitor.stopped_state') }));
      if (status?.running) {
        this.print(t('cli.monitor.pid', { pid: status.pid }));
        this.print(t('cli.monitor.interval', { seconds: status.tick }));
        this.print(t('cli.monitor.servers', { count: status.serverCount }));
      }
    } else {
      this.print(t('cli.usage.monitor'), 'cli-error');
    }
  },

  cmdclear() {
    const out = document.getElementById('cliOutput');
    if (out) out.innerHTML = '';
  },

  cmdexport() {
    Servers.exportlist();
    this.print(t('cli.exported'), 'cli-ok');
  },

  cmdimport() {
    Servers.importlist();
    this.print(t('cli.import_opening'), 'cli-info');
  }
};
