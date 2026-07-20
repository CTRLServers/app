const ServerConsole = {
  wsid: null,
  server: null,
  serverinfo: null,
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
    this._updateConsoleState();
    this._updateButtons(server.status || 'offline');
  },

  destroy() {
    if (this.wsid !== null) {
      window.electronapi.closews(this.wsid);
      this.wsid = null;
    }
    this.server = null;
    this.serverinfo = null;
    this.connected = false;
  },

  setuplisteners() {
    window.electronapi.onwsmessage((id, data) => {
      if (id !== this.wsid) return;
      try {
        const msg = JSON.parse(data);
        switch (msg.event) {
          case 'auth success':
            this.connected = true;
            this.log('system', 'Authenticated');
            window.electronapi.sendws(this.wsid, JSON.stringify({ event: 'send logs', args: [null] }));
            window.electronapi.sendws(this.wsid, JSON.stringify({ event: 'send stats', args: [null] }));
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
            if (this.wsid !== null) window.electronapi.closews(this.wsid);
            break;
        }
      } catch (e) { /* silent */ }
    });

    window.electronapi.onwsclose((id, code, reason) => {
      if (id !== this.wsid) return;
      this.connected = false;
      this.log('system', 'Disconnected (code: ' + code + ')');
      if (this.server) {
        setTimeout(() => this.connect(), 5000);
      }
    });

    window.electronapi.onwserror((id, err) => {
      if (id !== this.wsid) return;
      this.log('error', 'Error: ' + err);
    });
  },

  async loadserverinfo() {
    try {
      this.serverinfo = await Api.getcachedserver(this.server.panelurl, this.server.apikey, this.server.uuid);
    } catch (e) { /* silent */ }
  },

  updateresources(uuid) {
    const res = Servers.resources[uuid];
    if (!res) return;
    const server = this.server;
    const memused = res.memory_bytes || 0;
    const memtotal = (server.limits?.memory || 0) * 1024 * 1024;
    const diskused = res.disk_bytes || 0;
    const disktotal = (server.limits?.disk || 0) * 1024 * 1024;

    Utils.el('rescpu').textContent = (res.cpu || 0).toFixed(1) + '%';
    Utils.el('resram').textContent = Utils.formatbytes(memused) + ' / ' + Utils.formatmb(server.limits?.memory);
    Utils.el('resdisk').textContent = Utils.formatbytes(diskused) + ' / ' + Utils.formatmb(server.limits?.disk);
    Utils.el('resuptime').textContent = Utils.formatuptime(res.uptime);

    const cpupct = Math.min(res.cpu || 0, 100);
    const rampct = memtotal > 0 ? Math.min((memused / memtotal) * 100, 100) : 0;
    const diskpct = disktotal > 0 ? Math.min((diskused / disktotal) * 100, 100) : 0;

    const cpuring = Utils.el('rescpuring');
    const ramring = Utils.el('resramring');
    const diskring = Utils.el('resdiskring');
    if (cpuring) {
      cpuring.style.strokedashoffset = 100 - cpupct;
      cpuring.style.stroke = this._loadColor(cpupct);
    }
    if (ramring) {
      ramring.style.strokedashoffset = 100 - rampct;
      ramring.style.stroke = this._loadColor(rampct);
    }
    if (diskring) {
      diskring.style.strokedashoffset = 100 - diskpct;
      diskring.style.stroke = this._loadColor(diskpct);
    }

    const uptimering = Utils.el('resuptimering');
    if (uptimering) {
      uptimering.style.strokedashoffset = 0;
      uptimering.style.stroke = 'var(--text-muted)';
    }
  },

  _loadColor(pct) {
    if (pct >= 80) return '#ef4444';
    if (pct >= 50) return '#f59e0b';
    return '#22c55e';
  },

  async connect() {
    if (!this.server || !this.server.apikey || !this.server.panelurl) return;
    if (this.connected) return;

    try {
      const data = await Api.fetchwebsocket(this.server.panelurl, this.server.apikey, this.server.uuid);
      if (!data || !data.socket || !data.token) {
        this.log('error', 'Invalid WebSocket response');
        return;
      }

      this.log('system', 'Connecting...');
      const id = await window.electronapi.connectwebsocket(data.socket, data.token, {
        'Authorization': 'Bearer ' + this.server.apikey,
        'Accept': 'application/vnd.pterodactyl.v1+json'
      }, this.server.panelurl);
      this.wsid = id;
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
      this._updateConsoleState();
      this._updateButtons(stats.state);
    } catch (e) { /* silent */ }
  },

  handlestatus(state) {
    this.server.status = state;
    if (Servers.resources[this.server.uuid]) {
      Servers.resources[this.server.uuid].state = state;
    }
    Servers.save();
    this.updateresources(this.server.uuid);
    this._updateConsoleState();
    this._updateButtons(state);
  },

  _updateButtons(state) {
    const btnstart = Utils.el('btnstart');
    const btnstop = Utils.el('btnstop');
    const btnrestart = Utils.el('btnrestart');
    const btnkill = Utils.el('btnkill');
    if (!btnstart) return;

    if (state === 'running') {
      btnstart.disabled = true;
      btnstop.disabled = false;
      btnrestart.disabled = false;
      btnkill.disabled = false;
    } else if (state === 'starting' || state === 'stopping') {
      btnstart.disabled = true;
      btnstop.disabled = false;
      btnrestart.disabled = true;
      btnkill.disabled = false;
    } else {
      btnstart.disabled = false;
      btnstop.disabled = true;
      btnrestart.disabled = true;
      btnkill.disabled = true;
    }
  },

  send() {
    const input = Utils.el('consoleinput');
    const cmd = input.value.trim();
    if (!cmd || !this.connected || this.wsid === null) return;
    window.electronapi.sendws(this.wsid, JSON.stringify({ event: 'send command', args: [cmd] }));
    input.value = '';
  },

  log(type, text) {
    const output = Utils.el('consoleoutput');
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
      this._updateConsoleState();
    }
  },

  _updateConsoleState() {
    const empty = Utils.el('consoleempty');
    const offline = Utils.el('consoleoffline');
    if (!empty || !offline) return;

    if (this._hasOutput) {
      empty.style.display = 'none';
      offline.style.display = 'none';
      return;
    }

    const isoffline = this.server && this.server.status !== 'running';
    empty.style.display = isoffline ? 'none' : '';
    offline.style.display = isoffline ? '' : 'none';
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
    if (this.connected && this.wsid !== null) {
      window.electronapi.sendws(this.wsid, JSON.stringify({ event: 'set state', args: [signal] }));
    } else {
      Api.power(this.server.panelurl, this.server.apikey, this.server.uuid, signal);
    }
  },

  confirmkill() {
    this.power('kill');
  }
};
