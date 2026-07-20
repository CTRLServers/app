const VPSConsole = {
  term: null,
  fitAddon: null,
  sshId: null,
  server: null,
  connected: false,
  _datalistener: null,
  _closelistener: null,
  _resizeObserver: null,

  init(server) {
    this.destroy();
    this.server = server;
    this.connected = false;

    const container = Utils.el('vpsConsoleWrap');
    container.innerHTML = '';

    this.term = new Terminal({
      theme: {
        background: Theme.getcurrent() === 'dark' ? '#0a0a0a' : '#ffffff',
        foreground: Theme.getcurrent() === 'dark' ? '#e0e0e0' : '#1a1a1a',
        cursor: Theme.getcurrent() === 'dark' ? '#ffffff' : '#000000',
        cursorAccent: Theme.getcurrent() === 'dark' ? '#0a0a0a' : '#ffffff',
        selectionBackground: Theme.getcurrent() === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)',
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
      },
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

    this.term.onData((data) => {
      if (this.connected && this.sshId !== null) {
        window.electronAPI.sshdata(this.sshId, data);
      }
    });

    this.term.onResize(({ cols, rows }) => {
      if (this.sshId !== null) {
        window.electronAPI.sshresize(this.sshId, cols, rows);
      }
    });

    this._resizeObserver = new ResizeObserver(() => {
      if (this.fitAddon && this.term) {
        this.fitAddon.fit();
      }
    });
    this._resizeObserver.observe(container);

    this._datalistener = (id, data) => {
      if (id !== this.sshId) return;
      this.term.write(data);
    };
    window.electronAPI.onsshdata(this._datalistener);

    this._closelistener = (id) => {
      if (id !== this.sshId) return;
      this.connected = false;
      this.sshId = null;
      this.term.writeln('\r\n\x1b[33mConnection closed.\x1b[0m');
    };
    window.electronAPI.onsshclose(this._closelistener);

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
    if (this._datalistener) {
      window.electronAPI.offsshdata(this._datalistener);
      this._datalistener = null;
    }
    if (this._closelistener) {
      window.electronAPI.offsshclose(this._closelistener);
      this._closelistener = null;
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
  }
};
