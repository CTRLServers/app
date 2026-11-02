const Firewall = {
  server: null,
  loading: false,
  fwType: null,
  active: false,
  rules: [],
  rawOutput: '',

  pluralform(n) {
    if (I18n.getlang() !== 'ru') return n === 1 ? 'one' : 'many';
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'one';
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'few';
    return 'many';
  },

  async load() {
    this.server = App.currentServer;
    if (!this.server || this.server.type !== 'VPS/VDS') return;

    this.loading = true;
    this.render();

    try {
      await this.detect();
      if (this.fwType) {
        await this.fetchstatus();
        await this.fetchrules();
      }
    } catch (e) {
      console.error('Firewall load error:', e);
    }

    this.loading = false;
    this.render();
  },

  async detect() {
    this.fwType = null;
    this.active = false;
    this.rules = [];
    this.rawOutput = '';
    const r1 = await this.exec('command -v ufw 2>/dev/null');
    if (r1.exitCode === 0 && r1.stdout.trim()) {
      this.fwType = 'ufw';
      return;
    }
    const r2 = await this.exec('command -v firewall-cmd 2>/dev/null');
    if (r2.exitCode === 0 && r2.stdout.trim()) {
      this.fwType = 'firewalld';
      return;
    }
    const r3 = await this.exec('command -v iptables 2>/dev/null');
    if (r3.exitCode === 0 && r3.stdout.trim()) {
      this.fwType = 'iptables';
    }
  },

  async fetchstatus() {
    if (this.fwType === 'ufw') {
      const r = await this.exec('ufw status 2>/dev/null');
      this.active = r.exitCode === 0 && /^Status:\s+active\s*$/im.test(r.stdout || '');
    } else if (this.fwType === 'firewalld') {
      const r = await this.exec('firewall-cmd --state 2>/dev/null');
      this.active = r.exitCode === 0 && r.stdout.trim() === 'running';
    } else if (this.fwType === 'iptables') {
      const r = await this.exec('iptables -S 2>/dev/null', { notify: false });
      const output = r.stdout || '';
      const restrictive = /^-P\s+INPUT\s+(DROP|REJECT)\s*$/im.test(output);
      const hasrules = /^-A\s+INPUT\b/im.test(output);
      this.active = !r.error && r.exitCode === 0 && (restrictive || hasrules);
    }
  },

  async fetchrules() {
    this.rules = [];
    if (this.fwType === 'ufw') {
      const r = await this.exec('ufw status numbered 2>/dev/null');
      this.rawOutput = r.stdout || '';
      this.parseufwrules(r.stdout || '');
    } else if (this.fwType === 'firewalld') {
      const r = await this.exec('firewall-cmd --list-all 2>/dev/null');
      this.rawOutput = r.stdout || '';
      this.parsefirewalldrules(r.stdout || '');
    } else if (this.fwType === 'iptables') {
      const r = await this.exec('iptables -S 2>/dev/null', { notify: false });
      this.rawOutput = r.stdout || '';
    }
  },

  parseufwrules(output) {
    const lines = output.split('\n');
    for (const line of lines) {
      const m = line.match(/^\[\s*(\d+)\]\s+(.+?)\s+(ALLOW|DENY|REJECT|LOG)\s+(IN|OUT|FORWARD)\s*(.*)/i);
      if (m) {
        this.rules.push({
          number: parseInt(m[1]),
          port: m[2].trim(),
          action: m[3].toUpperCase(),
          direction: m[4].toUpperCase(),
          source: m[5] ? m[5].trim() : ''
        });
      }
    }
  },

  parsefirewalldrules(output) {
    const lines = output.split('\n');
    let currentSection = '';
    for (const line of lines) {
      if (line.startsWith('services:')) {
        const svcs = line.slice(9).trim().split(/\s+/).filter(Boolean);
        svcs.forEach(s => this.rules.push({ number: this.rules.length + 1, port: s, action: 'ALLOW', direction: 'IN', source: '', type: 'service' }));
      } else if (line.startsWith('ports:')) {
        const ports = line.slice(6).trim().split(/\s+/).filter(Boolean);
        ports.forEach(p => this.rules.push({ number: this.rules.length + 1, port: p, action: 'ALLOW', direction: 'IN', source: '', type: 'port' }));
      }
    }
  },

  async togglefirewall() {
    if (this.fwType === 'ufw') {
      await this.exec(this.active ? 'ufw disable' : 'ufw --force enable');
    } else if (this.fwType === 'firewalld') {
      await this.exec(this.active ? 'systemctl stop firewalld' : 'systemctl start firewalld');
    }
    await this.fetchstatus();
    await this.fetchrules();
    this.render();
  },

  async addrule(port, proto, action, source) {
    if (this.fwType === 'ufw') {
      let cmd = '';
      const act = action === 'ALLOW' ? 'allow' : 'deny';
      if (source) {
        cmd = `ufw ${act} from ${source} to any port ${port} proto ${proto}`;
      } else {
        cmd = `ufw ${act} ${port}/${proto}`;
      }
      await this.exec(cmd);
    } else if (this.fwType === 'firewalld') {
      const zone = 'public';
      await this.exec(`firewall-cmd --zone=${zone} --add-port=${port}/${proto} --permanent`);
      await this.exec('firewall-cmd --reload');
    }
    await this.fetchrules();
    this.render();
  },

  async deleterule(num) {
    if (this.fwType === 'ufw') {
      await this.exec(`ufw delete ${num}`);
    }
    await this.fetchrules();
    this.render();
  },

  async exec(command, options = {}) {
    return await Servers.execvps(this.server, command, { ...options, page: 'firewall' });
  },

  render() {
    const tab = Utils.el('tabFirewall');
    if (!tab) return;

    if (this.loading) {
      tab.innerHTML = `<div class="loading"><div class="spinner"></div><div class="loading-text">${t('common.loading')}</div></div>`;
      return;
    }

    if (!this.fwType) {
      tab.innerHTML = `<div class="fw-unsupported">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        <h3>${t('fw.unsupported.title')}</h3>
        <p>${t('fw.unsupported.desc')}</p>
      </div>`;
      return;
    }

    const fwLabel = this.fwType === 'ufw' ? 'UFW' : this.fwType === 'firewalld' ? 'Firewalld' : 'iptables';

    let html = `<div class="fw-container">
      <div class="fw-status-card">
        <div class="fw-status-left">
          <div class="fw-status-icon ${this.active ? 'fw-active' : 'fw-inactive'}">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </div>
          <div class="fw-status-info">
            <h3>${this.active ? t('fw.title.active') : t('fw.title.inactive')}</h3>
            <span>${fwLabel} - ${t('fw.rules.' + this.pluralform(this.rules.length), { n: this.rules.length })}</span>
          </div>
        </div>
        ${this.fwType === 'iptables' ? '' : `<button class="btn btn-sm ${this.active ? 'btn-red' : 'btn-green'}" onclick="Firewall.togglefirewall()">
          ${this.active ? t('fw.disable') : t('fw.enable')}
        </button>`}
      </div>

      <div class="fw-card">
        <div class="fw-card-header">
          <h3>${t('fw.rules_title')}</h3>
          <button class="btn btn-primary btn-sm" onclick="Firewall.showaddrule()">${t('fw.add_rule')}</button>
        </div>
        <div class="fw-card-body">`;

    if (this.fwType === 'ufw' && this.rules.length > 0) {
      html += `<div class="fw-table-wrap"><table class="fw-table">
        <thead><tr><th>#</th><th>${t('fw.col.port_service')}</th><th>${t('fw.col.action')}</th><th>${t('fw.col.direction')}</th><th>${t('fw.col.source')}</th><th></th></tr></thead>
        <tbody>`;
      for (const r of this.rules) {
        html += `<tr>
          <td class="fw-td-num">${r.number}</td>
          <td><code>${Utils.escape(r.port)}</code></td>
          <td><span class="fw-action fw-action-${r.action.toLowerCase()}">${r.action}</span></td>
          <td>${r.direction}</td>
          <td>${r.source ? '<code>' + Utils.escape(r.source) + '</code>' : `<span class="text-muted">${t('fw.any')}</span>`}</td>
          <td><button class="btn-icon btn-danger-sm" onclick="Firewall.deleterule(${r.number})" title="${t('fw.delete')}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button></td>
        </tr>`;
      }
      html += '</tbody></table></div>';
    } else if (this.fwType === 'firewalld' && this.rules.length > 0) {
      html += `<div class="fw-table-wrap"><table class="fw-table">
        <thead><tr><th>#</th><th>${t('fw.col.service_port')}</th><th>${t('fw.col.type')}</th><th>${t('fw.col.action')}</th></tr></thead>
        <tbody>`;
      for (const r of this.rules) {
        html += `<tr>
          <td class="fw-td-num">${r.number}</td>
          <td><code>${Utils.escape(r.port)}</code></td>
          <td>${r.type === 'service' ? t('fw.type.service') : t('fw.type.port')}</td>
          <td><span class="fw-action fw-action-allow">${r.action}</span></td>
        </tr>`;
      }
      html += '</tbody></table></div>';
    } else {
      html += `<div class="fw-empty">${t('fw.no_rules')}</div>`;
    }

    html += `</div></div>

      <div class="fw-card">
        <div class="fw-card-header"><h3>${t('fw.raw')}</h3></div>
        <div class="fw-card-body">
          <pre class="fw-raw">${Utils.escape(this.rawOutput || t('fw.no_output'))}</pre>
        </div>
      </div>
    </div>`;

    tab.innerHTML = html;
  },

  showaddrule() {
    Modal.open(t('fw.add_title'), `
      <div class="form-group">
        <label class="form-label">${t('fw.form.port')}</label>
        <input class="form-input" type="text" id="fwRulePort" placeholder="80, 443, 22, ssh, http" />
      </div>
      <div class="form-group">
        <label class="form-label">${t('fw.form.protocol')}</label>
        <select class="form-input" id="fwRuleProto">
          <option value="tcp">TCP</option>
          <option value="udp">UDP</option>
          <option value="both">${t('fw.form.both')}</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">${t('fw.form.action')}</label>
        <select class="form-input" id="fwRuleAction">
          <option value="ALLOW">${t('fw.form.allow')}</option>
          <option value="DENY">${t('fw.form.deny')}</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">${t('fw.form.source')}</label>
        <input class="form-input" type="text" id="fwRuleSource" placeholder="${t('fw.form.source_placeholder')}" />
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">${t('fw.cancel')}</button>
        <button class="btn btn-primary" id="fwAddRuleBtn">${t('fw.add_rule')}</button>
      </div>
    `);
    setTimeout(() => {
      const btn = Utils.el('fwAddRuleBtn');
      if (btn) btn.addEventListener('click', async () => {
        const port = Utils.el('fwRulePort').value.trim();
        const proto = Utils.el('fwRuleProto').value;
        const action = Utils.el('fwRuleAction').value;
        const source = Utils.el('fwRuleSource').value.trim();
        if (!port) return;
        btn.disabled = true;
        btn.textContent = t('fw.adding');
        await Firewall.addrule(port, proto, action, source);
        Modal.close();
      });
    }, 0);
  }
};
