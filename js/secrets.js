const SecretStorage = {
  tokenStatus: {},
  ready: false,

  _json(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
    catch { return fallback; }
  },

  async init() {
    if (this.ready) return;
    const legacy = {
      servers: this._json('ctrl_servers', []),
      keychain: this._json('ctrlservers_keychain', []),
      sftp: this._json('ctrlservers_sftp', []),
      tokens: {
        cloud: localStorage.getItem('ctrl_cloud_token') || '',
        selfhost: localStorage.getItem('selfhost_token') || '',
        mcplugin: localStorage.getItem('mcplugin_token') || '',
      },
      mcplugin: Object.fromEntries(Object.keys(localStorage)
        .filter(key => key.startsWith('mcplugin_apikey_'))
        .map(key => [key.slice('mcplugin_apikey_'.length), localStorage.getItem(key) || ''])),
    };
    const migrated = await window.electronAPI.securestoremigrate(legacy);
    localStorage.setItem('ctrl_servers', JSON.stringify(migrated.servers));
    localStorage.setItem('ctrlservers_keychain', JSON.stringify(migrated.keychain));
    localStorage.setItem('ctrlservers_sftp', JSON.stringify(migrated.sftp));
    localStorage.removeItem('ctrl_cloud_token');
    localStorage.removeItem('selfhost_token');
    localStorage.removeItem('mcplugin_token');
    Object.keys(localStorage).filter(key => key.startsWith('mcplugin_apikey_')).forEach(key => localStorage.removeItem(key));
    this.tokenStatus = migrated.tokenStatus || {};
    this.ready = true;
  },

  tokenref(name) {
    return this.tokenStatus[name] ? `ctrlservers-token:${name}` : null;
  },

  async savetoken(name, value) {
    this.tokenStatus[name] = await window.electronAPI.securestoresavetoken(name, value);
    return this.tokenref(name);
  },

  async saveservers(servers) {
    const publicServers = await window.electronAPI.securestoresaveservers(servers);
    localStorage.setItem('ctrl_servers', JSON.stringify(publicServers));
    return publicServers;
  },

  async savekeychain(keys) {
    const publicKeys = await window.electronAPI.securestoresavekeychain(keys);
    localStorage.setItem('ctrlservers_keychain', JSON.stringify(publicKeys));
    return publicKeys;
  },

  async savesftp(connections) {
    const publicConnections = await window.electronAPI.securestoresavesftp(connections);
    localStorage.setItem('ctrlservers_sftp', JSON.stringify(publicConnections));
    return publicConnections;
  },
};
