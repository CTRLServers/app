const { contextBridge, ipcRenderer } = require('electron');

const wsCallbacks = { message: [], close: [], error: [] };
const sshCallbacks = { data: [], close: [] };
const wsCallbackIds = new Map();
const sshDataCallbackIds = new Map();
const sshCloseCallbackIds = new Map();
let wsMsgId = 0;
let wsCloseId = 0;
let wsErrorId = 0;
let sshDataId = 0;
let sshCloseId = 0;

ipcRenderer.on('ws-message', (event, id, data) => {
  wsCallbacks.message.forEach(cb => cb(id, data));
});

ipcRenderer.on('ws-close', (event, id, code, reason) => {
  wsCallbacks.close.forEach(cb => cb(id, code, reason));
});

ipcRenderer.on('ws-error', (event, id, err) => {
  wsCallbacks.error.forEach(cb => cb(id, err));
});

ipcRenderer.on('ssh-data', (event, id, data) => {
  sshCallbacks.data.forEach(c => c.cb(id, data));
});

ipcRenderer.on('ssh-close', (event, id, reason) => {
  sshCallbacks.close.forEach(c => c.cb(id, reason));
});

contextBridge.exposeInMainWorld('electronAPI', {
  appversion: () => ipcRenderer.invoke('get-app-version'),
  checkupdate: () => ipcRenderer.invoke('check-update'),
  connectwebsocket: (url, token, headers, origin) => {
    return ipcRenderer.invoke('ws-connect', url, token, headers, origin);
  },
  sendws: (id, data) => {
    ipcRenderer.invoke('ws-send', id, data);
  },
  closews: (id) => {
    ipcRenderer.invoke('ws-close', id);
  },
  onwsmessage: (callback) => {
    const id = ++wsMsgId;
    wsCallbackIds.set(callback, id);
    wsCallbacks.message.push(callback);
    return id;
  },
  offwsmessage: (callback) => {
    const idx = wsCallbacks.message.indexOf(callback);
    if (idx !== -1) wsCallbacks.message.splice(idx, 1);
  },
  onwsclose: (callback) => {
    wsCallbacks.close.push(callback);
  },
  offwsclose: (callback) => {
    const idx = wsCallbacks.close.indexOf(callback);
    if (idx !== -1) wsCallbacks.close.splice(idx, 1);
  },
  onwserror: (callback) => {
    wsCallbacks.error.push(callback);
  },
  offwserror: (callback) => {
    const idx = wsCallbacks.error.indexOf(callback);
    if (idx !== -1) wsCallbacks.error.splice(idx, 1);
  },
  openexternal: (url) => {
    return ipcRenderer.invoke('open-external', url);
  },
  openinexplorer: (filePath) => {
    return ipcRenderer.invoke('open-in-explorer', filePath);
  },
  showsavedialog: (defaultPath) => {
    return ipcRenderer.invoke('show-save-dialog', defaultPath);
  },
  getplatform: () => {
    return ipcRenderer.sendSync('get-platform');
  },
  getappversion: () => {
    return ipcRenderer.sendSync('get-app-version');
  },
  getelectronversion: () => {
    return ipcRenderer.sendSync('get-electron-version');
  },
  getchromeversion: () => {
    return ipcRenderer.sendSync('get-chrome-version');
  },
  getnodeversion: () => {
    return ipcRenderer.sendSync('get-node-version');
  },
  sshconnect: (config) => {
    return ipcRenderer.invoke('ssh-connect', config);
  },
  sshready: (id) => {
    ipcRenderer.send('ssh-ready', id);
  },
  sshdata: (id, data) => {
    ipcRenderer.send('ssh-data', id, data);
  },
  sshresize: (id, cols, rows) => {
    ipcRenderer.send('ssh-resize', id, cols, rows);
  },
  sshdisconnect: (id) => {
    return ipcRenderer.invoke('ssh-disconnect', id);
  },
  sshsessionstatus: (id) => {
    return ipcRenderer.invoke('ssh-session-status', id);
  },
  sshexec: (config, command) => {
    return ipcRenderer.invoke('ssh-exec', config, command);
  },
  onsshdata: (callback) => {
    const id = ++sshDataId;
    sshDataCallbackIds.set(id, callback);
    sshCallbacks.data.push({ id, cb: callback });
    return id;
  },
  offsshdata: (id) => {
    const idx = sshCallbacks.data.findIndex(c => c.id === id);
    if (idx !== -1) sshCallbacks.data.splice(idx, 1);
    sshDataCallbackIds.delete(id);
  },
  onsshclose: (callback) => {
    const id = ++sshCloseId;
    sshCloseCallbackIds.set(id, callback);
    sshCallbacks.close.push({ id, cb: callback });
    return id;
  },
  offsshclose: (id) => {
    const idx = sshCallbacks.close.findIndex(c => c.id === id);
    if (idx !== -1) sshCallbacks.close.splice(idx, 1);
    sshCloseCallbackIds.delete(id);
  },
  sftpconnect: (config) => {
    return ipcRenderer.invoke('sftp-connect', config);
  },
  sftplist: (id, remotePath) => {
    return ipcRenderer.invoke('sftp-list', id, remotePath);
  },
  sftpstat: (id, remotePath) => {
    return ipcRenderer.invoke('sftp-stat', id, remotePath);
  },
  sftpread: (id, remotePath) => {
    return ipcRenderer.invoke('sftp-read', id, remotePath);
  },
  sftpwrite: (id, remotePath, content) => {
    return ipcRenderer.invoke('sftp-write', id, remotePath, content);
  },
  sftpmkdir: (id, remotePath) => {
    return ipcRenderer.invoke('sftp-mkdir', id, remotePath);
  },
  sftprename: (id, oldPath, newPath) => {
    return ipcRenderer.invoke('sftp-rename', id, oldPath, newPath);
  },
  sftpdelete: (id, remotePath) => {
    return ipcRenderer.invoke('sftp-delete', id, remotePath);
  },
  sftprmdir: (id, remotePath) => {
    return ipcRenderer.invoke('sftp-rmdir', id, remotePath);
  },
  sftpupload: (id, remotePath, buffer) => {
    return ipcRenderer.invoke('sftp-upload', id, remotePath, buffer);
  },
  sftpdownload: (id, remotePath) => {
    return ipcRenderer.invoke('sftp-download', id, remotePath);
  },
  sftpchmod: (id, remotePath, mode) => {
    return ipcRenderer.invoke('sftp-chmod', id, remotePath, mode);
  },
  sftpdisconnect: (id) => {
    return ipcRenderer.invoke('sftp-disconnect', id);
  },
  toggledevtools: () => {
    return ipcRenderer.invoke('toggle-devtools');
  },
  discordrpcconnect: () => {
    return ipcRenderer.invoke('discord-rpc-connect');
  },
  discordrpcdisconnect: () => {
    return ipcRenderer.invoke('discord-rpc-disconnect');
  },
  discordrpcsetactivity: (activity) => {
    return ipcRenderer.invoke('discord-rpc-set-activity', activity);
  },
  monitorstart: (servers, tick, alerts) => {
    return ipcRenderer.invoke('monitor-start', servers, tick, alerts);
  },
  monitorstop: () => {
    return ipcRenderer.invoke('monitor-stop');
  },
  monitorstatus: () => {
    return ipcRenderer.invoke('monitor-status');
  },
  checkvps: (host, port) => {
    return ipcRenderer.invoke('checkvps', host, port);
  },
  sshping: (host, port) => {
    return ipcRenderer.invoke('sshping', host, port);
  },
  onserverstatus: (callback) => {
    return ipcRenderer.on('server-status', (event, data) => callback(data));
  },
  cryptoencrypt: (plaintext) => {
    return ipcRenderer.invoke('crypto-encrypt', plaintext);
  },
  cryptodecrypt: (data) => {
    return ipcRenderer.invoke('crypto-decrypt', data);
  },
  plugindir: () => {
    return ipcRenderer.invoke('plugin-dir');
  },
  pluginlist: () => {
    return ipcRenderer.invoke('plugin-list');
  },
  pluginreadmanifest: (folder) => {
    return ipcRenderer.invoke('plugin-read-manifest', folder);
  },
  pluginreadentry: (folder, entry) => {
    return ipcRenderer.invoke('plugin-read-entry', folder, entry);
  },
  sshopencmd: (config) => {
    return ipcRenderer.invoke('ssh-open-cmd', config);
  },
  sshcleanupkey: (keyPath) => {
    return ipcRenderer.invoke('ssh-cleanup-tempkey', keyPath);
  },
  scpcopy: (config, remotePath, localPath) => {
    return ipcRenderer.invoke('scp-copy-file', config, remotePath, localPath);
  },
  oncloudaction: (callback) => {
    ipcRenderer.on('cloud-action', (event, data) => callback(data));
  },
  winminimize: () => ipcRenderer.invoke('win-minimize'),
  winmaximize: () => ipcRenderer.invoke('win-maximize'),
  winclose: () => ipcRenderer.invoke('win-close'),
  winismaximized: () => ipcRenderer.invoke('win-is-maximized'),
});
