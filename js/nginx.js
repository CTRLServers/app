const WebServer = {
  server: null,
  loading: false,
  type: null,
  vhosts: [],
  configs: [],
  sslcerts: [],
  status: null,

  async load() {
    this.server = App.currentserver;
    if (!this.server || this.server.type !== 'VPS/VDS') return;

    this.loading = true;
    this.render();

    try {
      await this.detect();
      if (this.type) {
        await this.fetchall();
      }
    } catch (e) {
      console.error('WebServer load error:', e);
    }

    this.loading = false;
    this.render();
  },

  async detect() {
    this.type = null;
    const nginx = await this.exec('command -v nginx && nginx -v 2>&1');
    if (nginx.exitcode === 0 && nginx.stdout.includes('nginx')) {
      this.type = 'nginx';
      return;
    }
    const apache = await this.exec('command -v apache2 || command -v httpd');
    if (apache.exitcode === 0) {
      this.type = 'apache';
      return;
    }
    this.type = null;
  },

  async fetchall() {
    if (this.type === 'nginx') await this.fetchnginx();
    else if (this.type === 'apache') await this.fetchapache();
    await this.fetchsslcerts();
  },

  async fetchnginx() {
    this.vhosts = [];
    this.configs = [];

    const statusr = await this.exec('systemctl is-active nginx 2>/dev/null || service nginx status 2>/dev/null | head -1');
    this.status = statusr.stdout.trim().toLowerCase().includes('active') ? 'running' : 'stopped';

    const sitesr = await this.exec('ls /etc/nginx/sites-enabled/ 2>/dev/null || ls /etc/nginx/conf.d/ 2>/dev/null');
    if (sitesr.exitcode === 0 && sitesr.stdout.trim()) {
      for (const site of sitesr.stdout.split('\n')) {
        const name = site.trim();
        if (!name) continue;
        const confr = await this.exec(`cat /etc/nginx/sites-enabled/${name} 2>/dev/null || cat /etc/nginx/conf.d/${name} 2>/dev/null`);
        const conf = confr.stdout;
        const servername = conf.match(/server_name\s+([^;]+)/)?.[1]?.trim() || name;
        const listen = conf.match(/listen\s+([^;]+)/)?.[1]?.trim() || '';
        const ssl = conf.includes('ssl_certificate');
        const locations = (conf.match(/location\s+[^\s{]+/g) || []).length;
        this.vhosts.push({
          name, servername, listen, ssl, locations, config: conf, type: 'nginx'
        });
      }
    }

    const mainconf = await this.exec('cat /etc/nginx/nginx.conf 2>/dev/null');
    if (mainconf.exitcode === 0) {
      this.configs.push({ name: 'nginx.conf', content: mainconf.stdout });
    }
  },

  async fetchapache() {
    this.vhosts = [];
    this.configs = [];

    const statusr = await this.exec('systemctl is-active apache2 2>/dev/null || systemctl is-active httpd 2>/dev/null');
    this.status = statusr.stdout.trim().toLowerCase().includes('active') ? 'running' : 'stopped';

    const sitesr = await this.exec('ls /etc/apache2/sites-enabled/ 2>/dev/null || ls /etc/httpd/conf.d/ 2>/dev/null');
    if (sitesr.exitcode === 0 && sitesr.stdout.trim()) {
      for (const site of sitesr.stdout.split('\n')) {
        const name = site.trim();
        if (!name) continue;
        const confr = await this.exec(`cat /etc/apache2/sites-enabled/${name} 2>/dev/null || cat /etc/httpd/conf.d/${name} 2>/dev/null`);
        const conf = confr.stdout;
        const servername = conf.match(/ServerName\s+([^\s\n]+)/)?.[1] || name;
        const ssl = conf.includes('SSLEngine on');
        this.vhosts.push({
          name, servername, ssl, config: conf, type: 'apache'
        });
      }
    }
  },

  async fetchsslcerts() {
    this.sslcerts = [];
    const r = await this.exec('find /etc/letsencrypt/live -name "cert.pem" -type f 2>/dev/null');
    if (r.exitcode !== 0 || !r.stdout.trim()) return;

    for (const certpath of r.stdout.split('\n')) {
      const p = certpath.trim();
      if (!p) continue;
      const domain = p.split('/live/')[1]?.split('/')[0] || '';
      const expiry = await this.exec(`openssl x509 -enddate -noout -in "${p}" 2>/dev/null | cut -d= -f2`);
      const issuer = await this.exec(`openssl x509 -issuer -noout -in "${p}" 2>/dev/null | sed 's/issuer=// '`);
      this.sslcerts.push({
        domain,
        path: p,
        expiry: expiry.stdout.trim() || 'Unknown',
        issuer: issuer.stdout.trim() || 'Unknown'
      });
    }
  },

  async reloadwebserver() {
    if (!this.type) return;
    await this.exec(`systemctl reload ${this.type} 2>/dev/null || service ${this.type} reload 2>/dev/null`);
    await this.fetchall();
    this.render();
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
    if (isroot) return await window.electronapi.sshexec(cfg, command);
    const pass = (this.server.password || '').replace(/'/g, "'\\''");
    const wrapped = command.replace(/'/g, "'\\''");
    return await window.electronapi.sshexec(cfg, `echo '${pass}' | sudo -S sh -c '${wrapped}' 2>/dev/null`);
  },

  render() {
    const el = Utils.el('tabwebserver');
    if (!el) return;

    if (this.loading) {
      el.innerHTML = '<div class="loading"><div class="spinner"></div><div class="loading-text">Detecting web server...</div></div>';
      return;
    }

    if (!this.type) {
      el.innerHTML = `<div class="pkg-container"><div class="pkg-os-banner"><div class="pkg-os-info"><svg width="32" height="32" viewbox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg><h3>No web server detected</h3><p class="text-muted">Nginx or Apache is not installed</p></div></div></div>`;
      return;
    }

    const statusclass = this.status === 'running' ? 'svc-active' : 'svc-failed';
    const statuslabel = this.status === 'running' ? 'Running' : 'Stopped';
    const typename = this.type === 'nginx' ? 'Nginx' : 'Apache';

    let html = `<div class="ws-container">
      <div class="ws-header-row">
        <div class="ws-type-badge">${typename}</div>
        <span class="svc-state-badge ${statusclass}">${statuslabel}</span>
        <button class="btn btn-sm btn-secondary" onclick="WebServer.reloadwebserver()">Reload Config</button>
        <button class="btn btn-sm btn-secondary" onclick="WebServer.load()">Refresh</button>
      </div>

      <div class="fw-card">
        <div class="fw-card-header"><h3>Virtual Hosts (${this.vhosts.length})</h3></div>
        <div class="fw-card-body">`;

    if (this.vhosts.length) {
      for (const vh of this.vhosts) {
        html += `<div class="ws-vhost">
          <div class="ws-vhost-header">
            <div class="ws-vhost-info">
              <div class="ws-vhost-name">${Utils.escape(vh.name)}</div>
              <code class="ws-vhost-servername">${Utils.escape(vh.servername)}</code>
            </div>
            <div class="ws-vhost-badges">
              ${vh.ssl ? '<span class="svc-state-badge svc-active">SSL</span>' : ''}
            </div>
          </div>
        </div>`;
      }
    } else {
      html += '<div class="fw-empty">No virtual hosts found</div>';
    }

    html += `</div></div>`;

    if (this.sslcerts.length) {
      html += `<div class="fw-card">
        <div class="fw-card-header"><h3>SSL Certificates (${this.sslcerts.length})</h3></div>
        <div class="fw-card-body">
          <table class="fw-table"><thead><tr><th>Domain</th><th>Issuer</th><th>Expires</th></tr></thead><tbody>`;
      for (const cert of this.sslcerts) {
        html += `<tr>
          <td><code>${Utils.escape(cert.domain)}</code></td>
          <td>${Utils.escape(cert.issuer)}</td>
          <td>${Utils.escape(cert.expiry)}</td>
        </tr>`;
      }
      html += '</tbody></table></div></div>';
    }

    html += '</div>';
    el.innerHTML = html;
  }
};
