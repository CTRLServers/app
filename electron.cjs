const { app, BrowserWindow, ipcMain, shell, Notification, Tray, Menu } = require('electron');
const path = require('path');
const WebSocket = require('ws');
const { Client } = require('ssh2');
const net = require('net');
const fs = require('fs');
const os = require('os');

const APP_VERSION = '1.0.9';
const GITHUB_REPO = 'CTRLServers/app';
app.setAppUserModelId('com.ctrlservers.app');

const isPortable = process.env.PORTABLE_EXECUTABLE_DIR || process.argv.includes('--portable');
if (isPortable) {
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath);
  app.setPath('userData', path.join(portableDir, 'ctrlservers-data'));
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createwindow();
    createtray();
  });
}

const wsConnections = new Map();
let wsIdCounter = 0;
const sshConnections = new Map();
let sshIdCounter = 0;
const sftpConnections = new Map();
let sftpIdCounter = 0;

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
  sftpConnections.forEach(sftp => { try { sftp.end(); } catch (e) {} });
  sftpConnections.clear();
});

ipcMain.handle('ws-connect', async (event, url, token, headers, origin) => {
  const id = ++wsIdCounter;
  const win = BrowserWindow.fromWebContents(event.sender);

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, {
      headers: {
        ...headers,
        Origin: origin || 'https://app.ctrlservers.xyz'
      },
      rejectUnauthorized: false
    });

    wsConnections.set(id, ws);

    ws.on('open', () => {
      ws.send(JSON.stringify({ event: 'auth', args: [token] }));
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
      reject(err);
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
  await shell.openexternal(url);
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
  const id = ++sshIdCounter;
  const win = BrowserWindow.fromWebContents(event.sender);

  return new Promise((resolve, reject) => {
    const conn = new Client();

    conn.on('ready', () => {
      conn.shell({ term: 'xterm-256color', cols: config.cols || 80, rows: config.rows || 24 }, (err, stream) => {
        if (err) {
          conn.end();
          reject(err);
          return;
        }
        sshConnections.set(id, { conn, stream });

        stream.on('data', (data) => {
          if (win && !win.isDestroyed()) {
            win.webContents.send('ssh-data', id, data.toString('utf8'));
          }
        });

        stream.on('close', () => {
          sshConnections.delete(id);
          conn.end();
          if (win && !win.isDestroyed()) {
            win.webContents.send('ssh-close', id);
          }
        });

        stream.stderr.on('data', (data) => {
          if (win && !win.isDestroyed()) {
            win.webContents.send('ssh-data', id, data.toString('utf8'));
          }
        });

        resolve(id);
      });
    });

    conn.on('error', (err) => {
      sshConnections.delete(id);
      reject(err);
    });

    const connectConfig = {
      host: config.host,
      port: parseInt(config.port) || 22,
      username: config.username,
      readyTimeout: 10000
    };

    if (config.authType === 'password') {
      connectConfig.password = config.password;
    } else if (config.authType === 'privateKey' || config.authType === 'key') {
      connectConfig.privateKey = config.privateKey;
      if (config.passphrase) connectConfig.passphrase = config.passphrase;
    }

    conn.connect(connectConfig);
  });
});

ipcMain.handle('ssh-data', async (event, id, data) => {
  const entry = sshConnections.get(id);
  if (entry && entry.stream) {
    entry.stream.write(data);
  }
});

ipcMain.handle('ssh-resize', async (event, id, cols, rows) => {
  const entry = sshConnections.get(id);
  if (entry && entry.stream) {
    entry.stream.setWindow(rows, cols, 0, 0);
  }
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
  return new Promise((resolve, reject) => {
    const conn = new Client();

    conn.on('ready', () => {
      conn.exec(command, (err, stream) => {
        if (err) {
          conn.end();
          reject(err);
          return;
        }

        let stdout = '';
        let stderr = '';

        stream.on('close', (code) => {
          conn.end();
          resolve({ stdout, stderr, exitCode: code });
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
      reject(err);
    });

    const connectConfig = {
      host: config.host,
      port: parseInt(config.port) || 22,
      username: config.username,
      readyTimeout: 10000
    };

    if (config.authType === 'password') {
      connectConfig.password = config.password;
    } else if (config.authType === 'privateKey' || config.authType === 'key') {
      connectConfig.privateKey = config.privateKey;
      if (config.passphrase) connectConfig.passphrase = config.passphrase;
    }

    conn.connect(connectConfig);
  });
});

function buildsftpconfig(config) {
  const connectConfig = {
    host: config.host,
    port: parseInt(config.port) || 22,
    username: config.username,
    readyTimeout: 10000
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
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', () => {
      conn.sftp((err, sftp) => {
        if (err) { conn.end(); reject(err); return; }
        sftpConnections.set(id, { conn, sftp });
        resolve(id);
      });
    });
    conn.on('error', (err) => { reject(err); });
    conn.connect(buildsftpconfig(config));
  });
});

ipcMain.handle('sftp-list', async (event, id, remotePath) => {
  const entry = sftpConnections.get(id);
  if (!entry || !entry.sftp) throw new Error('SFTP not connected');
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
  return new Promise((resolve, reject) => {
    entry.sftp.mkdir(remotePath, (err) => {
      if (err) reject(err); else resolve(true);
    });
  });
});

ipcMain.handle('sftp-rename', async (event, id, oldPath, newPath) => {
  const entry = sftpConnections.get(id);
  if (!entry || !entry.sftp) throw new Error('SFTP not connected');
  return new Promise((resolve, reject) => {
    entry.sftp.rename(oldPath, newPath, (err) => {
      if (err) reject(err); else resolve(true);
    });
  });
});

ipcMain.handle('sftp-delete', async (event, id, remotePath) => {
  const entry = sftpConnections.get(id);
  if (!entry || !entry.sftp) throw new Error('SFTP not connected');
  return new Promise((resolve, reject) => {
    entry.sftp.unlink(remotePath, (err) => {
      if (err) reject(err); else resolve(true);
    });
  });
});

ipcMain.handle('sftp-rmdir', async (event, id, remotePath) => {
  const entry = sftpConnections.get(id);
  if (!entry || !entry.sftp) throw new Error('SFTP not connected');
  return new Promise((resolve, reject) => {
    entry.sftp.rmdir(remotePath, (err) => {
      if (err) reject(err); else resolve(true);
    });
  });
});

ipcMain.handle('sftp-upload', async (event, id, remotePath, buffer) => {
  const entry = sftpConnections.get(id);
  if (!entry || !entry.sftp) throw new Error('SFTP not connected');
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
  if (!server.panelUrl || !server.apiKey || !server.uuid) return 'unknown';
  try {
    const url = server.panelUrl.replace(/\/$/, '') + '/api/client/servers/' + server.uuid + '/resources';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Authorization': 'Bearer ' + server.apiKey,
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
  if (server.type === 'Pterodactyl' && server.panelUrl && server.apiKey && server.uuid) {
    try {
      const url = server.panelUrl.replace(/\/$/, '') + '/api/client/servers/' + server.uuid + '/resources';
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const resp = await fetch(url, { signal: controller.signal, headers: { 'Authorization': 'Bearer ' + server.apiKey, 'Accept': 'application/vnd.pterodactyl.v1+json' } });
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
      const cfg = { host: server.host, port: parseInt(server.port) || 22, username: server.username || 'root' };
      if (server.authType === 'key' && server.privateKey) { cfg.authType = 'privateKey'; cfg.privateKey = server.privateKey; }
      else { cfg.authType = 'password'; cfg.password = server.password || ''; }
      const result = await new Promise((resolve, reject) => {
        const conn = new Client();
        conn.on('ready', () => {
          conn.exec("free | awk '/Mem:/{print $2,$3} /Swap:/{print $2,$3}' && df / | awk 'NR==2{print $2,$3}' && nproc", (err, stream) => {
            if (err) { conn.end(); reject(err); return; }
            let out = '';
            stream.on('close', () => { conn.end(); resolve(out); });
            stream.on('data', (d) => { out += d.toString(); });
          });
        });
        conn.on('error', reject);
        const connectConfig = { host: cfg.host, port: cfg.port, username: cfg.username, readyTimeout: 10000 };
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
