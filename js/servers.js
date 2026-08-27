const Servers = {
  list: [],
  folders: [],
  resources: {},
  vpsstats: {},
  _search: '',
  _filtertag: '',
  _filterfolder: '',
  _dragidx: -1,
  _didrag: false,
  _vpspollcount: 0,
  _selected: new Set(),

  init() {
    this.load();
    Utils.el('addServerBtn').addEventListener('click', () => this.openaddmodal());
    Utils.el('emptyAddBtn').addEventListener('click', () => this.openaddmodal());
    Utils.el('backToServers').addEventListener('click', (e) => {
      e.preventDefault();
      App.showserverlist();
    });
    document.addEventListener('click', (e) => this._onclick(e));
    document.addEventListener('contextmenu', (e) => this._oncontextmenu(e));
    const modalbody = Utils.el('modalBody');
    if (modalbody) modalbody.addEventListener('click', (e) => this._onmodalclick(e));
    const filterbar = Utils.el('dashboardFilterBar');
    if (filterbar) filterbar.addEventListener('click', (e) => this._onfilterclick(e));
    const workspaces = Utils.el('workspacesList');
    if (workspaces) workspaces.addEventListener('click', (e) => this._onworkspaceclick(e));
    const massbar = document.querySelector('.server-mass-actions');
    if (massbar) {
      massbar.addEventListener('click', (e) => this._onmassclick(e));
      massbar.addEventListener('change', (e) => {
        if (e.target.classList.contains('server-select-all')) {
          this.toggleselectall(e.target.checked);
        }
      });
    }
    document.querySelector('.workspaces-add')?.addEventListener('click', () => this.showcreatefolder());
    const searchinp = Utils.el('dashboardSearchInput');
    if (searchinp) searchinp.addEventListener('input', () => this.onsearch(searchinp.value));
    document.querySelector('[data-action="export-servers"]')?.addEventListener('click', () => this.exportlist());
    document.querySelector('[data-action="import-servers"]')?.addEventListener('click', () => this.importlist());
    this._ensurectxmenu();
    this.renderworkspaces();
  },

  _serverkey(server) {
    return String(server.uuid || server.id);
  },

  _barpct(pct) {
    return Math.min(pct, 100);
  },

  _setbarwidth(el, pct) {
    if (el) el.style.setProperty('--bar-pct', this._barpct(pct));
  },

  _onclick(e) {
    const sel = e.target.closest('.server-card-select');
    if (sel) {
      const card = sel.closest('.server-card');
      if (card) {
        e.preventDefault();
        e.stopPropagation();
        this.toggleselect(parseInt(card.dataset.index, 10));
      }
      return;
    }
    const power = e.target.closest('[data-power]');
    if (power) {
      e.stopPropagation();
      const card = power.closest('.server-card');
      if (card) this.quickpower(parseInt(card.dataset.index, 10), power.dataset.power);
      return;
    }
    if (e.target.closest('.card-action-btn')) return;
    const card = e.target.closest('.server-card');
    if (card && !e.defaultPrevented) App.openserver(parseInt(card.dataset.index, 10));
  },

  _oncontextmenu(e) {
    const card = e.target.closest('.server-card');
    if (!card || !card.closest('#serversGrid, #pinnedGrid')) return;
    e.preventDefault();
    this.opencontextmenu(e, parseInt(card.dataset.index, 10));
  },

  _onmassclick(e) {
    const btn = e.target.closest('[data-mass-action]');
    if (!btn) return;
    if (btn.dataset.massAction === 'delete') this.massdelete();
    else if (btn.dataset.massAction === 'clear') this.clearselection();
  },

  _onfilterclick(e) {
    const del = e.target.closest('.filter-pill-x');
    if (del) {
      e.stopPropagation();
      this.deletetag(decodeURIComponent(del.dataset.tag));
      return;
    }
    const pill = e.target.closest('.filter-pill[data-tag]');
    if (pill) this.setfiltertag(decodeURIComponent(pill.dataset.tag));
  },

  _onworkspaceclick(e) {
    const del = e.target.closest('.workspace-delete');
    if (del) {
      e.stopPropagation();
      this.deletefolder(decodeURIComponent(del.dataset.folder));
      return;
    }
    const item = e.target.closest('.workspace-item[data-folder]');
    if (item) this.setfilterfolder(decodeURIComponent(item.dataset.folder));
  },

  _onmodalclick(e) {
    const typeopt = e.target.closest('[data-add-type]');
    if (typeopt) {
      const t = typeopt.dataset.addType;
      if (t === 'pterodactyl') this.showpterodactylform();
      else if (t === 'vps') this.showvpsform();
      else if (t === 'link') this.showlinkform();
      return;
    }
    const additem = e.target.closest('[data-add-select]');
    if (additem) {
      this.toggleaddselect(parseInt(additem.dataset.addSelect, 10));
      return;
    }
    const btn = e.target.closest('[data-modal-action]');
    if (!btn) return;
    const action = btn.dataset.modalAction;
    if (action === 'add-back' || action === 'ptero-back' || action === 'vps-back' || action === 'link-back') this.openaddmodal();
    else if (action === 'ptero-connect') this.fetchpterodactyl();
    else if (action === 'ptero-select-back') this.showpterodactylform();
    else if (action === 'add-select-all') this.toggleaddall();
    else if (action === 'add-selected') this.addselected();
    else if (action === 'vps-add') this.addvps();
    else if (action === 'vps-all-keys') this.showallvpskeys();
    else if (action === 'link-add') this.addlink();
    else if (action === 'tag-cancel' || action === 'folder-cancel' || action === 'export-ok' || action === 'import-cancel') Modal.close();
    else if (action === 'tag-add') this.addtag();
    else if (action === 'folder-create') this.createfolder();
    else if (action === 'export-plain') this.downloadexport();
    else if (action === 'export-encrypted') this.showencryptedexport();
    else if (action === 'export-generate') this.generateexportpassword();
    else if (action === 'export-download') this.downloadexport(Utils.el('exportPassword')?.value);
    else if (action === 'import-decrypt') this.decryptimport();
    else if (action === 'vps-auth') this.togglevpsauth(btn.dataset.auth);
  },

  _ensurectxmenu() {
    if (this._ctxmenu) return this._ctxmenu;
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    document.body.appendChild(menu);
    menu.addEventListener('click', (e) => this._onctxmenuclick(e));
    this._ctxmenu = menu;
    return menu;
  },

  _onctxmenuclick(e) {
    const btn = e.target.closest('[data-ctx]');
    if (!btn) return;
    e.stopPropagation();
    this._ctxmenu.classList.remove('active');
    const index = this._ctxindex;
    const action = btn.dataset.ctx;
    if (action === 'pin') this.togglepin(index);
    else if (action === 'tag') this.toggletag(index, this._ctxtags[parseInt(btn.dataset.tagIdx, 10)]);
    else if (action === 'newtag') this.showaddtag(index);
    else if (action === 'folder') this.movefolder(index, this._ctxfolders[parseInt(btn.dataset.folderIdx, 10)]);
    else if (action === 'folder-clear') this.movefolder(index, '');
    else if (action === 'clone') this.cloneserver(index);
    else if (action === 'delete') this.deleteserver(index);
  },

  async resolvevpsprivatekey(server) {
    if (server.authType !== 'key') return server.password || '';
    if (server.privateKey) return server.privateKey;
    if (server.keyIndex !== undefined && server.keyIndex >= 0 && server.keyIndex < ServerKeychain.keys.length) {
      return ServerKeychain.keys[server.keyIndex].privateKey || '';
    }
    return '';
  },

  load() {
    const data = localStorage.getItem('ctrl_servers');
    this.list = data ? JSON.parse(data) : [];
    const fd = localStorage.getItem('ctrl_folders');
    this.folders = fd ? JSON.parse(fd) : [];
    this._apikeycache = {};
  },

  async resolveapikey(server) {
    if (!server || !server.apiKey) return '';
    if (!server.apiKey.startsWith('enc:')) return server.apiKey;
    const cachekey = server.uuid || server.id;
    if (this._apikeycache[cachekey]) return this._apikeycache[cachekey];
    try {
      const dec = await window.electronAPI.cryptodecrypt(server.apiKey.slice(4));
      this._apikeycache[cachekey] = dec;
      return dec;
    } catch (e) {
      return '';
    }
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
      if (server.authType === 'key') {
        const pk = await this.resolvevpsprivatekey(server);
        if (pk) {
          cfg.authType = 'privateKey';
          cfg.privateKey = pk;
        } else {
          cfg.authType = 'password';
          cfg.password = server.password || '';
        }
      } else {
        cfg.authType = 'password';
        cfg.password = server.password || '';
      }
      if (cfg.authType === 'password' && !cfg.password) return;
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
    if (!server || server.type !== 'Pterodactyl' || !server.panelUrl) return;
    const apiKey = await this.resolveapikey(server);
    if (!apiKey) return;
    try {
      await Api.power(server.panelUrl, apiKey, server.uuid, signal);
      this.resources[server.uuid] = this.resources[server.uuid] || {};
      this.resources[server.uuid].state = signal === 'start' || signal === 'restart' ? 'starting' : 'stopping';
      this.updatecard(server.uuid);
      if (signal === 'start' || signal === 'restart') {
        this._pollafterpower(server.uuid, 0);
      }
      if (typeof CTRLPlugin !== 'undefined') {
        CTRLPlugin.emit('server:' + signal, { server, uuid: server.uuid });
      }
    } catch (e) {}
  },

  _pollafterpower(uuid, attempt) {
    if (attempt > 10) return;
    const delays = [2000, 3000, 3000, 4000, 5000, 5000, 5000, 5000, 5000, 5000];
    setTimeout(async () => {
    const server = this.list.find(s => s.uuid === uuid || String(s.id) === String(uuid));
      if (!server || !server.panelUrl) return;
      const apiKey = await this.resolveapikey(server);
      if (!apiKey) return;
      try {
        const data = await Api.fetchresources(server.panelUrl, apiKey, uuid);
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
        if (typeof CTRLPlugin !== 'undefined') CTRLPlugin.emit('_serverupdate', { uuid, resources: this.resources[uuid] });
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
    this.updatemassbar();
    clearTimeout(this._vpsfetchtimer);
    this._vpsfetchtimer = setTimeout(() => this.fetchvpsstats(), 1500);
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
      const key = this._serverkey(server);
      const isselected = this._selected.has(key);
      const cpupct = this._barpct(cpu);
      const rampct = this._barpct(memTotal > 0 ? (memUsed / memTotal) * 100 : 0);
      const diskpct = this._barpct(diskTotal > 0 ? (diskUsed / diskTotal) * 100 : 0);
      return `
      <div class="server-card${isselected ? ' selected' : ''}" draggable="true" data-key="${key}" data-uuid="${server.uuid || server.id || ''}" data-index="${index}">
        <div class="server-card-header">
          <div class="server-name-row">
            <label class="server-card-select">
              <input type="checkbox" ${isselected ? 'checked' : ''} />
              <span class="server-card-check"></span>
            </label>
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
            <div class="stat-bar-wrap"><div class="stat-bar" style="--bar-pct:${cpupct}"></div></div>
            <div class="stat-value">${cpu.toFixed(1)}%</div>
          </div>
          <div class="stat-row">
            <div class="stat-label">RAM</div>
            <div class="stat-bar-wrap"><div class="stat-bar" style="--bar-pct:${rampct}"></div></div>
            <div class="stat-value">${Utils.formatbytes(memUsed)} / ${Utils.formatmb(server.limits?.memory)}</div>
          </div>
          <div class="stat-row">
            <div class="stat-label">Disk</div>
            <div class="stat-bar-wrap"><div class="stat-bar" style="--bar-pct:${diskpct}"></div></div>
            <div class="stat-value">${Utils.formatbytes(diskUsed)} / ${Utils.formatmb(server.limits?.disk)}</div>
          </div>
        </div>` : ''}
        ${server.type === 'VPS/VDS' && this.vpsstats[server.id] ? this._rendervpsstats(this.vpsstats[server.id]) : ''}
        ${(server.tags && server.tags.length > 0) ? `<div class="server-card-tags">${server.tags.map(t => `<span class="server-tag" style="--tag-color:${this._tagcolor(t)}">${Utils.escape(t)}</span>`).join('')}</div>` : ''}
        <div class="server-card-footer">
          <div class="server-status">
            <span class="status-dot ${state}"></span>
            <span class="status-text">${Utils.statuslabel(state)}</span>
          </div>
          <div class="server-card-actions">
            ${res.uptime ? `<span class="status-uptime">${Utils.formatuptime(res.uptime)}</span>` : ''}
            ${server.type === 'Pterodactyl' && server.apiKey && server.panelUrl && (state === 'running' || state === 'stopped' || state === 'offline') ? `
              <button type="button" class="card-action-btn" data-power="start" data-action="start" title="Start" ${state === 'running' ? 'disabled' : ''}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              </button>
              <button type="button" class="card-action-btn" data-power="restart" title="Restart">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
              </button>
              <button type="button" class="card-action-btn" data-power="stop" data-action="stop" title="Stop" ${state === 'stopped' || state === 'offline' ? 'disabled' : ''}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
              </button>
            ` : ''}
          </div>
        </div>
      </div>`;
  },

  async pollresources() {
    if (App.currentPage !== 'dashboard' || App.currentServer) return;
    const ptero = this.list.filter(s => s.type === 'Pterodactyl' && s.panelUrl);
    const vps = this.list.filter(s => s.type === 'VPS/VDS' && s.host && s.port);
    for (const server of ptero) {
      const apiKey = await this.resolveapikey(server);
      if (!apiKey) continue;
      try {
        const data = await Api.fetchresources(server.panelUrl, apiKey, server.uuid);
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
        if (typeof CTRLPlugin !== 'undefined') CTRLPlugin.emit('_serverupdate', { uuid: server.uuid, resources: this.resources[server.uuid] });
        if (App.currentServer?.uuid === server.uuid) {
          ServerConsole.updateresources(server.uuid);
        }
      } catch (e) {
        console.error('pollresources error for', server.name, e);
      }
    }
    for (const server of vps) {
      try {
        const status = await window.electronAPI.checkvps(server.host, server.port);
        const prev = server.status;
        server.status = status === 'online' ? 'online' : 'offline';
        if (prev !== server.status) {
          this.save();
          this.updatecard(server.id);
          if (typeof CTRLPlugin !== 'undefined') CTRLPlugin.emit('_serverupdate', { uuid: server.id, resources: this.vpsstats[server.id] || {} });
        }
      } catch (e) {}
    }
    this._vpspollcount = (this._vpspollcount || 0) + 1;
    if (this._vpspollcount % 6 === 0) {
      this.fetchvpsstats();
    }
  },

  async fetchallfromapi() {
    const ptero = this.list.filter(s => s.type === 'Pterodactyl' && s.panelUrl);
    const panels = new Map();
    ptero.forEach(s => {
      const key = s.panelUrl;
      if (!panels.has(key)) panels.set(key, []);
      panels.get(key).push(s);
    });

    for (const [panelUrl, servers] of panels) {
      const apiKey = await this.resolveapikey(servers[0]);
      if (!apiKey) continue;
      try {
        const apiServers = await Api.fetchservers(panelUrl, apiKey);
        for (const saved of servers) {
          const api = apiServers.find(a => a.attributes.uuid === saved.uuid || (saved.uuid && a.attributes.uuid.startsWith(saved.uuid)));
          if (api) {
            const a = api.attributes;
            saved.name = a.name || saved.name;
            saved.description = a.description || saved.description || '';
            saved.node = a.node || saved.node || '';
            saved.limits = a.limits || saved.limits;
            saved.allocations = (a.relationships?.allocations?.data || []).map(x => ({ id: x.attributes.id, ip: x.attributes.ip, port: x.attributes.port }));
            if (saved.allocations.length) {
              saved.host = saved.allocations[0].ip || saved.host;
              saved.port = saved.allocations[0].port || saved.port;
            }
            if (saved.uuid !== a.uuid) saved.uuid = a.uuid;
          }
        }
      } catch (e) {
        console.error('fetchallfromapi error for panel', panelUrl, e);
      }
    }
    this.save();
    this.render();
  },

  updatecard(uuid) {
    const card = document.querySelector(`.server-card[data-uuid="${uuid}"]`);
    if (!card) return;
    const res = this.resources[uuid] || {};
    const server = this.list.find(s => s.uuid === uuid || String(s.id) === String(uuid));
    const state = res.state || (server ? server.status : '') || 'offline';

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

    if (server && server.type === 'Pterodactyl') {
    const bars = card.querySelectorAll('.stat-row');
    const memUsed = res.memory_bytes || 0;
    const memTotal = (server.limits?.memory || 0) * 1024 * 1024;
    const diskUsed = res.disk_bytes || 0;
    const diskTotal = (server.limits?.disk || 0) * 1024 * 1024;
    const cpu = res.cpu || 0;

    if (bars[0]) {
      this._setbarwidth(bars[0].querySelector('.stat-bar'), cpu);
      bars[0].querySelector('.stat-value').textContent = cpu.toFixed(1) + '%';
    }
    if (bars[1]) {
      this._setbarwidth(bars[1].querySelector('.stat-bar'), memTotal > 0 ? (memUsed / memTotal) * 100 : 0);
      bars[1].querySelector('.stat-value').textContent = Utils.formatbytes(memUsed) + ' / ' + Utils.formatmb(server.limits?.memory);
    }
    if (bars[2]) {
      this._setbarwidth(bars[2].querySelector('.stat-bar'), diskTotal > 0 ? (diskUsed / diskTotal) * 100 : 0);
      bars[2].querySelector('.stat-value').textContent = Utils.formatbytes(diskUsed) + ' / ' + Utils.formatmb(server.limits?.disk);
    }
    }

    const vpsCard = card.querySelector('.vps-stats');
    const st = this.vpsstats[server.id];
    if (vpsCard && st) {
      vpsCard.querySelector('.vps-stat-ram .vps-stat-val').textContent = Utils.formatbytes(st.memUsed) + ' / ' + Utils.formatbytes(st.memTotal);
      vpsCard.querySelector('.vps-stat-ram .vps-stat-bar').style.setProperty('--bar-pct', this._barpct(st.memTotal > 0 ? (st.memUsed / st.memTotal) * 100 : 0));
      vpsCard.querySelector('.vps-stat-disk .vps-stat-val').textContent = Utils.formatbytes(st.diskUsed) + ' / ' + Utils.formatbytes(st.diskTotal);
      vpsCard.querySelector('.vps-stat-disk .vps-stat-bar').style.setProperty('--bar-pct', this._barpct(st.diskTotal > 0 ? (st.diskUsed / st.diskTotal) * 100 : 0));
      vpsCard.querySelector('.vps-stat-swap .vps-stat-val').textContent = Utils.formatbytes(st.swapUsed) + ' / ' + Utils.formatbytes(st.swapTotal);
      vpsCard.querySelector('.vps-stat-swap .vps-stat-bar').style.setProperty('--bar-pct', this._barpct(st.swapTotal > 0 ? (st.swapUsed / st.swapTotal) * 100 : 0));
      vpsCard.querySelector('.vps-stat-load .vps-stat-val').textContent = st.load1.toFixed(2) + ' / ' + st.load5.toFixed(2) + ' / ' + st.load15.toFixed(2);
    }
  },

  _rendervpsstats(st) {
    const rampct = this._barpct(st.memTotal > 0 ? (st.memUsed / st.memTotal) * 100 : 0);
    const diskpct = this._barpct(st.diskTotal > 0 ? (st.diskUsed / st.diskTotal) * 100 : 0);
    const swappct = this._barpct(st.swapTotal > 0 ? (st.swapUsed / st.swapTotal) * 100 : 0);
    const loadpct = this._barpct((st.load1 / (st.cpus || 1)) * 100);
    return `
      <div class="server-stats vps-stats">
        <div class="stat-row vps-stat-ram">
          <div class="stat-label">RAM</div>
          <div class="stat-bar-wrap"><div class="vps-stat-bar stat-bar" style="--bar-pct:${rampct}"></div></div>
          <div class="vps-stat-val stat-value">${Utils.formatbytes(st.memUsed)} / ${Utils.formatbytes(st.memTotal)}</div>
        </div>
        <div class="stat-row vps-stat-disk">
          <div class="stat-label">Disk</div>
          <div class="stat-bar-wrap"><div class="vps-stat-bar stat-bar" style="--bar-pct:${diskpct}"></div></div>
          <div class="vps-stat-val stat-value">${Utils.formatbytes(st.diskUsed)} / ${Utils.formatbytes(st.diskTotal)}</div>
        </div>
        <div class="stat-row vps-stat-swap">
          <div class="stat-label">Swap</div>
          <div class="stat-bar-wrap"><div class="vps-stat-bar stat-bar" style="--bar-pct:${swappct}"></div></div>
          <div class="vps-stat-val stat-value">${Utils.formatbytes(st.swapUsed)} / ${Utils.formatbytes(st.swapTotal)}</div>
        </div>
        <div class="stat-row vps-stat-load">
          <div class="stat-label">Load</div>
          <div class="stat-bar-wrap"><div class="vps-stat-bar stat-bar" style="--bar-pct:${loadpct}"></div></div>
          <div class="vps-stat-val stat-value">${st.load1.toFixed(2)} / ${st.load5.toFixed(2)} / ${st.load15.toFixed(2)}</div>
        </div>
      </div>`;
  },

  async fetchvpsstats() {
    const vps = this.list.filter(s => s.type === 'VPS/VDS' && s.host && s.port);
    let changed = false;
    for (const server of vps) {
      try {
        const cfg = { host: server.host, port: server.port || 22, username: server.username || 'root' };
        if (server.authType === 'key') {
          const pk = await this.resolvevpsprivatekey(server);
          if (pk) {
            cfg.authType = 'privateKey';
            cfg.privateKey = pk;
          } else {
            cfg.authType = 'password';
            cfg.password = server.password || '';
          }
        } else {
          cfg.authType = 'password';
          cfg.password = server.password || '';
        }
        if (cfg.authType === 'password' && !cfg.password) continue;
        const cmd = "free -b | awk '/Mem:/{print $2,$3} /Swap:/{print $2,$3}' && df -B1 / | awk 'NR==2{print $2,$3}' && cat /proc/loadavg && nproc";
        const result = await window.electronAPI?.sshexec?.(cfg, cmd);
        if (result && result.stdout) {
          const lines = result.stdout.trim().split('\n');
          const mem = lines[0]?.split(/\s+/) || [];
          const swap = lines[1]?.split(/\s+/) || [];
          const disk = lines[2]?.split(/\s+/) || [];
          const loadparts = lines[3]?.split(/\s+/) || [];
          const cpus = parseInt(lines[4]) || 1;
          this.vpsstats[server.id] = {
            memTotal: parseInt(mem[0]) || 0,
            memUsed: parseInt(mem[1]) || 0,
            swapTotal: parseInt(swap[0]) || 0,
            swapUsed: parseInt(swap[1]) || 0,
            diskTotal: parseInt(disk[0]) || 0,
            diskUsed: parseInt(disk[1]) || 0,
            load1: parseFloat(loadparts[0]) || 0,
            load5: parseFloat(loadparts[1]) || 0,
            load15: parseFloat(loadparts[2]) || 0,
            cpus: cpus,
            updated: Date.now()
          };
          changed = true;
        }
      } catch (e) {}
    }
    if (changed && App.currentPage === 'dashboard' && !App.currentServer) {
      this.rendercards();
    }
  },

  opencontextmenu(e, index) {
    e.stopPropagation();
    document.querySelectorAll('.context-menu.active').forEach(m => m.classList.remove('active'));
    const menu = this._ensurectxmenu();
    const server = this.list[index];
    if (!server) return;
    const tags = server.tags || [];
    const alltags = this._collecttags();
    this._ctxindex = index;
    this._ctxtags = alltags;
    this._ctxfolders = this.folders;
    const taghtml = alltags.length > 0
      ? alltags.map((t, ti) => `<button type="button" class="context-menu-item" data-ctx="tag" data-tag-idx="${ti}">
          <span class="ctx-tag-dot" style="--tag-dot:${this._tagcolor(t)}"></span>
          ${tags.includes(t) ? '✓ ' : ''}${Utils.escape(t)}
        </button>`).join('')
      : '<div class="context-menu-label">No tags yet</div>';
    const folderhtml = this.folders.length > 0
      ? this.folders.map((f, fi) => `<button type="button" class="context-menu-item" data-ctx="folder" data-folder-idx="${fi}">
          ${server.folder === f ? '✓ ' : ''}${Utils.escape(f)}
        </button>`).join('') + '<button type="button" class="context-menu-item" data-ctx="folder-clear">Remove from folder</button>'
      : '';
    menu.innerHTML = `
      <button type="button" class="context-menu-item" data-ctx="pin">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
        </svg>
        ${server.pinned ? 'Unpin' : 'Pin'}
      </button>
      <div class="context-menu-separator"></div>
      <div class="context-menu-label">Tags</div>
      ${taghtml}
      <button type="button" class="context-menu-item" data-ctx="newtag">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        New tag
      </button>
      ${folderhtml ? '<div class="context-menu-separator"></div><div class="context-menu-label">Folder</div>' + folderhtml : ''}
      <div class="context-menu-separator"></div>
      ${server.type === 'Pterodactyl' ? `
      <button type="button" class="context-menu-item" data-ctx="clone">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
        Clone
      </button>` : ''}
      <button type="button" class="context-menu-item danger" data-ctx="delete">
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
    this._modaltagindex = index;
    Modal.open('New Tag', `
      <div class="form-group">
        <label class="form-label">Tag name</label>
        <input class="form-input" type="text" id="newTagInput" placeholder="e.g. production" autofocus />
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" data-modal-action="tag-cancel">Cancel</button>
        <button type="button" class="btn btn-primary" data-modal-action="tag-add">Add</button>
      </div>
    `);
    setTimeout(() => { const inp = Utils.el('newTagInput'); if (inp) inp.focus(); }, 50);
  },

  addtag() {
    const val = Utils.el('newTagInput').value.trim().toLowerCase();
    if (!val) return;
    const server = this.list[this._modaltagindex];
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
        <button type="button" class="btn btn-secondary" data-modal-action="folder-cancel">Cancel</button>
        <button type="button" class="btn btn-primary" data-modal-action="folder-create">Create</button>
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
    this.renderworkspaces();
    Modal.close();
  },

  setfiltertag(tag) {
    this._filtertag = this._filtertag === tag ? '' : tag;
    this.renderfilterbar();
    this.rendercards();
  },

  setfilterfolder(folder) {
    if (App.currentPage !== 'dashboard') {
      Modal.alert('Workspace Filter', 'Go to the dashboard to filter by workspace.');
      return;
    }
    this._filterfolder = this._filterfolder === folder ? '' : folder;
    this.renderfilterbar();
    this.rendercards();
    this.renderworkspaces();
  },

  deletefolder(folder) {
    this.folders = this.folders.filter(f => f !== folder);
    this.list.forEach(s => { if (s.folder === folder) s.folder = undefined; });
    if (this._filterfolder === folder) this._filterfolder = '';
    this.save();
    this.renderfilterbar();
    this.rendercards();
    this.renderworkspaces();
  },

  renderworkspaces() {
    const list = Utils.el('workspacesList');
    if (!list) return;
    if (!this.folders.length) {
      list.innerHTML = '';
      return;
    }
    list.innerHTML = this.folders.map(f => {
      const count = this.list.filter(s => s.folder === f).length;
      const active = this._filterfolder === f ? ' active' : '';
      const enc = encodeURIComponent(f);
      return `<div class="workspace-item${active}" data-folder="${enc}">
        <div class="workspace-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        </div>
        <div class="workspace-info">
          <div class="workspace-name">${Utils.escape(f)}</div>
          <div class="workspace-count">${count} server${count !== 1 ? 's' : ''}</div>
        </div>
        <button type="button" class="workspace-delete" data-folder="${enc}" title="Delete workspace">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>`;
    }).join('');
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
    let html = '';
    if (tags.length > 0) {
      html += tags.map(t => {
        const enc = encodeURIComponent(t);
        return `<button type="button" class="filter-pill tag-pill${this._filtertag === t ? ' active' : ''}" data-tag="${enc}">
          <span class="filter-pill-dot" style="--tag-dot:${this._tagcolor(t)}"></span>
          ${Utils.escape(t)}
          <span class="filter-pill-x" data-tag="${enc}" title="Delete tag">&times;</span>
        </button>`;
      }).join('');
    }
    bar.innerHTML = html;
  },

  deleteserver(index) {
    document.querySelectorAll('.context-menu.active').forEach(m => m.classList.remove('active'));
    Modal.confirm('Delete Server', 'Are you sure you want to remove this server?', () => {
      const server = this.list[index];
      if (server) this._selected.delete(this._serverkey(server));
      this.list.splice(index, 1);
      this.save();
      this.render();
      CTRLCloud.autosyncupload('delete');
    });
  },

  toggleselect(index) {
    const server = this.list[index];
    if (!server) return;
    const key = this._serverkey(server);
    if (this._selected.has(key)) this._selected.delete(key);
    else this._selected.add(key);
    const on = this._selected.has(key);
    document.querySelectorAll(`.server-card[data-key="${key}"]`).forEach(c => {
      c.classList.toggle('selected', on);
      const cb = c.querySelector('.server-card-select input[type="checkbox"]');
      if (cb) cb.checked = on;
    });
    this._syncselectall();
    this.updatemassbar();
  },

  toggleselectall(checked) {
    const filtered = this._filterlist();
    filtered.forEach(s => {
      const key = this._serverkey(s);
      if (checked) this._selected.add(key);
      else this._selected.delete(key);
    });
    this.rendercards();
    this.updatemassbar();
  },

  clearselection() {
    this._selected.clear();
    this.rendercards();
    this.updatemassbar();
  },

  _syncselectall() {
    const filtered = this._filterlist();
    const allselected = filtered.length > 0 && filtered.every(s => this._selected.has(this._serverkey(s)));
    const cb = document.querySelector('.server-select-all');
    if (cb) cb.checked = allselected;
  },

  updatemassbar() {
    const bar = document.querySelector('.server-mass-actions');
    const count = bar?.querySelector('.mass-actions-count');
    if (!bar) return;
    bar.classList.toggle('is-hidden', this._selected.size === 0);
    if (count) count.textContent = this._selected.size + ' selected';
  },

  massdelete() {
    const count = this._selected.size;
    Modal.confirm('Delete Servers', `Are you sure you want to remove ${count} server${count > 1 ? 's' : ''}?`, () => {
      this.list = this.list.filter(s => !this._selected.has(this._serverkey(s)));
      this._selected.clear();
      this.save();
      this.render();
      CTRLCloud.autosyncupload('delete');
    });
  },

  openaddmodal() {
    Modal.open('Add Server', `
      <p class="modal-text">Select server type</p>
      <div class="server-types">
        <div class="server-type-option" data-add-type="pterodactyl">
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
        <div class="server-type-option" data-add-type="vps">
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
        <div class="server-type-option" data-add-type="link">
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

  cloneserver(index) {
    const server = this.list[index];
    if (!server || server.type !== 'Pterodactyl') return;
    this.showpterodactylform();
    setTimeout(() => {
      const urlEl = Utils.el('panelUrl');
      const keyEl = Utils.el('apiKey');
      if (urlEl) urlEl.value = server.panelUrl || '';
      if (keyEl) keyEl.value = server.apiKey || '';
    }, 50);
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
        <button type="button" class="btn btn-secondary" data-modal-action="ptero-back">Back</button>
        <button type="button" class="btn btn-primary" data-modal-action="ptero-connect">Connect</button>
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
    this._addselected = new Set();
    Modal.open('Select Servers', `
      <p class="modal-hint">Found ${servers.length} server(s)</p>
      <div class="modal-toolbar">
        <button type="button" class="btn btn-sm btn-secondary" data-modal-action="add-select-all">Select All</button>
      </div>
      <div class="server-select-list">
        ${servers.map((s, i) => `
          <div class="server-select-item" data-add-select="${i}">
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
        <button type="button" class="btn btn-secondary" data-modal-action="ptero-select-back">Back</button>
        <button type="button" class="btn btn-primary" data-modal-action="add-selected">Add Selected</button>
      </div>
    `);
  },

  toggleaddselect(i) {
    if (this._addselected.has(i)) this._addselected.delete(i);
    else this._addselected.add(i);
    document.querySelectorAll('.server-select-item').forEach((el, idx) => {
      el.classList.toggle('selected', this._addselected.has(idx));
    });
  },

  toggleaddall() {
    const items = document.querySelectorAll('.server-select-item');
    const all = this._addselected.size === items.length;
    items.forEach((el, i) => {
      if (all) this._addselected.delete(i);
      else this._addselected.add(i);
      el.classList.toggle('selected', this._addselected.has(i));
    });
  },

  async addselected() {
    const { panelUrl, apiKey, servers } = this._addData;
    if (!this._addselected.size) return;
    let encryptedApiKey = apiKey;
    try {
      encryptedApiKey = 'enc:' + await window.electronAPI.cryptoencrypt(apiKey);
    } catch (e) {}
    for (const i of this._addselected) {
      const s = servers[i];
      if (!s || this.list.some(x => x.uuid === s.attributes.uuid && x.panelUrl === panelUrl)) continue;
      const alloc = s.attributes.relationships?.allocations?.data?.[0]?.attributes;
      this.list.push({
        id: Date.now() + Math.random(),
        type: 'Pterodactyl',
        name: s.attributes.name,
        description: s.attributes.description || '',
        panelUrl,
        apiKey: encryptedApiKey,
        uuid: s.attributes.uuid,
        node: s.attributes.node,
        host: alloc?.ip || panelUrl.replace(/^https?:\/\//, ''),
        port: alloc?.port || '',
        limits: s.attributes.limits || {},
        allocations: (s.attributes.relationships?.allocations?.data || []).map(a => ({ id: a.attributes.id, ip: a.attributes.ip, port: a.attributes.port })),
        status: 'offline'
      });
    }
    this.save();
    this.render();
    this.fetchallfromapi();
    CTRLCloud.autosyncupload('add');
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
          <button type="button" class="vps-auth-btn active" id="vpsAuthPassword" data-modal-action="vps-auth" data-auth="password">Password</button>
          <button type="button" class="vps-auth-btn" id="vpsAuthKey" data-modal-action="vps-auth" data-auth="key">Key</button>
        </div>
      </div>
      <div class="form-group" id="vpsPasswordField">
        <label class="form-label">Password</label>
        <input class="form-input" type="password" id="vpsPassword" placeholder="SSH password" />
      </div>
      <div class="form-group is-hidden" id="vpsKeyField">
        <label class="form-label">SSH Key</label>
        <select class="form-input" id="vpsKeySelect">${keyOptions}</select>
        ${hasMore ? `<button type="button" class="btn btn-sm btn-secondary vps-key-more" data-modal-action="vps-all-keys">Show all ${keys.length} keys</button>` : ''}
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" data-modal-action="vps-back">Back</button>
        <button type="button" class="btn btn-primary" data-modal-action="vps-add">Add</button>
      </div>
    `);
  },

  togglevpsauth(type) {
    const pwbtn = Utils.el('vpsAuthPassword');
    const keybtn = Utils.el('vpsAuthKey');
    const pwfield = Utils.el('vpsPasswordField');
    const keyfield = Utils.el('vpsKeyField');
    if (type === 'key') {
      pwbtn.classList.remove('active');
      keybtn.classList.add('active');
      pwfield.classList.add('is-hidden');
      keyfield.classList.remove('is-hidden');
    } else {
      keybtn.classList.remove('active');
      pwbtn.classList.add('active');
      keyfield.classList.add('is-hidden');
      pwfield.classList.remove('is-hidden');
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
      } else {
        return;
      }
    }

    this.list.push(server);
    this.save();
    this.render();
    CTRLCloud.autosyncupload('add');
    Modal.close();
  },

  showlinkform() {
    Modal.open('Link Server', `
      <div class="form-group"><label class="form-label">Server Name</label><input class="form-input" type="text" id="linkName" placeholder="My Server" /></div>
      <div class="form-group"><label class="form-label">Link URL</label><input class="form-input" type="url" id="linkUrl" placeholder="https://example.com" /></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" data-modal-action="link-back">Back</button>
        <button type="button" class="btn btn-primary" data-modal-action="link-add">Add</button>
      </div>
    `);
  },

  addlink() {
    const name = Utils.el('linkName').value.trim();
    const url = Utils.el('linkUrl').value.trim();
    if (!name || !url) return;
    this.list.push({ id: Date.now(), type: 'Link', name, host: url, status: 'offline' });
    this.save(); this.render(); CTRLCloud.autosyncupload('add'); Modal.close();
  },

  exportlist() {
    Modal.open('Export servers', `
      <p class="modal-text">How would you like to export your servers?</p>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" data-modal-action="export-plain">Export without encryption</button>
        <button type="button" class="btn btn-primary" data-modal-action="export-encrypted">Encrypt export</button>
      </div>
    `);
  },

  showencryptedexport() {
    Modal.open('Encrypt export', `
      <p class="modal-text-sm">Protect the export with AES-256-GCM. Keep this password: it cannot be recovered.</p>
      <div class="form-group"><label class="form-label">Password</label><input class="form-input" type="text" id="exportPassword" autocomplete="off" /></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" data-modal-action="export-generate">Generate password</button>
        <button type="button" class="btn btn-primary" data-modal-action="export-download">Encrypt and download</button>
      </div>
    `);
  },

  generateexportpassword() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const password = Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('');
    const input = Utils.el('exportPassword');
    if (input) {
      input.value = password;
      input.focus();
      input.select();
    }
  },

  async downloadexport(password) {
    try {
      if (password !== undefined && !password) return;
      const data = await this.getexportdata();
      let content = JSON.stringify(data, null, 2);
      if (password !== undefined) content = JSON.stringify(await this.encryptlist(content, password), null, 2);
      const blob = new Blob([content], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ctrlservers-export.ctrlservers';
      a.click();
      URL.revokeObjectURL(url);
      Modal.close();
    } catch (e) {
      this.showexporterror('Unable to prepare the export. Reconnect the affected Pterodactyl server and try again.');
    }
  },

  async getexportdata() {
    const servers = await Promise.all(this.list.map(async (server) => {
      const copy = { ...server };
      if (copy.type === 'Pterodactyl' && typeof copy.apiKey === 'string' && copy.apiKey.startsWith('enc:')) {
        const apiKey = await this.resolveapikey(server);
        if (!apiKey) throw new Error('Unable to decrypt API key');
        copy.apiKey = apiKey;
      }
      return copy;
    }));
    return {
      servers,
      folders: this.folders,
      keychain: ServerKeychain.keys || []
    };
  },

  showexporterror(message) {
    Modal.open('Export Error', `
      <p class="modal-text-center">${Utils.escape(message)}</p>
      <div class="modal-actions"><button type="button" class="btn btn-primary" data-modal-action="export-ok">OK</button></div>
    `);
  },

  async encryptlist(text, password) {
    const salt = new Uint8Array(16);
    const iv = new Uint8Array(12);
    crypto.getRandomValues(salt);
    crypto.getRandomValues(iv);
    const key = await this.deriveexportkey(password, salt);
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text));
    return {
      format: 'CTRLServers Encrypted Export',
      version: 1,
      algorithm: 'AES-256-GCM',
      kdf: 'PBKDF2-SHA-256',
      iterations: 310000,
      salt: this.arraytobase64(salt),
      iv: this.arraytobase64(iv),
      ciphertext: this.arraytobase64(new Uint8Array(ciphertext))
    };
  },

  async decryptlist(data, password) {
    const salt = this.base64toarray(data.salt);
    const iv = this.base64toarray(data.iv);
    const ciphertext = this.base64toarray(data.ciphertext);
    const key = await this.deriveexportkey(password, salt, data.iterations);
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return new TextDecoder().decode(plaintext);
  },

  async deriveexportkey(password, salt, iterations) {
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iterations || 310000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  },

  arraytobase64(bytes) {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  },

  base64toarray(value) {
    const binary = atob(value);
    return Uint8Array.from(binary, char => char.charCodeAt(0));
  },

  importlist() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ctrlservers,.json';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (data.format === 'CTRLServers Encrypted Export' && data.algorithm === 'AES-256-GCM') {
          this.showdecryptimport(data);
          return;
        }
        await this.applyimport(data);
      } catch (e) {
        this.showimporterror('Invalid JSON file');
      }
    };
    input.click();
  },

  showdecryptimport(data) {
    this._encryptedimport = data;
    Modal.open('Encrypted file', `
      <p class="modal-text-sm">This file is encrypted. Enter the password.</p>
      <div class="form-group"><label class="form-label">Password</label><input class="form-input" id="importPassword" type="password" autocomplete="off" /></div>
      <div class="modal-actions"><button type="button" class="btn btn-secondary" data-modal-action="import-cancel">Cancel</button><button type="button" class="btn btn-primary" data-modal-action="import-decrypt">Import</button></div>
    `);
    setTimeout(() => Utils.el('importPassword')?.focus(), 0);
  },

  async decryptimport() {
    const password = Utils.el('importPassword')?.value || '';
    if (!password || !this._encryptedimport) return;
    try {
      const data = JSON.parse(await this.decryptlist(this._encryptedimport, password));
      this._encryptedimport = null;
      await this.applyimport(data);
    } catch (e) {
      this.showimporterror('Unable to decrypt file. Check the password.');
    }
  },

  showimporterror(message) {
    Modal.open('Import Error', `
      <p class="modal-text-center">${Utils.escape(message)}</p>
      <div class="modal-actions"><button type="button" class="btn btn-primary" data-modal-action="export-ok">OK</button></div>
    `);
  },

  async applyimport(data) {
    if (data.servers && Array.isArray(data.servers)) {
            let added = 0;
            const imported = [];
            for (const s of data.servers) {
              if (!this.list.find(x => x.uuid && x.uuid === s.uuid || x.id && x.id === s.id)) {
                const importedServer = { ...s };
                if (importedServer.type === 'Pterodactyl' && importedServer.apiKey && !importedServer.apiKey.startsWith('enc:')) {
                  try {
                    importedServer.apiKey = 'enc:' + await window.electronAPI.cryptoencrypt(importedServer.apiKey);
                  } catch (e) {}
                }
                this.list.push(importedServer);
                imported.push(importedServer);
                added++;
              }
            }
            if (data.folders && Array.isArray(data.folders)) {
              for (const f of data.folders) {
                if (!this.folders.includes(f)) this.folders.push(f);
              }
            }
            let keysAdded = 0;
            if (data.keychain && Array.isArray(data.keychain)) {
              for (const k of data.keychain) {
                if (!ServerKeychain.keys.find(x => x.name === k.name)) {
                  ServerKeychain.keys.push(k);
                  keysAdded++;
                }
              }
            }
            for (const s of imported) {
              if (s.privateKey && !ServerKeychain.keys.find(k => k.privateKey === s.privateKey)) {
                const keyName = s.name + ' Key';
                if (!ServerKeychain.keys.find(k => k.name === keyName)) {
                  ServerKeychain.keys.push({
                    name: keyName,
                    publicKey: '',
                    privateKey: s.privateKey,
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                  });
                  keysAdded++;
                }
              }
            }
            for (const s of imported) {
              if (s.authType === 'key') {
                if (s.privateKey) {
                  const idx = ServerKeychain.keys.findIndex(k => k.privateKey === s.privateKey);
                  if (idx !== -1) s.keyIndex = idx;
                } else if (s.keyIndex !== undefined && ServerKeychain.keys[s.keyIndex]) {
                  const oldKey = data.keychain && data.keychain[s.keyIndex];
                  if (oldKey) {
                    const newIdx = ServerKeychain.keys.findIndex(k => k.name === oldKey.name);
                    if (newIdx !== -1) s.keyIndex = newIdx;
                  }
                }
                delete s.privateKey;
              }
            }
            if (keysAdded > 0) {
              ServerKeychain.save();
              ServerKeychain.renderall();
            }
            this.save();
            this.render();
            this.renderworkspaces();
            this.fetchallfromapi();
            let msg = `Added ${added} server(s)`;
            if (keysAdded > 0) msg += `, ${keysAdded} key(s)`;
            Modal.open('Import Complete', `
              <p class="modal-text-center">${Utils.escape(msg)}</p>
              <div class="modal-actions"><button type="button" class="btn btn-primary" data-modal-action="export-ok">OK</button></div>
            `);
    } else {
      this.showimporterror('This file does not contain a server list.');
    }
  }
};
