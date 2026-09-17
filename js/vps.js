const VPSConsole = {
  term: null,
  fitAddon: null,
  webglAddon: null,
  sshId: null,
  server: null,
  connected: false,
  _datalistenerid: null,
  _closelistenerid: null,
  _resizeObserver: null,
  _ondata: null,
  _keydownhandler: null,
  _termDataCache: '',
  _decoder: new TextDecoder(),
  _cache: {},
  _sessionGeneration: 0,
  _connectTimer: null,

  _cachekey(server) {
    return String(server.id || [server.host, server.port || 22, server.username || 'root', server.authType || 'password'].join(':'));
  },

  _maketermtheme() {
    const t = Theme.getcurrent();
    const themes = {
      dark: {
        background: '#0a0a0a',
        foreground: '#e0e0e0',
        cursor: '#ffffff',
        cursorAccent: '#0a0a0a',
        selectionBackground: 'rgba(255,255,255,0.2)',
      },
      light: {
        background: '#ffffff',
        foreground: '#1a1a1a',
        cursor: '#000000',
        cursorAccent: '#ffffff',
        selectionBackground: 'rgba(0,0,0,0.15)',
      },
      oled: {
        background: '#000000',
        foreground: '#e0e0e0',
        cursor: '#ffffff',
        cursorAccent: '#000000',
        selectionBackground: 'rgba(255,255,255,0.2)',
      }
    };
    return themes[t] || themes.dark;
  },

  _enablewebgl(term) {
    if (!window.WebglAddon || !window.WebglAddon.WebglAddon) return;
    try {
      const addon = new window.WebglAddon.WebglAddon();
      addon.onContextLoss(() => {
        addon.dispose();
        if (this.webglAddon === addon) this.webglAddon = null;
      });
      term.loadAddon(addon);
      this.webglAddon = addon;
    } catch (e) {
      this.webglAddon = null;
    }
  },

  _wirelisteners(gen) {
    this._ondata = this.term.onData((data) => {
      if (this._sessionGeneration !== gen) return;
      if (this.connected && this.sshId !== null) {
        window.electronAPI.sshdata(this.sshId, data);
      }
    });

    this._datalistenerid = window.electronAPI.onsshdata((id, data) => {
      if (this._sessionGeneration !== gen) return;
      if (id !== this.sshId) return;
      if (!this.term) return;
      const text = typeof data === 'string' ? data : this._decoder.decode(data, { stream: true });
      if (text) {
        this.term.write(text);
        this._termDataCache += text;
      }
    });

    this._closelistenerid = window.electronAPI.onsshclose((id, reason) => {
      if (this._sessionGeneration !== gen) return;
      if (id !== this.sshId) return;
      this.connected = false;
      this.sshId = null;
      const message = reason || 'Connection closed';
      if (this.server) {
        this._cache[this._cachekey(this.server)] = { sshId: null, connected: false, termData: this._termDataCache, disconnected: true, reason: message };
      }
      if (this.term) this.term.writeln('\r\n\x1b[33m' + message + '\x1b[0m');
      this.showreconnect(message);
    });

    const container = Utils.el('vpsConsoleWrap');
    this._keydownhandler = (e) => {
      if ((e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'c') || (e.ctrlKey && e.key === 'c')) {
        const sel = this.term ? this.term.getSelection() : '';
        if (sel && sel.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          navigator.clipboard.writeText(sel);
          this.term.clearSelection();
        }
      }
      if (e.ctrlKey && e.key === 'v') {
        e.preventDefault();
        navigator.clipboard.readText().then((text) => {
          if (text && this.connected && this.sshId !== null) {
            window.electronAPI.sshdata(this.sshId, text);
          }
        }).catch(() => {});
      }
    };
    if (container) container.addEventListener('keydown', this._keydownhandler, true);
  },

  _cleanupdom() {
    if (this._connectTimer) { clearTimeout(this._connectTimer); this._connectTimer = null; }
    if (this._resizeObserver) { this._resizeObserver.disconnect(); this._resizeObserver = null; }
    if (this._ondata) { this._ondata.dispose(); this._ondata = null; }
    if (this._datalistenerid !== null) { window.electronAPI.offsshdata(this._datalistenerid); this._datalistenerid = null; }
    if (this._closelistenerid !== null) { window.electronAPI.offsshclose(this._closelistenerid); this._closelistenerid = null; }
    if (this._keydownhandler) {
      const container = Utils.el('vpsConsoleWrap');
      if (container) container.removeEventListener('keydown', this._keydownhandler, true);
      this._keydownhandler = null;
    }
    if (this.webglAddon) { try { this.webglAddon.dispose(); } catch (e) {} this.webglAddon = null; }
    if (this.fitAddon) { try { this.fitAddon.dispose(); } catch (e) {} this.fitAddon = null; }
    if (this.term) { this.term.dispose(); this.term = null; }
    const container = Utils.el('vpsConsoleWrap');
    if (container) container.innerHTML = '';
  },

  init(server) {
    const cached = this._cache[this._cachekey(server)];
    if (cached) {
      this.server = server;
      this.sshId = cached.sshId;
      this.connected = cached.connected;
      this.renderinfocard(server);
      this._recreateterm(cached);
      this.checkcachedconnection(cached);
      return;
    }
    this.destroy();
    this.server = server;
    this.connected = false;
    this._termDataCache = '';
    this._decoder = new TextDecoder();
    this.renderinfocard(server);

    const container = Utils.el('vpsConsoleWrap');
    container.innerHTML = '';

    const gen = this._sessionGeneration;

    const term = new Terminal({
      theme: this._maketermtheme(),
      fontFamily: 'Cascadia Code, Fira Code, JetBrains Mono, monospace',
      fontSize: 14,
      lineHeight: 1.2,
      cursorBlink: true,
      scrollback: 10000
    });
    const addon = new FitAddon.FitAddon();
    term.loadAddon(addon);
    this.term = term;
    this.fitAddon = addon;

    this._wirelisteners(gen);

    let opened = false;
    this._resizeObserver = new ResizeObserver(() => {
      if (this._sessionGeneration !== gen) return;
      if (!this.fitAddon || !this.term) return;

      if (!opened) {
        opened = true;
        if (this._resizeObserver) this._resizeObserver.disconnect();
        term.open(container);
        this._enablewebgl(term);
        this.fitAddon.fit();
        term.focus();
        this.connect();

        this._resizeObserver = new ResizeObserver(() => {
          if (!this.fitAddon || !this.term) return;
          this.fitAddon.fit();
          if (this.sshId !== null) {
            window.electronAPI.sshresize(this.sshId, this.term.cols, this.term.rows);
          }
        });
        this._resizeObserver.observe(container);
        return;
      }

      this.fitAddon.fit();
      if (this.sshId !== null) {
        window.electronAPI.sshresize(this.sshId, this.term.cols, this.term.rows);
      }
    });
    this._resizeObserver.observe(container);
  },

  _recreateterm(cached) {
    const container = Utils.el('vpsConsoleWrap');
    container.innerHTML = '';

    const gen = this._sessionGeneration;

    const term = new Terminal({
      theme: this._maketermtheme(),
      fontFamily: 'Cascadia Code, Fira Code, JetBrains Mono, monospace',
      fontSize: 14,
      lineHeight: 1.2,
      cursorBlink: true,
      scrollback: 10000
    });
    const addon = new FitAddon.FitAddon();
    term.loadAddon(addon);
    this.term = term;
    this.fitAddon = addon;
    this._termDataCache = cached.termData || '';
    this._decoder = new TextDecoder();
    this._wirelisteners(gen);

    let opened = false;
    this._resizeObserver = new ResizeObserver(() => {
      if (this._sessionGeneration !== gen) return;
      if (!this.fitAddon || !this.term) return;

      if (!opened) {
        opened = true;
        if (this._resizeObserver) this._resizeObserver.disconnect();
        term.open(container);
        this._enablewebgl(term);
        if (cached.termData) term.write(cached.termData);
        this.fitAddon.fit();
        term.focus();
        if (this.sshId !== null) {
          window.electronAPI.sshresize(this.sshId, this.term.cols, this.term.rows);
        }

        this._resizeObserver = new ResizeObserver(() => {
          if (!this.fitAddon || !this.term) return;
          this.fitAddon.fit();
          if (this.sshId !== null) {
            window.electronAPI.sshresize(this.sshId, this.term.cols, this.term.rows);
          }
        });
        this._resizeObserver.observe(container);
        return;
      }

      this.fitAddon.fit();
      if (this.sshId !== null) {
        window.electronAPI.sshresize(this.sshId, this.term.cols, this.term.rows);
      }
    });
    this._resizeObserver.observe(container);
  },

  async checkcachedconnection(cached) {
    if (!cached || cached.sshId === null || cached.sshId === undefined) {
      this.showreconnect(cached?.reason || 'Connection timed-out');
      return;
    }
    try {
      const active = await window.electronAPI.sshsessionstatus(cached.sshId);
      if (active || !this.server || this.sshId !== cached.sshId) return;
      this.connected = false;
      this.sshId = null;
      this._cache[this._cachekey(this.server)] = { ...cached, sshId: null, connected: false, disconnected: true, reason: 'Connection timed-out' };
      this.showreconnect('Connection timed-out');
    } catch (e) {
      this.showreconnect('Connection timed-out');
    }
  },

  showreconnect(reason) {
    const container = Utils.el('vpsConsoleWrap');
    if (!container) return;
    let panel = Utils.el('vpsConsoleReconnect');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'vpsConsoleReconnect';
      panel.className = 'vps-console-reconnect';
      container.appendChild(panel);
    }
    panel.innerHTML = `<div>${Utils.escape(reason || 'Connection timed-out')}</div><button class="btn btn-primary btn-sm" onclick="VPSConsole.reconnect()">Reconnect</button>`;
    panel.style.display = 'flex';
  },

  hidereconnect() {
    const panel = Utils.el('vpsConsoleReconnect');
    if (panel) panel.remove();
  },

  async reconnect() {
    if (!this.server) return;
    this.hidereconnect();
    if (this.term) this.term.writeln('\r\n\x1b[36mReconnecting...\x1b[0m');
    this.sshId = null;
    this.connected = false;
    await this.connect();
  },

  detach() {
    if (this.server && this.sshId !== null) {
      this._cache[this._cachekey(this.server)] = {
        sshId: this.sshId,
        connected: this.connected,
        termData: this._termDataCache
      };
      this._cleanupdom();
      this.sshId = null;
      this.server = null;
      this.connected = false;
      return true;
    }
    return false;
  },

  async connect() {
    if (!this.server) return;

    if (this.sshId !== null) {
      try { await window.electronAPI.sshdisconnect(this.sshId); } catch (e) {}
      this.sshId = null;
      this.connected = false;
    }
    const gen = this._sessionGeneration;

    const config = {
      host: this.server.host,
      port: this.server.port || 22,
      username: this.server.username || 'root',
      cols: this.term ? this.term.cols : 80,
      rows: this.term ? this.term.rows : 24
    };

    if (this.server.authType === 'key') {
      const pk = await Servers.resolvevpsprivatekey(this.server);
      if (pk) {
        config.authType = 'privateKey';
        config.privateKey = pk;
      }
    }
    if (!config.authType) {
      config.authType = 'password';
      config.password = this.server.password || '';
    }

    if (this.term) this.term.writeln('\x1b[36mConnecting to ' + this.server.host + '...\x1b[0m');

    try {
      const sshId = await window.electronAPI.sshconnect(config);
      if (this._sessionGeneration !== gen) {
        if (sshId !== null && sshId !== undefined) {
          try { await window.electronAPI.sshdisconnect(sshId); } catch (e) {}
        }
        return;
      }
      if (sshId === null || sshId === undefined) {
        if (this.term) this.term.writeln('\x1b[31mConnection failed: no session ID returned.\x1b[0m');
        return;
      }
      this.sshId = sshId;
      this.connected = true;
      this.hidereconnect();
      this._cache[this._cachekey(this.server)] = { sshId, connected: true, termData: this._termDataCache };
      window.electronAPI.sshready(this.sshId);
      if (this.fitAddon && this.term) {
        this.fitAddon.fit();
        window.electronAPI.sshresize(this.sshId, this.term.cols, this.term.rows);
      }
    } catch (e) {
      if (this._sessionGeneration !== gen) return;
      const msg = typeof e === 'string' ? e : (e && e.message) ? e.message : String(e);
      if (this.term) {
        if (msg.includes('authentication') || msg.includes('AUTH') || msg.includes('auth')) {
          this.term.writeln('\x1b[31mAuthentication failed. Check your username and password/key.\x1b[0m');
        } else {
          this.term.writeln('\x1b[31mConnection failed: ' + msg + '\x1b[0m');
        }
      }
      this.showreconnect(/timed out|timeout/i.test(msg) ? 'Connection timed-out' : 'Connection failed: ' + msg);
    }
  },

  _getosicon(server) {
    const os = (server.os || '').toLowerCase();
    const osMap = [
      ['debian', 'debian'], ['ubuntu', 'ubuntu'], ['centos', 'centos'],
      ['rocky', 'rockylinux'], ['almalinux', 'almalinux'], ['alpine', 'alpine'],
      ['arch', 'arch'], ['gentoo', 'gentoo'], ['fedora', 'fedora'],
      ['mint', 'mint'], ['rhel', 'rhel'], ['red hat', 'rhel'],
    ];
    for (const [key, file] of osMap) {
      if (os.includes(key)) return `<img src="assets/${file}.png" alt="${file}" />`;
    }
    return `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>`;
  },

  renderinfocard(server) {
    const card = Utils.el('vpsInfoCard');
    const iconEl = Utils.el('vpsInfoIcon');
    const nameEl = Utils.el('vpsInfoName');
    const sshBtn = Utils.el('vpsInfoSSH');
    const scpBtn = Utils.el('vpsInfoSCP');

    if (!card) return;
    card.style.display = '';

    if (iconEl) iconEl.innerHTML = this._getosicon(server);
    if (nameEl) nameEl.textContent = server.name || 'VPS';

    if (sshBtn) {
      sshBtn.onclick = () => Servers.openssh(Servers.list.indexOf(server));
    }
    if (scpBtn) {
      scpBtn.onclick = () => Servers.openscpmodal(Servers.list.indexOf(server));
    }
  },

  async destroy() {
    const oldId = this.sshId;
    this._cleanupdom();
    this.sshId = null;
    this.server = null;
    this.connected = false;
    this._termDataCache = '';
    this._sessionGeneration++;
    if (oldId !== null) {
      try { await window.electronAPI.sshdisconnect(oldId); } catch (e) {}
    }
  }
};
