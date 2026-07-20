const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const WebSocket = require('ws');
const { Client } = require('ssh2');

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

app.whenReady().then(() => {
  createwindow();
  const win = BrowserWindow.getAllWindows()[0];
});
