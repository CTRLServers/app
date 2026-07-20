const VPSInfo = {
  server: null,
  loading: false,
  data: null,

  async load() {
    this.server = App.currentServer;
    if (!this.server || this.server.type !== 'VPS/VDS') return;

    this.loading = true;
    this.render();

    try {
      await this.fetchinfo();
    } catch (e) {
      console.error('Info load error:', e);
    }

    this.loading = false;
    this.render();
  },

  async fetchinfo() {
    const cmds = {
      disk: "df -B1 / | tail -1 | awk '{print $2,$3,$4,$5}'",
      disk_fs: "df -Th / | tail -1 | awk '{print $2}'",
      ram: "free -b | grep Mem | awk '{print $2,$3,$4,$7}'",
      swap: "free -b | grep Swap | awk '{print $2,$3,$4}'",
      cpu_model: "lscpu 2>/dev/null | grep 'Model name' | sed 's/Model name:\\s*//'",
      cpu_cores: "nproc 2>/dev/null || grep -c ^processor /proc/cpuinfo 2>/dev/null",
      cpu_mhz: "lscpu 2>/dev/null | grep 'CPU MHz' | awk '{print $3}'",
      os: "cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d= -f2 | tr -d '\"'",
      kernel: "uname -r",
      hostname_cmd: "hostname",
      uptime_cmd: "uptime -p 2>/dev/null || uptime",
      processes: "ps -e --no-headers 2>/dev/null | wc -l",
      procs_running: "ps aux 2>/dev/null | awk '$8 ~ /R/ {count++} END {print count+0}'",
      gpu: "lspci 2>/dev/null | grep -iE 'vga|3d|display' || echo 'No GPU detected'",
      packages_cmd: this.getpkgcountcmd(),
      public_ip: "curl -s ifconfig.me 2>/dev/null || curl -s icanhazip.com 2>/dev/null || echo 'N/A'",
      net_ifaces: "ip -4 -o addr show 2>/dev/null | awk '{print $2, $4}' || hostname -I",
      timezone: "timedatectl 2>/dev/null | grep 'Time zone' | awk '{print $3}' || cat /etc/timezone 2>/dev/null || readlink /etc/localtime 2>/dev/null | sed 's|/usr/share/zoneinfo/||'",
      ntp_sync: "timedatectl 2>/dev/null | grep -i 'synchronized' | awk -F': ' '{print $2}' || echo 'N/A'",
      fs_types: "df -Th / 2>/dev/null | tail -1 | awk '{print $2}'"
    };

    const results = {};
    const entries = Object.entries(cmds);

    const batch = await Promise.allSettled(
      entries.map(([, cmd]) => this.exec(cmd))
    );

    entries.forEach(([key], i) => {
      const res = batch[i];
      results[key] = (res.status === 'fulfilled' && res.value.exitCode === 0)
        ? res.value.stdout.trim()
        : '';
    });

    const ramParts = (results.ram || '').split(' ').map(Number);
    const diskParts = (results.disk || '').split(' ').map(Number);
    const swapParts = (results.swap || '').split(' ').map(Number);

    this.data = {
      os: results.os || 'Unknown',
      kernel: results.kernel || 'Unknown',
      hostname: results.hostname_cmd || 'Unknown',
      uptime: results.uptime_cmd || 'Unknown',
      diskTotal: diskParts[0] || 0,
      diskUsed: diskParts[1] || 0,
      diskAvail: diskParts[2] || 0,
      diskPercent: results.disk ? results.disk.split(' ').pop() : '0%',
      diskFs: results.disk_fs || 'Unknown',
      ramTotal: ramParts[0] || 0,
      ramUsed: ramParts[1] || 0,
      ramFree: ramParts[2] || 0,
      ramAvail: ramParts[3] || 0,
      swapTotal: swapParts[0] || 0,
      swapUsed: swapParts[1] || 0,
      swapFree: swapParts[2] || 0,
      cpuModel: results.cpu_model || 'Unknown',
      cpuCores: parseInt(results.cpu_cores) || 0,
      cpuMhz: results.cpu_mhz ? parseFloat(results.cpu_mhz) : 0,
      processes: parseInt(results.processes) || 0,
      procsRunning: parseInt(results.procs_running) || 0,
      gpu: results.gpu || 'No GPU detected',
      packageCount: parseInt(results.packages_cmd) || 0,
      publicIp: results.public_ip || 'N/A',
      netInterfaces: this.parsenetinterfaces(results.net_ifaces),
      timezone: results.timezone || 'Unknown',
      ntpSync: results.ntp_sync || 'N/A'
    };
  },

  parsenetinterfaces(raw) {
    const ifaces = [];
    if (!raw) return ifaces;
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parts = trimmed.split(/\s+/);
      if (parts.length < 2) continue;
      const name = parts[0];
      const cidr = parts[1];
      const addr = cidr ? cidr.split('/')[0] : '';
      const mask = cidr && cidr.includes('/') ? cidr.split('/')[1] : '';
      ifaces.push({ name, addr, mask });
    }
    return ifaces;
  },

  getpkgcountcmd() {
    if (!Packages.pkgManager) return "dpkg -l 2>/dev/null | grep '^ii' | wc -l";
    const cmds = {
      apt: "dpkg -l 2>/dev/null | grep '^ii' | wc -l",
      dnf: "rpm -qa 2>/dev/null | wc -l",
      pacman: "pacman -Qq 2>/dev/null | wc -l",
      apk: "apk info 2>/dev/null | wc -l",
      gentoo: "qlist -I 2>/dev/null | wc -l"
    };
    return cmds[Packages.pkgManager] || cmds.apt;
  },

  async exec(command) {
    const cfg = {
      host: this.server.host,
      port: this.server.port || 22,
      username: this.server.username || 'root'
    };
    if (this.server.authType === 'key' && this.server.privateKey) {
      cfg.authType = 'privateKey';
      cfg.privateKey = this.server.privateKey;
    } else {
      cfg.authType = 'password';
      cfg.password = this.server.password || '';
    }
    const isRoot = (this.server.username || 'root') === 'root';
    if (isRoot) {
      return await window.electronAPI.sshexec(cfg, command);
    }
    const pass = (this.server.password || '').replace(/'/g, "'\\''");
    const wrapped = command.replace(/'/g, "'\\''");
    return await window.electronAPI.sshexec(cfg, `echo '${pass}' | sudo -S sh -c '${wrapped}' 2>/dev/null`);
  },

  fmt(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
  },

  render() {
    const tab = Utils.el('tabInfo');
    if (!tab) return;

    if (this.loading) {
      tab.innerHTML = '<div class="loading"><div class="spinner"></div><div class="loading-text">Loading system info...</div></div>';
      return;
    }

    if (!this.data) {
      tab.innerHTML = '<div class="info-unsupported"><h3>Failed to load system information</h3></div>';
      return;
    }

    const d = this.data;
    const diskPercentNum = d.diskTotal > 0 ? Math.round((d.diskUsed / d.diskTotal) * 100) : 0;
    const ramPercentNum = d.ramTotal > 0 ? Math.round((d.ramUsed / d.ramTotal) * 100) : 0;
    const gpuText = d.gpu.includes('No GPU') ? 'No GPU detected' : d.gpu;

    const cpuSpeed = d.cpuMhz > 0 ? (d.cpuMhz >= 1000 ? (d.cpuMhz / 1000).toFixed(2) + ' GHz' : d.cpuMhz.toFixed(0) + ' MHz') : '';
    const swapPercentNum = d.swapTotal > 0 ? Math.round((d.swapUsed / d.swapTotal) * 100) : 0;

    tab.innerHTML = `
      <div class="info-container">
        <div class="info-header">
          <div class="info-header-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
          </div>
          <div class="info-header-text">
            <h2>${Utils.escape(d.hostname)}</h2>
            <span class="info-subtitle">${Utils.escape(d.os)}</span>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="VPSInfo.load()" title="Refresh">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          </button>
        </div>

        <div class="info-grid">
          <div class="info-stat-card">
            <div class="info-stat-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
            </div>
            <div class="info-stat-content">
              <div class="info-stat-label">Disk</div>
              <div class="info-stat-value">${this.fmt(d.diskUsed)} / ${this.fmt(d.diskTotal)}</div>
              <div class="info-progress-wrap">
                <div class="info-progress-bar"><div class="info-progress-fill" style="width:${diskPercentNum}%;background:${diskPercentNum > 90 ? '#ef4444' : diskPercentNum > 70 ? '#f59e0b' : 'var(--accent)'}"></div></div>
                <span class="info-progress-text">${diskPercentNum}%</span>
              </div>
              <div class="info-stat-detail">${Utils.escape(d.diskFs)} &middot; ${this.fmt(d.diskAvail)} free</div>
            </div>
          </div>

          <div class="info-stat-card">
            <div class="info-stat-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/></svg>
            </div>
            <div class="info-stat-content">
              <div class="info-stat-label">RAM</div>
              <div class="info-stat-value">${this.fmt(d.ramUsed)} / ${this.fmt(d.ramTotal)}</div>
              <div class="info-progress-wrap">
                <div class="info-progress-bar"><div class="info-progress-fill" style="width:${ramPercentNum}%;background:${ramPercentNum > 90 ? '#ef4444' : ramPercentNum > 70 ? '#f59e0b' : 'var(--accent)'}"></div></div>
                <span class="info-progress-text">${ramPercentNum}%</span>
              </div>
            </div>
          </div>

          <div class="info-stat-card">
            <div class="info-stat-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/></svg>
            </div>
            <div class="info-stat-content">
              <div class="info-stat-label">CPU</div>
              <div class="info-stat-value">${d.cpuCores} Core${d.cpuCores !== 1 ? 's' : ''}</div>
              <div class="info-stat-detail">${Utils.escape(d.cpuModel)}${cpuSpeed ? ' @ ' + cpuSpeed : ''}</div>
            </div>
          </div>

          <div class="info-stat-card">
            <div class="info-stat-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            </div>
            <div class="info-stat-content">
              <div class="info-stat-label">Processes</div>
              <div class="info-stat-value">${d.processes}</div>
              <div class="info-stat-detail">${d.procsRunning} running</div>
            </div>
          </div>

          <div class="info-stat-card">
            <div class="info-stat-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
            </div>
            <div class="info-stat-content">
              <div class="info-stat-label">Packages</div>
              <div class="info-stat-value">${d.packageCount}</div>
              <div class="info-stat-detail">${Packages.pkgManager || 'N/A'}</div>
            </div>
          </div>

          <div class="info-stat-card">
            <div class="info-stat-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
            </div>
            <div class="info-stat-content">
              <div class="info-stat-label">GPU</div>
              <div class="info-stat-value info-gpu">${Utils.escape(gpuText)}</div>
            </div>
          </div>

          <div class="info-stat-card">
            <div class="info-stat-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
            </div>
            <div class="info-stat-content">
              <div class="info-stat-label">Swap</div>
              ${d.swapTotal > 0
                ? `<div class="info-stat-value">${this.fmt(d.swapUsed)} / ${this.fmt(d.swapTotal)}</div>
                   <div class="info-progress-wrap">
                     <div class="info-progress-bar"><div class="info-progress-fill" style="width:${swapPercentNum}%;background:${swapPercentNum > 80 ? '#ef4444' : 'var(--accent)'}"></div></div>
                     <span class="info-progress-text">${swapPercentNum}%</span>
                   </div>`
                : `<div class="info-stat-value">No swap</div>
                   <div class="info-stat-detail">Swap not configured</div>`}
            </div>
          </div>

          <div class="info-stat-card info-stat-wide">
            <div class="info-stat-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
            </div>
            <div class="info-stat-content">
              <div class="info-stat-label">Network Interfaces</div>
              <div class="info-net-list">
                ${d.netInterfaces.length
                  ? d.netInterfaces.map(n => `<div class="info-net-row"><span class="info-net-name">${Utils.escape(n.name)}</span><code class="info-net-addr">${Utils.escape(n.addr)}<span class="info-net-mask">/${Utils.escape(n.mask)}</span></code></div>`).join('')
                  : '<div class="info-stat-detail">No interfaces found</div>'}
              </div>
            </div>
          </div>
        </div>

        <div class="info-details-card">
          <div class="info-detail-row">
            <span class="info-detail-label">Kernel</span>
            <span class="info-detail-value">${Utils.escape(d.kernel)}</span>
          </div>
          <div class="info-detail-row">
            <span class="info-detail-label">Uptime</span>
            <span class="info-detail-value">${Utils.escape(d.uptime)}</span>
          </div>
          <div class="info-detail-row">
            <span class="info-detail-label">Public IP</span>
            <span class="info-detail-value">${Utils.escape(d.publicIp)}</span>
          </div>
          <div class="info-detail-row">
            <span class="info-detail-label">Timezone</span>
            <span class="info-detail-value">${Utils.escape(d.timezone)}</span>
          </div>
          <div class="info-detail-row">
            <span class="info-detail-label">NTP Sync</span>
            <span class="info-detail-value">${Utils.escape(d.ntpSync)}</span>
          </div>
        </div>
      </div>`;
  }
};
