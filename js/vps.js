const VPSConsole = {
  term: null,
  fitaddon: null,
  sshid: null,
  server: null,
  connected: false,
  _dataListener: null,
  _closeListener: null,
  _resizeObserver: null,

  init(server) {
    this.destroy();
    this.server = server;
    this.connected = false;

    const container = Utils.el('vpsconsolewrap');
    container.innerHTML = '';

    this.term = new Terminal({
      theme: {
        background: Theme.getcurrent() === 'dark' ? '#0a0a0a' : '#ffffff',
        foreground: Theme.getcurrent() === 'dark' ? '#e0e0e0' : '#1a1a1a',
        cursor: Theme.getcurrent() === 'dark' ? '#ffffff' : '#000000',
        cursoraccent: Theme.getcurrent() === 'dark' ? '#0a0a0a' : '#ffffff',
        selectionbackground: Theme.getcurrent() === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)',
        black: '#000000',
        red: '#e06060',
        green: '#60d060',
        yellow: '#d0b050',
        blue: '#60a0e0',
        magenta: '#d060d0',
        cyan: '#50c0c0',
        white: '#d0d0d0',
        brightblack: '#666666',
        brightred: '#ff7070',
        brightgreen: '#70ff70',
        brightyellow: '#ffe070',
        brightblue: '#70b0ff',
        brightmagenta: '#ff70ff',
        brightcyan: '#70ffff',
        brightwhite: '#ffffff'
      },
      fontfamily: 'Cascadia Code, Fira Code, JetBrains Mono, monospace',
      fontsize: 14,
      lineheight: 1.2,
      cursorblink: true,
      scrollback: 10000
    });

    this.fitaddon = new FitAddon.FitAddon();
    this.term.loadaddon(this.fitaddon);
    this.term.open(container);

    setTimeout(() => {
      this.fitaddon.fit();
      this.connect();
    }, 100);

    this.term.ondata((data) => {
      if (this.connected && this.sshid !== null) {
        window.electronapi.sshdata(this.sshid, data);
      }
    });

    this.term.onresize(({ cols, rows }) => {
      if (this.sshid !== null) {
        window.electronapi.sshresize(this.sshid, cols, rows);
      }
    });

    this._resizeObserver = new ResizeObserver(() => {
      if (this.fitaddon && this.term) {
        this.fitaddon.fit();
      }
    });
    this._resizeObserver.observe(container);

    this._dataListener = (id, data) => {
      if (id !== this.sshid) return;
      this.term.write(data);
    };
    window.electronapi.onsshdata(this._dataListener);

    this._closeListener = (id) => {
      if (id !== this.sshid) return;
      this.connected = false;
      this.sshid = null;
      this.term.writeln('\r\n\x1b[33mConnection closed.\x1b[0m');
    };
    window.electronapi.onsshclose(this._closeListener);

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

    if (this.server.authtype === 'key' && this.server.privatekey) {
      config.authtype = 'privatekey';
      config.privatekey = this.server.privatekey;
    } else {
      config.authtype = 'password';
      config.password = this.server.password || '';
    }

    this.term.writeln('\x1b[36mConnecting to ' + this.server.host + '...\x1b[0m');

    try {
      this.sshid = await window.electronapi.sshconnect(config);
      this.connected = true;
      this.term.clear();
      this.fitaddon.fit();
      window.electronapi.sshresize(this.sshid, this.term.cols, this.term.rows);
    } catch (e) {
      this.term.writeln('\x1b[31mConnection failed: ' + (e.message || e) + '\x1b[0m');
    }
  },

  destroy() {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    if (this._dataListener) {
      window.electronapi.offsshdata(this._dataListener);
      this._dataListener = null;
    }
    if (this._closeListener) {
      window.electronapi.offsshclose(this._closeListener);
      this._closeListener = null;
    }
    if (this.sshid !== null) {
      window.electronapi.sshdisconnect(this.sshid);
      this.sshid = null;
    }
    if (this.term) {
      this.term.dispose();
      this.term = null;
    }
    this.fitaddon = null;
    this.connected = false;
    this.server = null;

    const container = Utils.el('vpsconsolewrap');
    if (container) container.innerHTML = '';
  }
};
