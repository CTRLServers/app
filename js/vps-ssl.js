const VPSSSL = {
  server: null,

  load() {
    this.server = App.currentServer;
    this.renderloading();
    this.fetch();
  },

  destroy() {},

  renderloading() {
    const c = Utils.el('tabSSL');
    if (c) c.innerHTML = '<div class="loading"><div class="spinner"></div><div class="loading-text">Loading...</div></div>';
  },

  render() {
    const c = Utils.el('tabSSL');
    c.innerHTML = `
      <div class="vps-section-header">
        <h2>SSL Certificate Manager</h2>
        <div class="vps-ssl-controls">
          <button class="btn btn-sm btn-primary" onclick="VPSSSL.showaddcert()">Request New Certificate</button>
          <button class="btn btn-sm btn-secondary" onclick="VPSSSL.renewall()">Renew All</button>
          <button class="btn btn-sm btn-secondary" onclick="VPSSSL.fetch()">Refresh</button>
        </div>
      </div>
      <div class="vps-ssl-status" id="sslStatus"></div>
      <div class="vps-ssl-certs" id="sslCerts"></div>
      <div id="sslAddForm" class="vps-ssl-form" style="display:none;"></div>`;
  },

  async fetch() {
    if (!this.server) return;
    const res = await this.exec('certbot certificates 2>/dev/null || echo "CERTBOT_NOT_FOUND"');
    if (res?.error) return;
    this.render();
    const stdout = res?.stdout || '';
    const status = Utils.el('sslStatus');
    const certs = Utils.el('sslCerts');
    if (!status || !certs) return;

    if (stdout.includes('CERTBOT_NOT_FOUND')) {
      status.innerHTML = `
        <div class="vps-ssl-alert vps-ssl-warn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span>Certbot is not installed. Install it first.</span>
          <button class="btn btn-sm btn-primary" onclick="VPSSSL.installcertbot()">Install Certbot</button>
        </div>`;
      certs.innerHTML = '';
      return;
    }

    const parsed = this.parsecerts(stdout);
    const now = Date.now();
    let expiringSoon = 0;
    parsed.forEach(c => {
      const daysLeft = Math.floor((c.expiry - now) / 86400000);
      c.daysLeft = daysLeft;
      if (daysLeft <= 30 && daysLeft >= 0) expiringSoon++;
    });

    status.innerHTML = `
      <div class="vps-ssl-stat-row">
        <div class="vps-ssl-stat">
          <span class="vps-ssl-stat-val">${parsed.length}</span>
          <span class="vps-ssl-stat-lbl">Certificates</span>
        </div>
        <div class="vps-ssl-stat ${expiringSoon > 0 ? 'vps-ssl-warn-stat' : ''}">
          <span class="vps-ssl-stat-val">${expiringSoon}</span>
          <span class="vps-ssl-stat-lbl">Expiring Soon</span>
        </div>
      </div>`;

    if (parsed.length === 0) {
      certs.innerHTML = '<div class="vps-ssl-empty">No certificates found.</div>';
      return;
    }

    certs.innerHTML = parsed.map(c => {
      const statuscls = c.daysLeft < 0 ? 'ssl-expired' : c.daysLeft <= 30 ? 'ssl-expiring' : 'ssl-ok';
      const statuslbl = c.daysLeft < 0 ? 'Expired' : c.daysLeft <= 30 ? `Expires in ${c.daysLeft}d` : `Valid (${c.daysLeft}d)`;
      return `<div class="vps-ssl-cert-card ${statuscls}">
        <div class="vps-ssl-cert-header">
          <span class="vps-ssl-cert-name">${Utils.escape(c.name)}</span>
          <span class="vps-ssl-cert-badge ${statuscls}">${statuslbl}</span>
        </div>
        <div class="vps-ssl-cert-details">
          <div><strong>Domains:</strong> ${c.domains.map(d => Utils.escape(d)).join(', ')}</div>
          <div><strong>Expiry:</strong> ${c.expiry.toLocaleDateString()}</div>
          <div><strong>Path:</strong> ${Utils.escape(c.path || 'N/A')}</div>
        </div>
        <div class="vps-ssl-cert-actions">
          <button class="btn btn-sm btn-secondary" onclick="VPSSSL.renew('${Utils.escape(c.name)}')">Renew</button>
        </div>
      </div>`;
    }).join('');
  },

  parsecerts(stdout) {
    const certs = [];
    const blocks = stdout.split('  Certificate Name:');
    for (let i = 1; i < blocks.length; i++) {
      const block = blocks[i];
      const nameMatch = block.match(/^(.+)/m);
      const domMatch = block.match(/Domains:\s+(.+)/m);
      const expMatch = block.match(/Expiry Date:\s+(.+?)(?:\s+\(|$)/m);
      const pathMatch = block.match(/Certificate Path:\s+(.+)/m);
      if (nameMatch) {
        certs.push({
          name: nameMatch[1].trim(),
          domains: domMatch ? domMatch[1].trim().split(/\s+/) : [],
          expiry: expMatch ? new Date(expMatch[1].trim()) : new Date(),
          path: pathMatch ? pathMatch[1].trim() : ''
        });
      }
    }
    return certs;
  },

  showaddcert() {
    const el = Utils.el('sslAddForm');
    if (!el) return;
    el.style.display = el.style.display === 'none' ? '' : 'none';
    el.innerHTML = `
      <div class="vps-ssl-form-inner">
        <h3>Request New Certificate</h3>
        <div class="vps-ssl-form-group">
          <label>Domain(s) (space separated)</label>
          <input type="text" class="vps-ssl-input" id="sslDomain" placeholder="example.com www.example.com" />
        </div>
        <div class="vps-ssl-form-group">
          <label>Email</label>
          <input type="email" class="vps-ssl-input" id="sslEmail" placeholder="admin@example.com" />
        </div>
        <div class="vps-ssl-form-actions">
          <button class="btn btn-sm btn-primary" onclick="VPSSSL.requestcert()">Request</button>
          <button class="btn btn-sm btn-secondary" onclick="Utils.el('sslAddForm').style.display='none'">Cancel</button>
        </div>
      </div>`;
  },

  async requestcert() {
    const domain = (Utils.el('sslDomain')?.value || '').trim();
    const email = (Utils.el('sslEmail')?.value || '').trim();
    if (!domain) return Modal.alert('Error', 'Enter at least one domain.');
    if (!email) return Modal.alert('Error', 'Enter an email address.');
    const cmd = `certbot certonly --non-interactive --agree-tos --email ${email} -d ${domain.split(/\s+/).join(' -d ')} 2>&1`;
    Modal.confirm('Request Certificate', `Request SSL for: ${domain}?`, async () => {
      const res = await this.exec(cmd);
      Modal.alert('Result', res?.stdout || res?.stderr || 'No output');
      this.fetch();
    });
  },

  async renew(name) {
    Modal.confirm('Renew Certificate', `Renew ${name}?`, async () => {
      const res = await this.exec(`certbot renew --cert-name ${name} 2>&1`);
      Modal.alert('Result', res?.stdout || res?.stderr || 'No output');
      this.fetch();
    });
  },

  async renewall() {
    Modal.confirm('Renew All', 'Renew all certificates?', async () => {
      const res = await this.exec('certbot renew 2>&1');
      Modal.alert('Result', res?.stdout || res?.stderr || 'No output');
      this.fetch();
    });
  },

  async installcertbot() {
    Modal.confirm('Install Certbot', 'Install certbot via package manager?', async () => {
      const pkg = await this.exec('which apt 2>/dev/null && echo apt || (which yum 2>/dev/null && echo yum) || echo none');
      const mgr = (pkg?.stdout || '').trim();
      if (mgr === 'apt') await this.exec('apt update && apt install -y certbot python3-certbot-nginx');
      else if (mgr === 'yum') await this.exec('yum install -y certbot python3-certbot-nginx');
      else return Modal.alert('Error', 'Cannot detect package manager.');
      this.fetch();
    });
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
