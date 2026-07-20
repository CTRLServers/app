const Windows = {
  windows: [],
  activeid: null,
  _nextId: 1,

  open(serverindex) {
    const server = Servers.list[serverindex];
    if (!server) return;
    if (server.type === 'Link') {
      if (server.host) window.electronapi.openexternal(server.host);
      return;
    }
    if (server.type !== 'Pterodactyl' && server.type !== 'VPS/VDS') return;

    const existing = this.windows.find(w => w.serverindex === serverindex);
    if (existing) {
      if (existing.minimized) this.restore(existing.id);
      this.focus(existing.id);
      return;
    }

    const id = this._nextId++;
    this.windows.push({ id, serverindex, title: server.name, minimized: false });
    this.activeid = id;
    this.rendertaskbar();
    this._applyWindow();
  },

  focus(id) {
    if (this.activeid === id) return;
    this.activeid = id;
    const win = this.windows.find(w => w.id === id);
    if (win && !win.minimized) {
      this._applyWindow();
    }
    this.rendertaskbar();
  },

  minimize(id) {
    const win = this.windows.find(w => w.id === id);
    if (!win) return;
    win.minimized = true;
    if (this.activeid === id) {
      this.activeid = null;
      const next = this.windows.find(w => !w.minimized && w.id !== id);
      if (next) this.focus(next.id);
      else App.showserverlist();
    }
    this.rendertaskbar();
  },

  restore(id) {
    const win = this.windows.find(w => w.id === id);
    if (!win) return;
    win.minimized = false;
    this.focus(id);
  },

  close(id) {
    const win = this.windows.find(w => w.id === id);
    if (!win) return;
    this.windows = this.windows.filter(w => w.id !== id);
    if (this.activeid === id) {
      this.activeid = null;
      const next = this.windows.find(w => !w.minimized);
      if (next) this.focus(next.id);
      else App.showserverlist();
    }
    this.rendertaskbar();
  },

  toggle(id) {
    const win = this.windows.find(w => w.id === id);
    if (!win) return;
    if (win.minimized) this.restore(id);
    else if (this.activeid === id) this.minimize(id);
    else this.focus(id);
  },

  minimizeactive() {
    if (this.activeid) this.minimize(this.activeid);
  },

  closeactive() {
    if (this.activeid) this.close(this.activeid);
  },

  _applyWindow() {
    const win = this.windows.find(w => w.id === this.activeid);
    const detail = Utils.el('serverdetail');
    if (!win) {
      detail.classList.remove('windowed');
      App.showserverlist();
      return;
    }

    const server = Servers.list[win.serverindex];
    detail.classList.add('windowed');

    const iconel = Utils.el('windowtitleicon');
    const textel = Utils.el('windowtitletext');
    if (iconel) iconel.innerHTML = Servers.geticon(server);
    if (textel) textel.textContent = server.name;

    App._showServerContent(server);
  },

  rendertaskbar() {
    const container = Utils.el('taskbaritems');
    if (!container) return;
    container.innerHTML = this.windows.map(win => {
      const server = Servers.list[win.serverindex];
      const icon = server ? Servers.geticon(server) : '';
      const isactive = this.activeid === win.id && !win.minimized;
      return '<button class="taskbar-item' + (isactive ? ' active' : '') + '" data-wid="' + win.id + '">' +
        '<span class="taskbar-item-icon">' + icon + '</span>' +
        '<span>' + Utils.escape(win.title) + '</span>' +
        '<span class="taskbar-item-close" data-action="close" data-wid="' + win.id + '">' +
          '<svg width="12" height="12" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</span>' +
      '</button>';
    }).join('');

    container.querySelectorAll('.taskbar-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.taskbar-item-close')) return;
        Windows.toggle(parseInt(item.dataset.wid));
      });
    });
    container.querySelectorAll('.taskbar-item-close').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        Windows.close(parseInt(btn.dataset.wid));
      });
    });
  }
};

