const MultiTerm = {
  _selected: new Set(),
  _running: false,
  _listeners: [],

  load() {
    const el = Utils.el('tabMultiTerm');
    if (!el) return;
    this._cleanup();
    const all = Servers.list.filter(s => (s.type === 'VPS/VDS' && s.host) || (s.type !== 'VPS/VDS' && s.panelUrl && s.apiKey && s.uuid));
    el.innerHTML = `
      <div class="multiterm-container">
        <div class="multiterm-sidebar">
          <div class="multiterm-header">
            <h3>Servers</h3>
            <button class="btn btn-sm btn-secondary" onclick="MultiTerm.selectall()">${this._selected.size === all.length && all.length > 0 ? 'Deselect All' : 'Select All'}</button>
          </div>
          <div class="multiterm-server-list">
            ${all.length === 0 ? '<p class="multiterm-empty">No servers added.</p>' : ''}
            ${all.map((s, i) => {
              const idx = Servers.list.indexOf(s);
              const checked = this._selected.has(idx) ? 'checked' : '';
              const isVps = s.type === 'VPS/VDS';
              const sub = isVps ? Utils.escape(s.host) + ':' + (s.port || 22) : Utils.escape(s.panelUrl || '');
              const display = sub.length > 20 ? sub.slice(0, 20) + '...' : sub;
              return `
                <label class="multiterm-server-item">
                  <input type="checkbox" ${checked} onchange="MultiTerm.toggleselect(${idx})" />
                  <div class="multiterm-server-info">
                    <div class="multiterm-server-name">${Utils.escape(s.name)}</div>
                    <div class="multiterm-server-host">${display}</div>
                  </div>
                </label>`;
            }).join('')}
          </div>
          <div class="multiterm-count">${this._selected.size} of ${all.length} selected</div>
        </div>
        <div class="multiterm-main">
          <div class="multiterm-output" id="multiTermOutput">
            <div class="multiterm-placeholder">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
              <p>Select servers and type a command to run on all of them simultaneously.</p>
            </div>
          </div>
          <div class="multiterm-input-row">
            <span class="multiterm-prompt">&gt;</span>
            <input type="text" class="multiterm-input" id="multiTermInput" placeholder="Type a command..." onkeydown="if(event.key==='Enter')MultiTerm.run()" />
            <button class="btn btn-primary btn-sm" onclick="MultiTerm.run()" id="multiTermRunBtn">Run</button>
          </div>
        </div>
      </div>`;
  },

  _cleanup() {
    for (const fn of this._listeners) { try { fn(); } catch (e) {} }
    this._listeners = [];
  },

  _offlisteners(offFns) {
    for (const fn of offFns) { try { fn(); } catch (e) {} }
  },

  selectall() {
    const all = Servers.list.filter(s => (s.type === 'VPS/VDS' && s.host) || (s.type !== 'VPS/VDS' && s.panelUrl && s.apiKey && s.uuid));
    const allSelected = all.length > 0 && all.every(s => this._selected.has(Servers.list.indexOf(s)));
    if (allSelected) {
      this._selected.clear();
    } else {
      all.forEach(s => this._selected.add(Servers.list.indexOf(s)));
    }
    this.load();
  },

  toggleselect(idx) {
    if (this._selected.has(idx)) this._selected.delete(idx);
    else this._selected.add(idx);
    const countEl = document.querySelector('.multiterm-count');
    const all = Servers.list.filter(s => (s.type === 'VPS/VDS' && s.host) || (s.type !== 'VPS/VDS' && s.panelUrl && s.apiKey && s.uuid));
    if (countEl) countEl.textContent = this._selected.size + ' of ' + all.length + ' selected';
  },

  async run() {
    if (this._running) return;
    const input = Utils.el('multiTermInput');
    const cmd = (input?.value || '').trim();
    if (!cmd) return;
    if (this._selected.size === 0) {
      this._appendoutput('system', 'No servers selected.');
      return;
    }

    this._running = true;
    const btn = Utils.el('multiTermRunBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Running...'; }
    input.value = '';

    this._appendoutput('cmd', '> ' + cmd);

    const selectedIdxs = [...this._selected];
    const pending = new Map();
    for (const idx of selectedIdxs) {
      const server = Servers.list[idx];
      if (!server) continue;
      const row = this._appendloading(server.name);
      pending.set(idx, row);
    }

    const promises = selectedIdxs.map(async (idx) => {
      const server = Servers.list[idx];
      if (!server) return;
      const isVps = server.type === 'VPS/VDS';
      try {
        if (isVps) {
          await this._runvps(server, cmd);
        } else {
          await this._runpterodactyl(server, cmd);
        }
      } catch (e) {
        this._appendoutput('error', server.name, cmd, e.message || 'Connection failed');
      }
      const row = pending.get(idx);
      if (row && row.parentNode) row.remove();
      pending.delete(idx);
    });

    await Promise.allSettled(promises);
    for (const [, row] of pending) { if (row.parentNode) row.remove(); }
    pending.clear();
    this._running = false;
    if (btn) { btn.disabled = false; btn.textContent = 'Run'; }
  },

  async _runvps(server, cmd) {
    const cfg = { host: server.host, port: server.port || 22, username: server.username || 'root' };
    if (server.authType === 'key' && server.privateKey) { cfg.authType = 'privateKey'; cfg.privateKey = server.privateKey; }
    else { cfg.authType = 'password'; cfg.password = server.password || ''; }
    const result = await window.electronAPI?.sshexec?.(cfg, cmd);
    const stdout = result?.stdout || '';
    const stderr = result?.stderr || '';
    const output = stdout + (stderr ? '\n' + stderr : '');
    this._appendoutput('server', server.name, cmd, output.trim() || '(no output)', !stdout && stderr);
  },

  async _runpterodactyl(server, cmd) {
    const data = await Api.fetchwebsocket(server.panelUrl, server.apiKey, server.uuid);
    if (!data || !data.socket || !data.token) throw new Error('Invalid WebSocket response');

    return new Promise((resolve, reject) => {
      let resolved = false;
      let wsId = null;
      let output = '';
      let timeout = null;
      const offFns = [];

      const cleanup = () => {
        if (timeout) clearTimeout(timeout);
        this._offlisteners(offFns);
        if (wsId !== null) {
          try { window.electronAPI.closews(wsId); } catch (e) {}
        }
      };

      const msgCb = (id, rawData) => {
        if (id !== wsId) return;
        try {
          const msg = JSON.parse(rawData);
          if (msg.event === 'auth success') {
            window.electronAPI.sendws(wsId, JSON.stringify({ event: 'send command', args: [cmd] }));
          } else if (msg.event === 'console output') {
            if (msg.args && msg.args[0]) output += this._stripansi(msg.args[0]);
          } else if (msg.event === 'token expired') {
            cleanup();
            if (!resolved) { resolved = true; reject(new Error('Token expired')); }
          }
        } catch (e) {}
      };
      window.electronAPI.onwsmessage(msgCb);
      offFns.push(() => window.electronAPI.offwsmessage(msgCb));

      const closeCb = (id) => {
        if (id !== wsId) return;
        cleanup();
        if (!resolved) {
          resolved = true;
          this._appendoutput('server', server.name, cmd, output.trim() || '(no output)', false);
          resolve();
        }
      };
      window.electronAPI.onwsclose(closeCb);
      offFns.push(() => window.electronAPI.offwsclose(closeCb));

      this._listeners.push(cleanup);

      timeout = setTimeout(() => {
        cleanup();
        if (!resolved) {
          resolved = true;
          this._appendoutput('server', server.name, cmd, output.trim() || '(timed out)', false);
          resolve();
        }
      }, 15000);

      window.electronAPI.connectwebsocket(data.socket, data.token, {
        'Authorization': 'Bearer ' + server.apiKey,
        'Accept': 'application/vnd.pterodactyl.v1+json'
      }, server.panelUrl).then(id => {
        wsId = id;
      }).catch(e => {
        cleanup();
        if (!resolved) { resolved = true; reject(e); }
      });
    });
  },

  _stripansi(str) {
    return (str || '')
      .replace(/\x1b\[[\d;]*[A-Z]/gi, '')
      .replace(/\x1b\[\?[1-9][\d]*[hl]/gi, '')
      .replace(/\x1b\[[\d]*[A-Z]/gi, '')
      .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
      .replace(/[\r\x00]/g, '');
  },

  _appendloading(name) {
    const out = Utils.el('multiTermOutput');
    if (!out) return null;
    const placeholder = out.querySelector('.multiterm-placeholder');
    if (placeholder) placeholder.remove();
    const row = document.createElement('div');
    row.className = 'mt-line mt-loading';
    row.innerHTML = `<span class="mt-server-name">${Utils.escape(name)}</span><span class="mt-spinner"></span><span class="mt-loading-text">Waiting for response...</span>`;
    out.appendChild(row);
    out.scrollTop = out.scrollHeight;
    return row;
  },

  _appendoutput(type, ...args) {
    const out = Utils.el('multiTermOutput');
    if (!out) return;
    const placeholder = out.querySelector('.multiterm-placeholder');
    if (placeholder) placeholder.remove();

    const line = document.createElement('div');
    if (type === 'cmd') {
      line.className = 'mt-line mt-cmd';
      line.textContent = args[0];
    } else if (type === 'server') {
      const [, cmd, output, isErr] = args;
      line.className = 'mt-line mt-result' + (isErr ? ' mt-err' : '');
      line.innerHTML = `<span class="mt-server-name">${Utils.escape(args[0])}</span><pre class="mt-output">${Utils.escape(output)}</pre>`;
    } else if (type === 'error') {
      line.className = 'mt-line mt-error';
      line.innerHTML = `<span class="mt-server-name">${Utils.escape(args[0])}</span><span class="mt-errmsg">${Utils.escape(args[2])}</span>`;
    } else if (type === 'system') {
      line.className = 'mt-line mt-system';
      line.textContent = args[0];
    }
    out.appendChild(line);
    out.scrollTop = out.scrollHeight;
  }
};
