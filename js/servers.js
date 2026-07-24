const Servers = {
  list: [],
  folders: [],
  resources: {},
  _search: '',
  _filtertag: '',
  _filterfolder: '',
  _dragidx: -1,
  _didrag: false,

  init() {
    this.load();
    Utils.el('addServerBtn').addEventListener('click', () => this.openaddmodal());
    Utils.el('emptyAddBtn').addEventListener('click', () => this.openaddmodal());
    Utils.el('backToServers').addEventListener('click', (e) => {
      e.preventDefault();
      App.showserverlist();
    });
  },

  load() {
    const data = localStorage.getItem('ctrl_servers');
    this.list = data ? JSON.parse(data) : [];
    const fd = localStorage.getItem('ctrl_folders');
    this.folders = fd ? JSON.parse(fd) : [];
  },

  save() {
    localStorage.setItem('ctrl_servers', JSON.stringify(this.list));
    localStorage.setItem('ctrl_folders', JSON.stringify(this.folders));
  },

  geticon(server) {
    if (server.type === 'Pterodactyl') return '<img class="server-icon" src="assets/pterodactyl.png" alt="" />';
    if (server.type === 'Link') return '<div class="server-icon server-icon-svg"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></div>';
    if (server.type === 'VPS/VDS') {
      const os = (server.os || '').toLowerCase();
      const osMap = [
        ['debian', 'debian'], ['ubuntu', 'ubuntu'], ['centos', 'centos'],
        ['rocky', 'rockylinux'], ['almalinux', 'almalinux'], ['alpine', 'alpine'],
        ['arch', 'arch'], ['gentoo', 'gentoo'], ['fedora', 'fedora'],
        ['mint', 'mint'], ['rhel', 'rhel'], ['red hat', 'rhel'],
      ];
      for (const [key, file] of osMap) {
        if (os.includes(key)) return `<img class="server-icon" src="assets/${file}.png" alt="" />`;
      }
      return '<div class="server-icon server-icon-svg"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg></div>';
    }
    return '<div class="server-icon server-icon-svg"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg></div>';
  },

  async detectos(server) {
    if (server.type !== 'VPS/VDS' || server.os) return;
    try {
      const cfg = {
        host: server.host,
        port: parseInt(server.port) || 22,
        username: server.username || 'root',
      };
      if (server.authType === 'key' && server.privateKey) {
        cfg.authType = 'privateKey';
        cfg.privateKey = server.privateKey;
      } else {
        cfg.authType = 'password';
        cfg.password = server.password || '';
      }
      const result = await window.electronAPI.sshexec(cfg, "cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d= -f2 | tr -d '\"'");
      if (result && result.stdout && result.stdout.trim()) {
        server.os = result.stdout.trim();
        this.save();
      }
    } catch (e) {}
  },

  render() {
    const grid = Utils.el('serversGrid');
    const empty = Utils.el('emptyState');
    this.renderfilterbar();
    if (this.list.length === 0) {
      empty.style.display = 'flex';
      grid.style.display = 'none';
      Utils.el('pinnedServers').style.display = 'none';
    } else {
      empty.style.display = 'none';
      grid.style.display = 'grid';
      this.rendercards();
    }
  },

  onsearch(val) {
    this._search = (val || '').toLowerCase();
    this.rendercards();
  },

  togglepin(index) {
    const server = this.list[index];
    if (!server) return;
    server.pinned = !server.pinned;
    this.save();
    this.rendercards();
  },

  _filterlist() {
    let result = this.list;
    if (this._filterfolder) {
      result = result.filter(s => s.folder === this._filterfolder);
    }
    if (this._filtertag) {
      result = result.filter(s => (s.tags || []).includes(this._filtertag));
    }
    if (this._search) {
      const q = this._search;
      result = result.filter(s => {
        if (s.name.toLowerCase().includes(q)) return true;
        if ((s.tags || []).some(t => t.toLowerCase().includes(q))) return true;
        return false;
      });
    }
    return result;
  },

  async quickpower(index, signal) {
    const server = this.list[index];
    if (!server || server.type !== 'Pterodactyl' || !server.apiKey || !server.panelUrl) return;
    try {
      await Api.power(server.panelUrl, server.apiKey, server.uuid, signal);
      this.resources[server.uuid] = this.resources[server.uuid] || {};
      this.resources[server.uuid].state = signal === 'start' || signal === 'restart' ? 'starting' : 'stopping';
      this.updatecard(server.uuid);
      if (signal === 'start' || signal === 'restart') {
        this._pollafterpower(server.uuid, 0);
      }
    } catch (e) {}
  },

  _pollafterpower(uuid, attempt) {
    if (attempt > 10) return;
    const delays = [2000, 3000, 3000, 4000, 5000, 5000, 5000, 5000, 5000, 5000];
    setTimeout(async () => {
      const server = this.list.find(s => s.uuid === uuid);
      if (!server || !server.apiKey || !server.panelUrl) return;
      try {
        const data = await Api.fetchresources(server.panelUrl, server.apiKey, uuid);
        this.resources[uuid] = {
          state: data.current_state,
          memory_bytes: data.resources.memory_bytes,
          cpu: data.resources.cpu_absolute,
          disk_bytes: data.resources.disk_bytes,
          uptime: data.resources.uptime
        };
        server.status = data.current_state;
        this.save();
        this.updatecard(uuid);
        if (data.current_state === 'running' || data.current_state === 'stopped') return;
        this._pollafterpower(uuid, attempt + 1);
      } catch (e) {
        this._pollafterpower(uuid, attempt + 1);
      }
    }, delays[attempt] || 5000);
  },

  _instdrag(grid) {
    const cards = grid.querySelectorAll('.server-card');
    cards.forEach((card) => {
      card.addEventListener('dragstart', (e) => {
        this._dragidx = parseInt(card.dataset.index, 10);
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', card.dataset.index);
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        this._dragidx = -1;
        grid.querySelectorAll('.server-card').forEach(c => c.classList.remove('drag-over'));
      });
      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const rect = card.getBoundingClientRect();
        const midX = rect.left + rect.width / 2;
        card.classList.remove('drag-over-left', 'drag-over-right');
        if (e.clientX < midX) {
          card.classList.add('drag-over-left');
        } else {
          card.classList.add('drag-over-right');
        }
      });
      card.addEventListener('dragleave', () => {
        card.classList.remove('drag-over-left', 'drag-over-right');
      });
      card.addEventListener('drop', (e) => {
        e.preventDefault();
        card.classList.remove('drag-over-left', 'drag-over-right');
        const from = this._dragidx;
        const to = parseInt(card.dataset.index, 10);
        if (from === -1 || from === to || isNaN(to)) return;
        this._didrag = true;
        const fromSrv = this.list[from];
        const toSrv = this.list[to];
        const fromPinned = fromSrv.pinned;
        const toPinned = toSrv.pinned;
        const rect = card.getBoundingClientRect();
        const midX = rect.left + rect.width / 2;
        const insertAfter = e.clientX >= midX;
        if (fromPinned === toPinned) {
          this.list.splice(from, 1);
          let newIdx = this.list.indexOf(toSrv);
          if (insertAfter) newIdx++;
          this.list.splice(newIdx, 0, fromSrv);
        } else {
          fromSrv.pinned = toPinned;
          this.list.splice(from, 1);
          let newIdx = this.list.indexOf(toSrv);
          if (insertAfter) newIdx++;
          this.list.splice(newIdx, 0, fromSrv);
        }
        this.save();
        this.rendercards();
      });
    });
  },

  rendercards() {
    const grid = Utils.el('serversGrid');
    const pinnedSection = Utils.el('pinnedServers');
    const pinnedGrid = Utils.el('pinnedGrid');
    const filtered = this._filterlist();
    const pinned = filtered.filter(s => s.pinned);
    const unpinned = filtered.filter(s => !s.pinned);

    if (pinned.length > 0) {
      pinnedSection.style.display = '';
      pinnedGrid.innerHTML = pinned.map((server) => {
        const realindex = this.list.indexOf(server);
        return this._rendercard(server, realindex);
      }).join('');
      pinnedGrid.style.display = 'grid';
    } else {
      pinnedSection.style.display = 'none';
    }

    grid.innerHTML = unpinned.map((server) => {
      const realindex = this.list.indexOf(server);
      return this._rendercard(server, realindex);
    }).join('');
    this._instdrag(grid);
    if (pinned.length > 0) this._instdrag(pinnedGrid);
  },

  _rendercard(server, index) {
      const res = this.resources[server.uuid] || {};
      const memUsed = res.memory_bytes || 0;
      const memTotal = (server.limits?.memory || 0) * 1024 * 1024;
      const diskUsed = res.disk_bytes || 0;
      const diskTotal = (server.limits?.disk || 0) * 1024 * 1024;
      const cpu = res.cpu || 0;
      const state = res.state || server.status || 'offline';
      const ip = server.host || '—';
      const port = server.port || '';

      return `
      <div class="server-card" draggable="true" data-uuid="${server.uuid || ''}" data-index="${index}" onclick="App.openserver(${index})" oncontextmenu="Servers.contextmenu(event, ${index})">
        <div class="server-card-header">
          <div class="server-name-row">
            ${Servers.geticon(server)}
            <div class="server-name">${Utils.escape(server.name)}</div>
          </div>
          <div class="server-type">${Utils.escape(server.type)}</div>
        </div>
        ${server.description ? `<div class="server-desc">${Utils.escape(server.description)}</div>` : ''}
        <div class="server-details">
          <div class="server-info">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            <span>${Utils.escape(ip)}${port ? ':' + port : ''}</span>
          </div>
          ${server.node ? `<div class="server-info">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="2" width="20" height="8" rx="2" ry="2" /><rect x="2" y="14" width="20" height="8" rx="2" ry="2" /><line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" />
            </svg>
            <span>${Utils.escape(server.node)}</span>
          </div>` : ''}
        </div>
        ${server.type === 'Pterodactyl' ? `
        <div class="server-stats">
          <div class="stat-row">
            <div class="stat-label">CPU</div>
            <div class="stat-bar-wrap"><div class="stat-bar" style="width:${Math.min(cpu, 100)}%"></div></div>
            <div class="stat-value">${cpu.toFixed(1)}%</div>
          </div>
          <div class="stat-row">
            <div class="stat-label">RAM</div>
            <div class="stat-bar-wrap"><div class="stat-bar" style="width:${memTotal > 0 ? Math.min((memUsed / memTotal) * 100, 100) : 0}%"></div></div>
            <div class="stat-value">${Utils.formatbytes(memUsed)} / ${Utils.formatmb(server.limits?.memory)}</div>
          </div>
          <div class="stat-row">
            <div class="stat-label">Disk</div>
            <div class="stat-bar-wrap"><div class="stat-bar" style="width:${diskTotal > 0 ? Math.min((diskUsed / diskTotal) * 100, 100) : 0}%"></div></div>
            <div class="stat-value">${Utils.formatbytes(diskUsed)} / ${Utils.formatmb(server.limits?.disk)}</div>
          </div>
        </div>` : ''}
        ${(server.tags && server.tags.length > 0) ? `<div class="server-card-tags">${server.tags.map(t => `<span class="server-tag" style="--tag-color:${this._tagcolor(t)}">${Utils.escape(t)}</span>`).join('')}</div>` : ''}
        <div class="server-card-footer">
          <div class="server-status">
            <span class="status-dot ${state}"></span>
            <span class="status-text">${Utils.statuslabel(state)}</span>
          </div>
          <div class="server-card-actions">
            ${res.uptime ? `<span class="status-uptime">${Utils.formatuptime(res.uptime)}</span>` : ''}
            ${server.type === 'Pterodactyl' && server.apiKey && server.panelUrl && (state === 'running' || state === 'stopped' || state === 'offline') ? `
              <button class="card-action-btn" data-action="start" onclick="event.stopPropagation();Servers.quickpower(${index},'start')" title="Start" ${state === 'running' ? 'disabled' : ''}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              </button>
              <button class="card-action-btn" onclick="event.stopPropagation();Servers.quickpower(${index},'restart')" title="Restart">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
              </button>
              <button class="card-action-btn" data-action="stop" onclick="event.stopPropagation();Servers.quickpower(${index},'stop')" title="Stop" ${state === 'stopped' || state === 'offline' ? 'disabled' : ''}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
              </button>
            ` : ''}
          </div>
        </div>
      </div>`;
  },

  async pollresources() {
    if (App.currentPage !== 'dashboard' || App.currentServer) return;
    const servers = this.list.filter(s => s.type === 'Pterodactyl' && s.apiKey && s.panelUrl);
    for (const server of servers) {
      try {
        const data = await Api.fetchresources(server.panelUrl, server.apiKey, server.uuid);
        this.resources[server.uuid] = {
          state: data.current_state,
          memory_bytes: data.resources.memory_bytes,
          cpu: data.resources.cpu_absolute,
          disk_bytes: data.resources.disk_bytes,
          uptime: data.resources.uptime
        };
        server.status = data.current_state;
        this.save();
        this.updatecard(server.uuid);
        if (App.currentServer?.uuid === server.uuid) {
          ServerConsole.updateresources(server.uuid);
        }
      } catch (e) {}
    }
  },

  async fetchallfromapi() {
    const ptero = this.list.filter(s => s.type === 'Pterodactyl' && s.apiKey && s.panelUrl);
    const unique = new Map();
    ptero.forEach(s => {
      const key = s.panelUrl + '|' + s.apiKey;
      if (!unique.has(key)) unique.set(key, s);
    });

    for (const [, server] of unique) {
      try {
        const apiServers = await Api.fetchservers(server.panelUrl, server.apiKey);
        for (const saved of this.list.filter(s => s.panelUrl === server.panelUrl && s.apiKey === server.apiKey)) {
          const api = apiServers.find(a => a.attributes.uuid === saved.uuid);
          if (api) {
            const a = api.attributes;
            saved.name = a.name;
            saved.description = a.description || '';
            saved.node = a.node;
            saved.limits = a.limits;
            saved.allocations = (a.relationships?.allocations?.data || []).map(x => ({ id: x.attributes.id, ip: x.attributes.ip, port: x.attributes.port }));
            saved.host = saved.allocations[0]?.attributes?.ip || saved.host;
            saved.port = saved.allocations[0]?.attributes?.port || saved.port;
          }
        }
        this.save();
        this.render();
      } catch (e) {}
    }
  },

  updatecard(uuid) {
    const card = document.querySelector(`.server-card[data-uuid="${uuid}"]`);
    if (!card) return;
    const res = this.resources[uuid] || {};
    const state = res.state || 'offline';

    const dot = card.querySelector('.status-dot');
    const text = card.querySelector('.status-text');
    if (dot) dot.className = 'status-dot ' + state;
    if (text) text.textContent = Utils.statuslabel(state);

    const uptime = card.querySelector('.status-uptime');
    if (uptime) uptime.textContent = Utils.formatuptime(res.uptime);

    const startbtn = card.querySelector('[data-action="start"]');
    const stopbtn = card.querySelector('[data-action="stop"]');
    if (startbtn) startbtn.disabled = state === 'running';
    if (stopbtn) stopbtn.disabled = state === 'stopped' || state === 'offline';

    const server = this.list.find(s => s.uuid === uuid);
    if (!server || server.type !== 'Pterodactyl') return;

    const bars = card.querySelectorAll('.stat-row');
    const memUsed = res.memory_bytes || 0;
    const memTotal = (server.limits?.memory || 0) * 1024 * 1024;
    const diskUsed = res.disk_bytes || 0;
    const diskTotal = (server.limits?.disk || 0) * 1024 * 1024;
    const cpu = res.cpu || 0;

    if (bars[0]) {
      bars[0].querySelector('.stat-bar').style.width = Math.min(cpu, 100) + '%';
      bars[0].querySelector('.stat-value').textContent = cpu.toFixed(1) + '%';
    }
    if (bars[1]) {
      bars[1].querySelector('.stat-bar').style.width = (memTotal > 0 ? Math.min((memUsed / memTotal) * 100, 100) : 0) + '%';
      bars[1].querySelector('.stat-value').textContent = Utils.formatbytes(memUsed) + ' / ' + Utils.formatmb(server.limits?.memory);
    }
    if (bars[2]) {
      bars[2].querySelector('.stat-bar').style.width = (diskTotal > 0 ? Math.min((diskUsed / diskTotal) * 100, 100) : 0) + '%';
      bars[2].querySelector('.stat-value').textContent = Utils.formatbytes(diskUsed) + ' / ' + Utils.formatmb(server.limits?.disk);
    }
  },

  contextmenu(e, index) {
    e.preventDefault();
    e.stopPropagation();
    document.querySelectorAll('.context-menu.active').forEach(m => m.classList.remove('active'));

    let menu = document.getElementById('contextmenu');
    if (!menu) {
      menu = document.createElement('div');
      menu.id = 'contextmenu';
      menu.className = 'context-menu';
      document.body.appendChild(menu);
    }

    const server = this.list[index];
    const tags = server ? (server.tags || []) : [];
    const alltags = this._collecttags();
    const taghtml = alltags.length > 0
      ? alltags.map(t => `<button class="context-menu-item" onclick="Servers.toggletag(${index},'${Utils.escape(t)}')">
          <span class="ctx-tag-dot" style="background:${this._tagcolor(t)}"></span>
          ${tags.includes(t) ? '✓ ' : ''}${Utils.escape(t)}
        </button>`).join('')
      : '<div class="context-menu-label">No tags yet</div>';

    const folderhtml = this.folders.length > 0
      ? this.folders.map(f => `<button class="context-menu-item" onclick="Servers.movefolder(${index},'${Utils.escape(f)}')">
          ${server.folder === f ? '✓ ' : ''}${Utils.escape(f)}
        </button>`).join('') + `<button class="context-menu-item" onclick="Servers.movefolder(${index},'')">Remove from folder</button>`
      : '';

    menu.innerHTML = `
      <button class="context-menu-item" onclick="Servers.togglepin(${index})">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
        </svg>
        ${this.list[index]?.pinned ? 'Unpin' : 'Pin'}
      </button>
      <div class="context-menu-separator"></div>
      <div class="context-menu-label">Tags</div>
      ${taghtml}
      <button class="context-menu-item" onclick="Servers.showaddtag(${index})">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        New tag
      </button>
      ${folderhtml ? '<div class="context-menu-separator"></div><div class="context-menu-label">Folder</div>' + folderhtml : ''}
      <div class="context-menu-separator"></div>
      <button class="context-menu-item danger" onclick="Servers.deleteserver(${index})">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
        Delete
      </button>
    `;
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
    menu.classList.add('active');

    const close = (ev) => {
      if (!menu.contains(ev.target)) {
        menu.classList.remove('active');
        document.removeEventListener('click', close);
      }
    };
    setTimeout(() => document.addEventListener('click', close), 0);
  },

  _collecttags() {
    const tags = new Set();
    this.list.forEach(s => (s.tags || []).forEach(t => tags.add(t)));
    return [...tags].sort();
  },

  _tagcolor(tag) {
    const palette = ['#3b82f6','#ef4444','#22c55e','#f59e0b','#a855f7','#ec4899','#14b8a6','#f97316','#6366f1','#84cc16'];
    let h = 0;
    for (let i = 0; i < tag.length; i++) h = tag.charCodeAt(i) + ((h << 5) - h);
    return palette[Math.abs(h) % palette.length];
  },

  toggletag(index, tag) {
    document.querySelectorAll('.context-menu.active').forEach(m => m.classList.remove('active'));
    const server = this.list[index];
    if (!server) return;
    if (!server.tags) server.tags = [];
    const i = server.tags.indexOf(tag);
    if (i >= 0) server.tags.splice(i, 1); else server.tags.push(tag);
    this.save();
    this.rendercards();
  },

  showaddtag(index) {
    document.querySelectorAll('.context-menu.active').forEach(m => m.classList.remove('active'));
    Modal.open('New Tag', `
      <div class="form-group">
        <label class="form-label">Tag name</label>
        <input class="form-input" type="text" id="newTagInput" placeholder="e.g. production" autofocus />
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" onclick="Servers.addtag(${index})">Add</button>
      </div>
    `);
    setTimeout(() => { const inp = Utils.el('newTagInput'); if (inp) inp.focus(); }, 50);
  },

  addtag(index) {
    const val = Utils.el('newTagInput').value.trim().toLowerCase();
    if (!val) return;
    const server = this.list[index];
    if (!server) return;
    if (!server.tags) server.tags = [];
    if (!server.tags.includes(val)) server.tags.push(val);
    this.save();
    this.renderfilterbar();
    this.rendercards();
    Modal.close();
  },

  movefolder(index, folder) {
    document.querySelectorAll('.context-menu.active').forEach(m => m.classList.remove('active'));
    const server = this.list[index];
    if (!server) return;
    server.folder = folder || undefined;
    this.save();
    this.renderfilterbar();
    this.rendercards();
  },

  showcreatefolder() {
    Modal.open('New Folder', `
      <div class="form-group">
        <label class="form-label">Folder name</label>
        <input class="form-input" type="text" id="newFolderInput" placeholder="e.g. Game Servers" autofocus />
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" onclick="Servers.createfolder()">Create</button>
      </div>
    `);
    setTimeout(() => { const inp = Utils.el('newFolderInput'); if (inp) inp.focus(); }, 50);
  },

  createfolder() {
    const val = Utils.el('newFolderInput').value.trim();
    if (!val) return;
    if (!this.folders.includes(val)) this.folders.push(val);
    this.save();
    this.renderfilterbar();
    Modal.close();
  },

  setfiltertag(tag) {
    this._filtertag = this._filtertag === tag ? '' : tag;
    this.renderfilterbar();
    this.rendercards();
  },

  setfilterfolder(folder) {
    this._filterfolder = this._filterfolder === folder ? '' : folder;
    this.renderfilterbar();
    this.rendercards();
  },

  deletefolder(folder) {
    this.folders = this.folders.filter(f => f !== folder);
    this.list.forEach(s => { if (s.folder === folder) s.folder = undefined; });
    if (this._filterfolder === folder) this._filterfolder = '';
    this.save();
    this.renderfilterbar();
    this.rendercards();
  },

  deletetag(tag) {
    this.list.forEach(s => {
      if (s.tags) s.tags = s.tags.filter(t => t !== tag);
    });
    if (this._filtertag === tag) this._filtertag = '';
    this.save();
    this.renderfilterbar();
    this.rendercards();
  },

  renderfilterbar() {
    const bar = Utils.el('dashboardFilterBar');
    if (!bar) return;
    bar.style.display = '';
    const tags = this._collecttags();
    const folders = this.folders;
    let html = '';
    if (folders.length > 0) {
      html += folders.map(f =>
        `<button class="filter-pill${this._filterfolder === f ? ' active' : ''}" onclick="Servers.setfilterfolder('${Utils.escape(f)}')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          ${Utils.escape(f)}
          <span class="filter-pill-x" onclick="event.stopPropagation();Servers.deletefolder('${Utils.escape(f)}')" title="Delete folder">&times;</span>
        </button>`
      ).join('');
    }
    if (tags.length > 0) {
      html += tags.map(t =>
        `<button class="filter-pill tag-pill${this._filtertag === t ? ' active' : ''}" onclick="Servers.setfiltertag('${Utils.escape(t)}')">
          <span class="filter-pill-dot" style="background:${this._tagcolor(t)}"></span>
          ${Utils.escape(t)}
          <span class="filter-pill-x" onclick="event.stopPropagation();Servers.deletetag('${Utils.escape(t)}')" title="Delete tag">&times;</span>
        </button>`
      ).join('');
    }
    html += `<button class="filter-pill filter-pill-add" onclick="Servers.showcreatefolder()" title="New folder">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    </button>`;
    bar.innerHTML = html;
  },

  deleteserver(index) {
    document.querySelectorAll('.context-menu.active').forEach(m => m.classList.remove('active'));
    Modal.confirm('Delete Server', 'Are you sure you want to remove this server?', () => {
      this.list.splice(index, 1);
      this.save();
      this.render();
    });
  },

  openaddmodal() {
    Modal.open('Add Server', `
      <p style="font-size:14px;color:var(--text-secondary);margin-bottom:20px;">Select server type</p>
      <div class="server-types">
        <div class="server-type-option" onclick="Servers.showpterodactylform()">
          <div class="server-type-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="2" width="20" height="8" rx="2" ry="2" /><rect x="2" y="14" width="20" height="8" rx="2" ry="2" /><line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" />
            </svg>
          </div>
          <div class="server-type-info">
            <div class="server-type-name">Pterodactyl</div>
            <div class="server-type-desc">Connect via Panel URL and API Key</div>
          </div>
        </div>
        <div class="server-type-option" onclick="Servers.showvpsform()">
          <div class="server-type-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="4" y="4" width="16" height="16" rx="2" ry="2" /><rect x="9" y="9" width="6" height="6" /><line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" /><line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" />
            </svg>
          </div>
          <div class="server-type-info">
            <div class="server-type-name">VPS / VDS</div>
            <div class="server-type-desc">Virtual private or dedicated server</div>
          </div>
        </div>
        <div class="server-type-option" onclick="Servers.showlinkform()">
          <div class="server-type-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          </div>
          <div class="server-type-info">
            <div class="server-type-name">Link Server</div>
            <div class="server-type-desc">Connect via external link</div>
          </div>
        </div>
      </div>
    `);
  },

  showpterodactylform() {
    Modal.open('Pterodactyl', `
      <div class="form-group">
        <label class="form-label">Panel URL</label>
        <input class="form-input" type="url" id="panelUrl" placeholder="https://panel.example.com" />
      </div>
      <div class="form-group">
        <label class="form-label">API Key</label>
        <input class="form-input" type="password" id="apiKey" placeholder="ptlc_..." />
      </div>
      <div id="pterodactylError"></div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Servers.openaddmodal()">Back</button>
        <button class="btn btn-primary" onclick="Servers.fetchpterodactyl()">Connect</button>
      </div>
    `);
  },

  async fetchpterodactyl() {
    const panelUrl = Utils.el('panelUrl').value.trim();
    const apiKey = Utils.el('apiKey').value.trim();
    const err = Utils.el('pterodactylError');
    if (!panelUrl || !apiKey) { err.innerHTML = '<div class="error-msg">Fill all fields</div>'; return; }

    Utils.el('modalBody').innerHTML = '<div class="loading"><div class="spinner"></div><div class="loading-text">Fetching servers...</div></div>';

    try {
      const servers = await Api.fetchservers(panelUrl, apiKey);
      this._addData = { panelUrl: panelUrl.replace(/\/+$/, ''), apiKey, servers };
      this.showserverselect(servers);
    } catch (e) {
      err.innerHTML = `<div class="error-msg">${e.message}</div>`;
      this.showpterodactylform();
      Utils.el('panelUrl').value = panelUrl;
      Utils.el('apiKey').value = apiKey;
    }
  },

  showserverselect(servers) {
    this._selected = new Set();
    Modal.open('Select Servers', `
      <p style="font-size:14px;color:var(--text-secondary);margin-bottom:4px;">Found ${servers.length} server(s)</p>
      <div style="display:flex;justify-content:flex-end;margin-bottom:8px;">
        <button class="btn btn-sm btn-secondary" onclick="Servers.toggleall()">Select All</button>
      </div>
      <div class="server-select-list">
        ${servers.map((s, i) => `
          <div class="server-select-item" onclick="Servers.toggleselect(${i})">
            <div class="server-checkbox">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="3"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <div class="server-select-info">
              <div class="server-select-name">${Utils.escape(s.attributes.name)}</div>
              <div class="server-select-detail">${Utils.escape(s.attributes.node)} &middot; ${Utils.escape(s.attributes.identifier)}</div>
            </div>
          </div>
        `).join('')}
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Servers.showpterodactylform()">Back</button>
        <button class="btn btn-primary" onclick="Servers.addselected()">Add Selected</button>
      </div>
    `);
  },

  toggleselect(i) {
    if (this._selected.has(i)) this._selected.delete(i); else this._selected.add(i);
    document.querySelectorAll('.server-select-item').forEach((el, idx) => el.classList.toggle('selected', this._selected.has(idx)));
  },

  toggleall() {
    const items = document.querySelectorAll('.server-select-item');
    const all = this._selected.size === items.length;
    items.forEach((el, i) => { if (all) this._selected.delete(i); else this._selected.add(i); el.classList.toggle('selected', this._selected.has(i)); });
  },

  addselected() {
    const { panelUrl, apiKey, servers } = this._addData;
    this._selected.forEach(i => {
      const s = servers[i];
      if (this.list.some(x => x.uuid === s.attributes.uuid && x.panelUrl === panelUrl)) return;
      const alloc = s.attributes.relationships?.allocations?.data?.[0]?.attributes;
      this.list.push({
        id: Date.now() + Math.random(),
        type: 'Pterodactyl',
        name: s.attributes.name,
        description: s.attributes.description || '',
        panelUrl, apiKey,
        uuid: s.attributes.uuid,
        node: s.attributes.node,
        host: alloc?.ip || panelUrl.replace(/^https?:\/\//, ''),
        port: alloc?.port || '',
        limits: s.attributes.limits || {},
        allocations: (s.attributes.relationships?.allocations?.data || []).map(a => ({ id: a.attributes.id, ip: a.attributes.ip, port: a.attributes.port })),
        status: 'offline'
      });
    });
    this.save();
    this.render();
    this.fetchallfromapi();
    Modal.close();
  },

  showvpsform() {
    const keys = ServerKeychain.keys || [];
    const showLimit = 20;
    const hasMore = keys.length > showLimit;

    let keyOptions = '<option value="">Select a key...</option>';
    const keysToShow = hasMore ? keys.slice(0, showLimit) : keys;
    keysToShow.forEach((key, i) => {
      keyOptions += `<option value="${i}">${Utils.escape(key.name)}</option>`;
    });

    Modal.open('VPS / VDS', `
      <div class="form-group"><label class="form-label">Server Name</label><input class="form-input" type="text" id="vpsName" placeholder="My VPS" /></div>
      <div class="form-group"><label class="form-label">IP Address</label><input class="form-input" type="text" id="vpsIp" placeholder="192.168.1.1" /></div>
      <div class="form-group"><label class="form-label">Port</label><input class="form-input" type="number" id="vpsPort" value="22" /></div>
      <div class="form-group"><label class="form-label">Username</label><input class="form-input" type="text" id="vpsUser" placeholder="root" value="root" /></div>
      <div class="form-group">
        <label class="form-label">Authentication</label>
        <div class="vps-auth-toggle">
          <button class="vps-auth-btn active" id="vpsAuthPassword" onclick="Servers.togglevpsauth('password')">Password</button>
          <button class="vps-auth-btn" id="vpsAuthKey" onclick="Servers.togglevpsauth('key')">Key</button>
        </div>
      </div>
      <div class="form-group" id="vpsPasswordField">
        <label class="form-label">Password</label>
        <input class="form-input" type="password" id="vpsPassword" placeholder="SSH password" />
      </div>
      <div class="form-group" id="vpsKeyField" style="display:none;">
        <label class="form-label">SSH Key</label>
        <select class="form-input" id="vpsKeySelect">${keyOptions}</select>
        ${hasMore ? `<button class="btn btn-sm btn-secondary" style="margin-top:8px;" onclick="Servers.showallvpskeys()">Show all ${keys.length} keys</button>` : ''}
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Servers.openaddmodal()">Back</button>
        <button class="btn btn-primary" onclick="Servers.addvps()">Add</button>
      </div>
    `);
  },

  togglevpsauth(type) {
    const pwBtn = Utils.el('vpsAuthPassword');
    const keyBtn = Utils.el('vpsAuthKey');
    const pwField = Utils.el('vpsPasswordField');
    const keyField = Utils.el('vpsKeyField');
    if (type === 'key') {
      pwBtn.classList.remove('active');
      keyBtn.classList.add('active');
      pwField.style.display = 'none';
      keyField.style.display = '';
    } else {
      keyBtn.classList.remove('active');
      pwBtn.classList.add('active');
      keyField.style.display = 'none';
      pwField.style.display = '';
    }
  },

  showallvpskeys() {
    const keys = ServerKeychain.keys || [];
    const select = Utils.el('vpsKeySelect');
    if (!select) return;
    const current = select.value;
    select.innerHTML = '<option value="">Select a key...</option>';
    keys.forEach((key, i) => {
      select.innerHTML += `<option value="${i}" ${String(i) === current ? 'selected' : ''}>${Utils.escape(key.name)}</option>`;
    });
    const btn = select.parentElement.querySelector('.btn');
    if (btn) btn.remove();
  },

  addvps() {
    const name = Utils.el('vpsName').value.trim();
    const ip = Utils.el('vpsIp').value.trim();
    const port = Utils.el('vpsPort').value.trim() || '22';
    const username = Utils.el('vpsUser').value.trim() || 'root';
    const authType = Utils.el('vpsAuthKey').classList.contains('active') ? 'key' : 'password';

    if (!name || !ip) return;

    const server = {
      id: Date.now(),
      type: 'VPS/VDS',
      name,
      host: ip,
      port,
      username,
      authType,
      status: 'offline'
    };

    if (authType === 'password') {
      server.password = Utils.el('vpsPassword').value;
    } else {
      const keyIdx = parseInt(Utils.el('vpsKeySelect').value);
      if (!isNaN(keyIdx) && ServerKeychain.keys[keyIdx]) {
        server.keyIndex = keyIdx;
        server.privateKey = ServerKeychain.keys[keyIdx].privateKey;
      } else {
        return;
      }
    }

    this.list.push(server);
    this.save();
    this.render();
    Modal.close();
  },

  showlinkform() {
    Modal.open('Link Server', `
      <div class="form-group"><label class="form-label">Server Name</label><input class="form-input" type="text" id="linkName" placeholder="My Server" /></div>
      <div class="form-group"><label class="form-label">Link URL</label><input class="form-input" type="url" id="linkUrl" placeholder="https://example.com" /></div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Servers.openaddmodal()">Back</button>
        <button class="btn btn-primary" onclick="Servers.addlink()">Add</button>
      </div>
    `);
  },

  addlink() {
    const name = Utils.el('linkName').value.trim();
    const url = Utils.el('linkUrl').value.trim();
    if (!name || !url) return;
    this.list.push({ id: Date.now(), type: 'Link', name, host: url, status: 'offline' });
    this.save(); this.render(); Modal.close();
  },

  exportlist() {
    const data = { servers: this.list, folders: this.folders };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ctrlservers-export.json';
    a.click();
    URL.revokeObjectURL(url);
  },

  importlist() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = () => {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          if (data.servers && Array.isArray(data.servers)) {
            let added = 0;
            for (const s of data.servers) {
              if (!this.list.find(x => x.uuid && x.uuid === s.uuid || x.id && x.id === s.id)) {
                this.list.push(s);
                added++;
              }
            }
            if (data.folders && Array.isArray(data.folders)) {
              for (const f of data.folders) {
                if (!this.folders.includes(f)) this.folders.push(f);
              }
            }
            this.save();
            this.render();
            Modal.open('Import Complete', `
              <p style="text-align:center;padding:20px 0;color:var(--text-secondary);">Added ${added} server(s)</p>
              <div class="modal-actions"><button class="btn btn-primary" onclick="Modal.close()">OK</button></div>
            `);
          }
        } catch (e) {
          Modal.open('Import Error', `
            <p style="text-align:center;padding:20px 0;color:var(--text-secondary);">Invalid JSON file</p>
            <div class="modal-actions"><button class="btn btn-primary" onclick="Modal.close()">OK</button></div>
          `);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }
};
