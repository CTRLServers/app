const PluginLoader = {
  plugins: [],
  STORAGE_KEY: 'ctrlservers_plugins',
  _pluginDir: null,

  async init() {
    try {
      this._pluginDir = await window.electronAPI.plugindir();
    } catch (e) {
      this._pluginDir = null;
    }
    this.loadstate();
    await this.discover();
    await this.loadallenabled();
    this.render();
  },

  loadstate() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      this._state = raw ? JSON.parse(raw) : {};
    } catch (e) {
      this._state = {};
    }
  },

  savestate() {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this._state));
  },

  async discover() {
    this.plugins = [];
    try {
      const list = await window.electronAPI.pluginlist();
      for (const folder of list) {
        try {
          const manifest = await window.electronAPI.pluginreadmanifest(folder);
          if (!manifest || !manifest.id) continue;
          const enabled = this._state[manifest.id] !== undefined ? this._state[manifest.id] : false;
          this.plugins.push({
            id: manifest.id,
            name: manifest.name || manifest.id,
            version: manifest.version || '1.0.0',
            description: manifest.description || '',
            author: manifest.author || '',
            permissions: manifest.permissions || [],
            entry: manifest.entry || 'index.js',
            folder,
            enabled,
            _loaded: false,
            _module: null
          });
        } catch (e) {
          console.error('Plugin load error:', folder, e);
        }
      }
    } catch (e) {
      console.error('Plugin discovery error:', e);
    }
  },

  isenabled(id) {
    return this._state[id] !== undefined ? this._state[id] : false;
  },

  toggle(id) {
    const plugin = this.plugins.find(p => p.id === id);
    if (!plugin) return;
    plugin.enabled = !plugin.enabled;
    this._state[id] = plugin.enabled;
    this.savestate();
    if (plugin.enabled) {
      this.loadplugin(plugin);
    } else {
      this.unloadplugin(plugin);
    }
    this.render();
  },

  async loadplugin(plugin) {
    if (plugin._loaded) return;
    try {
      const code = await window.electronAPI.pluginreadentry(plugin.folder, plugin.entry);
      if (!code) return;
      const fn = new Function('CTRLPlugin', 'Servers', 'App', 'Api', 'Utils', 'Modal', code);
      fn(CTRLPlugin, Servers, App, Api, Utils, Modal);
      plugin._loaded = true;
    } catch (e) {
      console.error('Plugin exec error:', plugin.id, e);
    }
  },

  unloadplugin(plugin) {
    plugin._loaded = false;
    plugin._module = null;
    CTRLPlugin._removepluginpages(plugin.id);
  },

  async loadallenabled() {
    for (const plugin of this.plugins) {
      if (plugin.enabled) {
        await this.loadplugin(plugin);
      }
    }
  },

  openfolder() {
    if (this._pluginDir) {
      window.electronAPI.openexternal(this._pluginDir);
    }
  },

  render() {
    const container = Utils.el('tabPluginsGlobal');
    if (!container) return;

    const betaBanner = `
      <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:10px;padding:14px 18px;margin-bottom:20px;">
        <div style="display:flex;align-items:flex-start;gap:10px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px;">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <div style="font-size:13px;color:#fca5a5;line-height:1.5;">
            <strong style="color:#ef4444;">ATTENTION!</strong> Plugins is in <strong>BETA</strong> currently. There is a LOT of bugs in plugins. If you want to report a bug, please email us: <a href="mailto:support@ctrlservers.xyz" style="color:#f87171;text-decoration:underline;">support@ctrlservers.xyz</a><br/>
            Plugins can also be <strong>DANGEROUS!</strong> PLEASE CHECK THE SOURCE CODE OF PLUGIN BEFORE INSTALLING IT.
          </div>
        </div>
      </div>`;

    if (!this.plugins.length) {
      container.innerHTML = betaBanner + `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;gap:16px;">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
          </svg>
          <h3 style="margin:0;font-size:18px;font-weight:600;color:var(--text-primary)">No plugins installed</h3>
          <p style="margin:0;font-size:14px;color:var(--text-muted);max-width:400px;">
            Place plugin folders in the plugins directory to extend functionality.
          </p>
          <button class="btn btn-primary" onclick="PluginLoader.openfolder()" style="margin-top:8px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            Open Plugins Folder
          </button>
        </div>`;
      return;
    }

    let html = betaBanner + `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <div>
          <h2 style="margin:0;font-size:20px;font-weight:600;color:var(--text-primary);">Installed Plugins</h2>
          <p style="margin:4px 0 0;font-size:13px;color:var(--text-muted);">${this.plugins.length} plugin(s) &middot; ${this.plugins.filter(p => p.enabled).length} enabled</p>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-secondary btn-sm" onclick="PluginLoader.refresh()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            Refresh
          </button>
          <button class="btn btn-primary btn-sm" onclick="PluginLoader.openfolder()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            Open Folder
          </button>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px;">`;

    for (const plugin of this.plugins) {
      const perms = plugin.permissions.length
        ? plugin.permissions.map(p => `<span style="background:var(--bg-tertiary);color:var(--text-secondary);padding:2px 8px;border-radius:4px;font-size:11px;">${p}</span>`).join(' ')
        : '<span style="color:var(--text-muted);font-size:12px;">No special permissions</span>';

      html += `
        <div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:12px;padding:16px 20px;display:flex;align-items:center;gap:16px;${plugin.enabled ? '' : 'opacity:0.6;'}">
          <div style="width:44px;height:44px;border-radius:10px;background:var(--bg-tertiary);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${plugin.enabled ? 'var(--accent)' : 'var(--text-muted)'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
            </svg>
          </div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-weight:600;font-size:15px;color:var(--text-primary);">${Utils.escape(plugin.name)}</span>
              <span style="font-size:12px;color:var(--text-muted);">v${Utils.escape(plugin.version)}</span>
            </div>
            <div style="font-size:13px;color:var(--text-secondary);margin-top:2px;">${Utils.escape(plugin.description)}</div>
            <div style="display:flex;align-items:center;gap:6px;margin-top:6px;">
              <span style="font-size:12px;color:var(--text-muted);">by ${Utils.escape(plugin.author)}</span>
              <span style="color:var(--text-muted);">&middot;</span>
              ${perms}
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:12px;flex-shrink:0;">
            <label style="position:relative;display:inline-block;width:44px;height:24px;cursor:pointer;">
              <input type="checkbox" ${plugin.enabled ? 'checked' : ''} onchange="PluginLoader.toggle('${Utils.escape(plugin.id)}')" style="opacity:0;width:0;height:0;" />
              <span style="position:absolute;inset:0;background:${plugin.enabled ? 'var(--accent)' : 'var(--bg-tertiary)'};border-radius:12px;transition:0.2s;"></span>
              <span style="position:absolute;top:3px;left:${plugin.enabled ? '23px' : '3px'};width:18px;height:18px;background:white;border-radius:50%;transition:0.2s;"></span>
            </label>
          </div>
        </div>`;
    }

    html += '</div>';
    container.innerHTML = html;
  },

  async refresh() {
    await this.discover();
    await this.loadallenabled();
    this.render();
  }
};
