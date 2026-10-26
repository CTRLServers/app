const { app, BrowserWindow, ipcMain, shell, Notification, Tray, Menu, dialog, safeStorage } = require('electron');
const path = require('path');
const WebSocket = require('ws');
const { Client } = require('ssh2');
const net = require('net');
const fs = require('fs');
const os = require('os');
const { PERMISSION_DEFINITIONS, defaultpermissions, permissionfortool } = require('./mcp/permissions.cjs');

const APP_VERSION = '1.1.9';
const GITHUB_REPO = 'CTRLServers/app';
app.setAppUserModelId('com.ctrlservers.app');

const CLOUD_CALLBACK_PORT = 12747;

const isPortable = process.env.PORTABLE_EXECUTABLE_DIR || process.argv.includes('--portable');
if (isPortable) {
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath);
  app.setPath('userData', path.join(portableDir, 'ctrlservers-data'));
}

function handleDeepLink(url) {
  if (!url || typeof url !== 'string') return;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'ctrlservers:' && parsed.hostname === 'cloud-action') {
      const token = parsed.searchParams.get('token');
      const source = parsed.searchParams.get('source') || 'cloud';
      if (token && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('cloud-action', { token, source });
      }
    }
  } catch (e) {}
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
    const url = commandLine.find(arg => arg.startsWith('ctrlservers://'));
    if (url) handleDeepLink(url);
  });

  app.on('open-url', (event, url) => {
    event.preventDefault();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
      handleDeepLink(url);
    }
  });

  app.whenReady().then(() => {
    app.setAsDefaultProtocolClient('ctrlservers');
    createwindow();
    createtray();
    startmcpifneeded();

    try {
      const http = require('http');
      const callbackServer = http.createServer((req, res) => {
        const url = new URL(req.url, `http://127.0.0.1:${CLOUD_CALLBACK_PORT}`);
        if (url.pathname === '/accept-servers') {
          const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '86400',
          };
          if (req.method === 'OPTIONS') {
            res.writeHead(204, { ...corsHeaders, 'Content-Length': '0' });
            res.end();
            return;
          }
          const json = (code, obj) => {
            res.writeHead(code, { ...corsHeaders, 'Content-Type': 'application/json' });
            res.end(JSON.stringify(obj));
          };
          if (req.method !== 'POST') {
            json(405, { success: false, error: 'Method not allowed, use POST' });
            return;
          }
          let body = '';
          req.on('data', (chunk) => {
            body += chunk.toString('utf8');
            if (body.length > 1024 * 1024) { try { req.destroy(); } catch (e) {} }
          });
          req.on('end', () => {
            let payload;
            try {
              payload = JSON.parse(body);
            } catch (e) {
              json(400, { success: false, error: 'Invalid server payload' });
              return;
            }
            const servers = Array.isArray(payload) ? payload : payload && typeof payload === 'object' ? payload.servers : null;
            if (!Array.isArray(servers)) {
              json(400, { success: false, error: 'Invalid server payload' });
              return;
            }
            const panelFallback = (payload && typeof payload === 'object' && !Array.isArray(payload) && payload.panel && typeof payload.panel === 'object') ? payload.panel : {};
            const fallbackPanelUrl = typeof panelFallback.url === 'string' ? panelFallback.url : '';
            const fallbackApiKey = typeof panelFallback.apiKey === 'string' ? panelFallback.apiKey : '';
            const normalized = [];
            for (const s of servers) {
              if (!s || typeof s !== 'object') continue;
              const str = (v) => (typeof v === 'string' ? v.slice(0, 500).trim() : '');
              const name = str(s.name);
              const panelUrl = str(s.panelUrl || s.panel_url || s.panelURL || fallbackPanelUrl);
              const identifier = str(s.identifier || s.shortId || s.short_id || s.uuid || s.serverUuid || s.server_uuid);
              const uuid = str(s.uuid || s.serverUuid || s.server_uuid || identifier);
              if (!name || !panelUrl || !uuid) continue;
              try { const u = new URL(panelUrl); if (u.protocol !== 'https:' && u.protocol !== 'http:') continue; } catch (e) { continue; }
              normalized.push({
                name,
                panelUrl: panelUrl.replace(/\/+$/, ''),
                identifier,
                uuid,
                apiKey: str(s.apiKey || s.api_key || s.apiKeyPlain || s.key || fallbackApiKey),
                node: str(s.node),
                description: str(s.description).slice(0, 1000),
                limits: s.limits && typeof s.limits === 'object' ? s.limits : {},
                username: str(s.username || s.user),
                host: str(s.host),
                port: str(s.port),
              });
            }
            if (normalized.length === 0) {
              json(400, { success: false, error: 'Invalid server payload' });
              return;
            }
            pendingServerImports.push(...normalized);
            showMainWindow();
            mainWindow.webContents.send('accept-servers-available');
            json(200, { success: true, message: 'Servers received', count: normalized.length });
          });
          return;
        }
        if (url.pathname === '/cloud-callback' || url.pathname === '/mcplugin-callback' || url.pathname === '/selfhost-callback') {
          const token = url.searchParams.get('token');
          const source = url.pathname === '/mcplugin-callback' ? 'mcplugin' : url.pathname === '/selfhost-callback' ? 'selfhost' : 'cloud';
          if (token && mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show();
            mainWindow.focus();
            mainWindow.webContents.send('cloud-action', { token, source });
          }
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html><body style="background:#0a0a0a;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h2>Logged in successfully!</h2><p>You can close this tab and return to CTRLServers.</p></div></body></html>');
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      });
      callbackServer.listen(CLOUD_CALLBACK_PORT, '127.0.0.1', () => {
        console.log(`[CTRLServers] Cloud callback server on port ${CLOUD_CALLBACK_PORT}`);
      });
      callbackServer.on('error', (err) => {
        console.log(`[CTRLServers] Callback server port ${CLOUD_CALLBACK_PORT} unavailable:`, err.message);
      });
    } catch (e) {}

    if (process.argv) {
      const deepLinkArg = process.argv.find(arg => arg.startsWith('ctrlservers://'));
      if (deepLinkArg) {
        setTimeout(() => handleDeepLink(deepLinkArg), 1500);
      }
    }
  });
}

const wsConnections = new Map();
let wsIdCounter = 0;
const sshConnections = new Map();
let sshIdCounter = 0;
const sftpConnections = new Map();
let sftpIdCounter = 0;

const crypto = require('crypto');
const LEGACY_ALGO = 'aes-256-gcm';
const LEGACY_KEY_FILE = path.join(app.getPath('userData'), '.ctrlservers_masterkey');
const SECRET_STORE_FILE = path.join(app.getPath('userData'), 'ctrlservers-secrets.v1.bin');
let secretStore = null;

function requireSafeStorage() {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('The operating system secure credential store is unavailable. Secrets were not saved.');
  }
}

function loadSecretStore() {
  if (secretStore) return secretStore;
  requireSafeStorage();
  try {
    const encrypted = fs.readFileSync(SECRET_STORE_FILE);
    secretStore = JSON.parse(safeStorage.decryptString(encrypted));
  } catch (error) {
    if (error && error.code !== 'ENOENT') throw new Error('Unable to open the secure credential store.');
    secretStore = { version: 1, servers: {}, keychain: {}, sftp: {}, tokens: {}, mcplugin: {}, endpoints: {}, origins: {}, mcpluginOrigins: {}, hosts: {} };
  }
  secretStore.endpoints ||= {};
  secretStore.origins ||= {};
  secretStore.mcpluginOrigins ||= {};
  secretStore.hosts ||= {};
  return secretStore;
}

function saveSecretStore() {
  const store = loadSecretStore();
  const target = SECRET_STORE_FILE + '.tmp';
  fs.mkdirSync(path.dirname(SECRET_STORE_FILE), { recursive: true });
  fs.writeFileSync(target, safeStorage.encryptString(JSON.stringify(store)), { mode: 0o600 });
  fs.renameSync(target, SECRET_STORE_FILE);
  try { fs.chmodSync(SECRET_STORE_FILE, 0o600); } catch (e) {}
}

