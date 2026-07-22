const ModrinthBrowser = {
  _configs: {},
  _searchtimers: {},
  _currentquery: {},
  _selectedversion: {},
  _versionsloaded: false,
  VERSIONS: [],

  registercfg(cfg) {
    this._configs[cfg.key] = cfg;
  },

  getcfg(key) {
    return this._configs[key];
  },

  async loadversions() {
    if (this._versionsloaded) return;
    try {
      const res = await fetch('https://api.modrinth.com/v2/tag/game_version', { headers: { 'User-Agent': 'CTRLServers/1.0 (contact@ctrlservers.xyz)' } });
      if (!res.ok) return;
      const data = await res.json();
      const releases = data.filter(v => v.version_type === 'release');
      this.VERSIONS = releases.map(v => v.version);
      this._versionsloaded = true;
    } catch (e) {}
  },

  populatselect(selectid) {
    const sel = Utils.el(selectid);
    if (!sel) return;
    sel.innerHTML = '<option value="">All versions</option>';
    this.VERSIONS.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      sel.appendChild(opt);
    });
  },

  init(cfg) {
    this.registercfg(cfg);
    const input = Utils.el(cfg.inputid);
    const versel = Utils.el(cfg.versionid);

    if (input && !input._bound) {
      input._bound = true;
      input.addEventListener('input', () => {
        clearTimeout(this._searchtimers[cfg.key]);
        this._searchtimers[cfg.key] = setTimeout(() => {
          this._currentquery[cfg.key] = input.value.trim();
          if (this._currentquery[cfg.key].length >= 2) {
            this.search(cfg, this._currentquery[cfg.key]);
          }
        }, 300);
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          clearTimeout(this._searchtimers[cfg.key]);
          this._currentquery[cfg.key] = input.value.trim();
          this.search(cfg, this._currentquery[cfg.key]);
        }
      });
    }

    if (versel && !versel._bound) {
      versel._bound = true;
      versel.addEventListener('change', () => {
        this._selectedversion[cfg.key] = versel.value;
        const q = this._currentquery[cfg.key] || '';
        if (q.length >= 2) {
          this.search(cfg, q);
        } else {
          this.loadpopular(cfg);
        }
      });
    }

    if (!this._versionsloaded) {
      this.loadversions().then(() => this.populatselect(cfg.versionid));
    } else {
      this.populatselect(cfg.versionid);
    }
  },

  async loadpopular(cfg) {
    const grid = Utils.el(cfg.gridid);
    const empty = Utils.el(cfg.emptyid);
    const status = Utils.el(cfg.statusid);
    if (!grid) return;

    grid.style.display = 'grid';
    if (empty) empty.style.display = 'none';
    if (status) status.textContent = 'Loading popular ' + cfg.label + '...';

    try {
      const data = await this.apisearch(cfg, '', 'downloads');
      if (status) status.textContent = 'Popular ' + cfg.label;
      this.rendergrid(cfg, data.hits);
    } catch (e) {
      if (status) status.textContent = 'Failed to load: ' + e.message;
      grid.style.display = 'none';
      if (empty) { empty.style.display = 'flex'; empty.innerHTML = this.emptyhtml('Failed to load'); }
    }
  },

  async search(cfg, query) {
    const grid = Utils.el(cfg.gridid);
    const empty = Utils.el(cfg.emptyid);
    const status = Utils.el(cfg.statusid);
    if (!grid) return;

    if (!query) {
      this.loadpopular(cfg);
      return;
    }

    grid.style.display = 'grid';
    if (empty) empty.style.display = 'none';
    if (status) status.textContent = 'Searching...';

    try {
      const data = await this.apisearch(cfg, query, 'relevance');
      if (status) status.textContent = data.hits.length + ' result(s) found';
      this.rendergrid(cfg, data.hits);
    } catch (e) {
      if (status) status.textContent = 'Search failed: ' + e.message;
      grid.style.display = 'none';
      if (empty) { empty.style.display = 'flex'; empty.innerHTML = this.emptyhtml('Search failed'); }
    }
  },

  rendergrid(cfg, hits) {
    const grid = Utils.el(cfg.gridid);
    const empty = Utils.el(cfg.emptyid);
    if (!grid) return;

    if (!hits || hits.length === 0) {
      grid.style.display = 'none';
      if (empty) { empty.style.display = 'flex'; empty.innerHTML = this.emptyhtml('No ' + cfg.label + ' found'); }
      return;
    }

    grid.style.display = 'grid';
    if (empty) empty.style.display = 'none';

    grid.innerHTML = hits.map(hit => {
      const iconurl = hit.icon_url || '';
      const categories = (hit.categories || []).slice(0, 3).map(c =>
        '<span class="plugin-tag">' + Utils.escape(c) + '</span>'
      ).join('');

      return '<div class="plugin-card" onclick="ModrinthBrowser.showdetail(\'' + cfg.key + '\', \'' + hit.slug + '\')">' +
        '<div class="plugin-card-header">' +
          (iconurl
            ? '<img src="' + Utils.escape(iconurl) + '" alt="" class="plugin-icon" onerror="this.style.display=\'none\'" />'
            : '<div class="plugin-icon plugin-icon-placeholder"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg></div>'
          ) +
          '<div class="plugin-card-info">' +
            '<div class="plugin-card-title">' + Utils.escape(hit.title) + '</div>' +
            '<div class="plugin-card-author">' + Utils.escape(hit.author || hit.project_id || '') + '</div>' +
            '<div class="plugin-card-downloads">' + this.formatnum(hit.downloads) + ' downloads</div>' +
          '</div>' +
        '</div>' +
        '<div class="plugin-card-desc">' + Utils.escape((hit.description || '').substring(0, 120)) + ((hit.description || '').length > 120 ? '...' : '') + '</div>' +
        '<div class="plugin-card-tags">' + categories + '</div>' +
      '</div>';
    }).join('');
  },

  async showdetail(cfgkey, slug) {
    const cfg = typeof cfgkey === 'string' ? this.getcfg(cfgkey) : cfgkey;
    const status = Utils.el(cfg.statusid);
    if (status) status.textContent = 'Loading...';

    try {
      const project = await this.apiproject(slug);
      const versions = await this.apiversions(cfg, project.id);
      const loaders = [...new Set(versions.flatMap(v => v.loaders || []))];

      if (status) status.textContent = '';

      const loaderslist = loaders.length
        ? loaders.map(l => '<span class="plugin-tag">' + Utils.escape(l) + '</span>').join(' ')
        : '<span style="color:var(--text-muted)">None</span>';

      const versionslist = versions.map(v => {
        const vloaders = (v.loaders || []).map(l => '<span class="plugin-tag tag-sm">' + Utils.escape(l) + '</span>').join(' ');
        const vgameversions = (v.game_versions || []).join(', ');
        const date = v.date_published ? new Date(v.date_published).toLocaleDateString() : '';
        const name = v.name || v.version_number;
        const sizemb = v.files && v.files[0] ? (v.files[0].size / (1024 * 1024)).toFixed(1) : '?';

        return '<div class="plugin-version-item">' +
          '<div class="plugin-version-info">' +
            '<div class="plugin-version-name">' + Utils.escape(name) + '</div>' +
            '<div class="plugin-version-meta">' + vgameversions + ' &middot; ' + sizemb + ' MB' + (date ? ' &middot; ' + date : '') + '</div>' +
            '<div class="plugin-version-loaders">' + vloaders + '</div>' +
          '</div>' +
          '<button class="btn btn-primary btn-sm download-btn" onclick="ModrinthBrowser.downloadversion(\'' + cfg.key + '\', \'' + Utils.escape(project.slug) + '\', \'' + Utils.escape(v.id) + '\', this)">' +
            'Download' +
          '</button>' +
        '</div>';
      }).join('');

      const iconurl = project.icon_url || '';
      const html = '<div class="plugin-detail">' +
        '<div class="plugin-detail-header">' +
          (iconurl
            ? '<img src="' + Utils.escape(iconurl) + '" alt="" class="plugin-detail-icon" onerror="this.style.display=\'none\'" />'
            : '<div class="plugin-detail-icon plugin-icon-placeholder"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg></div>'
          ) +
          '<div class="plugin-detail-info">' +
            '<h3 style="margin:0 0 4px 0;font-size:18px;font-weight:600;color:var(--text-primary);">' + Utils.escape(project.title) + '</h3>' +
            '<div style="font-size:13px;color:var(--text-muted);margin-bottom:6px;">by ' + Utils.escape(project.author || project.team || '') + ' &middot; ' + this.formatnum(project.downloads) + ' downloads</div>' +
            '<div style="font-size:13px;color:var(--text-secondary);line-height:1.5;">' + Utils.escape(project.description || '') + '</div>' +
          '</div>' +
        '</div>' +
        '<div style="margin-bottom:12px;">' +
          '<div style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;margin-bottom:6px;">Loaders</div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:4px;">' + loaderslist + '</div>' +
        '</div>' +
        '<div style="margin-bottom:12px;">' +
          '<div style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;margin-bottom:6px;">Versions (' + versions.length + ')</div>' +
          '<div class="plugin-versions-list">' + (versionslist || '<div style="color:var(--text-muted);font-size:13px;">No versions available</div>') + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="modal-actions">' +
        '<button class="btn btn-secondary" onclick="ModrinthBrowser.backtolist(\'' + cfg.key + '\')">Back</button>' +
      '</div>';

      Modal.open(project.title, html);
    } catch (e) {
      if (status) status.textContent = 'Failed to load: ' + e.message;
    }
  },

  backtolist(cfgkey) {
    const cfg = typeof cfgkey === 'string' ? this.getcfg(cfgkey) : cfgkey;
    if (!cfg) return;
    Modal.close();
    const input = Utils.el(cfg.inputid);
    const q = (input ? input.value.trim() : '') || this._currentquery[cfg.key];
    if (q) {
      this.search(cfg, q);
    } else {
      this.loadpopular(cfg);
    }
  },

  async downloadversion(cfgkey, slug, versionid, btn) {
    const cfg = this._configs[cfgkey];
    if (!cfg) return;
    const status = Utils.el(cfg.statusid);
    if (status) status.textContent = 'Downloading...';

    let origHtml = '';
    if (btn) {
      origHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<svg class="spin-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.568"/></svg>';
    }

    try {
      const versionsres = await fetch('https://api.modrinth.com/v2/project/' + slug + '/version', { headers: { 'User-Agent': 'CTRLServers/1.0 (contact@ctrlservers.xyz)' } });
      if (!versionsres.ok) throw new Error('Failed to fetch versions');
      const versions = await versionsres.json();
      const version = versions.find(v => v.id === versionid);
      if (!version || !version.files || !version.files.length) throw new Error('Version not found');
      const file = version.files[0];

      if (status) status.textContent = 'Downloading from Modrinth...';
      const res = await fetch(file.url);
      if (!res.ok) throw new Error('Download failed: ' + res.status);
      const blob = await res.blob();
      const jarfile = new File([blob], file.filename, { type: 'application/java-archive' });

      const s = App.currentServer;
      if (!s) throw new Error('No server selected');

      if (status) status.textContent = 'Uploading to server...';

      const files = await Api.listfiles(s.panelUrl, s.apiKey, s.uuid, '/');
      const hasdir = files.some(d => d.attributes.mimetype === 'inode/directory' && d.attributes.name === cfg.folder);

      if (!hasdir) {
        if (status) status.textContent = 'Creating ' + cfg.folder + ' directory...';
        await Api.createfolder(s.panelUrl, s.apiKey, s.uuid, cfg.folder, '/');
      }

      if (status) status.textContent = 'Uploading to ' + cfg.folder + ' folder...';
      await Api.uploadfiles(s.panelUrl, s.apiKey, s.uuid, '/' + cfg.folder, [{ file: jarfile, relPath: file.filename }]);

      if (status) status.textContent = 'Installed successfully!';
      Modal.close();
    } catch (e) {
      if (status) status.textContent = 'Error: ' + e.message;
      if (btn) { btn.disabled = false; btn.innerHTML = origHtml || 'Download'; }
    }
  },

  async apisearch(cfg, query, index) {
    const facets = [['project_type:' + cfg.projecttype]];
    const ver = this._selectedversion[cfg.key];
    if (ver) {
      facets.push(['versions:' + ver]);
    }
    let url = 'https://api.modrinth.com/v2/search?limit=20&index=' + (index || 'relevance') + '&facets=' + encodeURIComponent(JSON.stringify(facets));
    if (query) {
      url += '&query=' + encodeURIComponent(query);
    }
    const res = await fetch(url, { headers: { 'User-Agent': 'CTRLServers/1.0 (contact@ctrlservers.xyz)' } });
    if (!res.ok) throw new Error('API error: ' + res.status);
    return await res.json();
  },

  async apiproject(slug) {
    const res = await fetch('https://api.modrinth.com/v2/project/' + slug, { headers: { 'User-Agent': 'CTRLServers/1.0 (contact@ctrlservers.xyz)' } });
    if (!res.ok) throw new Error('API error: ' + res.status);
    return await res.json();
  },

  async apiversions(cfg, projectid) {
    let url = 'https://api.modrinth.com/v2/project/' + projectid + '/version';
    const ver = this._selectedversion[cfg.key];
    if (ver) {
      url += '?game_versions=' + encodeURIComponent(JSON.stringify([ver]));
    }
    const res = await fetch(url, { headers: { 'User-Agent': 'CTRLServers/1.0 (contact@ctrlservers.xyz)' } });
    if (!res.ok) throw new Error('API error: ' + res.status);
    return await res.json();
  },

  formatnum(n) {
    if (!n) return '0';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(n);
  },

  emptyhtml(text) {
    return '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;gap:12px;padding:60px 20px;text-align:center;">' +
      '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>' +
      '<div style="color:var(--text-muted);font-size:14px;">' + text + '</div>' +
    '</div>';
  }
};

