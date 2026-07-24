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

ipcRenderer.on('ssh-close', (event, id) => {
  sshCallbacks.close.forEach(c => c.cb(id));
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
  sshconnect: (config) => {
    return ipcRenderer.invoke('ssh-connect', config);
  },
  sshdata: (id, data) => {
    return ipcRenderer.invoke('ssh-data', id, data);
  },
  sshresize: (id, cols, rows) => {
    return ipcRenderer.invoke('ssh-resize', id, cols, rows);
  },
  sshdisconnect: (id) => {
    return ipcRenderer.invoke('ssh-disconnect', id);
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
  }
});