function newSecretId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function legacyDecrypt(value) {
  if (typeof value !== 'string' || !value.startsWith('enc:') || !fs.existsSync(LEGACY_KEY_FILE)) return value || '';
  const [ivHex, tagHex, dataHex] = value.slice(4).split(':');
  if (!ivHex || !tagHex || !dataHex) return '';
  const key = Buffer.from(fs.readFileSync(LEGACY_KEY_FILE, 'utf8').trim(), 'hex');
  if (key.length !== 32) return '';
  const decipher = crypto.createDecipheriv(LEGACY_ALGO, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
}

function serverSecretId(server) {
  if (!server || typeof server !== 'object') return '';
  return typeof server.secretId === 'string' && server.secretId ? server.secretId : newSecretId('server');
}

function sanitizeServer(server, store) {
  if (!server || typeof server !== 'object') return null;
  const copy = { ...server, secretId: serverSecretId(server) };
  const secret = { ...(store.servers[copy.secretId] || {}) };
  const secretFields = ['apiKey', 'client_secret', 'password', 'privateKey', 'passphrase'];
  for (const field of secretFields) {
    if (typeof copy[field] === 'string' && copy[field] && copy[field] !== 'safeStorage') {
      secret[field] = legacyDecrypt(copy[field]);
    }
    delete copy[field];
  }
  if (secret.apiKey) copy.apiKey = 'safeStorage';
  if (secret.client_secret) copy.client_secret = 'safeStorage';
  if (secret.password) copy.hasPassword = true;
  if (secret.privateKey) copy.hasPrivateKey = true;
  if (Object.keys(secret).length) store.servers[copy.secretId] = secret;
  if (Object.keys(secret).length && copy.host) store.endpoints[copy.secretId] = { host: copy.host, port: String(copy.port || 22), username: copy.username || 'root' };
  if ((secret.apiKey || secret.client_secret) && typeof (copy.panelUrl || copy.panel_url) === 'string') {
    try { store.origins[copy.secretId] = new URL(copy.panelUrl || copy.panel_url).origin; } catch (e) {}
  }
  return copy;
}

function sanitizeKey(key, store) {
  if (!key || typeof key !== 'object') return null;
  const copy = { ...key, secretId: typeof key.secretId === 'string' && key.secretId ? key.secretId : newSecretId('key') };
  const secret = { ...(store.keychain[copy.secretId] || {}) };
  for (const field of ['privateKey', 'passphrase']) {
    if (typeof copy[field] === 'string' && copy[field]) secret[field] = copy[field];
    delete copy[field];
  }
  if (Object.keys(secret).length) store.keychain[copy.secretId] = secret;
  if (secret.privateKey) copy.hasPrivateKey = true;
  return copy;
}

function sanitizeSftp(connection, store) {
  if (!connection || typeof connection !== 'object') return null;
  const copy = { ...connection, secretId: typeof connection.secretId === 'string' && connection.secretId ? connection.secretId : newSecretId('sftp') };
  const secret = { ...(store.sftp[copy.secretId] || {}) };
  for (const field of ['password', 'privateKey', 'passphrase']) {
    if (typeof copy[field] === 'string' && copy[field]) secret[field] = copy[field];
    delete copy[field];
  }
  if (Object.keys(secret).length) store.sftp[copy.secretId] = secret;
  if (secret.password || secret.privateKey) copy.hasCredentials = true;
  return copy;
}

function mergeStoredSshSecret(config) {
  const copy = { ...(config || {}) };
  const store = loadSecretStore();
  const matchedServerId = !copy.secretId && Object.entries(store.endpoints || {}).find(([, endpoint]) =>
    endpoint.host === copy.host && endpoint.port === String(copy.port || 22) && endpoint.username === (copy.username || 'root'))?.[0];
  if (!copy.secretId && matchedServerId) copy.secretId = matchedServerId;
  const secret = (copy.secretId || matchedServerId) && (store.servers[copy.secretId || matchedServerId] || store.sftp[copy.secretId || matchedServerId]);
  const keySecret = copy.keySecretId && store.keychain[copy.keySecretId];
  if (keySecret?.privateKey) {
    copy.authType = 'privateKey';
    copy.privateKey = keySecret.privateKey;
    if (keySecret.passphrase) copy.passphrase = keySecret.passphrase;
  }
  if (secret) {
    if (!keySecret && secret.privateKey) {
      copy.authType = 'privateKey';
      copy.privateKey = secret.privateKey;
      if (secret.passphrase) copy.passphrase = secret.passphrase;
    } else if (secret.password) {
      copy.authType = 'password';
      copy.password = secret.password;
    }
  }
  return copy;
}

function injectStoredSudoPassword(command, config) {
  const secret = config?.secretId && loadSecretStore().servers[config.secretId];
  if (!secret?.password || typeof command !== 'string') return command;
  const quoted = secret.password.replace(/'/g, "'\\''");
  return command.replace(/^printf '%s\\n' '' \| /, `printf '%s\\n' '${quoted}' | `);
}

const KNOWN_HOSTS_FILE = path.join(app.getPath('userData'), 'known_hosts');
const HOST_TRUST_PENDING = new Set();
const HOST_TRUST_LOCKS = new Map();

function sshhostid(host, port) {
  return String(host || '').toLowerCase() + ':' + (parseInt(port, 10) || 22);
}

function sshhostlabel(host, port) {
  const p = parseInt(port, 10) || 22;
  return p === 22 ? String(host) : '[' + host + ']:' + p;
}

function hostpromptwindow(win) {
  if (win && !win.isDestroyed()) return win;
  if (typeof mainWindow !== 'undefined' && mainWindow && !mainWindow.isDestroyed()) return mainWindow;
  return null;
}

const HOST_TRUST_TIMEOUT = 120000;
const HOST_TRUST_RESPONSES = new Map();
const HOST_TRUST_DENIED = new Set();
let hostTrustRequestSeq = 0;

function askhosttrust(win, prompt) {
  const target = hostpromptwindow(win);
  if (!target || target.isDestroyed()) return Promise.resolve(false);
  const id = ++hostTrustRequestSeq;
  return new Promise(resolve => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      HOST_TRUST_RESPONSES.delete(id);
      resolve(Boolean(value));
    };
    const timer = setTimeout(() => finish(false), HOST_TRUST_TIMEOUT);
    HOST_TRUST_RESPONSES.set(id, finish);
    try {
      target.webContents.send('host-trust-request', id, prompt);
    } catch (e) {
      finish(false);
    }
  });
}

ipcMain.handle('host-trust-response', (event, id, accepted) => {
  const finish = HOST_TRUST_RESPONSES.get(typeof id === 'number' ? id : -1);
  if (!finish) return false;
  finish(accepted === true);
  return true;
});

function parsehostkeyblob(key) {
  if (!Buffer.isBuffer(key) || key.length < 8) return null;
  let offset = 0;
  const readstring = () => {
    if (offset + 4 > key.length) return null;
    const len = key.readUInt32BE(offset);
    offset += 4;
    if (len <= 0 || offset + len > key.length) return null;
    const value = key.slice(offset, offset + len).toString('utf8');
    offset += len;
    return value;
  };
  const keyType = readstring();
  if (!keyType || !/^(ssh-|ecdsa-|sk-)/.test(keyType)) return null;
  if (offset >= key.length) return null;
  return {
    keyType,
    keyBase64: key.toString('base64'),
    fingerprint: 'SHA256:' + crypto.createHash('sha256').update(key).digest('base64').replace(/=+$/, ''),
    fingerprintSha1: 'SHA1:' + crypto.createHash('sha1').update(key).digest('hex')
  };
}

function gethoststore() {
  const store = loadSecretStore();
  store.hosts ||= {};
  return store;
}

function syncknownhostsfile() {
  try {
    const store = gethoststore();
    const lines = [];
    for (const entry of Object.values(store.hosts || {})) {
      if (!entry || !entry.host || !entry.keyType || !entry.keyBase64) continue;
      const p = parseInt(entry.port, 10) || 22;
      const name = p === 22 ? String(entry.host) : '[' + entry.host + ']:' + p;
      lines.push((entry.revoked ? '@revoked ' : '') + name + ' ' + entry.keyType + ' ' + entry.keyBase64);
    }
    fs.writeFileSync(KNOWN_HOSTS_FILE, lines.length ? lines.join('\n') + '\n' : '', { mode: 0o600 });
  } catch (e) {}
}

function savehostentry(host, port, info, source, revoked) {
  const store = gethoststore();
  const id = sshhostid(host, port);
  store.hosts[id] = {
    host: String(host),
    port: parseInt(port, 10) || 22,
    keyType: info.keyType,
    keyBase64: info.keyBase64,
    fingerprint: info.fingerprint,
    fingerprintSha1: info.fingerprintSha1,
    addedAt: Date.now(),
    lastSeen: Date.now(),
    revoked: Boolean(revoked),
    source: source || 'prompt'
  };
  saveSecretStore();
  syncknownhostsfile();
  return store.hosts[id];
}

function parseknownhostname(name) {
  const match = /^\[(.+)\]:(\d+)$/.exec(name);
  if (match) return { host: match[1], port: parseInt(match[2], 10) || 22 };
  if (!name || name.startsWith('|')) return null;
  return { host: name, port: 22 };
}

function importknownhosts(text) {
  const store = gethoststore();
  let added = 0;
  let updated = 0;
  let skipped = 0;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    let rest = line;
    let revoked = false;
    if (rest.startsWith('@revoked ')) {
      revoked = true;
      rest = rest.slice('@revoked '.length).trim();
    } else if (rest.startsWith('@')) {
      skipped++;
      continue;
    }
    const parts = rest.split(/\s+/);
    if (parts.length < 3) { skipped++; continue; }
    const [names, declaredType, declaredKey] = parts;
    if (!/^(ssh-|ecdsa-|sk-)/.test(declaredType)) { skipped++; continue; }
    if (names.startsWith('|')) { skipped++; continue; }
    let rawKey = null;
    try { rawKey = Buffer.from(String(declaredKey).replace(/=+$/, ''), 'base64'); } catch (e) { rawKey = null; }
    const info = rawKey ? parsehostkeyblob(rawKey) : null;
    if (!info || info.keyType !== declaredType) { skipped++; continue; }
    for (const name of names.split(',')) {
      const parsed = parseknownhostname(name);
      if (!parsed) { skipped++; continue; }
      const id = sshhostid(parsed.host, parsed.port);
      const existing = store.hosts[id];
      if (existing && existing.fingerprint === info.fingerprint && existing.revoked === revoked) continue;
      if (existing) updated++; else added++;
      store.hosts[id] = {
        host: parsed.host,
        port: parsed.port,
        keyType: info.keyType,
        keyBase64: info.keyBase64,
        fingerprint: info.fingerprint,
        fingerprintSha1: info.fingerprintSha1,
        addedAt: Date.now(),
        lastSeen: existing ? (existing.lastSeen || 0) : 0,
        revoked,
        source: 'known_hosts'
      };
    }
  }
  saveSecretStore();
  syncknownhostsfile();
  return { added, updated, skipped };
}

function resolvehosttrust(win, host, port, info, background) {
  const id = sshhostid(host, port);
  const locked = HOST_TRUST_LOCKS.get(id);
  if (locked) return locked;
  HOST_TRUST_PENDING.add(id);
  const task = (async () => {
    const store = gethoststore();
    const existing = store.hosts[id];
    const label = sshhostlabel(host, port);
    const isBackground = background === true;
    const payload = {
      host: String(host),
      port: parseInt(port, 10) || 22,
      label,
      keyType: info.keyType,
      fingerprint: info.fingerprint,
      fingerprintSha1: info.fingerprintSha1,
      storedFingerprint: existing ? existing.fingerprint : null,
      background: isBackground
    };

    if (isBackground && HOST_TRUST_DENIED.has(id)) return false;

    if (existing && existing.revoked) {
      await askhosttrust(win, Object.assign({ kind: 'revoked' }, payload));
      if (isBackground) HOST_TRUST_DENIED.add(id);
      return false;
    }

    if (existing && existing.fingerprint === info.fingerprint) {
      existing.lastSeen = Date.now();
      saveSecretStore();
      return true;
    }

    if (existing) {
      const accepted = await askhosttrust(win, Object.assign({ kind: 'changed' }, payload));
      if (!accepted) {
        HOST_TRUST_DENIED.add(id);
        return false;
      }
      HOST_TRUST_DENIED.delete(id);
      savehostentry(host, port, info, 'changed', false);
      return true;
    }

    const accepted = await askhosttrust(win, Object.assign({ kind: 'new' }, payload));
    if (!accepted) {
      HOST_TRUST_DENIED.add(id);
      return false;
    }
    HOST_TRUST_DENIED.delete(id);
    savehostentry(host, port, info, 'prompt', false);
    return true;
  })().finally(() => {
    HOST_TRUST_PENDING.delete(id);
    HOST_TRUST_LOCKS.delete(id);
  });
  HOST_TRUST_LOCKS.set(id, task);
  return task;
}

