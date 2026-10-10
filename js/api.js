const nativepanelfetch = window.fetch.bind(window);

window.fetch = async (url, options = {}) => {
  try {
    return await nativepanelfetch(url, options);
  } catch (error) {
    const address = typeof url === 'string' ? url : url?.url;
    const body = options?.body;
    if (!address || !/^https?:\/\//i.test(address) || body instanceof FormData || body instanceof Blob || body instanceof ArrayBuffer || !window.electronAPI?.panelrequest) throw error;
    const result = await window.electronAPI.panelrequest(address, {
      method: options.method || 'GET',
      headers: Object.fromEntries(new Headers(options.headers || {}).entries()),
      body: body == null ? null : String(body)
    });
    const binary = atob(result.body || '');
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return new Response(bytes.length ? bytes : null, {
      status: result.status,
      statusText: result.statustext || '',
      headers: result.headers || {}
    });
  }
};

const Api = {
  _cache: {},
  _daemonroutes: {},

  headers(apiKey) {
    return {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/vnd.pterodactyl.v1+json',
      'Content-Type': 'application/json'
    };
  },

  async pterodactylrequest(panelurl, apikey, uuid, path, options = {}) {
    const base = panelurl.replace(/\/+$/, '');
    const requestoptions = { ...options, headers: options.headers || this.headers(apikey) };
    const routekey = `${base}|${uuid}`;
    const routes = [
      `${base}/api/client/servers/${uuid}${path}`,
      `${base}/api/client/servers/wings/${uuid}${path}`,
      `${base}/api/client/servers/elytra/${uuid}${path}`
    ];
    const knownroute = this._daemonroutes[routekey];
    if (knownroute !== undefined) return fetch(routes[knownroute], requestoptions);
    let response;
    for (let routeindex = 0; routeindex < routes.length; routeindex++) {
      response = await fetch(routes[routeindex], requestoptions);
      if (response.status !== 404) {
        this._daemonroutes[routekey] = routeindex;
        return response;
      }
    }
    return response;
  },

  calagopusheaders(apiKey) {
    return {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };
  },

  calagopuserror(raw, status) {
    let message = `HTTP ${status}`;
    try {
      const data = raw ? JSON.parse(raw) : {};
      const errors = Array.isArray(data.errors) ? data.errors : Object.values(data.errors || {});
      message = errors.map(item => typeof item === 'string' ? item : item.detail || item.message || JSON.stringify(item)).join('; ') || data.message || message;
    } catch (error) {
      if (raw) message += `: ${raw.slice(0, 500)}`;
    }
    return message;
  },

  async fetchcalagopusservers(panelUrl, apiKey) {
    const base = panelUrl.replace(/\/+$/, '');
    const servers = [];
    let page = 1;
    let lastPage = 1;
    do {
      const res = await fetch(`${base}/api/client/servers?page=${page}&per_page=100`, {
        headers: this.calagopusheaders(apiKey)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const pagination = data.servers || {};
      servers.push(...(pagination.data || []));
      lastPage = Math.max(1, Math.ceil((pagination.total || servers.length) / (pagination.per_page || 100)));
      page++;
    } while (page <= lastPage);
    return servers;
  },

  async fetchcalagopusserver(panelUrl, apiKey, uuid) {
    const base = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}`, { headers: this.calagopusheaders(apiKey) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.server || data;
  },

  async fetchcalagopusresources(panelUrl, apiKey, uuid) {
    const base = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/resources`, { headers: this.calagopusheaders(apiKey) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.resources || data;
  },

  async fetchcalagopuswebsocket(panelUrl, apiKey, uuid) {
    const base = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/websocket`, { headers: this.calagopusheaders(apiKey) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { token: data.token, socket: data.url };
  },

  async calagopuspower(panelUrl, apiKey, uuid, action) {
    const base = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/power`, {
      method: 'POST',
      headers: this.calagopusheaders(apiKey),
      body: JSON.stringify({ action })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return true;
  },

  async fetchcalagopusaccount(panelUrl, apiKey) {
    const base = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/account`, { headers: this.calagopusheaders(apiKey) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.user || data;
  },

  async listcalagopusfiles(panelUrl, apiKey, uuid, directory = '/') {
    const base = panelUrl.replace(/\/+$/, '');
    const files = [];
    let page = 1;
    let total = 0;
    let metadata = {};
    do {
      const params = new URLSearchParams({ directory, page: String(page), per_page: '100', sort: 'name_asc' });
      const res = await fetch(`${base}/api/client/servers/${uuid}/files/list?${params}`, {
        headers: this.calagopusheaders(apiKey)
      });
      if (!res.ok) throw new Error(this.calagopuserror(await res.text(), res.status));
      const data = await res.json();
      metadata = data;
      const entries = data.entries || {};
      const batch = entries.data || [];
      files.push(...batch.map(entry => ({ attributes: {
        name: entry.name,
        mimetype: entry.directory ? 'inode/directory' : (entry.mime || 'application/octet-stream'),
        is_file: !!entry.file,
        is_directory: !!entry.directory,
        is_symlink: !!entry.symlink,
        is_virtual: !!entry.virtual,
        editable: entry.editable !== false,
        inner_editable: !!entry.inner_editable,
        size: entry.size || 0,
        physical_size: entry.size_physical || 0,
        modified_at: entry.modified,
        created_at: entry.created,
        mode: entry.mode,
        mode_bits: entry.mode_bits
      }})));
      total = Number(entries.total || files.length);
      page++;
    } while (files.length < total);
    files.filesystemwritable = metadata.is_filesystem_writable !== false;
    files.filesystemprimary = metadata.is_filesystem_primary !== false;
    files.filesystemfast = metadata.is_filesystem_fast !== false;
    files.uploads = metadata.uploads || [];
    return files;
  },

  async calagopusfileaction(panelUrl, apiKey, uuid, endpoint, method = 'POST', body = null, query = '') {
    const base = panelUrl.replace(/\/+$/, '');
    const options = { method, headers: this.calagopusheaders(apiKey) };
    if (body !== null) options.body = typeof body === 'string' ? body : JSON.stringify(body);
    if (typeof body === 'string') options.headers['Content-Type'] = 'text/plain; charset=UTF-8';
    const res = await fetch(`${base}/api/client/servers/${uuid}/files/${endpoint}${query}`, options);
    if (!res.ok) {
      throw new Error(this.calagopuserror(await res.text(), res.status));
    }
    const type = res.headers.get('content-type') || '';
    return type.includes('application/json') ? res.json() : res.text();
  },

  async uploadcalagopusfiles(panelUrl, apiKey, uuid, directory, files) {
    const base = panelUrl.replace(/\/+$/, '');
    const urlRes = await fetch(`${base}/api/client/servers/${uuid}/files/upload`, {
      headers: this.calagopusheaders(apiKey)
    });
    if (!urlRes.ok) throw new Error(this.calagopuserror(await urlRes.text(), urlRes.status));
    const data = await urlRes.json();
    if (!data.url) throw new Error('No upload URL returned');
    const form = new FormData();
    files.forEach(item => form.append('files', item.file, item.relPath.replace(/\\/g, '/')));
    const separator = data.url.includes('?') ? '&' : '?';
    const res = await fetch(`${data.url}${separator}directory=${encodeURIComponent(directory || '/')}`, {
      method: 'POST', body: form
    });
    if (!res.ok) throw new Error(`Upload failed: ${this.calagopuserror(await res.text(), res.status)}`);
    return true;
  },

  async fetchservers(panelUrl, apiKey) {
    const base = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client`, { headers: this.headers(apiKey) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.data || [];
  },

  async fetchserver(panelUrl, apiKey, uuid) {
    const base = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}`, { headers: this.headers(apiKey) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return (data.data && data.data.attributes) || data.attributes || data;
  },

  async fetchresources(panelUrl, apiKey, uuid) {
    const base = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/resources`, { headers: this.headers(apiKey) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return (data.data && data.data.attributes) || data.attributes || data;
  },

  async fetchwebsocket(panelUrl, apiKey, uuid) {
    const res = await this.pterodactylrequest(panelUrl, apiKey, uuid, '/websocket');
    if (!res.ok) throw new Error(this.calagopuserror(await res.text(), res.status));
    const data = await res.json();
    return data.data || data;
  },

  async power(panelUrl, apiKey, uuid, signal) {
    const res = await this.pterodactylrequest(panelUrl, apiKey, uuid, '/power', {
      method: 'POST',
      headers: { ...this.headers(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({ signal })
    });
    if (!res.ok) throw new Error(this.calagopuserror(await res.text(), res.status));
    return res.ok;
  },

  async listfiles(panelUrl, apiKey, uuid, directory = '/') {
    const res = await this.pterodactylrequest(panelUrl, apiKey, uuid, `/files/list?directory=${encodeURIComponent(directory)}`);
    if (!res.ok) throw new Error(this.calagopuserror(await res.text(), res.status));
    const data = await res.json();
    return data.data || [];
  },

  async readfile(panelUrl, apiKey, uuid, file) {
    const res = await this.pterodactylrequest(panelUrl, apiKey, uuid, `/files/contents?file=${encodeURIComponent(file)}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/vnd.pterodactyl.v1+json'
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const content = new TextDecoder('utf-8').decode(await res.arrayBuffer());
    if (content.length) return content;

    const downloadres = await this.pterodactylrequest(panelUrl, apiKey, uuid, `/files/download?file=${encodeURIComponent(file)}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/vnd.pterodactyl.v1+json'
      }
    });
    if (!downloadres.ok) throw new Error(`HTTP ${downloadres.status}`);
    const downloaddata = await downloadres.json();
    const signedurl = downloaddata.attributes?.url || downloaddata.data?.attributes?.url;
    if (!signedurl) throw new Error('Pterodactyl did not return a file download URL');
    const fileres = await fetch(signedurl);
    if (!fileres.ok) throw new Error(`File download failed: HTTP ${fileres.status}`);
    return new TextDecoder('utf-8').decode(await fileres.arrayBuffer());
  },

  async createfolder(panelUrl, apiKey, uuid, name, path) {
    const res = await this.pterodactylrequest(panelUrl, apiKey, uuid, '/files/create-folder', {
      method: 'POST',
      headers: { ...this.headers(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({ root: path || '/', name })
    });
    return res.ok;
  },

  async writefile(panelUrl, apiKey, uuid, file, content) {
    const res = await this.pterodactylrequest(panelUrl, apiKey, uuid, `/files/write?file=${encodeURIComponent(file)}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/vnd.pterodactyl.v1+json',
        'Content-Type': 'text/plain; charset=UTF-8'
      },
      body: String(content ?? '')
    });
    if (!res.ok) {
      const details = (await res.text()).slice(0, 1000);
      throw new Error(`HTTP ${res.status}${details ? ': ' + details : ''}`);
    }
    return true;
  },

  async uploadfiles(panelUrl, apiKey, uuid, directory, files) {
    const dir = directory || '/';
    const urlRes = await this.pterodactylrequest(panelUrl, apiKey, uuid, `/files/upload?directory=${encodeURIComponent(dir)}`, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/vnd.pterodactyl.v1+json' }
    });
    if (!urlRes.ok) throw new Error('Failed to get upload URL');
    const urlData = await urlRes.json();
    const signedUrl = urlData.attributes && urlData.attributes.url;
    if (!signedUrl) throw new Error('No signed URL');
    const formData = new FormData();
    for (const f of files) {
      formData.append('files', f.file, f.relPath.split('/').pop());
    }
    formData.append('directory', dir);
    const separator = signedUrl.includes('?') ? '&' : '?';
    const uploadRes = await fetch(`${signedUrl}${separator}directory=${encodeURIComponent(dir)}`, {
      method: 'POST',
      body: formData
    });
    return uploadRes.ok;
  },

  async renamefile(panelUrl, apiKey, uuid, root, file, newName) {
    const res = await this.pterodactylrequest(panelUrl, apiKey, uuid, '/files/rename', {
      method: 'PUT',
      headers: this.headers(apiKey),
      body: JSON.stringify({ root, files: [{ from: file, to: newName }] })
    });
    return res.ok;
  },

  async movefiles(panelUrl, apiKey, uuid, root, files, directory) {
    const res = await this.pterodactylrequest(panelUrl, apiKey, uuid, '/files/move', {
      method: 'PUT',
      headers: this.headers(apiKey),
      body: JSON.stringify({ root, files, directory })
    });
    return res.ok;
  },

  async copyfile(panelUrl, apiKey, uuid, location) {
    const res = await this.pterodactylrequest(panelUrl, apiKey, uuid, '/files/copy', {
      method: 'POST',
      headers: this.headers(apiKey),
      body: JSON.stringify({ location })
    });
    return res.ok;
  },

  async deletefiles(panelUrl, apiKey, uuid, root, files) {
    const res = await this.pterodactylrequest(panelUrl, apiKey, uuid, '/files/delete', {
      method: 'POST',
      headers: this.headers(apiKey),
      body: JSON.stringify({ root, files })
    });
    return res.ok;
  },

  async compressfiles(panelUrl, apiKey, uuid, root, files, directory, prefix) {
    const res = await this.pterodactylrequest(panelUrl, apiKey, uuid, '/files/compress', {
      method: 'POST',
      headers: this.headers(apiKey),
      body: JSON.stringify({ root, files, directory, prefix })
    });
    return res.ok;
  },

  async decompressfile(panelUrl, apiKey, uuid, root, file) {
    const res = await this.pterodactylrequest(panelUrl, apiKey, uuid, '/files/decompress', {
      method: 'POST',
      headers: this.headers(apiKey),
      body: JSON.stringify({ root, file })
    });
    return res.ok;
  },

  async changefilepermissions(panelUrl, apiKey, uuid, root, file, mode) {
    const res = await this.pterodactylrequest(panelUrl, apiKey, uuid, '/files/chmod', {
      method: 'POST',
      headers: this.headers(apiKey),
      body: JSON.stringify({ root, files: [{ file, mode }] })
    });
    return res.ok;
  },

  async getcachedserver(panelUrl, apiKey, uuid) {
    const key = `${panelUrl}|${apiKey}|${uuid}`;
    if (this._cache[key]) return this._cache[key];
    const data = await this.fetchserver(panelUrl, apiKey, uuid);
    this._cache[key] = data;
    setTimeout(() => delete this._cache[key], 60000);
    return data;
  },

  async fetchactivity(panelUrl, apiKey, uuid, page = 1) {
    const res = await this.pterodactylrequest(panelUrl, apiKey, uuid, `/activity?sort=-timestamp&page=${page}&include%5B%5D=actor`);
    if (!res.ok) throw new Error(this.calagopuserror(await res.text(), res.status));
    return await res.json();
  },

  async fetchsubusers(panelUrl, apiKey, uuid) {
    const res = await this.pterodactylrequest(panelUrl, apiKey, uuid, '/users');
    if (!res.ok) throw new Error(this.calagopuserror(await res.text(), res.status));
    const data = await res.json();
    return data.data || [];
  },

  async invitesubuser(panelUrl, apiKey, uuid, email, permissions) {
    const res = await this.pterodactylrequest(panelUrl, apiKey, uuid, '/users', {
      method: 'POST',
      headers: { ...this.headers(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, permissions })
    });
    return res.ok;
  },

  async updatesubuser(panelUrl, apiKey, uuid, userUuid, permissions) {
    const res = await this.pterodactylrequest(panelUrl, apiKey, uuid, `/users/${userUuid}`, {
      method: 'POST',
      headers: { ...this.headers(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissions })
    });
    return res.ok;
  },

  async deletesubuser(panelUrl, apiKey, uuid, userUuid) {
    const res = await this.pterodactylrequest(panelUrl, apiKey, uuid, `/users/${userUuid}`, {
      method: 'DELETE',
      headers: this.headers(apiKey)
    });
    return res.ok;
  },

  async fetchaccount(panelUrl, apiKey) {
    const base = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/account`, { headers: this.headers(apiKey) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return (data.data && data.data.attributes) || data.attributes || data;
  },

  async fetchstartup(panelUrl, apiKey, uuid) {
    const res = await this.pterodactylrequest(panelUrl, apiKey, uuid, '/startup');
    if (!res.ok) throw new Error(this.calagopuserror(await res.text(), res.status));
    return await res.json();
  },

  async updatestartupvariable(panelUrl, apiKey, uuid, key, value) {
    const res = await this.pterodactylrequest(panelUrl, apiKey, uuid, '/startup/variable', {
      method: 'PUT',
      headers: { ...this.headers(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value })
    });
    return res.ok;
  },

  async updatedockerimage(panelUrl, apiKey, uuid, docker_image) {
    let res = await this.pterodactylrequest(panelUrl, apiKey, uuid, '/startup/image', {
      method: 'PUT',
      headers: { ...this.headers(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({ docker_image })
    });
    if (res.status === 404) {
      res = await this.pterodactylrequest(panelUrl, apiKey, uuid, '/settings/docker-image', {
        method: 'PUT',
        headers: { ...this.headers(apiKey), 'Content-Type': 'application/json' },
        body: JSON.stringify({ docker_image })
      });
    }
    return res.ok;
  },

  async renameserver(panelUrl, apiKey, uuid, name, description) {
    const base = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/settings/rename`, {
      method: 'POST',
      headers: { ...this.headers(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description: description || null })
    });
    return res.ok;
  },

  async fetchnetwork(panelUrl, apiKey, uuid) {
    const res = await this.pterodactylrequest(panelUrl, apiKey, uuid, '/network/allocations');
    if (!res.ok) throw new Error(this.calagopuserror(await res.text(), res.status));
    const data = await res.json();
    return data.data || [];
  },

  async createallocation(panelUrl, apiKey, uuid, ip, port) {
    const body = {};
    if (ip) body.ip = ip;
    if (port) body.port = port;
    const res = await this.pterodactylrequest(panelUrl, apiKey, uuid, '/network/allocations', {
      method: 'POST',
      headers: { ...this.headers(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return res.ok;
  },

  async setprimaryallocation(panelUrl, apiKey, uuid, allocationId) {
    const res = await this.pterodactylrequest(panelUrl, apiKey, uuid, `/network/allocations/${allocationId}/primary`, {
      method: 'POST',
      headers: this.headers(apiKey)
    });
    return res.ok;
  },

  async setallocationnotes(panelUrl, apiKey, uuid, allocationId, notes) {
    const res = await this.pterodactylrequest(panelUrl, apiKey, uuid, `/network/allocations/${allocationId}`, {
      method: 'POST',
      headers: { ...this.headers(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes })
    });
    return res.ok;
  },

  async deleteallocation(panelUrl, apiKey, uuid, allocationId) {
    const res = await this.pterodactylrequest(panelUrl, apiKey, uuid, `/network/allocations/${allocationId}`, {
      method: 'DELETE',
      headers: this.headers(apiKey)
    });
    return res.ok;
  },

  async fetchbackups(panelUrl, apiKey, uuid) {
    const res = await this.pterodactylrequest(panelUrl, apiKey, uuid, '/backups');
    if (!res.ok) throw new Error(this.calagopuserror(await res.text(), res.status));
    const data = await res.json();
    return data.data || [];
  },

  async createbackup(panelUrl, apiKey, uuid, name, ignored, isLocked) {
    const body = {};
    if (name) body.name = name;
    if (ignored) body.ignored = ignored;
    if (isLocked) body.is_locked = true;
    const res = await this.pterodactylrequest(panelUrl, apiKey, uuid, '/backups', {
      method: 'POST',
      headers: { ...this.headers(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return res.ok;
  },

  async deletebackup(panelUrl, apiKey, uuid, backupUuid) {
    const res = await this.pterodactylrequest(panelUrl, apiKey, uuid, `/backups/${backupUuid}`, {
      method: 'DELETE',
      headers: this.headers(apiKey)
    });
    return res.ok;
  },

  async restorebackup(panelUrl, apiKey, uuid, backupUuid) {
    const res = await this.pterodactylrequest(panelUrl, apiKey, uuid, `/backups/${backupUuid}/restore`, {
      method: 'POST',
      headers: { ...this.headers(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({ truncate: true })
    });
    return res.ok || res.status === 202;
  },

  async downloadbackup(panelUrl, apiKey, uuid, backupUuid) {
    const res = await this.pterodactylrequest(panelUrl, apiKey, uuid, `/backups/${backupUuid}/download`);
    if (!res.ok) throw new Error(this.calagopuserror(await res.text(), res.status));
    const data = await res.json();
    return (data.attributes && data.attributes.url) || data.url || '';
  },

  async togglebackuplock(panelUrl, apiKey, uuid, backupUuid) {
    const res = await this.pterodactylrequest(panelUrl, apiKey, uuid, `/backups/${backupUuid}/lock`, {
      method: 'POST',
      headers: { ...this.headers(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    return res.ok;
  },

  async fetchdatabases(panelUrl, apiKey, uuid) {
    const res = await this.pterodactylrequest(panelUrl, apiKey, uuid, '/databases?include=password');
    if (!res.ok) throw new Error(this.calagopuserror(await res.text(), res.status));
    const data = await res.json();
    return data.data || [];
  },

  async createdatabase(panelUrl, apiKey, uuid, database, remote) {
    const res = await this.pterodactylrequest(panelUrl, apiKey, uuid, '/databases', {
      method: 'POST',
      headers: { ...this.headers(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({ database, remote })
    });
    return res.ok;
  },

  async deletedatabase(panelUrl, apiKey, uuid, dbId) {
    const res = await this.pterodactylrequest(panelUrl, apiKey, uuid, `/databases/${dbId}`, {
      method: 'DELETE',
      headers: this.headers(apiKey)
    });
    return res.ok;
  },

  async rotatedatabasepassword(panelUrl, apiKey, uuid, dbId) {
    const res = await this.pterodactylrequest(panelUrl, apiKey, uuid, `/databases/${dbId}/rotate-password`, {
      method: 'POST',
      headers: { ...this.headers(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    return res.ok;
  },

  async fetchschedules(panelUrl, apiKey, uuid) {
    const res = await this.pterodactylrequest(panelUrl, apiKey, uuid, '/schedules');
    if (!res.ok) throw new Error(this.calagopuserror(await res.text(), res.status));
    const data = await res.json();
    return data.data || [];
  },

  async fetchscheduledetail(panelUrl, apiKey, uuid, scheduleId) {
    const res = await this.pterodactylrequest(panelUrl, apiKey, uuid, `/schedules/${scheduleId}?include=tasks`);
    if (!res.ok) throw new Error(this.calagopuserror(await res.text(), res.status));
    const data = await res.json();
    const raw = data.data || data;
    const attrs = raw.attributes || raw;
    attrs.id = raw.id || scheduleId;
    if (!attrs.relationships) {
      attrs.relationships = raw.relationships || {};
    }
    return attrs;
  },

  async createschedule(panelUrl, apiKey, uuid, payload) {
    const res = await this.pterodactylrequest(panelUrl, apiKey, uuid, '/schedules', {
      method: 'POST',
      headers: { ...this.headers(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.ok;
  },

  async updateschedule(panelUrl, apiKey, uuid, scheduleId, payload) {
    const res = await this.pterodactylrequest(panelUrl, apiKey, uuid, `/schedules/${scheduleId}`, {
      method: 'POST',
      headers: { ...this.headers(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.ok;
  },

  async deleteschedule(panelUrl, apiKey, uuid, scheduleId) {
    const res = await this.pterodactylrequest(panelUrl, apiKey, uuid, `/schedules/${scheduleId}`, {
      method: 'DELETE',
      headers: this.headers(apiKey)
    });
    return res.ok;
  },

  async executeschedule(panelUrl, apiKey, uuid, scheduleId) {
    const res = await this.pterodactylrequest(panelUrl, apiKey, uuid, `/schedules/${scheduleId}/execute`, {
      method: 'POST',
      headers: { ...this.headers(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    return res.ok;
  },

  async createscheduletask(panelUrl, apiKey, uuid, scheduleId, payload) {
    const res = await this.pterodactylrequest(panelUrl, apiKey, uuid, `/schedules/${scheduleId}/tasks`, {
      method: 'POST',
      headers: { ...this.headers(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.text();
      console.error('createscheduletask error:', res.status, err);
    }
    return res.ok;
  },

  async deletescheduletask(panelUrl, apiKey, uuid, scheduleId, taskId) {
    const res = await this.pterodactylrequest(panelUrl, apiKey, uuid, `/schedules/${scheduleId}/tasks/${taskId}`, {
      method: 'DELETE',
      headers: this.headers(apiKey)
    });
    return res.ok;
  },

  async adminrequest(panelurl, apikey, endpoint, method = 'GET', payload = null) {
    const base = panelurl.replace(/\/+$/, '');
    const options = {
      method,
      headers: this.headers(apikey)
    };
    if (payload !== null) options.body = JSON.stringify(payload);
    const response = await fetch(base + endpoint, options);
    let data = null;
    try {
      data = await response.json();
    } catch (error) {}
    if (!response.ok) {
      const errors = data?.errors;
      let detail = '';
      if (Array.isArray(errors)) detail = errors[0]?.detail || '';
      else if (errors && typeof errors === 'object') detail = Object.values(errors).flat()[0] || '';
      const message = data?.message || detail || `HTTP ${response.status}`;
      const requesterror = new Error(message);
      requesterror.status = response.status;
      throw requesterror;
    }
    return data || {};
  }
};
