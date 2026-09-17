const SecurityScore = {
  server: null,

  load() {
    this.server = App.currentServer;
    if (!this.server || this.server.type !== 'VPS/VDS') return;
    this.render();
    this.scan();
  },

  render() {
    const el = Utils.el('tabSecurity');
    if (!el) return;
    el.innerHTML = `
      <div class="vps-section-header">
        <h2>Security Score</h2>
        <button class="btn btn-sm btn-secondary" onclick="SecurityScore.scan()">Rescan</button>
      </div>
      <div class="sec-score-wrap" id="secScoreWrap">
        <div class="sec-loading">
          <div class="spinner"></div>
          <p>Loading...</p>
        </div>
      </div>`;
  },

  async scan() {
    if (!this.server) return;
    const el = Utils.el('secScoreWrap');
    if (!el) return;
    el.innerHTML = '<div class="sec-loading"><div class="spinner"></div><p>Loading...</p></div>';

    const checks = {};
    const [sshResult, portsResult, fwResult, f2bResult, usersResult] = await Promise.allSettled([
      this._exec("sshd -T 2>/dev/null || cat /etc/ssh/sshd_config 2>/dev/null | grep -E '^(PermitRootLogin|PasswordAuthentication|Port |PubkeyAuthentication|PermitEmptyPasswords|MaxAuthTries|X11Forwarding|AllowTcpForwarding)'"),
      this._exec("ss -tlnp 2>/dev/null | tail -n +2"),
      this._exec("ufw status 2>/dev/null || firewall-cmd --state 2>/dev/null || iptables -L -n 2>/dev/null | head -30"),
      this._exec("fail2ban-client status 2>/dev/null || echo 'NOT_INSTALLED'"),
      this._exec("awk -F: '$3 >= 1000 || $3 == 0 {print $1\":\"$3\":\"$7}' /etc/passwd 2>/dev/null"),
    ]);

    checks.ssh = this._parsessh(sshResult.value?.stdout || '');
    checks.ports = this._parseports(portsResult.value?.stdout || '');
    checks.firewall = this._parsefirewall(fwResult.value?.stdout || '');
    checks.fail2ban = this._parsefail2ban(f2bResult.value?.stdout || '');
    checks.users = this._parseusers(usersResult.value?.stdout || '');

    const score = this._calculatescore(checks);
    this._renderresults(el, score, checks);
  },

  _parsessh(stdout) {
    const lines = stdout.toLowerCase();
    const get = (key) => {
      const m = lines.match(new RegExp(key + '\\s+(\\S+)'));
      return m ? m[1] : null;
    };
    const port = get('port') || '22';
    const rootLogin = get('permitrootlogin') || 'yes';
    const passwordAuth = get('passwordauthentication') || 'yes';
    const pubkeyAuth = get('pubkeyauthentication') || 'yes';
    const emptyPw = get('permitemptypasswords') || 'no';
    const maxAuth = get('maxauthtries') || '6';
    const x11 = get('x11forwarding') || 'no';

    let issues = [];
    let passed = [];
    if (rootLogin === 'yes') issues.push('Root login enabled');
    else passed.push('Root login disabled');
    if (passwordAuth === 'yes') issues.push('Password authentication enabled');
    else passed.push('Password auth disabled (key-only)');
    if (emptyPw === 'yes') issues.push('Empty passwords permitted');
    else passed.push('Empty passwords blocked');
    if (parseInt(maxAuth) > 3) issues.push('Max auth tries too high (' + maxAuth + ')');
    else passed.push('Max auth tries reasonable');
    if (x11 === 'yes') issues.push('X11 forwarding enabled');
    else passed.push('X11 forwarding disabled');

    return { port, rootLogin, passwordAuth, pubkeyAuth, issues, passed };
  },

  _parseports(stdout) {
    const lines = stdout.trim().split('\n');
    const ports = [];
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const local = parts[3] || '';
      const m = local.match(/:(\d+)$/);
      if (m) {
        const port = parseInt(m[1]);
        const proc = parts[parts.length - 1] || '';
        if (!ports.find(p => p.port === port)) {
          ports.push({ port, proc: proc.replace(/.*"/, '').replace(/".*/, '') });
        }
      }
    }
    const dangerous = ports.filter(p => [21, 23, 3389, 5900, 6379, 27017, 11211].includes(p.port));
    const common = ports.filter(p => [22, 80, 443, 8080, 8443, 3306, 5432].includes(p.port));
    const other = ports.filter(p => !dangerous.includes(p) && !common.includes(p));
    return { ports, dangerous, common, other };
  },

  _parsefirewall(stdout) {
    const lower = (stdout || '').toLowerCase();
    if (lower.includes('not installed') || lower.includes('not running') || lower.includes('inactive')) {
      return { active: false, rules: 0 };
    }
    const ruleCount = (stdout.match(/(allow|deny|reject|drop)/gi) || []).length;
    return { active: true, rules: ruleCount };
  },

  _parsefail2ban(stdout) {
    const lower = (stdout || '').toLowerCase();
    if (lower.includes('not_installed') || lower.includes('not found') || lower.includes('command not found')) {
      return { installed: false, running: false, banned: 0 };
    }
    const bannedMatch = stdout.match(/Currently banned:\s*(\d+)/i);
    return {
      installed: true,
      running: !lower.includes('not running'),
      banned: bannedMatch ? parseInt(bannedMatch[1]) : 0
    };
  },

  _parseusers(stdout) {
    const lines = stdout.trim().split('\n').filter(Boolean);
    const sudoUsers = [];
    const normalUsers = [];
    for (const line of lines) {
      const [name, uid, shell] = line.split(':');
      if (!name) continue;
      if (shell && !shell.includes('/sbin/nologin') && !shell.includes('/false')) {
        if (parseInt(uid) === 0) sudoUsers.push(name);
        else normalUsers.push(name);
      }
    }
    return { sudoUsers, normalUsers, total: lines.length };
  },

  _calculatescore(checks) {
    let score = 100;
    const deductions = [];

    const sshDeductions = checks.ssh.issues.length * 8;
    if (sshDeductions) { score -= sshDeductions; deductions.push({ label: 'SSH config', pts: -sshDeductions }); }

    if (checks.ports.dangerous.length > 0) {
      const d = checks.ports.dangerous.length * 10;
      score -= d;
      deductions.push({ label: 'Dangerous ports open', pts: -d });
    }

    if (!checks.firewall.active) {
      score -= 15;
      deductions.push({ label: 'No firewall active', pts: -15 });
    }

    if (!checks.fail2ban.installed) {
      score -= 10;
      deductions.push({ label: 'Fail2ban not installed', pts: -10 });
    } else if (!checks.fail2ban.running) {
      score -= 5;
      deductions.push({ label: 'Fail2ban not running', pts: -5 });
    }

    if (checks.users.sudoUsers.length > 1) {
      score -= 5;
      deductions.push({ label: 'Multiple root/sudo users', pts: -5 });
    }

    return { score: Math.max(0, Math.min(100, score)), deductions };
  },

  _renderresults(el, scoreData, checks) {
    const { score, deductions } = scoreData;
    let color = '#22c55e';
    let label = 'Excellent';
    if (score < 60) { color = '#ef4444'; label = 'Poor'; }
    else if (score < 80) { color = '#f59e0b'; label = 'Fair'; }

    el.innerHTML = `
      <div class="sec-score-card">
        <div class="sec-score-ring">
          <svg viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="15.915" fill="none" stroke="var(--border)" stroke-width="2.5" />
            <circle cx="18" cy="18" r="15.915" fill="none" stroke="${color}" stroke-width="2.5"
              stroke-dasharray="${score} ${100 - score}" stroke-dashoffset="25"
              stroke-linecap="round" style="transition: stroke-dasharray 0.8s ease" />
          </svg>
          <div class="sec-score-val" style="color:${color}">${score}</div>
        </div>
        <div class="sec-score-label" style="color:${color}">${label}</div>
        ${deductions.length > 0 ? `<div class="sec-deductions">${deductions.map(d => `<span class="sec-deduction">${d.label} (${d.pts})</span>`).join('')}</div>` : '<div class="sec-deductions"><span class="sec-deduction sec-ok">No issues found</span></div>'}
      </div>

      <div class="sec-checks-grid">
        <div class="sec-check-card">
          <div class="sec-check-header">
            <span class="sec-check-title">SSH Configuration</span>
            <span class="sec-check-badge ${checks.ssh.issues.length ? 'sec-warn' : 'sec-ok'}">${checks.ssh.issues.length ? checks.ssh.issues.length + ' issues' : 'OK'}</span>
          </div>
          <div class="sec-check-detail">Port: ${checks.ssh.port}</div>
          ${checks.ssh.issues.map(i => `<div class="sec-check-warn">${Utils.escape(i)}</div>`).join('')}
          ${checks.ssh.passed.map(p => `<div class="sec-check-pass">${Utils.escape(p)}</div>`).join('')}
        </div>

        <div class="sec-check-card">
          <div class="sec-check-header">
            <span class="sec-check-title">Open Ports</span>
            <span class="sec-check-badge ${checks.ports.dangerous.length ? 'sec-err' : 'sec-ok'}">${checks.ports.ports.length} total</span>
          </div>
          ${checks.ports.dangerous.map(p => `<div class="sec-check-warn">Port ${p.port} (${Utils.escape(p.proc)}) — dangerous</div>`).join('')}
          ${checks.ports.common.map(p => `<div class="sec-check-pass">Port ${p.port} (${Utils.escape(p.proc)})</div>`).join('')}
          ${checks.ports.other.slice(0, 5).map(p => `<div class="sec-check-detail">Port ${p.port} (${Utils.escape(p.proc)})</div>`).join('')}
          ${checks.ports.other.length > 5 ? `<div class="sec-check-detail">+${checks.ports.other.length - 5} more</div>` : ''}
        </div>

        <div class="sec-check-card">
          <div class="sec-check-header">
            <span class="sec-check-title">Firewall</span>
            <span class="sec-check-badge ${checks.firewall.active ? 'sec-ok' : 'sec-err'}">${checks.firewall.active ? 'Active' : 'Inactive'}</span>
          </div>
          ${checks.firewall.active ? `<div class="sec-check-pass">${checks.firewall.rules} rules configured</div>` : '<div class="sec-check-warn">No firewall is active</div>'}
        </div>

        <div class="sec-check-card">
          <div class="sec-check-header">
            <span class="sec-check-title">Fail2ban</span>
            <span class="sec-check-badge ${checks.fail2ban.installed && checks.fail2ban.running ? 'sec-ok' : checks.fail2ban.installed ? 'sec-warn' : 'sec-err'}">${checks.fail2ban.installed ? (checks.fail2ban.running ? 'Running' : 'Stopped') : 'Not installed'}</span>
          </div>
          ${checks.fail2ban.installed ? `<div class="sec-check-detail">${checks.fail2ban.banned} currently banned</div>` : '<div class="sec-check-warn">Install fail2ban for brute-force protection</div>'}
        </div>

        <div class="sec-check-card">
          <div class="sec-check-header">
            <span class="sec-check-title">System Users</span>
            <span class="sec-check-badge sec-ok">${checks.users.total} users</span>
          </div>
          <div class="sec-check-detail">Root/sudo: ${checks.users.sudoUsers.join(', ') || 'none'}</div>
          <div class="sec-check-detail">Regular: ${checks.users.normalUsers.join(', ') || 'none'}</div>
        </div>
      </div>`;
  },

  async _exec(cmd) {
    const s = this.server;
    if (!s) return { stdout: '' };
    const cfg = { host: s.host, port: s.port || 22, username: s.username || 'root' };
    if (s.authType === 'key') { const pk = await Servers.resolvevpsprivatekey(s); if (pk) { cfg.authType = 'privateKey'; cfg.privateKey = pk; } }
    if (!cfg.authType) { cfg.authType = 'password'; cfg.password = s.password || ''; }
    try {
      return await window.electronAPI.sshexec(cfg, cmd);
    } catch (e) {
      return { stdout: '' };
    }
  }
};