function makehostverifier(win, config) {
  const host = config.host;
  const port = parseInt(config.port, 10) || 22;
  const background = config.background === true;
  return (key, verify) => {
    let info = null;
    try { info = parsehostkeyblob(key); } catch (e) { info = null; }
    if (!info) {
      try { verify(false); } catch (e) {}
      return undefined;
    }
    resolvehosttrust(win, host, port, info, background)
      .then(ok => { try { verify(ok); } catch (e) {} })
      .catch(() => { try { verify(false); } catch (e) {} });
    return undefined;
  };
}

function fetchhostkey(host, port) {
  return new Promise(resolve => {
    let info = null;
    let settled = false;
    let timer = null;
    const conn = new Client();
    const finish = value => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try { conn.end(); } catch (e) {}
      resolve(value);
    };
    conn.on('handshake', () => finish(info));
    conn.on('error', () => finish(info));
    conn.on('ready', () => finish(info));
    timer = setTimeout(() => finish(null), 30000);
    try {
      conn.connect({
        host,
        port: parseInt(port, 10) || 22,
        username: 'ctrlservers-hostkey-probe',
        readyTimeout: 25000,
        hostVerifier: key => {
          try { info = parsehostkeyblob(key); } catch (e) { info = null; }
          return true;
        }
      });
    } catch (e) {
      finish(null);
    }
  });
}

async function ensurehosttrustforsystem(win, config) {
  const host = config.host;
  const port = parseInt(config.port, 10) || 22;
  const info = await fetchhostkey(host, port);
  if (!info) throw new Error('Unable to determine the SSH host key for ' + sshhostlabel(host, port) + '.');
  const trusted = await resolvehosttrust(win, host, port, info, false);
  if (!trusted) throw new Error('Host key verification failed for ' + sshhostlabel(host, port) + '.');
  syncknownhostsfile();
  return KNOWN_HOSTS_FILE;
}

ipcMain.handle('host-keys-list', async () => {
  const store = gethoststore();
  return Object.entries(store.hosts || {}).map(([id, entry]) => ({
    id,
    host: entry.host || '',
    port: entry.port || 22,
    keyType: entry.keyType || '',
    fingerprint: entry.fingerprint || '',
    addedAt: entry.addedAt || 0,
    lastSeen: entry.lastSeen || 0,
    source: entry.source || '',
    revoked: Boolean(entry.revoked)
  })).sort((a, b) => (a.host + ':' + a.port).localeCompare(b.host + ':' + b.port));
});

ipcMain.handle('host-keys-import', async (event, filePath) => {
  let target = filePath;
  if (!target) {
    const win = hostpromptwindow(BrowserWindow.fromWebContents(event.sender));
    const options = {
      title: 'Import known_hosts',
      properties: ['openFile'],
      filters: [{ name: 'All Files', extensions: ['*'] }]
    };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths || !result.filePaths.length) return null;
    target = result.filePaths[0];
  }
  const text = fs.readFileSync(target, 'utf8');
  return importknownhosts(text);
});

ipcMain.handle('host-keys-remove', async (event, id) => {
  const store = gethoststore();
  if (!store.hosts[id]) return false;
  delete store.hosts[id];
  saveSecretStore();
  syncknownhostsfile();
  return true;
});

ipcMain.handle('host-keys-clear', async () => {
  const store = gethoststore();
  store.hosts = {};
  saveSecretStore();
  syncknownhostsfile();
  return true;
});

ipcMain.handle('secure-store-migrate', async (event, legacy = {}) => {
  const store = loadSecretStore();
  const keychain = Array.isArray(legacy.keychain) ? legacy.keychain.map(key => sanitizeKey(key, store)).filter(Boolean) : [];
  const servers = Array.isArray(legacy.servers) ? legacy.servers.map(server => {
    const copy = { ...server };
    if (Number.isInteger(copy.keyIndex) && keychain[copy.keyIndex]?.secretId) copy.keySecretId = keychain[copy.keyIndex].secretId;
    return sanitizeServer(copy, store);
  }).filter(Boolean) : [];
  const sftp = Array.isArray(legacy.sftp) ? legacy.sftp.map(connection => sanitizeSftp(connection, store)).filter(Boolean) : [];
  for (const [name, value] of Object.entries(legacy.tokens || {})) {
    if (typeof value === 'string' && value) store.tokens[name] = value;
  }
  for (const [name, value] of Object.entries(legacy.mcplugin || {})) {
    if (typeof value === 'string' && value) store.mcplugin[name] = value;
  }
  saveSecretStore();
  try { if (fs.existsSync(LEGACY_KEY_FILE)) fs.unlinkSync(LEGACY_KEY_FILE); } catch (e) {}
  return { servers, keychain, sftp, tokenStatus: Object.fromEntries(['cloud', 'selfhost', 'mcplugin'].map(name => [name, Boolean(store.tokens[name])] )) };
});

ipcMain.handle('secure-store-clear', async () => {
  secretStore = { version: 1, servers: {}, keychain: {}, sftp: {}, tokens: {}, mcplugin: {}, endpoints: {}, origins: {}, mcpluginOrigins: {}, hosts: {} };
  saveSecretStore();
  syncknownhostsfile();
  return true;
});

ipcMain.handle('secure-store-save-servers', async (event, servers) => {
  const store = loadSecretStore();
  const result = Array.isArray(servers) ? servers.map(server => sanitizeServer(server, store)).filter(Boolean) : [];
  saveSecretStore();
  return result;
});

ipcMain.handle('secure-store-save-keychain', async (event, keys) => {
  const store = loadSecretStore();
  const result = Array.isArray(keys) ? keys.map(key => sanitizeKey(key, store)).filter(Boolean) : [];
  saveSecretStore();
  return result;
});

ipcMain.handle('secure-store-save-sftp', async (event, connections) => {
  const store = loadSecretStore();
  const result = Array.isArray(connections) ? connections.map(connection => sanitizeSftp(connection, store)).filter(Boolean) : [];
  saveSecretStore();
  return result;
});

ipcMain.handle('secure-store-save-token', async (event, name, value) => {
  if (!['cloud', 'selfhost', 'mcplugin'].includes(name)) throw new Error('Invalid secure token name.');
  const store = loadSecretStore();
  if (typeof value === 'string' && value) store.tokens[name] = value;
  else delete store.tokens[name];
  saveSecretStore();
  return Boolean(store.tokens[name]);
});

ipcMain.handle('secure-store-save-mcplugin-key', async (event, id, value, origin) => {
  if (typeof id !== 'string' || !id || typeof value !== 'string') throw new Error('Invalid plugin API key.');
  const store = loadSecretStore();
  if (value) store.mcplugin[id] = value;
  else delete store.mcplugin[id];
  if (value && typeof origin === 'string') {
    try { store.mcpluginOrigins[id] = new URL(origin).origin; } catch (e) {}
  } else if (!value) delete store.mcpluginOrigins[id];
  saveSecretStore();
  return Boolean(store.mcplugin[id]);
});

async function proxySecretRequest(secret, url, options = {}, scheme = 'Bearer') {
  const parsed = new URL(String(url || ''));
  if (!secret || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) throw new Error('Invalid secure request.');
  const headers = { ...(options.headers || {}) };
  delete headers.Authorization;
  delete headers.authorization;
  headers.Authorization = `${scheme} ${secret}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(parsed.href, { method: options.method || 'GET', headers, body: options.body == null ? undefined : String(options.body), redirect: 'follow', signal: controller.signal });
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > 50 * 1024 * 1024) throw new Error('Response is too large');
    return { status: response.status, statustext: response.statusText, headers: Object.fromEntries(response.headers.entries()), body: buffer.toString('base64') };
  } finally {
    clearTimeout(timer);
  }
}

function attachStoredSecrets(scope, options) {
  if (typeof options.body !== 'string') return options;
  let payload;
  try { payload = JSON.parse(options.body); } catch (e) { return options; }
  const store = loadSecretStore();
  const attachServer = (server) => {
    if (!server || typeof server !== 'object' || !server.secretId) return server;
    const secret = store.servers[server.secretId] || {};
    const key = store.keychain[server.keySecretId] || {};
    if (secret.apiKey) server.apiKey = secret.apiKey;
    if (secret.client_secret) server.client_secret = secret.client_secret;
    if (secret.password) server.password = secret.password;
    if (secret.privateKey || key.privateKey) server.privateKey = secret.privateKey || key.privateKey;
    if (secret.passphrase || key.passphrase) server.passphrase = secret.passphrase || key.passphrase;
    return server;
  };
  if (scope === 'cloud') {
    (payload.servers || []).forEach(attachServer);
    (payload.keychain || []).forEach(key => {
      const secret = store.keychain[key?.secretId] || {};
      if (secret.privateKey) key.privateKey = secret.privateKey;
      if (secret.passphrase) key.passphrase = secret.passphrase;
    });
  }
  if (scope === 'selfhost') {
    const entries = Array.isArray(payload.servers) ? payload.servers : [payload];
    entries.forEach(entry => {
      const secret = store.servers[entry?.secretId] || {};
      const key = store.keychain[entry?.keySecretId] || {};
      if (secret.apiKey) entry.api_key = secret.apiKey;
      if (secret.password) entry.ssh_password = secret.password;
      if (secret.privateKey || key.privateKey) entry.ssh_private_key = secret.privateKey || key.privateKey;
      delete entry.secretId;
      delete entry.keySecretId;
    });
  }
  return { ...options, body: JSON.stringify(payload) };
}

ipcMain.handle('secure-token-request', async (event, name, url, options = {}) => {
  if (!['cloud', 'selfhost', 'mcplugin'].includes(name)) throw new Error('Invalid secure token name.');
  const hosts = { cloud: 'cloud.ctrlsrv.net', selfhost: 'nsrv.ctrlservers.xyz', mcplugin: 'backend2.ctrlservers.xyz' };
  if (new URL(String(url)).host !== hosts[name]) throw new Error('The secure token may only be used with its service.');
  return proxySecretRequest(loadSecretStore().tokens[name], url, attachStoredSecrets(name, options));
});

ipcMain.handle('secure-mcplugin-request', async (event, id, url, options = {}) => {
  if (new URL(String(url)).origin !== loadSecretStore().mcpluginOrigins[id]) throw new Error('The plugin API key may only be used with its saved server.');
  return proxySecretRequest(loadSecretStore().mcplugin[id], url, options, 'ApiKey');
});

ipcMain.handle('puffer-authenticate', async (event, secretId, panelUrl, clientId) => {
  const secret = loadSecretStore().servers[secretId];
  const parsed = new URL(String(panelUrl || ''));
  if (!secret?.client_secret || !clientId || !['http:', 'https:'].includes(parsed.protocol)) throw new Error('PufferPanel credentials are unavailable.');
  if (parsed.origin !== loadSecretStore().origins[secretId]) throw new Error('The PufferPanel secret may only be used with its saved panel.');
  const response = await fetch(`${parsed.toString().replace(/\/+$/, '')}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    body: new URLSearchParams({ client_id: clientId, client_secret: secret.client_secret, grant_type: 'client_credentials' }).toString(),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error(data.error_description || data.error || 'Authentication failed.');
  return data;
});

