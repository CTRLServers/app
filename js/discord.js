const DiscordRPC = {
  _connected: false,
  _serverName: null,
  _retrying: false,

  async init() {
    AppSettings.load();
    this.applysettings();
  },

  async applysettings() {
    const enabled = AppSettings.get('discordrpc');
    if (enabled) {
      this.connect();
    } else {
      this.disconnect();
    }
  },

  async connect() {
    if (this._connected) return;
    if (!window.electronAPI || !window.electronAPI.discordrpcconnect) return;
    try {
      const ok = await window.electronAPI.discordrpcconnect();
      if (ok === true) {
        this._connected = true;
        this._retrying = false;
        this.setactivity();
      } else if (!this._retrying) {
        this._retrying = true;
        this._startretry();
      }
    } catch (e) {
      this._connected = false;
      if (!this._retrying) {
        this._retrying = true;
        this._startretry();
      }
    }
  },

  _startretry() {
    let attempt = 0;
    const maxdelay = 30000;
    const retry = () => {
      if (this._connected || !AppSettings.get('discordrpc')) {
        this._retrying = false;
        return;
      }
      attempt++;
      const delay = Math.min(2000 * attempt, maxdelay);
      setTimeout(async () => {
        if (this._connected || !AppSettings.get('discordrpc')) {
          this._retrying = false;
          return;
        }
        try {
          const ok = await window.electronAPI.discordrpcconnect();
          if (ok === true) {
            this._connected = true;
            this._retrying = false;
            this.setactivity();
            return;
          }
        } catch (e) {}
        retry();
      }, delay);
    };
    retry();
  },

  async disconnect() {
    this._retrying = false;
    if (!this._connected) return;
    if (!window.electronAPI || !window.electronAPI.discordrpcdisconnect) return;
    try {
      await window.electronAPI.discordrpcdisconnect();
    } catch (e) {}
    this._connected = false;
  },

  setactivity(serverName) {
    if (!this._connected) return;
    if (!window.electronAPI || !window.electronAPI.discordrpcsetactivity) return;

    const showserver = AppSettings.get('discordshowserver');

    let details = 'Managing servers';
    if (showserver && serverName) {
      details = 'Managing: ' + serverName;
    }

    const activity = {
      details: details,
      state: 'CTRLServers Desktop',
      largeImageKey: 'logo1024',
      largeImageText: 'CTRLServers',
    };

    window.electronAPI.discordrpcsetactivity(activity);
  },
  updateserver(serverName) {
    this._serverName = serverName;
    this.setactivity(serverName);
  },

  clearservers() {
    this._serverName = null;
    this.setactivity();
  }
};
