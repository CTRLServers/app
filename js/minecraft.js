const MCPlugin = {
  BACKEND_URL: 'https://backend2.ctrlservers.xyz',
  AUTH_URL: 'https://authorization.ctrlservers.xyz',
  token: null,
  user: null,
  servers: [],
  created: null,
  ws: null,
  wsConnected: false,
  wsCallbacks: new Map(),
  wsId: 0,
  tab: 'console',
  consoleLines: [],
  consoleAuto: true,
  consoleTerm: null,
  consoleInput: '',
  file_path: '/',
  file_list: [],
  file_content: '',
  file_editing: null,
  file_loading: false,
  file_saving: false,
  players_data: { players: [], total: 0, totalPages: 0, hasMore: false },
  players_page: 1,
  players_loading: false,
  action_loading: false,
  checking: false,
  creating: false,
  deleting: false,
  vps_step: 1,
  vps_cwd: '~',
  vps_api_key: '',
  web_apikey_input: '',
  web_needs_apikey: false,
  web_checking: false,
  history_enabled: false,
  history_stats: '',
  broadcast_msg: '',
  player_nick: '',
  give_material: '',
  give_amount: '',
  effect_type: '',
  effect_duration: '',
  effect_level: '',
  xp_amount: '',
  mute_duration: 0,
  mute_modal: false,
  inventory_data: null,
  last_action_result: null,
  whitelist_nick: '',
  timeset_val: 'day',
  weather_val: 'clear',
  output: null,
  show_delete: false,
  _deepLinkBound: false,

  init() {
    this.token = localStorage.getItem('mcplugin_token');
    this.user = JSON.parse(localStorage.getItem('mcplugin_user') || 'null');
    if (!this._deepLinkBound) {
      this._deepLinkBound = true;
      window.electronAPI.oncloudaction((data) => {
        if (data && data.token && data.source === 'mcplugin') {
          this.token = data.token;
          this.fetchuserinfo().then(() => {
            this.saveauth();
            this.fetchservers().then(() => this.render());
          });
        }
      });
    }
    if (this.token) {
      this.fetchservers().then(() => this.render());
    }
  },

  async api(method, path, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (this.token) opts.headers['Authorization'] = 'Bearer ' + this.token;
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(this.BACKEND_URL + path, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  },

  saveauth() {
    localStorage.setItem('mcplugin_token', this.token || '');
    localStorage.setItem('mcplugin_user', JSON.stringify(this.user));
  },

  clearauth() {
    this.token = null;
    this.user = null;
    this.servers = [];
    this.created = null;
    this.disconnectws();
    localStorage.removeItem('mcplugin_token');
    localStorage.removeItem('mcplugin_user');
  },

  openauth() {
    window.electronAPI.openexternal(this.AUTH_URL + '/login?redirect=http://127.0.0.1:12747/mcplugin-callback');
  },

  logout() {
    Modal.confirm('Sign Out', 'Are you sure you want to sign out of CTRLManage?', () => {
      this.clearauth();
      this.render();
    });
  },

  async fetchservers() {
    if (!this.token) return;
    try {
      const data = await this.api('GET', '/check-user-servers');
      this.servers = (data.servers || []).map(s => ({
        ...s,
        plugin_type: s.plugin_type || 'websocket',
        port: s.port || 25566,
      }));
    } catch (e) {}
  },

  async fetchuserinfo() {
    if (!this.token) return;
    try {
      const res = await fetch(this.AUTH_URL + '/api/check/token?token=' + encodeURIComponent(this.token));
      const data = await res.json();
      if (data && data.user) {
        this.user = data.user;
      }
    } catch (e) {}
  },

  async createserver() {
    const nameEl = document.getElementById('mcNewName');
    const ipEl = document.getElementById('mcNewIp');
    const portEl = document.getElementById('mcNewPort');
    const typeEl = document.getElementById('mcPluginType');
    const name = nameEl ? nameEl.value.trim() : '';
    const ip = ipEl ? ipEl.value.trim() : '';
    const port = portEl ? portEl.value.trim() : '';
    const pluginType = typeEl ? typeEl.value : 'websocket';

    if (!name || !ip) { this.showerror('Please fill in all fields'); return; }
    if (pluginType === 'web' && (!port || isNaN(Number(port)))) { this.showerror('Please enter a valid port number'); return; }

    this.creating = true;
    this.render();
    try {
      const body = { name, ip, plugin_type: pluginType };
      if (pluginType === 'web') body.port = Number(port);
      const data = await this.api('POST', '/save-server', body);
      const serverObj = {
        uuid: data.uuid, name: data.name, ip: data.ip,
        plugin_type: pluginType, port: data.port,
        api_key: data.api_key,
      };
      if (pluginType === 'web') serverObj.web_url = 'http://' + data.ip + ':' + (data.port || 25566);
      if (data.api_key) this.vps_api_key = data.api_key;
      this.created = serverObj;
      this.servers.push(serverObj);
      this.showtoast('Server created!');
    } catch (e) {
      this.showerror(e.message || 'Connection failed');
    } finally {
      this.creating = false;
      this.render();
    }
  },

  _selectserverbyidx(idx) {
    if (idx >= 0 && idx < this.servers.length) this.selectserver(this.servers[idx]);
  },

  async selectserver(server) {
    const pluginType = server.plugin_type || 'websocket';
    this.output = null;
    this.inventory_data = null;
    this.show_delete = false;

    if (this.ws) {
      try { this.ws.send(JSON.stringify({ action: 'console_stop', arguments: {} })); } catch (e) {}
      this.disconnectws();
    }

    this.created = {
      uuid: server.id || server.uuid, name: server.name, ip: server.ip,
      connected: false, active: server.active, plugin_type: pluginType,
      port: server.port || 25566,
      web_url: server.web_url || 'http://' + server.ip + ':' + (server.port || 25566),
    };
    this.web_needs_apikey = false;
    this.web_apikey_input = '';
    this.vps_cwd = '~';
    this.vps_api_key = server.api_key || '';
    this.output = null;
    this.inventory_data = null;

    if (!server.active) { this.vps_step = 1; this.render(); return; }

    if (pluginType === 'web') {
      this.vps_step = 1;
      const savedKey = this.getwebapikey(server.id);
      if (savedKey) { this.web_needs_apikey = false; await this.webconnect(savedKey); }
      else { this.web_needs_apikey = true; }
      this.render();
      return;
    }

    try {
      const data = await this.api('POST', '/check-server', { uuid: server.id || server.uuid });
      if (data.exists && data.wsName) {
        this.vps_step = 1;
        this.created = { ...this.created, connected: true, wsName: data.wsName, active: true };
        this.tab = 'console';
        this.consoleLines = [];
        this.file_list = [];
        this.file_editing = null;
        this.players_data = { players: [], total: 0, totalPages: 0, hasMore: false };
        this.render();
        this.connectws(server.id || server.uuid).then(() => {
          this.action('console_start');
          this.action('console_lines', { count: 200 }).then(d => {
            if (d && d.lines) this.consoleLines = d.lines.map(l => '<div>' + l + '</div>');
            this.renderconsole();
          });
          if (pluginType !== 'vps') {
            this.action('player_history_query').then(d => {
              if (d && d.enabled !== undefined) this.history_enabled = d.enabled;
            });
          }
        });
      } else {
        if (pluginType === 'vps') this.vps_step = 2;
      }
    } catch (e) {
      if (pluginType === 'vps') this.vps_step = 2;
    }
    this.render();
  },

  async checkcommand() {
    if (!this.created) return;
    this.checking = true;
    this.render();

    if (this.created.plugin_type === 'web') {
      const baseUrl = this.created.web_url || 'http://' + this.created.ip + ':' + (this.created.port || 25566);
      const savedKey = this.getwebapikey(this.created.uuid);
      if (savedKey) { await this.webconnect(savedKey); }
      else {
        try {
          this.web_checking = true;
          const checkRes = await fetch(baseUrl + '/api/check?uuid=' + this.created.uuid);
          const checkData = await checkRes.json();
          if (checkData.registered) { this.web_needs_apikey = true; this.showtoast('Plugin detected! Enter your API key below.'); }
          else { this.showtoast('Plugin not responding. Run /ctrlmanage enter in-game.'); }
        } catch (e) { this.showtoast('Cannot reach plugin at ' + baseUrl + '. Check IP/port/firewall.'); }
        finally { this.web_checking = false; this.checking = false; this.render(); }
      }
      return;
    }

    try {
      const data = await this.api('POST', '/check-server', { uuid: this.created.uuid });
      if (data.exists && data.wsName) {
        this.created = { ...this.created, connected: true, wsName: data.wsName, active: true };
        const idx = this.servers.findIndex(s => s.id === this.created.uuid);
        if (idx !== -1) this.servers[idx].active = true;
        this.tab = 'console';
        this.consoleLines = [];
        this.file_list = [];
        this.file_editing = null;
        this.players_data = { players: [], total: 0, totalPages: 0, hasMore: false };
        this.showtoast('Server connected!');
        this.connectws(this.created.uuid);
      } else {
        this.showtoast('Command not detected yet. Try again in a moment.');
      }
    } catch (e) { this.showtoast('Check failed'); }
    finally { this.checking = false; this.render(); }
  },

  async deleteserver() {
    if (!this.created) return;
    this.deleting = true;
    try {
      await this.api('POST', '/delete-server', { uuid: this.created.uuid });
      this.servers = this.servers.filter(s => (s.id || s.uuid) !== this.created.uuid);
      this.disconnectws();
      this.created = null;
      this.show_delete = false;
      this.showtoast('Server deleted!');
    } catch (e) { this.showtoast(e.message || 'Delete failed'); }
    finally { this.deleting = false; this.render(); }
  },

  async connectws(uuid) {
    this.disconnectws();
    try {
      const data = await this.api('GET', '/ws-info?uuid=' + uuid);
      if (data.error || !data.wsUrl) { this.showtoast(data.error || 'Failed to get WebSocket info'); return false; }
      return new Promise((resolve) => {
        const ws = new WebSocket(data.wsUrl + '?uuid=' + uuid + '&token=' + data.token);
        this.ws = ws;
        const onopen = () => {
          this.wsConnected = true;
          this.showtoast('Connected');
          resolve(true);
        };
        const onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data);
            if (msg.type === 'connected' || msg.type === 'sent' || msg.type === 'console_status') return;
            if (msg.type === 'error') { this.showtoast(msg.error); return; }
            if (msg.type === 'console_line' && msg.line) { this.pushconsoleline(msg.line); return; }
            if (msg.type === 'command_result' && this.created?.plugin_type === 'vps') {
              if (msg.data && msg.data.cwd) this.vps_cwd = msg.data.cwd;
            }
            const actionId = msg._actionId;
            if (actionId && this.wsCallbacks.has(actionId)) {
              const cb = this.wsCallbacks.get(actionId);
              this.wsCallbacks.delete(actionId);
              cb.resolve(msg);
              return;
            }
            if (msg.type === 'output') {
              this.output = msg;
              const keys = Array.from(this.wsCallbacks.keys());
              if (keys.length > 0) {
                const latestKey = keys[keys.length - 1];
                const cb = this.wsCallbacks.get(latestKey);
                this.wsCallbacks.delete(latestKey);
                cb.resolve(msg);
              }
              return;
            }
            if (msg.type === 'players_list' || msg.type === 'file_list' || msg.type === 'file_read' ||
                msg.type === 'file_write' || msg.type === 'file_delete' || msg.type === 'file_rename' ||
                msg.type === 'file_mkdir' || msg.type === 'console_lines' || msg.type === 'command_result' ||
                msg.type === 'inventory_view' || msg.type === 'player_give' || msg.type === 'player_effect' ||
                msg.type === 'player_mute' || msg.type === 'player_unmute' || msg.type === 'player_xp_add' ||
                msg.type === 'player_xp_remove' || msg.type === 'player_kill' || msg.type === 'player_freeze' ||
                msg.type === 'player_unfreeze' || msg.type === 'player_fly' || msg.type === 'player_history_status' ||
                msg.type === 'player_history_stats') {
              const keys = Array.from(this.wsCallbacks.keys());
              if (keys.length > 0) {
                const latestKey = keys[keys.length - 1];
                const cb = this.wsCallbacks.get(latestKey);
                this.wsCallbacks.delete(latestKey);
                cb.resolve(msg);
              }
              return;
            }
          } catch (err) {}
        };
        const onclose = () => {
          this.wsConnected = false;
          for (const [, cb] of this.wsCallbacks) cb.reject(new Error('WebSocket closed'));
          this.wsCallbacks.clear();
        };
        const onerror = () => { resolve(false); };
        ws.addEventListener('open', onopen);
        ws.addEventListener('message', onmessage);
        ws.addEventListener('close', onclose);
        ws.addEventListener('error', onerror);
      });
    } catch (e) { this.showtoast('WebSocket connection failed'); return false; }
  },

  disconnectws() {
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
      this.ws = null;
    }
    this.wsConnected = false;
    for (const [, cb] of this.wsCallbacks) cb.reject(new Error('Disconnected'));
    this.wsCallbacks.clear();
  },

  async action(act, args) {
    if (!this.created || !this.created.uuid) { this.showtoast('No server selected'); return null; }
    if (this.created.plugin_type === 'web') return this.webaction(act, args);
    if (!this.token) { this.showtoast('Not authenticated'); return null; }
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      const connected = await this.connectws(this.created.uuid);
      if (!connected) { this.showtoast('WebSocket not connected'); return null; }
    }
    this.action_loading = true;
    try {
      const id = ++this.wsId;
      const msg = { action: act, arguments: args || {}, _actionId: id };
      const noResponse = ['console_start', 'console_stop', 'broadcast', 'op', 'deop', 'ban', 'unban', 'kick',
        'heal', 'feed', 'clear', 'whitelistadd', 'whitelistremove', 'whiteliston', 'whitelistoff',
        'timeset', 'weather', 'saveworld', 'stop', 'restart',
        'gamemodecreative', 'gamemodesurvival', 'gamemodespectator', 'gamemodeadventure'];
      this.ws.send(JSON.stringify(msg));
      if (noResponse.includes(act)) { this.showtoast('Action sent!'); return { success: true }; }
      const result = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { this.wsCallbacks.delete(id); reject(new Error('Timeout')); }, 10000);
        this.wsCallbacks.set(id, { resolve: d => { clearTimeout(timer); resolve(d); }, reject: e => { clearTimeout(timer); reject(e); } });
      });
      if (result && result.type === 'output' && result.data) {
        this.output = result;
        this.showtoast('Action completed');
        if (this.tab === 'server') this.render();
      } else if (result && result.type === 'inventory_view') {
        this.inventory_data = result;
        this.showtoast('Inventory loaded');
      } else {
        if (result && result.message) this.showtoast(result.message);
        if (result && result.error) this.showtoast(result.error);
      }
      return result;
    } catch (e) { this.showtoast('No response from plugin'); return null; }
    finally { this.action_loading = false; }
  },

  sendconsole() {
    const input = document.getElementById('mcConsoleInput');
    if (!input) return;
    const cmd = input.value.trim();
    if (!cmd) return;
    this.consoleLines.push('<div><span style="color:#6366f1">[CMD]</span> ' + Utils.escape(cmd) + '</div>');
    this.renderconsole();
    this.action('execute', { command: cmd });
    input.value = '';
  },

  pushconsoleline(line) {
    this.consoleLines.push('<div>' + line + '</div>');
    if (this.consoleLines.length > 500) this.consoleLines = this.consoleLines.slice(-400);
    if (this.consoleAuto) this.renderconsole();
  },

  renderconsole() {
    const el = document.getElementById('mcConsoleOutput');
    if (!el) return;
    el.innerHTML = this.consoleLines.join('');
    if (this.consoleAuto) el.scrollTop = el.scrollHeight;
  },

  getwebapikey(serverId) {
    try { return localStorage.getItem('mcplugin_apikey_' + serverId) || ''; } catch { return ''; }
  },

  savewebapikey(serverId, key) {
    localStorage.setItem('mcplugin_apikey_' + serverId, key);
  },

  async webconnect(apiKey) {
    if (!this.created) return;
    const baseUrl = this.created.web_url || 'http://' + this.created.ip + ':' + (this.created.port || 25566);
    const uuid = this.created.uuid;
    try {
      const checkRes = await fetch(baseUrl + '/api/check?uuid=' + uuid);
      const checkData = await checkRes.json();
      if (!checkData.registered) { this.showtoast('Plugin not responding. Run /ctrlmanage enter in-game.'); this.web_needs_apikey = true; return; }
    } catch (e) { this.showtoast('Cannot reach plugin at ' + baseUrl + '. Check IP/port/firewall.'); this.web_needs_apikey = true; return; }
    try {
      const res = await fetch(baseUrl + '/api/server/info', { method: 'GET', headers: { 'Authorization': 'ApiKey ' + apiKey } });
      if (res.ok) {
        const infoData = await res.json();
        this.savewebapikey(uuid, apiKey);
        this.web_needs_apikey = false;
        this.created = { ...this.created, connected: true, active: true };
        const idx = this.servers.findIndex(s => s.id === uuid);
        if (idx !== -1) this.servers[idx].active = true;
        fetch(this.BACKEND_URL + '/activate-server', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + this.token },
          body: JSON.stringify({ uuid, backendKey: infoData.backendKey || '' }),
        }).catch(() => {});
        this.tab = 'console';
        this.consoleLines = [];
        this.file_list = [];
        this.file_editing = null;
        this.players_data = { players: [], total: 0, totalPages: 0, hasMore: false };
        this.showtoast('Connected!');
        this.action('console_start');
        this.action('console_lines', { count: 200 }).then(d => { if (d && d.lines) this.consoleLines = d.lines.map(l => '<div>' + l + '</div>'); this.renderconsole(); });
        this.action('player_history_query').then(d => { if (d && d.enabled !== undefined) this.history_enabled = d.enabled; });
      } else { this.showtoast('Invalid API key'); this.web_needs_apikey = true; }
    } catch (e) { this.showtoast('Connection failed'); }
  },

  WEB_ACTION_MAP: {
    console_start: { method: 'GET', path: '/api/server/info' },
    console_stop: { method: 'POST', path: '/api/server/stop' },
    console_lines: { method: 'GET', path: '/api/console/lines' },
    execute: { method: 'POST', path: '/api/server/command', bodyKey: 'command' },
    broadcast: { method: 'POST', path: '/api/server/broadcast', bodyKey: 'message' },
    players_list: { method: 'GET', path: '/api/players/list' },
    file_list: { method: 'GET', path: '/api/files/list' },
    file_read: { method: 'GET', path: '/api/files/read' },
    file_write: { method: 'POST', path: '/api/files/write' },
    file_delete: { method: 'GET', path: '/api/files/delete' },
    file_mkdir: { method: 'POST', path: '/api/files/mkdir' },
    op: { method: 'POST', path: '/api/op', bodyKey: 'nickname' },
    deop: { method: 'POST', path: '/api/deop', bodyKey: 'nickname' },
    ban: { method: 'POST', path: '/api/ban', bodyKey: 'nickname' },
    unban: { method: 'POST', path: '/api/unban', bodyKey: 'nickname' },
    kick: { method: 'POST', path: '/api/kick', bodyKey: 'nickname' },
    heal: { method: 'POST', path: '/api/players/action', extra: { action: 'heal' }, bodyKey: 'nickname' },
    feed: { method: 'POST', path: '/api/players/action', extra: { action: 'feed' }, bodyKey: 'nickname' },
    clear: { method: 'POST', path: '/api/players/action', extra: { action: 'clear' }, bodyKey: 'nickname' },
    whitelistadd: { method: 'POST', path: '/api/whitelist/add', bodyKey: 'nickname' },
    whitelistremove: { method: 'POST', path: '/api/whitelist/remove', bodyKey: 'nickname' },
    whiteliston: { method: 'POST', path: '/api/whitelist/on' },
    whitelistoff: { method: 'POST', path: '/api/whitelist/off' },
    timeset: { method: 'POST', path: '/api/server/time', bodyKey: 'time' },
    weather: { method: 'POST', path: '/api/server/weather', bodyKey: 'weather' },
    saveworld: { method: 'POST', path: '/api/server/save' },
    stop: { method: 'POST', path: '/api/server/stop' },
    restart: { method: 'POST', path: '/api/server/restart' },
    player_history_query: { method: 'GET', path: '/api/history/query' },
    player_history_toggle: { method: 'POST', path: '/api/history/toggle' },
    player_history_stats: { method: 'GET', path: '/api/history/stats' },
    player_kill: { method: 'POST', path: '/api/players/action', extra: { action: 'kill' }, bodyKey: 'nickname' },
    player_freeze: { method: 'POST', path: '/api/players/action', extra: { action: 'freeze' }, bodyKey: 'nickname' },
    player_unfreeze: { method: 'POST', path: '/api/players/action', extra: { action: 'unfreeze' }, bodyKey: 'nickname' },
    player_fly: { method: 'POST', path: '/api/players/action', extra: { action: 'fly' }, bodyKey: 'nickname' },
    player_mute: { method: 'POST', path: '/api/players/action', extra: { action: 'mute' }, bodyKey: 'nickname' },
    player_unmute: { method: 'POST', path: '/api/players/action', extra: { action: 'unmute' }, bodyKey: 'nickname' },
    player_xp_add: { method: 'POST', path: '/api/players/action', extra: { action: 'xp_add' }, bodyKey: 'nickname' },
    player_xp_remove: { method: 'POST', path: '/api/players/action', extra: { action: 'xp_remove' }, bodyKey: 'nickname' },
    player_give: { method: 'POST', path: '/api/players/action', extra: { action: 'give' }, bodyKey: 'nickname' },
    player_effect: { method: 'POST', path: '/api/players/action', extra: { action: 'effect' }, bodyKey: 'nickname' },
    player_inventory: { method: 'POST', path: '/api/players/action', extra: { action: 'inventory_view' }, bodyKey: 'nickname' },
    gamemodecreative: { method: 'POST', path: '/api/players/action', extra: { action: 'gamemode', mode: 'creative' }, bodyKey: 'nickname' },
    gamemodesurvival: { method: 'POST', path: '/api/players/action', extra: { action: 'gamemode', mode: 'survival' }, bodyKey: 'nickname' },
    gamemodespectator: { method: 'POST', path: '/api/players/action', extra: { action: 'gamemode', mode: 'spectator' }, bodyKey: 'nickname' },
    gamemodeadventure: { method: 'POST', path: '/api/players/action', extra: { action: 'gamemode', mode: 'adventure' }, bodyKey: 'nickname' },
  },

  async webaction(act, args) {
    this.action_loading = true;
    try {
      const mapping = this.WEB_ACTION_MAP[act];
      if (!mapping) { this.showtoast('Unknown action: ' + act); return null; }
      const baseUrl = this.created.web_url || 'http://' + this.created.ip + ':' + (this.created.port || 25566);
      let url = baseUrl + mapping.path;
      const apiKey = this.getwebapikey(this.created.uuid);
      const fetchOpts = { method: mapping.method, headers: { 'Content-Type': 'application/json', ...(apiKey ? { 'Authorization': 'ApiKey ' + apiKey } : {}) } };
      if (mapping.method === 'GET') {
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(args || {})) { if (v !== undefined && v !== null) params.set(k, String(v)); }
        const qs = params.toString();
        if (qs) url += '?' + qs;
      } else {
        const body = { ...(args || {}) };
        if (mapping.extra) Object.assign(body, mapping.extra);
        if (mapping.bodyKey && args[mapping.bodyKey]) body.nickname = args[mapping.bodyKey];
        fetchOpts.body = JSON.stringify(body);
      }
      const res = await fetch(url, fetchOpts);
      if (!res.ok) { const errText = await res.text().catch(() => ''); this.showtoast('Error ' + res.status + ': ' + (errText || res.statusText)); return null; }
      const data = await res.json();
      if (data && data.message) this.showtoast(data.message);
      if (data && data.error) this.showtoast(data.error);
      return data;
    } catch (e) { this.showtoast('Request failed: ' + e.message); return null; }
    finally { this.action_loading = false; }
  },

  async playeraction(act, nickname) {
    const needsPrefix = ['kill', 'freeze', 'unfreeze', 'fly', 'mute', 'unmute'];
    const wsAction = needsPrefix.includes(act) ? 'player_' + act : act;
    const result = await this.action(wsAction, { nickname });
    if (this.tab === 'players') this.render();
    return result;
  },

  async serveraction(act, args) {
    const result = await this.action(act, args);
    if (this.tab === 'server') this.render();
    return result;
  },

  async togglehistory() {
    const result = await this.action('player_history_toggle', { enabled: !this.history_enabled });
    if (result && result.enabled !== undefined) this.history_enabled = result.enabled;
    this.render();
  },

  async loadhistorystats() {
    const result = await this.action('player_history_stats');
    if (result && result.stats) this.history_stats = result.stats.replace(/\u00a7[0-9a-fk-or]/gi, '');
    this.render();
  },

  async loadfiles(dirPath) {
    this.file_loading = true;
    this.file_path = dirPath;
    this.render();
    try {
      const result = await this.action('file_list', { path: dirPath });
      this.file_list = (result && result.files) ? result.files : [];
    } catch (e) { this.file_list = []; }
    this.file_loading = false;
    this.render();
  },

  async openfile(filePath) {
    this.file_loading = true;
    this.render();
    try {
      const result = await this.action('file_read', { path: filePath });
      if (result && result.content !== undefined) { this.file_content = result.content; this.file_editing = filePath; }
    } catch (e) {}
    this.file_loading = false;
    this.render();
  },

  async savefile() {
    if (!this.file_editing) return;
    this.file_saving = true;
    this.render();
    await this.action('file_write', { path: this.file_editing, content: this.file_content });
    this.file_saving = false;
    this.file_editing = null;
    this.file_content = '';
    this.render();
  },

  async deletefile(filePath) {
    Modal.confirm('Delete File', 'Are you sure you want to delete this file?', async () => {
      await this.action('file_delete', { path: filePath });
      this.loadfiles(this.file_path);
    });
  },

  async renamefile(filePath) {
    Modal.prompt('Rename', 'New name:', filePath.split('/').pop(), async (newName) => {
      await this.action('file_rename', { path: filePath, newName });
      this.loadfiles(this.file_path);
    });
  },

  async createfolder() {
    Modal.prompt('New Folder', 'Folder name:', '', async (name) => {
      const path = this.file_path === '/' ? '/' + name : this.file_path + '/' + name;
      await this.action('file_mkdir', { path });
      this.loadfiles(this.file_path);
    });
  },

  async createfile() {
    Modal.prompt('New File', 'File name:', '', async (name) => {
      const path = this.file_path === '/' ? '/' + name : this.file_path + '/' + name;
      await this.action('file_write', { path, content: '' });
      this.loadfiles(this.file_path);
    });
  },

  async uploadfile(event) {
    const file = event.target.files[0];
    if (!file) return;
    this.file_loading = true;
    this.render();
    try {
      let content;
      const ext = file.name.split('.').pop().toLowerCase();
      const textExts = ['txt','json','yml','yaml','properties','cfg','conf','ini','toml','xml','csv','log','md','js','ts','py','java','bat','sh','ps1','html','css','sql','env'];
      if (textExts.includes(ext)) {
        content = await file.text();
      } else {
        const buf = await file.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        content = btoa(binary);
      }
      const path = this.file_path === '/' ? '/' + file.name : this.file_path + '/' + file.name;
      await this.action('file_write', { path, content });
      this.showtoast('File uploaded: ' + file.name);
      this.loadfiles(this.file_path);
    } catch (e) {
      this.showtoast('Upload failed: ' + e.message);
    }
    event.target.value = '';
  },

  filegoname() {
    const parts = this.file_path.split('/').filter(Boolean);
    parts.pop();
    this.loadfiles('/' + parts.join('/'));
  },

  async loadplayers(page) {
    this.players_loading = true;
    this.players_page = page;
    this.render();
    try {
      const result = await this.action('players_list', { page, perPage: 20 });
      if (result) this.players_data = result;
    } catch (e) {}
    this.players_loading = false;
    this.render();
  },

  switchtab(tab) {
    this.tab = tab;
    if (tab === 'files') this.loadfiles(this.created && this.created.plugin_type === 'vps' ? (this.vps_cwd || '~') : '/');
    if (tab === 'players') this.loadplayers(1);
    if (tab === 'console') {
      this.consoleLines = [];
      this.action('console_start');
      this.action('console_lines', { count: 200 }).then(d => { if (d && d.lines) this.consoleLines = d.lines.map(l => '<div>' + l + '</div>'); this.renderconsole(); });
    }
    this.render();
  },

  formatsize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  },

  showtoast(msg, type) {
    const existing = document.querySelector('.mc-toast');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.className = 'mc-toast' + (type === 'error' ? ' mc-toast-error' : '');
    el.textContent = msg;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('mc-toast-show'));
    setTimeout(() => { el.classList.remove('mc-toast-show'); setTimeout(() => el.remove(), 300); }, 3000);
  },

  showerror(msg) {
    const el = document.getElementById('mcAuthError');
    if (el) el.textContent = msg;
  },

  render() {
    const el = Utils.el('tabMinecraft');
    if (!el) return;
    if (!this.token) { this.renderauth(el); return; }
    if (!this.created) { this.renderdashboard(el); return; }
    this.rendermanage(el);
  },

  renderauth(el) {
    el.innerHTML = `
      <div class="cloud-auth">
        <div class="cloud-auth-card">
          <div class="cloud-auth-logo">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="12 2 2 7 12 12 22 7 12 2"/>
              <polyline points="2 17 12 22 22 17"/>
              <polyline points="2 12 12 17 22 12"/>
            </svg>
          </div>
          <h2 class="cloud-auth-title">CTRLManage</h2>
          <p class="cloud-auth-sub">Login with your CTRLServers account to manage Minecraft servers.</p>
          <div class="cloud-auth-form">
            <button class="btn btn-primary cloud-auth-btn" onclick="MCPlugin.openauth()">Go to Web</button>
          </div>
          <div class="cloud-auth-error" id="mcAuthError"></div>
        </div>
      </div>`;
  },

  renderdashboard(el) {
    const displayName = this.user?.username || this.user?.nickname || this.user?.email || '?';
    let serversHtml = '';
    for (let i = 0; i < this.servers.length; i++) {
      const s = this.servers[i];
      const statusClass = s.active ? 'mc-server-active' : 'mc-server-inactive';
      const statusText = s.active ? 'Active' : 'Inactive';
      const typeBadge = s.plugin_type === 'vps' ? 'VPS' : s.plugin_type === 'web' ? 'Web' : 'WS';
      serversHtml += `
        <div class="mc-server-card" onclick="MCPlugin._selectserverbyidx(${i})">
          <div class="mc-server-header">
            <div class="mc-server-name">${Utils.escape(s.name)}</div>
            <span class="mc-server-badge mc-badge-${typeBadge.toLowerCase()}">${typeBadge}</span>
          </div>
          <div class="mc-server-ip">${Utils.escape(s.ip)}</div>
          <div class="mc-server-status">
            <span class="mc-status-dot ${statusClass}"></span>
            <span>${statusText}</span>
          </div>
        </div>`;
    }
    el.innerHTML = `
      <div class="mc-container">
        <div class="mc-header">
          <div class="mc-header-left">
            <div class="mc-user-avatar">${displayName[0].toUpperCase()}</div>
            <div class="mc-user-info">
              <h3 class="mc-user-name">${Utils.escape(displayName)}</h3>
              <span class="mc-user-email">${Utils.escape(this.user?.email || '')}</span>
            </div>
          </div>
          <div class="mc-header-actions">
            <button class="btn btn-primary btn-sm" onclick="MCPlugin.showcreate()">+ Add Server</button>
            <button class="btn btn-secondary btn-sm" onclick="MCPlugin.logout()">Sign Out</button>
          </div>
        </div>
        <div class="mc-servers-grid" id="mcServersGrid">
          ${serversHtml || '<div class="mc-empty"><p>No servers yet. Click "Add Server" to get started.</p></div>'}
        </div>
        <div id="mcCreateForm" style="display:none;"></div>
      </div>`;
  },

  showcreate() {
    const formEl = document.getElementById('mcCreateForm');
    if (!formEl) return;
    formEl.style.display = formEl.style.display === 'none' ? '' : 'none';
    formEl.innerHTML = `
      <div class="mc-create-form">
        <h3>Add Server</h3>
        <div class="mc-form-group">
          <label>Server Name</label>
          <input type="text" id="mcNewName" class="mc-input" placeholder="My Server">
        </div>
        <div class="mc-form-group">
          <label>Server IP</label>
          <input type="text" id="mcNewIp" class="mc-input" placeholder="127.0.0.1">
        </div>
        <div class="mc-form-group">
          <label>Plugin Type</label>
          <select id="mcPluginType" class="mc-input" onchange="MCPlugin.onTypeChange()">
            <option value="websocket">WebSocket</option>
            <option value="web">Web Plugin</option>
            <option value="vps">VPS Agent</option>
          </select>
        </div>
        <div class="mc-form-group" id="mcPortGroup" style="display:none;">
          <label>Port</label>
          <input type="text" id="mcNewPort" class="mc-input" placeholder="25566" value="25566">
        </div>
        <div class="mc-form-error" id="mcCreateError"></div>
        <div class="mc-form-actions">
          <button class="btn btn-secondary btn-sm" onclick="document.getElementById('mcCreateForm').style.display='none'">Cancel</button>
          <button class="btn btn-primary btn-sm" onclick="MCPlugin.createserver()" id="mcCreateBtn">Create</button>
        </div>
      </div>`;
  },

  onTypeChange() {
    const typeEl = document.getElementById('mcPluginType');
    const portGroup = document.getElementById('mcPortGroup');
    if (typeEl && portGroup) portGroup.style.display = typeEl.value === 'web' ? '' : 'none';
  },

  rendermanage(el) {
    const s = this.created;
    const isNotConnected = !s.connected;

    if (isNotConnected) {
      this.rendersetup(el, s);
      return;
    }

    const tabs = s.plugin_type === 'vps'
      ? [{ id: 'console', label: 'Console' }, { id: 'system', label: 'System' }, { id: 'files', label: 'Files' }]
      : [{ id: 'console', label: 'Console' }, { id: 'files', label: 'Files' }, { id: 'server', label: 'Server' }, { id: 'world', label: 'World' }, { id: 'players', label: 'Players' }];

    let tabsHtml = tabs.map(t =>
      `<button class="mc-tab ${this.tab === t.id ? 'mc-tab-active' : ''}" onclick="MCPlugin.switchtab('${t.id}')">${t.label}</button>`
    ).join('');

    let contentHtml = '';

    if (this.tab === 'console') contentHtml = this.renderconsoletab(s);
    else if (this.tab === 'files') contentHtml = this.renderfilestab(s);
    else if (this.tab === 'server') contentHtml = this.renderservertab();
    else if (this.tab === 'world') contentHtml = this.renderworldtab();
    else if (this.tab === 'players') contentHtml = this.renderplayerstab();
    else if (this.tab === 'system') contentHtml = this.rendersystemtab();

    el.innerHTML = `
      <div class="mc-container">
        <div class="mc-manage-header">
          <button class="btn btn-secondary btn-sm" onclick="MCPlugin.backtoservers()">← Back</button>
          <div class="mc-manage-title">
            <span class="mc-manage-name">${Utils.escape(s.name)}</span>
            <span class="mc-manage-ip">${Utils.escape(s.ip)}</span>
            <span class="mc-manage-status"><span class="mc-status-dot mc-server-active"></span> Connected</span>
          </div>
          <button class="btn btn-danger btn-sm" onclick="MCPlugin.show_delete=true;MCPlugin.render()">Delete</button>
        </div>
        <div class="mc-tabs">${tabsHtml}</div>
        <div class="mc-tab-content">${contentHtml}</div>
        ${this.show_delete ? this.renderdeletemodal() : ''}
      </div>`;

    if (this.tab === 'console') this.renderconsole();
  },

  async backtoservers() {
    if (this.ws) {
      try { this.ws.send(JSON.stringify({ action: 'console_stop', arguments: {} })); } catch (e) {}
      this.disconnectws();
    }
    this.created = null;
    this.render();
  },

  rendersetup(el, s) {
    const isWeb = s.plugin_type === 'web';
    const isVps = s.plugin_type === 'vps';

    if (isVps) {
      const step = this.vps_step || 1;
      el.innerHTML = `
      <div class="mc-container">
        <div class="mc-manage-header">
          <button class="btn btn-secondary btn-sm" onclick="MCPlugin.created=null;MCPlugin.render()">← Back</button>
          <div class="mc-manage-title">
            <span class="mc-manage-name">${Utils.escape(s.name)}</span>
            <span class="mc-manage-ip">${Utils.escape(s.ip)}</span>
          </div>
        </div>
        <div class="mc-setup-card">
          <div class="mc-download-card">
            <div class="mc-jar-icon" style="background:rgba(16,185,129,0.15);color:#10b981;">VPS</div>
            <div class="mc-download-info">
              <strong>CTRLManage-VPS</strong>
              <span>Node.js agent</span>
            </div>
          </div>
          ${step === 1 ? `
            <div class="mc-instructions">
              <h4>Step 1: Install Agent</h4>
              <ol>
                <li>Copy your API key below:</li>
              </ol>
              <div class="mc-cmd">
                <span>${Utils.escape(this.vps_api_key)}</span>
                <button class="mc-copy-btn" onclick="navigator.clipboard.writeText('${Utils.escape(this.vps_api_key)}');MCPlugin.showtoast('Copied!')">Copy</button>
              </div>
              <div class="mc-cmd mc-cmd-warning">Save this key. It won't be shown again.</div>
              <ol start="2">
                <li>Run this command on your VPS as <strong>root</strong>:</li>
              </ol>
              <div class="mc-cmd">
                <span>curl https://app.ctrlservers.xyz/ctrlmanage-vps.sh | bash</span>
                <button class="mc-copy-btn" onclick="navigator.clipboard.writeText('curl https://app.ctrlservers.xyz/ctrlmanage-vps.sh | bash');MCPlugin.showtoast('Copied!')">Copy</button>
              </div>
              <div class="mc-cmd mc-cmd-info">Requires root access. The agent will start automatically via systemd.</div>
              <button class="btn btn-primary" onclick="MCPlugin.vps_step=2;MCPlugin.render()">I ran the command</button>
            </div>
          ` : step === 2 ? `
            <div class="mc-instructions">
              <h4>Step 2: Manual Fallback (if needed)</h4>
              <p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;">If the curl command didn't work, try these steps manually:</p>
              <div class="mc-cmd">
                <span>chmod +x ctrlmanage-vps.sh && ./ctrlmanage-vps.sh</span>
                <button class="mc-copy-btn" onclick="navigator.clipboard.writeText('chmod +x ctrlmanage-vps.sh && ./ctrlmanage-vps.sh');MCPlugin.showtoast('Copied!')">Copy</button>
              </div>
              <div class="mc-cmd mc-cmd-info">The script will ask for your API key.</div>
              <p style="font-size:13px;color:var(--text-secondary);margin:12px 0 8px;">Verify the service is running:</p>
              <div class="mc-cmd">
                <span>systemctl status ctrlmanage-vps</span>
                <button class="mc-copy-btn" onclick="navigator.clipboard.writeText('systemctl status ctrlmanage-vps');MCPlugin.showtoast('Copied!')">Copy</button>
              </div>
              <button class="btn btn-primary" onclick="MCPlugin.vps_step=3;MCPlugin.render()">I started the service</button>
            </div>
          ` : `
            <div class="mc-instructions">
              <h4>Step 3: Connecting...</h4>
              <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;">Waiting for the agent to connect...</p>
              <button class="btn btn-primary" onclick="MCPlugin.checkcommand()" ${this.checking ? 'disabled' : ''}>
                ${this.checking ? 'Checking...' : 'Retry'}
              </button>
            </div>
          `}
        </div>
      </div>`;
      return;
    }

    const jarName = isWeb ? 'CTRLManage-Web' : 'CTRLManage';
    const jarUrl = isWeb ? 'https://app.ctrlservers.xyz/CTRLManage-Web.jar' : 'https://app.ctrlservers.xyz/CTRLManage.jar';
    const jarSize = isWeb ? '~132 KB' : '~350 KB';
    el.innerHTML = `
      <div class="mc-container">
        <div class="mc-manage-header">
          <button class="btn btn-secondary btn-sm" onclick="MCPlugin.created=null;MCPlugin.render()">← Back</button>
          <div class="mc-manage-title">
            <span class="mc-manage-name">${Utils.escape(s.name)}</span>
            <span class="mc-manage-ip">${Utils.escape(s.ip)}</span>
          </div>
        </div>
        <div class="mc-setup-card">
          <div class="mc-download-card">
            <div class="mc-jar-icon">JAR</div>
            <div class="mc-download-info">
              <strong>${jarName}</strong>
              <span>${jarSize}</span>
            </div>
            <a href="${jarUrl}" target="_blank" download class="btn btn-primary btn-sm" style="text-decoration:none">Download</a>
          </div>
          <div class="mc-instructions">
            <h4>Setup Instructions</h4>
            <ol>
              <li>Download and install the <strong>${jarName}</strong> plugin on your server</li>
              <li>Open your server console</li>
              <li>Run the following command (admin only):</li>
            </ol>
            <div class="mc-cmd">
              <span>/ctrlmanage enter ${Utils.escape(this.vps_api_key)}</span>
              <button class="mc-copy-btn" onclick="navigator.clipboard.writeText('/ctrlmanage enter ${Utils.escape(this.vps_api_key)}');MCPlugin.showtoast('Copied!')">Copy</button>
            </div>
            <div class="mc-cmd mc-cmd-warning">Save this key. It won't be shown again.</div>
            ${isWeb ? `<div class="mc-cmd mc-cmd-info">Web Plugin runs on port <strong>${s.port || 25566}</strong>. Make sure this port is accessible.</div>` : ''}
            <button class="btn btn-primary" onclick="MCPlugin.checkcommand()" ${this.checking ? 'disabled' : ''}>
              ${this.checking ? 'Checking...' : 'I entered command'}
            </button>
            ${isWeb && this.web_needs_apikey ? `
              <div class="mc-apikey-section">
                <label>Enter the API key from <code>plugins/CTRLManage-Web/config.yml</code></label>
                <div style="display:flex;gap:8px">
                  <input type="text" id="mcWebApiKey" class="mc-input" placeholder="API Key from config.yml" value="${Utils.escape(this.web_apikey_input)}">
                  <button class="btn btn-primary btn-sm" onclick="MCPlugin.webapikey_input=document.getElementById('mcWebApiKey').value;MCPlugin.webconnect(MCPlugin.webapikey_input)">Connect</button>
                </div>
              </div>
            ` : ''}
          </div>
        </div>
      </div>`;
  },

  renderconsoletab(s) {
    let controlsHtml = '';
    if (s.plugin_type === 'vps') {
      controlsHtml = `<button class="mc-action-btn" onclick="MCPlugin.consoleLines=[];MCPlugin.renderconsole()">Clear</button>`;
    } else {
      controlsHtml = `
        <button class="mc-action-btn" onclick="MCPlugin.serveraction('restart')" ${this.action_loading ? 'disabled' : ''}>Restart</button>
        <button class="mc-action-btn mc-action-danger" onclick="MCPlugin.serveraction('stop')" ${this.action_loading ? 'disabled' : ''}>Stop</button>
        <button class="mc-action-btn" onclick="MCPlugin.serveraction('saveworld')" ${this.action_loading ? 'disabled' : ''}>Save World</button>
        <button class="mc-action-btn" onclick="MCPlugin.consoleLines=[];MCPlugin.renderconsole()">Clear</button>`;
    }
    return `
      <div class="mc-console">
        <div class="mc-console-controls">${controlsHtml}</div>
        <div class="mc-terminal" id="mcConsoleOutput">${this.consoleLines.length === 0 ? '<div class="mc-term-empty">Waiting for console output...</div>' : ''}</div>
        <div class="mc-console-input-row">
          <input type="text" id="mcConsoleInput" class="mc-console-input" placeholder="Enter command..." onkeydown="if(event.key==='Enter')MCPlugin.sendconsole()">
          <button class="btn btn-primary btn-sm" onclick="MCPlugin.sendconsole()">Send</button>
        </div>
      </div>`;
  },

  renderfilestab(s) {
    if (this.file_editing) {
      return `
        <div class="mc-file-editor">
          <div class="mc-file-editor-header">
            <span class="mc-file-editor-path">${Utils.escape(this.file_editing)}</span>
            <div class="mc-file-editor-actions">
              <button class="btn btn-primary btn-sm" onclick="MCPlugin.savefile()" ${this.file_saving ? 'disabled' : ''}>${this.file_saving ? 'Saving...' : 'Save'}</button>
              <button class="btn btn-secondary btn-sm" onclick="MCPlugin.file_editing=null;MCPlugin.file_content='';MCPlugin.render()">Close</button>
            </div>
          </div>
          <textarea class="mc-file-textarea" id="mcFileContent" spellcheck="false" oninput="MCPlugin.file_content=this.value">${Utils.escape(this.file_content)}</textarea>
        </div>`;
    }

    const parts = this.file_path.split('/').filter(Boolean);
    let bcHtml = '<span class="mc-bc-item" onclick="MCPlugin.loadfiles(\'/\')">/</span>';
    for (let i = 0; i < parts.length; i++) {
      const p = parts.slice(0, i + 1).join('/');
      bcHtml += `<span class="mc-bc-sep">›</span><span class="mc-bc-item" onclick="MCPlugin.loadfiles('/${p}')">${Utils.escape(parts[i])}</span>`;
    }

    let filesHtml = '';
    if (this.file_loading) {
      filesHtml = '<div class="mc-file-loading">Loading...</div>';
    } else if (this.file_list.length === 0) {
      filesHtml = '<div class="mc-file-empty"><p>Empty directory</p></div>';
    } else {
      for (const f of this.file_list) {
        const isDir = f.isDir || f.isDirectory;
        const fullPath = this.file_path === '/' ? '/' + f.name : this.file_path + '/' + f.name;
        const clickAction = isDir ? `MCPlugin.loadfiles('${Utils.escape(fullPath)}')` : `MCPlugin.openfile('${Utils.escape(fullPath)}')`;
        filesHtml += `
          <div class="mc-file-row" onclick="${clickAction}">
            <div class="mc-file-icon">${isDir ? '📁' : '📄'}</div>
            <span class="mc-file-name">${Utils.escape(f.name)}</span>
            <span class="mc-file-size">${isDir ? '-' : this.formatsize(f.size || 0)}</span>
            <div class="mc-file-actions">
              ${!isDir ? `<button class="mc-file-btn" onclick="event.stopPropagation();MCPlugin.openfile('${Utils.escape(fullPath)}')" title="Edit">Edit</button>` : ''}
              <button class="mc-file-btn" onclick="event.stopPropagation();MCPlugin.renamefile('${Utils.escape(fullPath)}')" title="Rename">Rename</button>
              <button class="mc-file-btn mc-file-btn-danger" onclick="event.stopPropagation();MCPlugin.deletefile('${Utils.escape(fullPath)}')" title="Delete">Del</button>
            </div>
          </div>`;
      }
    }

    return `
      <div class="mc-files">
        <div class="mc-file-toolbar">
          <div class="mc-file-breadcrumb">${bcHtml}</div>
          <div class="mc-file-toolbar-btns">
            <button class="mc-tool-btn" onclick="MCPlugin.filegoname()" ${this.file_path === '/' ? 'disabled' : ''}>↑ Up</button>
            <button class="mc-tool-btn" onclick="MCPlugin.createfolder()">+ Folder</button>
            <button class="mc-tool-btn" onclick="MCPlugin.createfile()">+ File</button>
            <label class="mc-tool-btn">Upload<input type="file" hidden onchange="MCPlugin.uploadfile(event)"></label>
          </div>
        </div>
        <div class="mc-file-list">${filesHtml}</div>
      </div>`;
  },

  renderservertab() {
    return `
      <div class="mc-mgmt-card">
        <h3>Broadcast</h3>
        <div class="mc-mgmt-row">
          <input type="text" class="mc-input" id="mcBroadcastMsg" placeholder="Message to all players" onkeydown="if(event.key==='Enter'){MCPlugin.serveraction('broadcast',{message:this.value}).then(()=>this.value='')}">
          <button class="btn btn-primary btn-sm" onclick="const i=document.getElementById('mcBroadcastMsg');MCPlugin.serveraction('broadcast',{message:i.value}).then(()=>{i.value=''})">Send</button>
        </div>
      </div>
      <div class="mc-mgmt-card">
        <h3>Server Output</h3>
        <div class="mc-mgmt-btns">
          <button class="mc-action-btn" onclick="MCPlugin.serveraction('output',{type:'tps'})">TPS</button>
          <button class="mc-action-btn" onclick="MCPlugin.serveraction('output',{type:'players'})">Players</button>
          <button class="mc-action-btn" onclick="MCPlugin.serveraction('output',{type:'ram'})">RAM</button>
          <button class="mc-action-btn" onclick="MCPlugin.serveraction('output',{type:'cpu'})">CPU</button>
        </div>
        ${this.output ? `<div class="mc-output"><pre>${Utils.escape(JSON.stringify(this.output, null, 2))}</pre></div>` : ''}
      </div>
      <div class="mc-mgmt-card">
        <h3>Whitelist</h3>
        <div class="mc-mgmt-row">
          <input type="text" class="mc-input" id="mcWhitelistNick" placeholder="Player name">
          <button class="btn btn-primary btn-sm" onclick="MCPlugin.serveraction('whitelistadd',{nickname:document.getElementById('mcWhitelistNick').value})">Add</button>
          <button class="btn btn-secondary btn-sm" onclick="MCPlugin.serveraction('whitelistremove',{nickname:document.getElementById('mcWhitelistNick').value})">Remove</button>
        </div>
        <div class="mc-mgmt-btns" style="margin-top:0.5rem">
          <button class="mc-action-btn" onclick="MCPlugin.serveraction('whiteliston')">Whitelist ON</button>
          <button class="mc-action-btn" onclick="MCPlugin.serveraction('whitelistoff')">Whitelist OFF</button>
        </div>
      </div>`;
  },

  renderworldtab() {
    return `
      <div class="mc-mgmt-card">
        <h3>Time</h3>
        <div class="mc-mgmt-row">
          <select id="mcTimeSelect" class="mc-input">
            <option value="day">Day</option>
            <option value="noon">Noon</option>
            <option value="night">Night</option>
            <option value="midnight">Midnight</option>
          </select>
          <button class="btn btn-primary btn-sm" onclick="MCPlugin.serveraction('timeset',{time:document.getElementById('mcTimeSelect').value})">Set Time</button>
        </div>
      </div>
      <div class="mc-mgmt-card">
        <h3>Weather</h3>
        <div class="mc-mgmt-row">
          <select id="mcWeatherSelect" class="mc-input">
            <option value="clear">Clear</option>
            <option value="rain">Rain</option>
            <option value="thunder">Thunder</option>
          </select>
          <button class="btn btn-primary btn-sm" onclick="MCPlugin.serveraction('weather',{weather:document.getElementById('mcWeatherSelect').value})">Set Weather</button>
        </div>
      </div>`;
  },

  renderplayerstab() {
    const pd = this.players_data;
    let playersListHtml = '';
    if (this.players_loading) {
      playersListHtml = '<div class="mc-file-loading">Loading...</div>';
    } else if (pd.players.length === 0) {
      playersListHtml = '<div class="mc-file-empty"><p>No players online</p></div>';
    } else {
      for (const p of pd.players) {
        playersListHtml += `
          <div class="mc-player-row">
            <div class="mc-player-info">
              <span class="mc-player-name">${Utils.escape(p.name)}</span>
              <span class="mc-player-meta">${p.gamemode || ''} · ${p.ping || 0}ms</span>
            </div>
            <div class="mc-player-actions">
              <button class="mc-player-btn" onclick="MCPlugin.playeraction('op','${Utils.escape(p.name)}')" title="OP">OP</button>
              <button class="mc-player-btn" onclick="MCPlugin.playeraction('deop','${Utils.escape(p.name)}')" title="Deop">Deop</button>
              <button class="mc-player-btn" onclick="MCPlugin.playeraction('kick','${Utils.escape(p.name)}')" title="Kick">Kick</button>
              <button class="mc-player-btn mc-player-btn-danger" onclick="MCPlugin.playeraction('ban','${Utils.escape(p.name)}')" title="Ban">Ban</button>
              <button class="mc-player-btn" onclick="MCPlugin.playeraction('heal','${Utils.escape(p.name)}')" title="Heal">Heal</button>
              <button class="mc-player-btn" onclick="MCPlugin.playeraction('feed','${Utils.escape(p.name)}')" title="Feed">Feed</button>
              <button class="mc-player-btn" onclick="MCPlugin.playeraction('clear','${Utils.escape(p.name)}')" title="Clear">Clear</button>
            </div>
          </div>`;
      }
    }

    let paginationHtml = '';
    if (pd.totalPages > 1) {
      paginationHtml = `
        <div class="mc-pagination">
          <button class="mc-page-btn" onclick="MCPlugin.loadplayers(${this.players_page - 1})" ${this.players_page <= 1 ? 'disabled' : ''}>Prev</button>
          <span class="mc-page-info">${this.players_page} / ${pd.totalPages}</span>
          <button class="mc-page-btn" onclick="MCPlugin.loadplayers(${this.players_page + 1})" ${!pd.hasMore ? 'disabled' : ''}>Show More</button>
        </div>`;
    }

    let inventoryHtml = '';
    if (this.inventory_data && this.inventory_data.success) {
      const inv = this.inventory_data;
      inventoryHtml = `
        <div class="mc-mgmt-card">
          <h3 style="display:flex;align-items:center;justify-content:space-between">${Utils.escape(inv.player)}'s Inventory <button class="mc-action-btn" onclick="MCPlugin.inventory_data=null;MCPlugin.render()">Close</button></h3>
          <div class="mc-output">
            ${inv.armor && inv.armor.length ? `<div><strong>Armor:</strong><div class="mc-inv-grid">${inv.armor.map(a => `<div class="mc-inv-slot">${a.slot}: ${a.type === 'AIR' ? 'empty' : a.type + ' x' + a.amount}</div>`).join('')}</div></div>` : ''}
            ${inv.offhand && inv.offhand.type !== 'AIR' ? `<div style="margin-top:0.4rem"><strong>Offhand:</strong> ${inv.offhand.type} x${inv.offhand.amount}</div>` : ''}
            ${inv.inventory && inv.inventory.length ? `<div style="margin-top:0.4rem"><strong>Inventory:</strong><div class="mc-inv-grid">${inv.inventory.filter(x => x.type !== 'AIR').map(item => `<div class="mc-inv-slot">[${item.slot}] ${item.type} x${item.amount}</div>`).join('')}</div></div>` : ''}
          </div>
        </div>`;
    }

    return `
      <div class="mc-mgmt-card">
        <h3>Online Players (${pd.total}) <button class="mc-tool-btn" style="margin-left:auto" onclick="MCPlugin.loadplayers(${this.players_page || 1})">Refresh</button></h3>
        <div class="mc-players-list">${playersListHtml}</div>
        ${paginationHtml}
      </div>
      <div class="mc-mgmt-card">
        <h3>Player Actions</h3>
        <div class="mc-mgmt-row" style="margin-bottom:0.75rem">
          <input type="text" class="mc-input" id="mcPlayerNick" placeholder="Player name" value="${Utils.escape(this.player_nick)}" oninput="MCPlugin.player_nick=this.value">
        </div>
        <div class="mc-sections-grid">
          <div class="mc-section-card">
            <div class="mc-section-title">Permissions</div>
            <div class="mc-section-btns">
              <button class="mc-action-btn" onclick="MCPlugin.playeraction('op',MCPlugin.player_nick)">OP</button>
              <button class="mc-action-btn" onclick="MCPlugin.playeraction('deop',MCPlugin.player_nick)">Deop</button>
            </div>
          </div>
          <div class="mc-section-card">
            <div class="mc-section-title">Moderation</div>
            <div class="mc-section-btns">
              <button class="mc-action-btn" onclick="MCPlugin.playeraction('kick',MCPlugin.player_nick)">Kick</button>
              <button class="mc-action-btn mc-action-danger" onclick="MCPlugin.playeraction('ban',MCPlugin.player_nick)">Ban</button>
              <button class="mc-action-btn" onclick="MCPlugin.playeraction('unban',MCPlugin.player_nick)">Unban</button>
              <button class="mc-action-btn" onclick="MCPlugin.mute_modal=true;MCPlugin.render()">Mute</button>
              <button class="mc-action-btn" onclick="MCPlugin.playeraction('unmute',MCPlugin.player_nick)">Unmute</button>
            </div>
          </div>
          <div class="mc-section-card">
            <div class="mc-section-title">Gamemode</div>
            <div class="mc-section-btns">
              <button class="mc-action-btn" onclick="MCPlugin.playeraction('gamemodesurvival',MCPlugin.player_nick)">Survival</button>
              <button class="mc-action-btn" onclick="MCPlugin.playeraction('gamemodecreative',MCPlugin.player_nick)">Creative</button>
              <button class="mc-action-btn" onclick="MCPlugin.playeraction('gamemodeadventure',MCPlugin.player_nick)">Adventure</button>
              <button class="mc-action-btn" onclick="MCPlugin.playeraction('gamemodespectator',MCPlugin.player_nick)">Spectator</button>
            </div>
          </div>
          <div class="mc-section-card">
            <div class="mc-section-title">Player</div>
            <div class="mc-section-btns">
              <button class="mc-action-btn" onclick="MCPlugin.playeraction('heal',MCPlugin.player_nick)">Heal</button>
              <button class="mc-action-btn" onclick="MCPlugin.playeraction('feed',MCPlugin.player_nick)">Feed</button>
              <button class="mc-action-btn" onclick="MCPlugin.playeraction('clear',MCPlugin.player_nick)">Clear</button>
              <button class="mc-action-btn" onclick="MCPlugin.action('player_inventory',{nickname:MCPlugin.player_nick})">Inventory</button>
              <button class="mc-action-btn mc-action-danger" onclick="MCPlugin.playeraction('kill',MCPlugin.player_nick)">Kill</button>
            </div>
          </div>
          <div class="mc-section-card">
            <div class="mc-section-title">Movement</div>
            <div class="mc-section-btns">
              <button class="mc-action-btn" onclick="MCPlugin.playeraction('fly',MCPlugin.player_nick)">Fly</button>
              <button class="mc-action-btn" onclick="MCPlugin.playeraction('freeze',MCPlugin.player_nick)">Freeze</button>
              <button class="mc-action-btn" onclick="MCPlugin.playeraction('unfreeze',MCPlugin.player_nick)">Unfreeze</button>
            </div>
          </div>
          <div class="mc-section-card">
            <div class="mc-section-title">Experience</div>
            <div class="mc-section-btns">
              <input type="number" class="mc-input" id="mcXpAmount" placeholder="XP amount" min="1" style="flex:1">
              <button class="mc-action-btn" onclick="MCPlugin.action('player_xp_add',{nickname:MCPlugin.player_nick,amount:Number(document.getElementById('mcXpAmount').value)})">+ XP</button>
              <button class="mc-action-btn mc-action-danger" onclick="MCPlugin.action('player_xp_remove',{nickname:MCPlugin.player_nick,amount:Number(document.getElementById('mcXpAmount').value)})">- XP</button>
            </div>
          </div>
          <div class="mc-section-card">
            <div class="mc-section-title">Items</div>
            <div class="mc-section-btns">
              <input type="text" class="mc-input" id="mcGiveMaterial" placeholder="Material (e.g. diamond)" style="flex:1">
              <input type="number" class="mc-input" id="mcGiveAmount" placeholder="Amount" min="1" max="64" style="width:80px">
              <button class="mc-action-btn" onclick="MCPlugin.action('player_give',{nickname:MCPlugin.player_nick,material:document.getElementById('mcGiveMaterial').value,amount:Number(document.getElementById('mcGiveAmount').value)||1})">Give</button>
            </div>
          </div>
          <div class="mc-section-card">
            <div class="mc-section-title">Effects</div>
            <div class="mc-section-btns">
              <input type="text" class="mc-input" id="mcEffectType" placeholder="Effect (e.g. speed)" style="flex:1">
              <input type="number" class="mc-input" id="mcEffectDuration" placeholder="Sec" min="1" style="width:70px">
              <input type="number" class="mc-input" id="mcEffectLevel" placeholder="Lvl" min="1" max="255" style="width:60px">
              <button class="mc-action-btn" onclick="MCPlugin.action('player_effect',{nickname:MCPlugin.player_nick,effect:document.getElementById('mcEffectType').value,duration:Number(document.getElementById('mcEffectDuration').value)||30,amplifier:Number(document.getElementById('mcEffectLevel').value)||1})">Add Effect</button>
            </div>
          </div>
        </div>
      </div>
      ${this.mute_modal ? `
        <div class="mc-modal-overlay" onclick="if(event.target===this){MCPlugin.mute_modal=false;MCPlugin.render()}">
          <div class="mc-modal-card">
            <h3>Mute ${Utils.escape(this.player_nick)}</h3>
            <div class="mc-mgmt-row" style="margin-top:0.5rem">
              <input type="number" class="mc-input" id="mcMuteDuration" placeholder="Duration in seconds (0 = permanent)" min="0" style="flex:1">
            </div>
            <div style="display:flex;gap:0.5rem;margin-top:0.75rem;justify-content:flex-end">
              <button class="btn btn-secondary btn-sm" onclick="MCPlugin.mute_modal=false;MCPlugin.render()">Cancel</button>
              <button class="btn btn-primary btn-sm" onclick="MCPlugin.action('player_mute',{nickname:MCPlugin.player_nick,duration:Number(document.getElementById('mcMuteDuration').value)||0}).then(()=>{MCPlugin.mute_modal=false;MCPlugin.render()})">Mute</button>
            </div>
          </div>
        </div>
      ` : ''}
      ${inventoryHtml}
      <div class="mc-mgmt-card">
        <h3>Player History</h3>
        <div class="mc-mgmt-btns">
          <button class="mc-action-btn" onclick="MCPlugin.togglehistory()">${this.history_enabled ? 'Disable' : 'Enable'}</button>
          <button class="mc-action-btn" onclick="MCPlugin.loadhistorystats()">Stats</button>
        </div>
        ${this.history_stats ? `<div class="mc-output" style="margin-top:0.5rem"><pre style="white-space:pre-wrap">${Utils.escape(this.history_stats)}</pre></div>` : ''}
      </div>`;
  },

  rendersystemtab() {
    return `<div class="mc-mgmt-card"><h3>System Information</h3><p>System tab not available for this plugin type.</p></div>`;
  },

  renderdeletemodal() {
    return `
      <div class="mc-modal-overlay" onclick="if(event.target===this){MCPlugin.show_delete=false;MCPlugin.render()}">
        <div class="mc-modal-card">
          <h3 style="text-align:center">Delete Server?</h3>
          <p style="text-align:center;color:var(--text-dim)">"${Utils.escape(this.created?.name)}" will be permanently removed.</p>
          <div style="display:flex;gap:0.5rem;justify-content:center;margin-top:1rem">
            <button class="btn btn-secondary btn-sm" onclick="MCPlugin.show_delete=false;MCPlugin.render()">Cancel</button>
            <button class="btn btn-danger btn-sm" onclick="MCPlugin.deleteserver()" ${this.deleting ? 'disabled' : ''}>${this.deleting ? 'Deleting...' : 'Delete'}</button>
          </div>
        </div>
      </div>`;
  },
};
