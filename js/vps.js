const VPSConsole = {
  term: null,
  fitAddon: null,
  sshId: null,
  server: null,
  connected: false,
  _datalistenerid: null,
  _closelistenerid: null,
  _resizeObserver: null,
  _ondata: null,

  init(server) {
    this.destroy();
    this.server = server;
    this.connected = false;

    const container = Utils.el('vpsConsoleWrap');
    container.innerHTML = '';

    this.term = new Terminal({
      theme: this._getxtermtheme(),
      fontFamily: 'Cascadia Code, Fira Code, JetBrains Mono, monospace',
      fontSize: 14,
      lineHeight: 1.2,
      cursorBlink: true,
      scrollback: 10000
    });

    this.fitAddon = new FitAddon.FitAddon();
    this.term.loadAddon(this.fitAddon);
    this.term.open(container);

    setTimeout(() => {
      this.fitAddon.fit();
      this.connect();
    }, 100);

    this._ondata = this.term.onData((data) => {
      if (this.connected && this.sshId !== null) {
        window.electronAPI.sshdata(this.sshId, data);
      }
    });

    this._datalistenerid = window.electronAPI.onsshdata((id, data) => {
      if (id !== this.sshId) return;
      this.term.write(data);
    });

    this._closelistenerid = window.electronAPI.onsshclose((id) => {
      if (id !== this.sshId) return;
      this.connected = false;
      this.sshId = null;
      this.term.writeln('\r\n\x1b[33mConnection closed.\x1b[0m');
    });

    this._keydownhandler = (e) => {
      if (e.ctrlKey && e.key === 'c') {
        const sel = this.term.getSelection();
        if (sel && sel.length > 0) {
          e.preventDefault();
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
    container.addEventListener('keydown', this._keydownhandler);

    this.term.focus();
  },

  async connect() {
    if (!this.server) return;

    const config = {
      host: this.server.host,
      port: this.server.port || 22,
      username: this.server.username || 'root',
      cols: this.term.cols,
      rows: this.term.rows
    };

    if (this.server.authType === 'key' && this.server.privateKey) {
      config.authType = 'privateKey';
      config.privateKey = this.server.privateKey;
    } else {
      config.authType = 'password';
      config.password = this.server.password || '';
    }

    this.term.writeln('\x1b[36mConnecting to ' + this.server.host + '...\x1b[0m');

    try {
      this.sshId = await window.electronAPI.sshconnect(config);
      this.connected = true;
      this.term.clear();
      this.fitAddon.fit();
      window.electronAPI.sshresize(this.sshId, this.term.cols, this.term.rows);
    } catch (e) {
      this.term.writeln('\x1b[31mConnection failed: ' + (e.message || e) + '\x1b[0m');
    }
  },

  destroy() {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    if (this._ondata) {
      this._ondata.dispose();
      this._ondata = null;
    }
    if (this._datalistenerid !== null) {
      window.electronAPI.offsshdata(this._datalistenerid);
      this._datalistenerid = null;
    }
    if (this._closelistenerid !== null) {
      window.electronAPI.offsshclose(this._closelistenerid);
      this._closelistenerid = null;
    }
    if (this._keydownhandler) {
      const container = Utils.el('vpsConsoleWrap');
      if (container) container.removeEventListener('keydown', this._keydownhandler);
      this._keydownhandler = null;
    }
    if (this.sshId !== null) {
      window.electronAPI.sshdisconnect(this.sshId);
      this.sshId = null;
    }
    if (this.term) {
      this.term.dispose();
      this.term = null;
    }
    this.fitAddon = null;
    this.connected = false;
    this.server = null;

    const container = Utils.el('vpsConsoleWrap');
    if (container) container.innerHTML = '';
  },

  _getxtermtheme() {
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
      },
    };
    return Object.assign(themes[t] || themes.dark, {
      black: '#000000',
      red: '#e06060',
      green: '#60d060',
      yellow: '#d0b050',
      blue: '#60a0e0',
      magenta: '#d060d0',
      cyan: '#50c0c0',
      white: '#d0d0d0',
      brightBlack: '#666666',
      brightRed: '#ff7070',
      brightGreen: '#70ff70',
      brightYellow: '#ffe070',
      brightBlue: '#70b0ff',
      brightMagenta: '#ff70ff',
      brightCyan: '#70ffff',
      brightWhite: '#ffffff'
    });
  }
};