ipcMain.handle('panel-request', async (event, url, options = {}) => {
  const parsed = new URL(String(url || ''));
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('Only HTTP and HTTPS panel URLs are allowed');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(parsed.href, {
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.bodybase64 ? Buffer.from(options.bodybase64, 'base64') : options.body == null ? undefined : String(options.body),
      redirect: 'follow',
      signal: controller.signal
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > 50 * 1024 * 1024) throw new Error('Panel response is too large');
    return {
      status: response.status,
      statustext: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      body: buffer.toString('base64')
    };
  } finally {
    clearTimeout(timer);
  }
});

ipcMain.handle('server-request', async (event, secretId, url, options = {}) => {
  const parsed = new URL(String(url || ''));
  if (!secretId || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) throw new Error('Invalid server request.');
  if (parsed.origin !== loadSecretStore().origins[secretId]) throw new Error('The panel key may only be used with its saved panel.');
  const secret = loadSecretStore().servers[secretId];
  if (!secret || !secret.apiKey) throw new Error('Server credentials are unavailable.');
  const headers = { ...(options.headers || {}) };
  delete headers.Authorization;
  delete headers.authorization;
  headers.Authorization = `Bearer ${secret.apiKey}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(parsed.href, {
      method: options.method || 'GET',
      headers,
      body: options.bodybase64 ? Buffer.from(options.bodybase64, 'base64') : options.body == null ? undefined : String(options.body),
      redirect: 'follow',
      signal: controller.signal,
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > 50 * 1024 * 1024) throw new Error('Panel response is too large');
    return { status: response.status, statustext: response.statusText, headers: Object.fromEntries(response.headers.entries()), body: buffer.toString('base64') };
  } finally {
    clearTimeout(timer);
  }
});

function validsftppath(remotePath) {
  if (!remotePath || typeof remotePath !== 'string') return false;
  const normalized = remotePath.replace(/\\/g, '/').replace(/\/+/g, '/');
  if (normalized.includes('/../') || normalized.endsWith('/..') || normalized.startsWith('../') || normalized === '..') {
    return false;
  }
  return true;
}

let monitorInterval = null;
let monitorServers = [];
let monitorTick = 10000;
let monitorPrevStatus = {};
let monitorNotified = new Set();
let monitorAlerts = [];
let alertBreachStart = {};
let alertCooldown = {};

let mainWindow = null;
let tray = null;
let isQuitting = false;
let pendingServerImports = [];
let mcpserver = null;
let mcpstarting = null;
let mcpsettings = null;
let mcplocked = true;
let mcplasterror = '';
let mcpactivity = [];
let mcprequestcounter = 0;
const mcppendingoperations = new Map();
const mcppendingapprovals = new Map();

function mcpsettingspath() {
  return path.join(app.getPath('userData'), 'mcp-settings.json');
}

function normalizemcpsettings(value) {
  const defaults = defaultpermissions();
  const savedpermissions = value && typeof value.permissions === 'object' ? value.permissions : {};
  const permissions = {};
  for (const definition of PERMISSION_DEFINITIONS) {
    const mode = savedpermissions[definition.id];
    permissions[definition.id] = ['allow', 'ask', 'deny'].includes(mode) ? mode : defaults[definition.id];
  }
  return {
    enabled: Boolean(value && value.enabled),
    token: value && typeof value.token === 'string' && value.token.length >= 32
      ? value.token
      : 'ctrlmcp_' + crypto.randomBytes(32).toString('base64url'),
    permissions,
  };
}

function loadmcpsettings() {
  if (mcpsettings) return mcpsettings;
  let saved = null;
  try {
    saved = JSON.parse(fs.readFileSync(mcpsettingspath(), 'utf8'));
  } catch (e) {}
  mcpsettings = normalizemcpsettings(saved);
  savemcpsettings();
  return mcpsettings;
}

function savemcpsettings() {
  if (!mcpsettings) return;
  try {
    const filename = mcpsettingspath();
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    const temporary = filename + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(mcpsettings, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, filename);
    try { fs.chmodSync(filename, 0o600); } catch (e) {}
  } catch (e) {
    mcplasterror = e.message || String(e);
  }
}

function mcpstatus() {
  const settings = loadmcpsettings();
  return {
    enabled: settings.enabled,
    running: Boolean(mcpserver),
    locked: mcplocked,
    endpoint: mcpserver?.endpoint || 'http://127.0.0.1:12748/mcp',
    token: settings.enabled ? settings.token : '',
    permissions: { ...settings.permissions },
    permissiondefinitions: PERMISSION_DEFINITIONS,
    error: mcplasterror,
    activity: mcpactivity.slice(0, 50),
  };
}

function broadcastmcpstatus() {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('mcp-status', mcpstatus());
}

function recordmcpactivity(entry) {
  mcpactivity.unshift({ ...entry, id: crypto.randomUUID() });
  if (mcpactivity.length > 100) mcpactivity.length = 100;
  broadcastmcpstatus();
}

async function startmcpifneeded() {
  const settings = loadmcpsettings();
  if (!settings.enabled || mcpserver) return mcpserver;
  if (mcpstarting) return mcpstarting;
  mcpstarting = (async () => {
    try {
      const module = await import('./mcp/server.mjs');
      mcpserver = await module.startmcpserver({
        host: '127.0.0.1',
        port: 12748,
        version: APP_VERSION,
        gettoken: () => loadmcpsettings().token,
        getpermissionstatus: () => ({
          permissions: { ...loadmcpsettings().permissions },
          note: 'allow runs immediately, ask requires approval in CTRLServers, and deny blocks the operation.',
        }),
        execute: executemcpoperation,
        onactivity: recordmcpactivity,
        onerror: error => {
          mcplasterror = error?.message || String(error);
          broadcastmcpstatus();
        },
      });
      mcplasterror = '';
      broadcastmcpstatus();
      return mcpserver;
    } catch (error) {
      mcplasterror = error?.message || String(error);
      mcpserver = null;
      broadcastmcpstatus();
      return null;
    } finally {
      mcpstarting = null;
    }
  })();
  return mcpstarting;
}

async function stopmcpserver() {
  const active = mcpserver;
  mcpserver = null;
  if (active) {
    try { await active.close(); } catch (e) {}
  }
  for (const pending of mcppendingoperations.values()) pending.reject(new Error('MCP server was disabled.'));
  for (const pending of mcppendingapprovals.values()) pending.resolve(false);
  mcppendingoperations.clear();
  mcppendingapprovals.clear();
  broadcastmcpstatus();
}

function sanitizemcpvalue(value, key = '') {
  const hidden = new Set(['apikey', 'password', 'privatekey', 'token', 'base64', 'content']);
  if (hidden.has(String(key).toLowerCase()) || /(password|private.?key|api.?key|token|secret)/i.test(String(key))) {
    return `[hidden ${typeof value === 'string' ? value.length : 0} characters]`;
  }
  if (Array.isArray(value)) {
    const items = value.slice(0, 20).map(item => sanitizemcpvalue(item));
    if (value.length > 20) items.push(`... ${value.length - 20} more`);
    return items;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([childkey, childvalue]) => [childkey, sanitizemcpvalue(childvalue, childkey)]));
  }
  return value;
}

function sanitizemcpargs(args) {
  return sanitizemcpvalue(args || {});
}

function waitformcpapproval(tool, permission, args) {
  return new Promise(resolve => {
    const id = 'approval_' + (++mcprequestcounter);
    const timer = setTimeout(() => {
      mcppendingapprovals.delete(id);
      resolve(false);
    }, 60000);
    mcppendingapprovals.set(id, {
      resolve: value => {
        clearTimeout(timer);
        resolve(Boolean(value));
      },
    });
    mainWindow.webContents.send('mcp-approval', { id, tool, permission, args: sanitizemcpargs(args) });
  });
}

function sendmcpoperation(tool, permission, args) {
  return new Promise((resolve, reject) => {
    const id = 'operation_' + (++mcprequestcounter);
    const timer = setTimeout(() => {
      mcppendingoperations.delete(id);
      reject(new Error('CTRLServers did not finish the MCP operation within 180 seconds.'));
    }, 180000);
    mcppendingoperations.set(id, {
      resolve: value => { clearTimeout(timer); resolve(value); },
      reject: error => { clearTimeout(timer); reject(error); },
    });
    mainWindow.webContents.send('mcp-operation', { id, tool, permission, args });
  });
}

async function executemcpoperation(tool, args, requestedpermission) {
  const settings = loadmcpsettings();
  if (!settings.enabled) throw new Error('The CTRLServers MCP server is disabled.');
  if (mcplocked) throw new Error('CTRLServers is locked. Unlock the app before using MCP tools.');
  if (!mainWindow || mainWindow.isDestroyed()) throw new Error('CTRLServers is not available.');
  const permission = permissionfortool(tool, args);
  if (permission !== requestedpermission) throw new Error('MCP permission classification failed.');
  const mode = settings.permissions[permission] || 'deny';
  if (mode === 'deny') throw new Error(`Permission denied by CTRLServers: ${permission}`);
  if (mode === 'ask') {
    const approved = await waitformcpapproval(tool, permission, args);
    if (!approved) throw new Error(`The user declined ${tool}.`);
  }
  return sendmcpoperation(tool, permission, args);
}

ipcMain.handle('mcp-get-status', async () => mcpstatus());

ipcMain.handle('mcp-set-enabled', async (event, enabled) => {
  const settings = loadmcpsettings();
  settings.enabled = Boolean(enabled);
  savemcpsettings();
  if (settings.enabled) await startmcpifneeded();
  else await stopmcpserver();
  return mcpstatus();
});

ipcMain.handle('mcp-set-permission', async (event, permission, mode) => {
  const definition = PERMISSION_DEFINITIONS.find(item => item.id === permission);
  if (!definition) throw new Error('Unknown MCP permission.');
  if (!['allow', 'ask', 'deny'].includes(mode)) throw new Error('Invalid MCP permission mode.');
  loadmcpsettings().permissions[permission] = mode;
  savemcpsettings();
  broadcastmcpstatus();
  return mcpstatus();
});

ipcMain.handle('mcp-set-all-permissions', async (event, mode) => {
  if (!['allow', 'ask', 'deny'].includes(mode)) throw new Error('Invalid MCP permission mode.');
  const settings = loadmcpsettings();
  for (const definition of PERMISSION_DEFINITIONS) settings.permissions[definition.id] = mode;
  savemcpsettings();
  broadcastmcpstatus();
  return mcpstatus();
});

ipcMain.handle('mcp-regenerate-token', async () => {
  const settings = loadmcpsettings();
  settings.token = 'ctrlmcp_' + crypto.randomBytes(32).toString('base64url');
  savemcpsettings();
  broadcastmcpstatus();
  return mcpstatus();
});

ipcMain.handle('mcp-clear-activity', async () => {
  mcpactivity = [];
  broadcastmcpstatus();
  return mcpstatus();
});

ipcMain.on('mcp-set-locked', (event, locked) => {
  if (mainWindow && event.sender === mainWindow.webContents) {
    mcplocked = Boolean(locked);
    broadcastmcpstatus();
  }
});

ipcMain.on('mcp-approval-result', (event, payload) => {
  if (!mainWindow || event.sender !== mainWindow.webContents || !payload) return;
  const pending = mcppendingapprovals.get(payload.id);
  if (!pending) return;
  mcppendingapprovals.delete(payload.id);
  pending.resolve(Boolean(payload.approved));
});

ipcMain.on('mcp-operation-result', (event, payload) => {
  if (!mainWindow || event.sender !== mainWindow.webContents || !payload) return;
  const pending = mcppendingoperations.get(payload.id);
  if (!pending) return;
  mcppendingoperations.delete(payload.id);
  if (payload.ok) pending.resolve(payload.result);
  else pending.reject(new Error(payload.error || 'MCP operation failed.'));
});

function createwindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'src', 'assets', 'logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.setMenu(null);
  mainWindow.maximize();
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.on('close', (e) => {
    if (monitorInterval && !isQuitting) {
      e.preventDefault();
      mainWindow.hide();
      if (tray) {
        new Notification({
          title: 'CTRLServers',
          body: 'App is running in the background for server monitoring.',
          silent: true,
        }).show();
      }
      return false;
    }
  });
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) createwindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  app.focus();
  mainWindow.focus();
}

function createtray() {
  const iconPath = path.join(__dirname, 'src', 'assets', 'logo.png');
  tray = new Tray(iconPath);
  tray.setToolTip('CTRLServers');
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
      }
    }
  });
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open CTRLServers', click: () => { if (mainWindow) mainWindow.show(); } },
    { type: 'separator' },
    { label: 'Quit', click: () => { isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(contextMenu);
}

app.on('window-all-closed', () => {
  if (!monitorInterval) app.quit();
});

app.on('before-quit', () => {
  isQuitting = true;
  stopmcpserver();
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
  monitorServers = [];
  monitorPrevStatus = {};
  monitorNotified = new Set();
  monitorAlerts = [];
  alertBreachStart = {};
  alertCooldown = {};
});

app.on('will-quit', () => {
  wsConnections.forEach(ws => { try { ws.close(); } catch (e) {} });
  wsConnections.clear();
  sshConnections.forEach(ssh => { try { ssh.end(); } catch (e) {} });
  sshConnections.clear();
  sftpConnections.forEach(entry => {
    try { if (entry.sftp) entry.sftp.end(); } catch (e) {}
    try { if (entry.conn) entry.conn.end(); } catch (e) {}
  });
  sftpConnections.clear();
});

ipcMain.handle('ws-connect', async (event, url, token, headers, origin) => {
  const id = ++wsIdCounter;
  const win = BrowserWindow.fromWebContents(event.sender);

  if (!url || (!url.startsWith('wss://') && !url.startsWith('ws://'))) {
    throw new Error('Invalid WebSocket URL');
  }
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, {
      headers: {
        ...headers,
        Origin: origin || 'https://app.ctrlservers.xyz'
      },
      rejectUnauthorized: true
    });

    wsConnections.set(id, ws);

    ws.on('open', () => {
      resolve(id);
    });

    ws.on('message', (data) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('ws-message', id, data.toString());
      }
    });

    ws.on('close', (code, reason) => {
      wsConnections.delete(id);
      if (win && !win.isDestroyed()) {
        win.webContents.send('ws-close', id, code, reason.toString());
      }
    });

    ws.on('error', (err) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('ws-error', id, err.message);
      }
      reject(err.message || 'WebSocket connection failed');
    });
  });
});

ipcMain.handle('ws-send', async (event, id, data) => {
  const ws = wsConnections.get(id);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(data);
  }
});

ipcMain.handle('ws-close', async (event, id) => {
  const ws = wsConnections.get(id);
  if (ws) {
    ws.close();
    wsConnections.delete(id);
  }
});

ipcMain.handle('open-external', async (event, url) => {
  await shell.openExternal(url);
});

ipcMain.handle('open-in-explorer', async (event, filePath) => {
  shell.showItemInFolder(filePath);
});

ipcMain.handle('show-save-dialog', async (event, defaultPath) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showSaveDialog(win, {
    defaultPath: defaultPath || '',
    properties: ['createDirectory']
  });
  return result.canceled ? null : result.filePath;
});

ipcMain.on('get-platform', (event) => {
  const plat = process.platform;
  const arch = process.arch;
  if (plat === 'win32') {
    const ver = os.release();
    const major = parseInt(ver.split('.')[0]) || 0;
    const build = parseInt(ver.split('.')[2]) || 0;
    let name = 'Windows';
    if (major >= 10) {
      if (build >= 22000) name = 'Windows 11';
      else name = 'Windows 10';
    } else if (major >= 6) {
      if (parseInt(ver.split('.')[1]) >= 2) name = 'Windows 8';
      else name = 'Windows 7';
    }
    event.returnValue = name + ' ' + arch;
  } else if (plat === 'darwin') {
    const ver = os.release();
    const major = parseInt(ver.split('.')[0]) || 0;
    const minor = parseInt(ver.split('.')[1]) || 0;
    const names = { 24: 'Sequoia', 23: 'Sonoma', 22: 'Ventura', 21: 'Monterey', 20: 'Big Sur', 19: 'Catalina', 18: 'Mojave' };
    const name = names[minor] || 'macOS';
    event.returnValue = name + ' ' + arch;
  } else if (plat === 'linux') {
    event.returnValue = (os.type() || 'Linux') + ' ' + arch;
  } else {
    event.returnValue = plat + ' ' + arch;
  }
});
ipcMain.on('get-app-version', (event) => { event.returnValue = APP_VERSION; });
ipcMain.on('get-electron-version', (event) => { event.returnValue = process.versions.electron || 'N/A'; });
ipcMain.on('get-chrome-version', (event) => { event.returnValue = process.versions.chrome || 'N/A'; });
ipcMain.on('get-node-version', (event) => { event.returnValue = process.versions.node || 'N/A'; });

ipcMain.handle('ssh-connect', async (event, config) => {
  config = mergeStoredSshSecret(config);
  const id = ++sshIdCounter;
  const win = BrowserWindow.fromWebContents(event.sender);

  return new Promise((resolve, reject) => {
    const conn = new Client();
    let settled = false;
    const trustId = sshhostid(config.host, config.port);
    let waitedForTrust = false;
    let timer = setTimeout(function tick() {
      if (settled) return;
      if (HOST_TRUST_PENDING.has(trustId)) {
        waitedForTrust = true;
        timer = setTimeout(tick, 2000);
        return;
      }
      if (waitedForTrust) {
        waitedForTrust = false;
        timer = setTimeout(tick, 15000);
        return;
      }
      settled = true;
      try { conn.end(); } catch (e) {}
      reject('Connection timed out');
    }, 15000);

    const done = (err, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) {
        try { conn.end(); } catch (e) {}
        reject(err);
      } else {
        resolve(result);
      }
    };

    conn.on('ready', () => {
      try { if (conn._sock) conn._sock.setNoDelay(true); } catch (e) {}
      conn.shell({ term: 'xterm-256color', cols: config.cols || 80, rows: config.rows || 24 }, (err, stream) => {
        if (err) { done(err.message || 'Shell request failed'); return; }
        const entry = { conn, stream, win, ready: false, pendingData: [], closed: false };
        sshConnections.set(id, entry);

        const closeEntry = (reason) => {
          if (entry.closed) return;
          entry.closed = true;
          sshConnections.delete(id);
          if (win && !win.isDestroyed()) win.webContents.send('ssh-close', id, reason || 'Connection closed');
        };

        const sendData = (data) => {
          if (!entry.ready) {
            entry.pendingData.push(data);
            return;
          }
          if (win && !win.isDestroyed()) win.webContents.send('ssh-data', id, data);
        };

        stream.on('data', (data) => {
          sendData(data);
        });

        stream.on('close', () => {
          closeEntry('Connection closed');
          conn.end();
        });

        stream.stderr.on('data', (data) => {
          sendData(data);
        });

        done(null, id);
      });
    });

    conn.on('error', (err) => {
      if (!settled) {
        done(err.message || 'SSH connection failed');
        return;
      }
      const entry = sshConnections.get(id);
      if (!entry || entry.closed) return;
      entry.closed = true;
      sshConnections.delete(id);
      const message = err.message || 'SSH connection failed';
      const reason = /timed out|timeout|keepalive/i.test(message) ? 'Connection timed-out' : 'Connection lost';
      if (win && !win.isDestroyed()) win.webContents.send('ssh-close', id, reason);
    });

    const connectConfig = {
      host: config.host,
      port: parseInt(config.port) || 22,
      username: config.username,
      readyTimeout: 300000,
      keepaliveInterval: 15000,
      keepaliveCountMax: 3,
      hostVerifier: makehostverifier(win, config)
    };

    if (config.authType === 'password') {
      connectConfig.password = config.password;
    } else if (config.authType === 'privateKey' || config.authType === 'key') {
      connectConfig.privateKey = config.privateKey;
      if (config.passphrase) connectConfig.passphrase = config.passphrase;
    }

    try {
      conn.connect(connectConfig);
    } catch (e) {
      done(e.message || 'Connection failed');
    }
  });
});

ipcMain.on('ssh-ready', (event, id) => {
  const entry = sshConnections.get(id);
  if (!entry || entry.win !== BrowserWindow.fromWebContents(event.sender)) return;
  entry.ready = true;
  for (const data of entry.pendingData) {
    if (entry.win && !entry.win.isDestroyed()) entry.win.webContents.send('ssh-data', id, data);
  }
  entry.pendingData.length = 0;
});

ipcMain.on('ssh-data', (event, id, data) => {
  const entry = sshConnections.get(id);
  if (entry && entry.win === BrowserWindow.fromWebContents(event.sender) && entry.stream) {
    entry.stream.write(data);
  }
});

ipcMain.on('ssh-resize', (event, id, cols, rows) => {
  const entry = sshConnections.get(id);
  if (entry && entry.win === BrowserWindow.fromWebContents(event.sender) && entry.stream) {
    entry.stream.setWindow(rows, cols, 0, 0);
  }
});

ipcMain.handle('ssh-session-status', async (event, id) => {
  const entry = sshConnections.get(id);
  return Boolean(entry && !entry.closed && entry.win === BrowserWindow.fromWebContents(event.sender));
});

ipcMain.handle('ssh-exec-session', async (event, id, command) => {
  const entry = sshConnections.get(id);
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!entry || entry.closed || entry.win !== win) {
    throw new Error('SSH session is unavailable.');
  }
  if (typeof command !== 'string' || !command.trim()) {
    throw new Error('SSH command is required.');
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let stream = null;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(result);
    };
    const timer = setTimeout(() => {
      try { if (stream) stream.close(); } catch (e) {}
      const error = new Error('VPS/VDS request timed out after 60 seconds.');
      error.code = 'SSH_EXEC_TIMEOUT';
      finish(error);
    }, 60000);

    try {
      entry.conn.exec(command, (err, execStream) => {
        if (err) {
          finish(new Error(err.message || 'Exec request failed'));
          return;
        }
        stream = execStream;
        let stdout = '';
        let stderr = '';

        stream.on('close', (code) => {
          finish(null, { stdout, stderr, exitCode: typeof code === 'number' ? code : 1 });
        });
        stream.on('error', (error) => {
          finish(error);
        });
        stream.on('data', (data) => {
          stdout += data.toString();
        });
        stream.stderr.on('data', (data) => {
          stderr += data.toString();
        });
      });
    } catch (error) {
      finish(error);
    }
  });
});

ipcMain.handle('ssh-disconnect', async (event, id) => {
  const entry = sshConnections.get(id);
  if (entry) {
    if (entry.stream) entry.stream.close();
    if (entry.conn) entry.conn.end();
    sshConnections.delete(id);
  }
});

ipcMain.handle('ssh-exec', async (event, config, command) => {
  config = mergeStoredSshSecret(config);
  command = injectStoredSudoPassword(command, config);
  const win = BrowserWindow.fromWebContents(event.sender);
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { conn.end(); } catch (e) {}
      if (error) reject(error);
      else resolve(result);
    };
    const trustId = sshhostid(config.host, config.port);
    let waitedForTrust = false;
    let timer = setTimeout(function tick() {
      if (settled) return;
      if (HOST_TRUST_PENDING.has(trustId)) {
        waitedForTrust = true;
        timer = setTimeout(tick, 2000);
        return;
      }
      if (waitedForTrust) {
        waitedForTrust = false;
        timer = setTimeout(tick, 60000);
        return;
      }
      const error = new Error('VPS/VDS request timed out after 60 seconds.');
      error.code = 'SSH_EXEC_TIMEOUT';
      finish(error);
    }, 60000);

    conn.on('ready', () => {
      conn.exec(command, (err, stream) => {
        if (err) {
          finish(err.message || 'Exec request failed');
          return;
        }

        let stdout = '';
        let stderr = '';

        stream.on('close', (code) => {
          finish(null, { stdout, stderr, exitCode: typeof code === 'number' ? code : 1 });
        });

        stream.on('data', (data) => {
          stdout += data.toString();
        });

        stream.stderr.on('data', (data) => {
          stderr += data.toString();
        });
      });
    });

    conn.on('error', (err) => {
      finish(err.message || 'SSH connection failed');
    });

    const connectConfig = {
      host: config.host,
      port: parseInt(config.port) || 22,
      username: config.username,
      readyTimeout: 300000,
      hostVerifier: makehostverifier(win, config)
    };

    if (config.authType === 'password') {
      connectConfig.password = config.password;
    } else if (config.authType === 'privateKey' || config.authType === 'key') {
      connectConfig.privateKey = config.privateKey;
      if (config.passphrase) connectConfig.passphrase = config.passphrase;
    }

    try {
      conn.connect(connectConfig);
    } catch (e) {
      finish(e.message || 'SSH connection failed');
    }
  });
});

function buildsftpconfig(config, win) {
  config = mergeStoredSshSecret(config);
  const connectConfig = {
    host: config.host,
    port: parseInt(config.port) || 22,
    username: config.username,
    readyTimeout: 300000,
    hostVerifier: makehostverifier(win, config)
  };
    if (config.authType === 'password') {
      connectConfig.password = config.password;
    } else if (config.authType === 'privateKey' || config.authType === 'key') {
      connectConfig.privateKey = config.privateKey;
      if (config.passphrase) connectConfig.passphrase = config.passphrase;
    }
  return connectConfig;
}

ipcMain.handle('sftp-connect', async (event, config) => {
  const id = ++sftpIdCounter;
  const win = BrowserWindow.fromWebContents(event.sender);
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let settled = false;
    const trustId = sshhostid(config.host, config.port);
    let waitedForTrust = false;
    let timer = setTimeout(function tick() {
      if (settled) return;
      if (HOST_TRUST_PENDING.has(trustId)) {
        waitedForTrust = true;
        timer = setTimeout(tick, 2000);
        return;
      }
      if (waitedForTrust) {
        waitedForTrust = false;
        timer = setTimeout(tick, 20000);
        return;
      }
      settled = true;
      try { conn.end(); } catch (e) {}
      reject('Connection timed out');
    }, 20000);
    const done = (err, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) {
        try { conn.end(); } catch (e) {}
        reject(err);
      } else {
        resolve(value);
      }
    };
    conn.on('ready', () => {
      conn.sftp((err, sftp) => {
        if (err) { done(err.message || 'SFTP setup failed'); return; }
        sftpConnections.set(id, { conn, sftp });
        done(null, id);
      });
    });
    conn.on('error', (err) => { done(err.message || 'SSH connection failed'); });
    conn.connect(buildsftpconfig(config, win));
  });
});

ipcMain.handle('sftp-connect-session', async (event, sshId) => {
  const sshEntry = sshConnections.get(sshId);
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!sshEntry || sshEntry.closed || sshEntry.win !== win) throw new Error('SSH session is unavailable.');
  const id = ++sftpIdCounter;
  return new Promise((resolve, reject) => {
    sshEntry.conn.sftp((err, sftp) => {
      if (err) { reject(err.message || 'SFTP setup failed'); return; }
      sftpConnections.set(id, { conn: null, sftp, sharedSshId: sshId });
      resolve(id);
    });
  });
});

ipcMain.handle('sftp-list', async (event, id, remotePath) => {
  const entry = sftpConnections.get(id);
  if (!entry || !entry.sftp) throw new Error('SFTP not connected');
  if (!validsftppath(remotePath)) throw new Error('Invalid path: path traversal detected');
  return new Promise((resolve, reject) => {
    entry.sftp.readdir(remotePath, (err, list) => {
      if (err) reject(err);
      else resolve(list);
    });
  });
});

ipcMain.handle('sftp-stat', async (event, id, remotePath) => {
  const entry = sftpConnections.get(id);
  if (!entry || !entry.sftp) throw new Error('SFTP not connected');
  if (!validsftppath(remotePath)) throw new Error('Invalid path: path traversal detected');
  return new Promise((resolve, reject) => {
    entry.sftp.stat(remotePath, (err, stats) => {
      if (err) reject(err);
      else resolve({ mode: stats.mode, size: stats.size, mtime: stats.mtime, atime: stats.atime });
    });
  });
});

ipcMain.handle('sftp-read', async (event, id, remotePath) => {
  const entry = sftpConnections.get(id);
  if (!entry || !entry.sftp) throw new Error('SFTP not connected');
  if (!validsftppath(remotePath)) throw new Error('Invalid path: path traversal detected');
  return new Promise((resolve, reject) => {
    const chunks = [];
    const stream = entry.sftp.createReadStream(remotePath);
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream.on('error', (err) => reject(err));
  });
});

ipcMain.handle('sftp-write', async (event, id, remotePath, content) => {
  const entry = sftpConnections.get(id);
  if (!entry || !entry.sftp) throw new Error('SFTP not connected');
  if (!validsftppath(remotePath)) throw new Error('Invalid path: path traversal detected');
  return new Promise((resolve, reject) => {
    const stream = entry.sftp.createWriteStream(remotePath);
    stream.on('close', () => resolve(true));
    stream.on('error', (err) => reject(err));
    stream.end(content);
  });
});

ipcMain.handle('sftp-mkdir', async (event, id, remotePath) => {
  const entry = sftpConnections.get(id);
  if (!entry || !entry.sftp) throw new Error('SFTP not connected');
  if (!validsftppath(remotePath)) throw new Error('Invalid path: path traversal detected');
  return new Promise((resolve, reject) => {
    entry.sftp.mkdir(remotePath, (err) => {
      if (err) reject(err); else resolve(true);
    });
  });
});

ipcMain.handle('sftp-rename', async (event, id, oldPath, newPath) => {
  const entry = sftpConnections.get(id);
  if (!entry || !entry.sftp) throw new Error('SFTP not connected');
  if (!validsftppath(oldPath) || !validsftppath(newPath)) throw new Error('Invalid path: path traversal detected');
  return new Promise((resolve, reject) => {
    entry.sftp.rename(oldPath, newPath, (err) => {
      if (err) reject(err); else resolve(true);
    });
  });
});

ipcMain.handle('sftp-delete', async (event, id, remotePath) => {
  const entry = sftpConnections.get(id);
  if (!entry || !entry.sftp) throw new Error('SFTP not connected');
  if (!validsftppath(remotePath)) throw new Error('Invalid path: path traversal detected');
  return new Promise((resolve, reject) => {
    entry.sftp.unlink(remotePath, (err) => {
      if (err) reject(err); else resolve(true);
    });
  });
});

ipcMain.handle('sftp-rmdir', async (event, id, remotePath) => {
  const entry = sftpConnections.get(id);
  if (!entry || !entry.sftp) throw new Error('SFTP not connected');
  if (!validsftppath(remotePath)) throw new Error('Invalid path: path traversal detected');
  return new Promise((resolve, reject) => {
    entry.sftp.rmdir(remotePath, (err) => {
      if (err) reject(err); else resolve(true);
    });
  });
});

ipcMain.handle('sftp-upload', async (event, id, remotePath, buffer) => {
  const entry = sftpConnections.get(id);
  if (!entry || !entry.sftp) throw new Error('SFTP not connected');
  if (!validsftppath(remotePath)) throw new Error('Invalid path: path traversal detected');
  return new Promise((resolve, reject) => {
    const stream = entry.sftp.createWriteStream(remotePath);
    stream.on('close', () => resolve(true));
    stream.on('error', (err) => reject(err));
    stream.end(Buffer.from(buffer));
  });
});

ipcMain.handle('sftp-download', async (event, id, remotePath) => {
  const entry = sftpConnections.get(id);
  if (!entry || !entry.sftp) throw new Error('SFTP not connected');
  if (!validsftppath(remotePath)) throw new Error('Invalid path: path traversal detected');
  return new Promise((resolve, reject) => {
    const chunks = [];
    const stream = entry.sftp.createReadStream(remotePath);
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', (err) => reject(err));
  });
});

ipcMain.handle('sftp-chmod', async (event, id, remotePath, mode) => {
  const entry = sftpConnections.get(id);
  if (!entry || !entry.sftp) throw new Error('SFTP not connected');
  if (!validsftppath(remotePath)) throw new Error('Invalid path: path traversal detected');
  return new Promise((resolve, reject) => {
    entry.sftp.chmod(remotePath, mode, (err) => {
      if (err) reject(err); else resolve(true);
    });
  });
});

ipcMain.handle('sftp-disconnect', async (event, id) => {
  const entry = sftpConnections.get(id);
  if (entry) {
    if (entry.sftp) entry.sftp.end();
    if (entry.conn) entry.conn.end();
    sftpConnections.delete(id);
  }
});

ipcMain.handle('get-app-version', async () => {
  return APP_VERSION;
});

ipcMain.handle('check-update', async () => {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`);
    const data = await res.json();
    const latestTag = (data.tag_name || '').replace(/^v/, '');
    return { currentVersion: APP_VERSION, latestVersion: latestTag, outdated: latestTag !== APP_VERSION };
  } catch (e) {
    return { currentVersion: APP_VERSION, latestVersion: null, outdated: false };
  }
});

