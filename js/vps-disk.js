const VPSDisk = {
  server: null,
  _interval: null,

  load() {
    this.server = App.currentServer;
    this.renderloading();
    this.fetch();
    this._interval = setInterval(() => this.fetch(), 10000);
  },

  destroy() {
    if (this._interval) { clearInterval(this._interval); this._interval = null; }
  },

  renderloading() {
    const c = Utils.el('tabDisk');
    if (c) c.innerHTML = '<div class="loading"><div class="spinner"></div><div class="loading-text">Loading...</div></div>';
  },

  render() {
    const c = Utils.el('tabDisk');
    c.innerHTML = `
      <div class="vps-section-header">
        <h2>Disk Usage Analyzer</h2>
        <button class="btn btn-sm btn-secondary" onclick="VPSDisk.fetch()">Refresh</button>
      </div>
      <div class="vps-disk-overview" id="diskOverview"></div>
      <div class="vps-disk-section">
        <h3>Filesystem Usage</h3>
        <div class="vps-disk-bars" id="diskBars"></div>
      </div>
      <div class="vps-disk-section">
        <h3>Directory Treemap</h3>
        <p class="vps-disk-hint">Top directories by disk usage in <code>/</code></p>
        <div class="vps-disk-treemap" id="diskTreemap"></div>
      </div>
      <div class="vps-disk-section">
        <h3>Largest Files</h3>
        <div class="vps-disk-files" id="diskFiles"></div>
      </div>`;
  },

  async fetch() {
    if (!this.server) return;
    const [dfRes, duRes, bigRes] = await Promise.all([
      this.exec('df -h'),
      this.exec('du -h --max-depth=1 / 2>/dev/null | sort -rh | head -20'),
      this.exec('find / -xdev -type f -printf "%s %p\\n" 2>/dev/null | sort -rn | head -15 || find / -xdev -type f -size +10M -exec ls -lhS {} + 2>/dev/null | head -15')
    ]);
    if (dfRes?.error || duRes?.error || bigRes?.error) return;
    this.render();
    this.renderoverview(dfRes?.stdout || '');
    this.renderbars(dfRes?.stdout || '');
    this.rendertreemap(duRes?.stdout || '');
    this.renderfiles(bigRes?.stdout || '');
  },

  renderoverview(stdout) {
    const el = Utils.el('diskOverview');
    if (!el) return;
    const lines = stdout.trim().split('\n');
    let total = 0, used = 0, avail = 0;
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].trim().split(/\s+/);
      if (parts.length < 6) continue;
      if (!parts[0]?.startsWith('/')) continue;
      const s = this.parsebytes(parts[1] || '0');
      const u = this.parsebytes(parts[2] || '0');
      const a = this.parsebytes(parts[3] || '0');
      total += s; used += u; avail += a;
    }
    const pct = total > 0 ? ((used / total) * 100).toFixed(1) : 0;
    el.innerHTML = `
      <div class="vps-disk-stat">
        <div class="vps-disk-ring">
          <svg viewBox="0 0 36 36">
            <path class="ring-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke-width="3" />
            <path class="ring-fill" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke-width="3"
              stroke-dasharray="${pct}, 100" stroke="${pct > 80 ? '#ef4444' : pct > 60 ? '#f59e0b' : '#22c55e'}" />
          </svg>
          <span class="ring-text">${pct}%</span>
        </div>
        <div class="vps-disk-stat-info">
          <div class="vps-disk-stat-val">${Utils.formatbytes(used)} / ${Utils.formatbytes(total)}</div>
          <div class="vps-disk-stat-lbl">Used / Total</div>
          <div class="vps-disk-stat-avail">Available: ${Utils.formatbytes(avail)}</div>
        </div>
      </div>`;
  },

  renderbars(stdout) {
    const el = Utils.el('diskBars');
    if (!el) return;
    const lines = stdout.trim().split('\n');
    const skip = /^(tmpfs|udev|devtmpfs|overlay|shm)/;
    const entries = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].trim().split(/\s+/);
      if (parts.length < 6 || !parts[5]) continue;
      if (skip.test(parts[0])) continue;
      const pct = parseInt(parts[4]) || 0;
      entries.push({
        fs: parts[0],
        size: parts[1],
        used: parts[2],
        avail: parts[3],
        pct,
        mount: parts[5]
      });
    }
    if (entries.length === 0) {
      el.innerHTML = '<div class="vps-disk-empty">No filesystem data.</div>';
      return;
    }
    el.innerHTML = entries.map(e => `
      <div class="vps-disk-bar-row">
        <div class="vps-disk-bar-header">
          <span class="vps-disk-bar-mount">${Utils.escape(e.mount)}</span>
          <span class="vps-disk-bar-pct" style="color:${e.pct > 80 ? '#ef4444' : e.pct > 60 ? '#f59e0b' : '#22c55e'}">${e.pct}%</span>
        </div>
        <div class="vps-disk-bar-track">
          <div class="vps-disk-bar-fill" style="width:${e.pct}%;background:${e.pct > 80 ? '#ef4444' : e.pct > 60 ? '#f59e0b' : '#22c55e'}"></div>
        </div>
        <div class="vps-disk-bar-meta">
          <span>${Utils.escape(e.fs)}</span>
          <span>${e.used} used of ${e.size}</span>
        </div>
      </div>`).join('');
  },

  rendertreemap(stdout) {
    const el = Utils.el('diskTreemap');
    if (!el) return;
    const entries = [];
    let maxVal = 1;
    const lines = stdout.trim().split('\n');
    for (const line of lines) {
      const match = line.match(/^(\d+\.?\d*\w?)\s+(.+)$/);
      if (!match) continue;
      const val = this.parsebytes(match[1]);
      const name = match[2].trim();
      if (name === '/') continue;
      if (val > maxVal) maxVal = val;
      entries.push({ name, val });
    }
    entries.sort((a, b) => b.val - a.val);
    if (entries.length === 0) {
      el.innerHTML = '<div class="vps-disk-empty">No treemap data available.</div>';
      return;
    }
    const colors = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'];
    el.innerHTML = `<div class="treemap">${entries.slice(0, 16).map((e, i) => {
      const pct = Math.max(5, (e.val / maxVal) * 100);
      const color = colors[i % colors.length];
      return `<div class="treemap-cell" style="flex:${pct};background:${color}" title="${Utils.escape(e.name)}: ${Utils.formatbytes(e.val)}">
        <span class="treemap-label">${Utils.escape(e.name.split('/').pop())}</span>
        <span class="treemap-size">${Utils.formatbytes(e.val)}</span>
      </div>`;
    }).join('')}</div>`;
  },

  renderfiles(stdout) {
    const el = Utils.el('diskFiles');
    if (!el) return;
    const lines = stdout.trim().split('\n');
    const entries = [];
    for (const line of lines) {
      const spaceIdx = line.indexOf(' ');
      if (spaceIdx === -1) continue;
      const size = parseInt(line.substring(0, spaceIdx));
      const path = line.substring(spaceIdx + 1).trim();
      if (size > 0 && path) entries.push({ size, path });
    }
    if (entries.length === 0) {
      el.innerHTML = '<div class="vps-disk-empty">No large files found.</div>';
      return;
    }
    el.innerHTML = `<table class="vps-disk-file-table">
      <thead><tr><th>Size</th><th>Path</th></tr></thead>
      <tbody>${entries.map(e => `<tr>
        <td class="vps-disk-file-size">${Utils.formatbytes(e.size)}</td>
        <td class="vps-disk-file-path" title="${Utils.escape(e.path)}">${Utils.escape(e.path)}</td>
      </tr>`).join('')}</tbody>
    </table>`;
  },

  parsebytes(str) {
    if (!str) return 0;
    const num = parseFloat(str);
    const unit = str.replace(/[\d.]/g, '').toLowerCase();
    const units = { 'b': 1, 'k': 1024, 'kb': 1024, 'm': 1048576, 'mb': 1048576, 'g': 1073741824, 'gb': 1073741824, 't': 1099511627776, 'tb': 1099511627776 };
    return num * (units[unit] || 1024);
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