const App = {
  currentpage: 'dashboard',
  currentserver: null,
  currentserverpage: 'console',
  _pollInterval: null,
  _dragging: false,

  init() {
    Theme.init();
    Modal.init();
    Servers.init();
    ServerFiles.init();
    ServerKeychain.load();
    this.bindevents();
    this.bindwindowcontrols();
    Servers.render();

    Utils.el('taskbarstart').addEventListener('click', () => {
      if (Windows.windows.length > 0) {
        Windows.windows.forEach(w => {
          if (!w.minimized) Windows.minimize(w.id);
        });
      }
      this.showserverlist();
    });

    if (Servers.list.length > 0) {
      Servers.fetchallfromapi().then(() => Servers.pollresources());
    }

    this._pollInterval = setInterval(() => Servers.pollresources(), 10000);
  },

  bindwindowcontrols() {
    const titlebar = Utils.el('windowtitlebar');
    const detail = Utils.el('serverdetail');
    if (!titlebar || !detail) return;

    let startx, starty, startl, startt, startw, starth;

    titlebar.addEventListener('mousedown', (e) => {
      if (e.target.closest('.window-controls')) return;
      if (detail.dataset.max === '1') return;
      e.preventDefault();
      this._dragging = true;
      startx = e.clientx;
      starty = e.clienty;
      startl = detail.offsetLeft;
      startt = detail.offsetTop;
      startw = detail.offsetWidth;
      starth = detail.offsetHeight;
      document.body.style.cursor = 'move';

      const onmove = (ev) => {
        if (!this._dragging) return;
        detail.style.left = (startl + ev.clientx - startx) + 'px';
        detail.style.top = (startt + ev.clienty - starty) + 'px';
        detail.style.width = startw + 'px';
        detail.style.height = starth + 'px';
      };
      const onup = () => {
        this._dragging = false;
        document.removeEventListener('mousemove', onmove);
        document.removeEventListener('mouseup', onup);
        document.body.style.cursor = '';
      };
      document.addEventListener('mousemove', onmove);
      document.addEventListener('mouseup', onup);
    });

    titlebar.addEventListener('dblclick', (e) => {
      if (e.target.closest('.window-controls')) return;
      if (detail.dataset.max === '1') {
        detail.style.left = detail.dataset.pleft || '';
        detail.style.top = detail.dataset.ptop || '';
        detail.style.width = detail.dataset.pw || '';
        detail.style.height = detail.dataset.ph || '';
        detail.dataset.max = '0';
      } else {
        detail.dataset.pleft = detail.style.left || '';
        detail.dataset.ptop = detail.style.top || '';
        detail.dataset.pw = detail.style.width || '';
        detail.dataset.ph = detail.style.height || '';
        detail.style.left = '0';
        detail.style.top = '0';
        detail.style.width = '100%';
        detail.style.height = '100%';
        detail.dataset.max = '1';
      }
    });

    Utils.el('windowminimizebtn').addEventListener('click', () => Windows.minimizeactive());
    Utils.el('windowclosebtn').addEventListener('click', () => Windows.closeactive());
  },

  bindevents() {
    Utils.el('sidebartoggle').addEventListener('click', () => {
      Utils.el('sidebar').classList.toggle('open');
    });

    document.querySelectorAll('#mainnav .nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        this.navigateto(item.dataset.page);
      });
    });

    document.querySelectorAll('#servernav .nav-item[data-server-page]').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        this.switchserverpage(item.dataset.serverpage);
      });
    });

    Utils.el('consoleinput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') ServerConsole.send();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && ServerFiles.editor) {
        ServerFiles.closeeditor();
      }
    });

    document.addEventListener('click', () => {
      document.querySelectorAll('.context-menu.active').forEach(m => m.classList.remove('active'));
    });
  },

  navigateto(page) {
    this.currentpage = page;
    document.querySelectorAll('#mainnav .nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.page === page);
    });
    Utils.el('pagetitle').textContent = this.getpagetitle(page);
    Utils.el('sidebar').classList.remove('open');
    Utils.el('topbarresources').style.display = 'none';
    Utils.el('serversgrid').style.display = page === 'dashboard' ? 'grid' : 'none';
    Utils.el('emptystate').style.display = (page === 'dashboard' && Servers.list.length === 0) ? 'flex' : 'none';
    Utils.el('dashboardkeychain').style.display = page === 'keychain' ? 'flex' : 'none';
    Utils.el('tabsftp').style.display = page === 'sftp' ? '' : 'none';
    Utils.el('tabminecraft').style.display = page === 'minecraft' ? '' : 'none';
    if (page === 'keychain') ServerKeychain.renderdashboard();
    if (page === 'sftp') SFTP.load();
    if (page === 'minecraft') {
      Utils.el('tabminecraft').innerHTML =
        '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px 20px;text-align:center;gap:16px">' +
          '<svg width="48" height="48" viewbox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>' +
          '<h2 style="margin:0;font-size:20px;font-weight:600;color:var(--text-primary)">Minecraft Plugin isn\'t supported in the Desktop App</h2>' +
          '<p style="margin:0;font-size:14px;color:var(--text-muted);max-width:400px">Please use our <a href="#" id="mcweblink" style="color:var(--accent);text-decoration:underline;cursor:pointer">Web App</a> for that.</p>' +
          '<button class="btn btn-primary" id="mcopenweb" style="margin-top:8px">' +
            '<svg width="16" height="16" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>' +
            ' Open Web App</button>' +
        '</div>';
      const openbtn = document.getElementById('mcopenweb');
      const linkel = document.getElementById('mcweblink');
      if (openbtn) openbtn.addEventListener('click', () => window.electronapi.openexternal('https://app.ctrlservers.xyz'));
      if (linkel) linkel.addEventListener('click', (e) => { e.preventDefault(); window.electronapi.openexternal('https://app.ctrlservers.xyz'); });
    }
  },

  getpagetitle(page) {
    return { dashboard: 'Dashboard', keychain: 'KeyChain', minecraft: 'Minecraft Plugin', sftp: 'SFTP' }[page] || 'Dashboard';
  },

  showserverlist() {
    if (ServerFiles.editor) ServerFiles.closeeditor();
    this.currentserver = null;
    ServerConsole.destroy();
    VPSConsole.destroy();
    const detail = Utils.el('serverdetail');
    detail.style.display = 'none';
    detail.classList.remove('windowed');
    detail.style.left = '';
    detail.style.top = '';
    detail.style.width = '';
    detail.style.height = '';
    detail.style.right = '';
    detail.style.bottom = '';
    detail.dataset.max = '0';
    Utils.el('mainnav').style.display = '';
    Utils.el('servernav').style.display = 'none';
    Utils.el('topbarresources').style.display = 'none';
    Utils.el('emptystate').style.display = Servers.list.length === 0 ? 'flex' : 'none';
    Utils.el('serversgrid').style.display = Servers.list.length > 0 ? 'grid' : 'none';
    Utils.el('dashboardkeychain').style.display = 'none';
    Utils.el('topbaractions').style.display = '';
    Utils.el('topbarserveractions').style.display = 'none';
    Utils.el('pagetitle').textContent = 'Dashboard';
    Utils.el('content').classList.remove('server-view');
    Utils.el('tabsftp').style.display = 'none';
    Utils.el('tabminecraft').style.display = 'none';
    this.currentpage = 'dashboard';
  },

  openserver(index) {
    const server = Servers.list[index];
    if (!server) return;
    if (server.type === 'Link') {
      if (server.host) window.electronapi.openexternal(server.host);
      return;
    }
    if (server.type !== 'Pterodactyl' && server.type !== 'VPS/VDS') return;

    const existing = Windows.windows.find(w => w.serverindex === index);
    if (existing) {
      if (existing.minimized) Windows.restore(existing.id);
      Windows.focus(existing.id);
      return;
    }

    const id = Windows._nextId++;
    Windows.windows.push({ id, serverindex: index, title: server.name, minimized: false });
    Windows.activeid = id;
    Windows.rendertaskbar();

    const detail = Utils.el('serverdetail');
    detail.classList.add('windowed');
    const iconel = Utils.el('windowtitleicon');
    const textel = Utils.el('windowtitletext');
    if (iconel) iconel.innerHTML = Servers.geticon(server);
    if (textel) textel.textContent = server.name;

    this._showServerContent(server);
  },

  _showServerContent(server) {
    this.currentserver = server;
    Utils.el('mainnav').style.display = 'none';
    Utils.el('servernav').style.display = '';
    Utils.el('emptystate').style.display = 'none';
    Utils.el('serversgrid').style.display = 'none';
    Utils.el('serverdetail').style.display = '';
    Utils.el('pagetitle').textContent = server.name;
    Utils.el('sidebar').classList.remove('open');
    Utils.el('content').classList.add('server-view');
    Utils.el('dashboardkeychain').style.display = 'none';
    Utils.el('tabsftp').style.display = 'none';
    Utils.el('tabminecraft').style.display = 'none';

    document.querySelectorAll('#servernav .nav-item').forEach(item => {
      item.classList.add('hidden');
    });

    if (server.type === 'VPS/VDS') {
      document.querySelectorAll('#servernav .nav-item[data-vps]').forEach(item => {
        item.classList.remove('hidden');
      });
      Utils.el('topbaractions').style.display = 'none';
      Utils.el('topbarserveractions').style.display = 'none';
      Utils.el('topbarresources').style.display = 'none';
      Servers.detectos(server);
      document.querySelectorAll('#servernav .nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.serverpage === 'vpsconsole');
      });
      this.switchserverpage('vpsconsole');
      VPSConsole.init(server);
    } else {
      document.querySelectorAll('#servernav .nav-item[data-pterodactyl]').forEach(item => {
        item.classList.remove('hidden');
      });
      Utils.el('topbaractions').style.display = 'none';
      Utils.el('topbarserveractions').style.display = '';
      Utils.el('topbarresources').style.display = '';
      document.querySelectorAll('#servernav .nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.serverpage === 'console');
      });
      Utils.el('consoleoutput').innerHTML = '';
      this.switchserverpage('console');
      ServerConsole.init(server);
    }
  },

  _inWindowsMode() {
    return Windows.windows.length > 0;
  },

  switchserverpage(page) {
    if (page !== 'files' && ServerFiles.editor) {
      ServerFiles.closeeditor();
    }
    this.currentserverpage = page;
    document.querySelectorAll('#servernav .nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.serverpage === page);
    });
    document.querySelectorAll('.server-page-tab').forEach(tab => tab.style.display = 'none');

    if (page === 'vpsconsole') {
      const tab = Utils.el('tabvpsconsole');
      if (tab) tab.style.display = 'flex';
      if (this.currentserver) {
        setTimeout(() => {
          if (VPSConsole.term) VPSConsole.fitaddon && VPSConsole.fitaddon.fit();
        }, 50);
      }
      return;
    }

    const tab = Utils.el('tab' + page.charAt(0).toUpperCase() + page.slice(1));
    if (tab) tab.style.display = 'flex';
    if (page === 'files' && App.currentserver) ServerFiles.load(ServerFiles.currentpath || '/');
    if (page === 'activity' && App.currentserver) ServerActivity.load();
    if (page === 'users' && App.currentserver) ServerUsers.load();
    if (page === 'databases' && App.currentserver) ServerDatabases.load();
    if (page === 'schedules' && App.currentserver) ServerSchedules.load();
    if (page === 'keychain' && App.currentserver) ServerKeychain.load();
    if (page === 'startup' && App.currentserver) ServerStartup.load();
    if (page === 'network' && App.currentserver) ServerNetwork.load();
    if (page === 'backups' && App.currentserver) ServerBackups.load();
    if (page === 'settings' && App.currentserver) ServerSettings.load();
    if (page === 'packages' && App.currentserver) Packages.load();
    if (page === 'info' && App.currentserver) VPSInfo.load();
    if (page === 'firewall' && App.currentserver) Firewall.load();
    if (page === 'vpsusers' && App.currentserver) VPSUsers.load();
    if (page === 'cron' && App.currentserver) Cron.load();
    if (page === 'services' && App.currentserver) Services.load();
    if (page === 'security' && App.currentserver) Security.load();
    if (page === 'docker' && App.currentserver) Docker.load();
    if (page === 'webserver' && App.currentserver) WebServer.load();
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
