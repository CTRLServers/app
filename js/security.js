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
    const failedlogincommand = [
      'export LC_ALL=C;',
      'failed=$(lastb -n 10 -w 2>/dev/null | sed "/^btmp begins/d; /^[[:space:]]*$/d");',
      'if [ -n "$failed" ]; then printf "%s\\n" "$failed"; exit 0; fi;',
      'logs="";',
      'if command -v journalctl >/dev/null 2>&1; then logs=$(journalctl -t sshd --no-pager -n 2000 -o short-iso 2>/dev/null | grep -Ei "Failed password|Failed publickey|Invalid user|authentication failure" | tail -n 10); fi;',
      'if [ -z "$logs" ]; then',
      '  for file in /var/log/auth.log /var/log/secure; do',
      '    [ -r "$file" ] || continue;',
      '    logs=$(tail -n 5000 "$file" | grep -Ei "Failed password|Failed publickey|Invalid user|authentication failure" | tail -n 10);',
      '    [ -n "$logs" ] && break;',
      '  done;',
      'fi;',
      'if [ -n "$logs" ]; then printf "__CTRL_AUTH_LOG__\\n%s\\n" "$logs"; fi'
    ].join(' ');
    const results = await Promise.allSettled([
      this.exec("ss -tlnp 2>/dev/null | tail -n +2"),
      this.exec("ss -ulnp 2>/dev/null | tail -n +2"),
      this.exec("fail2ban-client status 2>/dev/null || echo 'FAIL2BAN_NOT_INSTALLED'"),
      this.exec("grep -E '^(Port|PermitRootLogin|PasswordAuthentication|PubkeyAuthentication|MaxAuthTries|Protocol|X11Forwarding)' /etc/ssh/sshd_config 2>/dev/null || echo 'SSH_CONFIG_NOT_FOUND'"),
      this.exec("last -n 10 -w 2>/dev/null || echo ''"),
      this.exec(failedlogincommand, { root: true, notify: false }),
      this.exec("ufw status 2>/dev/null || firewall-cmd --list-all 2>/dev/null || echo 'NO_FIREWALL'")
    ]);

    const get = (i) => results[i].status === 'fulfilled' ? results[i].value.stdout.trim() : '';

    const tcpPorts = this.parseports(get(0));
    const udpPorts = this.parseports(get(1));
    const fail2banRaw = get(2);
    const sshConfig = get(3);
    const lastLogins = this.parselast(get(4));
    const failedresult = results[5].status === 'fulfilled' ? results[5].value : null;
    const failedLogins = this.parsefailedlogins(get(5));
    const firewallRaw = get(6);

    this.data = {
      tcpPorts,
      udpPorts,
      fail2ban: fail2banRaw.includes('FAIL2BAN_NOT_INSTALLED') ? null : this.parsefail2ban(fail2banRaw),
      sshConfig: this.parsesshconfig(sshConfig),
      lastLogins,
      failedLogins,
      failedLoginsUnavailable: Boolean(failedresult?.error),
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

  parsefailedlogins(output) {
    if (!output) return [];
    const marker = '__CTRL_AUTH_LOG__';
    if (!output.includes(marker)) return this.parselast(output);

    const entries = [];
    const seen = new Set();
    const lines = output.slice(output.indexOf(marker) + marker.length).split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let match = trimmed.match(/Failed (?:password|publickey) for (?:invalid user )?(\S+) from (\S+)/i);
      if (!match) match = trimmed.match(/Invalid user (\S+) from (\S+)/i);
      if (!match) {
        const user = trimmed.match(/\buser=(\S+)/i)?.[1];
        const host = trimmed.match(/\brhost=(\S+)/i)?.[1];
        if (user && host) match = [trimmed, user, host];
      }
      if (!match) continue;

      const time = trimmed.match(/^\S+\s+\d+\s+\d{2}:\d{2}:\d{2}/)?.[0]
        || trimmed.match(/^\d{4}-\d{2}-\d{2}T\S+/)?.[0]
        || '';
      const key = `${match[1]}|${match[2]}|${time}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({ user: match[1], terminal: 'ssh', host: match[2], time });
    }
    return entries.slice(-10).reverse();
  },

  async exec(command, options = {}) {
    return await Servers.execvps(this.server, command, { ...options, page: 'security' });
  },

  render() {
    const tab = Utils.el('tabSecurity');
    if (!tab) return;

    if (this.loading) {
      tab.innerHTML = `<div class="loading"><div class="spinner"></div><div class="loading-text">${t('common.loading')}</div></div>`;
      return;
    }

    if (!this.data) {
      tab.innerHTML = `<div class="fw-empty" style="padding:48px;">${t('sec.load_failed')}</div>`;
      return;
    }

    const d = this.data;

    let html = `<div class="sec-container">
      <div class="sec-grid">
        <div class="fw-card">
          <div class="fw-card-header">
            <h3>${t('sec.tcp.title')}</h3>
            <span class="packages-count-badge">${d.tcpPorts.length}</span>
          </div>
          <div class="fw-card-body">`;

    if (d.tcpPorts.length) {
      html += `<table class="fw-table"><thead><tr><th>${t('sec.col.port')}</th><th>${t('sec.col.bind')}</th><th>${t('sec.col.process')}</th><th>${t('sec.col.state')}</th></tr></thead><tbody>`;
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
      html += `<div class="fw-empty">${t('sec.tcp.empty')}</div>`;
    }

    html += `</div></div>

        <div class="fw-card">
          <div class="fw-card-header">
            <h3>${t('sec.udp.title')}</h3>
            <span class="packages-count-badge">${d.udpPorts.length}</span>
          </div>
          <div class="fw-card-body">`;

    if (d.udpPorts.length) {
      html += `<table class="fw-table"><thead><tr><th>${t('sec.col.port')}</th><th>${t('sec.col.bind')}</th><th>${t('sec.col.process')}</th></tr></thead><tbody>`;
      for (const p of d.udpPorts) {
        html += `<tr>
          <td><code>${Utils.escape(p.port)}</code></td>
          <td><code>${Utils.escape(p.host)}</code></td>
          <td>${p.process ? '<code>' + Utils.escape(p.process) + '</code>' : '<span class="text-muted">-</span>'}</td>
        </tr>`;
      }
      html += '</tbody></table>';
    } else {
      html += `<div class="fw-empty">${t('sec.udp.empty')}</div>`;
    }

    html += `</div></div></div>`;

    html += `<div class="sec-grid">
      <div class="fw-card">
        <div class="fw-card-header"><h3>${t('sec.ssh.title')}</h3></div>
        <div class="fw-card-body">`;

    if (d.sshConfig) {
      html += '<div class="sec-config-list">';
      const labels = {
        'Port': t('sec.ssh.port'), 'PermitRootLogin': t('sec.ssh.root_login'), 'PasswordAuthentication': t('sec.ssh.password_auth'),
        'PubkeyAuthentication': t('sec.ssh.key_auth'), 'MaxAuthTries': t('sec.ssh.max_tries'),
        'Protocol': t('sec.ssh.protocol'), 'X11Forwarding': t('sec.ssh.x11')
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
      html += `<div class="fw-empty">${t('sec.ssh.not_found')}</div>`;
    }

    html += `</div></div>

      <div class="fw-card">
        <div class="fw-card-header"><h3>Fail2Ban</h3></div>
        <div class="fw-card-body">`;

    if (d.fail2ban) {
      html += `<div class="sec-config-list">
        <div class="sec-config-row">
          <span class="sec-config-key">${t('sec.f2b.status')}</span>
          <span class="sec-config-val">${t('sec.f2b.running')}</span>
        </div>
        <div class="sec-config-row">
          <span class="sec-config-key">${t('sec.f2b.banned')}</span>
          <span class="sec-config-val ${d.fail2ban.banned > 0 ? 'sec-warn' : ''}">${d.fail2ban.banned || 0}</span>
        </div>
        <div class="sec-config-row">
          <span class="sec-config-key">${t('sec.f2b.jails')}</span>
          <span class="sec-config-val">${d.fail2ban.jails.join(', ') || t('sec.f2b.none')}</span>
        </div>
      </div>`;
    } else {
      html += `<div class="sec-fail2ban-missing">
        <p>${t('sec.f2b.not_installed')}</p>
        <button class="btn btn-sm btn-secondary" onclick="Security.installfail2ban()">${t('sec.f2b.install')}</button>
      </div>`;
    }

    html += `</div></div></div>`;

    html += `<div class="sec-grid">
      <div class="fw-card">
        <div class="fw-card-header"><h3>${t('sec.logins.title')}</h3></div>
        <div class="fw-card-body">`;

    if (d.lastLogins.length) {
      html += `<table class="fw-table"><thead><tr><th>${t('sec.col.user')}</th><th>${t('sec.col.terminal')}</th><th>${t('sec.col.from')}</th><th>${t('sec.col.time')}</th></tr></thead><tbody>`;
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
      html += `<div class="fw-empty">${t('sec.logins.empty')}</div>`;
    }

    html += `</div></div>

      <div class="fw-card">
        <div class="fw-card-header"><h3>${t('sec.failed.title')}</h3></div>
        <div class="fw-card-body">`;

    if (d.failedLoginsUnavailable) {
      html += `<div class="fw-empty">${t('sec.failed.unavailable')}</div>`;
    } else if (d.failedLogins.length) {
      html += `<table class="fw-table"><thead><tr><th>${t('sec.col.user')}</th><th>${t('sec.col.terminal')}</th><th>${t('sec.col.from')}</th><th>${t('sec.col.time')}</th></tr></thead><tbody>`;
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
      html += `<div class="fw-empty">${t('sec.failed.empty')}</div>`;
    }

    html += `</div></div></div></div>`;
    tab.innerHTML = html;
  },

  async installfail2ban() {
    Modal.confirm(t('sec.f2b.install'), t('sec.f2b.install_message'), async () => {
      if (this.server) {
        await this.exec('apt-get install -y fail2ban 2>/dev/null || dnf install -y fail2ban 2>/dev/null || pacman -S --noconfirm fail2ban 2>/dev/null', { root: true });
        this.load();
      }
    });
  }
};