ipcMain.handle('toggle-devtools', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    win.webContents.toggleDevTools();
  }
});

ipcMain.handle('win-minimize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.minimize();
});

ipcMain.handle('win-maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  }
});

ipcMain.handle('win-close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.close();
});

ipcMain.handle('win-is-maximized', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  return win ? win.isMaximized() : false;
});

let rpcSocket = null;
let rpcConnected = false;
let rpcNonce = 0;
let rpcCallbacks = {};

function getdiscordipcpath() {
  if (process.platform === 'win32') {
    return '\\\\.\\pipe\\discord-ipc-0';
  }
  const prefix = 'discord-ipc-';
  const dirs = [];
  if (process.platform === 'darwin') {
    dirs.push(path.join(process.env.HOME || '', 'Library', 'Application Support', 'discord'));
  } else {
    const xdg = process.env.XDG_RUNTIME_DIR || '/tmp';
    dirs.push(path.join(xdg, 'discord'));
    dirs.push('/tmp');
  }
  for (const dir of dirs) {
    for (let i = 0; i < 10; i++) {
      const p = path.join(dir, prefix + i);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

function sendipcframe(socket, opcode, data) {
  const payload = Buffer.from(data, 'utf8');
  const header = Buffer.alloc(8);
  header.writeUInt32LE(opcode, 0);
  header.writeUInt32LE(payload.length, 4);
  socket.write(Buffer.concat([header, payload]));
}

function ipcconnect(clientId) {
  return new Promise((resolve) => {
    const pidpath = getdiscordipcpath();
    if (!pidpath) return resolve(false);
    const socket = net.createConnection(pidpath);
    socket.setTimeout(3000);
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
    let resolved = false;
    socket.once('connect', () => {
      socket.setTimeout(0);
      sendipcframe(socket, 0, JSON.stringify({ v: 1, client_id: clientId }));
      let pending = Buffer.alloc(0);
      const ondata = (chunk) => {
        pending = Buffer.concat([pending, chunk]);
        while (pending.length >= 8) {
          const opcode = pending.readUInt32LE(0);
          const len = pending.readUInt32LE(4);
          if (pending.length < 8 + len) break;
          const payload = pending.slice(8, 8 + len).toString('utf8');
          pending = pending.slice(8 + len);
          if (opcode === 1) {
            try {
              const msg = JSON.parse(payload);
              if (msg.evt === 'READY' && !resolved) {
                resolved = true;
                socket.removeListener('data', ondata);
                rpcSocket = socket;
                rpcConnected = true;
                let buf2 = Buffer.alloc(0);
                socket.on('data', (c) => {
                  buf2 = Buffer.concat([buf2, c]);
                  while (buf2.length >= 8) {
                    const op = buf2.readUInt32LE(0);
                    const ln = buf2.readUInt32LE(4);
                    if (buf2.length < 8 + ln) break;
                    const pl = buf2.slice(8, 8 + ln).toString('utf8');
                    buf2 = buf2.slice(8 + ln);
                    if (op === 1) {
                      try {
                        const m = JSON.parse(pl);
                        if (m.nonce && rpcCallbacks[m.nonce]) {
                          rpcCallbacks[m.nonce](m);
                          delete rpcCallbacks[m.nonce];
                        }
                      } catch (e) {}
                    }
                  }
                });
                socket.on('close', () => { rpcConnected = false; rpcSocket = null; rpcCallbacks = {}; });
                socket.on('error', () => { rpcConnected = false; rpcSocket = null; rpcCallbacks = {}; });
                resolve(true);
              } else if (msg.evt === 'ERROR' && !resolved) {
                resolved = true;
                socket.destroy();
                resolve(false);
              }
            } catch (e) {}
          }
        }
      };
      socket.on('data', ondata);
      socket.on('close', () => { if (!resolved) resolve(false); });
    });
  });
}

ipcMain.handle('discord-rpc-connect', async () => {
  if (rpcConnected) return true;
  const clientId = '1529664717117984888';
  return await ipcconnect(clientId);
});

ipcMain.handle('discord-rpc-disconnect', async () => {
  rpcConnected = false;
  rpcCallbacks = {};
  if (rpcSocket) {
    try { rpcSocket.destroy(); } catch (e) {}
    rpcSocket = null;
  }
});

ipcMain.handle('discord-rpc-set-activity', async (event, activity) => {
  if (!rpcConnected || !rpcSocket) return;
  const nonce = 'n' + (++rpcNonce);
  return new Promise((resolve) => {
    rpcCallbacks[nonce] = () => resolve();
    const payload = JSON.stringify({ cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity }, nonce });
    sendipcframe(rpcSocket, 1, payload);
    setTimeout(() => { delete rpcCallbacks[nonce]; resolve(); }, 2000);
  });
});

async function checkserverstatus(server) {
  if (server.type === 'VPS/VDS') {
    return checkvpsstatus(server);
  }
  const apiKey = server.secretId ? loadSecretStore().servers[server.secretId]?.apiKey : server.apiKey;
  if (!server.panelUrl || !apiKey || !server.uuid) return 'unknown';
  try {
    const url = server.panelUrl.replace(/\/$/, '') + '/api/client/servers/' + server.uuid + '/resources';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Accept': 'application/vnd.pterodactyl.v1+json',
      }
    });
    clearTimeout(timer);
    if (res.status === 200) {
      try {
        const json = await res.json();
        return json.attributes?.current_state || 'running';
      } catch (e) { return 'running'; }
    }
    if (res.status === 401 || res.status === 403) return 'running';
    return 'offline';
  } catch (e) {
    return 'offline';
  }
}

