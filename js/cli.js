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
          <input class="cli-input" id="cliInput" type="text" autocomplete="off" spellcheck="false" placeholder="Type 'help' for commands..." />
        </div>`;
      document.querySelector('.app-body').appendChild(panel);
      document.getElementById('cliInput').addEventListener('keydown', (e) => this.onkey(e));
    }
    this._open = true;
    panel.classList.add('open');
    this.print('Welcome to CTRLServers. Type "help" for commands.', 'cli-info');
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
        this.print(`Unknown command: "${cmd}". Type "help" for available commands.`, 'cli-error');
    }
  },

  _findserver(name) {
    const q = name.toLowerCase();
    return Servers.list.find(s => s.name.toLowerCase() === q || s.name.toLowerCase().includes(q));
  },

  cmdhelp() {
    const lines = [
      ['help', 'Show this help'],
      ['list servers', 'List all servers'],
      ['start <name>', 'Start a Pterodactyl server'],
      ['stop <name>', 'Stop a Pterodactyl server'],
      ['restart <name>', 'Restart a Pterodactyl server'],
      ['status <name>', 'Show server status and stats'],
      ['add server', 'Open add server dialog'],
      ['remove <name>', 'Remove a server'],
      ['theme <dark|light|oled>', 'Switch theme'],
      ['lock', 'Lock the app'],
      ['monitor start', 'Start background monitor'],
      ['monitor stop', 'Stop background monitor'],
      ['monitor status', 'Show monitor status'],
      ['export', 'Export servers to clipboard'],
      ['import', 'Import servers from clipboard'],
      ['clear', 'Clear terminal output'],
    ];
    this.print('Available commands:', 'cli-info');
    lines.forEach(([cmd, desc]) => {
      this.printhtml(`<span class="cli-cmd-name">${cmd}</span> <span class="cli-cmd-desc">${desc}</span>`);
    });
  },

  cmdlist(args) {
    const q = args.join(' ').toLowerCase();
    if (q && q !== 'servers') {
      this.print('Usage: list servers', 'cli-error');
      return;
    }
    const list = Servers.list;
    if (!list.length) { this.print('No servers found.', 'cli-info'); return; }
    this.print(`Servers (${list.length}):`, 'cli-info');
    list.forEach((s, i) => {
      const status = s.status || 'unknown';
      const stcls = status === 'online' || status === 'running' ? 'cli-ok' : status === 'offline' ? 'cli-err' : '';
      this.printhtml(`<span class="cli-idx">${i + 1}.</span> <span class="cli-srv-name">${Utils.escape(s.name)}</span> <span class="cli-tag">[${s.type}]</span> <span class="${stcls}">${status}</span>`);
    });
  },

  async cmdstart(args) {
    const name = args.join(' ');
    if (!name) { this.print('Usage: start <server name>', 'cli-error'); return; }
    const server = this._findserver(name);
    if (!server) { this.print(`Server "${name}" not found.`, 'cli-error'); return; }
    if (server.type !== 'Pterodactyl') { this.print('Start/stop only works for Pterodactyl servers.', 'cli-error'); return; }
    const idx = Servers.list.indexOf(server);
    await Servers.quickpower(idx, 'start');
    this.print(`Starting ${server.name}...`, 'cli-ok');
  },

  async cmdstop(args) {
    const name = args.join(' ');
    if (!name) { this.print('Usage: stop <server name>', 'cli-error'); return; }
    const server = this._findserver(name);
    if (!server) { this.print(`Server "${name}" not found.`, 'cli-error'); return; }
    if (server.type !== 'Pterodactyl') { this.print('Start/stop only works for Pterodactyl servers.', 'cli-error'); return; }
    const idx = Servers.list.indexOf(server);
    await Servers.quickpower(idx, 'stop');
    this.print(`Stopping ${server.name}...`, 'cli-ok');
  },

  async cmdrestart(args) {
    const name = args.join(' ');
    if (!name) { this.print('Usage: restart <server name>', 'cli-error'); return; }
    const server = this._findserver(name);
    if (!server) { this.print(`Server "${name}" not found.`, 'cli-error'); return; }
    if (server.type !== 'Pterodactyl') { this.print('Start/stop only works for Pterodactyl servers.', 'cli-error'); return; }
    const idx = Servers.list.indexOf(server);
    await Servers.quickpower(idx, 'restart');
    this.print(`Restarting ${server.name}...`, 'cli-ok');
  },

  cmdstatus(args) {
    const name = args.join(' ');
    if (!name) { this.print('Usage: status <server name>', 'cli-error'); return; }
    const server = this._findserver(name);
    if (!server) { this.print(`Server "${name}" not found.`, 'cli-error'); return; }
    const st = server.status || 'unknown';
    const res = Servers.resources[server.uuid] || {};
    const vst = Servers.vpsstats[server.id];
    this.printhtml(`<span class="cli-srv-name">${Utils.escape(server.name)}</span>`);
    this.print(`  Type: ${server.type}`);
    this.print(`  Status: ${st}`);
    this.print(`  Host: ${server.host || 'N/A'}:${server.port || ''}`);
    if (server.type === 'Pterodactyl') {
      if (res.cpu !== undefined) this.print(`  CPU: ${res.cpu?.toFixed(1)}%`);
      if (res.memory_bytes !== undefined) this.print(`  RAM: ${Utils.formatbytes(res.memory_bytes)} / ${Utils.formatmb(server.limits?.memory)}`);
      if (res.disk_bytes !== undefined) this.print(`  Disk: ${Utils.formatbytes(res.disk_bytes)} / ${Utils.formatmb(server.limits?.disk)}`);
      if (res.uptime) this.print(`  Uptime: ${Utils.formatuptime(res.uptime)}`);
    }
    if (vst) {
      this.print(`  RAM: ${Utils.formatbytes(vst.memUsed)} / ${Utils.formatbytes(vst.memTotal)}`);
      this.print(`  Disk: ${Utils.formatbytes(vst.diskUsed)} / ${Utils.formatbytes(vst.diskTotal)}`);
      this.print(`  Swap: ${Utils.formatbytes(vst.swapUsed)} / ${Utils.formatbytes(vst.swapTotal)}`);
      this.print(`  Load: ${vst.load1.toFixed(2)} / ${vst.load5.toFixed(2)} / ${vst.load15.toFixed(2)}`);
    }
  },

  cmdadd(args) {
    Servers.openaddmodal();
    this.print('Opening add server dialog...', 'cli-info');
  },

  cmdremove(args) {
    const name = args.join(' ');
    if (!name) { this.print('Usage: remove <server name>', 'cli-error'); return; }
    const server = this._findserver(name);
    if (!server) { this.print(`Server "${name}" not found.`, 'cli-error'); return; }
    const idx = Servers.list.indexOf(server);
    Servers.deleteserver(idx);
    this.print(`Removed ${server.name}.`, 'cli-ok');
  },

  cmdtheme(args) {
    const t = args[0]?.toLowerCase();
    if (!t || !['dark', 'light', 'oled'].includes(t)) {
      this.print('Usage: theme <dark|light|oled>', 'cli-error');
      return;
    }
    Theme.settheme(t);
    this.print(`Theme set to ${t}.`, 'cli-ok');
  },

  cmdlock() {
    LockScreen.lock();
    this.print('App locked.', 'cli-info');
  },

  async cmdmonitor(args) {
    const action = args[0]?.toLowerCase();
    if (action === 'start') {
      await AppSettings.startmonitor();
      this.print('Monitor started.', 'cli-ok');
    } else if (action === 'stop') {
      await AppSettings.stopmonitor();
      this.print('Monitor stopped.', 'cli-ok');
    } else if (action === 'status') {
      const status = await window.electronAPI?.monitorstatus?.();
      this.print(`Monitor: ${status?.running ? 'Running' : 'Stopped'}`);
      if (status?.running) {
        this.print(`  PID: ${status.pid}`);
        this.print(`  Interval: ${status.tick}s`);
        this.print(`  Servers: ${status.serverCount}`);
      }
    } else {
      this.print('Usage: monitor <start|stop|status>', 'cli-error');
    }
  },

  cmdclear() {
    const out = document.getElementById('cliOutput');
    if (out) out.innerHTML = '';
  },

  cmdexport() {
    Servers.exportlist();
    this.print('Servers exported to clipboard.', 'cli-ok');
  },

  cmdimport() {
    Servers.importlist();
    this.print('Opening import dialog...', 'cli-info');
  }
};