const Plugins = {
  hasplugins: false,
  jarfiles: [],
  _cfg: {
    key: 'plugins',
    folder: 'plugins',
    projecttype: 'plugin',
    label: 'plugins',
    inputid: 'pluginsearchinput',
    versionid: 'pluginversionselect',
    gridid: 'pluginresults',
    emptyid: 'pluginempty',
    statusid: 'pluginstatus'
  },

  async detect(server) {
    this.hasplugins = false;
    this.jarfiles = [];
    if (!server || server.type !== 'Pterodactyl' || !server.apiKey) return;
    try {
      const files = await Api.listfiles(server.panelUrl, server.apiKey, server.uuid, '/');
      const hasdir = files.some(f => f.attributes.mimetype === 'inode/directory' && f.attributes.name === 'plugins');
      const jars = files.filter(f => f.attributes.is_file && f.attributes.name.toLowerCase().endsWith('.jar'));
      this.hasplugins = hasdir && jars.length > 0;
      this.jarfiles = jars.map(f => f.attributes.name);
    } catch (e) {}
  },

  init() { ModrinthBrowser.init(this._cfg); },
  loadpopular() { ModrinthBrowser.loadpopular(this._cfg); },
  search(q) { ModrinthBrowser.search(this._cfg, q); },
  showdetail(slug) { ModrinthBrowser.showdetail(this._cfg, slug); },
  backtolist() { ModrinthBrowser.backtolist(this._cfg); },
  downloadversion(slug, vid) { ModrinthBrowser.downloadversion(this._cfg, slug, vid); }
};

