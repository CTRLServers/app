const Api = {
  _cache: {},

  headers(apikey) {
    return {
      'Authorization': `Bearer ${apikey}`,
      'Accept': 'application/vnd.pterodactyl.v1+json',
      'Content-Type': 'application/json'
    };
  },

  async fetchservers(panelurl, apikey) {
    const base = panelurl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client`, { headers: this.headers(apikey) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.data || [];
  },

  async fetchserver(panelurl, apikey, uuid) {
    const base = panelurl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}`, { headers: this.headers(apikey) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return (data.data && data.data.attributes) || data.attributes || data;
  },

  async fetchresources(panelurl, apikey, uuid) {
    const base = panelurl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/resources`, { headers: this.headers(apikey) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return (data.data && data.data.attributes) || data.attributes || data;
  },

  async fetchwebsocket(panelurl, apikey, uuid) {
    const base = panelurl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/websocket`, { headers: this.headers(apikey) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.data || data;
  },

  async power(panelurl, apikey, uuid, signal) {
    const base = panelurl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/power`, {
      method: 'POST',
      headers: { ...this.headers(apikey), 'Content-Type': 'application/json' },
      body: JSON.stringify({ signal })
    });
    return res.ok;
  },

  async listfiles(panelurl, apikey, uuid, directory = '/') {
    const base = panelurl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/files/list?directory=${encodeURIComponent(directory)}`, {
      headers: this.headers(apikey)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.data || [];
  },

  async readfile(panelurl, apikey, uuid, file) {
    const base = panelurl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/files/contents?file=${encodeURIComponent(file)}`, {
      headers: this.headers(apikey)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  },

  async createfolder(panelurl, apikey, uuid, name, path) {
    const base = panelurl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/files/create-folder`, {
      method: 'POST',
      headers: { ...this.headers(apikey), 'Content-Type': 'application/json' },
      body: JSON.stringify({ root: path || '/', name })
    });
    return res.ok;
  },

  async writefile(panelurl, apikey, uuid, file, content) {
    const base = panelurl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/files/write`, {
      method: 'POST',
      headers: { ...this.headers(apikey), 'Content-Type': 'application/json' },
      body: JSON.stringify({ file, content })
    });
    return res.ok;
  },

  async uploadfiles(panelurl, apikey, uuid, directory, files) {
    const base = panelurl.replace(/\/+$/, '');
    const dir = directory || '/';
    const urlres = await fetch(`${base}/api/client/servers/${uuid}/files/upload?directory=${encodeURIComponent(dir)}`, {
      headers: { 'Authorization': `Bearer ${apikey}`, 'Accept': 'application/vnd.pterodactyl.v1+json' }
    });
    if (!urlres.ok) throw new Error('Failed to get upload URL');
    const urldata = await urlres.json();
    const signedurl = urldata.attributes && urldata.attributes.url;
    if (!signedurl) throw new Error('No signed URL');
    const formdata = new FormData();
    for (const f of files) {
      formdata.append('files', f.file, f.relpath.split('/').pop());
    }
    formdata.append('directory', dir);
    const separator = signedurl.includes('?') ? '&' : '?';
    const uploadres = await fetch(`${signedurl}${separator}directory=${encodeURIComponent(dir)}`, {
      method: 'POST',
      body: formdata
    });
    return uploadres.ok;
  },

  async renamefile(panelurl, apikey, uuid, root, file, newname) {
    const base = panelurl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/files/rename`, {
      method: 'PUT',
      headers: this.headers(apikey),
      body: JSON.stringify({ root, files: [{ from: file, to: newname }] })
    });
    return res.ok;
  },

  async movefiles(panelurl, apikey, uuid, root, files, directory) {
    const base = panelurl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/files/move`, {
      method: 'PUT',
      headers: this.headers(apikey),
      body: JSON.stringify({ root, files, directory })
    });
    return res.ok;
  },

  async copyfile(panelurl, apikey, uuid, location) {
    const base = panelurl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/files/copy`, {
      method: 'POST',
      headers: this.headers(apikey),
      body: JSON.stringify({ location })
    });
    return res.ok;
  },

  async deletefiles(panelurl, apikey, uuid, root, files) {
    const base = panelurl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/files/delete`, {
      method: 'POST',
      headers: this.headers(apikey),
      body: JSON.stringify({ root, files })
    });
    return res.ok;
  },

  async compressfiles(panelurl, apikey, uuid, root, files, directory, prefix) {
    const base = panelurl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/files/compress`, {
      method: 'POST',
      headers: this.headers(apikey),
      body: JSON.stringify({ root, files, directory, prefix })
    });
    return res.ok;
  },

  async decompressfile(panelurl, apikey, uuid, root, file) {
    const base = panelurl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/files/decompress`, {
      method: 'POST',
      headers: this.headers(apikey),
      body: JSON.stringify({ root, file })
    });
    return res.ok;
  },

  async changefilepermissions(panelurl, apikey, uuid, root, file, mode) {
    const base = panelurl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/files/chmod`, {
      method: 'POST',
      headers: this.headers(apikey),
      body: JSON.stringify({ root, files: [{ file, mode }] })
    });
    return res.ok;
  },

  async getcachedserver(panelurl, apikey, uuid) {
    const key = `${panelurl}|${apikey}|${uuid}`;
    if (this._cache[key]) return this._cache[key];
    const data = await this.fetchserver(panelurl, apikey, uuid);
    this._cache[key] = data;
    setTimeout(() => delete this._cache[key], 60000);
    return data;
  },

  async fetchactivity(panelurl, apikey, uuid, page = 1) {
    const base = panelurl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/activity?sort=-timestamp&page=${page}&include%5B%5D=actor`, {
      headers: this.headers(apikey)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  },

  async fetchsubusers(panelurl, apikey, uuid) {
    const base = panelurl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/users`, {
      headers: this.headers(apikey)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.data || [];
  },

  async invitesubuser(panelurl, apikey, uuid, email, permissions) {
    const base = panelurl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/users`, {
      method: 'POST',
      headers: { ...this.headers(apikey), 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, permissions })
    });
    return res.ok;
  },

  async updatesubuser(panelurl, apikey, uuid, useruuid, permissions) {
    const base = panelurl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/users/${useruuid}`, {
      method: 'POST',
      headers: { ...this.headers(apikey), 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissions })
    });
    return res.ok;
  },

  async deletesubuser(panelurl, apikey, uuid, useruuid) {
    const base = panelurl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/users/${useruuid}`, {
      method: 'DELETE',
      headers: this.headers(apikey)
    });
    return res.ok;
  },

  async fetchaccount(panelurl, apikey) {
    const base = panelurl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/account`, { headers: this.headers(apikey) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return (data.data && data.data.attributes) || data.attributes || data;
  },

  async fetchstartup(panelurl, apikey, uuid) {
    const base = panelurl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/startup`, { headers: this.headers(apikey) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  },

  async updatestartupvariable(panelurl, apikey, uuid, key, value) {
    const base = panelurl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/startup/variable`, {
      method: 'PUT',
      headers: { ...this.headers(apikey), 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value })
    });
    return res.ok;
  },

  async updatedockerimage(panelurl, apikey, uuid, docker_image) {
    const base = panelurl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/startup/image`, {
      method: 'PUT',
      headers: { ...this.headers(apikey), 'Content-Type': 'application/json' },
      body: JSON.stringify({ docker_image })
    });
    return res.ok;
  },

  async renameserver(panelurl, apikey, uuid, name, description) {
    const base = panelurl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/settings/rename`, {
      method: 'POST',
      headers: { ...this.headers(apikey), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description: description || null })
    });
    return res.ok;
  },

  async fetchnetwork(panelurl, apikey, uuid) {
    const base = panelurl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/network/allocations`, { headers: this.headers(apikey) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.data || [];
  },

  async createallocation(panelurl, apikey, uuid, ip, port) {
    const base = panelurl.replace(/\/+$/, '');
    const body = {};
    if (ip) body.ip = ip;
    if (port) body.port = port;
    const res = await fetch(`${base}/api/client/servers/${uuid}/network/allocations`, {
      method: 'POST',
      headers: { ...this.headers(apikey), 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return res.ok;
  },

  async setprimaryallocation(panelurl, apikey, uuid, allocationid) {
    const base = panelurl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/network/allocations/${allocationid}/primary`, {
      method: 'POST',
      headers: this.headers(apikey)
    });
    return res.ok;
  },

  async setallocationnotes(panelurl, apikey, uuid, allocationid, notes) {
    const base = panelurl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/network/allocations/${allocationid}`, {
      method: 'POST',
      headers: { ...this.headers(apikey), 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes })
    });
    return res.ok;
  },

  async deleteallocation(panelurl, apikey, uuid, allocationid) {
    const base = panelurl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/network/allocations/${allocationid}`, {
      method: 'DELETE',
      headers: this.headers(apikey)
    });
    return res.ok;
  },

  async fetchbackups(panelurl, apikey, uuid) {
    const base = panelurl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/backups`, { headers: this.headers(apikey) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.data || [];
  },

  async createbackup(panelurl, apikey, uuid, name, ignored, islocked) {
    const base = panelurl.replace(/\/+$/, '');
    const body = {};
    if (name) body.name = name;
    if (ignored) body.ignored = ignored;
    if (islocked) body.is_locked = true;
    const res = await fetch(`${base}/api/client/servers/${uuid}/backups`, {
      method: 'POST',
      headers: { ...this.headers(apikey), 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return res.ok;
  },

  async deletebackup(panelurl, apikey, uuid, backupuuid) {
    const base = panelurl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/backups/${backupuuid}`, {
      method: 'DELETE',
      headers: this.headers(apikey)
    });
    return res.ok;
  },

  async restorebackup(panelurl, apikey, uuid, backupuuid) {
    const base = panelurl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/backups/${backupuuid}/restore`, {
      method: 'POST',
      headers: { ...this.headers(apikey), 'Content-Type': 'application/json' },
      body: JSON.stringify({ truncate: true })
    });
    return res.ok || res.status === 202;
  },

  async downloadbackup(panelurl, apikey, uuid, backupuuid) {
    const base = panelurl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/backups/${backupuuid}/download`, {
      headers: this.headers(apikey)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return (data.attributes && data.attributes.url) || data.url || '';
  },

  async togglebackuplock(panelurl, apikey, uuid, backupuuid) {
    const base = panelurl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/backups/${backupuuid}/lock`, {
      method: 'POST',
      headers: { ...this.headers(apikey), 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    return res.ok;
  },

  async fetchdatabases(panelurl, apikey, uuid) {
    const base = panelurl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/databases?include=password`, { headers: this.headers(apikey) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.data || [];
  },

  async createdatabase(panelurl, apikey, uuid, database, remote) {
    const base = panelurl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/databases`, {
      method: 'POST',
      headers: { ...this.headers(apikey), 'Content-Type': 'application/json' },
      body: JSON.stringify({ database, remote })
    });
    return res.ok;
  },

  async deletedatabase(panelurl, apikey, uuid, dbid) {
    const base = panelurl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/databases/${dbid}`, {
      method: 'DELETE',
      headers: this.headers(apikey)
    });
    return res.ok;
  },

  async rotatedatabasepassword(panelurl, apikey, uuid, dbid) {
    const base = panelurl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/databases/${dbid}/rotate-password`, {
      method: 'POST',
      headers: { ...this.headers(apikey), 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    return res.ok;
  },

  async fetchschedules(panelurl, apikey, uuid) {
    const base = panelurl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/schedules`, { headers: this.headers(apikey) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.data || [];
  },

  async fetchscheduledetail(panelurl, apikey, uuid, scheduleid) {
    const base = panelurl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/schedules/${scheduleid}?include=tasks`, { headers: this.headers(apikey) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const raw = data.data || data;
    const attrs = raw.attributes || raw;
    attrs.id = raw.id || scheduleid;
    if (!attrs.relationships) {
      attrs.relationships = raw.relationships || {};
    }
    return attrs;
  },

  async createschedule(panelurl, apikey, uuid, payload) {
    const base = panelurl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/schedules`, {
      method: 'POST',
      headers: { ...this.headers(apikey), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.ok;
  },

  async updateschedule(panelurl, apikey, uuid, scheduleid, payload) {
    const base = panelurl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/schedules/${scheduleid}`, {
      method: 'POST',
      headers: { ...this.headers(apikey), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.ok;
  },

  async deleteschedule(panelurl, apikey, uuid, scheduleid) {
    const base = panelurl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/schedules/${scheduleid}`, {
      method: 'DELETE',
      headers: this.headers(apikey)
    });
    return res.ok;
  },

  async executeschedule(panelurl, apikey, uuid, scheduleid) {
    const base = panelurl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/schedules/${scheduleid}/execute`, {
      method: 'POST',
      headers: { ...this.headers(apikey), 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    return res.ok;
  },

  async createscheduletask(panelurl, apikey, uuid, scheduleid, payload) {
    const base = panelurl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/schedules/${scheduleid}/tasks`, {
      method: 'POST',
      headers: { ...this.headers(apikey), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.text();
      console.error('createscheduletask error:', res.status, err);
    }
    return res.ok;
  },

  async deletescheduletask(panelurl, apikey, uuid, scheduleid, taskid) {
    const base = panelurl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/schedules/${scheduleid}/tasks/${taskid}`, {
      method: 'DELETE',
      headers: this.headers(apikey)
    });
    return res.ok;
  }
};
