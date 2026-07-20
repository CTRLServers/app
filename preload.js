const { contextBridge, ipcRenderer } = require('electron');

const wsCallbacks = { message: [], close: [], error: [] };
const sshCallbacks = { data: [], close: [] };

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
  sshCallbacks.data.forEach(cb => cb(id, data));
});

ipcRenderer.on('ssh-close', (event, id) => {
  sshCallbacks.close.forEach(cb => cb(id));
});

contextBridge.exposeInMainWorld('electronapi', {
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
    wsCallbacks.message.push(callback);
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
    sshCallbacks.data.push(callback);
  },
  offsshdata: (callback) => {
    const idx = sshCallbacks.data.indexOf(callback);
    if (idx !== -1) sshCallbacks.data.splice(idx, 1);
  },
  onsshclose: (callback) => {
    sshCallbacks.close.push(callback);
  },
  offsshclose: (callback) => {
    const idx = sshCallbacks.close.indexOf(callback);
    if (idx !== -1) sshCallbacks.close.splice(idx, 1);
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
  }
});
