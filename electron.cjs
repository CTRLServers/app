const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const WebSocket = require('ws');
const { Client } = require('ssh2');
const net = require('net');
const fs = require('fs');

const APP_VERSION = '1.0.5';
const GITHUB_REPO = 'CTRLServers/app';

const wsConnections = new Map();
let wsIdCounter = 0;
const sshConnections = new Map();
let sshIdCounter = 0;
const sftpConnections = new Map();
let sftpIdCounter = 0;

function createwindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'src', 'assets', 'logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.setMenu(null);
  win.maximize();
  win.loadFile(path.join(__dirname, 'index.html'));
}

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
            win.webContents.send('ssh-data', id, data.toString('binary'));
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
            win.webContents.send('ssh-data', id, data.toString('binary'));
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

app.whenReady().then(() => {
  createwindow();
});
