const CTRLPlugin = {
  _hooks: {},
  _pages: [],
  _serverpages: [],
  _storageprefix: 'ctrl_plugin_data_',

  on(event, callback) {
    if (!this._hooks[event]) this._hooks[event] = [];
    this._hooks[event].push(callback);
  },

  off(event, callback) {
    if (!this._hooks[event]) return;
    this._hooks[event] = this._hooks[event].filter(cb => cb !== callback);
  },

  emit(event, ...args) {
    if (!this._hooks[event]) return;
    for (const cb of this._hooks[event]) {
      try { cb(...args); } catch (e) { console.error('Plugin hook error:', event, e); }
    }
  },

  addNavPage(config) {
    const id = config.id;
    const existing = this._pages.find(p => p.id === id);
    if (existing) Object.assign(existing, config);
    else this._pages.push(config);

    const nav = Utils.el('mainNav');
    if (!nav) return;
    let link = nav.querySelector(`[data-page="plugin-${id}"]`);
    if (!link) {
      link = document.createElement('a');
      link.href = '#';
      link.className = 'nav-item';
      link.dataset.page = `plugin-${id}`;
      link.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          ${config.icon || '<circle cx="12" cy="12" r="10"/>'}
        </svg>
        <span>${Utils.escape(config.label || id)}</span>`;
      link.addEventListener('click', (e) => {
        e.preventDefault();
        App.navigateto(`plugin-${id}`);
      });
      nav.appendChild(link);
    }
  },

  addServerPage(config) {
    const id = config.id;
    const existing = this._serverpages.find(p => p.id === id);
    if (existing) Object.assign(existing, config);
    else this._serverpages.push(config);

    const nav = Utils.el('serverNav');
    if (!nav) return;
    let link = nav.querySelector(`[data-server-page="plugin-${id}"]`);
    if (!link) {
      link = document.createElement('a');
      link.href = '#';
      link.className = 'nav-item';
      link.dataset.serverPage = `plugin-${id}`;
      const servertype = config.servertype || 'both';
      if (servertype === 'vps' || servertype === 'both') link.dataset.vps = '';
      if (servertype === 'pterodactyl' || servertype === 'both') link.dataset.pterodactyl = '';
      link.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          ${config.icon || '<circle cx="12" cy="12" r="10"/>'}
        </svg>
        <span>${Utils.escape(config.label || id)}</span>`;
      link.addEventListener('click', (e) => {
        e.preventDefault();
        App.switchserverpage(`plugin-${id}`);
      });
      nav.appendChild(link);
    }
  },

  _removepluginpages(pluginId) {
    this._pages = this._pages.filter(p => !p.id.startsWith(pluginId));
    this._serverpages = this._serverpages.filter(p => !p.id.startsWith(pluginId));

    const mainNav = Utils.el('mainNav');
    if (mainNav) {
      mainNav.querySelectorAll(`[data-page^="plugin-"]`).forEach(el => {
        const pageId = el.dataset.page.replace('plugin-', '');
        if (!this._pages.find(p => p.id === pageId)) el.remove();
      });
    }
    const serverNav = Utils.el('serverNav');
    if (serverNav) {
      serverNav.querySelectorAll(`[data-server-page^="plugin-"]`).forEach(el => {
        const pageId = el.dataset.serverPage.replace('plugin-', '');
        if (!this._serverpages.find(p => p.id === pageId)) el.remove();
      });
    }
  },

  showNotification(title, body) {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  },

  openModal(title, html) {
    Modal.open(title, html);
  },

  closeModal() {
    Modal.close();
  },

  getServers() {
    return Servers.list;
  },

  getCurrentServer() {
    return App.currentServer;
  },

  getServerStats(uuid) {
    return Servers.resources[uuid] || null;
  },

  onServerUpdate(callback) {
    this.on('_serverupdate', callback);
  },

  addCard(pageId, cardId, config) {
    return CardManager.registerCard(pageId, cardId, config);
  },

  removeCard(pageId, cardId) {
    CardManager.removeCard(pageId, cardId);
  },

  setCardStyle(pageId, cardId, styles) {
    CardManager.setCardStyle(pageId, cardId, styles);
  },

  getCardStyle(pageId, cardId) {
    return CardManager.getCardStyle(pageId, cardId);
  },
  async serverPower(server, signal) {
    if (!server) throw new Error('No server');
    if (server.type === 'Pterodactyl') {
      const apiKey = await Servers.resolveapikey(server);
      if (!apiKey) throw new Error('No API key');
      const base = server.panelUrl.replace(/\/+$/, '');
      const res = await fetch(`${base}/api/client/servers/${server.uuid}/power`, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + apiKey,
          'Accept': 'application/vnd.pterodactyl.v1+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ signal })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      Servers.resources[server.uuid] = Servers.resources[server.uuid] || {};
      Servers.resources[server.uuid].state = signal === 'start' || signal === 'restart' ? 'starting' : 'stopping';
      Servers.updatecard(server.uuid);
      if (signal === 'start' || signal === 'restart') Servers._pollafterpower(server.uuid, 0);
      if (typeof CTRLPlugin !== 'undefined') CTRLPlugin.emit('server:' + signal, { server, uuid: server.uuid });
      return true;
    }
    throw new Error('Power control only available for Pterodactyl servers');
  },

  async serverStart(server) {
    return this.serverPower(server, 'start');
  },

  async serverStop(server) {
    return this.serverPower(server, 'stop');
  },

  async serverRestart(server) {
    return this.serverPower(server, 'restart');
  },

  async serverKill(server) {
    return this.serverPower(server, 'kill');
  },

  async serverSendCommand(server, command) {
    if (!server) throw new Error('No server');
    if (server.type === 'Pterodactyl') {
      const apiKey = await Servers.resolveapikey(server);
      if (!apiKey) throw new Error('No API key');
      const base = server.panelUrl.replace(/\/+$/, '');
      const res = await fetch(`${base}/api/client/servers/${server.uuid}/command`, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + apiKey,
          'Accept': 'application/vnd.pterodactyl.v1+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ command })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return true;
    }
    if (server.type === 'VPS/VDS') {
      const result = await this.sshExec(server, command);
      return result;
    }
    throw new Error('Unknown server type');
  },

  async fileList(server, directory) {
    if (!server || server.type !== 'Pterodactyl') throw new Error('Pterodactyl server required');
    const data = await this.pteroApi(server, 'GET', '/files/list?directory=' + encodeURIComponent(directory || '/'));
    return (data.data || []).map(f => ({
      key: f.attributes.key,
      name: f.attributes.name,
      path: f.attributes.path,
      size: f.attributes.size,
      isFile: f.attributes.is_file,
      isDirectory: f.attributes.is_directory,
      mimeType: f.attributes.mime_type,
      modifiedAt: f.attributes.modified_at,
      createdAt: f.attributes.created_at
    }));
  },

  async fileRead(server, filePath) {
    if (!server || server.type !== 'Pterodactyl') throw new Error('Pterodactyl server required');
    const apiKey = await Servers.resolveapikey(server);
    if (!apiKey) throw new Error('No API key');
    const base = server.panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${server.uuid}/files/contents?file=` + encodeURIComponent(filePath), {
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Accept': 'application/vnd.pterodactyl.v1+json'
      }
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.text();
  },

  async fileWrite(server, filePath, content) {
    if (!server || server.type !== 'Pterodactyl') throw new Error('Pterodactyl server required');
    await this.pteroApi(server, 'POST', '/files/write', { file: filePath, content: btoa(unescape(encodeURIComponent(content))) });
    return true;
  },

  async fileCreateFolder(server, directory, name) {
    if (!server || server.type !== 'Pterodactyl') throw new Error('Pterodactyl server required');
    await this.pteroApi(server, 'POST', '/files/create-folder', { root: directory || '/', name });
    return true;
  },

  async fileDelete(server, directory, files) {
    if (!server || server.type !== 'Pterodactyl') throw new Error('Pterodactyl server required');
    await this.pteroApi(server, 'POST', '/files/delete', { root: directory || '/', files });
    return true;
  },

  async fileRename(server, directory, oldName, newName) {
    if (!server || server.type !== 'Pterodactyl') throw new Error('Pterodactyl server required');
    await this.pteroApi(server, 'PUT', '/files/rename', { root: directory || '/', files: [{ from: oldName, to: newName }] });
    return true;
  },

  async fileCopy(server, location) {
    if (!server || server.type !== 'Pterodactyl') throw new Error('Pterodactyl server required');
    await this.pteroApi(server, 'POST', '/files/copy', { location });
    return true;
  },

  async fileCompress(server, directory, files, prefix) {
    if (!server || server.type !== 'Pterodactyl') throw new Error('Pterodactyl server required');
    await this.pteroApi(server, 'POST', '/files/compress', { root: directory || '/', files, directory: directory || '/', prefix: prefix || '' });
    return true;
  },

  async fileDecompress(server, directory, file) {
    if (!server || server.type !== 'Pterodactyl') throw new Error('Pterodactyl server required');
    await this.pteroApi(server, 'POST', '/files/decompress', { root: directory || '/', file });
    return true;
  },

  async fileSetPermissions(server, directory, file, mode) {
    if (!server || server.type !== 'Pterodactyl') throw new Error('Pterodactyl server required');
    await this.pteroApi(server, 'POST', '/files/chmod', { root: directory || '/', files: [{ file, mode }] });
    return true;
  },

  async backupList(server) {
    if (!server || server.type !== 'Pterodactyl') throw new Error('Pterodactyl server required');
    const data = await this.pteroApi(server, 'GET', '/backups');
    return (data.data || []).map(b => ({
      uuid: b.attributes.uuid,
      name: b.attributes.name,
      bytes: b.attributes.bytes,
      isLocked: b.attributes.is_locked,
      createdAt: b.attributes.created_at,
      completedAt: b.attributes.completed_at
    }));
  },

  async backupCreate(server, name) {
    if (!server || server.type !== 'Pterodactyl') throw new Error('Pterodactyl server required');
    const body = {};
    if (name) body.name = name;
    const data = await this.pteroApi(server, 'POST', '/backups', body);
    return data.data ? {
      uuid: data.data.attributes.uuid,
      name: data.data.attributes.name
    } : null;
  },

  async backupDelete(server, backupUuid) {
    if (!server || server.type !== 'Pterodactyl') throw new Error('Pterodactyl server required');
    await this.pteroApi(server, 'DELETE', '/backups/' + backupUuid);
    return true;
  },

  async backupRestore(server, backupUuid) {
    if (!server || server.type !== 'Pterodactyl') throw new Error('Pterodactyl server required');
    await this.pteroApi(server, 'POST', '/backups/' + backupUuid + '/restore', { truncate: true });
    return true;
  },

  async backupGetUrl(server, backupUuid) {
    if (!server || server.type !== 'Pterodactyl') throw new Error('Pterodactyl server required');
    const data = await this.pteroApi(server, 'GET', '/backups/' + backupUuid + '/download');
    return data.attributes ? data.attributes.url : null;
  },

  async backupToggleLock(server, backupUuid) {
    if (!server || server.type !== 'Pterodactyl') throw new Error('Pterodactyl server required');
    await this.pteroApi(server, 'POST', '/backups/' + backupUuid + '/lock', {});
    return true;
  },

  async databaseList(server) {
    if (!server || server.type !== 'Pterodactyl') throw new Error('Pterodactyl server required');
    const data = await this.pteroApi(server, 'GET', '/databases?include=password');
    return (data.data || []).map(db => {
      const pwd = db.attributes.relationships && db.attributes.relationships.password;
      return {
        id: db.attributes.id,
        name: db.attributes.name,
        host: db.attributes.host,
        port: db.attributes.port,
        username: db.attributes.username,
        password: pwd ? pwd.attributes.password : null
      };
    });
  },

  async databaseCreate(server, name, remote) {
    if (!server || server.type !== 'Pterodactyl') throw new Error('Pterodactyl server required');
    const data = await this.pteroApi(server, 'POST', '/databases', { database: name, remote: remote || '%' });
    return data.data ? {
      id: data.data.attributes.id,
      name: data.data.attributes.name
    } : null;
  },

  async databaseDelete(server, dbId) {
    if (!server || server.type !== 'Pterodactyl') throw new Error('Pterodactyl server required');
    await this.pteroApi(server, 'DELETE', '/databases/' + dbId);
    return true;
  },

  async databaseRotatePassword(server, dbId) {
    if (!server || server.type !== 'Pterodactyl') throw new Error('Pterodactyl server required');
    const data = await this.pteroApi(server, 'POST', '/databases/' + dbId + '/rotate-password', {});
    return data.data ? data.data.attributes : null;
  },

  async sshExec(server, command) {
    const cfg = {
      host: server.host,
      port: parseInt(server.port) || 22,
      username: server.username || 'root',
    };
    if (server.authType === 'key') {
      const pk = await Servers.resolvevpsprivatekey(server);
      if (pk) {
        cfg.authType = 'privateKey';
        cfg.privateKey = pk;
      } else {
        cfg.authType = 'password';
        cfg.password = server.password || '';
      }
    } else {
      cfg.authType = 'password';
      cfg.password = server.password || '';
    }
    if (!cfg.password && cfg.authType === 'password') {
      throw new Error('No password saved for this server');
    }
    return await window.electronAPI.sshexec(cfg, command);
  },

  async sftpList(server, remotePath) {
    const cfg = {
      host: server.host,
      port: parseInt(server.port) || 22,
      username: server.username || 'root',
    };
    if (server.authType === 'key') {
      const pk = await Servers.resolvevpsprivatekey(server);
      if (pk) {
        cfg.authType = 'privateKey';
        cfg.privateKey = pk;
      } else {
        cfg.authType = 'password';
        cfg.password = server.password || '';
      }
    } else {
      cfg.authType = 'password';
      cfg.password = server.password || '';
    }
    const id = await window.electronAPI.sftpconnect(cfg);
    try {
      const list = await window.electronAPI.sftplist(id, remotePath || '/');
      return list;
    } finally {
      await window.electronAPI.sftpdisconnect(id);
    }
  },

  async sftpRead(server, remotePath) {
    const cfg = {
      host: server.host,
      port: parseInt(server.port) || 22,
      username: server.username || 'root',
    };
    if (server.authType === 'key') {
      const pk = await Servers.resolvevpsprivatekey(server);
      if (pk) {
        cfg.authType = 'privateKey';
        cfg.privateKey = pk;
      } else {
        cfg.authType = 'password';
        cfg.password = server.password || '';
      }
    } else {
      cfg.authType = 'password';
      cfg.password = server.password || '';
    }
    const id = await window.electronAPI.sftpconnect(cfg);
    try {
      return await window.electronAPI.sftpread(id, remotePath);
    } finally {
      await window.electronAPI.sftpdisconnect(id);
    }
  },

  async pteroApi(server, method, endpoint, body) {
    const apiKey = await Servers.resolveapikey(server);
    if (!apiKey) throw new Error('No API key');
    const base = server.panelUrl.replace(/\/+$/, '');
    const opts = {
      method: method || 'GET',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Accept': 'application/vnd.pterodactyl.v1+json',
        'Content-Type': 'application/json'
      }
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${base}/api/client/servers/${server.uuid}${endpoint}`, opts);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  },

  storage: {
    _prefix: 'ctrl_plugin_data_',

    get(key, pluginId) {
      const pid = pluginId || 'default';
      const storeKey = this._prefix + pid;
      try {
        const raw = localStorage.getItem(storeKey);
        const data = raw ? JSON.parse(raw) : {};
        return data[key];
      } catch (e) { return undefined; }
    },

    set(key, value, pluginId) {
      const pid = pluginId || 'default';
      const storeKey = this._prefix + pid;
      try {
        const raw = localStorage.getItem(storeKey);
        const data = raw ? JSON.parse(raw) : {};
        data[key] = value;
        localStorage.setItem(storeKey, JSON.stringify(data));
      } catch (e) {}
    },

    remove(key, pluginId) {
      const pid = pluginId || 'default';
      const storeKey = this._prefix + pid;
      try {
        const raw = localStorage.getItem(storeKey);
        const data = raw ? JSON.parse(raw) : {};
        delete data[key];
        localStorage.setItem(storeKey, JSON.stringify(data));
      } catch (e) {}
    }
  }
};
