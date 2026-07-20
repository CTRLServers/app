const Windows = {
  windows: [],
  activeId: null,
  _nextId: 1,

  open(serverIndex) {
    const server = Servers.list[serverIndex];
    if (!server) return;
    if (server.type === 'Link') {
      if (server.host) window.electronAPI.openexternal(server.host);
      return;
    }
    if (server.type !== 'Pterodactyl' && server.type !== 'VPS/VDS') return;

    const existing = this.windows.find(w => w.serverIndex === serverIndex);
    if (existing) {
      if (existing.minimized) this.restore(existing.id);
      this.focus(existing.id);
      return;
    }

    const id = this._nextId++;
    this.windows.push({ id, serverIndex, title: server.name, minimized: false });
    this.activeId = id;
    this.rendertaskbar();
    this._applywindow();
  },

  focus(id) {
    if (this.activeId === id) return;
    this.activeId = id;
    const win = this.windows.find(w => w.id === id);
    if (win && !win.minimized) {
      this._applywindow();
    }
    this.rendertaskbar();
  },

  minimize(id) {
    const win = this.windows.find(w => w.id === id);
    if (!win) return;
    win.minimized = true;
    if (this.activeId === id) {
      this.activeId = null;
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
    if (this.activeId === id) {
      this.activeId = null;
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
    else if (this.activeId === id) this.minimize(id);
    else this.focus(id);
  },

  minimizeactive() {
    if (this.activeId) this.minimize(this.activeId);
  },

  closeactive() {
    if (this.activeId) this.close(this.activeId);
  },

  _applywindow() {
    const win = this.windows.find(w => w.id === this.activeId);
    const detail = Utils.el('serverDetail');
    if (!win) {
      detail.classList.remove('windowed');
      App.showserverlist();
      return;
    }

    const server = Servers.list[win.serverIndex];
    detail.classList.add('windowed');

    const iconEl = Utils.el('windowTitleIcon');
    const textEl = Utils.el('windowTitleText');
    if (iconEl) iconEl.innerHTML = Servers.geticon(server);
    if (textEl) textEl.textContent = server.name;

    App._showservercontent(server);
  },

  rendertaskbar() {
    const container = Utils.el('taskbarItems');
    if (!container) return;
    container.innerHTML = this.windows.map(win => {
      const server = Servers.list[win.serverIndex];
      const icon = server ? Servers.geticon(server) : '';
      const isActive = this.activeId === win.id && !win.minimized;
      return '<button class="taskbar-item' + (isActive ? ' active' : '') + '" data-wid="' + win.id + '">' +
        '<span class="taskbar-item-icon">' + icon + '</span>' +
        '<span>' + Utils.escape(win.title) + '</span>' +
        '<span class="taskbar-item-close" data-action="close" data-wid="' + win.id + '">' +
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
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
  currentPage: 'dashboard',
  currentServer: null,
  currentServerPage: 'console',
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

    Utils.el('taskbarStart').addEventListener('click', () => {
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
    const titlebar = Utils.el('windowTitlebar');
    const detail = Utils.el('serverDetail');
    if (!titlebar || !detail) return;

    let startX, startY, startL, startT, startW, startH;

    titlebar.addEventListener('mousedown', (e) => {
      if (e.target.closest('.window-controls')) return;
      if (detail.dataset.max === '1') return;
      e.preventDefault();
      this._dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startL = detail.offsetLeft;
      startT = detail.offsetTop;
      startW = detail.offsetWidth;
      startH = detail.offsetHeight;
      document.body.style.cursor = 'move';

      const onmove = (ev) => {
        if (!this._dragging) return;
        detail.style.left = (startL + ev.clientX - startX) + 'px';
        detail.style.top = (startT + ev.clientY - startY) + 'px';
        detail.style.width = startW + 'px';
        detail.style.height = startH + 'px';
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
        detail.style.left = detail.dataset.pLeft || '';
        detail.style.top = detail.dataset.pTop || '';
        detail.style.width = detail.dataset.pW || '';
        detail.style.height = detail.dataset.pH || '';
        detail.dataset.max = '0';
      } else {
        detail.dataset.pLeft = detail.style.left || '';
        detail.dataset.pTop = detail.style.top || '';
        detail.dataset.pW = detail.style.width || '';
        detail.dataset.pH = detail.style.height || '';
        detail.style.left = '0';
        detail.style.top = '0';
        detail.style.width = '100%';
        detail.style.height = '100%';
        detail.dataset.max = '1';
      }
    });

    Utils.el('windowMinimizeBtn').addEventListener('click', () => Windows.minimizeactive());
    Utils.el('windowCloseBtn').addEventListener('click', () => Windows.closeactive());
  },

  bindevents() {
    Utils.el('sidebarToggle').addEventListener('click', () => {
      Utils.el('sidebar').classList.toggle('open');
    });

    document.querySelectorAll('#mainNav .nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        this.navigateto(item.dataset.page);
      });
    });

    document.querySelectorAll('#serverNav .nav-item[data-server-page]').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        this.switchserverpage(item.dataset.serverPage);
      });
    });

    Utils.el('consoleInput').addEventListener('keydown', (e) => {
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
    this.currentPage = page;
    document.querySelectorAll('#mainNav .nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.page === page);
    });
    Utils.el('pageTitle').textContent = this.getpagetitle(page);
    Utils.el('sidebar').classList.remove('open');
    Utils.el('topbarResources').style.display = 'none';
    Utils.el('serversGrid').style.display = page === 'dashboard' ? 'grid' : 'none';
    Utils.el('emptyState').style.display = (page === 'dashboard' && Servers.list.length === 0) ? 'flex' : 'none';
    Utils.el('dashboardKeychain').style.display = page === 'keychain' ? 'flex' : 'none';
    Utils.el('tabSftp').style.display = page === 'sftp' ? '' : 'none';
    Utils.el('tabMinecraft').style.display = page === 'minecraft' ? '' : 'none';
    if (page === 'keychain') ServerKeychain.renderdashboard();
    if (page === 'sftp') SFTP.load();
    if (page === 'minecraft') {
      Utils.el('tabMinecraft').innerHTML =
        '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px 20px;text-align:center;gap:16px">' +
          '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>' +
          '<h2 style="margin:0;font-size:20px;font-weight:600;color:var(--text-primary)">Minecraft Plugin isn\'t supported in the Desktop App</h2>' +
          '<p style="margin:0;font-size:14px;color:var(--text-muted);max-width:400px">Please use our <a href="#" id="mcWebLink" style="color:var(--accent);text-decoration:underline;cursor:pointer">Web App</a> for that.</p>' +
          '<button class="btn btn-primary" id="mcOpenWeb" style="margin-top:8px">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>' +
            ' Open Web App</button>' +
        '</div>';
      const openBtn = document.getElementById('mcOpenWeb');
      const linkEl = document.getElementById('mcWebLink');
      if (openBtn) openBtn.addEventListener('click', () => window.electronAPI.openexternal('https://app.ctrlservers.xyz'));
      if (linkEl) linkEl.addEventListener('click', (e) => { e.preventDefault(); window.electronAPI.openexternal('https://app.ctrlservers.xyz'); });
    }
  },

  getpagetitle(page) {
    return { dashboard: 'Dashboard', keychain: 'KeyChain', minecraft: 'Minecraft Plugin', sftp: 'SFTP' }[page] || 'Dashboard';
  },

  showserverlist() {
    if (ServerFiles.editor) ServerFiles.closeeditor();
    this.currentServer = null;
    ServerConsole.destroy();
    VPSConsole.destroy();
    const detail = Utils.el('serverDetail');
    detail.style.display = 'none';
    detail.classList.remove('windowed');
    detail.style.left = '';
    detail.style.top = '';
    detail.style.width = '';
    detail.style.height = '';
    detail.style.right = '';
    detail.style.bottom = '';
    detail.dataset.max = '0';
    Utils.el('mainNav').style.display = '';
    Utils.el('serverNav').style.display = 'none';
    Utils.el('topbarResources').style.display = 'none';
    Utils.el('emptyState').style.display = Servers.list.length === 0 ? 'flex' : 'none';
    Utils.el('serversGrid').style.display = Servers.list.length > 0 ? 'grid' : 'none';
    Utils.el('dashboardKeychain').style.display = 'none';
    Utils.el('topbarActions').style.display = '';
    Utils.el('topbarServerActions').style.display = 'none';
    Utils.el('pageTitle').textContent = 'Dashboard';
    Utils.el('content').classList.remove('server-view');
    Utils.el('tabSftp').style.display = 'none';
    Utils.el('tabMinecraft').style.display = 'none';
    this.currentPage = 'dashboard';
  },

  openserver(index) {
    const server = Servers.list[index];
    if (!server) return;
    if (server.type === 'Link') {
      if (server.host) window.electronAPI.openexternal(server.host);
      return;
    }
    if (server.type !== 'Pterodactyl' && server.type !== 'VPS/VDS') return;

    const existing = Windows.windows.find(w => w.serverIndex === index);
    if (existing) {
      if (existing.minimized) Windows.restore(existing.id);
      Windows.focus(existing.id);
      return;
    }

    const id = Windows._nextId++;
    Windows.windows.push({ id, serverIndex: index, title: server.name, minimized: false });
    Windows.activeId = id;
    Windows.rendertaskbar();

    const detail = Utils.el('serverDetail');
    detail.classList.add('windowed');
    const iconEl = Utils.el('windowTitleIcon');
    const textEl = Utils.el('windowTitleText');
    if (iconEl) iconEl.innerHTML = Servers.geticon(server);
    if (textEl) textEl.textContent = server.name;

    this._showservercontent(server);
  },

  _showservercontent(server) {
    this.currentServer = server;
    Utils.el('mainNav').style.display = 'none';
    Utils.el('serverNav').style.display = '';
    Utils.el('emptyState').style.display = 'none';
    Utils.el('serversGrid').style.display = 'none';
    Utils.el('serverDetail').style.display = '';
    Utils.el('pageTitle').textContent = server.name;
    Utils.el('sidebar').classList.remove('open');
    Utils.el('content').classList.add('server-view');
    Utils.el('dashboardKeychain').style.display = 'none';
    Utils.el('tabSftp').style.display = 'none';
    Utils.el('tabMinecraft').style.display = 'none';

    document.querySelectorAll('#serverNav .nav-item').forEach(item => {
      item.classList.add('hidden');
    });

    if (server.type === 'VPS/VDS') {
      document.querySelectorAll('#serverNav .nav-item[data-vps]').forEach(item => {
        item.classList.remove('hidden');
      });
      Utils.el('topbarActions').style.display = 'none';
      Utils.el('topbarServerActions').style.display = 'none';
      Utils.el('topbarResources').style.display = 'none';
      Servers.detectos(server);
      document.querySelectorAll('#serverNav .nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.serverPage === 'vpsConsole');
      });
      this.switchserverpage('vpsConsole');
      VPSConsole.init(server);
    } else {
      document.querySelectorAll('#serverNav .nav-item[data-pterodactyl]').forEach(item => {
        item.classList.remove('hidden');
      });
      Utils.el('topbarActions').style.display = 'none';
      Utils.el('topbarServerActions').style.display = '';
      Utils.el('topbarResources').style.display = '';
      document.querySelectorAll('#serverNav .nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.serverPage === 'console');
      });
      Utils.el('consoleOutput').innerHTML = '';
      this.switchserverpage('console');
      ServerConsole.init(server);
    }
  },

  _inwindowsmode() {
    return Windows.windows.length > 0;
  },

  switchserverpage(page) {
    if (page !== 'files' && ServerFiles.editor) {
      ServerFiles.closeeditor();
    }
    this.currentServerPage = page;
    document.querySelectorAll('#serverNav .nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.serverPage === page);
    });
    document.querySelectorAll('.server-page-tab').forEach(tab => tab.style.display = 'none');

    if (page === 'vpsConsole') {
      const tab = Utils.el('tabVPSConsole');
      if (tab) tab.style.display = 'flex';
      if (this.currentServer) {
        setTimeout(() => {
          if (VPSConsole.term) VPSConsole.fitAddon && VPSConsole.fitAddon.fit();
        }, 50);
      }
      return;
    }

    const tab = Utils.el('tab' + page.charAt(0).toUpperCase() + page.slice(1));
    if (tab) tab.style.display = 'flex';
    if (page === 'files' && App.currentServer) ServerFiles.load(ServerFiles.currentPath || '/');
    if (page === 'activity' && App.currentServer) ServerActivity.load();
    if (page === 'users' && App.currentServer) ServerUsers.load();
    if (page === 'databases' && App.currentServer) ServerDatabases.load();
    if (page === 'schedules' && App.currentServer) ServerSchedules.load();
    if (page === 'keychain' && App.currentServer) ServerKeychain.load();
    if (page === 'startup' && App.currentServer) ServerStartup.load();
    if (page === 'network' && App.currentServer) ServerNetwork.load();
    if (page === 'backups' && App.currentServer) ServerBackups.load();
    if (page === 'settings' && App.currentServer) ServerSettings.load();
    if (page === 'packages' && App.currentServer) Packages.load();
    if (page === 'info' && App.currentServer) VPSInfo.load();
    if (page === 'firewall' && App.currentServer) Firewall.load();
    if (page === 'vpsUsers' && App.currentServer) VPSUsers.load();
    if (page === 'cron' && App.currentServer) Cron.load();
    if (page === 'services' && App.currentServer) Services.load();
    if (page === 'security' && App.currentServer) Security.load();
    if (page === 'docker' && App.currentServer) Docker.load();
    if (page === 'webServer' && App.currentServer) WebServer.load();
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
