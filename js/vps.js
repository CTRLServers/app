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
  _pendingInput: '',
  _inputFlushScheduled: false,
  _localEchoPending: '',
  _cache: {},
  _sessionGeneration: 0,
  _connectTimer: null,

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
        this._queueinput(data, gen);
      }
    });

    this._datalistenerid = window.electronAPI.onsshdata((id, data) => {
      if (this._sessionGeneration !== gen) return;
      if (id !== this.sshId) return;
      if (!this.term) return;
      const text = typeof data === 'string' ? data : this._decoder.decode(data, { stream: true });
      const visibleText = this._consumeLocalecho(text);
      if (visibleText) {
        this.term.write(visibleText);
        this._termDataCache += visibleText;
      }
    });

    this._closelistenerid = window.electronAPI.onsshclose((id) => {
      if (this._sessionGeneration !== gen) return;
      if (id !== this.sshId) return;
      this.connected = false;
      this.sshId = null;
      if (this.term) this.term.writeln('\r\n\x1b[33mConnection closed.\x1b[0m');
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
            this._queueinput(text, gen);
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
    if (this.term) { this.term.dispose(); this.term = null; }
    this.fitAddon = null;
    this.webglAddon = null;
    this._pendingInput = '';
    this._inputFlushScheduled = false;
    this._localEchoPending = '';
    const container = Utils.el('vpsConsoleWrap');
    if (container) container.innerHTML = '';
  },

  init(server) {
    const cached = this._cache[server.host];
    if (cached) {
      this.server = server;
      this.sshId = cached.sshId;
      this.connected = cached.connected;
      this._recreateterm(cached);
      return;
    }
    this.destroy();
    this.server = server;
    this.connected = false;
    this._termDataCache = '';
    this._decoder = new TextDecoder();
    this._localEchoPending = '';

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
    this._localEchoPending = '';

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

  detach() {
    if (this.server && this.sshId !== null) {
      this._cache[this.server.host] = {
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
    }
  },

  _queueinput(data, gen) {
    if (/^[\x20-\x7e]+$/.test(data) && this.term) {
      this.term.write(data);
      this._termDataCache += data;
      this._localEchoPending += data;
    }
    this._pendingInput += data;
    if (this._inputFlushScheduled) return;
    this._inputFlushScheduled = true;
    queueMicrotask(() => {
      const input = this._pendingInput;
      this._pendingInput = '';
      this._inputFlushScheduled = false;
      if (input && this._sessionGeneration === gen && this.connected && this.sshId !== null) {
        window.electronAPI.sshdata(this.sshId, input);
      }
    });
  },

  _consumeLocalecho(data) {
    if (!data || !this._localEchoPending) return data;
    let offset = 0;
    while (offset < data.length && this._localEchoPending) {
      if (data[offset] !== this._localEchoPending[0]) {
        this._localEchoPending = '';
        return data;
      }
      offset++;
      this._localEchoPending = this._localEchoPending.slice(1);
    }
    return data.slice(offset);
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
