const VPSNet = {
  server: null,
  _interval: null,
  _prev: {},
  _history: {},
  _maxpoints: 60,

  load() {
    this.server = App.currentServer;
    this._prev = {};
    this._history = {};
    this.render();
    this.fetch();
    this._interval = setInterval(() => this.fetch(), 2000);
  },

  destroy() {
    if (this._interval) { clearInterval(this._interval); this._interval = null; }
  },

  render() {
    const c = Utils.el('tabVpsNet');
    c.innerHTML = `
      <div class="vps-section-header">
        <h2>Network Monitor</h2>
        <button class="btn btn-sm btn-secondary" onclick="VPSNet.fetch()">Refresh</button>
      </div>
      <div class="vps-net-interfaces" id="netInterfaces"></div>
      <div class="vps-net-section">
        <h3>Bandwidth Graph</h3>
        <div class="vps-net-graphs" id="netGraphs"></div>
      </div>`;
  },

  async fetch() {
    if (!this.server) return;
    const res = await this.exec(`cat /proc/net/dev && ip -s link 2>/dev/null`);
    if (!res?.stdout) return;
    this.parseinterfaces(res.stdout);
    this.renderinterfaces();
    this.rendergraphs();
  },

  parseinterfaces(stdout) {
    const lines = stdout.trim().split('\n');
    const now = {};
    for (const line of lines) {
      const match = line.trim().match(/^(\w+)[\s:]+(\d+)\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(\d+)\s+/);
      if (!match) continue;
      const iface = match[1];
      if (iface === 'lo') continue;
      const rxBytes = parseInt(match[2]);
      const txBytes = parseInt(match[3]);
      const prev = this._prev[iface];
      const rxRate = prev ? Math.max(0, (rxBytes - prev.rx) / 2) : 0;
      const txRate = prev ? Math.max(0, (txBytes - prev.tx) / 2) : 0;
      now[iface] = { rx: rxBytes, tx: txBytes, rxRate, txRate };
      if (!this._history[iface]) this._history[iface] = { rx: [], tx: [] };
      this._history[iface].rx.push(rxRate);
      this._history[iface].tx.push(txRate);
      if (this._history[iface].rx.length > this._maxpoints) this._history[iface].rx.shift();
      if (this._history[iface].tx.length > this._maxpoints) this._history[iface].tx.shift();
    }
    this._prev = now;
  },

  renderinterfaces() {
    const el = Utils.el('netInterfaces');
    if (!el) return;
    const ifaces = Object.keys(this._prev);
    if (ifaces.length === 0) {
      el.innerHTML = '<div class="vps-net-empty">No network interfaces detected.</div>';
      return;
    }
    el.innerHTML = ifaces.map(iface => {
      const d = this._prev[iface];
      return `<div class="vps-net-card">
        <div class="vps-net-card-name">${Utils.escape(iface)}</div>
        <div class="vps-net-card-stats">
          <div class="vps-net-stat">
            <span class="vps-net-arrow vps-net-rx">\u2193</span>
            <span class="vps-net-rate">${Utils.formatbytes(d.rxRate)}/s</span>
            <span class="vps-net-total">Total: ${Utils.formatbytes(d.rx)}</span>
          </div>
          <div class="vps-net-stat">
            <span class="vps-net-arrow vps-net-tx">\u2191</span>
            <span class="vps-net-rate">${Utils.formatbytes(d.txRate)}/s</span>
            <span class="vps-net-total">Total: ${Utils.formatbytes(d.tx)}</span>
          </div>
        </div>
      </div>`;
    }).join('');
  },

  rendergraphs() {
    const el = Utils.el('netGraphs');
    if (!el) return;
    const ifaces = Object.keys(this._history);
    if (ifaces.length === 0) return;
    el.innerHTML = ifaces.map(iface => {
      const hist = this._history[iface];
      return `<div class="vps-net-graph-container">
        <div class="vps-net-graph-title">${Utils.escape(iface)}</div>
        <canvas class="vps-net-canvas" id="netCanvas_${iface}" width="400" height="120"></canvas>
      </div>`;
    }).join('');

    requestAnimationFrame(() => {
      ifaces.forEach(iface => this.drawgraph(iface));
    });
  },

  drawgraph(iface) {
    const canvas = Utils.el('netCanvas_' + iface);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const hist = this._history[iface];
    if (!hist || hist.rx.length < 2) return;

    ctx.clearRect(0, 0, w, h);

    const all = [...hist.rx, ...hist.tx];
    const maxVal = Math.max(1, ...all);

    const drawline = (data, color) => {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      const step = w / (this._maxpoints - 1);
      for (let i = 0; i < data.length; i++) {
        const x = i * step;
        const y = h - (data[i] / maxVal) * (h - 10) - 5;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    drawline(hist.rx, '#22c55e');
    drawline(hist.tx, '#3b82f6');

    ctx.fillStyle = '#888';
    ctx.font = '10px sans-serif';
    ctx.fillText(Utils.formatbytes(maxVal) + '/s', 2, 12);
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
