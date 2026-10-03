const MCP = {
  status: null,
  _initialized: false,
  _showtoken: false,
  _approvalqueue: [],
  _approvalactive: false,

  async init() {
    if (!this._initialized) {
      this._initialized = true;
      window.electronAPI?.onmcpoperation?.(request => this.handleoperation(request));
      window.electronAPI?.onmcpapproval?.(request => this.handleapproval(request));
      window.electronAPI?.onmcpstatus?.(status => {
        this.status = status;
        if (App.currentPage === 'appsettings') AppSettings.rendermcp(status);
      });
    }
    window.electronAPI?.mcpsetlocked?.(false);
    try { this.status = await window.electronAPI?.mcpgetstatus?.(); } catch (e) {}
  },

  setlocked(locked) {
    window.electronAPI?.mcpsetlocked?.(Boolean(locked));
  },

  serverid(server) {
    return String(server?.uuid || server?.id || server?.identifier || '');
  },

  getserver(id) {
    const wanted = String(id || '');
    const matches = Servers.list.filter(server => this.serverid(server) === wanted);
    if (matches.length !== 1) throw new Error(matches.length ? 'Server ID is ambiguous.' : 'Server not found. Call listservers first.');
    return matches[0];
  },

  sanitizeserver(server) {
    const resources = Servers.resources?.[server.uuid] || Servers.vpsstats?.[this.serverid(server)] || null;
    return {
      id: this.serverid(server),
      type: server.type,
      name: server.name,
      description: server.description || '',
      host: server.host || '',
      port: server.port || '',
      username: server.type === 'VPS/VDS' ? server.username || 'root' : undefined,
      panelurl: server.type === 'Pterodactyl' ? server.panelUrl || '' : undefined,
      identifier: server.identifier || undefined,
      uuid: server.uuid || undefined,
      node: server.node || undefined,
      status: resources?.state || server.status || 'unknown',
      pinned: Boolean(server.pinned),
      folder: server.folder || null,
      tags: Array.isArray(server.tags) ? [...server.tags] : [],
      resources,
    };
  },

  normalizepath(value) {
    const original = String(value || '').trim().replace(/\\/g, '/');
    if (!original || original.includes('\0')) throw new Error('A valid remote path is required.');
    const absolute = original.startsWith('/');
    const parts = [];
    for (const part of original.split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') throw new Error('Path traversal is not allowed.');
      parts.push(part);
    }
    return (absolute ? '/' : '') + parts.join('/') || '/';
  },

  pathparts(value) {
    const normalized = this.normalizepath(value);
    if (normalized === '/') throw new Error('The remote root cannot be used for this operation.');
    const index = normalized.lastIndexOf('/');
    return {
      path: normalized,
      directory: index <= 0 ? '/' : normalized.slice(0, index),
      name: normalized.slice(index + 1),
    };
  },

  async hashbytes(bytes) {
    const digest = await crypto.subtle.digest('SHA-256', bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    return Array.from(new Uint8Array(digest)).map(value => value.toString(16).padStart(2, '0')).join('');
  },

  bytestobase64(bytes) {
    let binary = '';
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    for (let offset = 0; offset < view.length; offset += 0x8000) {
      binary += String.fromCharCode(...view.subarray(offset, offset + 0x8000));
    }
    return btoa(binary);
  },

  base64tobytes(value) {
    let binary;
    try { binary = atob(String(value || '')); } catch (e) { throw new Error('Invalid base64 content.'); }
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    if (bytes.length > 8 * 1024 * 1024) throw new Error('Binary files are limited to 8 MiB.');
    return bytes;
  },

  async pterorequest(server, method, endpoint, body, responsekind = 'auto') {
    if (server.type !== 'Pterodactyl') throw new Error('A Pterodactyl server is required.');
    const relative = String(endpoint || '');
    if (!relative.startsWith('/') || relative.includes('://') || /[\r\n]/.test(relative)) throw new Error('Invalid Pterodactyl endpoint.');
    const apikey = await Servers.resolveapikey(server);
    if (!apikey) throw new Error('No API key is available for this server.');
    const options = {
      method: String(method || 'GET').toUpperCase(),
      headers: {
        'Authorization': 'Bearer ' + apikey,
        'Accept': 'application/vnd.pterodactyl.v1+json',
        'Content-Type': 'application/json',
      },
    };
    if (body !== undefined && options.method !== 'GET') options.body = JSON.stringify(body);
    const response = await fetch(server.panelUrl.replace(/\/+$/, '') + '/api/client/servers/' + encodeURIComponent(server.uuid) + relative, options);
    if (!response.ok) {
      const details = (await response.text()).slice(0, 2000);
      throw new Error(`Pterodactyl HTTP ${response.status}${details ? ': ' + details : ''}`);
    }
    const contentlength = Number(response.headers.get('content-length') || 0);
    if (contentlength > 8 * 1024 * 1024) throw new Error('MCP responses are limited to 8 MiB.');
    if (responsekind === 'bytes') {
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length > 8 * 1024 * 1024) throw new Error('MCP responses are limited to 8 MiB.');
      return bytes;
    }
    if (responsekind === 'text') {
      const text = await response.text();
      if (new TextEncoder().encode(text).length > 8 * 1024 * 1024) throw new Error('MCP responses are limited to 8 MiB.');
      return text;
    }
    if (response.status === 204) return { success: true };
    const contenttype = response.headers.get('content-type') || '';
    const text = await response.text();
    if (new TextEncoder().encode(text).length > 8 * 1024 * 1024) throw new Error('MCP responses are limited to 8 MiB.');
    if (contenttype.includes('application/json')) return JSON.parse(text);
    return text;
  },

  async opensftp(server) {
    if (server.type !== 'VPS/VDS') throw new Error('A VPS/VDS server is required.');
    const sessionid = typeof VPSConsole !== 'undefined' ? VPSConsole.getsessionid(server) : null;
    if (sessionid !== null && window.electronAPI?.sftpconnectsession) {
      try {
        return await window.electronAPI.sftpconnectsession(sessionid);
      } catch (e) {}
    }
    const config = await Servers._vpsconfig(server);
    if (config.authType === 'password' && !config.password) throw new Error('No saved VPS password is available.');
    return await window.electronAPI.sftpconnect(config);
  },

  async withsftp(server, callback) {
    const id = await this.opensftp(server);
    try { return await callback(id); }
    finally { try { await window.electronAPI.sftpdisconnect(id); } catch (e) {} }
  },

  async readbytes(server, remotepath) {
    const target = this.normalizepath(remotepath);
    let bytes;
    if (server.type === 'Pterodactyl') {
      bytes = await this.pterorequest(server, 'GET', '/files/contents?file=' + encodeURIComponent(target), undefined, 'bytes');
    } else if (server.type === 'VPS/VDS') {
      bytes = await this.withsftp(server, async id => {
        const stat = await window.electronAPI.sftpstat(id, target);
        if (stat.size > 8 * 1024 * 1024) throw new Error('Files read through MCP are limited to 8 MiB.');
        const value = await window.electronAPI.sftpdownload(id, target);
        return new Uint8Array(value);
      });
    } else {
      throw new Error('Link entries do not have remote files.');
    }
    if (bytes.length > 8 * 1024 * 1024) throw new Error('Files read through MCP are limited to 8 MiB.');
    return bytes;
  },

  async writebytes(server, remotepath, bytes) {
    const target = this.normalizepath(remotepath);
    if (bytes.length > 8 * 1024 * 1024) throw new Error('Files written through MCP are limited to 8 MiB.');
    if (server.type === 'Pterodactyl') {
      const parts = this.pathparts(target);
      const apikey = await Servers.resolveapikey(server);
      const base = server.panelUrl.replace(/\/+$/, '');
      const urlresponse = await fetch(`${base}/api/client/servers/${encodeURIComponent(server.uuid)}/files/upload?directory=${encodeURIComponent(parts.directory)}`, {
        headers: { 'Authorization': 'Bearer ' + apikey, 'Accept': 'application/vnd.pterodactyl.v1+json' },
      });
      if (!urlresponse.ok) throw new Error(`Pterodactyl HTTP ${urlresponse.status}`);
      const urldata = await urlresponse.json();
      const signedurl = urldata.attributes?.url;
      if (!signedurl) throw new Error('Pterodactyl did not return an upload URL.');
      const form = new FormData();
      form.append('files', new Blob([bytes]), parts.name);
      form.append('directory', parts.directory);
      const separator = signedurl.includes('?') ? '&' : '?';
      const upload = await fetch(signedurl + separator + 'directory=' + encodeURIComponent(parts.directory), { method: 'POST', body: form });
      if (!upload.ok) throw new Error(`Pterodactyl upload HTTP ${upload.status}`);
      return;
    }
    if (server.type === 'VPS/VDS') {
      await this.withsftp(server, id => window.electronAPI.sftpupload(id, target, bytes));
      return;
    }
    throw new Error('Link entries do not have remote files.');
  },

  async checkexpectedhash(server, remotepath, expectedhash) {
    if (!expectedhash) return;
    let current;
    try { current = await this.readbytes(server, remotepath); }
    catch (error) { throw new Error('The current remote file could not be read for the expectedhash check.'); }
    const actual = await this.hashbytes(current);
    if (actual.toLowerCase() !== String(expectedhash).toLowerCase()) {
      throw new Error(`The remote file changed. Expected ${expectedhash}, found ${actual}. Read it again before writing.`);
    }
  },

  async handleoperation(request) {
    try {
      const result = await this.execute(request.tool, request.args || {}, request.permission);
      window.electronAPI.mcpoperationresult({ id: request.id, ok: true, result });
    } catch (error) {
      window.electronAPI.mcpoperationresult({ id: request.id, ok: false, error: error?.message || String(error) });
    }
  },

  handleapproval(request) {
    this._approvalqueue.push(request);
    this.showapproval();
  },

  showapproval() {
    if (this._approvalactive || !this._approvalqueue.length) return;
    this._approvalactive = true;
    const request = this._approvalqueue.shift();
    const details = Utils.escape(JSON.stringify(request.args || {}, null, 2));
    Modal.open('Approve AI operation', `
      <div class="mcp-approval-summary">
        <div><strong>${Utils.escape(request.tool)}</strong></div>
        <div class="mcp-approval-permission">Permission: ${Utils.escape(request.permission)}</div>
        <pre>${details}</pre>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="mcpDenyRequest">Deny</button>
        <button class="btn btn-primary" id="mcpAllowRequest">Allow once</button>
      </div>
    `);
    let answered = false;
    const answer = approved => {
      if (answered) return;
      answered = true;
      window.electronAPI.mcpapprovalresult({ id: request.id, approved });
      Modal.close();
      this._approvalactive = false;
      this.showapproval();
    };
    setTimeout(() => {
      Utils.el('mcpDenyRequest')?.addEventListener('click', () => answer(false));
      Utils.el('mcpAllowRequest')?.addEventListener('click', () => answer(true));
    }, 0);
  },

  async execute(tool, args, permission) {
    if (tool === 'listservers') return { servers: Servers.list.map(server => this.sanitizeserver(server)) };
    if (tool === 'getserver') return this.sanitizeserver(this.getserver(args.serverid));
    if (tool === 'moveserver') return this.moveserver(args);
    if (tool === 'updateserverorganization') return this.updateserverorganization(args);
    if (tool === 'addserver') return await this.addserver(args);
    if (tool === 'deleteserver') return this.deleteserver(args);

    const server = this.getserver(args.serverid);
    if (tool === 'serverpower') return await this.serverpower(server, args.signal);
    if (tool === 'sendservercommand') return await this.sendservercommand(server, args.command);
    if (tool === 'runvpscommand') return await this.runvpscommand(server, args.command, args.root);
    if (tool === 'listfiles') return await this.listfiles(server, args.path);
    if (tool === 'readfile') return await this.readfile(server, args.path);
    if (tool === 'writefile') return await this.writefile(server, args.path, args.content, args.expectedhash);
    if (tool === 'createdirectory') return await this.createdirectory(server, args.path);
    if (tool === 'renamepath') return await this.renamepath(server, args.source, args.destination);
    if (tool === 'movepaths') return await this.movepaths(server, args.paths, args.destination);
    if (tool === 'copypath') return await this.copypath(server, args.source, args.destination);
    if (tool === 'deletepaths') return await this.deletepaths(server, args.paths, args.recursive);
    if (tool === 'chmodpaths') return await this.chmodpaths(server, args.paths, args.mode);
    if (tool === 'compresspaths') return await this.compresspaths(server, args.paths, args.destination);
    if (tool === 'extractpath') return await this.extractpath(server, args.archive, args.destination);
    if (tool === 'readbinaryfile') return await this.readbinaryfile(server, args.path);
    if (tool === 'writebinaryfile') return await this.writebinaryfile(server, args.path, args.base64, args.expectedhash);
    if (tool === 'pterodactylrequest') return await this.genericpterodactylrequest(server, args, permission);
    throw new Error('Unknown MCP tool.');
  },

  moveserver(args) {
    const server = this.getserver(args.serverid);
    const target = this.getserver(args.targetid);
    if (server === target) throw new Error('A server cannot be moved relative to itself.');
    Servers.list.splice(Servers.list.indexOf(server), 1);
    let index = Servers.list.indexOf(target);
    if (args.position === 'after') index++;
    Servers.list.splice(index, 0, server);
    Servers.save();
    Servers.render();
    CTRLCloud.autosyncupload('add');
    return { success: true, order: Servers.list.map(item => this.serverid(item)) };
  },

  updateserverorganization(args) {
    const server = this.getserver(args.serverid);
    if (args.name !== undefined) server.name = args.name.trim();
    if (args.pinned !== undefined) server.pinned = args.pinned;
    if (args.folder !== undefined) {
      server.folder = args.folder || undefined;
      if (args.folder && !Servers.folders.includes(args.folder)) Servers.folders.push(args.folder);
    }
    if (args.tags !== undefined) server.tags = [...new Set(args.tags.map(tag => tag.trim().toLowerCase()).filter(Boolean))];
    Servers.save();
    Servers.render();
    Servers.renderworkspaces();
    CTRLCloud.autosyncupload('add');
    return this.sanitizeserver(server);
  },

  async addserver(args) {
    const added = [];
    if (args.type === 'Pterodactyl') {
      if (!args.panelurl || !args.apikey) throw new Error('panelurl and apikey are required.');
      const panelurl = args.panelurl.replace(/\/+$/, '');
      const remote = await Api.fetchservers(panelurl, args.apikey);
      const wanted = new Set((args.remoteids || []).map(String));
      const selected = wanted.size ? remote.filter(item => wanted.has(String(item.attributes.uuid)) || wanted.has(String(item.attributes.identifier))) : remote;
      if (!selected.length) throw new Error('No matching Pterodactyl servers were found.');
      let encrypted = args.apikey;
      try { encrypted = 'enc:' + await window.electronAPI.cryptoencrypt(args.apikey); } catch (e) {}
      for (const item of selected) {
        const attributes = item.attributes;
        if (Servers.list.some(server => server.uuid === attributes.uuid && server.panelUrl === panelurl)) continue;
        const allocation = attributes.relationships?.allocations?.data?.[0]?.attributes;
        const server = {
          id: Date.now() + Math.random(), type: 'Pterodactyl', name: attributes.name,
          description: attributes.description || '', panelUrl: panelurl, apiKey: encrypted,
          uuid: attributes.uuid, identifier: attributes.identifier, node: attributes.node,
          host: allocation?.ip || panelurl.replace(/^https?:\/\//, ''), port: allocation?.port || '',
          limits: attributes.limits || {}, status: 'offline',
        };
        Servers.list.push(server);
        added.push(this.sanitizeserver(server));
      }
    } else if (args.type === 'VPS/VDS') {
      if (!args.name || !args.host) throw new Error('name and host are required.');
      const server = { id: Date.now(), type: 'VPS/VDS', name: args.name, host: args.host, port: String(args.port || 22), username: args.username || 'root', status: 'offline' };
      if (args.keyname) {
        const index = ServerKeychain.keys.findIndex(key => key.name === args.keyname);
        if (index < 0) throw new Error('The requested saved SSH key was not found.');
        server.authType = 'key';
        server.keyIndex = index;
      } else {
        server.authType = 'password';
        server.password = args.password || '';
      }
      Servers.list.push(server);
      added.push(this.sanitizeserver(server));
    } else if (args.type === 'Link') {
      if (!args.name || !args.url) throw new Error('name and url are required.');
      const server = { id: Date.now(), type: 'Link', name: args.name, host: args.url, status: 'offline' };
      Servers.list.push(server);
      added.push(this.sanitizeserver(server));
    }
    Servers.save();
    Servers.render();
    CTRLCloud.autosyncupload('add');
    return { added };
  },

  deleteserver(args) {
    const server = this.getserver(args.serverid);
    Servers.list.splice(Servers.list.indexOf(server), 1);
    Servers.save();
    Servers.render();
    CTRLCloud.autosyncupload('delete');
    return { success: true, deleted: this.serverid(server) };
  },

  async serverpower(server, signal) {
    if (server.type !== 'Pterodactyl') throw new Error('Power control requires a Pterodactyl server.');
    await CTRLPlugin.serverPower(server, signal);
    return { success: true, signal };
  },

  async sendservercommand(server, command) {
    if (server.type !== 'Pterodactyl') throw new Error('Use runvpscommand for VPS/VDS servers.');
    await CTRLPlugin.serverSendCommand(server, command);
    return { success: true };
  },

  async runvpscommand(server, command, root) {
    if (server.type !== 'VPS/VDS') throw new Error('A VPS/VDS server is required.');
    const result = await Servers.execvps(server, command, { root: root === true, page: 'mcp' });
    if (result?.error) throw new Error(result.error.message || result.stderr || 'VPS command failed.');
    const limit = 2 * 1024 * 1024;
    if (typeof result.stdout === 'string' && result.stdout.length > limit) result.stdout = result.stdout.slice(0, limit) + '\n[output truncated]';
    if (typeof result.stderr === 'string' && result.stderr.length > limit) result.stderr = result.stderr.slice(0, limit) + '\n[output truncated]';
    return result;
  },

  async listfiles(server, pathvalue) {
    const target = this.normalizepath(pathvalue || '/');
    if (server.type === 'Pterodactyl') {
      const data = await this.pterorequest(server, 'GET', '/files/list?directory=' + encodeURIComponent(target));
      return { path: target, files: (data.data || []).map(item => ({
        name: item.attributes.name, mode: item.attributes.mode, size: item.attributes.size,
        isfile: item.attributes.is_file, isdirectory: item.attributes.is_directory,
        mimetype: item.attributes.mime_type, modifiedat: item.attributes.modified_at,
      })) };
    }
    if (server.type === 'VPS/VDS') {
      const files = await this.withsftp(server, id => window.electronAPI.sftplist(id, target));
      return { path: target, files: files.map(item => ({ name: item.filename, longname: item.longname, size: item.attrs?.size, mode: item.attrs?.mode, mtime: item.attrs?.mtime })) };
    }
    throw new Error('Link entries do not have remote files.');
  },

  async readfile(server, remotepath) {
    const bytes = await this.readbytes(server, remotepath);
    const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { path: this.normalizepath(remotepath), content, bytes: bytes.length, hash: await this.hashbytes(bytes) };
  },

  async writefile(server, remotepath, content, expectedhash) {
    await this.checkexpectedhash(server, remotepath, expectedhash);
    const target = this.normalizepath(remotepath);
    const bytes = new TextEncoder().encode(content);
    if (bytes.length > 8 * 1024 * 1024) throw new Error('Text files written through MCP are limited to 8 MiB.');
    if (server.type === 'Pterodactyl') {
      const ok = await Api.writefile(server.panelUrl, await Servers.resolveapikey(server), server.uuid, target, content);
      if (!ok) throw new Error('Pterodactyl rejected the file write.');
    } else if (server.type === 'VPS/VDS') {
      await this.withsftp(server, id => window.electronAPI.sftpwrite(id, target, content));
    } else {
      throw new Error('Link entries do not have remote files.');
    }
    return { success: true, path: target, bytes: bytes.length, hash: await this.hashbytes(bytes) };
  },

  async createdirectory(server, remotepath) {
    const parts = this.pathparts(remotepath);
    if (server.type === 'Pterodactyl') {
      const ok = await Api.createfolder(server.panelUrl, await Servers.resolveapikey(server), server.uuid, parts.name, parts.directory);
      if (!ok) throw new Error('Pterodactyl rejected the directory creation.');
    } else if (server.type === 'VPS/VDS') {
      await this.withsftp(server, id => window.electronAPI.sftpmkdir(id, parts.path));
    } else throw new Error('Link entries do not have remote files.');
    return { success: true, path: parts.path };
  },

  async renamepath(server, sourcevalue, destinationvalue) {
    const source = this.pathparts(sourcevalue);
    const destination = this.pathparts(destinationvalue);
    if (server.type === 'Pterodactyl') {
      const apikey = await Servers.resolveapikey(server);
      if (source.directory === destination.directory) {
        if (!await Api.renamefile(server.panelUrl, apikey, server.uuid, source.directory, source.name, destination.name)) throw new Error('Pterodactyl rejected the rename.');
      } else {
        if (!await Api.movefiles(server.panelUrl, apikey, server.uuid, source.directory, [source.name], destination.directory)) throw new Error('Pterodactyl rejected the move.');
        if (source.name !== destination.name && !await Api.renamefile(server.panelUrl, apikey, server.uuid, destination.directory, source.name, destination.name)) throw new Error('The file moved, but Pterodactyl rejected its new name.');
      }
    } else if (server.type === 'VPS/VDS') {
      await this.withsftp(server, id => window.electronAPI.sftprename(id, source.path, destination.path));
    } else throw new Error('Link entries do not have remote files.');
    return { success: true, source: source.path, destination: destination.path };
  },

  async movepaths(server, paths, destinationvalue) {
    const destination = this.normalizepath(destinationvalue);
    const moved = [];
    for (const value of paths) {
      const source = this.pathparts(value);
      const target = destination.replace(/\/$/, '') + '/' + source.name;
      await this.renamepath(server, source.path, target);
      moved.push({ source: source.path, destination: target });
    }
    return { success: true, moved };
  },

  async copypath(server, sourcevalue, destinationvalue) {
    const source = this.normalizepath(sourcevalue);
    const destination = this.normalizepath(destinationvalue);
    if (server.type === 'Pterodactyl') {
      const bytes = await this.readbytes(server, source);
      await this.writebytes(server, destination, bytes);
    } else if (server.type === 'VPS/VDS') {
      const command = 'cp -a -- ' + Servers._shellliteral(source) + ' ' + Servers._shellliteral(destination);
      const result = await Servers.execvps(server, command, { root: false, page: 'mcp' });
      if (result?.error || result?.exitCode !== 0) throw new Error(result?.stderr || result?.error?.message || 'Copy failed.');
    } else throw new Error('Link entries do not have remote files.');
    return { success: true, source, destination };
  },

  async deletepaths(server, paths, recursive) {
    const normalized = paths.map(pathvalue => this.normalizepath(pathvalue));
    if (normalized.includes('/')) throw new Error('Deleting the remote root is not allowed.');
    if (server.type === 'Pterodactyl') {
      const groups = new Map();
      for (const value of normalized) {
        const parts = this.pathparts(value);
        if (!groups.has(parts.directory)) groups.set(parts.directory, []);
        groups.get(parts.directory).push(parts.name);
      }
      const apikey = await Servers.resolveapikey(server);
      for (const [root, files] of groups) {
        if (!await Api.deletefiles(server.panelUrl, apikey, server.uuid, root, files)) throw new Error(`Pterodactyl rejected deletion in ${root}.`);
      }
    } else if (server.type === 'VPS/VDS') {
      if (recursive) {
        const command = 'rm -rf -- ' + normalized.map(value => Servers._shellliteral(value)).join(' ');
        const result = await Servers.execvps(server, command, { root: false, page: 'mcp' });
        if (result?.error || result?.exitCode !== 0) throw new Error(result?.stderr || result?.error?.message || 'Deletion failed.');
      } else {
        await this.withsftp(server, async id => {
          for (const value of normalized) {
            try { await window.electronAPI.sftpdelete(id, value); }
            catch (error) { await window.electronAPI.sftprmdir(id, value); }
          }
        });
      }
    } else throw new Error('Link entries do not have remote files.');
    return { success: true, deleted: normalized };
  },

  async chmodpaths(server, paths, mode) {
    const normalized = paths.map(pathvalue => this.normalizepath(pathvalue));
    const numericmode = parseInt(mode, 8);
    if (server.type === 'Pterodactyl') {
      const groups = new Map();
      for (const value of normalized) {
        const parts = this.pathparts(value);
        if (!groups.has(parts.directory)) groups.set(parts.directory, []);
        groups.get(parts.directory).push({ file: parts.name, mode });
      }
      for (const [root, files] of groups) await this.pterorequest(server, 'POST', '/files/chmod', { root, files });
    } else if (server.type === 'VPS/VDS') {
      await this.withsftp(server, async id => {
        for (const value of normalized) await window.electronAPI.sftpchmod(id, value, numericmode);
      });
    } else throw new Error('Link entries do not have remote files.');
    return { success: true, paths: normalized, mode };
  },

  async compresspaths(server, paths, destinationvalue) {
    const normalized = paths.map(pathvalue => this.normalizepath(pathvalue));
    const destination = this.pathparts(destinationvalue);
    if (server.type === 'Pterodactyl') {
      const roots = new Set(normalized.map(value => this.pathparts(value).directory));
      if (roots.size !== 1 || !roots.has(destination.directory)) throw new Error('For Pterodactyl, archive inputs and destination must share one directory.');
      const root = [...roots][0];
      const files = normalized.map(value => this.pathparts(value).name);
      const result = await this.pterorequest(server, 'POST', '/files/compress', { root, files });
      const created = result.attributes?.name || result.data?.attributes?.name;
      if (created && created !== destination.name) await this.renamepath(server, root + '/' + created, destination.path);
    } else if (server.type === 'VPS/VDS') {
      const command = 'tar -czf ' + Servers._shellliteral(destination.path) + ' -- ' + normalized.map(value => Servers._shellliteral(value)).join(' ');
      const result = await Servers.execvps(server, command, { root: false, page: 'mcp' });
      if (result?.error || result?.exitCode !== 0) throw new Error(result?.stderr || result?.error?.message || 'Archive creation failed.');
    } else throw new Error('Link entries do not have remote files.');
    return { success: true, destination: destination.path };
  },

  async extractpath(server, archivevalue, destinationvalue) {
    const archive = this.pathparts(archivevalue);
    const destination = this.normalizepath(destinationvalue);
    if (server.type === 'Pterodactyl') {
      if (archive.directory !== destination) throw new Error('For Pterodactyl, move the archive into the destination directory before extracting it.');
      await this.pterorequest(server, 'POST', '/files/decompress', { root: destination, file: archive.name });
    } else if (server.type === 'VPS/VDS') {
      const lower = archive.name.toLowerCase();
      const command = lower.endsWith('.zip')
        ? 'unzip -o -- ' + Servers._shellliteral(archive.path) + ' -d ' + Servers._shellliteral(destination)
        : 'tar -xf ' + Servers._shellliteral(archive.path) + ' -C ' + Servers._shellliteral(destination);
      const result = await Servers.execvps(server, command, { root: false, page: 'mcp' });
      if (result?.error || result?.exitCode !== 0) throw new Error(result?.stderr || result?.error?.message || 'Archive extraction failed.');
    } else throw new Error('Link entries do not have remote files.');
    return { success: true, archive: archive.path, destination };
  },

  async readbinaryfile(server, remotepath) {
    const bytes = await this.readbytes(server, remotepath);
    return { path: this.normalizepath(remotepath), base64: this.bytestobase64(bytes), bytes: bytes.length, hash: await this.hashbytes(bytes) };
  },

  async writebinaryfile(server, remotepath, base64, expectedhash) {
    await this.checkexpectedhash(server, remotepath, expectedhash);
    const bytes = this.base64tobytes(base64);
    await this.writebytes(server, remotepath, bytes);
    return { success: true, path: this.normalizepath(remotepath), bytes: bytes.length, hash: await this.hashbytes(bytes) };
  },

  redactsecrets(value) {
    if (Array.isArray(value)) return value.map(item => this.redactsecrets(item));
    if (!value || typeof value !== 'object') return value;
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      if (/(password|private.?key|api.?key|token|secret)/i.test(key)) result[key] = '[redacted]';
      else result[key] = this.redactsecrets(item);
    }
    return result;
  },

  async genericpterodactylrequest(server, args, permission) {
    const result = await this.pterorequest(server, args.method, args.endpoint, args.body);
    return permission === 'databases.credentials' || permission === 'pterodactyl.advanced' ? result : this.redactsecrets(result);
  },

  async toggleserver() {
    const enabled = !this.status?.enabled;
    this.status = await window.electronAPI.mcpsetenabled(enabled);
    AppSettings.rendermcp(this.status);
  },

  async setpermission(permission, mode) {
    this.status = await window.electronAPI.mcpsetpermission(permission, mode);
    AppSettings.rendermcp(this.status);
  },

  async setallpermissions(mode) {
    this.status = await window.electronAPI.mcpsetallpermissions(mode);
    AppSettings.rendermcp(this.status);
  },

  async regeneratetoken() {
    this.status = await window.electronAPI.mcpregeneratetoken();
    this._showtoken = false;
    AppSettings.rendermcp(this.status);
  },

  toggletoken() {
    this._showtoken = !this._showtoken;
    AppSettings.rendermcp(this.status);
  },

  async copyvalue(value) {
    await navigator.clipboard.writeText(value || '');
  },

  copyendpoint() {
    return this.copyvalue(this.status?.endpoint || '');
  },

  copytoken() {
    return this.copyvalue(this.status?.token || '');
  },

  copygenericconfig() {
    return this.copyvalue(JSON.stringify({
      type: 'http',
      url: this.status?.endpoint || '',
      headers: { Authorization: 'Bearer ' + (this.status?.token || '') },
    }, null, 2));
  },

  confirmregenerate() {
    Modal.confirm('Regenerate MCP token', 'Existing AI client connections will stop working until their token is updated.', () => this.regeneratetoken());
  },

  async clearactivity() {
    this.status = await window.electronAPI.mcpclearactivity();
    AppSettings.rendermcp(this.status);
  },
};
