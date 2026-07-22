const ServerConsole = {
  wsId: null,
  server: null,
  serverInfo: null,
  connected: false,
  _listenersSetup: false,

  init(server) {
    this.destroy();
    this.server = server;
    this.connected = false;
    this._hasOutput = false;
    if (!this._listenersSetup) {
      this.setuplisteners();
      this._listenersSetup = true;
    }
    this.connect();
    this.loadserverinfo();
    this._updateconsolestate();
    this._updatebuttons(server.status || 'offline');
  },

  destroy() {
    if (this.wsId !== null) {
      window.electronAPI.closews(this.wsId);
      this.wsId = null;
    }
    this.server = null;
    this.serverInfo = null;
    this.connected = false;
  },

  setuplisteners() {
    window.electronAPI.onwsmessage((id, data) => {
      if (id !== this.wsId) return;
      try {
        const msg = JSON.parse(data);
        switch (msg.event) {
          case 'auth success':
            this.connected = true;
            this.log('system', 'Authenticated');
            this._updateconsolestate();
            window.electronAPI.sendws(this.wsId, JSON.stringify({ event: 'send logs', args: [null] }));
            window.electronAPI.sendws(this.wsId, JSON.stringify({ event: 'send stats', args: [null] }));
            break;
          case 'console output':
            if (msg.args && msg.args[0]) {
              this.log('output', msg.args[0]);
            }
            break;
          case 'stats':
            if (msg.args && msg.args[0]) {
              this.handlestats(msg.args[0]);
            }
            break;
          case 'status':
            this.handlestatus(msg.args && msg.args[0]);
            break;
          case 'auth error':
          case 'auth failed':
          case 'jwt error':
            this.log('error', 'Authentication failed');
            break;
          case 'daemon message':
            if (msg.args && msg.args[0]) this.log('system', msg.args[0]);
            break;
          case 'install output':
            if (msg.args && msg.args[0]) this.log('system', msg.args[0]);
            break;
          case 'token expired':
            this.log('error', 'Token expired');
            if (this.wsId !== null) window.electronAPI.closews(this.wsId);
            break;
        }
      } catch (e) {}
    });

    window.electronAPI.onwsclose((id, code, reason) => {
      if (id !== this.wsId) return;
      this.connected = false;
      this.log('system', 'Disconnected (code: ' + code + ')');
      this._updateconsolestate();
      if (this.server) {
        setTimeout(() => this.connect(), 5000);
      }
    });

    window.electronAPI.onwserror((id, err) => {
      if (id !== this.wsId) return;
      this.log('error', 'Error: ' + err);
    });
  },

  async loadserverinfo() {
    try {
      this.serverInfo = await Api.getcachedserver(this.server.panelUrl, this.server.apiKey, this.server.uuid);
    } catch (e) {}
  },

  updateresources(uuid) {
    const res = Servers.resources[uuid];
    if (!res) return;
    const server = this.server;
    const memUsed = res.memory_bytes || 0;
    const memTotal = (server.limits?.memory || 0) * 1024 * 1024;
    const diskUsed = res.disk_bytes || 0;
    const diskTotal = (server.limits?.disk || 0) * 1024 * 1024;

    Utils.el('resCpu').textContent = (res.cpu || 0).toFixed(1) + '%';
    Utils.el('resRam').textContent = Utils.formatbytes(memUsed) + ' / ' + Utils.formatmb(server.limits?.memory);
    Utils.el('resDisk').textContent = Utils.formatbytes(diskUsed) + ' / ' + Utils.formatmb(server.limits?.disk);
    Utils.el('resUptime').textContent = Utils.formatuptime(res.uptime);

    const cpuPct = Math.min(res.cpu || 0, 100);
    const ramPct = memTotal > 0 ? Math.min((memUsed / memTotal) * 100, 100) : 0;
    const diskPct = diskTotal > 0 ? Math.min((diskUsed / diskTotal) * 100, 100) : 0;

    const cpuRing = Utils.el('resCpuRing');
    const ramRing = Utils.el('resRamRing');
    const diskRing = Utils.el('resDiskRing');
    if (cpuRing) {
      cpuRing.style.strokeDashoffset = 100 - cpuPct;
      cpuRing.style.stroke = this._loadcolor(cpuPct);
    }
    if (ramRing) {
      ramRing.style.strokeDashoffset = 100 - ramPct;
      ramRing.style.stroke = this._loadcolor(ramPct);
    }
    if (diskRing) {
      diskRing.style.strokeDashoffset = 100 - diskPct;
      diskRing.style.stroke = this._loadcolor(diskPct);
    }

    const uptimeRing = Utils.el('resUptimeRing');
    if (uptimeRing) {
      uptimeRing.style.strokeDashoffset = 0;
      uptimeRing.style.stroke = 'var(--text-muted)';
    }
  },

  _loadcolor(pct) {
    if (pct >= 80) return '#ef4444';
    if (pct >= 50) return '#f59e0b';
    return '#22c55e';
  },

  async connect() {
    if (!this.server || !this.server.apiKey || !this.server.panelUrl) return;
    if (this.connected) return;

    try {
      const data = await Api.fetchwebsocket(this.server.panelUrl, this.server.apiKey, this.server.uuid);
      if (!data || !data.socket || !data.token) {
        this.log('error', 'Invalid WebSocket response');
        return;
      }

      this.log('system', 'Connecting...');
      const id = await window.electronAPI.connectwebsocket(data.socket, data.token, {
        'Authorization': 'Bearer ' + this.server.apiKey,
        'Accept': 'application/vnd.pterodactyl.v1+json'
      }, this.server.panelUrl);
      this.wsId = id;
    } catch (e) {
      this.log('error', 'Failed: ' + e.message);
      if (this.server) {
        setTimeout(() => this.connect(), 5000);
      }
    }
  },

  handlestats(raw) {
    try {
      const stats = JSON.parse(raw);
      Servers.resources[this.server.uuid] = {
        state: stats.state,
        memory_bytes: stats.memory_bytes,
        cpu: stats.cpu_absolute,
        disk_bytes: stats.disk_bytes,
        uptime: stats.uptime
      };
      this.server.status = stats.state;
      Servers.save();
      this.updateresources(this.server.uuid);
      this._updateconsolestate();
      this._updatebuttons(stats.state);
    } catch (e) {}
  },

  handlestatus(state) {
    this.server.status = state;
    if (Servers.resources[this.server.uuid]) {
      Servers.resources[this.server.uuid].state = state;
    }
    Servers.save();
    this.updateresources(this.server.uuid);
    this._updateconsolestate();
    this._updatebuttons(state);
  },

  _updatebuttons(state) {
    const btnStart = Utils.el('btnStart');
    const btnStop = Utils.el('btnStop');
    const btnRestart = Utils.el('btnRestart');
    const btnKill = Utils.el('btnKill');
    if (!btnStart) return;

    if (state === 'running') {
      btnStart.disabled = true;
      btnStop.disabled = false;
      btnRestart.disabled = false;
      btnKill.disabled = false;
    } else if (state === 'starting' || state === 'stopping') {
      btnStart.disabled = true;
      btnStop.disabled = false;
      btnRestart.disabled = true;
      btnKill.disabled = false;
    } else {
      btnStart.disabled = false;
      btnStop.disabled = true;
      btnRestart.disabled = true;
      btnKill.disabled = true;
    }
  },

  send() {
    const input = Utils.el('consoleInput');
    const cmd = input.value.trim();
    if (!cmd || !this.connected || this.wsId === null) return;
    window.electronAPI.sendws(this.wsId, JSON.stringify({ event: 'send command', args: [cmd] }));
    input.value = '';
  },

  log(type, text) {
    const output = Utils.el('consoleOutput');
    const line = document.createElement('div');
    line.className = 'console-line console-' + type;
    if (type === 'output') {
      let html = Utils.ansitohtml(text);
      html = html.replace(/^[^<]*?\[/, '[');
      line.innerHTML = html;
    } else {
      line.textContent = text;
    }
    output.appendChild(line);
    output.scrollTop = output.scrollHeight;

    if (type === 'output' && !this._hasOutput) {
      this._hasOutput = true;
      this._updateconsolestate();
    }
  },

  _updateconsolestate() {
    const empty = Utils.el('consoleEmpty');
    const offline = Utils.el('consoleOffline');
    const connecting = Utils.el('consoleConnecting');
    if (!empty || !offline) return;

    if (this._hasOutput) {
      if (connecting) connecting.style.display = 'none';
      empty.style.display = 'none';
      offline.style.display = 'none';
      return;
    }

    const isOffline = this.server && this.server.status !== 'running';
    const isConnecting = this.server && this.server.status === 'running' && !this.connected && !this._hasOutput;

    if (isOffline) {
      if (connecting) connecting.style.display = 'none';
      empty.style.display = 'none';
      offline.style.display = '';
    } else if (isConnecting) {
      empty.style.display = 'none';
      offline.style.display = 'none';
      if (connecting) connecting.style.display = '';
    } else {
      if (connecting) connecting.style.display = 'none';
      empty.style.display = '';
      offline.style.display = 'none';
    }
  },

  async power(signal) {
    if (!this.server) return;
    if (signal === 'kill') {
      Modal.confirm('Force Stop', 'Kill may corrupt server files. Are you sure?', () => {
        this.sendpower('kill');
      });
      return;
    }
    this.sendpower(signal);
  },

  sendpower(signal) {
    if (this.connected && this.wsId !== null) {
      window.electronAPI.sendws(this.wsId, JSON.stringify({ event: 'set state', args: [signal] }));
    } else {
      Api.power(this.server.panelUrl, this.server.apiKey, this.server.uuid, signal);
    }
  },

  confirmkill() {
    this.power('kill');
  }
};
