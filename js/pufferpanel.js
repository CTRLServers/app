const pufferpanel = {
  token_cache: {},
  console_timer: null,
  stats_timer: null,
  console_epoch: 0,
  console_seen: '',
  stats_history: {},
  permission_cache: {},
  current_path: '/',
  current_server: null,
  file_view: 'normal',
  ide_tabs: [],
  ide_active: '',
  ide_expanded: new Set(['/']),
  ide_cache: new Map(),

  normalize_url(value) {
    const parsed = new URL(String(value || '').trim());
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Panel URL must use HTTP or HTTPS.');
    parsed.hash = '';
    parsed.search = '';
    return parsed.toString().replace(/\/+$/, '');
  },

  async resolve_secret(server) {
    const value = server.client_secret || '';
    if (!value.startsWith('enc:')) return value;
    return window.electronAPI.cryptodecrypt(value.slice(4));
  },

  async authenticate(panel_url, client_id, client_secret) {
    const base = this.normalize_url(panel_url);
    const key = `${base}|${client_id}`;
    const cached = this.token_cache[key];
    if (cached && cached.expires_at > Date.now() + 30000) return cached.access_token;
    const body = new URLSearchParams({ client_id, client_secret, grant_type: 'client_credentials' });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    let response;
    try {
      response = await fetch(`${base}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
        body: body.toString(),
        signal: controller.signal
      });
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('The PufferPanel connection timed out.');
      throw error;
    } finally { clearTimeout(timer); }
    const data = await this.response_data(response);
    if (!response.ok || !data.access_token) throw new Error(data.error_description || data.error || 'Authentication failed.');
    this.token_cache[key] = {
      access_token: data.access_token,
      expires_at: Date.now() + Math.max(60, Number(data.expires_in || 3600)) * 1000
    };
    return data.access_token;
  },

  async token(server) {
    return this.authenticate(server.panel_url, server.client_id, await this.resolve_secret(server));
  },

  async response_data(response) {
    if (response.status === 204) return {};
    const type = response.headers.get('content-type') || '';
    if (type.includes('application/json')) return response.json();
    return response.text();
  },

  error_message(data, fallback) {
    const value = data?.msg ?? data?.error_description ?? data?.error?.message ?? data?.error ?? data;
    if (typeof value === 'string' && value) return value;
    if (value && typeof value === 'object') {
      try { return JSON.stringify(value); } catch (error) {}
    }
    return fallback;
  },

  decode_bytes(value) {
    if (Array.isArray(value)) return new Uint8Array(value);
    if (typeof value === 'string' && value) {
      try {
        const binary = atob(value);
        return Uint8Array.from(binary, character => character.charCodeAt(0));
      } catch (error) { return new TextEncoder().encode(value); }
    }
    return new Uint8Array();
  },

  async request(server, path, options = {}, retry = true) {
    const access_token = await this.token(server);
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${access_token}`);
    if (!headers.has('Accept')) headers.set('Accept', 'application/json');
    if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    let response;
    try {
      response = await fetch(`${server.panel_url}${path}`, { ...options, headers, signal: controller.signal });
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('The PufferPanel request timed out.');
      throw error;
    } finally { clearTimeout(timer); }
    if (response.status === 401 && retry) {
      delete this.token_cache[`${server.panel_url}|${server.client_id}`];
      return this.request(server, path, options, false);
    }
    if (!response.ok) {
      const data = await this.response_data(response);
      const message = this.error_message(data, `HTTP ${response.status}`);
      const error = new Error(message || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return response;
  },

  bytes_base64(bytes) {
    let result = '';
    const size = 32768;
    for (let offset = 0; offset < bytes.length; offset += size) result += String.fromCharCode(...bytes.subarray(offset, offset + size));
    return btoa(result);
  },

  async upload_file(server, path, file, retry = true) {
    const access_token = await this.token(server);
    const boundary = `ctrlservers_${crypto.randomUUID().replace(/-/g, '')}`;
    const encoder = new TextEncoder();
    const before = encoder.encode(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${String(file.name || 'file').replace(/["\r\n]/g, '_')}"\r\nContent-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`);
    const content = new Uint8Array(await file.arrayBuffer());
    const after = encoder.encode(`\r\n--${boundary}--\r\n`);
    const body = new Uint8Array(before.length + content.length + after.length);
    body.set(before, 0);
    body.set(content, before.length);
    body.set(after, before.length + content.length);
    const result = await window.electronAPI.panelrequest(`${server.panel_url}${this.path_url(server, path)}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${access_token}`, 'Accept': 'application/json', 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      bodybase64: this.bytes_base64(body)
    });
    if (result.status === 401 && retry) {
      delete this.token_cache[`${server.panel_url}|${server.client_id}`];
      return this.upload_file(server, path, file, false);
    }
    if (result.status < 200 || result.status >= 300) {
      const raw = atob(result.body || '');
      let message = `HTTP ${result.status}`;
      try { const data = JSON.parse(raw); message = this.error_message(data, message); } catch (error) { if (raw) message = raw; }
      throw new Error(message);
    }
  },

  normalize_path(value) {
    const parts = [];
    String(value || '/').replace(/\\/g, '/').split('/').forEach(part => {
      if (!part || part === '.') return;
      if (part === '..') parts.pop();
      else parts.push(part);
    });
    return '/' + parts.join('/');
  },

  async list_servers(panel_url, client_id, client_secret) {
    const server = { panel_url: this.normalize_url(panel_url), client_id, client_secret };
    const response = await this.request(server, '/api/servers?limit=100&page=1');
    const data = await response.json();
    return data.servers || [];
  },

  async server_info(server) {
    return (await this.request(server, `/api/servers/${encodeURIComponent(server.server_id)}?perms`)).json();
  },

  server_cache_key(server) {
    return `${server.panel_url}|${server.server_id}`;
  },

  async load_permissions(server, refresh = false) {
    const key = this.server_cache_key(server);
    if (!refresh && this.permission_cache[key]) return this.permission_cache[key];
    const info = await this.server_info(server);
    const scopes = (info.permissions?.scopes || []).map(scope => typeof scope === 'string' ? scope : scope.value).filter(Boolean);
    this.permission_cache[key] = { scopes, info };
    return this.permission_cache[key];
  },

  has_scope(server, scope) {
    const scopes = this.permission_cache[this.server_cache_key(server)]?.scopes || [];
    return scopes.includes(scope) || scopes.includes('server.admin') || scopes.includes('admin');
  },

  async status(server) {
    return (await this.request(server, `/api/servers/${encodeURIComponent(server.server_id)}/status`)).json();
  },

  async stats(server) {
    return (await this.request(server, `/api/servers/${encodeURIComponent(server.server_id)}/stats`)).json();
  },

  async action(server, action) {
    await this.request(server, `/api/servers/${encodeURIComponent(server.server_id)}/${action}`, { method: 'POST' });
  },

  stop_live() {
    if (this.console_timer) clearInterval(this.console_timer);
    if (this.stats_timer) clearInterval(this.stats_timer);
    this.console_timer = null;
    this.stats_timer = null;
  },

  async load_page(page, server) {
    this.stop_live();
    this.current_server = server;
    try { await this.load_permissions(server); } catch (error) {}
    if (page === 'console') return this.load_console(server);
    if (page === 'statistics') return this.load_statistics(server);
    if (page === 'files') return this.load_files(server, this.current_path || '/');
    if (page === 'settings') return this.load_settings(server);
    if (page === 'pufferadmin') return this.load_admin(server);
    if (page === 'users') return this.load_users(server);
    if (page === 'puffersftp') return this.load_sftp(server);
    if (page === 'backups') return this.load_backups(server);
  },

  async load_console(server) {
    try { await this.load_permissions(server, true); } catch (error) {}
    const can_rename = this.has_scope(server, 'server.name.edit');
    const can_command = this.has_scope(server, 'server.console.send');
    const tab = this.ensure_tab('tabPufferconsole');
    tab.innerHTML = `<div class="puffer_console"><div class="puffer_console_header"><div><div class="puffer_server_name"><span id="puffer_server_name">${Utils.escape(server.name)}</span>${can_rename ? '<button class="icon-btn" id="puffer_rename" title="Rename server"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>' : ''}</div><div class="puffer_status" id="puffer_status">Loading...</div></div><div class="puffer_controls"><span id="puffer_primary_controls"></span><button class="icon-btn" id="puffer_more" title="More actions"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></button><div class="puffer_action_menu" id="puffer_action_menu">${this.has_scope(server, 'server.start') ? '<button data-puffer_action="start">Start</button>' : ''}${this.has_scope(server, 'server.start') && this.has_scope(server, 'server.stop') ? '<button data-puffer_action="restart">Restart</button>' : ''}${this.has_scope(server, 'server.stop') ? '<button data-puffer_action="stop">Stop</button>' : ''}${this.has_scope(server, 'server.kill') ? '<button data-puffer_action="kill">Kill</button>' : ''}${this.has_scope(server, 'server.install') ? '<button data-puffer_action="install">Install</button>' : ''}</div></div></div><pre class="console-output puffer_console_output" id="puffer_console_output"></pre>${can_command ? '<form class="console-input-wrap" id="puffer_command_form"><span>&gt;</span><input class="console-input" id="puffer_command" placeholder="Type a command..." autocomplete="off"/><button class="btn btn-primary" type="submit">Send</button></form>' : ''}</div>`;
    this.console_epoch = 0;
    this.console_seen = '';
    tab.querySelector('#puffer_more').onclick = () => tab.querySelector('#puffer_action_menu').classList.toggle('active');
    tab.querySelectorAll('[data-puffer_action]').forEach(button => button.onclick = () => this.run_action(server, button.dataset.puffer_action));
    if (can_rename) tab.querySelector('#puffer_rename').onclick = () => this.rename_dialog(server);
    if (can_command) tab.querySelector('#puffer_command_form').onsubmit = async event => {
      event.preventDefault();
      const input = tab.querySelector('#puffer_command');
      const command = input.value.trim();
      if (!command) return;
      try {
        await this.request(server, `/api/servers/${encodeURIComponent(server.server_id)}/console`, { method: 'POST', body: JSON.stringify(command) });
        input.value = '';
      } catch (error) { Modal.alert('Command Error', error.message); }
    };
    await this.poll_console(server);
    this.console_timer = setInterval(() => this.poll_console(server), 2000);
  },

  async poll_console(server) {
    if (this.current_server !== server || App.currentServerPage !== 'console') return;
    try {
      const [status, response] = await Promise.all([
        this.status(server),
        this.request(server, `/api/servers/${encodeURIComponent(server.server_id)}/console?time=${this.console_epoch}`)
      ]);
      const data = await response.json();
      const status_element = Utils.el('puffer_status');
      if (status_element) status_element.textContent = status.installing ? 'Installing' : status.running ? 'Online' : 'Offline';
      this.update_power_controls(server, status);
      const bytes = this.decode_bytes(data.logs);
      const output = new TextDecoder().decode(bytes);
      if (output && output !== this.console_seen) {
        const element = Utils.el('puffer_console_output');
        if (element) {
          const printable = output.replace(/\x1b[=>78]/g, '').replace(/(?:\x1b\[|\x9b)[0-?]*[ -/]*[@-~]/g, sequence => sequence.endsWith('m') ? sequence : '').replace(/\[\?[0-9;]*[a-zA-Z]/g, '');
          element.insertAdjacentHTML('beforeend', Utils.ansitohtml(printable));
          element.scrollTop = element.scrollHeight;
        }
        this.console_seen = output;
      }
      this.console_epoch = Number(data.epoch || this.console_epoch);
    } catch (error) {
      const element = Utils.el('puffer_status');
      if (element) element.textContent = error.status === 403 ? 'Access denied' : 'Disconnected';
    }
  },

  update_power_controls(server, status) {
    const controls = Utils.el('puffer_primary_controls');
    if (!controls) return;
    const mode = status.installing ? 'installing' : status.running ? 'online' : 'offline';
    if (controls.dataset.mode === mode) return;
    controls.dataset.mode = mode;
    const can_start = this.has_scope(server, 'server.start');
    const can_stop = this.has_scope(server, 'server.stop');
    controls.innerHTML = mode === 'offline' ? (can_start ? '<button class="btn btn-primary" data-puffer_action="start">Start</button>' : '') : mode === 'online' ? `${can_start && can_stop ? '<button class="btn btn-secondary" data-puffer_action="restart">Restart</button>' : ''}${can_stop ? '<button class="btn btn-danger" data-puffer_action="stop">Stop</button>' : ''}` : '<button class="btn btn-secondary" disabled>Installing</button>';
    controls.querySelectorAll('[data-puffer_action]').forEach(button => button.onclick = () => this.run_action(server, button.dataset.puffer_action));
  },

  async run_action(server, action) {
    const destructive = action === 'kill' || action === 'install';
    const execute = async () => {
      try { await this.action(server, action); await this.poll_console(server); }
      catch (error) { Modal.alert('Server Action', error.message); }
    };
    if (destructive) Modal.confirm(action === 'kill' ? 'Kill Server' : 'Install Server', action === 'kill' ? 'Forcefully terminate the server process?' : 'Install or reinstall this server using its definition?', execute);
    else execute();
  },

  rename_dialog(server) {
    Modal.open('Rename Server', `<div class="form-group"><label class="form-label">Server Name</label><input class="form-input" id="puffer_name" value="${Utils.escape(server.name)}"/></div><div class="modal-actions"><button class="btn btn-secondary" onclick="Modal.close()">Cancel</button><button class="btn btn-primary" id="puffer_save_name">Save</button></div>`);
    Utils.el('puffer_save_name').onclick = async () => {
      const name = Utils.el('puffer_name').value.trim();
      if (!name) return;
      try {
        await this.request(server, `/api/servers/${encodeURIComponent(server.server_id)}/name/${encodeURIComponent(name)}`, { method: 'PUT' });
        server.name = name;
        Servers.save();
        Servers.render();
        Utils.el('pageTitle').textContent = name;
        Modal.close();
        this.load_console(server);
      } catch (error) { Modal.alert('Rename Server', error.message); }
    };
  },

  async load_statistics(server) {
    const tab = this.ensure_tab('tabStatistics');
    tab.innerHTML = `<div class="puffer_statistics"><div class="puffer_chart_card"><div class="puffer_chart_title">Memory <span id="puffer_memory_value">--</span></div><canvas id="puffer_memory_chart"></canvas></div><div class="puffer_chart_card"><div class="puffer_chart_title">CPU <span id="puffer_cpu_value">--</span></div><canvas id="puffer_cpu_chart"></canvas></div></div>`;
    if (!this.stats_history[server.server_key]) this.stats_history[server.server_key] = [];
    await this.poll_stats(server);
    this.stats_timer = setInterval(() => this.poll_stats(server), 3000);
  },

  async poll_stats(server) {
    if (this.current_server !== server || App.currentServerPage !== 'statistics') return;
    try {
      const data = await this.stats(server);
      const history = this.stats_history[server.server_key] || [];
      history.push({ time: new Date(), cpu: Number(data.cpu || 0), memory: Number(data.memory || 0) });
      while (history.length > 40) history.shift();
      this.stats_history[server.server_key] = history;
      const memory_value = Utils.el('puffer_memory_value');
      const cpu_value = Utils.el('puffer_cpu_value');
      if (memory_value) memory_value.textContent = `${(Number(data.memory || 0) / 1048576).toFixed(1)} MiB`;
      if (cpu_value) cpu_value.textContent = `${Number(data.cpu || 0).toFixed(1)}%`;
      this.draw_chart(Utils.el('puffer_memory_chart'), history.map(item => item.memory / 1048576), history);
      this.draw_chart(Utils.el('puffer_cpu_chart'), history.map(item => item.cpu), history);
    } catch (error) {
      const cpu_value = Utils.el('puffer_cpu_value');
      if (cpu_value) cpu_value.textContent = error.status === 403 ? 'Access denied' : 'Unavailable';
    }
  },

  draw_chart(canvas, values, history) {
    if (!canvas) return;
    const width = Math.max(300, canvas.clientWidth);
    const height = Math.max(190, canvas.clientHeight);
    const scale = window.devicePixelRatio || 1;
    canvas.width = width * scale;
    canvas.height = height * scale;
    const context = canvas.getContext('2d');
    context.scale(scale, scale);
    context.strokeStyle = 'rgba(148,163,184,.16)';
    context.lineWidth = 1;
    for (let index = 1; index < 5; index++) {
      const y = height * index / 5;
      context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke();
    }
    const maximum = Math.max(1, ...values) * 1.15;
    context.strokeStyle = '#22b8f0';
    context.lineWidth = 2;
    context.beginPath();
    values.forEach((value, index) => {
      const x = values.length === 1 ? width : index * width / (values.length - 1);
      const y = height - value / maximum * (height - 24) - 12;
      if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
    });
    context.stroke();
    context.fillStyle = 'rgba(148,163,184,.7)';
    context.font = '11px sans-serif';
    if (history.length) context.fillText(history[0].time.toLocaleTimeString(), 8, height - 5);
  },

  ensure_tab(id) {
    let tab = Utils.el(id);
    if (!tab) {
      tab = document.createElement('div');
      tab.id = id;
      tab.className = 'server-page-tab';
      Utils.el('serverPage').appendChild(tab);
    }
    tab.style.display = 'flex';
    return tab;
  },

  path_url(server, path) {
    const clean = String(path || '/').replace(/^\/+/, '');
    return `/api/servers/${encodeURIComponent(server.server_id)}/file/${clean.split('/').map(encodeURIComponent).join('/')}`;
  },

  async load_files(server, path = '/') {
    path = this.normalize_path(path);
    const tab = this.ensure_tab('tabPufferfiles');
    this.current_path = path;
    this.file_selection = new Set();
    tab.innerHTML = `<div class="puffer_files${this.file_view === 'ide' ? ' puffer_files_ide' : ''}"><div class="puffer_files_toolbar"><button class="puffer_toolbar_icon" id="puffer_files_up" title="Parent directory"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg></button><div class="puffer_breadcrumb" id="puffer_breadcrumb"></div><div class="puffer_view_switch"><button class="btn btn-secondary${this.file_view === 'normal' ? ' active' : ''}" id="puffer_normal_view">Normal</button><button class="btn btn-secondary${this.file_view === 'ide' ? ' active' : ''}" id="puffer_ide_view">IDE</button></div><button class="puffer_toolbar_icon" id="puffer_reload" title="Reload"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 11a8 8 0 1 0 2 5"/><path d="M20 4v7h-7"/></svg></button><button class="btn btn-secondary" id="puffer_select_all">Select All</button><button class="btn btn-secondary" id="puffer_unselect_all">Unselect All</button><button class="btn btn-secondary" id="puffer_archive_current">Archive Folder</button><button class="btn btn-secondary" id="puffer_new_file">New File</button><button class="btn btn-secondary" id="puffer_new_folder">New Folder</button><button class="btn btn-secondary" id="puffer_upload">Upload File</button><button class="btn btn-primary" id="puffer_upload_folder">Upload Folder</button><input type="file" id="puffer_upload_input" multiple hidden/><input type="file" id="puffer_upload_folder_input" webkitdirectory multiple hidden/></div><div class="puffer_selection_bar" id="puffer_selection_bar" hidden><span id="puffer_selection_count">0 selected</span><div><button class="btn btn-secondary" id="puffer_selection_archive">Archive</button><button class="btn btn-danger" id="puffer_selection_delete">Delete</button><button class="btn btn-secondary" id="puffer_selection_cancel">Cancel</button></div></div><div class="puffer_file_workspace"><div class="puffer_file_list" id="puffer_file_list"><div class="loading-state">Loading files...</div></div>${this.file_view === 'ide' ? '<div class="puffer_ide_editor"><div class="puffer_ide_tabs" id="puffer_ide_tabs"></div><textarea class="puffer_ide_content" id="puffer_ide_content" spellcheck="false" disabled>Select a text file from the tree.</textarea><div class="puffer_ide_actions"><button class="btn btn-primary" id="puffer_ide_save" disabled>Save</button></div></div>' : ''}</div></div>`;
    Utils.el('puffer_files_up').onclick = () => this.load_files(server, this.parent_path(path));
    Utils.el('puffer_reload').onclick = () => this.load_files(server, path);
    Utils.el('puffer_normal_view').onclick = () => { this.file_view = 'normal'; this.load_files(server, path); };
    Utils.el('puffer_ide_view').onclick = () => { this.file_view = 'ide'; this.ide_expanded.add('/'); this.load_files(server, '/'); };
    Utils.el('puffer_select_all').onclick = () => this.select_all_files(tab, true);
    Utils.el('puffer_unselect_all').onclick = () => this.select_all_files(tab, false);
    Utils.el('puffer_archive_current').onclick = () => this.archive_dialog(server, [path === '/' ? '.' : path.replace(/^\//, '')], path, false);
    Utils.el('puffer_new_file').onclick = () => this.new_file_dialog(server, path);
    Utils.el('puffer_new_folder').onclick = () => this.new_folder_dialog(server, path);
    Utils.el('puffer_upload').onclick = () => Utils.el('puffer_upload_input').click();
    Utils.el('puffer_upload_folder').onclick = () => Utils.el('puffer_upload_folder_input').click();
    Utils.el('puffer_upload_input').onchange = event => this.upload_files(server, path, Array.from(event.target.files || []));
    Utils.el('puffer_upload_folder_input').onchange = event => this.upload_files(server, path, Array.from(event.target.files || []), true);
    Utils.el('puffer_selection_cancel').onclick = () => this.clear_file_selection(tab);
    Utils.el('puffer_selection_archive').onclick = () => this.archive_dialog(server, Array.from(this.file_selection), path, false);
    Utils.el('puffer_selection_delete').onclick = () => Modal.confirm('Delete Selected Files', `Delete ${this.file_selection.size} selected items?`, () => this.delete_selected(server));
    this.render_breadcrumb(server, path);
    try {
      const response = await this.request(server, this.path_url(server, path));
      const data = await this.response_data(response);
      const entries = (Array.isArray(data) ? data : data?.files || data?.entries || []).slice().sort((left, right) => {
        const left_directory = left.isFile === false || left.isDir === true || left.directory === true || left.type === 'directory';
        const right_directory = right.isFile === false || right.isDir === true || right.directory === true || right.type === 'directory';
        if (left_directory !== right_directory) return left_directory ? -1 : 1;
        return String(left.name || '').localeCompare(String(right.name || ''), undefined, { sensitivity: 'base' });
      });
      const list = Utils.el('puffer_file_list');
      if (this.file_view === 'ide') {
        this.ide_cache.set(path, entries);
        this.render_ide_tree(server);
        this.render_ide(server);
        return;
      }
      if (!entries.length) { list.innerHTML = '<div class="empty-state-inline">This directory is empty.</div>'; return; }
      list.innerHTML = entries.map(entry => {
        const name = entry.name || entry.fileName || entry.filename || '';
        const directory = entry.isFile === false || entry.isDir === true || entry.directory === true || entry.type === 'directory';
        return `<div class="puffer_file_row" data-name="${encodeURIComponent(name)}" data-directory="${directory ? '1' : '0'}" data-path="${encodeURIComponent(this.join_path(path, name).replace(/^\//, ''))}"><label class="puffer_file_checkbox"><input type="checkbox"/><span></span></label><button class="puffer_file_name">${directory ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 5h6l2 3h10v11H3z"/></svg>' : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2h9l5 5v15H6z"/></svg>'}<span>${Utils.escape(name)}</span></button><span>${directory ? 'Directory' : Utils.formatbytes(Number(entry.size || 0))}</span><button class="puffer_file_action puffer_file_download" title="${directory ? 'Archive and download' : 'Download'}"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg></button><button class="puffer_file_action puffer_file_delete" title="Delete"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 15H6L5 6"/></svg></button></div>`;
      }).join('');
      list.querySelectorAll('.puffer_file_row').forEach(row => {
        const name = decodeURIComponent(row.dataset.name);
        const target = this.normalize_path(this.join_path(path, name));
        row.querySelector('.puffer_file_name').onclick = () => row.dataset.directory === '1' ? this.load_files(server, target) : this.open_file(server, target);
        row.querySelector('input').onchange = event => this.toggle_file_selection(tab, decodeURIComponent(row.dataset.path), event.target.checked);
        row.querySelector('.puffer_file_download').onclick = () => row.dataset.directory === '1' ? this.archive_dialog(server, [target.replace(/^\//, '')], path, true, name) : this.download_file(server, target);
        row.querySelector('.puffer_file_delete').onclick = () => Modal.confirm('Delete', `Delete ${name}?`, () => this.delete_file(server, target));
      });
    } catch (error) { Utils.el('puffer_file_list').innerHTML = `<div class="vps-tab-error">${Utils.escape(error.message)}</div>`; }
  },

  is_directory(entry) {
    return entry.isFile === false || entry.isDir === true || entry.directory === true || entry.type === 'directory';
  },

  async toggle_ide_folder(server, path) {
    if (this.ide_expanded.has(path) && path !== '/') {
      this.ide_expanded.delete(path);
      this.render_ide_tree(server);
      return;
    }
    this.ide_expanded.add(path);
    if (!this.ide_cache.has(path)) {
      this.render_ide_tree(server);
      try {
        const response = await this.request(server, this.path_url(server, path));
        const data = await this.response_data(response);
        const entries = (Array.isArray(data) ? data : data?.files || data?.entries || []).slice().sort((left, right) => {
          const left_directory = this.is_directory(left);
          const right_directory = this.is_directory(right);
          if (left_directory !== right_directory) return left_directory ? -1 : 1;
          return String(left.name || '').localeCompare(String(right.name || ''), undefined, { sensitivity: 'base' });
        });
        this.ide_cache.set(path, entries);
      } catch (error) {
        this.ide_expanded.delete(path);
        Modal.alert('Open Folder', error.message);
      }
    }
    this.render_ide_tree(server);
  },

  render_ide_tree(server) {
    const tree = Utils.el('puffer_file_list');
    if (!tree || this.file_view !== 'ide') return;
    const rows = [];
    const render_directory = (path, depth) => {
      const entries = this.ide_cache.get(path);
      if (!entries) {
        rows.push(`<div class="puffer_tree_loading" style="padding-left:${14 + depth * 16}px">Loading...</div>`);
        return;
      }
      entries.forEach(entry => {
        const name = entry.name || entry.fileName || entry.filename || '';
        if (!name || name === '.' || name === '..') return;
        const directory = this.is_directory(entry);
        const target = this.normalize_path(this.join_path(path, name));
        const expanded = directory && this.ide_expanded.has(target);
        rows.push(`<button class="puffer_tree_row${directory ? ' is_directory' : ''}${target === this.ide_active ? ' active' : ''}" data-path="${encodeURIComponent(target)}" data-directory="${directory ? '1' : '0'}" style="padding-left:${8 + depth * 16}px"><span class="puffer_tree_chevron">${directory ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m${expanded ? '6 9 6 6 6-6' : '9 18 6-6-6-6'}"/></svg>` : ''}</span><span class="puffer_tree_icon">${directory ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 5h6l2 3h10v11H3z"/></svg>' : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2h9l5 5v15H6z"/></svg>'}</span><span>${Utils.escape(name)}</span></button>`);
        if (directory && expanded) render_directory(target, depth + 1);
      });
    };
    render_directory('/', 0);
    tree.innerHTML = rows.join('') || '<div class="puffer_tree_loading">This directory is empty.</div>';
    tree.querySelectorAll('.puffer_tree_row').forEach(row => {
      const path = decodeURIComponent(row.dataset.path);
      row.onclick = () => row.dataset.directory === '1' ? this.toggle_ide_folder(server, path) : this.open_file(server, path);
    });
  },

  toggle_file_selection(tab, path, selected) {
    if (selected) this.file_selection.add(path); else this.file_selection.delete(path);
    const bar = tab.querySelector('#puffer_selection_bar');
    bar.hidden = this.file_selection.size === 0;
    tab.querySelector('#puffer_selection_count').textContent = `${this.file_selection.size} selected`;
  },

  clear_file_selection(tab) {
    this.file_selection.clear();
    tab.querySelectorAll('.puffer_file_checkbox input').forEach(input => input.checked = false);
    tab.querySelector('#puffer_selection_bar').hidden = true;
  },

  select_all_files(tab, selected) {
    tab.querySelectorAll('.puffer_file_row').forEach(row => {
      const input = row.querySelector('.puffer_file_checkbox input');
      input.checked = selected;
      this.toggle_file_selection(tab, decodeURIComponent(row.dataset.path), selected);
    });
  },

  async delete_selected(server) {
    try {
      for (const path of this.file_selection) await this.request(server, this.path_url(server, '/' + path), { method: 'DELETE' });
      this.load_files(server, this.current_path);
    } catch (error) { Modal.alert('Delete Selected Files', error.message); }
  },

  new_file_dialog(server, path) {
    Modal.open('Create File', `<div class="form-group"><label class="form-label">File Name</label><input class="form-input" id="puffer_new_file_name"/></div><div class="modal-actions"><button class="btn btn-secondary" onclick="Modal.close()">Cancel</button><button class="btn btn-primary" id="puffer_create_file">Create</button></div>`);
    Utils.el('puffer_create_file').onclick = () => {
      const name = Utils.el('puffer_new_file_name').value.trim();
      if (!name || name.includes('/') || name.includes('\\')) return;
      Modal.close();
      this.edit_file_dialog(server, this.join_path(path, name), '');
    };
  },

  new_folder_dialog(server, path) {
    Modal.open('Create Folder', `<div class="form-group"><label class="form-label">Folder Name</label><input class="form-input" id="puffer_new_folder_name"/></div><div class="modal-actions"><button class="btn btn-secondary" onclick="Modal.close()">Cancel</button><button class="btn btn-primary" id="puffer_create_folder">Create</button></div>`);
    Utils.el('puffer_create_folder').onclick = async () => {
      const name = Utils.el('puffer_new_folder_name').value.trim();
      if (!name || name.includes('/') || name.includes('\\')) return;
      try {
        await this.upload_archive(server, path, `${name}/`, []);
        Modal.close();
        this.load_files(server, path);
      } catch (error) { Modal.alert('Create Folder', error.message); }
    };
  },

  archive_dialog(server, paths, directory, download = false, suggested = '') {
    const default_name = `${suggested || (directory === '/' ? 'server' : directory.split('/').filter(Boolean).pop()) || 'archive'}.zip`;
    Modal.open(download ? 'Archive and Download' : 'Create Archive', `<div class="form-group"><label class="form-label">Archive Name</label><input class="form-input" id="puffer_archive_name" value="${Utils.escape(default_name)}"/></div><div class="modal-actions"><button class="btn btn-secondary" onclick="Modal.close()">Cancel</button><button class="btn btn-primary" id="puffer_create_archive">${download ? 'Archive and Download' : 'Archive'}</button></div>`);
    Utils.el('puffer_create_archive').onclick = async () => {
      let name = Utils.el('puffer_archive_name').value.trim();
      if (!name) return;
      if (!/\.(zip|tar|tar\.gz|tgz)$/i.test(name)) name += '.zip';
      const archive_path = this.join_path(directory, name).replace(/^\//, '');
      try {
        await this.request(server, `/api/servers/${encodeURIComponent(server.server_id)}/archive/${archive_path.split('/').map(encodeURIComponent).join('/')}`, { method: 'POST', body: JSON.stringify(paths) });
        Modal.close();
        if (download) await this.download_file(server, '/' + archive_path);
        this.load_files(server, directory);
      } catch (error) { Modal.alert('Create Archive', error.message); }
    };
  },

  join_path(root, name) { return this.normalize_path(`${root === '/' ? '' : root}/${name}`); },
  parent_path(path) { return this.normalize_path(`${path}/..`); },
  render_breadcrumb(server, path) {
    const element = Utils.el('puffer_breadcrumb');
    const parts = path.split('/').filter(Boolean);
    element.innerHTML = `<button data-path="/">/</button>` + parts.map((part, index) => `<button data-path="/${parts.slice(0, index + 1).map(encodeURIComponent).join('/')}">${Utils.escape(part)}</button>`).join('<span>/</span>');
    element.querySelectorAll('button').forEach(button => button.onclick = () => this.load_files(server, decodeURIComponent(button.dataset.path)));
  },

  async open_file(server, path) {
    if (this.binary_file(path)) {
      Modal.alert('Open File', 'This binary or archive file cannot be opened in the text editor.');
      return;
    }
    try {
      const response = await this.request(server, this.path_url(server, path));
      const bytes = new Uint8Array(await response.arrayBuffer());
      const content = new TextDecoder().decode(bytes);
      if (this.file_view === 'ide') this.open_ide_file(server, path, content);
      else this.edit_file_dialog(server, path, content);
    } catch (error) { Modal.alert('Open File', error.message); }
  },

  binary_file(path) {
    return /\.(jar|zip|rar|7z|tar|gz|tgz|bz2|xz|zst|exe|dll|so|dylib|class|png|jpe?g|gif|webp|ico|pdf|mp3|ogg|wav|mp4|webm|mov|woff2?|ttf|otf)$/i.test(path);
  },

  open_ide_file(server, path, content) {
    const existing = this.ide_tabs.find(tab => tab.path === path);
    if (existing) existing.content = content;
    else this.ide_tabs.push({ path, content });
    this.ide_active = path;
    this.render_ide_tree(server);
    this.render_ide(server);
  },

  render_ide(server) {
    const tabs = Utils.el('puffer_ide_tabs');
    const editor = Utils.el('puffer_ide_content');
    const save = Utils.el('puffer_ide_save');
    if (!tabs || !editor || !save) return;
    tabs.innerHTML = this.ide_tabs.map(tab => `<button class="puffer_ide_tab${tab.path === this.ide_active ? ' active' : ''}" data-path="${encodeURIComponent(tab.path)}"><span>${Utils.escape(tab.path.split('/').pop())}</span><b title="Close">&times;</b></button>`).join('');
    tabs.querySelectorAll('.puffer_ide_tab').forEach(button => {
      const path = decodeURIComponent(button.dataset.path);
      button.onclick = event => {
        if (event.target.tagName === 'B') {
          this.ide_tabs = this.ide_tabs.filter(tab => tab.path !== path);
          if (this.ide_active === path) this.ide_active = this.ide_tabs.at(-1)?.path || '';
        } else this.ide_active = path;
        this.render_ide(server);
      };
    });
    const active = this.ide_tabs.find(tab => tab.path === this.ide_active);
    editor.disabled = !active;
    save.disabled = !active;
    editor.value = active ? active.content : 'Select a text file from the tree.';
    editor.oninput = () => { if (active) active.content = editor.value; };
    save.onclick = async () => {
      if (!active) return;
      try {
        const file = new File([active.content], active.path.split('/').pop(), { type: 'text/plain' });
        await this.upload_file(server, active.path, file);
      } catch (error) { Modal.alert('Save File', error.message); }
    };
  },

  edit_file_dialog(server, path, content) {
    Modal.open('Edit File', `<div class="form-group"><label class="form-label">Path</label><input class="form-input" id="puffer_file_path" value="${Utils.escape(path)}"/></div><textarea class="form-input puffer_editor" id="puffer_file_content"></textarea><div class="modal-actions"><button class="btn btn-secondary" onclick="Modal.close()">Cancel</button><button class="btn btn-primary" id="puffer_file_save">Save</button></div>`);
    Utils.el('puffer_file_content').value = content;
    Utils.el('puffer_file_save').onclick = async () => {
      const target = Utils.el('puffer_file_path').value.trim();
      const file = new File([Utils.el('puffer_file_content').value], target.split('/').pop(), { type: 'text/plain' });
      try { await this.upload_file(server, target, file); Modal.close(); this.load_files(server, this.current_path); }
      catch (error) { Modal.alert('Save File', error.message); }
    };
  },

  async upload_files(server, path, files, preserve_paths = false) {
    try {
      if (preserve_paths) {
        await this.upload_archive(server, path, '', files);
        this.load_files(server, path);
        return;
      }
      for (const file of files) {
        const relative_path = preserve_paths && file.webkitRelativePath ? file.webkitRelativePath : file.name;
        await this.upload_file(server, this.join_path(path, relative_path), file);
      }
      this.load_files(server, path);
    } catch (error) { Modal.alert('Upload Files', error.message); }
  },

  tar_header(name, size, directory) {
    const block = new Uint8Array(512);
    const encoder = new TextEncoder();
    const write_text = (value, offset, length) => block.set(encoder.encode(String(value)).slice(0, length), offset);
    const write_octal = (value, offset, length) => write_text(Math.max(0, Number(value)).toString(8).padStart(length - 1, '0') + '\0', offset, length);
    write_text(name.replace(/^\/+/, ''), 0, 100);
    write_octal(directory ? 493 : 420, 100, 8);
    write_octal(0, 108, 8);
    write_octal(0, 116, 8);
    write_octal(directory ? 0 : size, 124, 12);
    write_octal(Math.floor(Date.now() / 1000), 136, 12);
    block.fill(32, 148, 156);
    block[156] = directory ? 53 : 48;
    write_text('ustar\0', 257, 6);
    write_text('00', 263, 2);
    const checksum = block.reduce((total, value) => total + value, 0);
    write_text(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
    return block;
  },

  async upload_archive(server, path, directory, files) {
    const chunks = [];
    const directories = new Set();
    if (directory) directories.add(directory);
    files.forEach(file => {
      const relative_path = String(file.webkitRelativePath || file.name).replace(/\\/g, '/').replace(/^\/+/, '');
      const parts = relative_path.split('/');
      parts.pop();
      let current = '';
      parts.forEach(part => {
        current += part + '/';
        directories.add(current);
      });
    });
    directories.forEach(name => chunks.push(this.tar_header(name, 0, true)));
    for (const file of files) {
      const relative_path = String(file.webkitRelativePath || file.name).replace(/\\/g, '/').replace(/^\/+/, '');
      const content = new Uint8Array(await file.arrayBuffer());
      chunks.push(this.tar_header(relative_path, content.length, false), content);
      const padding = (512 - content.length % 512) % 512;
      if (padding) chunks.push(new Uint8Array(padding));
    }
    chunks.push(new Uint8Array(1024));
    const archive_name = `.ctrlservers_${crypto.randomUUID()}.tar`;
    const archive_path = this.join_path(path, archive_name);
    await this.upload_file(server, archive_path, new File(chunks, archive_name, { type: 'application/x-tar' }));
    try {
      const destination = path === '/' ? '/' : path;
      const endpoint = `/api/servers/${encodeURIComponent(server.server_id)}/extract/${archive_path.replace(/^\//, '').split('/').map(encodeURIComponent).join('/')}?destination=${encodeURIComponent(destination)}`;
      await this.request(server, endpoint, { method: 'POST' });
    } finally {
      try { await this.request(server, this.path_url(server, archive_path), { method: 'DELETE' }); } catch (error) {}
    }
  },

  async download_file(server, path) {
    try {
      const response = await this.request(server, this.path_url(server, path));
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = path.split('/').pop();
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) { Modal.alert('Download File', error.message); }
  },

  async delete_file(server, path) {
    try { await this.request(server, this.path_url(server, path), { method: 'DELETE' }); this.load_files(server, this.current_path); }
    catch (error) { Modal.alert('Delete File', error.message); }
  },

  async load_settings(server) {
    const tab = this.ensure_tab('tabPuffersettings');
    tab.innerHTML = '<div class="puffer_settings"><div class="loading-state">Loading settings...</div></div>';
    try {
      const permission_data = await this.load_permissions(server, true);
      const can_view_definition = this.has_scope(server, 'server.definition.view');
      const can_view_data = this.has_scope(server, 'server.data.view');
      const can_edit_data = this.has_scope(server, 'server.data.edit');
      const can_edit_admin = this.has_scope(server, 'server.data.edit.admin');
      const can_view_flags = this.has_scope(server, 'server.flags.view');
      const can_edit_flags = this.has_scope(server, 'server.flags.edit');
      let server_data = { data: {} };
      if (can_view_definition) server_data = await (await this.request(server, `/api/servers/${encodeURIComponent(server.server_id)}/definition`)).json();
      else if (can_view_data) server_data = await (await this.request(server, `/api/servers/${encodeURIComponent(server.server_id)}/data`)).json();
      const flags = can_view_flags ? await (await this.request(server, `/api/servers/${encodeURIComponent(server.server_id)}/flags`)).json() : {};
      const variables = Object.entries(server_data.data || {}).filter(([, variable]) => !variable.internal);
      const used = new Set();
      const find_variable = pattern => variables.find(([key, variable]) => pattern.test(`${key} ${variable.display || ''}`));
      const featured = [
        ['IP Address', find_variable(/(^|\s)ip($|\s)|bind.?ip|address/i), permission_data.info.server?.ip || 'Not provided'],
        ['Java Version', find_variable(/java.*version|jdk|jre/i), 'Not provided by this server definition'],
        ['Memory (MB)', find_variable(/(^|\s)(memory|ram)($|\s)|memory.?limit/i), 'Not provided by this server definition'],
        ['Port', find_variable(/(^|\s)port($|\s)|server.?port|game.?port/i), permission_data.info.server?.port || 'Not provided']
      ];
      const featured_html = featured.map(([label, match, fallback]) => {
        if (match) {
          used.add(match[0]);
          return this.variable_control(match[0], match[1], label, !(can_edit_data || can_edit_admin));
        }
        return this.readonly_setting(label, fallback);
      }).join('');
      const remaining = variables.filter(([key]) => !used.has(key));
      const data_button = can_edit_data || can_edit_admin ? '<button class="btn btn-primary" id="puffer_save_data">Save Settings</button>' : '';
      const flags_section = can_view_flags ? `<section class="settings-card"><h3>Automatic Startup</h3>${this.flag_control('puffer_auto_start', 'Start the server when the host starts', flags.autoStart, !can_edit_flags)}${this.flag_control('puffer_restart_crash', 'Restart the server after a crash', flags.autoRestartOnCrash, !can_edit_flags)}${this.flag_control('puffer_restart_normal', 'Restart the server when it stops normally', flags.autoRestartOnGraceful, !can_edit_flags)}${can_edit_flags ? '<button class="btn btn-primary" id="puffer_save_flags">Save Automatic Startup</button>' : ''}</section>` : '';
      tab.innerHTML = `<div class="puffer_settings"><section class="settings-card"><h3>Server Settings</h3><div class="puffer_variable_grid puffer_primary_settings">${featured_html}</div>${remaining.length ? `<h3>Template Variables</h3><div class="puffer_variable_grid">${remaining.map(([key, variable]) => this.variable_control(key, variable, '', !(can_edit_data || can_edit_admin))).join('')}</div>` : ''}${data_button}</section>${flags_section}</div>`;
      if (can_edit_data || can_edit_admin) Utils.el('puffer_save_data').onclick = async () => {
        const payload = {};
        tab.querySelectorAll('[data-puffer_variable]').forEach(input => { payload[input.dataset.puffer_variable] = input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) : input.value; });
        try { await this.request(server, `/api/servers/${encodeURIComponent(server.server_id)}/data`, { method: can_edit_admin ? 'PUT' : 'POST', body: JSON.stringify(payload) }); Modal.alert('Settings', 'Server settings saved.'); }
        catch (error) { Modal.alert('Settings', error.message); }
      };
      if (can_edit_flags) Utils.el('puffer_save_flags').onclick = async () => {
        const payload = { autoStart: Utils.el('puffer_auto_start').checked, autoRestartOnCrash: Utils.el('puffer_restart_crash').checked, autoRestartOnGraceful: Utils.el('puffer_restart_normal').checked };
        try { await this.request(server, `/api/servers/${encodeURIComponent(server.server_id)}/flags`, { method: 'POST', body: JSON.stringify(payload) }); Modal.alert('Settings', 'Automatic startup settings saved.'); }
        catch (error) { Modal.alert('Settings', error.message); }
      };
    } catch (error) { tab.innerHTML = `<div class="vps-tab-error">${Utils.escape(error.message)}</div>`; }
  },

  variable_control(key, variable, custom_label = '', force_disabled = false) {
    const disabled = force_disabled || variable.userEdit === false && !this.has_scope(this.current_server, 'server.data.edit.admin') ? ' disabled' : '';
    const label = Utils.escape(custom_label || variable.display || key);
    if (variable.type === 'boolean') return `<label class="puffer_variable"><span>${label}</span><input type="checkbox" data-puffer_variable="${Utils.escape(key)}"${variable.value ? ' checked' : ''}${disabled}/><small>${Utils.escape(variable.desc || '')}</small></label>`;
    if (variable.type === 'option' && Array.isArray(variable.options)) return `<label class="puffer_variable"><span>${label}</span><select class="form-input" data-puffer_variable="${Utils.escape(key)}"${disabled}>${variable.options.map(option => `<option value="${Utils.escape(String(option.value))}"${String(option.value) === String(variable.value) ? ' selected' : ''}>${Utils.escape(option.display || String(option.value))}</option>`).join('')}</select><small>${Utils.escape(variable.desc || '')}</small></label>`;
    return `<label class="puffer_variable"><span>${label}</span><input class="form-input" type="${variable.type === 'integer' ? 'number' : 'text'}" data-puffer_variable="${Utils.escape(key)}" value="${Utils.escape(String(variable.value ?? ''))}"${disabled}/><small>${Utils.escape(variable.desc || '')}</small></label>`;
  },

  readonly_setting(label, value) {
    return `<label class="puffer_variable"><span>${Utils.escape(label)}</span><input class="form-input" value="${Utils.escape(String(value ?? ''))}" disabled/></label>`;
  },

  flag_control(id, label, checked, disabled = false) { return `<label class="puffer_flag"><input type="checkbox" id="${id}"${checked ? ' checked' : ''}${disabled ? ' disabled' : ''}/><span>${Utils.escape(label)}</span></label>`; },

  async load_admin(server) {
    const tab = this.ensure_tab('tabPufferadmin');
    const can_view = this.has_scope(server, 'server.definition.view');
    const can_delete = this.has_scope(server, 'server.delete');
    if (!can_view && !can_delete) {
      tab.innerHTML = '<div class="empty-state-inline">You do not have permission to access server administration.</div>';
      return;
    }
    tab.innerHTML = `<div class="puffer_admin"><div class="puffer_section_header"><h2>Admin</h2></div><div class="puffer_admin_actions">${can_view ? '<button class="btn btn-primary" id="puffer_edit_definition">Edit Definition</button>' : ''}${can_delete ? '<button class="btn btn-danger" id="puffer_delete_server">Delete Server</button><button class="btn btn-danger" id="puffer_force_delete_server">Force Delete Server</button>' : ''}</div></div>`;
    if (can_view) Utils.el('puffer_edit_definition').onclick = async () => {
      try {
        const definition = await (await this.request(server, `/api/servers/${encodeURIComponent(server.server_id)}/definition`)).json();
        this.open_definition_editor(server, definition);
      } catch (error) { Modal.alert('Edit Definition', error.message); }
    };
    if (can_delete) {
      Utils.el('puffer_delete_server').onclick = () => this.confirm_delete_server(server, false);
      Utils.el('puffer_force_delete_server').onclick = () => this.confirm_delete_server(server, true);
    }
  },

  open_definition_editor(server, definition, active = 'variables') {
    const can_edit = this.has_scope(server, 'server.definition.edit');
    const data = definition.data || {};
    const run = definition.run || {};
    const tabs = [['variables', 'Variables'], ['install', 'Install'], ['run', 'Startup Configuration'], ['hooks', 'Hooks'], ['environment', 'Environment'], ['json', 'JSON']];
    const variables = Object.entries(data).map(([key, variable]) => this.admin_variable_control(key, variable, !can_edit)).join('');
    const content = {
      variables: `<div class="puffer_definition_grid">${variables || '<div class="empty-state-inline">No variables defined.</div>'}</div>`,
      install: `<label class="puffer_definition_field"><span>Installation Steps</span><textarea class="form-input puffer_definition_json" id="puffer_definition_install"${can_edit ? '' : ' disabled'}>${Utils.escape(JSON.stringify(definition.install || [], null, 2))}</textarea></label>`,
      run: `<div class="puffer_definition_grid"><label class="puffer_definition_field puffer_definition_wide"><span>Startup Commands</span><textarea class="form-input puffer_definition_json" id="puffer_definition_commands"${can_edit ? '' : ' disabled'}>${Utils.escape(JSON.stringify(run.command ?? '', null, 2))}</textarea></label><label class="puffer_definition_field"><span>Working Directory</span><input class="form-input" id="puffer_definition_working" value="${Utils.escape(run.workingDirectory || '')}"${can_edit ? '' : ' disabled'}/></label><label class="puffer_definition_field"><span>Stop Command</span><input class="form-input" id="puffer_definition_stop" value="${Utils.escape(run.stop ?? '')}"${can_edit ? '' : ' disabled'}/></label><label class="puffer_definition_field"><span>Stop Signal</span><input class="form-input" type="number" id="puffer_definition_stop_code" value="${Utils.escape(String(run.stopCode ?? ''))}"${can_edit ? '' : ' disabled'}/></label>${this.admin_toggle('puffer_definition_autostart', 'Start automatically', run.autostart, !can_edit)}${this.admin_toggle('puffer_definition_autorecover', 'Restart after a crash', run.autorecover, !can_edit)}${this.admin_toggle('puffer_definition_autorestart', 'Restart after a normal stop', run.autorestart, !can_edit)}<label class="puffer_definition_field puffer_definition_wide"><span>Environment Variables</span><textarea class="form-input puffer_definition_json" id="puffer_definition_env_vars"${can_edit ? '' : ' disabled'}>${Utils.escape(JSON.stringify(run.environmentVars || {}, null, 2))}</textarea></label></div>`,
      hooks: `<div class="puffer_definition_grid"><label class="puffer_definition_field"><span>Pre-run Hooks</span><textarea class="form-input puffer_definition_json" id="puffer_definition_pre"${can_edit ? '' : ' disabled'}>${Utils.escape(JSON.stringify(run.pre || [], null, 2))}</textarea></label><label class="puffer_definition_field"><span>Post-run Hooks</span><textarea class="form-input puffer_definition_json" id="puffer_definition_post"${can_edit ? '' : ' disabled'}>${Utils.escape(JSON.stringify(run.post || [], null, 2))}</textarea></label></div>`,
      environment: `<div class="puffer_definition_grid"><label class="puffer_definition_field"><span>Active Environment</span><textarea class="form-input puffer_definition_json" id="puffer_definition_environment"${can_edit ? '' : ' disabled'}>${Utils.escape(JSON.stringify(definition.environment || {}, null, 2))}</textarea></label><label class="puffer_definition_field"><span>Supported Environments</span><textarea class="form-input puffer_definition_json" id="puffer_definition_supported"${can_edit ? '' : ' disabled'}>${Utils.escape(JSON.stringify(definition.supportedEnvironments || [], null, 2))}</textarea></label></div>`,
      json: `<label class="puffer_definition_field"><span>Server Definition</span><textarea class="form-input puffer_definition_raw" id="puffer_definition_raw"${can_edit ? '' : ' disabled'}>${Utils.escape(JSON.stringify(definition, null, 2))}</textarea></label>`
    };
    Modal.open('Edit Server Definition', `<div class="puffer_definition_editor"><div class="puffer_definition_tabs">${tabs.map(([id, label]) => `<button class="puffer_definition_tab${id === active ? ' active' : ''}" data-definition_tab="${id}">${label}</button>`).join('')}</div><div class="puffer_definition_content">${content[active]}</div><div class="modal-actions"><button class="btn btn-secondary" id="puffer_definition_cancel">Cancel</button>${can_edit ? '<button class="btn btn-primary" id="puffer_definition_save">Save</button>' : ''}</div></div>`, 'puffer_definition_modal');
    Utils.el('puffer_definition_cancel').onclick = () => Modal.close();
    document.querySelectorAll('[data-definition_tab]').forEach(button => button.onclick = () => {
      try {
        const updated = this.collect_definition(definition, active);
        this.open_definition_editor(server, updated, button.dataset.definition_tab);
      } catch (error) { Modal.alert('Server Definition', error.message); }
    });
    if (can_edit) Utils.el('puffer_definition_save').onclick = async () => {
      try {
        const updated = this.collect_definition(definition, active);
        await this.request(server, `/api/servers/${encodeURIComponent(server.server_id)}/definition`, { method: 'PUT', body: JSON.stringify(updated) });
        Modal.close();
        Modal.alert('Server Definition', 'Server definition saved.');
      } catch (error) { Modal.alert('Server Definition', error.message); }
    };
  },

  admin_variable_control(key, variable, disabled) {
    const state = disabled ? ' disabled' : '';
    const label = Utils.escape(variable.display || key);
    if (variable.type === 'boolean') return `<label class="puffer_definition_variable"><span>${label}</span><input type="checkbox" data-admin_variable="${Utils.escape(key)}"${variable.value ? ' checked' : ''}${state}/><small>${Utils.escape(variable.desc || '')}</small></label>`;
    if (variable.type === 'option' && Array.isArray(variable.options)) return `<label class="puffer_definition_variable"><span>${label}</span><select class="form-input" data-admin_variable="${Utils.escape(key)}"${state}>${variable.options.map(option => `<option value="${Utils.escape(String(option.value))}"${String(option.value) === String(variable.value) ? ' selected' : ''}>${Utils.escape(option.display || String(option.value))}</option>`).join('')}</select><small>${Utils.escape(variable.desc || '')}</small></label>`;
    return `<label class="puffer_definition_variable"><span>${label}</span><input class="form-input" type="${variable.type === 'integer' ? 'number' : 'text'}" data-admin_variable="${Utils.escape(key)}" value="${Utils.escape(String(variable.value ?? ''))}"${state}/><small>${Utils.escape(variable.desc || '')}</small></label>`;
  },

  admin_toggle(id, label, checked, disabled) {
    return `<label class="puffer_definition_toggle"><input type="checkbox" id="${id}"${checked ? ' checked' : ''}${disabled ? ' disabled' : ''}/><span>${label}</span></label>`;
  },

  parse_definition_json(id, fallback) {
    const element = Utils.el(id);
    if (!element) return fallback;
    try { return JSON.parse(element.value); }
    catch (error) { throw new Error(`${element.previousElementSibling?.textContent || 'JSON'} contains invalid JSON.`); }
  },

  collect_definition(definition, active) {
    if (active === 'json') return this.parse_definition_json('puffer_definition_raw', definition);
    const updated = structuredClone(definition);
    if (active === 'variables') document.querySelectorAll('[data-admin_variable]').forEach(input => {
      const variable = updated.data[input.dataset.admin_variable];
      variable.value = input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) : input.value;
    });
    if (active === 'install') updated.install = this.parse_definition_json('puffer_definition_install', updated.install || []);
    if (active === 'run') {
      updated.run = updated.run || {};
      updated.run.command = this.parse_definition_json('puffer_definition_commands', updated.run.command ?? '');
      updated.run.workingDirectory = Utils.el('puffer_definition_working').value;
      const stop = Utils.el('puffer_definition_stop').value;
      const stop_code = Utils.el('puffer_definition_stop_code').value;
      if (stop) updated.run.stop = stop; else delete updated.run.stop;
      if (stop_code !== '') updated.run.stopCode = Number(stop_code); else delete updated.run.stopCode;
      updated.run.autostart = Utils.el('puffer_definition_autostart').checked;
      updated.run.autorecover = Utils.el('puffer_definition_autorecover').checked;
      updated.run.autorestart = Utils.el('puffer_definition_autorestart').checked;
      updated.run.environmentVars = this.parse_definition_json('puffer_definition_env_vars', {});
    }
    if (active === 'hooks') {
      updated.run = updated.run || {};
      updated.run.pre = this.parse_definition_json('puffer_definition_pre', []);
      updated.run.post = this.parse_definition_json('puffer_definition_post', []);
    }
    if (active === 'environment') {
      updated.environment = this.parse_definition_json('puffer_definition_environment', {});
      updated.supportedEnvironments = this.parse_definition_json('puffer_definition_supported', []);
    }
    return updated;
  },

  confirm_delete_server(server, force) {
    const title = force ? 'Force Delete Server' : 'Delete Server';
    const message = force ? `Force delete ${server.name} even if its node cannot be reached?` : `Permanently delete ${server.name} and its files?`;
    Modal.confirm(title, message, async () => {
      const query = force ? '?skipNode' : '';
      await this.request(server, `/api/servers/${encodeURIComponent(server.server_id)}${query}`, { method: 'DELETE' });
      const index = Servers.list.indexOf(server);
      if (index >= 0) Servers.list.splice(index, 1);
      Servers.save();
      Servers.render();
      App.showserverlist();
    });
  },

  permission_list: [
    ['server.view','Can view this server'],['server.admin','Has full access to this server'],['server.delete','Can delete this server'],['server.definition.view','Can view the server definition'],['server.definition.edit','Can edit the server definition'],['server.data.view','Can view server settings'],['server.data.edit','Can edit server settings'],['server.data.edit.admin','Can edit administrator-only server settings'],['server.flags.view','Can view autostart settings'],['server.flags.edit','Can edit autostart settings'],['server.name.edit','Can change the server name'],['server.users.view','Can view the user list'],['server.users.create','Can add new users to the server'],['server.users.edit','Can modify user permissions'],['server.users.delete','Can remove users from the server'],['server.start','Can start the server'],['server.stop','Can stop the server'],['server.kill','Can kill the server process'],['server.install','Can install the server'],['server.files.view','Can browse server files'],['server.files.edit','Can edit server files'],['server.sftp','Can access server files using SFTP'],['server.console','Can view the console'],['server.console.send','Can send console commands'],['server.stats','Can view resource usage'],['server.status','Can view the current server status'],['server.backup.view','Can view and download backups'],['server.backup.create','Can create backups'],['server.backup.restore','Can restore backups'],['server.backup.delete','Can delete backups']
  ],

  async load_users(server) {
    const tab = this.ensure_tab('tabPufferusers');
    tab.innerHTML = '<div class="loading-state">Loading users...</div>';
    try {
      const users = await (await this.request(server, `/api/servers/${encodeURIComponent(server.server_id)}/user`)).json();
      tab.innerHTML = `<div class="puffer_users"><div class="puffer_section_header"><h2>Users</h2><button class="btn btn-primary" id="puffer_add_user">Add User</button></div><div class="puffer_user_list">${users.length ? users.map(user => `<button class="puffer_user_row" data-email="${encodeURIComponent(user.email || user.username)}"><span><strong>${Utils.escape(user.username || user.email)}</strong><small>${Utils.escape(user.email || '')}</small></span><span>${(user.scopes || []).length} permissions</span></button>`).join('') : '<div class="empty-state-inline">No users have access.</div>'}</div></div>`;
      tab.querySelectorAll('.puffer_user_row').forEach(row => row.onclick = () => this.user_dialog(server, decodeURIComponent(row.dataset.email)));
      Utils.el('puffer_add_user').onclick = () => this.user_dialog(server, '');
    } catch (error) { tab.innerHTML = `<div class="vps-tab-error">${Utils.escape(error.message)}</div>`; }
  },

  async user_dialog(server, email) {
    let selected = [];
    if (email) {
      try {
        const data = await (await this.request(server, `/api/servers/${encodeURIComponent(server.server_id)}/user/${encodeURIComponent(email)}`)).json();
        const record = Array.isArray(data) ? data[0] : data;
        selected = (record?.scopes || []).map(scope => typeof scope === 'string' ? scope : scope.value);
      } catch (error) { Modal.alert('User', error.message); return; }
    }
    Modal.open(email ? 'Edit User' : 'Add User', `<div class="form-group"><label class="form-label">Email</label><input class="form-input" id="puffer_user_email" value="${Utils.escape(email)}"${email ? ' disabled' : ''}/></div><div class="puffer_permissions">${this.permission_list.map(([scope, label]) => `<label><input type="checkbox" value="${scope}"${selected.includes(scope) ? ' checked' : ''}/><span>${Utils.escape(label)}</span></label>`).join('')}</div><div class="modal-actions">${email ? '<button class="btn btn-danger" id="puffer_remove_user">Remove</button>' : ''}<button class="btn btn-secondary" onclick="Modal.close()">Cancel</button><button class="btn btn-primary" id="puffer_save_user">Save</button></div>`);
    Utils.el('puffer_save_user').onclick = async () => {
      const target = email || Utils.el('puffer_user_email').value.trim();
      const scopes = Array.from(document.querySelectorAll('.puffer_permissions input:checked')).map(input => input.value);
      if (!target) return;
      try { await this.request(server, `/api/servers/${encodeURIComponent(server.server_id)}/user/${encodeURIComponent(target)}`, { method: 'PUT', body: JSON.stringify({ email: target, scopes }) }); Modal.close(); this.load_users(server); }
      catch (error) { Modal.alert('Save User', error.message); }
    };
    if (email) Utils.el('puffer_remove_user').onclick = () => Modal.confirm('Remove User', `Remove ${email} from this server?`, async () => {
      try { await this.request(server, `/api/servers/${encodeURIComponent(server.server_id)}/user/${encodeURIComponent(email)}`, { method: 'DELETE' }); Modal.close(); this.load_users(server); }
      catch (error) { Modal.alert('Remove User', error.message); }
    });
  },

  async load_sftp(server) {
    const tab = this.ensure_tab('tabPuffersftp');
    try {
      const [self, info] = await Promise.all([
        (await this.request(server, '/api/self')).json(),
        this.server_info(server)
      ]);
      const node = info.server?.node || {};
      const host = node.publicHost || new URL(server.panel_url).hostname;
      const port = node.sftpPort || 5657;
      tab.innerHTML = `<div class="puffer_sftp"><section class="settings-card"><h2>SFTP Connection</h2><div class="puffer_info_row"><span>Host / Port</span><strong>${Utils.escape(host)}:${Utils.escape(String(port))}</strong></div><div class="puffer_info_row"><span>Username</span><strong>${Utils.escape(self.email || self.username || '')}#${Utils.escape(server.server_id)}</strong></div><div class="puffer_info_row"><span>Password</span><strong>Use your PufferPanel account password</strong></div></section></div>`;
    } catch (error) { tab.innerHTML = `<div class="vps-tab-error">${Utils.escape(error.message)}</div>`; }
  },

  async load_backups(server) {
    const tab = this.ensure_tab('tabPufferbackups');
    tab.innerHTML = '<div class="loading-state">Loading backups...</div>';
    try {
      const data = await (await this.request(server, `/api/servers/${encodeURIComponent(server.server_id)}/backup`)).json();
      const backups = Array.isArray(data) ? data : data.backups || [];
      tab.innerHTML = `<div class="puffer_backups"><div class="puffer_section_header"><h2>Backups</h2><button class="btn btn-primary" id="puffer_create_backup">Create Backup</button></div><div class="puffer_backup_list">${backups.length ? backups.map(backup => `<div class="puffer_backup_row"><div><strong>${Utils.escape(backup.name || backup.fileName)}</strong><small>${backup.createdAt ? new Date(backup.createdAt).toLocaleString() : ''}</small></div><div><button class="btn btn-secondary" data-backup_download="${backup.id}">Download</button><button class="btn btn-secondary" data-backup_restore="${backup.id}">Restore</button><button class="btn btn-danger" data-backup_delete="${backup.id}">Delete</button></div></div>`).join('') : '<div class="empty-state-inline">No backups found.</div>'}</div></div>`;
      Utils.el('puffer_create_backup').onclick = () => this.create_backup(server);
      tab.querySelectorAll('[data-backup_download]').forEach(button => button.onclick = () => {
        const backup = backups.find(item => String(item.id) === String(button.dataset.backup_download));
        this.download_backup(server, button.dataset.backup_download, backup?.fileName || backup?.name || 'backup.tar.gz');
      });
      tab.querySelectorAll('[data-backup_restore]').forEach(button => button.onclick = () => Modal.confirm('Restore Backup', 'Existing server files will be replaced. Continue?', () => this.backup_action(server, 'restore', button.dataset.backup_restore)));
      tab.querySelectorAll('[data-backup_delete]').forEach(button => button.onclick = () => Modal.confirm('Delete Backup', 'Permanently delete this backup?', () => this.backup_action(server, 'delete', button.dataset.backup_delete)));
    } catch (error) { tab.innerHTML = `<div class="vps-tab-error">${Utils.escape(error.message)}</div>`; }
  },

  async create_backup(server) {
    try {
      const status = await this.status(server);
      if (this.server_busy(status)) { Modal.alert('Create Backup', 'The server must be fully stopped before creating a backup.'); return; }
      Modal.prompt('Create Backup', 'Enter a name for this backup.', 'Backup', async name => {
        try {
          await this.request(server, `/api/servers/${encodeURIComponent(server.server_id)}/backup/create?name=${encodeURIComponent(name)}`, { method: 'POST' });
          this.load_backups(server);
        } catch (error) { Modal.alert('Create Backup', error.message); }
      });
    } catch (error) { Modal.alert('Create Backup', error.message); }
  },

  async backup_action(server, action, backup_id) {
    try {
      if (action === 'restore') {
        const status = await this.status(server);
        if (this.server_busy(status)) { setTimeout(() => Modal.alert('Restore Backup', 'The server must be fully stopped before restoring a backup.'), 0); return; }
      }
      const path = action === 'delete' ? `${backup_id}` : `restore/${backup_id}`;
      await this.request(server, `/api/servers/${encodeURIComponent(server.server_id)}/backup/${path}`, { method: action === 'delete' ? 'DELETE' : 'POST' });
      await this.load_backups(server);
    } catch (error) { setTimeout(() => Modal.alert(`${action === 'delete' ? 'Delete' : 'Restore'} Backup`, error.message), 0); }
  },

  server_busy(status) {
    const value = status?.data || status || {};
    return value.running === true || value.running === 'true' || value.installing === true || value.installing === 'true';
  },

  async download_backup(server, backup_id, filename) {
    try {
      const response = await this.request(server, `/api/servers/${encodeURIComponent(server.server_id)}/backup/download/${backup_id}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const disposition = response.headers.get('content-disposition') || '';
      const matched = disposition.match(/filename\*?=(?:UTF-8''|\")?([^\";]+)/i);
      link.download = matched ? decodeURIComponent(matched[1].replace(/\"/g, '')) : filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) { Modal.alert('Download Backup', error.message); }
  }
};