function checkvpsstatus(server) {
  return new Promise((resolve) => {
    const host = server.host;
    const port = parseInt(server.port) || 22;
    const socket = new net.Socket();
    let resolved = false;
    const done = (status) => {
      if (resolved) return;
      resolved = true;
      try { socket.destroy(); } catch (e) {}
      resolve(status);
    };
    socket.setTimeout(5000);
    socket.on('connect', () => done('online'));
    socket.on('timeout', () => done('offline'));
    socket.on('error', () => done('offline'));
    socket.connect(port, host);
  });
}

function runmonitorcheck() {
  if (!monitorServers.length) return;
  monitorServers.forEach(async (server) => {
    const status = await checkserverstatus(server);
    const prev = monitorPrevStatus[server.id];
    monitorPrevStatus[server.id] = status;

    if (prev !== 'initial' && prev !== status) {
      if (prev !== 'offline' && status === 'offline') {
        if (!monitorNotified.has(server.id)) {
          monitorNotified.add(server.id);
          new Notification({ title: 'Server Offline', body: `${server.name} has gone offline.`, silent: false }).show();
        }
      } else if (prev === 'offline' && status !== 'offline') {
        monitorNotified.delete(server.id);
        new Notification({ title: 'Server Online', body: `${server.name} is back online.`, silent: false }).show();
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('server-status', { id: server.id, status });
      }
    }

    if (monitorAlerts.length && status !== 'offline') {
      checkserveralerts(server);
    }
  });
}

