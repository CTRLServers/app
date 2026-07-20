const Packages = {
  server: null,
  osId: null,
  osName: null,
  pkgManager: null,
  installedPackages: [],
  allInstalledRaw: [],
  loading: false,
  showAll: false,

  PACKAGES: [
    { id: 'nginx', name: 'Nginx' },
    { id: 'apache2', name: 'Apache2' },
    { id: 'python3', name: 'Python3 + pip' },
    { id: 'htop', name: 'Htop' },
    { id: 'btop', name: 'Btop' },
    { id: 'fastfetch', name: 'Fastfetch' },
    { id: 'neofetch', name: 'Neofetch' },
    { id: 'certbot', name: 'Certbot' },
    { id: 'ufw', name: 'UFW' },
    { id: 'nodejs', name: 'Node.js' },
    { id: 'mariadb', name: 'MariaDB' },
    { id: 'postgresql', name: 'PostgreSQL' }
  ],

  OS_MAP: {
    ubuntu: 'apt', debian: 'apt', linuxmint: 'mint', mint: 'apt',
    centos: 'dnf', rhel: 'dnf', rocky: 'dnf', rockylinux: 'dnf',
    almalinux: 'dnf', fedora: 'dnf', ol: 'dnf',
    arch: 'pacman', manjarolinux: 'pacman', manjaro: 'pacman',
    alpine: 'apk',
    gentoo: 'gentoo', calculate: 'gentoo'
  },

  INSTALL: {
    apt: {
      nginx: 'apt-get install -y nginx',
      apache2: 'apt-get install -y apache2',
      python3: 'apt-get install -y python3 python3-pip',
      htop: 'apt-get install -y htop',
      btop: 'apt-get install -y btop',
      fastfetch: 'apt-get install -y fastfetch',
      neofetch: 'apt-get install -y neofetch',
      certbot: 'apt-get install -y certbot python3-certbot-nginx',
      ufw: 'apt-get install -y ufw',
      nodejs: 'apt-get install -y nodejs npm',
      mariadb: 'apt-get install -y mariadb-server',
      postgresql: 'apt-get install -y postgresql postgresql-contrib'
    },
    dnf: {
      nginx: 'dnf install -y nginx',
      apache2: 'dnf install -y httpd',
      python3: 'dnf install -y python3 python3-pip',
      htop: 'dnf install -y htop',
      btop: 'dnf install -y btop',
      fastfetch: 'dnf install -y fastfetch',
      neofetch: 'dnf install -y neofetch',
      certbot: 'dnf install -y certbot python3-certbot-nginx',
      ufw: 'dnf install -y ufw',
      nodejs: 'dnf install -y nodejs npm',
      mariadb: 'dnf install -y mariadb-server',
      postgresql: 'dnf install -y postgresql-server postgresql-contrib'
    },
    pacman: {
      nginx: 'pacman -S --noconfirm nginx',
      apache2: 'pacman -S --noconfirm apache',
      python3: 'pacman -S --noconfirm python python-pip',
      htop: 'pacman -S --noconfirm htop',
      btop: 'pacman -S --noconfirm btop',
      fastfetch: 'pacman -S --noconfirm fastfetch',
      neofetch: 'pacman -S --noconfirm neofetch',
      certbot: 'pacman -S --noconfirm certbot python-certbot-nginx',
      ufw: 'pacman -S --noconfirm ufw',
      nodejs: 'pacman -S --noconfirm nodejs npm',
      mariadb: 'pacman -S --noconfirm mariadb',
      postgresql: 'pacman -S --noconfirm postgresql'
    },
    apk: {
      nginx: 'apk add nginx',
      apache2: 'apk add apache2',
      python3: 'apk add python3 py3-pip',
      htop: 'apk add htop',
      btop: 'apk add btop',
      fastfetch: 'apk add fastfetch',
      neofetch: 'apk add neofetch',
      certbot: 'apk add certbot',
      ufw: 'apk add ufw',
      nodejs: 'apk add nodejs npm',
      mariadb: 'apk add mariadb',
      postgresql: 'apk add postgresql'
    },
    gentoo: {
      nginx: 'emerge www-servers/nginx',
      apache2: 'emerge www-servers/apache',
      python3: 'emerge dev-lang/python dev-python/pip',
      htop: 'emerge sys-process/htop',
      btop: 'emerge sys-process/btop',
      fastfetch: 'emerge sys-apps/fastfetch',
      neofetch: 'emerge app-misc/neofetch',
      certbot: 'emerge app-crypt/certbot',
      ufw: 'emerge net-firewall/ufw',
      nodejs: 'emerge net-libs/nodejs',
      mariadb: 'emerge dev-db/mariadb',
      postgresql: 'emerge dev-db/postgresql'
    }
  },

  DETECT_NAMES: {
    apt: {
      nginx: 'nginx', apache2: 'apache2', python3: 'python3', htop: 'htop',
      btop: 'btop', fastfetch: 'fastfetch', neofetch: 'neofetch', certbot: 'certbot',
      ufw: 'ufw', nodejs: 'nodejs', mariadb: 'mariadb-server', postgresql: 'postgresql'
    },
    dnf: {
      nginx: 'nginx', apache2: 'httpd', python3: 'python3', htop: 'htop',
      btop: 'btop', fastfetch: 'fastfetch', neofetch: 'neofetch', certbot: 'certbot',
      ufw: 'ufw', nodejs: 'nodejs', mariadb: 'mariadb-server', postgresql: 'postgresql-server'
    },
    pacman: {
      nginx: 'nginx', apache2: 'apache', python3: 'python', htop: 'htop',
      btop: 'btop', fastfetch: 'fastfetch', neofetch: 'neofetch', certbot: 'certbot',
      ufw: 'ufw', nodejs: 'nodejs', mariadb: 'mariadb', postgresql: 'postgresql'
    },
    apk: {
      nginx: 'nginx', apache2: 'apache2', python3: 'python3', htop: 'htop',
      btop: 'btop', fastfetch: 'fastfetch', neofetch: 'neofetch', certbot: 'certbot',
      ufw: 'ufw', nodejs: 'nodejs', mariadb: 'mariadb', postgresql: 'postgresql'
    },
    gentoo: {
      nginx: 'www-servers/nginx', apache2: 'www-servers/apache', python3: 'dev-lang/python',
      htop: 'sys-process/htop', btop: 'sys-process/btop', fastfetch: 'sys-apps/fastfetch',
      neofetch: 'app-misc/neofetch', certbot: 'app-crypt/certbot', ufw: 'net-firewall/ufw',
      nodejs: 'net-libs/nodejs', mariadb: 'dev-db/mariadb', postgresql: 'dev-db/postgresql'
    }
  },

  INSTALLED_CMD: {
    apt: "dpkg-query -W -f='${Package} ${Version}\\n' 2>/dev/null | sort",
    dnf: "rpm -qa --queryformat '%{NAME} %{VERSION}\\n' 2>/dev/null | sort",
    pacman: "pacman -Q 2>/dev/null",
    apk: "apk info -v 2>/dev/null",
    gentoo: "qlist -I 2>/dev/null"
  },

  async load() {
    this.server = App.currentServer;
    if (!this.server || this.server.type !== 'VPS/VDS') return;

    this.loading = true;
    this.showAll = false;
    this.render();

    try {
      await this.detectos();
      if (this.pkgManager) {
        await this.fetchinstalled();
      }
    } catch (e) {
      console.error('Packages load error:', e);
    }

    this.loading = false;
    this.render();
  },

  async detectos() {
    const res = await this.exec('cat /etc/os-release 2>/dev/null');
    this.osId = null;
    this.osName = null;
    this.pkgManager = null;

    if (res.exitCode !== 0 || !res.stdout) return;

    for (const line of res.stdout.split('\n')) {
      if (line.startsWith('ID=')) this.osId = line.slice(3).replace(/"/g, '').trim().toLowerCase();
      if (line.startsWith('NAME=')) this.osName = line.slice(5).replace(/"/g, '').trim();
    }

    if (this.osId === 'rhel') this.osId = 'rhel';
    this.pkgManager = this.OS_MAP[this.osId] || null;
  },

  async fetchinstalled() {
    const cmd = this.INSTALLED_CMD[this.pkgManager];
    if (!cmd) { this.installedPackages = []; this.allInstalledRaw = []; return; }

    const res = await this.exec(cmd);
    this.allInstalledRaw = [];
    this.installedPackages = [];

    if (res.exitCode === 0 && res.stdout) {
      for (const line of res.stdout.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        this.allInstalledRaw.push(trimmed);
        const name = trimmed.split(/[\s-]/)[0] || trimmed.split(' ')[0];
        if (name) this.installedPackages.push(name);
      }
    }
  },

  isinstalled(pkgId) {
    if (!this.pkgManager) return false;
    const names = this.DETECT_NAMES[this.pkgManager];
    if (!names || !names[pkgId]) return false;
    const target = names[pkgId].toLowerCase();
    return this.installedPackages.some(p => p.toLowerCase() === target);
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
    const tab = Utils.el('tabPackages');
    if (!tab) return;

    if (this.loading) {
      tab.innerHTML = '<div class="loading"><div class="spinner"></div><div class="loading-text">Loading packages...</div></div>';
      return;
    }

    if (!this.pkgManager) {
      tab.innerHTML = `<div class="packages-unsupported">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <h3>Unable to detect package manager</h3>
        <p>Detected OS: ${Utils.escape(this.osName || this.osId || 'Unknown')}</p>
        <p>Supported: Ubuntu, Debian, Mint, CentOS, RHEL, Rocky, AlmaLinux, Fedora, Arch, Alpine, Gentoo</p>
      </div>`;
      return;
    }

    const osLabel = this.osName || (this.osId ? this.osId.charAt(0).toUpperCase() + this.osId.slice(1) : 'Unknown');
    const displayLimit = 30;
    const hasMore = this.allInstalledRaw.length > displayLimit;
    const visiblePkgs = this.showAll ? this.allInstalledRaw : this.allInstalledRaw.slice(0, displayLimit);

    let html = `<div class="packages-container">
      <div class="packages-card">
        <div class="packages-card-header">
          <div class="packages-card-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
            <h3>Installed Packages</h3>
          </div>
          <div class="packages-card-right">
            <span class="packages-os-badge">${Utils.escape(osLabel)}</span>
            <span class="packages-count-badge">${this.allInstalledRaw.length}</span>
          </div>
        </div>
        <div class="packages-card-body">
          <div class="installed-packages-grid" id="installedPkgsGrid">`;

    for (const pkg of visiblePkgs) {
      html += `<div class="pkg-chip">${Utils.escape(pkg)}</div>`;
    }

    html += '</div>';

    if (hasMore && !this.showAll) {
      html += `<button class="btn btn-secondary btn-sm packages-show-more" onclick="Packages.showallpackages()">Show all ${this.allInstalledRaw.length} packages</button>`;
    }

    html += `</div></div>
      <div class="packages-card">
        <div class="packages-card-header">
          <div class="packages-card-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            <h3>Install Packages</h3>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="Packages.load()" title="Refresh">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          </button>
        </div>
        <div class="packages-card-body">
          <div class="packages-checklist">`;

    for (const pkg of this.PACKAGES) {
      const installed = this.isinstalled(pkg.id);
      html += `<label class="pkg-check-item ${installed ? 'pkg-installed' : ''}">
        <input type="checkbox" class="pkg-checkbox" value="${pkg.id}" ${installed ? 'disabled checked' : ''} />
        <span class="pkg-check-name">${Utils.escape(pkg.name)}</span>
        ${installed ? '<span class="pkg-badge-installed">Installed</span>' : ''}
      </label>`;
    }

    html += `</div>
          <div class="packages-install-actions">
            <button class="btn btn-primary" id="pkgInstallBtn" onclick="Packages.installselected()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Install Selected
            </button>
          </div>
          <div id="pkgInstallOutput" class="pkg-output" style="display:none;"></div>
        </div>
      </div>
    </div>`;

    tab.innerHTML = html;
  },

  showallpackages() {
    this.showAll = true;
    const grid = Utils.el('installedPkgsGrid');
    if (!grid) return;
    grid.innerHTML = this.allInstalledRaw.map(p => `<div class="pkg-chip">${Utils.escape(p)}</div>`).join('');
    const btn = grid.parentElement.querySelector('.packages-show-more');
    if (btn) btn.remove();
  },

  async installselected() {
    const checks = document.querySelectorAll('.pkg-checkbox:checked:not(:disabled)');
    if (!checks.length) return;

    const ids = Array.from(checks).map(c => c.value);
    const cmds = ids.map(id => this.INSTALL[this.pkgManager]?.[id]).filter(Boolean);
    if (!cmds.length) return;

    const output = Utils.el('pkgInstallOutput');
    if (!output) return;
    output.style.display = '';
    output.innerHTML = '<div class="pkg-output-loading"><div class="spinner"></div><span>Installing packages...</span></div>';

    const btn = Utils.el('pkgInstallBtn');
    if (btn) btn.disabled = true;

    try {
      const combined = 'export DEBIAN_FRONTEND=noninteractive; ' + cmds.join(' && ');
      const res = await this.exec(combined);

      let html = '';
      if (res.exitCode === 0) {
        html += '<div class="pkg-output-success">Packages installed successfully</div>';
      } else {
        html += `<div class="pkg-output-error">Installation failed (exit code: ${res.exitCode})</div>`;
      }
      if (res.stdout && res.stdout.trim()) {
        html += `<pre class="pkg-output-pre">${Utils.escape(res.stdout.trim())}</pre>`;
      }
      if (res.stderr && res.stderr.trim()) {
        html += `<pre class="pkg-output-pre pkg-output-stderr">${Utils.escape(res.stderr.trim())}</pre>`;
      }
      output.innerHTML = html;

      if (res.exitCode === 0) {
        await this.fetchinstalled();
        this.render();
      }
    } catch (e) {
      output.innerHTML = `<div class="pkg-output-error">Error: ${Utils.escape(e.message || String(e))}</div>`;
    }

    if (btn) btn.disabled = false;
  }
};
