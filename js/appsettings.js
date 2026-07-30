const AppSettings = {
  STORAGE_KEY: 'ctrl_app_settings',
  PASSCODE_HASH_KEY: 'ctrl_passcode_hash',
  PASSCODE_SALT_KEY: 'ctrl_passcode_salt',
  PASSCODE_ENABLED_KEY: 'ctrl_passcode_enabled',
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

  getalertrules() {
    return this.get('monitorAlerts') || [];
  },

  savealertrules(rules) {
    this.set('monitorAlerts', rules);
  },

  addalertrule(rule) {
    const rules = this.getalertrules();
    rule.id = 'alert_' + Date.now();
    rule.enabled = true;
    rules.push(rule);
    this.savealertrules(rules);
    return rule;
  },

  removealertrule(id) {
    const rules = this.getalertrules().filter(r => r.id !== id);
    this.savealertrules(rules);
  },

  togglealertrule(id) {
    const rules = this.getalertrules();
    const rule = rules.find(r => r.id === id);
    if (rule) {
      rule.enabled = !rule.enabled;
      this.savealertrules(rules);
    }
  },

  async hashpasscode(passcode, salt) {
    const enc = new TextEncoder();
    const data = enc.encode(salt + passcode);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  },

  generatesalt() {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  },

  ispasscodeenabled() {
    return localStorage.getItem(this.PASSCODE_ENABLED_KEY) === 'true';
  },

  async setpasscode(passcode) {
    const salt = this.generatesalt();
    const hash = await this.hashpasscode(passcode, salt);
    localStorage.setItem(this.PASSCODE_HASH_KEY, hash);
    localStorage.setItem(this.PASSCODE_SALT_KEY, salt);
    localStorage.setItem(this.PASSCODE_ENABLED_KEY, 'true');
  },

  async verifypasscode(passcode) {
    const hash = localStorage.getItem(this.PASSCODE_HASH_KEY);
    const salt = localStorage.getItem(this.PASSCODE_SALT_KEY);
    if (!hash || !salt) return false;
    const inputHash = await this.hashpasscode(passcode, salt);
    return inputHash === hash;
  },

  removepasscode() {
    localStorage.removeItem(this.PASSCODE_HASH_KEY);
    localStorage.removeItem(this.PASSCODE_SALT_KEY);
    localStorage.setItem(this.PASSCODE_ENABLED_KEY, 'false');
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
    const passcodeEnabled = this.ispasscodeenabled();

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
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            <h3>Security</h3>
          </div>
          <div class="settings-body">
            <div class="settings-row">
              <div class="settings-row-info">
                <div class="settings-row-label">Passcode Lock</div>
                <div class="settings-row-desc">Require a passcode to unlock the app on startup</div>
              </div>
              <button class="settings-toggle ${passcodeEnabled ? 'active' : ''}" onclick="AppSettings.togglepasscode()">
                <span class="settings-toggle-knob"></span>
              </button>
            </div>
            <div id="passcodeSection" style="display:${passcodeEnabled ? '' : 'none'}">
              <div class="settings-field">
                <label>${passcodeEnabled ? 'Change Passcode' : 'Set Passcode'}</label>
                <input type="password" class="settings-input" id="passcodeInput" placeholder="Enter passcode" autocomplete="off" />
                <input type="password" class="settings-input" id="passcodeConfirm" placeholder="Confirm passcode" autocomplete="off" style="margin-top:8px" />
                <p class="settings-note">Use a passcode you can remember. It is stored securely as a SHA-256 hash.</p>
              </div>
              <div class="settings-row">
                <button class="btn btn-primary btn-sm" onclick="AppSettings.savepasscode()">Save Passcode</button>
                ${passcodeEnabled ? '<button class="btn btn-danger btn-sm" onclick="AppSettings.disablepasscode()">Remove Passcode</button>' : ''}
              </div>
              <div id="passcodeError" style="display:none" class="settings-error"></div>
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
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            <h3>Debug Info</h3>
          </div>
          <div class="settings-body">
            <div class="debug-info-grid">
              <div class="debug-info-row">
                <span class="debug-info-label">OS</span>
                <span class="debug-info-val">${window.electronAPI?.getplatform?.() || navigator.platform}</span>
              </div>
              <div class="debug-info-row">
                <span class="debug-info-label">App Version</span>
                <span class="debug-info-val">${window.electronAPI?.getappversion?.() || '1.0.5'}</span>
              </div>
              <div class="debug-info-row">
                <span class="debug-info-label">Electron</span>
                <span class="debug-info-val">${window.electronAPI?.getelectronversion?.() || 'N/A'} (bundled)</span>
              </div>
              <div class="debug-info-row">
                <span class="debug-info-label">Chrome</span>
                <span class="debug-info-val">${window.electronAPI?.getchromeversion?.() || 'N/A'} (bundled)</span>
              </div>
              <div class="debug-info-row">
                <span class="debug-info-label">Node.js</span>
                <span class="debug-info-val">${window.electronAPI?.getnodeversion?.() || 'N/A'} (bundled)</span>
              </div>
              <div class="debug-info-separator"></div>
              <div class="debug-info-row">
                <span class="debug-info-label">Servers</span>
                <span class="debug-info-val">${(Servers.list || []).length} added</span>
              </div>
              <div class="debug-info-row">
                <span class="debug-info-label">Keychains</span>
                <span class="debug-info-val">${(ServerKeychain?.list || []).length} saved</span>
              </div>
              <div class="debug-info-row">
                <span class="debug-info-label">Storage Used</span>
                <span class="debug-info-val">${Math.round((JSON.stringify(localStorage).length / 1024) * 10) / 10} KB</span>
              </div>
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

        <div class="settings-card" id="monitorCard">
          <div class="settings-card-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
            <h3>Server Monitor</h3>
          </div>
          <div class="settings-body" id="monitorBody"></div>
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

    this.loadmonitor();
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
  },

  togglepasscode() {
    const enabled = this.ispasscodeenabled();
    if (enabled) {
      this.disablepasscode();
    } else {
      const section = Utils.el('passcodeSection');
      if (section) {
        if (section.style.display === 'none') {
          section.style.display = '';
        } else {
          section.style.display = 'none';
        }
      }
    }
  },

  async savepasscode() {
    const input = Utils.el('passcodeInput');
    const confirm = Utils.el('passcodeConfirm');
    const error = Utils.el('passcodeError');
    if (!input || !confirm) return;

    const pass = input.value.trim();
    const conf = confirm.value.trim();

    if (error) { error.style.display = 'none'; error.textContent = ''; }

    if (!pass || pass.length < 4) {
      if (error) { error.style.display = ''; error.textContent = 'Passcode must be at least 4 characters.'; }
      return;
    }
    if (pass !== conf) {
      if (error) { error.style.display = ''; error.textContent = 'Passcodes do not match.'; }
      return;
    }

    await this.setpasscode(pass);
    input.value = '';
    confirm.value = '';
    this.render();
    Modal.show('Passcode Saved', '<p style="color:var(--text-secondary);font-size:14px;margin:0;">Passcode has been set. You will be prompted on next launch.</p>');
  },

  disablepasscode() {
    Modal.confirm('Remove Passcode', 'Are you sure you want to remove the passcode lock?', () => {
      this.removepasscode();
      this.render();
    });
  },

  async checkonstartup() {
    if (!this.ispasscodeenabled()) return true;
    return new Promise((resolve) => {
      LockScreen.show(resolve);
    });
  },

  async loadmonitor() {
    const body = Utils.el('monitorBody');
    if (!body) return;
    const status = await window.electronAPI?.monitorstatus?.();
    const running = status?.running || false;
    const pid = status?.pid || null;
    const tick = status?.tick || 10;
    const serverCount = status?.serverCount || 0;

    body.innerHTML = `
      <div class="settings-row">
        <div class="settings-row-info">
          <div class="settings-row-label">Enable Server Monitor</div>
          <div class="settings-row-desc">Background process that checks Pterodactyl and VPS server status and notifies on offline/online changes</div>
        </div>
        <button class="settings-toggle ${running ? 'active' : ''}" onclick="AppSettings.togglemonitor()">
          <span class="settings-toggle-knob"></span>
        </button>
      </div>
      <div class="monitor-warning">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <span>Warning! It can affect your network. Each server is checked periodically via API/TCP, generating continuous traffic.</span>
      </div>
      <div id="monitorDetails" style="display:${running ? '' : 'none'}">
        <div class="settings-field">
          <label>Check interval</label>
          <select class="settings-input" id="monitorInterval" onchange="AppSettings.setmonitorinterval(this.value)">
            <option value="10" ${tick === 10 ? 'selected' : ''}>10 seconds</option>
            <option value="15" ${tick === 15 ? 'selected' : ''}>15 seconds</option>
            <option value="20" ${tick === 20 ? 'selected' : ''}>20 seconds</option>
            <option value="25" ${tick === 25 ? 'selected' : ''}>25 seconds</option>
            <option value="30" ${tick === 30 ? 'selected' : ''}>30 seconds</option>
          </select>
          <p class="settings-note">How often to check each server's status.</p>
        </div>
        <div class="monitor-status-row">
          <div class="monitor-status-item">
            <span class="monitor-status-lbl">Status</span>
            <span class="monitor-status-val monitor-running">Running</span>
          </div>
          <div class="monitor-status-item">
            <span class="monitor-status-lbl">PID</span>
            <span class="monitor-status-val">${pid || 'N/A'}</span>
          </div>
          <div class="monitor-status-item">
            <span class="monitor-status-lbl">Servers</span>
            <span class="monitor-status-val">${serverCount}</span>
          </div>
          <button class="btn btn-danger btn-sm" onclick="AppSettings.stopmonitor()">Kill Process</button>
        </div>
      </div>
      <div class="settings-separator"></div>
      <div class="settings-row-label" style="margin-bottom:8px">Alert Rules</div>
      <p class="settings-note" style="margin-bottom:12px">Notify when server stats exceed thresholds. Alerts apply to all monitored servers.</p>
      <div id="alertRulesList">${this._renderalertrules()}</div>
      <button class="btn btn-sm" style="margin-top:8px" onclick="AppSettings.showaddalertrule()">+ Add Rule</button>
      <div id="addAlertRuleForm" style="display:none;margin-top:12px">
        <div class="settings-field">
          <label>Metric</label>
          <select class="settings-input" id="alertMetric">
            <option value="cpu">CPU Usage (%)</option>
            <option value="ram">RAM Usage (%)</option>
            <option value="disk">Disk Usage (%)</option>
          </select>
        </div>
        <div class="settings-field">
          <label>Threshold (%)</label>
          <input type="number" class="settings-input" id="alertThreshold" min="1" max="100" value="90">
        </div>
        <div class="settings-field">
          <label>Duration (minutes, 0 = instant)</label>
          <input type="number" class="settings-input" id="alertDuration" min="0" max="1440" value="5">
        </div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn btn-sm" onclick="AppSettings.savealertrule()">Save</button>
          <button class="btn btn-secondary btn-sm" onclick="AppSettings.hideaddalertrule()">Cancel</button>
        </div>
      </div>`;
  },

  _renderalertrules() {
    const rules = this.getalertrules();
    if (!rules.length) return '<p class="settings-note">No alert rules configured.</p>';
    const metrics = { cpu: 'CPU', ram: 'RAM', disk: 'Disk' };
    return rules.map(r => `
      <div class="alert-rule-item">
        <span class="alert-rule-toggle ${r.enabled ? 'active' : ''}" onclick="AppSettings.togglealertrule('${r.id}');AppSettings.loadmonitor()">
          <span class="settings-toggle-knob"></span>
        </span>
        <span class="alert-rule-text">${metrics[r.metric] || r.metric} &gt; ${r.threshold}%${r.duration ? ' for ' + r.duration + ' min' : ''}</span>
        <button class="alert-rule-remove" onclick="AppSettings.removealertrule('${r.id}');AppSettings.loadmonitor()">&times;</button>
      </div>`).join('');
  },

  showaddalertrule() {
    Utils.el('addAlertRuleForm').style.display = '';
    Utils.el('alertRulesList').style.display = 'none';
  },

  hideaddalertrule() {
    Utils.el('addAlertRuleForm').style.display = 'none';
    Utils.el('alertRulesList').style.display = '';
  },

  savealertrule() {
    const metric = Utils.el('alertMetric')?.value;
    const threshold = parseInt(Utils.el('alertThreshold')?.value) || 90;
    const duration = parseInt(Utils.el('alertDuration')?.value) || 0;
    this.addalertrule({ metric, threshold: Math.min(100, Math.max(1, threshold)), duration: Math.min(1440, Math.max(0, duration)) });
    this.hideaddalertrule();
    this.loadmonitor();
  },

  async togglemonitor() {
    const status = await window.electronAPI?.monitorstatus?.();
    if (status?.running) {
      await this.stopmonitor();
    } else {
      await this.startmonitor();
    }
    this.loadmonitor();
  },

  async startmonitor() {
    const servers = (Servers.list || []).filter(s => {
      if (s.type === 'Pterodactyl') return s.panelUrl && s.apiKey && s.uuid;
      if (s.type === 'VPS/VDS') return s.host && s.port;
      return false;
    }).map(s => ({
      id: s.id,
      name: s.name,
      type: s.type,
      host: s.host,
      port: s.port,
      panelUrl: s.panelUrl,
      apiKey: s.apiKey,
      uuid: s.uuid,
    }));
    if (!servers.length) {
      Modal.alert('No Servers', 'Add at least one server to monitor.');
      return;
    }
    const tick = parseInt(Utils.el('monitorInterval')?.value) || 10;
    const alerts = this.getalertrules();
    await window.electronAPI?.monitorstart?.(servers, tick, alerts);
  },

  async stopmonitor() {
    await window.electronAPI?.monitorstop?.();
    this.loadmonitor();
  },

  async setmonitorinterval(val) {
    await this.startmonitor();
  }
};
