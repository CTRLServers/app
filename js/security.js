const Security = {
  server: null,
  loading: false,
  data: null,

  async load() {
    this.server = App.currentserver;
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

    const tcpports = this.parseports(get(0));
    const udpports = this.parseports(get(1));
    const fail2banRaw = get(2);
    const sshconfig = get(3);
    const lastlogins = this.parselast(get(4));
    const failedlogins = this.parselast(get(5));
    const firewallraw = get(6);

    this.data = {
      tcpports,
      udpports,
      fail2ban: fail2banRaw.includes('FAIL2BAN_NOT_INSTALLED') ? null : this.parseFail2ban(fail2banRaw),
      sshconfig: this.parsesshconfig(sshconfig),
      lastlogins,
      failedlogins,
      firewallraw
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
      const lastcolon = addr.lastIndexOf(':');
      if (lastcolon === -1) continue;
      const port = addr.slice(lastcolon + 1).split('*')[0];
      const host = addr.slice(0, lastcolon);
      const process = parts.find(p => p.startsWith('users:')) || '';
      const procname = process.match(/\("([^"]+)"/)?.[1] || '';
      ports.push({ port, host: host.replace('[', '').replace(']', ''), process: procname, state });
    }
    return ports.sort((a, b) => parseInt(a.port) - parseInt(b.port));
  },

  parseFail2ban(output) {
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
    if (this.server.authtype === 'key' && this.server.privatekey) {
      cfg.authtype = 'privatekey';
      cfg.privatekey = this.server.privatekey;
    } else {
      cfg.authtype = 'password';
      cfg.password = this.server.password || '';
    }
    const isroot = (this.server.username || 'root') === 'root';
    if (isroot) {
      return await window.electronapi.sshexec(cfg, command);
    }
    const pass = (this.server.password || '').replace(/'/g, "'\\''");
    const wrapped = command.replace(/'/g, "'\\''");
    return await window.electronapi.sshexec(cfg, `echo '${pass}' | sudo -S sh -c '${wrapped}' 2>/dev/null`);
  },

  render() {
    const tab = Utils.el('tabsecurity');
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
            <span class="packages-count-badge">${d.tcpports.length}</span>
          </div>
          <div class="fw-card-body">`;

    if (d.tcpports.length) {
      html += `<table class="fw-table"><thead><tr><th>Port</th><th>Bind</th><th>Process</th><th>State</th></tr></thead><tbody>`;
      for (const p of d.tcpports) {
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
            <span class="packages-count-badge">${d.udpports.length}</span>
          </div>
          <div class="fw-card-body">`;

    if (d.udpports.length) {
      html += `<table class="fw-table"><thead><tr><th>Port</th><th>Bind</th><th>Process</th></tr></thead><tbody>`;
      for (const p of d.udpports) {
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

    if (d.sshconfig) {
      html += '<div class="sec-config-list">';
      const labels = {
        'Port': 'SSH Port', 'PermitRootLogin': 'Root Login', 'PasswordAuthentication': 'Password Auth',
        'PubkeyAuthentication': 'Key Auth', 'MaxAuthTries': 'Max Auth Tries',
        'Protocol': 'Protocol', 'X11Forwarding': 'X11 Forwarding'
      };
      for (const [key, val] of Object.entries(d.sshconfig)) {
        const ison = val === 'yes' || val === 'on';
        const isoff = val === 'no' || val === 'off';
        html += `<div class="sec-config-row">
          <span class="sec-config-key">${labels[key] || key}</span>
          <span class="sec-config-val ${isoff ? 'sec-warn' : ''}">${Utils.escape(val)}</span>
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
        <button class="btn btn-sm btn-secondary" onclick="Security.installFail2ban()">Install Fail2Ban</button>
      </div>`;
    }

    html += `</div></div></div>`;

    html += `<div class="sec-grid">
      <div class="fw-card">
        <div class="fw-card-header"><h3>Recent Logins</h3></div>
        <div class="fw-card-body">`;

    if (d.lastlogins.length) {
      html += `<table class="fw-table"><thead><tr><th>User</th><th>Terminal</th><th>From</th><th>Time</th></tr></thead><tbody>`;
      for (const l of d.lastlogins) {
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

    if (d.failedlogins.length) {
      html += `<table class="fw-table"><thead><tr><th>User</th><th>Terminal</th><th>From</th><th>Time</th></tr></thead><tbody>`;
      for (const l of d.failedlogins) {
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

  async installFail2ban() {
    Modal.confirm('Install Fail2Ban', 'Install Fail2Ban using the Packages tab?', async () => {
      const server = App.currentserver;
      if (server) {
        const cfg = {
          host: server.host, port: server.port || 22, username: server.username || 'root'
        };
        if (server.authtype === 'key' && server.privatekey) { cfg.authtype = 'privatekey'; cfg.privatekey = server.privatekey; }
        else { cfg.authtype = 'password'; cfg.password = server.password || ''; }
        await window.electronapi.sshexec(cfg, `echo '${(server.password || '').replace(/'/g, "'\\''")}' | sudo -S sh -c 'apt-get install -y fail2ban 2>/dev/null || dnf install -y fail2ban 2>/dev/null || pacman -S --noconfirm fail2ban 2>/dev/null' 2>/dev/null`);
        this.load();
      }
    });
  }
};