async function checkserveralerts(server) {
  let stats = null;
  const apiKey = server.secretId ? loadSecretStore().servers[server.secretId]?.apiKey : server.apiKey;
  if (server.type === 'Pterodactyl' && server.panelUrl && apiKey && server.uuid) {
    try {
      const url = server.panelUrl.replace(/\/$/, '') + '/api/client/servers/' + server.uuid + '/resources';
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const resp = await fetch(url, { signal: controller.signal, headers: { 'Authorization': 'Bearer ' + apiKey, 'Accept': 'application/vnd.pterodactyl.v1+json' } });
      clearTimeout(timer);
      if (resp.ok) {
        const data = await resp.json();
        const r = data.attributes || {};
        const res = r.resources || {};
        const memLimit = (r.limits?.memory || 0) * 1024 * 1024;
        const diskLimit = (r.limits?.disk || 0) * 1024 * 1024;
        stats = {
          cpu: Math.max(0, Math.min(100, res.cpu_absolute || 0)),
          ram: memLimit > 0 ? Math.min(100, (res.memory_bytes || 0) / memLimit * 100) : 0,
          disk: diskLimit > 0 ? Math.min(100, (res.disk_bytes || 0) / diskLimit * 100) : 0,
        };
      }
    } catch (e) {}
  } else if (server.type === 'VPS/VDS' && server.host) {
    try {
      const cfg = mergeStoredSshSecret({ host: server.host, port: parseInt(server.port) || 22, username: server.username || 'root', secretId: server.secretId, keySecretId: server.keySecretId, authType: server.authType });
      const result = await new Promise((resolve, reject) => {
        const conn = new Client();
        conn.on('ready', () => {
          conn.exec("free | awk '/Mem:/{print $2,$3} /Swap:/{print $2,$3}' && df / | awk 'NR==2{print $2,$3}' && nproc", (err, stream) => {
            if (err) { conn.end(); reject(err.message || 'Exec failed'); return; }
            let out = '';
            stream.on('close', () => { conn.end(); resolve(out); });
            stream.on('data', (d) => { out += d.toString(); });
          });
        });
        conn.on('error', (err) => { reject(err.message || 'SSH connection failed'); });
        const connectConfig = { host: cfg.host, port: cfg.port, username: cfg.username, readyTimeout: 60000, background: true, hostVerifier: makehostverifier(null, { host: cfg.host, port: cfg.port, background: true }) };
        if (cfg.authType === 'password') connectConfig.password = cfg.password;
        else if (cfg.authType === 'privateKey') connectConfig.privateKey = cfg.privateKey;
        conn.connect(connectConfig);
      });
      const lines = result.trim().split('\n');
      const mem = lines[0]?.split(/\s+/) || [];
      const disk = lines[1]?.split(/\s+/) || [];
      const memTotal = parseInt(mem[0]) || 1;
      const memUsed = parseInt(mem[1]) || 0;
      const diskTotal = parseInt(disk[0]) || 1;
      const diskUsed = parseInt(disk[1]) || 0;
      stats = { cpu: 0, ram: memTotal > 0 ? memUsed / memTotal * 100 : 0, disk: diskTotal > 0 ? diskUsed / diskTotal * 100 : 0 };
    } catch (e) {}
  }

  if (!stats) return;
  const now = Date.now();

  for (const rule of monitorAlerts) {
    if (!rule.enabled) continue;
    const value = stats[rule.metric];
    if (value === undefined) continue;
    const key = server.id + ':' + rule.id;
    const breached = value > rule.threshold;

    if (breached) {
      if (!alertBreachStart[key]) {
        alertBreachStart[key] = now;
      }
      const elapsed = (now - alertBreachStart[key]) / 60000;
      const requiredMin = rule.duration || 0;
      if (elapsed >= requiredMin) {
        if (!alertCooldown[key] || (now - alertCooldown[key]) > 300000) {
          alertCooldown[key] = now;
          const labels = { cpu: 'CPU', ram: 'RAM', disk: 'Disk' };
          new Notification({
            title: `Alert: ${server.name}`,
            body: `${labels[rule.metric]} is ${value.toFixed(1)}% (threshold: ${rule.threshold}%)`,
            silent: false,
          }).show();
        }
      }
    } else {
      alertBreachStart[key] = null;
    }
  }
}

