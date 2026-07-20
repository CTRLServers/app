const Security = {
  server: null,
  loading: false,
  data: null,

  async load() {
    this.server = App.currentServer;
    if (!this.server || this.server.type !== 'VPS/VDS') return;

    this.loading = true;
    this.render();

    try {
      await this.fetchdata();
    } catch (e) {
      console.error('Security load error:', e);
    }

    this.loading = false;
    this.render();
  },

  async fetchdata() {
    const results = await Promise.allSettled([
      this.exec("ss -tlnp 2>/dev/null | tail -n +2"),
      this.exec("ss -ulnp 2>/dev/null | tail -n +2"),
      this.exec("fail2ban-client status 2>/dev/null || echo 'FAIL2BAN_NOT_INSTALLED'"),
      this.exec("grep -E '^(Port|PermitRootLogin|PasswordAuthentication|PubkeyAuthentication|MaxAuthTries|Protocol|X11Forwarding)' /etc/ssh/sshd_config 2>/dev/null || echo 'SSH_CONFIG_NOT_FOUND'"),
      this.exec("last -n 10 -w 2>/dev/null || echo ''"),
      this.exec("lastb -n 10 -w 2>/dev/null || echo ''"),
      this.exec("ufw status 2>/dev/null || firewall-cmd --list-all 2>/dev/null || echo 'NO_FIREWALL'")
    ]);

    const get = (i) => results[i].status === 'fulfilled' ? results[i].value.stdout.trim() : '';

    const tcpPorts = this.parseports(get(0));
    const udpPorts = this.parseports(get(1));
    const fail2banRaw = get(2);
    const sshConfig = get(3);
    const lastLogins = this.parselast(get(4));
    const failedLogins = this.parselast(get(5));
    const firewallRaw = get(6);

    this.data = {
      tcpPorts,
      udpPorts,
      fail2ban: fail2banRaw.includes('FAIL2BAN_NOT_INSTALLED') ? null : this.parsefail2ban(fail2banRaw),
      sshConfig: this.parsesshconfig(sshConfig),
      lastLogins,
      failedLogins,
      firewallRaw
    };
  },

  parseports(output) {
    const ports = [];
    if (!output) return ports;
    for (const line of output.split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 4) continue;
      const [proto, state, recv, send, local] = parts;
      if (!local) continue;
      const addr = local;
      const lastColon = addr.lastIndexOf(':');
      if (lastColon === -1) continue;
      const port = addr.slice(lastColon + 1).split('*')[0];
      const host = addr.slice(0, lastColon);
      const process = parts.find(p => p.startsWith('users:')) || '';
      const procName = process.match(/\("([^"]+)"/)?.[1] || '';
      ports.push({ port, host: host.replace('[', '').replace(']', ''), process: procName, state });
    }
    return ports.sort((a, b) => parseInt(a.port) - parseInt(b.port));
  },

  parsefail2ban(output) {
    if (!output || output.includes('not installed')) return null;
    const lines = output.split('\n');
    const result = { jails: [], status: '' };
    for (const line of lines) {
      const m = line.match(/Jail list:\s*(.+)/);
      if (m) result.jails = m[1].split(',').map(j => j.trim());
      const m2 = line.match(/Currently banned:\s*(\d+)/);
      if (m2) result.banned = parseInt(m2[1]);
    }
    result.status = output;
    return result;
  },

  parsesshconfig(output) {
    const config = {};
    if (!output || output.includes('SSH_CONFIG_NOT_FOUND')) return null;
    for (const line of output.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf(' ');
      if (idx === -1) continue;
      config[trimmed.slice(0, idx)] = trimmed.slice(idx + 1).trim();
    }
    return Object.keys(config).length ? config : null;
  },

  parselast(output) {
    const entries = [];
    if (!output) return entries;
    for (const line of output.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('wtmp') || trimmed.startsWith('btmp') || trimmed.startsWith('still')) continue;
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 3) {
        entries.push({
          user: parts[0],
          terminal: parts[1],
          host: parts[2],
          time: parts.slice(3).join(' ')
        });
      }
    }
    return entries.slice(0, 10);
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

  render() {
    const tab = Utils.el('tabSecurity');
    if (!tab) return;

    if (this.loading) {
      tab.innerHTML = '<div class="loading"><div class="spinner"></div><div class="loading-text">Loading security info...</div></div>';
      return;
    }

    if (!this.data) {
      tab.innerHTML = '<div class="fw-empty" style="padding:48px;">Failed to load security data</div>';
      return;
    }

    const d = this.data;

    let html = `<div class="sec-container">
      <div class="sec-grid">
        <div class="fw-card">
          <div class="fw-card-header">
            <h3>Open Ports (TCP)</h3>
            <span class="packages-count-badge">${d.tcpPorts.length}</span>
          </div>
          <div class="fw-card-body">`;

    if (d.tcpPorts.length) {
      html += `<table class="fw-table"><thead><tr><th>Port</th><th>Bind</th><th>Process</th><th>State</th></tr></thead><tbody>`;
      for (const p of d.tcpPorts) {
        html += `<tr>
          <td><code>${Utils.escape(p.port)}</code></td>
          <td><code>${Utils.escape(p.host)}</code></td>
          <td>${p.process ? '<code>' + Utils.escape(p.process) + '</code>' : '<span class="text-muted">-</span>'}</td>
          <td><span class="svc-state-badge svc-active">${Utils.escape(p.state)}</span></td>
        </tr>`;
      }
      html += '</tbody></table>';
    } else {
      html += '<div class="fw-empty">No TCP ports listening</div>';
    }

    html += `</div></div>

        <div class="fw-card">
          <div class="fw-card-header">
            <h3>Open Ports (UDP)</h3>
            <span class="packages-count-badge">${d.udpPorts.length}</span>
          </div>
          <div class="fw-card-body">`;

    if (d.udpPorts.length) {
      html += `<table class="fw-table"><thead><tr><th>Port</th><th>Bind</th><th>Process</th></tr></thead><tbody>`;
      for (const p of d.udpPorts) {
        html += `<tr>
          <td><code>${Utils.escape(p.port)}</code></td>
          <td><code>${Utils.escape(p.host)}</code></td>
          <td>${p.process ? '<code>' + Utils.escape(p.process) + '</code>' : '<span class="text-muted">-</span>'}</td>
        </tr>`;
      }
      html += '</tbody></table>';
    } else {
      html += '<div class="fw-empty">No UDP ports listening</div>';
    }

    html += `</div></div></div>`;

    html += `<div class="sec-grid">
      <div class="fw-card">
        <div class="fw-card-header"><h3>SSH Configuration</h3></div>
        <div class="fw-card-body">`;

    if (d.sshConfig) {
      html += '<div class="sec-config-list">';
      const labels = {
        'Port': 'SSH Port', 'PermitRootLogin': 'Root Login', 'PasswordAuthentication': 'Password Auth',
        'PubkeyAuthentication': 'Key Auth', 'MaxAuthTries': 'Max Auth Tries',
        'Protocol': 'Protocol', 'X11Forwarding': 'X11 Forwarding'
      };
      for (const [key, val] of Object.entries(d.sshConfig)) {
        const isOn = val === 'yes' || val === 'on';
        const isOff = val === 'no' || val === 'off';
        html += `<div class="sec-config-row">
          <span class="sec-config-key">${labels[key] || key}</span>
          <span class="sec-config-val ${isOff ? 'sec-warn' : ''}">${Utils.escape(val)}</span>
        </div>`;
      }
      html += '</div>';
    } else {
      html += '<div class="fw-empty">SSH config not found</div>';
    }

    html += `</div></div>

      <div class="fw-card">
        <div class="fw-card-header"><h3>Fail2Ban</h3></div>
        <div class="fw-card-body">`;

    if (d.fail2ban) {
      html += `<div class="sec-config-list">
        <div class="sec-config-row">
          <span class="sec-config-key">Status</span>
          <span class="sec-config-val">Running</span>
        </div>
        <div class="sec-config-row">
          <span class="sec-config-key">Banned IPs</span>
          <span class="sec-config-val ${d.fail2ban.banned > 0 ? 'sec-warn' : ''}">${d.fail2ban.banned || 0}</span>
        </div>
        <div class="sec-config-row">
          <span class="sec-config-key">Jails</span>
          <span class="sec-config-val">${d.fail2ban.jails.join(', ') || 'None'}</span>
        </div>
      </div>`;
    } else {
      html += `<div class="sec-fail2ban-missing">
        <p>Fail2Ban is not installed</p>
        <button class="btn btn-sm btn-secondary" onclick="Security.installfail2ban()">Install Fail2Ban</button>
      </div>`;
    }

    html += `</div></div></div>`;

    html += `<div class="sec-grid">
      <div class="fw-card">
        <div class="fw-card-header"><h3>Recent Logins</h3></div>
        <div class="fw-card-body">`;

    if (d.lastLogins.length) {
      html += `<table class="fw-table"><thead><tr><th>User</th><th>Terminal</th><th>From</th><th>Time</th></tr></thead><tbody>`;
      for (const l of d.lastLogins) {
        html += `<tr>
          <td><strong>${Utils.escape(l.user)}</strong></td>
          <td>${Utils.escape(l.terminal)}</td>
          <td><code>${Utils.escape(l.host)}</code></td>
          <td>${Utils.escape(l.time)}</td>
        </tr>`;
      }
      html += '</tbody></table>';
    } else {
      html += '<div class="fw-empty">No login records</div>';
    }

    html += `</div></div>

      <div class="fw-card">
        <div class="fw-card-header"><h3>Failed Login Attempts</h3></div>
        <div class="fw-card-body">`;

    if (d.failedLogins.length) {
      html += `<table class="fw-table"><thead><tr><th>User</th><th>Terminal</th><th>From</th><th>Time</th></tr></thead><tbody>`;
      for (const l of d.failedLogins) {
        html += `<tr>
          <td><strong>${Utils.escape(l.user)}</strong></td>
          <td>${Utils.escape(l.terminal)}</td>
          <td><code>${Utils.escape(l.host)}</code></td>
          <td>${Utils.escape(l.time)}</td>
        </tr>`;
      }
      html += '</tbody></table>';
    } else {
      html += '<div class="fw-empty">No failed login attempts</div>';
    }

    html += `</div></div></div></div>`;
    tab.innerHTML = html;
  },

  async installfail2ban() {
    Modal.confirm('Install Fail2Ban', 'Install Fail2Ban using the Packages tab?', async () => {
      const server = App.currentServer;
      if (server) {
        const cfg = {
          host: server.host, port: server.port || 22, username: server.username || 'root'
        };
        if (server.authType === 'key' && server.privateKey) { cfg.authType = 'privateKey'; cfg.privateKey = server.privateKey; }
        else { cfg.authType = 'password'; cfg.password = server.password || ''; }
        await window.electronAPI.sshexec(cfg, `echo '${(server.password || '').replace(/'/g, "'\\''")}' | sudo -S sh -c 'apt-get install -y fail2ban 2>/dev/null || dnf install -y fail2ban 2>/dev/null || pacman -S --noconfirm fail2ban 2>/dev/null' 2>/dev/null`);
        this.load();
      }
    });
  }
};
