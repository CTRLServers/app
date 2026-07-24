const AppSettings = {
  STORAGE_KEY: 'ctrl_app_settings',
  _defaults: {
    theme: 'dark',
    pollInterval: 10,
    discordrpc: false,
    discordshowserver: true,
  },

  load() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      const saved = raw ? JSON.parse(raw) : {};
      this._data = Object.assign({}, this._defaults, saved);
    } catch (e) {
      this._data = Object.assign({}, this._defaults);
    }
  },

  save() {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this._data));
  },

  get(key) {
    if (!this._data) this.load();
    return this._data[key];
  },

  set(key, value) {
    if (!this._data) this.load();
    this._data[key] = value;
    this.save();
  },

  applypollinterval() {
    App.startpolling();
  },

  opendevtools() {
    if (window.electronAPI && window.electronAPI.toggledevtools) {
      window.electronAPI.toggledevtools();
    }
  },

  async clearcache() {
    try {
      localStorage.removeItem('ctrl_servers');
      localStorage.removeItem('ctrl_keychain');
      localStorage.removeItem('ctrlservers_sftp');
      this.render();
      Modal.show('Cache Cleared', '<p style="color:var(--text-secondary);font-size:14px;margin:0;">Server data and connections have been cleared.</p>');
    } catch (e) {}
  },

  render() {
    const container = Utils.el('tabappsettings');
    if (!container) return;
    const theme = this.get('theme');
    const poll = this.get('pollInterval');
    const rpc = this.get('discordrpc');
    const showserver = this.get('discordshowserver');

    container.innerHTML = `
      <div class="settings-content">
        <div class="settings-card">
          <div class="settings-card-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            <h3>Appearance</h3>
          </div>
          <div class="settings-body">
            <div class="settings-field">
              <label>Theme</label>
              <div class="settings-theme-group">
                <button class="settings-theme-btn ${theme === 'light' ? 'active' : ''}" onclick="AppSettings.settheme('light')">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/></svg>
                  Light
                </button>
                <button class="settings-theme-btn ${theme === 'dark' ? 'active' : ''}" onclick="AppSettings.settheme('dark')">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                  Dark
                </button>
                <button class="settings-theme-btn ${theme === 'oled' ? 'active' : ''}" onclick="AppSettings.settheme('oled')">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="12" r="3"/></svg>
                  OLED
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="settings-card">
          <div class="settings-card-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <h3>Polling</h3>
          </div>
          <div class="settings-body">
            <div class="settings-field">
              <label>Dashboard refresh interval</label>
              <select class="settings-input" id="appPollInterval" onchange="AppSettings.setpollinterval(this.value)">
                <option value="5" ${poll === 5 ? 'selected' : ''}>5 seconds</option>
                <option value="10" ${poll === 10 ? 'selected' : ''}>10 seconds</option>
                <option value="15" ${poll === 15 ? 'selected' : ''}>15 seconds</option>
                <option value="30" ${poll === 30 ? 'selected' : ''}>30 seconds</option>
                <option value="60" ${poll === 60 ? 'selected' : ''}>60 seconds</option>
              </select>
              <p class="settings-note">How often to refresh server resources on the dashboard.</p>
            </div>
          </div>
        </div>

        <div class="settings-card">
          <div class="settings-card-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            <h3>Developer</h3>
          </div>
          <div class="settings-body">
            <div class="settings-row">
              <div class="settings-row-info">
                <div class="settings-row-label">Developer Tools</div>
                <div class="settings-row-desc">This will open Devtools. It can be used to debug bugs or anything else.</div>
              </div>
              <button class="btn btn-primary btn-sm" onclick="AppSettings.opendevtools()">Open</button>
            </div>
          </div>
        </div>

        <div class="settings-card">
          <div class="settings-card-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <h3>Discord Rich Presence</h3>
          </div>
          <div class="settings-body">
            <div class="settings-row">
              <div class="settings-row-info">
                <div class="settings-row-label">Enable Discord RPC</div>
                <div class="settings-row-desc">Show CTRLServers status in Discord</div>
              </div>
              <button class="settings-toggle ${rpc ? 'active' : ''}" onclick="AppSettings.togglediscordrpc()">
                <span class="settings-toggle-knob"></span>
              </button>
            </div>
            ${rpc ? `
            <div class="settings-row">
              <div class="settings-row-info">
                <div class="settings-row-label">Show current server</div>
                <div class="settings-row-desc">Display which server you are managing</div>
              </div>
              <button class="settings-toggle ${showserver ? 'active' : ''}" onclick="AppSettings.togglediscordshowserver()">
                <span class="settings-toggle-knob"></span>
              </button>
            </div>
            ` : ''}
          </div>
        </div>

        <div class="settings-card">
          <div class="settings-card-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            <h3>Data</h3>
          </div>
          <div class="settings-body">
            <div class="settings-row">
              <div class="settings-row-info">
                <div class="settings-row-label">Clear server data</div>
                <div class="settings-row-desc">Remove saved servers, keys, and SFTP connections</div>
              </div>
              <button class="btn btn-danger btn-sm" onclick="AppSettings.clearcache()">Clear</button>
            </div>
          </div>
        </div>
      </div>`;
  },

  settheme(theme) {
    this.set('theme', theme);
    Theme.settheme(theme);
    this.render();
  },

  setpollinterval(val) {
    this.set('pollInterval', parseInt(val));
    this.applypollinterval();
  },

  togglediscordrpc() {
    const val = this.get('discordrpc');
    this.set('discordrpc', !val);
    DiscordRPC.applysettings();
    this.render();
  },

  togglediscordshowserver() {
    const val = this.get('discordshowserver');
    this.set('discordshowserver', !val);
    DiscordRPC.setactivity(DiscordRPC._serverName);
    this.render();
  }
};
