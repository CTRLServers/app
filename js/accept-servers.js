const AcceptServers = {
  pending: [],
  excluded: new Set(),

  init() {
    this.pending = [];
    window.electronAPI?.onacceptservers?.(({ servers } = {}) => {
      if (Array.isArray(servers)) this.receive(servers);
    });
  },

  panelkey(panelUrl) {
    return String(panelUrl || '').replace(/\/+$/, '').toLowerCase();
  },

  sameServer(a, b) {
    if (this.panelkey(a.panelUrl) !== this.panelkey(b.panelUrl)) return false;
    const ids = [a.uuid, a.identifier].filter(Boolean);
    return ids.includes(b.uuid) || ids.includes(b.identifier);
  },

  receive(servers) {
    for (const incoming of servers) {
      const server = {
        name: String(incoming.name || 'Unnamed').slice(0, 200),
        panelUrl: String(incoming.panelUrl || '').replace(/\/+$/, '').slice(0, 500),
        identifier: String(incoming.identifier || incoming.uuid || '').trim(),
        uuid: String(incoming.uuid || incoming.identifier || '').trim(),
        apiKey: String(incoming.apiKey || ''),
        node: String(incoming.node || '').slice(0, 200),
        description: String(incoming.description || '').slice(0, 1000),
        username: String(incoming.username || '').slice(0, 200),
        host: String(incoming.host || '').slice(0, 200),
        port: String(incoming.port || '').slice(0, 20),
        limits: incoming.limits || {},
      };
      if (!server.panelUrl || !server.uuid) continue;

      const pendingIndex = this.pending.findIndex(item => this.sameServer(item, server));
      if (pendingIndex === -1) this.pending.push(server);
      else this.pending[pendingIndex] = server;
    }

    this.excluded.clear();
    if (App.currentServer) App.showserverlist();
    App.navigateto('accept-servers');
    this.render();
  },

  findExisting(server) {
    return Servers.list.find(saved => saved.type === 'Pterodactyl' && this.sameServer(saved, server));
  },

  isDuplicate(server) {
    return Boolean(this.findExisting(server));
  },

  render() {
    const root = Utils.el('tabAcceptServers');
    if (!root) return;

    if (!this.pending.length) {
      root.innerHTML = '<div class="empty-state" style="display:flex"><h2>No pending servers</h2><p>Send servers to <span style="font-family:monospace">http://127.0.0.1:12747/accept-servers</span> via POST, or go back to the dashboard.</p><button class="btn btn-secondary" id="acceptBackBtn">Back to Dashboard</button></div>';
      root.querySelector('#acceptBackBtn')?.addEventListener('click', () => App.navigateto('dashboard'));
      return;
    }

    root.innerHTML = `
      <p class="modal-text">${this.pending.length} server(s) received for review. Uncheck any server to exclude it.</p>
      <div class="server-select-list">
        ${this.pending.map((server, index) => {
          const duplicate = this.isDuplicate(server);
          const selected = !this.excluded.has(index);
          return `<div class="server-select-item${selected ? ' selected' : ''}${duplicate ? ' is-duplicate' : ''}" data-accept-idx="${index}">
            <div class="server-checkbox"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="3"><polyline points="20 6 9 17 4 12" /></svg></div>
            <div class="server-select-info">
              <div class="server-select-name">${Utils.escape(server.name)}${duplicate ? ' (already added - will be updated)' : ''}</div>
              <div class="server-select-detail">${Utils.escape(server.panelUrl)} &middot; ${Utils.escape(server.identifier || server.uuid)}${server.node ? ' &middot; ' + Utils.escape(server.node) : ''}</div>
              ${server.description ? `<div class="server-select-detail">${Utils.escape(server.description)}</div>` : ''}
              ${server.username ? `<div class="server-select-detail">User: ${Utils.escape(server.username)}</div>` : ''}
              <div class="server-select-detail">Type: Pterodactyl</div>
            </div>
          </div>`;
        }).join('')}
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" id="acceptCancelBtn">Cancel</button>
        <button type="button" class="btn btn-primary" id="acceptImportBtn">Import Selected</button>
      </div>`;

    root.querySelectorAll('[data-accept-idx]').forEach(item => {
      item.addEventListener('click', () => {
        const index = Number(item.dataset.acceptIdx);
        if (this.excluded.has(index)) this.excluded.delete(index);
        else this.excluded.add(index);
        item.classList.toggle('selected', !this.excluded.has(index));
      });
    });
    root.querySelector('#acceptCancelBtn').addEventListener('click', () => this.cancel());
    root.querySelector('#acceptImportBtn').addEventListener('click', () => this.confirm());
  },

  cancel() {
    this.pending = [];
    this.excluded.clear();
    App.navigateto('dashboard');
  },

  async confirm() {
    const selected = this.pending.filter((_, index) => !this.excluded.has(index));
    const imports = [];
    for (const incoming of selected) {
      let apiKey = incoming.apiKey;
      if (apiKey && !apiKey.startsWith('enc:')) {
        try {
          apiKey = `enc:${await window.electronAPI.cryptoencrypt(apiKey)}`;
        } catch {
          Modal.alert('Import Failed', 'CTRLServers could not encrypt the API key. The server was not imported.');
          return;
        }
      }
      imports.push({ incoming, apiKey });
    }

    let added = 0;
    let updated = 0;

    for (const { incoming, apiKey } of imports) {
      const saved = this.findExisting(incoming);
      if (saved) {
        const oldUuid = saved.uuid;
        Servers.clearapikeycache(saved);
        Object.assign(saved, {
          name: incoming.name || saved.name,
          description: incoming.description || saved.description || '',
          panelUrl: incoming.panelUrl,
          identifier: incoming.identifier || saved.identifier,
          uuid: incoming.uuid || saved.uuid,
          apiKey: apiKey || saved.apiKey,
          node: incoming.node || saved.node || '',
          host: incoming.host || saved.host || incoming.panelUrl.replace(/^https?:\/\//, ''),
          port: incoming.port || saved.port || '',
          limits: incoming.limits || saved.limits || {},
        });
        Servers.clearapikeycache(saved);
        if (typeof ServerConsole !== 'undefined') ServerConsole.credentialsChanged(saved, oldUuid);
        if (window.electronAPI?.monitorupdatecredentials) {
          const plainKey = await Servers.resolveapikey(saved);
          window.electronAPI.monitorupdatecredentials(saved.id, plainKey);
        }
        updated++;
        continue;
      }

      const newServer = {
        id: Date.now() + Math.random(),
        type: 'Pterodactyl',
        name: incoming.name,
        description: incoming.description || '',
        panelUrl: incoming.panelUrl,
        identifier: incoming.identifier,
        apiKey,
        uuid: incoming.uuid,
        node: incoming.node,
        host: incoming.host || incoming.panelUrl.replace(/^https?:\/\//, ''),
        port: incoming.port,
        limits: incoming.limits || {},
        allocations: [],
        status: 'offline',
      };
      Servers.list.push(newServer);
      added++;
    }

    Servers.save();
    Servers.render();
    Servers.fetchallfromapi();
    if (typeof CTRLCloud !== 'undefined') CTRLCloud.autosyncupload('add');

    this.pending = [];
    this.excluded.clear();
    App.navigateto('dashboard');
    Modal.alert('Import Complete', `Imported ${added} new server(s)${updated ? `, updated ${updated} existing` : ''}.`);
  },
};
