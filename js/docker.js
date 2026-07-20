const Docker = {
  server: null,
  loading: false,
  installed: false,
  activetab: 'containers',
  containers: [],
  images: [],
  volumes: [],

  async load() {
    this.server = App.currentserver;
    if (!this.server || this.server.type !== 'VPS/VDS') return;

    this.loading = true;
    this.render();

    try {
      const check = await this.exec('command -v docker && docker --version');
      this.installed = check.exitcode === 0 && check.stdout.includes('Docker');
      if (this.installed) {
        await this.fetchall();
      }
    } catch (e) {
      this.installed = false;
    }

    this.loading = false;
    this.render();
  },

  async fetchall() {
    await Promise.allSettled([
      this.fetchcontainers(),
      this.fetchimages(),
      this.fetchvolumes()
    ]);
  },

  async fetchcontainers() {
    this.containers = [];
    const r = await this.exec('docker ps -a --format "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}|{{.Size}}" 2>/dev/null');
    if (r.exitcode !== 0 || !r.stdout.trim()) return;
    for (const line of r.stdout.split('\n')) {
      const p = line.split('|');
      if (p.length < 4) continue;
      const running = p[3].toLowerCase().startsWith('up');
      this.containers.push({
        id: p[0], name: p[1], image: p[2], status: p[3],
        ports: p[4] || '', size: p[5] || '', running
      });
    }
  },

  async fetchimages() {
    this.images = [];
    const r = await this.exec('docker images --format "{{.ID}}|{{.Repository}}|{{.Tag}}|{{.Size}}|{{.CreatedSince}}" 2>/dev/null');
    if (r.exitcode !== 0 || !r.stdout.trim()) return;
    for (const line of r.stdout.split('\n')) {
      const p = line.split('|');
      if (p.length < 3) continue;
      this.images.push({
        id: p[0], repo: p[1], tag: p[2], size: p[3] || '', created: p[4] || ''
      });
    }
  },

  async fetchvolumes() {
    this.volumes = [];
    const r = await this.exec('docker volume ls --format "{{.Name}}|{{.Driver}}" 2>/dev/null');
    if (r.exitcode !== 0 || !r.stdout.trim()) return;
    for (const line of r.stdout.split('\n')) {
      const p = line.split('|');
      if (p.length < 2) continue;
      this.volumes.push({ name: p[0], driver: p[1] });
    }
  },

  async containeraction(id, action) {
    await this.exec(`docker ${action} ${id}`);
    await this.fetchcontainers();
    this.render();
  },

  async containerremove(id) {
    await this.exec(`docker rm -f ${id}`);
    await this.fetchcontainers();
    this.render();
  },

  async imageremove(id) {
    await this.exec(`docker rmi -f ${id}`);
    await this.fetchimages();
    this.render();
  },

  async volumeremove(name) {
    await this.exec(`docker volume rm ${name}`);
    await this.fetchvolumes();
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

  setactivetab(tab) {
    this.activetab = tab;
    this.render();
  },

  render() {
    const el = Utils.el('tabdocker');
    if (!el) return;

    if (this.loading) {
      el.innerHTML = '<div class="loading"><div class="spinner"></div><div class="loading-text">Loading Docker info...</div></div>';
      return;
    }

    if (!this.installed) {
      el.innerHTML = `<div class="pkg-container"><div class="pkg-os-banner"><div class="pkg-os-info"><svg width="32" height="32" viewbox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg><h3>Docker is not installed</h3></div></div></div>`;
      return;
    }

    const running = this.containers.filter(c => c.running).length;
    const stopped = this.containers.length - running;

    let html = `<div class="dkr-container">
      <div class="pkg-stats">
        <div class="pkg-stat-card"><div class="pkg-stat-label">Containers</div><div class="pkg-stat-value">${this.containers.length}</div><div class="pkg-stat-detail">${running} running, ${stopped} stopped</div></div>
        <div class="pkg-stat-card"><div class="pkg-stat-label">Images</div><div class="pkg-stat-value">${this.images.length}</div></div>
        <div class="pkg-stat-card"><div class="pkg-stat-label">Volumes</div><div class="pkg-stat-value">${this.volumes.length}</div></div>
      </div>

      <div class="dkr-tabs">
        <button class="dkr-tab ${this.activetab === 'containers' ? 'dkr-tab-active' : ''}" onclick="Docker.setactivetab('containers')">Containers</button>
        <button class="dkr-tab ${this.activetab === 'images' ? 'dkr-tab-active' : ''}" onclick="Docker.setactivetab('images')">Images</button>
        <button class="dkr-tab ${this.activetab === 'volumes' ? 'dkr-tab-active' : ''}" onclick="Docker.setactivetab('volumes')">Volumes</button>
      </div>`;

    if (this.activetab === 'containers') {
      html += `<div class="dkr-list">`;
      for (const c of this.containers) {
        const statusclass = c.running ? 'svc-active' : 'svc-inactive';
        html += `<div class="dkr-card">
          <div class="dkr-card-main">
            <div class="svc-status-dot ${statusclass}"></div>
            <div class="dkr-card-info">
              <div class="dkr-card-name">${Utils.escape(c.name)}</div>
              <div class="dkr-card-meta">
                <code>${Utils.escape(c.image)}</code>
                <span class="dkr-card-status">${Utils.escape(c.status)}</span>
              </div>
              ${c.ports ? `<div class="dkr-card-ports">${Utils.escape(c.ports)}</div>` : ''}
            </div>
          </div>
          <div class="dkr-card-actions">
            ${c.running
              ? `<button class="btn btn-sm btn-yellow" onclick="Docker.containeraction('${c.id}','stop')">Stop</button>
                 <button class="btn btn-sm btn-secondary" onclick="Docker.containeraction('${c.id}','restart')">Restart</button>`
              : `<button class="btn btn-sm btn-green" onclick="Docker.containeraction('${c.id}','start')">Start</button>`}
            <button class="btn btn-sm btn-red-outline" onclick="Docker.containerremove('${c.id}')">Remove</button>
          </div>
        </div>`;
      }
      if (!this.containers.length) html += '<div class="fw-empty">No containers found</div>';
      html += '</div>';
    }

    if (this.activetab === 'images') {
      html += `<div class="dkr-list">`;
      for (const img of this.images) {
        html += `<div class="dkr-card">
          <div class="dkr-card-main">
            <div class="dkr-card-info">
              <div class="dkr-card-name"><code>${Utils.escape(img.repo)}</code>:${Utils.escape(img.tag)}</div>
              <div class="dkr-card-meta">
                <span>${Utils.escape(img.size)}</span>
                <span class="dkr-card-status">${Utils.escape(img.created)}</span>
              </div>
            </div>
          </div>
          <div class="dkr-card-actions">
            <button class="btn btn-sm btn-red-outline" onclick="Docker.imageremove('${img.id}')">Remove</button>
          </div>
        </div>`;
      }
      if (!this.images.length) html += '<div class="fw-empty">No images found</div>';
      html += '</div>';
    }

    if (this.activetab === 'volumes') {
      html += `<div class="dkr-list">`;
      for (const v of this.volumes) {
        html += `<div class="dkr-card">
          <div class="dkr-card-main">
            <div class="dkr-card-info">
              <div class="dkr-card-name">${Utils.escape(v.name)}</div>
              <div class="dkr-card-meta"><span>${Utils.escape(v.driver)}</span></div>
            </div>
          </div>
          <div class="dkr-card-actions">
            <button class="btn btn-sm btn-red-outline" onclick="Docker.volumeremove('${Utils.escape(v.name)}')">Remove</button>
          </div>
        </div>`;
      }
      if (!this.volumes.length) html += '<div class="fw-empty">No volumes found</div>';
      html += '</div>';
    }

    html += '</div>';
    el.innerHTML = html;
  }
};
