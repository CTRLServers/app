const Firewall = {
  server: null,
  loading: false,
  fwType: null,
  active: false,
  rules: [],
  rawOutput: '',

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
    const r1 = await this.exec('which ufw 2>/dev/null');
    if (r1.exitCode === 0 && r1.stdout.trim()) {
      this.fwType = 'ufw';
      return;
    }
    const r2 = await this.exec('which firewall-cmd 2>/dev/null');
    if (r2.exitCode === 0 && r2.stdout.trim()) {
      this.fwType = 'firewalld';
      return;
    }
    const r3 = await this.exec('which iptables 2>/dev/null');
    if (r3.exitCode === 0 && r3.stdout.trim()) {
      this.fwType = 'iptables';
    }
  },

  async fetchstatus() {
    if (this.fwType === 'ufw') {
      const r = await this.exec('ufw status 2>/dev/null');
      this.active = r.stdout.toLowerCase().includes('active');
    } else if (this.fwType === 'firewalld') {
      const r = await this.exec('firewall-cmd --state 2>/dev/null');
      this.active = r.exitCode === 0 && r.stdout.trim() === 'running';
    } else if (this.fwType === 'iptables') {
      const r = await this.exec('iptables -L -n 2>/dev/null | head -5');
      this.active = r.exitCode === 0 && r.stdout.length > 10;
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
    const tab = Utils.el('tabFirewall');
    if (!tab) return;

    if (this.loading) {
      tab.innerHTML = '<div class="loading"><div class="spinner"></div><div class="loading-text">Loading firewall...</div></div>';
      return;
    }

    if (!this.fwType) {
      tab.innerHTML = `<div class="fw-unsupported">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        <h3>No supported firewall found</h3>
        <p>Install UFW or firewalld to manage firewall rules</p>
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
            <h3>Firewall ${this.active ? 'Active' : 'Inactive'}</h3>
            <span>${fwLabel} — ${this.rules.length} rule${this.rules.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <button class="btn btn-sm ${this.active ? 'btn-red' : 'btn-green'}" onclick="Firewall.togglefirewall()">
          ${this.active ? 'Disable' : 'Enable'}
        </button>
      </div>

      <div class="fw-card">
        <div class="fw-card-header">
          <h3>Rules</h3>
          <button class="btn btn-primary btn-sm" onclick="Firewall.showaddrule()">Add Rule</button>
        </div>
        <div class="fw-card-body">`;

    if (this.fwType === 'ufw' && this.rules.length > 0) {
      html += `<div class="fw-table-wrap"><table class="fw-table">
        <thead><tr><th>#</th><th>Port/Service</th><th>Action</th><th>Direction</th><th>Source</th><th></th></tr></thead>
        <tbody>`;
      for (const r of this.rules) {
        html += `<tr>
          <td class="fw-td-num">${r.number}</td>
          <td><code>${Utils.escape(r.port)}</code></td>
          <td><span class="fw-action fw-action-${r.action.toLowerCase()}">${r.action}</span></td>
          <td>${r.direction}</td>
          <td>${r.source ? '<code>' + Utils.escape(r.source) + '</code>' : '<span class="text-muted">Any</span>'}</td>
          <td><button class="btn-icon btn-danger-sm" onclick="Firewall.deleterule(${r.number})" title="Delete">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button></td>
        </tr>`;
      }
      html += '</tbody></table></div>';
    } else if (this.fwType === 'firewalld' && this.rules.length > 0) {
      html += `<div class="fw-table-wrap"><table class="fw-table">
        <thead><tr><th>#</th><th>Service/Port</th><th>Type</th><th>Action</th></tr></thead>
        <tbody>`;
      for (const r of this.rules) {
        html += `<tr>
          <td class="fw-td-num">${r.number}</td>
          <td><code>${Utils.escape(r.port)}</code></td>
          <td>${r.type || 'port'}</td>
          <td><span class="fw-action fw-action-allow">${r.action}</span></td>
        </tr>`;
      }
      html += '</tbody></table></div>';
    } else {
      html += `<div class="fw-empty">No rules configured</div>`;
    }

    html += `</div></div>

      <div class="fw-card">
        <div class="fw-card-header"><h3>Raw Output</h3></div>
        <div class="fw-card-body">
          <pre class="fw-raw">${Utils.escape(this.rawOutput || 'No output')}</pre>
        </div>
      </div>
    </div>`;

    tab.innerHTML = html;
  },

  showaddrule() {
    Modal.open('Add Firewall Rule', `
      <div class="form-group">
        <label class="form-label">Port / Service</label>
        <input class="form-input" type="text" id="fwRulePort" placeholder="80, 443, 22, ssh, http" />
      </div>
      <div class="form-group">
        <label class="form-label">Protocol</label>
        <select class="form-input" id="fwRuleProto">
          <option value="tcp">TCP</option>
          <option value="udp">UDP</option>
          <option value="both">Both</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Action</label>
        <select class="form-input" id="fwRuleAction">
          <option value="ALLOW">Allow</option>
          <option value="DENY">Deny</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Source IP (optional)</label>
        <input class="form-input" type="text" id="fwRuleSource" placeholder="Leave empty for any" />
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" id="fwAddRuleBtn">Add Rule</button>
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
        btn.textContent = 'Adding...';
        await Firewall.addrule(port, proto, action, source);
        Modal.close();
      });
    }, 0);
  }
};
