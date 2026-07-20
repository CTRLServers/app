const Servers = {
  list: [],
  resources: {},

  init() {
    this.load();
    Utils.el('addserverbtn').addEventListener('click', () => this.openaddmodal());
    Utils.el('emptyaddbtn').addEventListener('click', () => this.openaddmodal());
    Utils.el('backtoservers').addEventListener('click', (e) => {
      e.preventDefault();
      App.showserverlist();
    });
  },

  load() {
    const data = localStorage.getItem('ctrl_servers');
    this.list = data ? JSON.parse(data) : [];
  },

  save() {
    localStorage.setItem('ctrl_servers', JSON.stringify(this.list));
  },

  geticon(server) {
    if (server.type === 'Pterodactyl') return '<img class="server-icon" src="assets/pterodactyl.png" alt="" />';
    if (server.type === 'Link') return '<div class="server-icon server-icon-svg"><svg width="28" height="28" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></div>';
    if (server.type === 'VPS/VDS') {
      const os = (server.os || '').toLowerCase();
      const osmap = [
        ['debian', 'debian'], ['ubuntu', 'ubuntu'], ['centos', 'centos'],
        ['rocky', 'rockylinux'], ['almalinux', 'almalinux'], ['alpine', 'alpine'],
        ['arch', 'arch'], ['gentoo', 'gentoo'], ['fedora', 'fedora'],
        ['mint', 'mint'], ['rhel', 'rhel'], ['red hat', 'rhel'],
      ];
      for (const [key, file] of osmap) {
        if (os.includes(key)) return `<img class="server-icon" src="assets/${file}.png" alt="" />`;
      }
      return '<div class="server-icon server-icon-svg"><svg width="28" height="28" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg></div>';
    }
    return '<div class="server-icon server-icon-svg"><svg width="28" height="28" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg></div>';
  },

  async detectos(server) {
    if (server.type !== 'VPS/VDS' || server.os) return;
    try {
      const cfg = {
        host: server.host,
        port: parseInt(server.port) || 22,
        username: server.username || 'root',
      };
      if (server.authtype === 'key' && server.privatekey) {
        cfg.authtype = 'privatekey';
        cfg.privatekey = server.privatekey;
      } else {
        cfg.authtype = 'password';
        cfg.password = server.password || '';
      }
      const result = await window.electronapi.sshexec(cfg, "cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d= -f2 | tr -d '\"'");
      if (result && result.stdout && result.stdout.trim()) {
        server.os = result.stdout.trim();
        this.save();
      }
    } catch (e) { /* silent - OS detection is non-critical */ }
  },

  render() {
    const grid = Utils.el('serversgrid');
    const empty = Utils.el('emptystate');
    if (this.list.length === 0) {
      empty.style.display = 'flex';
      grid.style.display = 'none';
    } else {
      empty.style.display = 'none';
      grid.style.display = 'grid';
      this.rendercards();
    }
  },

  rendercards() {
    const grid = Utils.el('serversgrid');
    grid.innerHTML = this.list.map((server, index) => {
      const res = this.resources[server.uuid] || {};
      const memused = res.memory_bytes || 0;
      const memtotal = (server.limits?.memory || 0) * 1024 * 1024;
      const diskused = res.disk_bytes || 0;
      const disktotal = (server.limits?.disk || 0) * 1024 * 1024;
      const cpu = res.cpu || 0;
      const state = res.state || server.status || 'offline';
      const ip = server.host || '—';
      const port = server.port || '';

      return `
      <div class="server-card" data-uuid="${server.uuid || ''}" data-index="${index}" onclick="App.openserver(${index})" oncontextmenu="Servers.contextmenu(event, ${index})">
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
            <svg width="14" height="14" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            <span>${Utils.escape(ip)}${port ? ':' + port : ''}</span>
          </div>
          ${server.node ? `<div class="server-info">
            <svg width="14" height="14" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
            <div class="stat-bar-wrap"><div class="stat-bar" style="width:${memtotal > 0 ? Math.min((memused / memtotal) * 100, 100) : 0}%"></div></div>
            <div class="stat-value">${Utils.formatbytes(memused)} / ${Utils.formatmb(server.limits?.memory)}</div>
          </div>
          <div class="stat-row">
            <div class="stat-label">Disk</div>
            <div class="stat-bar-wrap"><div class="stat-bar" style="width:${disktotal > 0 ? Math.min((diskused / disktotal) * 100, 100) : 0}%"></div></div>
            <div class="stat-value">${Utils.formatbytes(diskused)} / ${Utils.formatmb(server.limits?.disk)}</div>
          </div>
        </div>` : ''}
        <div class="server-card-footer">
          <div class="server-status">
            <span class="status-dot ${state}"></span>
            <span class="status-text">${Utils.statuslabel(state)}</span>
          </div>
          ${res.uptime ? `<span class="status-uptime">${Utils.formatuptime(res.uptime)}</span>` : ''}
        </div>
      </div>`;
    }).join('');
  },

  async pollresources() {
    if (App.currentpage !== 'dashboard' || App.currentserver) return;
    const servers = this.list.filter(s => s.type === 'Pterodactyl' && s.apikey && s.panelurl);
    for (const server of servers) {
      try {
        const data = await Api.fetchresources(server.panelurl, server.apikey, server.uuid);
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
        if (App.currentserver?.uuid === server.uuid) {
          ServerConsole.updateresources(server.uuid);
        }
      } catch (e) { /* silent */ }
    }
  },

  async fetchallfromapi() {
    const ptero = this.list.filter(s => s.type === 'Pterodactyl' && s.apikey && s.panelurl);
    const unique = new Map();
    ptero.forEach(s => {
      const key = s.panelurl + '|' + s.apikey;
      if (!unique.has(key)) unique.set(key, s);
    });

    for (const [, server] of unique) {
      try {
        const apiservers = await Api.fetchservers(server.panelurl, server.apikey);
        for (const saved of this.list.filter(s => s.panelurl === server.panelurl && s.apikey === server.apikey)) {
          const api = apiservers.find(a => a.attributes.uuid === saved.uuid);
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
      } catch (e) { /* silent */ }
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

    const server = this.list.find(s => s.uuid === uuid);
    if (!server || server.type !== 'Pterodactyl') return;

    const bars = card.querySelectorAll('.stat-row');
    const memused = res.memory_bytes || 0;
    const memtotal = (server.limits?.memory || 0) * 1024 * 1024;
    const diskused = res.disk_bytes || 0;
    const disktotal = (server.limits?.disk || 0) * 1024 * 1024;
    const cpu = res.cpu || 0;

    if (bars[0]) {
      bars[0].querySelector('.stat-bar').style.width = Math.min(cpu, 100) + '%';
      bars[0].querySelector('.stat-value').textContent = cpu.toFixed(1) + '%';
    }
    if (bars[1]) {
      bars[1].querySelector('.stat-bar').style.width = (memtotal > 0 ? Math.min((memused / memtotal) * 100, 100) : 0) + '%';
      bars[1].querySelector('.stat-value').textContent = Utils.formatbytes(memused) + ' / ' + Utils.formatmb(server.limits?.memory);
    }
    if (bars[2]) {
      bars[2].querySelector('.stat-bar').style.width = (disktotal > 0 ? Math.min((diskused / disktotal) * 100, 100) : 0) + '%';
      bars[2].querySelector('.stat-value').textContent = Utils.formatbytes(diskused) + ' / ' + Utils.formatmb(server.limits?.disk);
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

    menu.innerHTML = `
      <button class="context-menu-item danger" onclick="Servers.deleteserver(${index})">
        <svg width="16" height="16" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
        Delete
      </button>
    `;
    menu.style.left = e.clientx + 'px';
    menu.style.top = e.clienty + 'px';
    menu.classList.add('active');

    const close = (ev) => {
      if (!menu.contains(ev.target)) {
        menu.classList.remove('active');
        document.removeEventListener('click', close);
      }
    };
    setTimeout(() => document.addEventListener('click', close), 0);
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
            <svg width="22" height="22" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
            <svg width="22" height="22" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
            <svg width="22" height="22" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
        <input class="form-input" type="url" id="panelurl" placeholder="https://panel.example.com" />
      </div>
      <div class="form-group">
        <label class="form-label">API Key</label>
        <input class="form-input" type="password" id="apikey" placeholder="ptlc_..." />
      </div>
      <div id="pterodactylerror"></div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Servers.openaddmodal()">Back</button>
        <button class="btn btn-primary" onclick="Servers.fetchpterodactyl()">Connect</button>
      </div>
    `);
  },

  async fetchpterodactyl() {
    const panelurl = Utils.el('panelurl').value.trim();
    const apikey = Utils.el('apikey').value.trim();
    const err = Utils.el('pterodactylerror');
    if (!panelurl || !apikey) { err.innerHTML = '<div class="error-msg">Fill all fields</div>'; return; }

    Utils.el('modalbody').innerHTML = '<div class="loading"><div class="spinner"></div><div class="loading-text">Fetching servers...</div></div>';

    try {
      const servers = await Api.fetchservers(panelurl, apikey);
      this._addData = { panelurl: panelurl.replace(/\/+$/, ''), apikey, servers };
      this.showserverselect(servers);
    } catch (e) {
      err.innerHTML = `<div class="error-msg">${e.message}</div>`;
      this.showpterodactylform();
      Utils.el('panelurl').value = panelurl;
      Utils.el('apikey').value = apikey;
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
              <svg width="12" height="12" viewbox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="3"><polyline points="20 6 9 17 4 12" /></svg>
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
    const { panelurl, apikey, servers } = this._addData;
    this._selected.forEach(i => {
      const s = servers[i];
      if (this.list.some(x => x.uuid === s.attributes.uuid && x.panelurl === panelurl)) return;
      const alloc = s.attributes.relationships?.allocations?.data?.[0]?.attributes;
      this.list.push({
        id: Date.now() + Math.random(),
        type: 'Pterodactyl',
        name: s.attributes.name,
        description: s.attributes.description || '',
        panelurl, apikey,
        uuid: s.attributes.uuid,
        node: s.attributes.node,
        host: alloc?.ip || panelurl.replace(/^https?:\/\//, ''),
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
    const showlimit = 20;
    const hasmore = keys.length > showlimit;

    let keyoptions = '<option value="">Select a key...</option>';
    const keystoshow = hasmore ? keys.slice(0, showlimit) : keys;
    keystoshow.forEach((key, i) => {
      keyoptions += `<option value="${i}">${Utils.escape(key.name)}</option>`;
    });

    Modal.open('VPS / VDS', `
      <div class="form-group"><label class="form-label">Server Name</label><input class="form-input" type="text" id="vpsname" placeholder="My VPS" /></div>
      <div class="form-group"><label class="form-label">IP Address</label><input class="form-input" type="text" id="vpsip" placeholder="192.168.1.1" /></div>
      <div class="form-group"><label class="form-label">Port</label><input class="form-input" type="number" id="vpsport" value="22" /></div>
      <div class="form-group"><label class="form-label">Username</label><input class="form-input" type="text" id="vpsuser" placeholder="root" value="root" /></div>
      <div class="form-group">
        <label class="form-label">Authentication</label>
        <div class="vps-auth-toggle">
          <button class="vps-auth-btn active" id="vpsauthpassword" onclick="Servers.togglevpsauth('password')">Password</button>
          <button class="vps-auth-btn" id="vpsauthkey" onclick="Servers.togglevpsauth('key')">Key</button>
        </div>
      </div>
      <div class="form-group" id="vpspasswordfield">
        <label class="form-label">Password</label>
        <input class="form-input" type="password" id="vpspassword" placeholder="SSH password" />
      </div>
      <div class="form-group" id="vpskeyfield" style="display:none;">
        <label class="form-label">SSH Key</label>
        <select class="form-input" id="vpskeyselect">${keyoptions}</select>
        ${hasmore ? `<button class="btn btn-sm btn-secondary" style="margin-top:8px;" onclick="Servers.showallvpskeys()">Show all ${keys.length} keys</button>` : ''}
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Servers.openaddmodal()">Back</button>
        <button class="btn btn-primary" onclick="Servers.addvps()">Add</button>
      </div>
    `);
  },

  togglevpsauth(type) {
    const pwbtn = Utils.el('vpsauthpassword');
    const keybtn = Utils.el('vpsauthkey');
    const pwfield = Utils.el('vpspasswordfield');
    const keyfield = Utils.el('vpskeyfield');
    if (type === 'key') {
      pwbtn.classList.remove('active');
      keybtn.classList.add('active');
      pwfield.style.display = 'none';
      keyfield.style.display = '';
    } else {
      keybtn.classList.remove('active');
      pwbtn.classList.add('active');
      keyfield.style.display = 'none';
      pwfield.style.display = '';
    }
  },

  showallvpskeys() {
    const keys = ServerKeychain.keys || [];
    const select = Utils.el('vpskeyselect');
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
    const name = Utils.el('vpsname').value.trim();
    const ip = Utils.el('vpsip').value.trim();
    const port = Utils.el('vpsport').value.trim() || '22';
    const username = Utils.el('vpsuser').value.trim() || 'root';
    const authtype = Utils.el('vpsauthkey').classList.contains('active') ? 'key' : 'password';

    if (!name || !ip) return;

    const server = {
      id: Date.now(),
      type: 'VPS/VDS',
      name,
      host: ip,
      port,
      username,
      authtype,
      status: 'offline'
    };

    if (authtype === 'password') {
      server.password = Utils.el('vpspassword').value;
    } else {
      const keyidx = parseInt(Utils.el('vpskeyselect').value);
      if (!isNaN(keyidx) && ServerKeychain.keys[keyidx]) {
        server.keyindex = keyidx;
        server.privatekey = ServerKeychain.keys[keyidx].privatekey;
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
      <div class="form-group"><label class="form-label">Server Name</label><input class="form-input" type="text" id="linkname" placeholder="My Server" /></div>
      <div class="form-group"><label class="form-label">Link URL</label><input class="form-input" type="url" id="linkurl" placeholder="https://example.com" /></div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Servers.openaddmodal()">Back</button>
        <button class="btn btn-primary" onclick="Servers.addlink()">Add</button>
      </div>
    `);
  },

  addlink() {
    const name = Utils.el('linkname').value.trim();
    const url = Utils.el('linkurl').value.trim();
    if (!name || !url) return;
    this.list.push({ id: Date.now(), type: 'Link', name, host: url, status: 'offline' });
    this.save(); this.render(); Modal.close();
  }
};
