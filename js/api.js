const Api = {
  _cache: {},

  headers(apiKey) {
    return {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/vnd.pterodactyl.v1+json',
      'Content-Type': 'application/json'
    };
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
    const base = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/websocket`, { headers: this.headers(apiKey) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.data || data;
  },

  async power(panelUrl, apiKey, uuid, signal) {
    const base = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/power`, {
      method: 'POST',
      headers: { ...this.headers(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({ signal })
    });
    return res.ok;
  },

  async listfiles(panelUrl, apiKey, uuid, directory = '/') {
    const base = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/files/list?directory=${encodeURIComponent(directory)}`, {
      headers: this.headers(apiKey)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.data || [];
  },

  async readfile(panelUrl, apiKey, uuid, file) {
    const base = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/files/contents?file=${encodeURIComponent(file)}`, {
      headers: this.headers(apiKey)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  },

  async createfolder(panelUrl, apiKey, uuid, name, path) {
    const base = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/files/create-folder`, {
      method: 'POST',
      headers: { ...this.headers(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({ root: path || '/', name })
    });
    return res.ok;
  },

  async writefile(panelUrl, apiKey, uuid, file, content) {
    const base = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/files/write`, {
      method: 'POST',
      headers: { ...this.headers(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({ file, content })
    });
    return res.ok;
  },

  async uploadfiles(panelUrl, apiKey, uuid, directory, files) {
    const base = panelUrl.replace(/\/+$/, '');
    const dir = directory || '/';
    const urlRes = await fetch(`${base}/api/client/servers/${uuid}/files/upload?directory=${encodeURIComponent(dir)}`, {
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
    const base = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/files/rename`, {
      method: 'PUT',
      headers: this.headers(apiKey),
      body: JSON.stringify({ root, files: [{ from: file, to: newName }] })
    });
    return res.ok;
  },

  async movefiles(panelUrl, apiKey, uuid, root, files, directory) {
    const base = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/files/move`, {
      method: 'PUT',
      headers: this.headers(apiKey),
      body: JSON.stringify({ root, files, directory })
    });
    return res.ok;
  },

  async copyfile(panelUrl, apiKey, uuid, location) {
    const base = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/files/copy`, {
      method: 'POST',
      headers: this.headers(apiKey),
      body: JSON.stringify({ location })
    });
    return res.ok;
  },

  async deletefiles(panelUrl, apiKey, uuid, root, files) {
    const base = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/files/delete`, {
      method: 'POST',
      headers: this.headers(apiKey),
      body: JSON.stringify({ root, files })
    });
    return res.ok;
  },

  async compressfiles(panelUrl, apiKey, uuid, root, files, directory, prefix) {
    const base = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/files/compress`, {
      method: 'POST',
      headers: this.headers(apiKey),
      body: JSON.stringify({ root, files, directory, prefix })
    });
    return res.ok;
  },

  async decompressfile(panelUrl, apiKey, uuid, root, file) {
    const base = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/files/decompress`, {
      method: 'POST',
      headers: this.headers(apiKey),
      body: JSON.stringify({ root, file })
    });
    return res.ok;
  },

  async changefilepermissions(panelUrl, apiKey, uuid, root, file, mode) {
    const base = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/files/chmod`, {
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
    const base = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/activity?sort=-timestamp&page=${page}&include%5B%5D=actor`, {
      headers: this.headers(apiKey)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  },

  async fetchsubusers(panelUrl, apiKey, uuid) {
    const base = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/users`, {
      headers: this.headers(apiKey)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.data || [];
  },

  async invitesubuser(panelUrl, apiKey, uuid, email, permissions) {
    const base = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/users`, {
      method: 'POST',
      headers: { ...this.headers(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, permissions })
    });
    return res.ok;
  },

  async updatesubuser(panelUrl, apiKey, uuid, userUuid, permissions) {
    const base = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/users/${userUuid}`, {
      method: 'POST',
      headers: { ...this.headers(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissions })
    });
    return res.ok;
  },

  async deletesubuser(panelUrl, apiKey, uuid, userUuid) {
    const base = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/users/${userUuid}`, {
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
    const base = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/startup`, { headers: this.headers(apiKey) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  },

  async updatestartupvariable(panelUrl, apiKey, uuid, key, value) {
    const base = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/startup/variable`, {
      method: 'PUT',
      headers: { ...this.headers(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value })
    });
    return res.ok;
  },

  async updatedockerimage(panelUrl, apiKey, uuid, docker_image) {
    const base = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/startup/image`, {
      method: 'PUT',
      headers: { ...this.headers(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({ docker_image })
    });
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
    const base = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/network/allocations`, { headers: this.headers(apiKey) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.data || [];
  },

  async createallocation(panelUrl, apiKey, uuid, ip, port) {
    const base = panelUrl.replace(/\/+$/, '');
    const body = {};
    if (ip) body.ip = ip;
    if (port) body.port = port;
    const res = await fetch(`${base}/api/client/servers/${uuid}/network/allocations`, {
      method: 'POST',
      headers: { ...this.headers(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return res.ok;
  },

  async setprimaryallocation(panelUrl, apiKey, uuid, allocationId) {
    const base = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/network/allocations/${allocationId}/primary`, {
      method: 'POST',
      headers: this.headers(apiKey)
    });
    return res.ok;
  },

  async setallocationnotes(panelUrl, apiKey, uuid, allocationId, notes) {
    const base = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/network/allocations/${allocationId}`, {
      method: 'POST',
      headers: { ...this.headers(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes })
    });
    return res.ok;
  },

  async deleteallocation(panelUrl, apiKey, uuid, allocationId) {
    const base = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/network/allocations/${allocationId}`, {
      method: 'DELETE',
      headers: this.headers(apiKey)
    });
    return res.ok;
  },

  async fetchbackups(panelUrl, apiKey, uuid) {
    const base = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/backups`, { headers: this.headers(apiKey) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.data || [];
  },

  async createbackup(panelUrl, apiKey, uuid, name, ignored, isLocked) {
    const base = panelUrl.replace(/\/+$/, '');
    const body = {};
    if (name) body.name = name;
    if (ignored) body.ignored = ignored;
    if (isLocked) body.is_locked = true;
    const res = await fetch(`${base}/api/client/servers/${uuid}/backups`, {
      method: 'POST',
      headers: { ...this.headers(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return res.ok;
  },

  async deletebackup(panelUrl, apiKey, uuid, backupUuid) {
    const base = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/backups/${backupUuid}`, {
      method: 'DELETE',
      headers: this.headers(apiKey)
    });
    return res.ok;
  },

  async restorebackup(panelUrl, apiKey, uuid, backupUuid) {
    const base = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/backups/${backupUuid}/restore`, {
      method: 'POST',
      headers: { ...this.headers(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({ truncate: true })
    });
    return res.ok || res.status === 202;
  },

  async downloadbackup(panelUrl, apiKey, uuid, backupUuid) {
    const base = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/backups/${backupUuid}/download`, {
      headers: this.headers(apiKey)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return (data.attributes && data.attributes.url) || data.url || '';
  },

  async togglebackuplock(panelUrl, apiKey, uuid, backupUuid) {
    const base = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/backups/${backupUuid}/lock`, {
      method: 'POST',
      headers: { ...this.headers(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    return res.ok;
  },

  async fetchdatabases(panelUrl, apiKey, uuid) {
    const base = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/databases?include=password`, { headers: this.headers(apiKey) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.data || [];
  },

  async createdatabase(panelUrl, apiKey, uuid, database, remote) {
    const base = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/databases`, {
      method: 'POST',
      headers: { ...this.headers(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({ database, remote })
    });
    return res.ok;
  },

  async deletedatabase(panelUrl, apiKey, uuid, dbId) {
    const base = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/databases/${dbId}`, {
      method: 'DELETE',
      headers: this.headers(apiKey)
    });
    return res.ok;
  },

  async rotatedatabasepassword(panelUrl, apiKey, uuid, dbId) {
    const base = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/databases/${dbId}/rotate-password`, {
      method: 'POST',
      headers: { ...this.headers(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    return res.ok;
  },

  async fetchschedules(panelUrl, apiKey, uuid) {
    const base = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/schedules`, { headers: this.headers(apiKey) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.data || [];
  },

  async fetchscheduledetail(panelUrl, apiKey, uuid, scheduleId) {
    const base = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/schedules/${scheduleId}?include=tasks`, { headers: this.headers(apiKey) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
    const base = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/schedules`, {
      method: 'POST',
      headers: { ...this.headers(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.ok;
  },

  async updateschedule(panelUrl, apiKey, uuid, scheduleId, payload) {
    const base = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/schedules/${scheduleId}`, {
      method: 'POST',
      headers: { ...this.headers(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.ok;
  },

  async deleteschedule(panelUrl, apiKey, uuid, scheduleId) {
    const base = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/schedules/${scheduleId}`, {
      method: 'DELETE',
      headers: this.headers(apiKey)
    });
    return res.ok;
  },

  async executeschedule(panelUrl, apiKey, uuid, scheduleId) {
    const base = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/schedules/${scheduleId}/execute`, {
      method: 'POST',
      headers: { ...this.headers(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    return res.ok;
  },

  async createscheduletask(panelUrl, apiKey, uuid, scheduleId, payload) {
    const base = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/schedules/${scheduleId}/tasks`, {
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
    const base = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${base}/api/client/servers/${uuid}/schedules/${scheduleId}/tasks/${taskId}`, {
      method: 'DELETE',
      headers: this.headers(apiKey)
    });
    return res.ok;
  }
};
