const Docker = {
  server: null,
  loading: false,
  installed: false,
  activeTab: 'containers',
  containers: [],
  images: [],
  volumes: [],

  async load() {
    this.server = App.currentServer;
    if (!this.server || this.server.type !== 'VPS/VDS') return;

    this.loading = true;
    this.render();

    try {
      const check = await this.exec('docker info --format "{{.ServerVersion}}" 2>/dev/null || docker.io info --format "{{.ServerVersion}}" 2>/dev/null || systemctl is-active docker 2>/dev/null || service docker status 2>/dev/null | grep -qi running');
      this.installed = check.exitCode === 0 && (check.stdout.trim().length > 0 || check.stdout.toLowerCase().includes('active') || check.stdout.toLowerCase().includes('running'));
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
    if (r.exitCode !== 0 || !r.stdout.trim()) return;
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
    if (r.exitCode !== 0 || !r.stdout.trim()) return;
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
    if (r.exitCode !== 0 || !r.stdout.trim()) return;
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
    if (this.server.authType === 'key' && this.server.privateKey) {
      cfg.authType = 'privateKey';
      cfg.privateKey = this.server.privateKey;
    } else {
      cfg.authType = 'password';
      cfg.password = this.server.password || '';
    }
    const isRoot = (this.server.username || 'root') === 'root';
    if (isRoot) return await window.electronAPI.sshexec(cfg, command);
    const pass = (this.server.password || '').replace(/'/g, "'\\''");
    const wrapped = command.replace(/'/g, "'\\''");
    return await window.electronAPI.sshexec(cfg, `echo '${pass}' | sudo -S sh -c '${wrapped}' 2>/dev/null`);
  },

  showcreatecontainer() {
    Modal.open('Create Container', `
      <div class="form-group">
        <label class="form-label">Container Name</label>
        <input class="form-input" type="text" id="dkrName" placeholder="my-container" />
      </div>
      <div class="form-group">
        <label class="form-label">Image</label>
        <input class="form-input" type="text" id="dkrImage" placeholder="nginx:latest" />
      </div>
      <div class="form-group">
        <label class="form-label">Ports (optional)</label>
        <input class="form-input" type="text" id="dkrPorts" placeholder="8080:80, 443:443" />
      </div>
      <div class="form-group">
        <label class="form-label">Volumes (optional)</label>
        <input class="form-input" type="text" id="dkrVolumes" placeholder="/host/path:/container/path" />
      </div>
      <div class="form-group">
        <label class="form-label">Environment (optional)</label>
        <input class="form-input" type="text" id="dkrEnv" placeholder="KEY=value, KEY2=value2" />
      </div>
      <div class="form-group">
        <label class="form-label">Restart Policy</label>
        <select class="form-input" id="dkrRestart">
          <option value="no">No</option>
          <option value="always">Always</option>
          <option value="unless-stopped">Unless Stopped</option>
          <option value="on-failure">On Failure</option>
        </select>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" onclick="Docker.createcontainer()">Create</button>
      </div>
    `);
  },

  async createcontainer() {
    const name = Utils.el('dkrName').value.trim();
    const image = Utils.el('dkrImage').value.trim();
    const ports = Utils.el('dkrPorts').value.trim();
    const volumes = Utils.el('dkrVolumes').value.trim();
    const env = Utils.el('dkrEnv').value.trim();
    const restart = Utils.el('dkrRestart').value;

    if (!name || !image) return;

    let cmd = `docker run -d --name ${name.replace(/[^a-zA-Z0-9_.-]/g, '')}`;
    if (restart && restart !== 'no') cmd += ` --restart ${restart}`;
    if (ports) {
      for (const p of ports.split(',')) {
        const pp = p.trim();
        if (pp) cmd += ` -p ${pp}`;
      }
    }
    if (volumes) {
      for (const v of volumes.split(',')) {
        const vv = v.trim();
        if (vv) cmd += ` -v ${vv}`;
      }
    }
    if (env) {
      for (const e of env.split(',')) {
        const ee = e.trim();
        if (ee) cmd += ` -e ${ee}`;
      }
    }
    cmd += ` ${image}`;

    Modal.close();
    this.loading = true;
    this.render();

    await this.exec(cmd);
    await this.fetchall();
    this.loading = false;
    this.render();
  },

  setactivetab(tab) {
    this.activeTab = tab;
    this.render();
  },

  render() {
    const el = Utils.el('tabDocker');
    if (!el) return;

    if (this.loading) {
      el.innerHTML = '<div class="loading"><div class="spinner"></div><div class="loading-text">Loading Docker info...</div></div>';
      return;
    }

    if (!this.installed) {
      el.innerHTML = `<div class="pkg-container"><div class="pkg-os-banner"><div class="pkg-os-info"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg><h3>Docker is not installed</h3></div></div></div>`;
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
        <button class="dkr-tab ${this.activeTab === 'containers' ? 'dkr-tab-active' : ''}" onclick="Docker.setactivetab('containers')">Containers</button>
        <button class="dkr-tab ${this.activeTab === 'images' ? 'dkr-tab-active' : ''}" onclick="Docker.setactivetab('images')">Images</button>
        <button class="dkr-tab ${this.activeTab === 'volumes' ? 'dkr-tab-active' : ''}" onclick="Docker.setactivetab('volumes')">Volumes</button>
      </div>`;

    if (this.activeTab === 'containers') {
      html += `<div class="dkr-header-row">
        <button class="btn btn-primary btn-sm" onclick="Docker.showcreatecontainer()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Create Container
        </button>
      </div>
      <div class="dkr-list">`;
      for (const c of this.containers) {
        const statusClass = c.running ? 'svc-active' : 'svc-inactive';
        html += `<div class="dkr-card">
          <div class="dkr-card-main">
            <div class="svc-status-dot ${statusClass}"></div>
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

    if (this.activeTab === 'images') {
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

    if (this.activeTab === 'volumes') {
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