const Mods = {
  hasmods: false,
  jarfiles: [],
  _cfg: {
    key: 'mods',
    folder: 'mods',
    projecttype: 'mod',
    label: 'mods',
    inputid: 'modsearchinput',
    versionid: 'modversionselect',
    gridid: 'modresults',
    emptyid: 'modempty',
    statusid: 'modstatus'
  },

  async detect(server) {
    this.hasmods = false;
    this.jarfiles = [];
    if (!server || server.type !== 'Pterodactyl' || !server.apiKey) return;
    try {
      const files = await Api.listfiles(server.panelUrl, server.apiKey, server.uuid, '/');
      const hasdir = files.some(f => f.attributes.mimetype === 'inode/directory' && f.attributes.name === 'mods');
      const jars = files.filter(f => f.attributes.is_file && f.attributes.name.toLowerCase().endsWith('.jar'));
      this.hasmods = hasdir && jars.length > 0;
      this.jarfiles = jars.map(f => f.attributes.name);
    } catch (e) {}
  },

  init() { ModrinthBrowser.init(this._cfg); },
  loadpopular() { ModrinthBrowser.loadpopular(this._cfg); },
  search(q) { ModrinthBrowser.search(this._cfg, q); },
  showdetail(slug) { ModrinthBrowser.showdetail(this._cfg, slug); },
  backtolist() { ModrinthBrowser.backtolist(this._cfg); },
  downloadversion(slug, vid) { ModrinthBrowser.downloadversion(this._cfg, slug, vid); }
};
