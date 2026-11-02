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
    this.updatelockbutton();
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

  updatelockbutton() {
    const button = Utils.el('lockAppBtn');
    if (button) button.style.display = this.ispasscodeenabled() ? '' : 'none';
  },

  async setpasscode(passcode) {
    const salt = this.generatesalt();
    const hash = await this.hashpasscode(passcode, salt);
    localStorage.setItem(this.PASSCODE_HASH_KEY, hash);
    localStorage.setItem(this.PASSCODE_SALT_KEY, salt);
    localStorage.setItem(this.PASSCODE_ENABLED_KEY, 'true');
    this.updatelockbutton();
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
    this.updatelockbutton();
  },

  opendevtools() {
    if (window.electronAPI && window.electronAPI.toggledevtools) {
      window.electronAPI.toggledevtools();
    }
  },

  async clearcache() {
    try {
      localStorage.removeItem('ctrl_servers');
      localStorage.removeItem(ServerKeychain.STORAGE_KEY);
      localStorage.removeItem('ctrlservers_sftp');
      await window.electronAPI.securestoreclear();
      ServerKeychain.keys = [];
      this.render();
      Modal.alert(t('settings.data.cleared'), `<span style="color:var(--text-secondary);">${t('settings.data.cleared.text')}</span>`);
    } catch (e) {}
  },

  setcurrentlang() {
    return I18n.getlang();
  },

  setlanguage(code) {
    if (!I18n.available.some(l => l.code === code)) return;
    if (code === I18n.getlang()) return;
    I18n.setLang(code);
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
            <h3>${t('settings.appearance.title')}</h3>
          </div>
          <div class="settings-body">
            <div class="settings-field">
              <label>${t('settings.theme')}</label>
              <div class="settings-theme-group">
                <button class="settings-theme-btn ${theme === 'light' ? 'active' : ''}" onclick="AppSettings.settheme('light')">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/></svg>
                  ${t('settings.light')}
                </button>
                <button class="settings-theme-btn ${theme === 'dark' ? 'active' : ''}" onclick="AppSettings.settheme('dark')">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                  ${t('settings.dark')}
                </button>
                <button class="settings-theme-btn ${theme === 'oled' ? 'active' : ''}" onclick="AppSettings.settheme('oled')">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="12" r="3"/></svg>
                  ${t('settings.oled')}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="settings-card" id="languageSettingsCard">
          <div class="settings-card-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            <h3>${t('settings.language.title')}</h3>
          </div>
          <div class="settings-body">
            <div class="settings-field">
              <label>${t('settings.language.label')}</label>
              <select class="settings-input" id="appLanguage" onchange="AppSettings.setlanguage(this.value)">
                ${I18n.available.map(l => `<option value="${l.code}" ${I18n.getlang() === l.code ? 'selected' : ''}>${l.name}</option>`).join('')}
              </select>
              <p class="settings-note">${t('settings.language.note')}</p>
            </div>
          </div>
        </div>

        <div class="settings-card" id="mcpSettingsCard">
          <div class="settings-card-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 9h8M8 15h8"/><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4V2M17 4V2"/></svg>
            <h3>MCP Server</h3>
          </div>
          <div class="settings-body" id="mcpSettingsBody">
            <div class="mcp-loading"><span class="spinner-sm"></span> ${t('settings.mcp.loading')}</div>
          </div>
        </div>

        <div class="settings-card">
          <div class="settings-card-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <h3>${t('settings.polling.title')}</h3>
          </div>
          <div class="settings-body">
            <div class="settings-field">
              <label>${t('settings.polling.label')}</label>
              <select class="settings-input" id="appPollInterval" onchange="AppSettings.setpollinterval(this.value)">
                <option value="5" ${poll === 5 ? 'selected' : ''}>${t('settings.secs', { n: 5 })}</option>
                <option value="10" ${poll === 10 ? 'selected' : ''}>${t('settings.secs', { n: 10 })}</option>
                <option value="15" ${poll === 15 ? 'selected' : ''}>${t('settings.secs', { n: 15 })}</option>
                <option value="30" ${poll === 30 ? 'selected' : ''}>${t('settings.secs', { n: 30 })}</option>
                <option value="60" ${poll === 60 ? 'selected' : ''}>${t('settings.secs', { n: 60 })}</option>
              </select>
              <p class="settings-note">${t('settings.polling.note')}</p>
            </div>
          </div>
        </div>

        <div class="settings-card">
          <div class="settings-card-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            <h3>${t('settings.security.title')}</h3>
          </div>
          <div class="settings-body">
            <div class="settings-row">
              <div class="settings-row-info">
                <div class="settings-row-label">${t('settings.passcode.title')}</div>
                <div class="settings-row-desc">${t('settings.passcode.desc')}</div>
              </div>
              <button class="settings-toggle ${passcodeEnabled ? 'active' : ''}" onclick="AppSettings.togglepasscode()">
                <span class="settings-toggle-knob"></span>
              </button>
            </div>
            <div id="passcodeSection" style="display:${passcodeEnabled ? '' : 'none'}">
              <div class="settings-field">
                <label>${passcodeEnabled ? t('settings.passcode.change') : t('settings.passcode.set')}</label>
                <input type="password" class="settings-input" id="passcodeInput" placeholder="${t('settings.passcode.enter')}" autocomplete="off" />
                <input type="password" class="settings-input" id="passcodeConfirm" placeholder="${t('settings.passcode.confirm')}" autocomplete="off" style="margin-top:8px" />
                <p class="settings-note">${t('settings.passcode.note')}</p>
              </div>
              <div class="settings-row">
                <button class="btn btn-primary btn-sm" onclick="AppSettings.savepasscode()">${t('settings.passcode.save')}</button>
                ${passcodeEnabled ? `<button class="btn btn-danger btn-sm" onclick="AppSettings.disablepasscode()">${t('settings.passcode.remove')}</button>` : ''}
              </div>
              <div id="passcodeError" style="display:none" class="settings-error"></div>
            </div>
          </div>
        </div>

        <div class="settings-card">
          <div class="settings-card-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
            <h3>${t('settings.hostkeys.title')}</h3>
          </div>
          <div class="settings-body" id="hostKeysBody">
            <div class="mcp-loading"><span class="spinner-sm"></span> ${t('settings.hostkeys.loading')}</div>
          </div>
        </div>

        <div class="settings-card">
          <div class="settings-card-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            <h3>${t('settings.developer.title')}</h3>
          </div>
          <div class="settings-body">
            <div class="settings-row">
              <div class="settings-row-info">
                <div class="settings-row-label">${t('settings.dev.title')}</div>
                <div class="settings-row-desc">${t('settings.dev.desc')}</div>
              </div>
              <button class="btn btn-primary btn-sm" onclick="AppSettings.opendevtools()">${t('settings.dev.open')}</button>
            </div>
          </div>
        </div>

        <div class="settings-card">
          <div class="settings-card-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            <h3>${t('settings.debug.title')}</h3>
          </div>
          <div class="settings-body">
            <div class="debug-info-grid">
              <div class="debug-info-row">
                <span class="debug-info-label">${t('settings.debug.os')}</span>
                <span class="debug-info-val">${window.electronAPI?.getplatform?.() || navigator.platform}</span>
              </div>
              <div class="debug-info-row">
                <span class="debug-info-label">${t('settings.debug.appversion')}</span>
                <span class="debug-info-val">${window.electronAPI?.getappversion?.() || '1.0.5'}</span>
              </div>
              <div class="debug-info-row">
                <span class="debug-info-label">Electron</span>
                <span class="debug-info-val">${window.electronAPI?.getelectronversion?.() || 'N/A'} ${t('settings.debug.bundled')}</span>
              </div>
              <div class="debug-info-row">
                <span class="debug-info-label">Chrome</span>
                <span class="debug-info-val">${window.electronAPI?.getchromeversion?.() || 'N/A'} ${t('settings.debug.bundled')}</span>
              </div>
              <div class="debug-info-row">
                <span class="debug-info-label">Node.js</span>
                <span class="debug-info-val">${window.electronAPI?.getnodeversion?.() || 'N/A'} ${t('settings.debug.bundled')}</span>
              </div>
              <div class="debug-info-separator"></div>
              <div class="debug-info-row">
                <span class="debug-info-label">${t('settings.debug.servers')}</span>
                <span class="debug-info-val">${t('settings.debug.added', { n: (Servers.list || []).length })}</span>
              </div>
              <div class="debug-info-row">
                <span class="debug-info-label">${t('settings.debug.keychains')}</span>
                <span class="debug-info-val">${t('settings.debug.saved', { n: (ServerKeychain?.keys || []).length })}</span>
              </div>
              <div class="debug-info-row">
                <span class="debug-info-label">${t('settings.debug.storageused')}</span>
                <span class="debug-info-val">${Math.round((JSON.stringify(localStorage).length / 1024) * 10) / 10} KB</span>
              </div>
            </div>
          </div>
        </div>

        <div class="settings-card">
          <div class="settings-card-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <h3>${t('settings.discord.title')}</h3>
          </div>
          <div class="settings-body">
            <div class="settings-row">
              <div class="settings-row-info">
                <div class="settings-row-label">${t('settings.discord.enable')}</div>
                <div class="settings-row-desc">${t('settings.discord.enable.desc')}</div>
              </div>
              <button class="settings-toggle ${rpc ? 'active' : ''}" onclick="AppSettings.togglediscordrpc()">
                <span class="settings-toggle-knob"></span>
              </button>
            </div>
            ${rpc ? `
            <div class="settings-row">
              <div class="settings-row-info">
                <div class="settings-row-label">${t('settings.discord.showserver')}</div>
                <div class="settings-row-desc">${t('settings.discord.showserver.desc')}</div>
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
            <h3>${t('settings.monitor.title')}</h3>
          </div>
          <div class="settings-body" id="monitorBody"></div>
        </div>

        <div class="settings-card">
          <div class="settings-card-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            <h3>${t('settings.data.title')}</h3>
          </div>
          <div class="settings-body">
            <div class="settings-row">
              <div class="settings-row-info">
                <div class="settings-row-label">${t('settings.data.clear')}</div>
                <div class="settings-row-desc">${t('settings.data.clear.desc')}</div>
              </div>
              <button class="btn btn-danger btn-sm" onclick="AppSettings.clearcache()">${t('settings.data.clear.btn')}</button>
            </div>
          </div>
        </div>
      </div>`;

    this.loadmonitor();
    this.loadmcp();
    this.loadhostkeys();
  },

  async loadhostkeys() {
    const body = Utils.el('hostKeysBody');
    if (!body) return;
    try {
      const keys = (await window.electronAPI?.hostkeyslist?.()) || [];
      const rows = keys.map(key => `
        <div class="settings-row">
          <div class="settings-row-info">
            <div class="settings-row-label" style="font-family:monospace;word-break:break-all;">
              ${Utils.escape(key.host)}${key.port && key.port !== 22 ? ':' + Utils.escape(String(key.port)) : ''} · ${Utils.escape(key.keyType)}${key.revoked ? ` · <span style="color:#ef4444;">${t('settings.hostkeys.revoked')}</span>` : ''}
            </div>
            <div class="settings-row-desc" style="font-family:monospace;word-break:break-all;">${Utils.escape(key.fingerprint)}</div>
          </div>
          <button class="btn btn-danger btn-sm" data-host-key-id="${Utils.escape(key.id)}" onclick="AppSettings.removehostkey(this.dataset.hostKeyId)">${t('settings.hostkeys.forget')}</button>
        </div>`).join('');
      body.innerHTML = `
        <div class="settings-row">
          <div class="settings-row-info">
            <div class="settings-row-label">${t('settings.hostkeys.trusted')}</div>
            <div class="settings-row-desc">${t('settings.hostkeys.trusted.desc', { n: keys.length })}</div>
          </div>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-secondary btn-sm" onclick="AppSettings.importknownhosts()">${t('settings.hostkeys.import')}</button>
            ${keys.length ? `<button class="btn btn-danger btn-sm" onclick="AppSettings.clearhostkeys()">${t('settings.hostkeys.clearall')}</button>` : ''}
          </div>
        </div>
        ${rows || `<p class="settings-note">${t('settings.hostkeys.none')}</p>`}`;
    } catch (error) {
      body.innerHTML = `<div class="settings-error">${Utils.escape(error?.message || String(error))}</div>`;
    }
  },

  async importknownhosts() {
    try {
      const result = await window.electronAPI?.hostkeysimport?.();
      if (!result) return;
      Modal.alert(t('settings.hostkeys.importdone'), t('settings.hostkeys.importdone.text', { added: result.added, updated: result.updated, skipped: result.skipped }));
      this.loadhostkeys();
    } catch (error) {
      Modal.alert(t('settings.hostkeys.importfailed'), Utils.escape(error?.message || String(error)));
    }
  },

  async removehostkey(id) {
    if (!id) return;
    try { await window.electronAPI?.hostkeysremove?.(id); } catch (error) {}
    this.loadhostkeys();
  },

  async clearhostkeys() {
    try { await window.electronAPI?.hostkeysclear?.(); } catch (error) {}
    this.loadhostkeys();
  },

  async loadmcp() {
    try {
      const status = await window.electronAPI?.mcpgetstatus?.();
      MCP.status = status;
      this.rendermcp(status);
    } catch (error) {
      const body = Utils.el('mcpSettingsBody');
      if (body) body.innerHTML = `<div class="settings-error">${Utils.escape(error?.message || String(error))}</div>`;
    }
  },

  rendermcp(status) {
    const body = Utils.el('mcpSettingsBody');
    if (!body || !status) return;
    const stateclass = status.running ? 'running' : status.error ? 'error' : 'stopped';
    const statetext = status.running ? t('settings.mcp.running') : status.error ? t('settings.mcp.error') : t('settings.mcp.stopped');
    if (!status.enabled) {
      body.innerHTML = `
        <div class="settings-row mcp-main-toggle">
          <div class="settings-row-info">
            <div class="settings-row-label">${t('settings.mcp.enable')}</div>
            <div class="settings-row-desc">${t('settings.mcp.enable.desc')}</div>
          </div>
          <button class="settings-toggle" onclick="MCP.toggleserver()" aria-label="Enable MCP Server"><span class="settings-toggle-knob"></span></button>
        </div>`;
      return;
    }

    const groups = {};
    for (const definition of status.permissiondefinitions || []) {
      if (!groups[definition.group]) groups[definition.group] = [];
      groups[definition.group].push(definition);
    }
    const permissionshtml = Object.entries(groups).map(([group, definitions]) => `
      <div class="mcp-permission-group">
        <div class="mcp-permission-heading">${Utils.escape(group)}</div>
        ${definitions.map(definition => {
          const mode = status.permissions?.[definition.id] || 'deny';
          return `<div class="mcp-permission-row">
            <div class="mcp-permission-info">
              <div class="mcp-permission-label">${Utils.escape(definition.label)}</div>
              <div class="mcp-permission-description">${Utils.escape(definition.description)}</div>
            </div>
            <select class="mcp-permission-select mode-${mode}" onchange="MCP.setpermission('${Utils.escape(definition.id)}', this.value)" aria-label="${Utils.escape(definition.label)} permission">
              <option value="allow" ${mode === 'allow' ? 'selected' : ''}>${t('settings.mcp.allow')}</option>
              <option value="ask" ${mode === 'ask' ? 'selected' : ''}>${t('settings.mcp.ask')}</option>
              <option value="deny" ${mode === 'deny' ? 'selected' : ''}>${t('settings.mcp.deny')}</option>
            </select>
          </div>`;
        }).join('')}
      </div>`).join('');

    const activity = (status.activity || []).slice(0, 12);
    const activityhtml = activity.length ? activity.map(item => `
      <div class="mcp-activity-row">
        <span class="mcp-activity-result ${item.success ? 'success' : 'failed'}"></span>
        <span class="mcp-activity-tool">${Utils.escape(item.tool || '')}</span>
        <span class="mcp-activity-permission">${Utils.escape(item.permission || '')}</span>
        <span class="mcp-activity-time">${Utils.escape(new Date(item.time).toLocaleTimeString())}</span>
      </div>`).join('') : `<div class="mcp-empty-activity">${t('settings.mcp.noactivity')}</div>`;

    body.innerHTML = `
      <div class="settings-row mcp-main-toggle">
        <div class="settings-row-info">
          <div class="settings-row-label">${t('settings.mcp.enable')}</div>
          <div class="settings-row-desc"><span class="mcp-state ${stateclass}"></span>${statetext}${status.locked ? t('settings.mcp.locked') : ''}</div>
        </div>
        <button class="settings-toggle active" onclick="MCP.toggleserver()" aria-label="Disable MCP Server"><span class="settings-toggle-knob"></span></button>
      </div>
      ${status.error ? `<div class="settings-error mcp-server-error">${Utils.escape(status.error)}</div>` : ''}
      <div class="mcp-credentials">
        <div class="mcp-section-title">${t('settings.mcp.connection')}</div>
        <div class="settings-field">
          <label>${t('settings.mcp.endpoint')}</label>
          <div class="mcp-copy-line"><input class="settings-input" readonly value="${Utils.escape(status.endpoint)}"><button class="btn-icon" onclick="MCP.copyendpoint()" title="${t('settings.mcp.copyendpoint')}" aria-label="${t('settings.mcp.copyendpoint')}"><span class="mcp-copy-symbol">&#10697;</span></button></div>
        </div>
        <div class="settings-field">
          <label>${t('settings.mcp.token')}</label>
          <div class="mcp-copy-line"><input class="settings-input" readonly type="${MCP._showtoken ? 'text' : 'password'}" value="${Utils.escape(status.token)}"><button class="btn-icon" onclick="MCP.toggletoken()" title="${MCP._showtoken ? t('settings.mcp.hide') : t('settings.mcp.show')} token" aria-label="${MCP._showtoken ? t('settings.mcp.hide') : t('settings.mcp.show')} token"><span class="mcp-eye-symbol">${MCP._showtoken ? '&#9673;' : '&#9678;'}</span></button><button class="btn-icon" onclick="MCP.copytoken()" title="${t('settings.mcp.copytoken')}" aria-label="${t('settings.mcp.copytoken')}"><span class="mcp-copy-symbol">&#10697;</span></button></div>
        </div>
        <div class="mcp-connection-actions">
          <button class="btn btn-secondary btn-sm" onclick="MCP.copygenericconfig()">${t('settings.mcp.copyconfig')}</button>
          <button class="btn btn-secondary btn-sm" onclick="MCP.confirmregenerate()">${t('settings.mcp.regenerate')}</button>
        </div>
        <p class="settings-note">${t('settings.mcp.note')}</p>
      </div>
      <div class="mcp-permissions">
        <div class="mcp-section-bar"><div class="mcp-section-title">${t('settings.mcp.permissions')}</div><div class="mcp-bulk-actions"><button class="btn btn-secondary btn-sm" onclick="MCP.setallpermissions('allow')">${t('settings.mcp.allowall')}</button><button class="btn btn-secondary btn-sm" onclick="MCP.setallpermissions('ask')">${t('settings.mcp.askall')}</button><button class="btn btn-secondary btn-sm" onclick="MCP.setallpermissions('deny')">${t('settings.mcp.denyall')}</button></div></div>
        <div class="mcp-permission-warning">${t('settings.mcp.warning')}</div>
        ${permissionshtml}
      </div>
      <div class="mcp-activity">
        <div class="mcp-section-bar"><div class="mcp-section-title">${t('settings.mcp.activity')}</div><button class="btn btn-secondary btn-sm" onclick="MCP.clearactivity()">${t('settings.data.clear.btn')}</button></div>
        <div class="mcp-activity-list">${activityhtml}</div>
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
      if (error) { error.style.display = ''; error.textContent = t('settings.passcode.error.min'); }
      return;
    }
    if (pass !== conf) {
      if (error) { error.style.display = ''; error.textContent = t('settings.passcode.error.match'); }
      return;
    }

    await this.setpasscode(pass);
    input.value = '';
    confirm.value = '';
    this.render();
    Modal.alert(t('settings.passcode.saved'), `<span style="color:var(--text-secondary);">${t('settings.passcode.saved.text')}</span>`);
  },

  disablepasscode() {
    Modal.confirm(t('settings.passcode.remove'), t('settings.passcode.remove.confirm'), () => {
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
          <div class="settings-row-label">${t('settings.monitor.enable')}</div>
          <div class="settings-row-desc">${t('settings.monitor.desc')}</div>
        </div>
        <button class="settings-toggle ${running ? 'active' : ''}" onclick="AppSettings.togglemonitor()">
          <span class="settings-toggle-knob"></span>
        </button>
      </div>
      <div class="monitor-warning">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <span>${t('settings.monitor.warning')}</span>
      </div>
      <div id="monitorDetails" style="display:${running ? '' : 'none'}">
        <div class="settings-field">
          <label>${t('settings.monitor.interval')}</label>
          <select class="settings-input" id="monitorInterval" onchange="AppSettings.setmonitorinterval(this.value)">
            <option value="10" ${tick === 10 ? 'selected' : ''}>${t('settings.secs', { n: 10 })}</option>
            <option value="15" ${tick === 15 ? 'selected' : ''}>${t('settings.secs', { n: 15 })}</option>
            <option value="20" ${tick === 20 ? 'selected' : ''}>${t('settings.secs', { n: 20 })}</option>
            <option value="25" ${tick === 25 ? 'selected' : ''}>${t('settings.secs', { n: 25 })}</option>
            <option value="30" ${tick === 30 ? 'selected' : ''}>${t('settings.secs', { n: 30 })}</option>
          </select>
          <p class="settings-note">${t('settings.monitor.interval.note')}</p>
        </div>
        <div class="monitor-status-row">
          <div class="monitor-status-item">
            <span class="monitor-status-lbl">${t('settings.monitor.status')}</span>
            <span class="monitor-status-val monitor-running">${t('status.running')}</span>
          </div>
          <div class="monitor-status-item">
            <span class="monitor-status-lbl">${t('settings.monitor.pid')}</span>
            <span class="monitor-status-val">${pid || 'N/A'}</span>
          </div>
          <div class="monitor-status-item">
            <span class="monitor-status-lbl">${t('settings.monitor.servers')}</span>
            <span class="monitor-status-val">${serverCount}</span>
          </div>
          <button class="btn btn-danger btn-sm" onclick="AppSettings.stopmonitor()">${t('settings.monitor.kill')}</button>
        </div>
      </div>
      <div class="settings-separator"></div>
      <div class="settings-row-label" style="margin-bottom:8px">${t('settings.monitor.rules')}</div>
      <p class="settings-note" style="margin-bottom:12px">${t('settings.monitor.rules.note')}</p>
      <div id="alertRulesList">${this._renderalertrules()}</div>
      <button class="btn btn-sm" style="margin-top:8px" onclick="AppSettings.showaddalertrule()">${t('settings.monitor.addrule')}</button>
      <div id="addAlertRuleForm" style="display:none;margin-top:12px">
        <div class="settings-field">
          <label>${t('settings.monitor.metric')}</label>
          <select class="settings-input" id="alertMetric">
            <option value="cpu">${t('settings.monitor.metric.cpu')}</option>
            <option value="ram">${t('settings.monitor.metric.ram')}</option>
            <option value="disk">${t('settings.monitor.metric.disk')}</option>
          </select>
        </div>
        <div class="settings-field">
          <label>${t('settings.monitor.threshold')}</label>
          <input type="number" class="settings-input" id="alertThreshold" min="1" max="100" value="90">
        </div>
        <div class="settings-field">
          <label>${t('settings.monitor.duration')}</label>
          <input type="number" class="settings-input" id="alertDuration" min="0" max="1440" value="5">
        </div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn btn-sm" onclick="AppSettings.savealertrule()">${t('settings.save')}</button>
          <button class="btn btn-secondary btn-sm" onclick="AppSettings.hideaddalertrule()">${t('dashboard.cancel')}</button>
        </div>
      </div>`;
  },

  _renderalertrules() {
    const rules = this.getalertrules();
    if (!rules.length) return `<p class="settings-note">${t('settings.monitor.norules')}</p>`;
    const metrics = { cpu: 'CPU', ram: 'RAM', disk: 'Disk' };
    return rules.map(r => `
      <div class="alert-rule-item">
        <span class="alert-rule-toggle ${r.enabled ? 'active' : ''}" onclick="AppSettings.togglealertrule('${r.id}');AppSettings.loadmonitor()">
          <span class="settings-toggle-knob"></span>
        </span>
        <span class="alert-rule-text">${metrics[r.metric] || r.metric} &gt; ${r.threshold}%${r.duration ? t('settings.monitor.for', { n: r.duration }) : ''}</span>
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
    });
    const resolved = [];
    for (const s of servers) {
      const entry = {
        id: s.id,
        name: s.name,
        type: s.type,
        host: s.host,
        port: s.port,
        panelUrl: s.panelUrl,
        secretId: s.secretId,
        uuid: s.uuid,
      };
      if (s.type === 'VPS/VDS') {
        entry.username = s.username || 'root';
        entry.authType = s.authType;
        entry.keySecretId = s.keySecretId;
      }
      resolved.push(entry);
    }
    if (!resolved.length) {
      Modal.alert(t('settings.monitor.noservers'), t('settings.monitor.noservers.text'));
      return;
    }
    const tick = parseInt(Utils.el('monitorInterval')?.value) || 10;
    const alerts = this.getalertrules();
    await window.electronAPI?.monitorstart?.(resolved, tick, alerts);
  },

  async stopmonitor() {
    await window.electronAPI?.monitorstop?.();
    this.loadmonitor();
  },

  async setmonitorinterval(val) {
    await this.startmonitor();
  }
};