ipcMain.handle('monitor-start', async (event, servers, tick, alerts) => {
  if (monitorInterval) clearInterval(monitorInterval);
  monitorServers = servers || [];
  monitorTick = (tick || 10) * 1000;
  monitorAlerts = alerts || [];
  monitorPrevStatus = {};
  monitorNotified = new Set();
  alertBreachStart = {};
  alertCooldown = {};
  monitorServers.forEach(s => { monitorPrevStatus[s.id] = 'initial'; });
  runmonitorcheck();
  monitorInterval = setInterval(runmonitorcheck, monitorTick);
  return { ok: true, pid: process.pid, tick: monitorTick / 1000 };
});

ipcMain.handle('accept-servers-pending', async () => {
  const servers = pendingServerImports;
  pendingServerImports = [];
  return { servers };
});

ipcMain.handle('monitor-update-credentials', async (event, id, apiKey) => {
  const server = monitorServers.find(item => String(item.id) === String(id));
  if (server && server.type === 'Pterodactyl' && typeof apiKey === 'string') {
    server.apiKey = apiKey;
  }
  return { ok: Boolean(server) };
});

ipcMain.handle('monitor-stop', async () => {
  if (monitorInterval) { clearInterval(monitorInterval); monitorInterval = null; }
  monitorServers = [];
  monitorPrevStatus = {};
  monitorNotified = new Set();
  monitorAlerts = [];
  alertBreachStart = {};
  alertCooldown = {};
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
    mainWindow.show();
  }
  return { ok: true };
});

ipcMain.handle('monitor-status', async () => {
  return {
    running: !!monitorInterval,
    pid: monitorInterval ? process.pid : null,
    tick: monitorTick / 1000,
    serverCount: monitorServers.length,
  };
});

ipcMain.handle('checkvps', async (event, host, port) => {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let resolved = false;
    const done = (status) => {
      if (resolved) return;
      resolved = true;
      try { socket.destroy(); } catch (e) {}
      resolve(status);
    };
    socket.setTimeout(5000);
    socket.on('connect', () => done('online'));
    socket.on('timeout', () => done('offline'));
    socket.on('error', () => done('offline'));
    socket.connect(parseInt(port) || 22, host);
  });
});

ipcMain.handle('sshping', async (event, host, port) => {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let resolved = false;
    const done = (status) => {
      if (resolved) return;
      resolved = true;
      try { socket.destroy(); } catch (e) {}
      resolve(status);
    };
    socket.setTimeout(5000);
    socket.on('connect', () => done('online'));
    socket.on('timeout', () => done('offline'));
    socket.on('error', () => done('offline'));
    socket.connect(parseInt(port) || 22, host);
  });
});

function randomfilename(len) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let r = '';
  for (let i = 0; i < len; i++) r += chars[Math.floor(Math.random() * chars.length)];
  return r;
}

ipcMain.handle('ssh-open-cmd', async (event, config) => {
  config = mergeStoredSshSecret(config);
  const { execSync, spawn } = require('child_process');
  const knownHostsFile = await ensurehosttrustforsystem(BrowserWindow.fromWebContents(event.sender), config);
  const tmpDir = os.tmpdir();
  let keyFile = null;
  let pubFile = null;

  try {
    if (config.authType === 'privateKey' && config.privateKey) {
      const rnd = randomfilename(24);
      keyFile = path.join(tmpDir, rnd + '.key');
      pubFile = path.join(tmpDir, rnd + '.key.pub');
      fs.writeFileSync(keyFile, config.privateKey, { mode: 0o600 });
      try { execSync(`icacls "${keyFile}" /inheritance:r /grant:r "%USERNAME%:F"`, { stdio: 'ignore' }); } catch (e) {}
      if (config.publicKey) {
        fs.writeFileSync(pubFile, config.publicKey, { mode: 0o600 });
        try { execSync(`icacls "${pubFile}" /inheritance:r /grant:r "%USERNAME%:F"`, { stdio: 'ignore' }); } catch (e) {}
      }
    }

    const port = parseInt(config.port) || 22;
    const user = config.username || 'root';
    const host = config.host;

    let args = [];
    if (keyFile) args.push('-i', keyFile);
    if (port !== 22) args.push('-p', String(port));
    args.push('-o', `UserKnownHostsFile=${knownHostsFile}`, '-o', 'StrictHostKeyChecking=yes');
    args.push(`${user}@${host}`);

    const cmdArgs = ['/k', 'ssh', ...args];
    spawn('cmd.exe', cmdArgs, {
      detached: true,
      stdio: 'ignore',
      windowsHide: false
    }).unref();

    return { ok: true, keyFile, pubFile };
  } catch (e) {
    if (keyFile) { try { fs.unlinkSync(keyFile); } catch (x) {} }
    if (pubFile) { try { fs.unlinkSync(pubFile); } catch (x) {} }
    throw new Error(e.message || 'Failed to open SSH session');
  }
});

ipcMain.handle('ssh-cleanup-tempkey', async (event, keyPath) => {
  try {
    if (keyPath && fs.existsSync(keyPath)) fs.unlinkSync(keyPath);
  } catch (e) {}
  return { ok: true };
});

ipcMain.handle('scp-copy-file', async (event, config, remotePath, localPath) => {
  config = mergeStoredSshSecret(config);
  const { execSync } = require('child_process');
  const knownHostsFile = await ensurehosttrustforsystem(BrowserWindow.fromWebContents(event.sender), config);
  const tmpDir = os.tmpdir();
  let keyFile = null;
  let pubFile = null;

  try {
    if (config.authType === 'privateKey' && config.privateKey) {
      const rnd = randomfilename(24);
      keyFile = path.join(tmpDir, rnd + '.key');
      pubFile = path.join(tmpDir, rnd + '.key.pub');
      fs.writeFileSync(keyFile, config.privateKey, { mode: 0o600 });
      try { execSync(`icacls "${keyFile}" /inheritance:r /grant:r "%USERNAME%:F"`, { stdio: 'ignore' }); } catch (e) {}
      if (config.publicKey) {
        fs.writeFileSync(pubFile, config.publicKey, { mode: 0o600 });
        try { execSync(`icacls "${pubFile}" /inheritance:r /grant:r "%USERNAME%:F"`, { stdio: 'ignore' }); } catch (e) {}
      }
    }

    const port = parseInt(config.port) || 22;
    const user = config.username || 'root';
    const host = config.host;

    const remote = `${user}@${host}:${remotePath}`;
    let args = ['-r', '-P', String(port)];
    if (keyFile) args.push('-i', keyFile);
    args.push('-o', `UserKnownHostsFile=${knownHostsFile}`, '-o', 'StrictHostKeyChecking=yes');
    args.push(remote, localPath);

    const result = execSync(`scp ${args.map(a => `"${a.replace(/"/g, '\\"')}"`).join(' ')}`, {
      timeout: 300000,
      windowsHide: true,
      encoding: 'utf8'
    });

    if (keyFile) { try { fs.unlinkSync(keyFile); } catch (e) {} }
    if (pubFile) { try { fs.unlinkSync(pubFile); } catch (e) {} }

    return { ok: true, output: result };
  } catch (e) {
    if (keyFile) { try { fs.unlinkSync(keyFile); } catch (x) {} }
    if (pubFile) { try { fs.unlinkSync(pubFile); } catch (x) {} }
    throw new Error(e.stderr || e.message || 'SCP transfer failed');
  }
});

const PLUGINS_DIR = path.join(app.getPath('userData'), 'plugins');

ipcMain.handle('plugin-dir', async () => {
  if (!fs.existsSync(PLUGINS_DIR)) fs.mkdirSync(PLUGINS_DIR, { recursive: true });
  return PLUGINS_DIR;
});

ipcMain.handle('plugin-list', async () => {
  if (!fs.existsSync(PLUGINS_DIR)) return [];
  try {
    return fs.readdirSync(PLUGINS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
  } catch (e) { return []; }
});

ipcMain.handle('plugin-read-manifest', async (event, folder) => {
  const manifestPath = path.join(PLUGINS_DIR, folder, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return null;
  const raw = fs.readFileSync(manifestPath, 'utf8');
  return JSON.parse(raw);
});

ipcMain.handle('plugin-read-entry', async (event, folder, entry) => {
  const entryPath = path.join(PLUGINS_DIR, folder, entry);
  if (!fs.existsSync(entryPath)) return null;
  return fs.readFileSync(entryPath, 'utf8');
});
