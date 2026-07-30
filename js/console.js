const ServerConsole = {
  wsId: null,
  server: null,
  serverInfo: null,
  connected: false,
  _listenersSetup: false,
  _history: [],
  _historyidx: -1,
  _fontsize: 13,
  _timestamps: false,
  _filter: 'all',
  _searchmarks: [],
  _searchidx: -1,
  _graphHistory: { cpu: [], ram: [], disk: [] },
  _graphMax: 60,
  _cache: {},

  init(server) {
    const cached = this._cache[server.uuid];
    if (cached) {
      this.wsId = cached.wsId;
      this.server = server;
      this.connected = cached.connected;
      this._hasOutput = cached.hasOutput;
      const output = Utils.el('consoleOutput');
      if (output && cached.outputHtml) output.innerHTML = cached.outputHtml;
      this._updateconsolestate();
      this._updatebuttons(server.status || 'offline');
      this._applyfilter();
      return;
    }
    this.destroy();
    this.server = server;
    this.connected = false;
    this._hasOutput = false;
    this._historyidx = -1;
    this._searchmarks = [];
    this._searchidx = -1;
    this._graphHistory = { cpu: [], ram: [], disk: [] };
    if (!this._listenersSetup) {
      this.setuplisteners();
      this._listenersSetup = true;
    }
    this.connect();
    this.loadserverinfo();
    this._updateconsolestate();
    this._updatebuttons(server.status || 'offline');
    this._applyfilter();
  },

  detach() {
    if (this.server && this.wsId !== null) {
      const output = Utils.el('consoleOutput');
      this._cache[this.server.uuid] = {
        wsId: this.wsId,
        connected: this.connected,
        hasOutput: this._hasOutput,
        outputHtml: output ? output.innerHTML : ''
      };
      this.wsId = null;
      this.server = null;
      this.connected = false;
      return true;
    }
    return false;
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

    document.addEventListener('keydown', (e) => {
      if (App.currentServerPage !== 'console') return;
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        this.showsearch();
      }
      if (e.ctrlKey && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        this.changefontsize(1);
      }
      if (e.ctrlKey && e.key === '-') {
        e.preventDefault();
        this.changefontsize(-1);
      }
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

    this._updateconsolegraph(cpuPct, ramPct, diskPct, memUsed, memTotal, diskUsed, diskTotal);
  },

  _updateconsolegraph(cpuPct, ramPct, diskPct, memUsed, memTotal, diskUsed, diskTotal) {
    const gh = this._graphHistory;
    gh.cpu.push(cpuPct);
    gh.ram.push(ramPct);
    gh.disk.push(diskPct);
    if (gh.cpu.length > this._graphMax) gh.cpu.shift();
    if (gh.ram.length > this._graphMax) gh.ram.shift();
    if (gh.disk.length > this._graphMax) gh.disk.shift();

    Utils.el('consoleCpuVal').textContent = cpuPct.toFixed(1) + '%';
    Utils.el('consoleRamVal').textContent = Utils.formatbytes(memUsed) + ' / ' + Utils.formatmb(this.server.limits?.memory);
    Utils.el('consoleDiskVal').textContent = Utils.formatbytes(diskUsed) + ' / ' + Utils.formatmb(this.server.limits?.disk);

    this._drawresgraph('consoleCpuCanvas', gh.cpu, '#f97316');
    this._drawresgraph('consoleRamCanvas', gh.ram, '#3b82f6');
    this._drawresgraph('consoleDiskCanvas', gh.disk, '#a855f7');
  },

  _drawresgraph(canvasId, data, color) {
    const canvas = Utils.el(canvasId);
    if (!canvas || data.length < 2) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;
    ctx.clearRect(0, 0, w, h);

    const maxVal = 100;
    const step = w / (this._graphMax - 1);

    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i < data.length; i++) {
      const x = (this._graphMax - data.length + i) * step;
      const y = h - (data[i] / maxVal) * (h - 4) - 2;
      ctx.lineTo(x, y);
    }
    ctx.lineTo((this._graphMax - data.length + data.length) * step, h);
    ctx.closePath();
    ctx.fillStyle = color + '18';
    ctx.fill();

    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < data.length; i++) {
      const x = (this._graphMax - data.length + i) * step;
      const y = h - (data[i] / maxVal) * (h - 4) - 2;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
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
    this._history.push(cmd);
    if (this._history.length > 200) this._history.shift();
    this._historyidx = -1;
    input.value = '';
  },

  log(type, text) {
    const output = Utils.el('consoleOutput');
    const line = document.createElement('div');
    line.className = 'console-line console-' + type;
    line.dataset.logtype = type;
    line.dataset.rawtext = text;

    let content = '';
    if (this._timestamps) {
      const now = new Date();
      const ts = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      content += `<span class="console-timestamp">[${ts}]</span> `;
    }

    if (type === 'output') {
      let html = Utils.ansitohtml(text);
      html = html.replace(/^[^<]*?\[/, '[');
      content += html;
    } else {
      content += Utils.escape(text);
    }

    line.innerHTML = content;
    output.appendChild(line);
    output.scrollTop = output.scrollHeight;

    if (type === 'output' && !this._hasOutput) {
      this._hasOutput = true;
      this._updateconsolestate();
    }

    this._applyfiltertoline(line);
    if (this._searchmarks.length > 0) this._highlightsearch();
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
        this.sendpower('signal');
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
  },

  showsearch() {
    const wrap = Utils.el('consoleSearchWrap');
    if (!wrap) return;
    wrap.style.display = '';
    const input = Utils.el('consoleSearchInput');
    if (input) { input.focus(); input.select(); }
  },

  closesearch() {
    const wrap = Utils.el('consoleSearchWrap');
    if (wrap) wrap.style.display = 'none';
    this._clearsearchhighlights();
    this._searchmarks = [];
    this._searchidx = -1;
    const count = Utils.el('consoleSearchCount');
    if (count) count.textContent = '';
  },

  onsearch(query) {
    this._clearsearchhighlights();
    this._rebuildlinesforsearch();
    this._searchmarks = [];
    this._searchidx = -1;
    const count = Utils.el('consoleSearchCount');
    if (!query) { if (count) count.textContent = ''; return; }

    const output = Utils.el('consoleOutput');
    const lines = output.querySelectorAll('.console-line');
    const q = query.toLowerCase();

    lines.forEach((line) => {
      const text = (line.dataset.rawtext || '').toLowerCase();
      if (!text.includes(q)) return;
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (node.textContent.toLowerCase().includes(q)) {
          const span = document.createElement('span');
          span.innerHTML = node.textContent.replace(new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), (m) => `<mark class="console-search-highlight">${m}</mark>`);
          node.parentNode.replaceChild(span, node);
        }
      }
    });

    this._searchmarks = Array.from(output.querySelectorAll('mark.console-search-highlight'));
    if (this._searchmarks.length > 0) {
      this._searchidx = 0;
      this._scrolltomatch();
    }
    if (count) count.textContent = this._searchmarks.length > 0 ? `${this._searchidx + 1}/${this._searchmarks.length}` : 'No results';
  },

  searchnext() {
    if (this._searchmarks.length === 0) return;
    this._searchidx = (this._searchidx + 1) % this._searchmarks.length;
    this._scrolltomatch();
    this._updatecount();
  },

  searchprev() {
    if (this._searchmarks.length === 0) return;
    this._searchidx = (this._searchidx - 1 + this._searchmarks.length) % this._searchmarks.length;
    this._scrolltomatch();
    this._updatecount();
  },

  _updatecount() {
    const count = Utils.el('consoleSearchCount');
    if (count) count.textContent = `${this._searchidx + 1}/${this._searchmarks.length}`;
  },

  _scrolltomatch() {
    if (this._searchidx < 0 || this._searchidx >= this._searchmarks.length) return;
    this._searchmarks.forEach((m) => m.classList.remove('current'));
    this._searchmarks[this._searchidx].classList.add('current');
    this._searchmarks[this._searchidx].scrollIntoView({ behavior: 'smooth', block: 'center' });
  },

  _clearsearchhighlights() {
    const output = Utils.el('consoleOutput');
    if (!output) return;
    output.querySelectorAll('mark.console-search-highlight').forEach((m) => {
      m.replaceWith(document.createTextNode(m.textContent));
    });
    output.querySelectorAll('span').forEach((s) => {
      if (s.classList.contains('console-search-highlight')) return;
      if (s.parentNode && s.parentNode === output) return;
      if (s.childNodes.length === 1 && s.childNodes[0].nodeType === 3) {
        s.replaceWith(document.createTextNode(s.textContent));
      }
    });
  },

  _rebuildlinesforsearch() {
    const output = Utils.el('consoleOutput');
    if (!output) return;
    output.querySelectorAll('.console-line').forEach((line) => {
      const text = line.dataset.rawtext || '';
      const type = line.dataset.logtype || 'output';
      let content = '';
      if (type === 'output') {
        let html = Utils.ansitohtml(text);
        html = html.replace(/^[^<]*?\[/, '[');
        content += html;
      } else {
        content += Utils.escape(text);
      }
      line.innerHTML = content;
    });
  },

  _highlightsearch() {
    const input = Utils.el('consoleSearchInput');
    if (input && input.value) this.onsearch(input.value);
  },

  changefontsize(delta) {
    this._fontsize = Math.max(10, Math.min(24, this._fontsize + delta));
    document.documentElement.style.setProperty('--console-fontsize', this._fontsize + 'px');
    const label = Utils.el('consoleFontsizeLabel');
    if (label) label.textContent = this._fontsize + 'px';
  },

  toggletimestamps() {
    this._timestamps = !this._timestamps;
    const btn = Utils.el('consoleTimestampBtn');
    if (btn) btn.classList.toggle('active', this._timestamps);
    this._rebuildalllines();
  },

  setfilter(val) {
    this._filter = val;
    this._applyfilter();
  },

  _applyfilter() {
    const output = Utils.el('consoleOutput');
    if (!output) return;
    output.querySelectorAll('.console-line').forEach((line) => {
      this._applyfiltertoline(line);
    });
  },

  _applyfiltertoline(line) {
    const logtype = line.dataset.logtype || 'output';
    if (this._filter === 'all') {
      line.style.display = '';
      return;
    }
    if (this._filter === 'errors') {
      line.style.display = (logtype === 'error') ? '' : 'none';
      return;
    }
    if (this._filter === 'warnings') {
      const raw = (line.dataset.rawtext || '').toLowerCase();
      const iswarn = raw.includes('warn') || raw.includes('error') || raw.includes('fatal') || raw.includes('exception') || logtype === 'error';
      line.style.display = iswarn ? '' : 'none';
    }
  },

  _rebuildalllines() {
    const output = Utils.el('consoleOutput');
    if (!output) return;
    output.querySelectorAll('.console-line').forEach((line) => {
      const text = line.dataset.rawtext || '';
      const type = line.dataset.logtype || 'output';
      let content = '';
      if (this._timestamps) {
        const ts = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        content += `<span class="console-timestamp">[${ts}]</span> `;
      }
      if (type === 'output') {
        let html = Utils.ansitohtml(text);
        html = html.replace(/^[^<]*?\[/, '[');
        content += html;
      } else {
        content += Utils.escape(text);
      }
      line.innerHTML = content;
    });
    this._applyfilter();
  },

  clearconsole() {
    const output = Utils.el('consoleOutput');
    if (output) output.innerHTML = '';
    this._hasOutput = false;
    this._searchmarks = [];
    this._searchidx = -1;
    this._updateconsolestate();
  }
};
