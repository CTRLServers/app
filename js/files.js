const ServerFiles = {
  currentPath: '/',
  files: [],
  filteredFiles: [],
  editor: null,
  _editingPath: null,
  _editingName: null,
  _saving: false,
  selected: new Set(),
  _searchQuery: '',
  _filterTab: 'all',
  _sortBy: 'name',
  _sortDir: 'asc',
  viewMode: localStorage.getItem('filesViewMode') || 'normal',
  _ideTreeCache: new Map(),
  _ideExpanded: new Set(['/']),
  _ideTabs: [],
  _activeIdeTab: null,
  _ideServerKey: null,
  _permissions: [],
  _permissionkey: null,
  _permissionpromise: Promise.resolve(),
  _filesystemwritable: true,
  _loadid: 0,
  _newcontext: null,
  _creatingfile: null,
  _pullresult: null,
  _uploadcontext: null,
  _uploadconflicts: [],
  _uploadconflictsresolved: false,
  _operations: new Map(),
  _finishedoperations: new Map(),
  _operationserverkey: null,

  ARCHIVE_EXTS: ['.tar', '.gz', '.7z', '.zip', '.rar', '.tgz', '.bz2', '.xz', '.zst', '.lz4', '.lzh', '.lha', '.nrg', '.ace', '.wad', '.kdk'],
  IMAGE_EXTS: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp', '.ico', '.tiff', '.tga', '.pcx', '.msp'],
  VIDEO_EXTS: ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv', '.flv', '.wmv', '.m4v', '.3gp'],
  AUDIO_EXTS: ['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.wma', '.opus', '.aiff'],
  BINARY_EXTS: ['.exe', '.bin', '.dll', '.so', '.dylib', '.dat', '.iso', '.img', '.rom', '.nes', '.smc', '.sfc', '.gba', '.nds', '.psd', '.ai', '.sketch'],

  MODE_MAP: {
    '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript', '.jsx': 'javascript',
    '.ts': 'typescript', '.tsx': 'typescript',
    '.py': 'python', '.pyw': 'python',
    '.html': 'htmlmixed', '.htm': 'htmlmixed', '.vue': 'vue', '.pug': 'pug',
    '.css': 'css', '.scss': 'sass', '.sass': 'sass', '.less': 'css',
    '.json': { name: 'javascript', json: true },
    '.xml': 'xml',
    '.md': 'gfm', '.markdown': 'gfm', '.mdx': 'gfm',
    '.yaml': 'yaml', '.yml': 'yaml',
    '.c': 'text/x-csrc', '.h': 'text/x-csrc',
    '.cpp': 'text/x-c++src', '.cxx': 'text/x-c++src', '.cc': 'text/x-c++src', '.hpp': 'text/x-c++src',
    '.cs': 'text/x-csharp',
    '.java': 'text/x-java',
    '.go': 'go',
    '.lua': 'lua',
    '.php': 'php',
    '.rb': 'ruby',
    '.sh': 'shell', '.bash': 'shell', '.zsh': 'shell', '.fish': 'shell',
    '.sql': 'text/x-sql',
    '.cql': 'text/x-sql',
    '.diff': 'diff',
    '.dockerfile': 'dockerfile', 'Dockerfile': 'dockerfile',
    '.toml': 'toml',
    '.ini': 'properties', '.properties': 'properties',
    '.conf': 'properties',
    '.txt': 'null',
    '.rs': 'rust',
    '.kt': 'kotlin', '.kts': 'kotlin',
    '.swift': 'swift',
    '.r': 'r', '.R': 'r',
    '.dart': 'dart',
    '.ex': 'elixir', '.exs': 'elixir',
    '.erl': 'erlang',
    '.hs': 'haskell',
    '.ml': 'text/x-ocaml', '.mli': 'text/x-ocaml',
    '.scala': 'scala',
    '.elm': 'elm',
    '.nginx': 'properties', 'nginx.conf': 'properties',
  },

  TEXT_MODES: new Set([
    'javascript', 'typescript', 'python', 'htmlmixed', 'xml', 'css', 'sass',
    'gfm', 'yaml', 'text/x-csrc', 'text/x-c++src', 'text/x-csharp',
    'text/x-java', 'go', 'lua', 'php', 'ruby', 'shell', 'text/x-sql',
    'diff', 'dockerfile', 'toml', 'properties', 'null', 'vue', 'pug',
    'rust', 'kotlin', 'swift', 'dart', 'elixir', 'erlang', 'haskell',
    'scala', 'elm', 'r',
  ]),

  init() {
    this.initupload();
    this.setview(this.viewMode, false);

    Utils.el('filesList').addEventListener('click', (e) => {
      if (e.target.closest('.file-checkbox')) return;
      const item = e.target.closest('.file-item');
      if (!item) return;
      const idx = parseInt(item.dataset.index);
      if (isNaN(idx) || !this.files[idx]) return;
      const f = this.files[idx];
      const isDir = this.isdirectory(f.attributes);
      if (isDir) {
        this.opendir(f.attributes.name);
      } else {
        const filePath = this.currentPath === '/' ? '/' + f.attributes.name : this.currentPath + '/' + f.attributes.name;
        this.openfile(filePath, f.attributes.name, f.attributes.size, f.attributes.mimetype || f.attributes.mime_type || '');
      }
    });

    Utils.el('filesBreadcrumb').addEventListener('click', (e) => {
      const item = e.target.closest('.breadcrumb-item') || e.target.closest('.breadcrumb-home');
      if (!item) return;
      const path = item.dataset.bcPath;
      if (path) this.load(path);
    });

    Utils.el('filesList').addEventListener('contextmenu', (e) => {
      if (e.target.closest('.file-checkbox')) return;
      const item = e.target.closest('.file-item');
      if (!item) return;
      e.preventDefault();
      e.stopPropagation();
      const idx = parseInt(item.dataset.index);
      if (isNaN(idx) || !this.files[idx]) return;
      const f = this.files[idx];
      const isDir = this.isdirectory(f.attributes);
      const isArc = this.isarchive(f.attributes.name);
      this.showcontextmenu(e.clientX, e.clientY, f, isDir, isArc);
    });

    Utils.el('filesIdeTree').addEventListener('click', (e) => {
      const row = e.target.closest('.files-tree-row');
      if (!row) return;
      const path = decodeURIComponent(row.dataset.path || '');
      if (row.dataset.directory === 'true') this.toggleidetreefolder(path);
      else this.openfile(path, row.dataset.name, Number(row.dataset.size || 0), row.dataset.mime || '');
    });

    Utils.el('fileEditorTabs').addEventListener('click', (e) => {
      const tab = e.target.closest('.file-editor-tab');
      if (!tab) return;
      const path = decodeURIComponent(tab.dataset.path || '');
      if (e.target.closest('.file-editor-tab-close')) this.closeidetab(path);
      else this.activateidetab(path);
    });

    document.addEventListener('click', () => {
      this.hidecontextmenu();
      document.querySelectorAll('.files-dropdown.open').forEach(menu => menu.classList.remove('open'));
    });
  },

  iscalagopus() {
    return App.currentServer?.type === 'Calagopus';
  },

  serverkey(server = App.currentServer) {
    return server ? `${server.type}|${server.panelUrl}|${server.uuid}` : '';
  },

  can(permission) {
    return this._permissions.includes('*') || this._permissions.includes(permission);
  },

  cancreate() {
    return !this.iscalagopus() || (this.can('files.create') && this._filesystemwritable);
  },

  async loadpermissions(server) {
    if (!server || server.type !== 'Calagopus') return;
    const key = this.serverkey(server);
    try {
      const apikey = await Servers.resolveapikey(server);
      const [detailresult, accountresult] = await Promise.allSettled([
        Api.fetchcalagopusserver(server.panelUrl, apikey, server.uuid),
        Api.fetchcalagopusaccount(server.panelUrl, apikey)
      ]);
      if (App.currentServer !== server || this._permissionkey !== key) return;
      if (detailresult.status === 'rejected') throw detailresult.reason;
      const account = accountresult.status === 'fulfilled' ? accountresult.value : null;
      const role = account?.role?.server_permissions || account?.role?.serverPermissions || [];
      this._permissions = [...new Set([...(detailresult.value.permissions || []), ...role])];
    } catch (error) {
      if (App.currentServer === server && this._permissionkey === key) this._permissions = [];
    }
  },

  async apicall(operation, ...args) {
    const s = App.currentServer;
    if (!s) throw new Error('No server selected');
    const apiKey = await Servers.resolveapikey(s);
    if (App.currentServer !== s) throw new Error('The selected server changed');
    if (s.type !== 'Calagopus') {
      if (operation === 'copyfile') return Api.copyfile(s.panelUrl, apiKey, s.uuid, args[args.length - 1]);
      return Api[operation](s.panelUrl, apiKey, s.uuid, ...args);
    }

    if (operation === 'listfiles') return Api.listcalagopusfiles(s.panelUrl, apiKey, s.uuid, ...args);
    if (operation === 'readfile') {
      return Api.calagopusfileaction(s.panelUrl, apiKey, s.uuid, 'contents', 'GET', null, `?file=${encodeURIComponent(args[0])}`);
    }
    if (operation === 'writefile') {
      return Api.calagopusfileaction(s.panelUrl, apiKey, s.uuid, 'write', 'POST', String(args[1] ?? ''), `?file=${encodeURIComponent(args[0])}`);
    }
    if (operation === 'createfolder') {
      return Api.calagopusfileaction(s.panelUrl, apiKey, s.uuid, 'create-directory', 'POST', { root: args[1] || '/', name: args[0] });
    }
    if (operation === 'createsymlink') {
      return Api.calagopusfileaction(s.panelUrl, apiKey, s.uuid, 'create-symlink', 'POST', { root: args[0] || '/', link: args[1], target: args[2] });
    }
    if (operation === 'querypull') {
      return Api.calagopusfileaction(s.panelUrl, apiKey, s.uuid, 'pull/query', 'POST', { url: args[0] });
    }
    if (operation === 'pullfile') {
      return Api.calagopusfileaction(s.panelUrl, apiKey, s.uuid, 'pull', 'POST', { root: args[0] || '/', url: args[1], name: args[2] || null });
    }
    if (operation === 'canceloperation') {
      return Api.calagopusfileaction(s.panelUrl, apiKey, s.uuid, `operations/${encodeURIComponent(args[0])}`, 'DELETE');
    }
    if (operation === 'uploadfiles') return Api.uploadcalagopusfiles(s.panelUrl, apiKey, s.uuid, ...args);
    if (operation === 'statfiles') {
      return Api.calagopusfileaction(s.panelUrl, apiKey, s.uuid, 'stat', 'POST', { root: args[0] || '/', files: args[1] || [] });
    }
    if (operation === 'renamefile') {
      return Api.calagopusfileaction(s.panelUrl, apiKey, s.uuid, 'rename', 'PUT', { root: args[0], files: [{ from: args[1], to: args[2] }] });
    }
    if (operation === 'copyfile') {
      return Api.calagopusfileaction(s.panelUrl, apiKey, s.uuid, 'copy', 'POST', {
        path: args[0], destination: args[1], overwrite: false
      });
    }
    if (operation === 'deletefiles') {
      return Api.calagopusfileaction(s.panelUrl, apiKey, s.uuid, 'delete', 'POST', { root: args[0], files: args[1] });
    }
    if (operation === 'compressfiles') {
      return Api.calagopusfileaction(s.panelUrl, apiKey, s.uuid, 'compress', 'POST', {
        root: args[0], files: args[1], name: null, format: 'zip'
      });
    }
    if (operation === 'decompressfile') {
      return Api.calagopusfileaction(s.panelUrl, apiKey, s.uuid, 'decompress', 'POST', { root: args[0], file: args[1] });
    }
    if (operation === 'changefilepermissions') {
      return Api.calagopusfileaction(s.panelUrl, apiKey, s.uuid, 'chmod', 'PUT', {
        root: args[0], files: [{ file: args[1], mode: args[2], recursive: false }]
      });
    }
    throw new Error(`Unsupported file operation: ${operation}`);
  },

  setview(mode, reload = true) {
    if (this.viewMode === 'ide' && mode !== 'ide') this.stashactiveidetab();
    this.viewMode = mode === 'ide' ? 'ide' : 'normal';
    localStorage.setItem('filesViewMode', this.viewMode);
    const container = Utils.el('filesContainer');
    if (container) container.classList.toggle('files-ide-view', this.viewMode === 'ide');
    document.querySelectorAll('.files-view-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === this.viewMode);
    });
    if (this.viewMode === 'ide') {
      this.currentPath = '/';
      const editor = Utils.el('editorContainer');
      if (editor && !this.editor && this._ideTabs.length) {
        const tab = this._ideTabs[this._ideTabs.length - 1];
        this.showeditor(tab.path, tab.name, tab.content, true);
      } else if (editor && !this.editor) {
        editor.style.display = 'flex';
        Utils.el('editorHeader').style.display = 'none';
        Utils.el('editorWrapper').innerHTML = '<div class="files-ide-empty"><strong>Select a file to edit</strong><span>Browse the server tree on the left.</span></div>';
      }
    } else if (!this.editor) {
      Utils.el('editorContainer').style.display = 'none';
    }
    if (reload && App.currentServerPage === 'files') this.load(this.viewMode === 'ide' ? '/' : this.currentPath);
  },

  async toggleidetreefolder(path) {
    if (this._ideExpanded.has(path)) {
      if (path !== '/') this._ideExpanded.delete(path);
      this.renderidetree();
      return;
    }
    this._ideExpanded.add(path);
    if (!this._ideTreeCache.has(path)) {
      this.renderidetree();
      try {
        const files = await this.apicall('listfiles', path);
        this._ideTreeCache.set(path, this.sorttreefiles(files));
      } catch (e) {
        this._ideExpanded.delete(path);
        this.showtoast(`Failed to open folder: ${e.message}`, 'error');
      }
    }
    this.renderidetree();
  },

  sorttreefiles(files) {
    return [...files].sort((a, b) => {
      const ad = this.isdirectory(a.attributes);
      const bd = this.isdirectory(b.attributes);
      if (ad !== bd) return ad ? -1 : 1;
      return a.attributes.name.localeCompare(b.attributes.name);
    });
  },

  renderidetree() {
    const tree = Utils.el('filesIdeTree');
    if (!tree || this.viewMode !== 'ide') return;
    const rows = [];
    const renderDirectory = (path, depth) => {
      const entries = this._ideTreeCache.get(path);
      if (!entries) {
        rows.push(`<div class="files-tree-loading" style="padding-left:${14 + depth * 16}px">Loading...</div>`);
        return;
      }
      entries.forEach(file => {
        const a = file.attributes;
        const isDir = this.isdirectory(a);
        const filePath = path === '/' ? `/${a.name}` : `${path}/${a.name}`;
        const expanded = isDir && this._ideExpanded.has(filePath);
        rows.push(`<div class="files-tree-row${isDir ? ' is-directory' : ''}${this._editingPath === filePath ? ' active' : ''}" data-path="${encodeURIComponent(filePath)}" data-name="${Utils.escape(a.name)}" data-size="${a.size || 0}" data-mime="${Utils.escape(a.mimetype || '')}" data-directory="${isDir}" style="padding-left:${8 + depth * 16}px">
          <span class="files-tree-chevron">${isDir ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m${expanded ? '6 9 6 6 6-6' : '9 18 6-6-6-6'}"/></svg>` : ''}</span>
          <span class="files-tree-icon">${this.geticon(a.name, isDir, !!a.is_symlink)}</span>
          <span class="files-tree-name">${Utils.escape(a.name)}</span>
        </div>`);
        if (isDir && expanded) renderDirectory(filePath, depth + 1);
      });
    };
    renderDirectory('/', 0);
    tree.innerHTML = rows.join('') || '<div class="files-tree-loading">This directory is empty</div>';
  },

  toggledropdown(id, event) {
    event.stopPropagation();
    document.querySelectorAll('.files-dropdown.open').forEach(menu => {
      if (menu.id !== id) menu.classList.remove('open');
    });
    Utils.el(id)?.classList.toggle('open');
  },

  openvscode() {
    const s = App.currentServer;
    if (!s || s.type !== 'Calagopus') return;
    const file = this._editingPath ? `&file=${encodeURIComponent(this._editingPath)}` : '';
    const origin = new URL(s.panelUrl).origin;
    const url = `vscode://calagopus.calagopus/open?origin=${encodeURIComponent(origin)}&server=${encodeURIComponent(s.uuid)}&console=1${file}`;
    window.electronAPI.openexternal(url);
  },

  launchsftp() {
    if (!this._sftpUrl) return;
    window.electronAPI.openexternal(this._sftpUrl);
    Modal.close();
  },

  async opensftp() {
    const s = App.currentServer;
    if (!s || s.type !== 'Calagopus') return;
    try {
      const apiKey = await Servers.resolveapikey(s);
      const [details, account] = await Promise.all([
        Api.fetchcalagopusserver(s.panelUrl, apiKey, s.uuid),
        Api.fetchcalagopusaccount(s.panelUrl, apiKey)
      ]);
      const username = `${account.username}.${details.uuid_short || s.uuid.slice(0, 8)}`;
      const host = details.sftp_host || new URL(s.panelUrl).hostname;
      const port = details.sftp_port || 2022;
      const url = `sftp://${encodeURIComponent(username)}@${host}:${port}`;
      this._sftpUrl = url;
      Modal.open('Connect via SFTP', `
        <div class="sftp-connect-details">
          <div><span>Host</span><strong>${Utils.escape(host)}</strong></div>
          <div><span>Port</span><strong>${port}</strong></div>
          <div><span>Username</span><strong>${Utils.escape(username)}</strong></div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="Modal.close()">Close</button>
          <button class="btn btn-primary" onclick="ServerFiles.launchsftp()">Open SFTP Client</button>
        </div>`);
    } catch (e) {
      this.showtoast(`Failed to load SFTP details: ${e.message}`, 'error');
    }
  },

  isarchive(name) {
    return this.ARCHIVE_EXTS.some(ext => name.toLowerCase().endsWith(ext));
  },
  isimage(name) {
    return this.IMAGE_EXTS.some(ext => name.toLowerCase().endsWith(ext));
  },
  isvideo(name) {
    return this.VIDEO_EXTS.some(ext => name.toLowerCase().endsWith(ext));
  },
  isaudio(name) {
    return this.AUDIO_EXTS.some(ext => name.toLowerCase().endsWith(ext));
  },
  isbinary(name) {
    return this.BINARY_EXTS.some(ext => name.toLowerCase().endsWith(ext));
  },

  isdirectory(attributes) {
    if (typeof attributes?.is_directory === 'boolean') return attributes.is_directory;
    return attributes?.mimetype === 'inode/directory' || !attributes?.is_file;
  },

  istextfile(name, size, mimetype = '') {
    if (size && size > 5 * 1024 * 1024) return false;
    if (this.isimage(name) || this.isvideo(name) || this.isaudio(name) || this.isarchive(name)) return false;
    const mime = String(mimetype || '').toLowerCase();
    if (mime.startsWith('image/') || mime.startsWith('video/') || mime.startsWith('audio/')) return false;
    if (mime.startsWith('text/') || /json|xml|yaml|javascript|shell|toml|ini|config/.test(mime)) return true;
    const ext = this.getext(name);
    if (ext in this.MODE_MAP || name === 'Dockerfile' || name === 'Makefile' || name === 'Jenkinsfile') return true;
    if (name.startsWith('.') && !name.slice(1).includes('.')) return true;
    return !this.isbinary(name);
  },

  getext(name) {
    const idx = name.lastIndexOf('.');
    return idx > 0 ? name.slice(idx).toLowerCase() : '';
  },

  getmode(name) {
    if (name === 'Dockerfile' || name === 'Makefile' || name === 'Jenkinsfile') return 'dockerfile';
    const ext = this.getext(name);
    return this.MODE_MAP[ext] || 'null';
  },

  getdownloadurl(path) {
    const s = App.currentServer;
    if (!s) return '';
    return `${s.panelUrl.replace(/\/+$/, '')}/api/client/servers/${s.uuid}/files/download?file=${encodeURIComponent(path)}`;
  },

  async fetchasblob(path) {
    const s = App.currentServer;
    if (!s) return '';
    const apiKey = await Servers.resolveapikey(s);
    let url = this.getdownloadurl(path);
    let headers = { 'Authorization': 'Bearer ' + apiKey, 'Accept': 'application/vnd.pterodactyl.v1+json' };
    if (this.iscalagopus()) {
      const root = path.substring(0, path.lastIndexOf('/')) || '/';
      const name = path.split('/').pop();
      const params = new URLSearchParams({ root, files: name, directory: 'false', archive_format: 'zip' });
      url = `${s.panelUrl.replace(/\/+$/, '')}/api/client/servers/${s.uuid}/files/download?${params}`;
      headers = Api.calagopusheaders(apiKey);
    }
    const res = await fetch(url, {
      headers,
      redirect: 'follow'
    });
    if (!res.ok) throw new Error('Download failed: ' + res.status);
    const ct = res.headers.get('content-type') || '';

    if (ct.includes('application/json')) {
      const json = await res.json();
      const signedUrl = json.url || (json.attributes && json.attributes.url);
      if (!signedUrl) throw new Error('No signed URL');
      const fileRes = await fetch(signedUrl);
      if (!fileRes.ok) throw new Error('File download failed');
      const fileCt = fileRes.headers.get('content-type') || 'application/octet-stream';
      const buf = await fileRes.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      return `data:${fileCt};base64,${btoa(binary)}`;
    }

    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return `data:${ct};base64,${btoa(binary)}`;
  },

  async load(path) {
    const loadid = ++this._loadid;
    this.currentPath = path || '/';
    this.selected.clear();
    this._searchQuery = '';
    if (Utils.el('filesSearchInput')) Utils.el('filesSearchInput').value = '';
    this.updatemassbar();
    const s = App.currentServer;
    if (!s || !['Pterodactyl', 'Calagopus'].includes(s.type)) return;
    document.querySelectorAll('.calagopus-files-only').forEach(el => {
      el.style.display = s.type === 'Calagopus' ? '' : 'none';
    });
    document.querySelectorAll('.pterodactyl-files-only').forEach(el => {
      el.style.display = s.type === 'Calagopus' ? 'none' : '';
    });
    const serverkey = this.serverkey(s);
    if (this._permissionkey !== serverkey) {
      this._permissionkey = serverkey;
      this._permissions = [];
      this._filesystemwritable = s.type !== 'Calagopus';
      this._permissionpromise = s.type === 'Calagopus' ? this.loadpermissions(s) : Promise.resolve();
    }
    if (this._operationserverkey !== serverkey) {
      this._operationserverkey = serverkey;
      this._operations.clear();
      this._finishedoperations.clear();
    }
    this.updatenewmenu();
    this.renderoperations();
    if (this._ideServerKey !== serverkey) {
      this._ideServerKey = serverkey;
      this._ideTreeCache.clear();
      this._ideExpanded = new Set(['/']);
      this._ideTabs = [];
      this._activeIdeTab = null;
      this.closeeditor();
    } else if (this.viewMode !== 'ide') {
      this.closeeditor();
    }
    try {
      const files = await this.apicall('listfiles', this.currentPath);
      await this._permissionpromise;
      if (App.currentServer !== s || loadid !== this._loadid) return;
      this.files = files;
      if (s.type === 'Calagopus') this._filesystemwritable = files.filesystemwritable !== false;
      this.updatenewmenu();
      this.files.sort((a, b) => {
        const aDir = this.isdirectory(a.attributes);
        const bDir = this.isdirectory(b.attributes);
        if (aDir !== bDir) return aDir ? -1 : 1;
        return a.attributes.name.localeCompare(b.attributes.name);
      });
      if (this.viewMode === 'ide') this._ideTreeCache.set(this.currentPath, this.sorttreefiles(this.files));
      this.render();
    } catch (e) {
      if (App.currentServer !== s || loadid !== this._loadid) return;
      Utils.el('filesList').innerHTML = `<div class="files-empty">Failed to load: ${Utils.escape(e.message)}</div>`;
    }
  },

  updatenewmenu() {
    const wrap = Utils.el('files-new-wrap');
    if (!wrap) return;
    wrap.style.display = this.iscalagopus() && !this.cancreate() ? 'none' : '';
  },

  render() {
    this.renderbreadcrumb();
    const list = Utils.el('filesList');
    if (this.viewMode === 'ide') this.renderidetree();

    this.filteredFiles = this.files.filter(f => {
      if (this._searchQuery) {
        const q = this._searchQuery.toLowerCase();
        if (!f.attributes.name.toLowerCase().includes(q)) return false;
      }
      if (this._filterTab === 'files') {
        return !this.isdirectory(f.attributes);
      }
      if (this._filterTab === 'folders') {
        return this.isdirectory(f.attributes);
      }
      return true;
    });

    const sorted = [...this.filteredFiles].sort((a, b) => {
      const aDir = this.isdirectory(a.attributes);
      const bDir = this.isdirectory(b.attributes);
      if (aDir !== bDir) return aDir ? -1 : 1;
      let cmp = 0;
      if (this._sortBy === 'name') {
        cmp = a.attributes.name.localeCompare(b.attributes.name);
      } else if (this._sortBy === 'size') {
        cmp = (a.attributes.size || 0) - (b.attributes.size || 0);
      } else if (this._sortBy === 'date') {
        cmp = new Date(a.attributes.modified_at || 0) - new Date(b.attributes.modified_at || 0);
      }
      return this._sortDir === 'asc' ? cmp : -cmp;
    });

    this.filteredFiles = sorted;

    if (!sorted.length) {
      list.innerHTML = '<div class="files-empty">' + (this.files.length ? 'No matching files' : 'This directory is empty') + '</div>';
      this.updateinfocards();
      return;
    }

    list.innerHTML = sorted.map((f, i) => {
      const a = f.attributes;
      const isDir = this.isdirectory(a);
      const name = a.name;
      const icon = this.geticon(name, isDir, !!a.is_symlink);
      const size = !isDir ? this.formatsize(a.size) : '-';
      const modified = a.modified_at ? this.formatdatetime(a.modified_at) : '-';
      const realIdx = this.files.indexOf(f);

      return `<div class="file-item${isDir ? ' is-dir' : ''}${this.selected.has(realIdx) ? ' selected' : ''}" data-index="${realIdx}">
        <label class="file-checkbox" onclick="event.stopPropagation()">
          <input type="checkbox" ${this.selected.has(realIdx) ? 'checked' : ''} onchange="ServerFiles.toggleselect(${realIdx}, this.checked)" />
          <span class="file-checkbox-mark"></span>
        </label>
        <div class="file-info">
          <div class="file-icon">${icon}</div>
          <div class="file-name">${Utils.escape(name)}</div>
        </div>
        <div class="file-size">${size}</div>
        <div class="file-date">${modified}</div>
        <button class="file-menu-btn" onclick="event.stopPropagation(); ServerFiles.showmenufor(event, ${realIdx})" title="Actions">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
        </button>
      </div>`;
    }).join('');

    this.updateinfocards();
  },

  geticon(name, isDir, issymlink = false) {
    if (issymlink) return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/></svg>`;
    if (isDir) return `<svg width="18" height="18" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
    if (this.isimage(name)) return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
    if (this.isvideo(name)) return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>`;
    if (this.isaudio(name)) return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
    if (this.isarchive(name)) return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></svg>`;
    if (this.isbinary(name)) return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/></svg>`;
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
  },

  renderbreadcrumb() {
    const bc = Utils.el('filesBreadcrumb');
    const parts = this.currentPath.split('/').filter(Boolean);
    let html = `<span class="breadcrumb-home" data-bc-path="/" title="Root">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
    </span>`;
    let acc = '';
    parts.forEach((p, i) => {
      acc += '/' + p;
      const isLast = i === parts.length - 1;
      html += `<span class="breadcrumb-sep">/</span><span class="breadcrumb-item${isLast ? ' active' : ''}" data-bc-path="${Utils.escape(acc)}">${Utils.escape(p)}</span>`;
    });
    bc.innerHTML = html;
  },

  opendir(name) {
    if (name === '/') {
      this.load('/');
    } else {
      const path = this.currentPath === '/' ? '/' + name : this.currentPath + '/' + name;
      this.load(path);
    }
  },

  async openfile(path, name, size, mimetype = '') {
    const s = App.currentServer;
    if (!s) return;
    if (this.viewMode === 'ide' && this._ideTabs.some(tab => tab.path === path)) {
      this.activateidetab(path);
      return;
    }

    if (this.isimage(name)) {
      try {
        const blobUrl = await this.fetchasblob(path);
        Modal.open(name, `
          <div class="file-preview">
            <img src="${blobUrl}" alt="${Utils.escape(name)}" style="max-width:100%;max-height:60vh;border-radius:var(--radius-sm);" />
          </div>
          <div class="modal-actions">
            <button class="btn btn-secondary" onclick="Modal.close()">Close</button>
          </div>
        `);
      } catch (e) {
        Modal.open(name, `<div class="file-preview" style="padding:32px 0;text-align:center;color:var(--text-muted);">Failed to load image</div><div class="modal-actions"><button class="btn btn-secondary" onclick="Modal.close()">Close</button></div>`);
      }
      return;
    }

    if (this.isvideo(name) || this.isaudio(name)) {
      const label = this.isvideo(name) ? 'Video file' : 'Audio file';
      Modal.open(name, `
        <div class="file-preview" style="text-align:center;padding:32px 0;">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" style="margin-bottom:16px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          <div style="color:var(--text-muted);margin-bottom:8px;">${label}</div>
          <div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;">${Utils.escape(name)} (${this.formatsize(size)})</div>
          <button class="btn btn-primary" onclick="ServerFiles.downloadfile('${Utils.escape(path)}', '${Utils.escape(name)}')">Download</button>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="Modal.close()">Close</button>
        </div>
      `);
      return;
    }

    if (this.isarchive(name) || this.isbinary(name)) {
      const label = this.isbinary(name) ? 'Executable / Binary file' : 'Archive file';
      Modal.open(name, `
        <div class="file-preview" style="text-align:center;padding:32px 0;">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" style="margin-bottom:16px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          <div style="color:var(--text-muted);margin-bottom:8px;">${label}</div>
          <div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;">${Utils.escape(name)} (${this.formatsize(size)})</div>
          <button class="btn btn-primary" onclick="ServerFiles.downloadfile('${Utils.escape(path)}', '${Utils.escape(name)}')">Download</button>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="Modal.close()">Close</button>
        </div>
      `);
      return;
    }

    if (this.istextfile(name, size, mimetype)) {
      const apiKey = await Servers.resolveapikey(s);
      try {
        const content = await this.apicall('readfile', path);
        this.showeditor(path, name, content);
      } catch (e) {
        Modal.open(name, `
          <div class="file-preview" style="text-align:center;padding:32px 0;">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" style="margin-bottom:16px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <div style="color:var(--text-muted);">Cannot read this file</div>
          </div>
          <div class="modal-actions">
            <button class="btn btn-secondary" onclick="Modal.close()">Close</button>
          </div>
        `);
      }
      return;
    }

    Modal.open(name, `
      <div class="file-preview" style="text-align:center;padding:32px 0;">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" style="margin-bottom:16px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <div style="color:var(--text-muted);margin-bottom:8px;">Binary file</div>
        <div style="font-size:13px;color:var(--text-secondary);">${Utils.escape(name)}</div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">Close</button>
      </div>
    `);
  },

  stashactiveidetab() {
    if (this.viewMode !== 'ide' || !this.editor || !this._activeIdeTab) return;
    const tab = this._ideTabs.find(item => item.path === this._activeIdeTab);
    if (tab) tab.content = this.editor.getValue();
  },

  renderidetabs() {
    const container = Utils.el('fileEditorTabs');
    if (!container) return;
    container.innerHTML = this._ideTabs.map(tab => `
      <button class="file-editor-tab${tab.path === this._activeIdeTab ? ' active' : ''}" data-path="${encodeURIComponent(tab.path)}" title="${Utils.escape(tab.path)}">
        <span class="file-editor-tab-name">${Utils.escape(tab.name)}</span>
        ${tab.dirty ? '<span class="file-editor-tab-dirty" title="Unsaved changes"></span>' : ''}
        <span class="file-editor-tab-close" title="Close">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </span>
      </button>`).join('');
  },

  activateidetab(path) {
    const tab = this._ideTabs.find(item => item.path === path);
    if (!tab) return;
    this.stashactiveidetab();
    this.showeditor(tab.path, tab.name, tab.content, true);
  },

  closeidetab(path, force = false) {
    this.stashactiveidetab();
    const index = this._ideTabs.findIndex(tab => tab.path === path);
    if (index < 0) return;
    if (this._ideTabs[index].dirty && !force) {
      this._pendingCloseIdeTab = path;
      Modal.open('Unsaved Changes', `
        <div class="modal-text">Close <strong>${Utils.escape(this._ideTabs[index].name)}</strong> without saving?</div>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
          <button class="btn btn-danger" onclick="ServerFiles.confirmcloseidetab()">Discard Changes</button>
        </div>`);
      return;
    }
    const wasActive = this._activeIdeTab === path;
    if (this._creatingfile?.path === path) this._creatingfile = null;
    this._ideTabs.splice(index, 1);
    if (wasActive) {
      const next = this._ideTabs[Math.min(index, this._ideTabs.length - 1)];
      this._activeIdeTab = null;
      if (next) this.showeditor(next.path, next.name, next.content, true);
      else this.closeeditor();
    } else {
      this.renderidetabs();
    }
  },

  confirmcloseidetab() {
    const path = this._pendingCloseIdeTab;
    this._pendingCloseIdeTab = null;
    Modal.close();
    if (path) this.closeidetab(path, true);
  },

  backfromeditor() {
    if (this.viewMode === 'ide' && this._activeIdeTab) this.closeidetab(this._activeIdeTab);
    else this.closeeditor();
  },

  showeditor(path, name, content, fromIdeTab = false) {
    if (this.viewMode === 'ide') {
      this.stashactiveidetab();
      let tab = this._ideTabs.find(item => item.path === path);
      if (!tab) {
        tab = { path, name, content, dirty: false };
        this._ideTabs.push(tab);
      } else if (!fromIdeTab && !tab.dirty) {
        tab.content = content;
      }
      this._activeIdeTab = path;
    }
    this._editingPath = path;
    this._editingName = name;
    this._saving = false;

    if (this.viewMode !== 'ide') {
      Utils.el('filesBrowserPane').style.display = 'none';
      Utils.el('filesActions').style.display = 'none';
    }
    if (this._creatingfile?.path === path) this.editorbreadcrumb(this._creatingfile.directory, name);
    else this.editorbreadcrumb(path);

    Utils.el('editorContainer').style.display = 'flex';
    Utils.el('editorHeader').style.display = 'flex';
    Utils.el('editorFilename').textContent = name;
    this.renderidetabs();

    const wrapper = Utils.el('editorWrapper');
    wrapper.innerHTML = '';

    const mode = this.getmode(name);
    const isText = this.TEXT_MODES.has(typeof mode === 'string' ? mode : mode.name);

    if (!isText && mode !== 'null') {
      wrapper.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;color:var(--text-muted);">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <div>Cannot preview this file type</div>
      </div>`;
      return;
    }

    const theme = (document.documentElement.getAttribute('data-theme') === 'dark' || document.documentElement.getAttribute('data-theme') === 'oled') ? 'material-darker' : 'default';

    this.editor = CodeMirror(wrapper, {
      value: content,
      mode: mode,
      theme: theme,
      lineNumbers: true,
      lineWrapping: false,
      matchBrackets: true,
      autoCloseBrackets: true,
      autoCloseTags: true,
      foldGutter: true,
      gutters: ['CodeMirror-linenumber', 'CodeMirror-foldgutter'],
      styleActiveLine: true,
      indentUnit: 2,
      tabSize: 2,
      indentWithTabs: false,
      extraKeys: {
        'Ctrl-Space': (cm) => this.autocomplete(cm),
        'Cmd-Space': (cm) => this.autocomplete(cm),
        'Ctrl-S': () => this.savefile(),
        'Cmd-S': () => this.savefile(),
        'Ctrl-/': (cm) => cm.toggleComment(),
        'Cmd-/': (cm) => cm.toggleComment(),
      },
    });

    this.editor.setSize('100%', '100%');

    const savingoverlay = document.createElement('div');
    savingoverlay.id = 'fileEditorSaving';
    savingoverlay.className = 'file-editor-saving';
    savingoverlay.setAttribute('role', 'status');
    savingoverlay.setAttribute('aria-label', 'Saving file');
    savingoverlay.setAttribute('aria-hidden', 'true');
    savingoverlay.innerHTML = '<span class="spinner" aria-hidden="true"></span>';
    wrapper.appendChild(savingoverlay);

    this.editor.on('inputRead', (cm, change) => {
      if (change.text[0] && /[a-zA-Z_.]/.test(change.text[0])) {
        clearTimeout(this._autocompleteTimer);
        this._autocompleteTimer = setTimeout(() => this.autocomplete(cm), 400);
      }
    });

    this.editor.on('change', () => {
      if (this.viewMode !== 'ide' || !this._activeIdeTab) return;
      const tab = this._ideTabs.find(item => item.path === this._activeIdeTab);
      if (tab && !tab.dirty) {
        tab.dirty = true;
        this.renderidetabs();
      }
    });

    this.renderidetree();
    setTimeout(() => this.editor.refresh(), 10);
  },

  closeeditor() {
    const closingpath = this._editingPath;
    if (this.editor) {
      this.editor.getWrapperElement().remove();
      this.editor = null;
    }
    if (this._creatingfile?.path === closingpath) this._creatingfile = null;
    this._editingPath = null;
    this._editingName = null;

    if (this.viewMode === 'ide') {
      Utils.el('editorContainer').style.display = 'flex';
      Utils.el('editorHeader').style.display = 'none';
      Utils.el('editorWrapper').innerHTML = '<div class="files-ide-empty"><strong>Select a file to edit</strong><span>Browse the server tree on the left.</span></div>';
      this._activeIdeTab = null;
      this.renderidetabs();
    } else {
      Utils.el('editorContainer').style.display = 'none';
    }
    Utils.el('filesBrowserPane').style.display = '';
    Utils.el('filesActions').style.display = '';
    Utils.el('filesBreadcrumb').style.pointerEvents = '';
    if (this.viewMode === 'ide') this.renderbreadcrumb();
    else this.render();
  },

  autocomplete(cm) {
    const cur = cm.getCursor();
    const token = cm.getTokenAt(cur);
    const line = cm.getLine(cur.line);
    const before = line.slice(0, cur.ch);

    if (token.string.trim().length < 1) return;

    CodeMirror.showHint(cm, CodeMirror.hint.anyword, { completeSingle: false });
  },

  async savefile() {
    if (!this.editor || !this._editingPath || this._saving) return;
    if (this._creatingfile?.path === this._editingPath) {
      this.namecreatedfile();
      return;
    }
    const s = App.currentServer;
    if (!s) return;
    const path = this._editingPath;
    const content = this.editor.getValue();
    this.setsaving(true);
    try {
      const apiKey = await Servers.resolveapikey(s);
      await this.apicall('writefile', path, content);
      const tab = this._ideTabs.find(item => item.path === path);
      if (tab) {
        tab.content = content;
        tab.dirty = false;
        this.renderidetabs();
      }
      this.showtoast('File updated successfully.');
    } catch (e) {
      this.showtoast(e?.message ? `Failed to update file: ${e.message}` : 'Failed to update file.', 'error');
    } finally {
      this.setsaving(false);
    }
  },

  setsaving(saving) {
    this._saving = saving;
    const overlay = Utils.el('fileEditorSaving');
    if (overlay) {
      overlay.classList.toggle('visible', saving);
      overlay.setAttribute('aria-hidden', saving ? 'false' : 'true');
    }
    const button = Utils.el('fileEditorSave');
    if (button) button.disabled = saving;
    if (this.editor) this.editor.setOption('readOnly', saving ? 'nocursor' : false);
  },

  showtoast(message, type = 'success') {
    document.querySelector('.file-toast')?.remove();
    const toast = document.createElement('div');
    toast.className = `toast file-toast file-toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },

  normalizepath(value) {
    const parts = String(value || '').replace(/\\/g, '/').split('/');
    const output = [];
    parts.forEach(part => {
      if (!part || part === '.') return;
      if (part === '..') output.pop();
      else output.push(part);
    });
    return '/' + output.join('/');
  },

  joinpath(root, name) {
    return this.normalizepath(`${root || '/'}/${name || ''}`);
  },

  containerpath(path) {
    const normalized = this.normalizepath(path);
    return `/home/container${normalized === '/' ? '/' : normalized}`;
  },

  contextvalid(context = this._newcontext) {
    return !!context && this.serverkey(App.currentServer) === context.key;
  },

  setmodalerror(message = '') {
    const element = Utils.el('files-new-error');
    if (!element) return;
    element.textContent = message;
    element.style.display = message ? 'block' : 'none';
  },

  setbuttonloading(id, loading, label) {
    const button = Utils.el(id);
    if (!button) return;
    button.disabled = loading;
    button.dataset.label = button.dataset.label || label || button.textContent;
    button.innerHTML = loading ? '<span class="spinner spinner-sm"></span>' : Utils.escape(button.dataset.label);
  },

  validname(value, maximum = 255) {
    const length = String(value || '').length;
    return length >= 1 && length <= maximum;
  },

  editorbreadcrumb(path, name = '') {
    const breadcrumb = Utils.el('filesBreadcrumb');
    const shownpath = name ? this.joinpath(path, name) : path;
    breadcrumb.innerHTML = `<span style="font-size:13px;color:var(--text-muted);">/</span>${shownpath.split('/').filter(Boolean).map(part => `<span class="breadcrumb-sep">/</span><span style="font-size:13px;">${Utils.escape(part)}</span>`).join('')}`;
    breadcrumb.style.pointerEvents = 'none';
  },

  async refreshfiledirectory(directory) {
    const server = App.currentServer;
    const key = this.serverkey(server);
    try {
      const files = await this.apicall('listfiles', directory);
      if (this.serverkey(App.currentServer) !== key) return;
      const sorted = this.sorttreefiles(files);
      this._ideTreeCache.set(directory, sorted);
      if (this.currentPath === directory) this.files = sorted;
      if (this.viewMode === 'ide') this.renderidetree();
      else if (!this.editor && this.currentPath === directory) this.render();
    } catch (error) {
      this.showtoast(`Failed to refresh files: ${error.message}`, 'error');
    }
  },

  createfolder() {
    const server = App.currentServer;
    if (!server) return;
    if (this.iscalagopus() && !this.cancreate()) return;
    this._newcontext = { server, directory: this.currentPath, key: this.serverkey(server) };
    const calagopus = server.type === 'Calagopus';
    Modal.open(calagopus ? 'Create Directory' : 'New Folder', `
      <div class="form-group">
        <label class="form-label">${calagopus ? 'Directory Name' : 'Folder Name'}</label>
        <input class="form-input" type="text" id="new-folder-name" maxlength="255" placeholder="my-folder" oninput="ServerFiles.updatedirectory()" />
      </div>
      ${calagopus ? '<div class="files-path-preview"><span>Created as</span><code id="directory-path-preview"></code></div>' : ''}
      <div class="files-new-error" id="files-new-error" style="display:none;"></div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" id="directory-create" onclick="ServerFiles.docreatefolder()" disabled>Create</button>
      </div>
    `);
    this.updatedirectory();
  },

  updatedirectory(clearerror = true) {
    const input = Utils.el('new-folder-name');
    const button = Utils.el('directory-create');
    if (!input || !button) return;
    button.disabled = !this.validname(input.value);
    const preview = Utils.el('directory-path-preview');
    if (preview) preview.textContent = this.containerpath(this.joinpath(this._newcontext?.directory, input.value));
    if (clearerror) this.setmodalerror();
  },

  async docreatefolder() {
    const name = Utils.el('new-folder-name')?.value.trim();
    const context = this._newcontext;
    if (!this.validname(name) || !this.contextvalid(context)) return;
    this.setbuttonloading('directory-create', true, 'Create');
    this.setmodalerror();
    try {
      await this.apicall('createfolder', name, context.directory);
      Modal.close();
      this.showtoast('Directory created successfully.');
      if (context.server.type === 'Calagopus') this.load(this.joinpath(context.directory, name));
      else this.load(context.directory);
    } catch (error) {
      this.setmodalerror(error.message || 'Failed to create directory.');
      this.showtoast(error.message || 'Failed to create directory.', 'error');
      this.setbuttonloading('directory-create', false, 'Create');
      this.updatedirectory(false);
    }
  },

  createfile() {
    const server = App.currentServer;
    if (!server) return;
    if (server.type === 'Calagopus') {
      if (!this.cancreate()) return;
      if (this._creatingfile && this.contextvalid(this._creatingfile)) {
        if (this.viewMode === 'ide') this.activateidetab(this._creatingfile.path);
        this.showtoast('Finish or close the current new file first.', 'error');
        return;
      }
      const context = { server, directory: this.currentPath, key: this.serverkey(server), path: `new:${Date.now()}` };
      this._newcontext = context;
      this._creatingfile = context;
      this.showeditor(context.path, 'New File', '');
      this.editorbreadcrumb(context.directory, 'New File');
      return;
    }
    Modal.open('New File', `
      <div class="form-group">
        <label class="form-label">File Name</label>
        <input class="form-input" type="text" id="newFileName" placeholder="file" />
      </div>
      <div class="form-group">
        <label class="form-label">Extension</label>
        <input class="form-input" type="text" id="newFileExt" placeholder="txt" />
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" onclick="ServerFiles.docreatefile()">Create</button>
      </div>
    `);
  },

  async docreatefile() {
    const name = Utils.el('newFileName').value.trim();
    const ext = Utils.el('newFileExt').value.trim();
    const s = App.currentServer;
    if (!name || !s) return;
    const apiKey = await Servers.resolveapikey(s);
    const file = ext ? `${name}.${ext}` : name;
    const path = this.currentPath === '/' ? `/${file}` : `${this.currentPath}/${file}`;
    try {
      await this.apicall('writefile', path, '');
      Modal.close();
      this.load(this.currentPath);
    } catch (e) {}
  },

  namecreatedfile() {
    const context = this._creatingfile;
    if (!context || !this.contextvalid(context)) return;
    Modal.open('Create File', `
      <div class="form-group">
        <label class="form-label">File Name</label>
        <input class="form-input" type="text" id="new-file-name" maxlength="255" placeholder="file.txt" oninput="ServerFiles.updatenewfile()" />
      </div>
      <div class="files-path-preview"><span>Created as</span><code id="new-file-path-preview"></code></div>
      <div class="files-new-error" id="files-new-error" style="display:none;"></div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">Close</button>
        <button class="btn btn-primary" id="new-file-create" onclick="ServerFiles.docreatenewfile()" disabled>Create</button>
      </div>`);
    this.updatenewfile();
  },

  updatenewfile(clearerror = true) {
    const input = Utils.el('new-file-name');
    const button = Utils.el('new-file-create');
    if (!input || !button) return;
    button.disabled = !this.validname(input.value);
    const preview = Utils.el('new-file-path-preview');
    if (preview) preview.textContent = this.containerpath(this.joinpath(this._creatingfile?.directory, input.value));
    if (clearerror) this.setmodalerror();
  },

  async docreatenewfile() {
    const context = this._creatingfile;
    const name = Utils.el('new-file-name')?.value.trim();
    if (!this.editor || !this.validname(name) || !this.contextvalid(context)) return;
    const oldpath = context.path;
    const path = this.joinpath(context.directory, name);
    const content = this.editor.getValue();
    this.setbuttonloading('new-file-create', true, 'Create');
    this.setmodalerror();
    try {
      await this.apicall('writefile', path, content);
      const tab = this._ideTabs.find(item => item.path === oldpath);
      if (tab) {
        tab.path = path;
        tab.name = name;
        tab.content = content;
        tab.dirty = false;
        this._activeIdeTab = path;
      }
      this._creatingfile = null;
      this._editingPath = path;
      this._editingName = name;
      Utils.el('editorFilename').textContent = name;
      this.editorbreadcrumb(path);
      this.renderidetabs();
      Modal.close();
      this.showtoast('File created successfully.');
      await this.refreshfiledirectory(context.directory);
    } catch (error) {
      this.setmodalerror(error.message || 'Failed to create file.');
      this.showtoast(error.message || 'Failed to create file.', 'error');
      this.setbuttonloading('new-file-create', false, 'Create');
      this.updatenewfile(false);
    }
  },

  createsymlink() {
    const server = App.currentServer;
    if (!server || server.type !== 'Calagopus' || !this.cancreate()) return;
    this._newcontext = { server, directory: this.currentPath, key: this.serverkey(server) };
    Modal.open('Create Symlink', `
      <div class="form-group">
        <label class="form-label">Symlink Name</label>
        <input class="form-input" type="text" id="symlink-name" maxlength="255" oninput="ServerFiles.updatesymlink()" />
      </div>
      <div class="files-new-arrow"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M7 14l5 5 5-5"/></svg></div>
      <div class="form-group">
        <label class="form-label">Symlink Target</label>
        <div class="files-new-description">Relative to the directory in which the symlink is created.</div>
        <input class="form-input" type="text" id="symlink-target" maxlength="4095" oninput="ServerFiles.updatesymlink()" />
      </div>
      <div class="files-path-preview"><span>Created as</span><code id="symlink-link-preview"></code></div>
      <div class="files-path-preview"><span>Points to</span><code id="symlink-target-preview"></code></div>
      <div class="files-new-error" id="files-new-error" style="display:none;"></div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">Close</button>
        <button class="btn btn-primary" id="symlink-create" onclick="ServerFiles.docreatesymlink()" disabled>Create</button>
      </div>`);
    this.updatesymlink();
  },

  updatesymlink(clearerror = true) {
    const link = Utils.el('symlink-name')?.value || '';
    const target = Utils.el('symlink-target')?.value || '';
    const directory = this._newcontext?.directory || '/';
    const linkpath = this.joinpath(directory, link);
    const targetpath = target.startsWith('/') ? this.normalizepath(target) : this.joinpath(directory, target);
    const linkpreview = Utils.el('symlink-link-preview');
    const targetpreview = Utils.el('symlink-target-preview');
    if (linkpreview) linkpreview.textContent = this.containerpath(linkpath);
    if (targetpreview) targetpreview.textContent = this.containerpath(targetpath);
    const button = Utils.el('symlink-create');
    if (button) button.disabled = !this.validname(link) || !this.validname(target, 4095);
    if (clearerror) this.setmodalerror();
  },

  async docreatesymlink() {
    const context = this._newcontext;
    const link = Utils.el('symlink-name')?.value || '';
    const target = Utils.el('symlink-target')?.value || '';
    if (!this.contextvalid(context) || !this.validname(link) || !this.validname(target, 4095)) return;
    this.setbuttonloading('symlink-create', true, 'Create');
    this.setmodalerror();
    try {
      await this.apicall('createsymlink', context.directory, link, target);
      Modal.close();
      this.showtoast('Symlink created successfully.');
      await this.refreshfiledirectory(context.directory);
    } catch (error) {
      this.setmodalerror(error.message || 'Failed to create symlink.');
      this.showtoast(error.message || 'Failed to create symlink.', 'error');
      this.setbuttonloading('symlink-create', false, 'Create');
      this.updatesymlink(false);
    }
  },

  pullfile() {
    const server = App.currentServer;
    if (!server || server.type !== 'Calagopus' || !this.cancreate()) return;
    this._newcontext = { server, directory: this.currentPath, key: this.serverkey(server) };
    this._pullresult = null;
    Modal.open('Pull File', `
      <div class="files-pull-query">
        <div class="form-group">
          <label class="form-label">File URL</label>
          <input class="form-input" type="url" id="pull-url" placeholder="https://example.com/file.zip" oninput="ServerFiles.updatepull(true)" />
        </div>
        <button class="btn btn-secondary" id="pull-query" onclick="ServerFiles.doquerypull()" disabled>Query</button>
      </div>
      <div class="form-group">
        <label class="form-label">File Name</label>
        <input class="form-input" type="text" id="pull-name" maxlength="255" placeholder="File Name" oninput="ServerFiles.updatepull()" />
      </div>
      <div class="files-pull-result" id="pull-result" style="display:none;"></div>
      <div class="files-path-preview"><span>Created as</span><code id="pull-path-preview"></code></div>
      <div class="files-new-error" id="files-new-error" style="display:none;"></div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">Close</button>
        <button class="btn btn-primary" id="pull-create" onclick="ServerFiles.dopullfile()" disabled>Pull</button>
      </div>`);
    this.updatepull();
  },

  validpullurl(value) {
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch (error) {
      return false;
    }
  },

  updatepull(cleared = false, clearerror = true) {
    const url = Utils.el('pull-url')?.value.trim() || '';
    const name = Utils.el('pull-name')?.value || '';
    if (cleared) {
      this._pullresult = null;
      const result = Utils.el('pull-result');
      if (result) result.style.display = 'none';
    }
    const urlvalid = this.validpullurl(url);
    const namevalid = !name || this.validname(name);
    const query = Utils.el('pull-query');
    const create = Utils.el('pull-create');
    if (query) query.disabled = !urlvalid;
    if (create) create.disabled = !urlvalid || !namevalid;
    const filesize = this._pullresult?.file_size ?? this._pullresult?.fileSize;
    if (create) create.dataset.label = filesize ? `Pull (${this.formatsize(filesize)})` : 'Pull';
    if (create && !create.querySelector('.spinner')) create.textContent = create.dataset.label;
    const preview = Utils.el('pull-path-preview');
    if (preview) preview.textContent = this.containerpath(this.joinpath(this._newcontext?.directory, name));
    if (clearerror) this.setmodalerror();
  },

  async doquerypull() {
    const context = this._newcontext;
    const url = Utils.el('pull-url')?.value.trim() || '';
    if (!this.contextvalid(context) || !this.validpullurl(url)) return;
    this.setbuttonloading('pull-query', true, 'Query');
    this.setmodalerror();
    try {
      const response = await this.apicall('querypull', url);
      if (!this.contextvalid(context)) return;
      const result = response?.query_result || response || {};
      this._pullresult = result;
      const input = Utils.el('pull-name');
      if (input) input.value = result.file_name || result.fileName || url.split('/').filter(Boolean).pop() || '';
      const box = Utils.el('pull-result');
      if (box) {
        const filesize = result.file_size ?? result.fileSize;
        const size = filesize == null ? 'Unknown size' : this.formatsize(filesize);
        box.innerHTML = `<strong>Remote file</strong><span>${Utils.escape(size)}</span><code>${Utils.escape(result.final_url || result.finalUrl || url)}</code>`;
        box.style.display = 'grid';
      }
      this.showtoast('File information retrieved.');
    } catch (error) {
      this.setmodalerror(error.message || 'Failed to query file.');
      this.showtoast(error.message || 'Failed to query file.', 'error');
    } finally {
      this.setbuttonloading('pull-query', false, 'Query');
      this.updatepull(false, false);
    }
  },

  async dopullfile() {
    const context = this._newcontext;
    const url = Utils.el('pull-url')?.value.trim() || '';
    const name = Utils.el('pull-name')?.value.trim() || '';
    if (!this.contextvalid(context) || !this.validpullurl(url) || (name && !this.validname(name))) return;
    this.setbuttonloading('pull-create', true, Utils.el('pull-create')?.dataset.label || 'Pull');
    this.setmodalerror();
    try {
      const response = await this.apicall('pullfile', context.directory, url, name || null);
      if (!this.contextvalid(context)) return;
      const identifier = response?.identifier || (typeof response === 'string' ? response : '');
      Modal.close();
      if (identifier) {
        const finished = this._finishedoperations.get(identifier);
        if (finished) {
          this._finishedoperations.delete(identifier);
          this.showtoast(finished.error || 'File pulled successfully.', finished.error ? 'error' : 'success');
          if (!finished.error) await this.refreshfiledirectory(context.directory);
          return;
        }
        const fallback = this._pullresult?.file_name || this._pullresult?.fileName || url.split('/').filter(Boolean).pop() || 'remote file';
        const filesize = this._pullresult?.file_size ?? this._pullresult?.fileSize;
        this._operations.set(identifier, {
          type: 'pull',
          start_time: new Date().toISOString(),
          bytes_processed: 0,
          bytes_total: Number(filesize || 0),
          destination_path: this.joinpath(context.directory, name || fallback)
        });
        this.renderoperations();
        this.showtoast('File pull started.');
      } else {
        this.showtoast('File pulled successfully.');
        await this.refreshfiledirectory(context.directory);
      }
    } catch (error) {
      this.setmodalerror(error.message || 'Failed to pull file.');
      this.showtoast(error.message || 'Failed to pull file.', 'error');
      this.setbuttonloading('pull-create', false, 'Pull');
      this.updatepull(false, false);
    }
  },

  socketevent(server, message) {
    if (!server || this._operationserverkey !== this.serverkey(server)) return;
    const args = Array.isArray(message?.args) ? message.args : [];
    const identifier = String(args[0] || '');
    if (!identifier) return;
    if (message.event === 'operation progress') {
      let data = args[1];
      try {
        if (typeof data === 'string') data = JSON.parse(data);
      } catch (error) {
        return;
      }
      if (!data || (data.type !== 'pull' && !this._operations.has(identifier))) return;
      this._operations.set(identifier, {
        ...this._operations.get(identifier),
        ...data,
        start_time: data.start_time || data.startTime,
        bytes_processed: Number(data.bytes_processed ?? data.bytesProcessed ?? 0),
        bytes_total: Number(data.bytes_total ?? data.bytesTotal ?? 0),
        destination_path: data.destination_path || data.destinationPath || this._operations.get(identifier)?.destination_path || ''
      });
      this.renderoperations();
      return;
    }
    const operation = this._operations.get(identifier);
    if (message.event === 'operation completed') {
      if (!operation) {
        this._finishedoperations.set(identifier, { completed: true });
        setTimeout(() => this._finishedoperations.delete(identifier), 10000);
        return;
      }
      const started = new Date(operation.start_time || operation.startTime || Date.now()).getTime();
      const seconds = Math.max(0, (Date.now() - started) / 1000).toFixed(1);
      this._operations.delete(identifier);
      this.renderoperations();
      this.showtoast(`Pulled ${operation.destination_path || 'file'} in ${seconds}s.`);
      this.refreshfiledirectory(this.currentPath);
      return;
    }
    if (!operation) {
      if (message.event === 'operation error' || message.event === 'operation aborted') {
        const error = message.event === 'operation aborted' ? 'Operation cancelled.' : String(args[1] || 'Operation failed.');
        this._finishedoperations.set(identifier, { error });
        setTimeout(() => this._finishedoperations.delete(identifier), 10000);
      }
      return;
    }
    if (message.event === 'operation error' || message.event === 'operation aborted') {
      operation.failed = true;
      operation.error = message.event === 'operation aborted' ? 'Operation cancelled.' : String(args[1] || 'Operation failed.');
      this._operations.set(identifier, operation);
      this.renderoperations();
      this.showtoast(operation.error, 'error');
      setTimeout(() => {
        if (this._operations.get(identifier)?.failed) {
          this._operations.delete(identifier);
          this.renderoperations();
        }
      }, 5000);
    }
  },

  renderoperations() {
    const wrap = Utils.el('file-operations-wrap');
    const progress = Utils.el('file-operations-progress');
    const menu = Utils.el('file-operations-menu');
    if (!wrap || !progress || !menu) return;
    if (!this.iscalagopus() || !this._operations.size) {
      wrap.style.display = 'none';
      menu.classList.remove('open');
      return;
    }
    wrap.style.display = '';
    const operations = [...this._operations.entries()];
    const indeterminate = operations.some(([, operation]) => !operation.failed && !Number(operation.bytes_total || operation.bytesTotal));
    const percentages = operations.map(([, operation]) => {
      const total = Number(operation.bytes_total ?? operation.bytesTotal ?? 0);
      const processed = Number(operation.bytes_processed ?? operation.bytesProcessed ?? 0);
      return total > 0 ? Math.min(100, processed / total * 100) : 0;
    });
    const average = percentages.length ? percentages.reduce((sum, value) => sum + value, 0) / percentages.length : 0;
    progress.innerHTML = indeterminate
      ? `<span class="spinner spinner-sm"></span><strong>${operations.length}</strong>`
      : `<svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15.5"></circle><circle class="file-operation-ring" cx="18" cy="18" r="15.5" stroke-dasharray="${average} 100"></circle></svg><strong>${Math.round(average)}%</strong>`;
    const cancelall = this.can('files.update') && operations.some(([, operation]) => !operation.failed)
      ? '<button class="file-operation-cancel-all" onclick="event.stopPropagation(); ServerFiles.confirmcanceloperations()">Cancel all operations</button>'
      : '';
    menu.innerHTML = `${cancelall}${operations.map(([identifier, operation]) => {
      const total = Number(operation.bytes_total ?? operation.bytesTotal ?? 0);
      const processed = Number(operation.bytes_processed ?? operation.bytesProcessed ?? 0);
      const percent = total > 0 ? Math.min(100, processed / total * 100) : 0;
      const destination = operation.destination_path || operation.destinationPath || 'remote file';
      const action = operation.failed
        ? `<button class="file-operation-close" title="Close" onclick="event.stopPropagation(); ServerFiles.removeoperation('${Utils.escape(identifier)}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg></button>`
        : this.can('files.update')
          ? `<button class="file-operation-close" title="Cancel" onclick="event.stopPropagation(); ServerFiles.canceloperation('${Utils.escape(identifier)}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg></button>`
          : '';
      return `<div class="file-operation-row${operation.failed ? ' failed' : ''}">
        <div class="file-operation-main"><span>Pulling ${Utils.escape(destination)}</span>${action}</div>
        <div class="file-operation-bytes">${operation.failed ? Utils.escape(operation.error || 'Operation failed.') : `${this.formatsize(processed)} / ${total ? this.formatsize(total) : 'Unknown'}`}</div>
        <div class="file-operation-track"><div class="file-operation-fill${!total && !operation.failed ? ' indeterminate' : ''}" style="width:${total ? percent : 35}%"></div></div>
      </div>`;
    }).join('')}`;
  },

  removeoperation(identifier) {
    this._operations.delete(identifier);
    this.renderoperations();
  },

  async canceloperation(identifier) {
    if (!this._operations.has(identifier) || !this.can('files.update')) return;
    try {
      await this.apicall('canceloperation', identifier);
      this.showtoast('Operation cancelled.');
      await this.refreshfiledirectory(this.currentPath);
    } catch (error) {
      this.showtoast(error.message || 'Failed to cancel operation.', 'error');
    }
  },

  confirmcanceloperations() {
    Modal.open('Cancel Operations', `
      <div class="modal-text">Cancel all active file operations?</div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">Keep Running</button>
        <button class="btn btn-danger" onclick="ServerFiles.docanceloperations()">Cancel Operations</button>
      </div>`);
  },

  async docanceloperations() {
    const identifiers = [...this._operations.entries()].filter(([, operation]) => !operation.failed).map(([identifier]) => identifier);
    Modal.close();
    const results = await Promise.allSettled(identifiers.map(identifier => this.apicall('canceloperation', identifier)));
    const failed = results.filter(result => result.status === 'rejected');
    if (failed.length) this.showtoast(`Failed to cancel ${failed.length} operation(s).`, 'error');
    else this.showtoast('All operations cancelled.');
    await this.refreshfiledirectory(this.currentPath);
  },

  formatsize(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + units[i];
  },

  async downloadfile(path, name) {
    try {
      const url = await this.fetchasblob(path);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {}
  },

  initupload() {
    const fileInput = Utils.el('fileUploadInput');
    if (!fileInput || fileInput._bound) return;
    fileInput._bound = true;

    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length && this.cancreate()) this.showuploadpreview(e.target.files);
      else if (e.target.files.length) this.showtoast('You cannot upload files to this directory.', 'error');
      fileInput.value = '';
    });

    const folderInput = Utils.el('folderUploadInput');
    if (folderInput && !folderInput._bound) {
      folderInput._bound = true;
      folderInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files || []).map(file => ({
          file,
          relPath: file.webkitRelativePath || file.name
        }));
        if (files.length && this.cancreate()) this.showuploadpreview(files);
        else if (files.length) this.showtoast('You cannot upload files to this directory.', 'error');
        folderInput.value = '';
      });
    }

    const container = Utils.el('filesContainer');
    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      container.style.outline = '2px dashed var(--accent)';
      container.style.outlineOffset = '-2px';
    });
    container.addEventListener('dragleave', (e) => {
      if (!container.contains(e.relatedTarget)) {
        container.style.outline = '';
        container.style.outlineOffset = '';
      }
    });
    container.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      container.style.outline = '';
      container.style.outlineOffset = '';
      if (!this.cancreate()) {
        this.showtoast('You cannot upload files to this directory.', 'error');
        return;
      }
      const items = e.dataTransfer.items;
      if (items) {
        const files = await this.readdatatransferitems(items);
        if (files.length) this.showuploadpreview(files);
      }
    });

    document.addEventListener('paste', async (e) => {
      if (App.currentServerPage !== 'files') return;
      if (this.editor) return;
      if (!this.cancreate()) return;
      const items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      const files = [];
      for (const item of items) {
        if (item.kind === 'file') {
          const entry = item.webkitGetAsEntry && item.webkitGetAsEntry();
          if (entry) {
            const walked = await this.walkentry(entry);
            files.push(...walked);
          } else {
            const f = item.getAsFile();
            if (f) files.push({ file: f, relPath: f.name });
          }
        }
      }
      if (files.length) this.showuploadpreview(files);
    });
  },

  async readdatatransferitems(items) {
    const files = [];
    const entries = [];
    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry && items[i].webkitGetAsEntry();
      if (entry) entries.push(entry);
    }
    for (const entry of entries) {
      const walked = await this.walkentry(entry);
      files.push(...walked);
    }
    return files;
  },

  walkentry(entry, prefix) {
    prefix = prefix || '';
    return new Promise((resolve) => {
      if (entry.isFile) {
        entry.file((file) => {
          resolve([{ file, relPath: prefix + file.name }]);
        }, () => resolve([]));
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const dirName = prefix + entry.name;
        const allEntries = [];
        const readbatch = () => {
          reader.readEntries(async (batch) => {
            if (batch.length === 0) {
              const results = [];
              for (const child of allEntries) {
                const walked = await this.walkentry(child, dirName + '/');
                results.push(...walked);
              }
              resolve(results);
            } else {
              allEntries.push(...batch);
              readbatch();
            }
          }, () => resolve([]));
        };
        readbatch();
      } else {
        resolve([]);
      }
    });
  },

  showuploadpreview(fileList, conflictsresolved = false, uploadcontext = null) {
    const files = Array.from(fileList);
    const s = uploadcontext?.server || App.currentServer;
    if (!s || !this.cancreate()) return;
    if (uploadcontext && !this.contextvalid(uploadcontext)) return;
    this._uploadcontext = uploadcontext || { server: s, directory: this.currentPath, key: this.serverkey(s) };
    this._uploadconflictsresolved = conflictsresolved;

    let totalSize = 0;
    const items = files.map(f => {
      const isObj = f.relPath !== undefined;
      const file = isObj ? f.file : f;
      const relPath = isObj ? f.relPath : (f.webkitRelativePath || f.name);
      totalSize += file.size;
      return { file, relPath, size: file.size };
    });

    const listHtml = items.map((item) => `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid var(--border);font-size:13px;">
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-primary);" title="${Utils.escape(item.relPath)}">${Utils.escape(item.relPath)}</span>
        <span style="color:var(--text-muted);flex-shrink:0;">${this.formatsize(item.size)}</span>
      </div>
    `).join('');

    Modal.open(`${items.length} file(s) - ${this.formatsize(totalSize)}`, `
      <div style="max-height:300px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:8px;">
        ${listHtml}
      </div>
      <div id="uploadProgress" style="display:none;margin-top:12px;">
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px;">
          <span id="uploadProgressText">Uploading...</span>
          <span id="uploadProgressCount"></span>
        </div>
        <div style="height:6px;background:var(--accent-light);border-radius:3px;overflow:hidden;">
          <div id="uploadProgressBar" style="height:100%;background:var(--accent);border-radius:3px;transition:width 0.3s ease;width:0%;"></div>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" id="uploadConfirmBtn" onclick="ServerFiles.startupload()">Upload</button>
      </div>
    `);

    this._uploadItems = items;
  },

  async finduploadconflicts(items, context) {
    const individual = new Map();
    const folders = new Map();
    items.forEach(item => {
      const path = item.relPath.replace(/\\/g, '/');
      const slash = path.indexOf('/');
      if (slash < 0) individual.set(path, item);
      else {
        const folder = path.slice(0, slash);
        folders.set(folder, (folders.get(folder) || 0) + 1);
      }
    });
    const names = [...folders.keys()];
    if (individual.size <= 1000) names.push(...individual.keys());
    const entries = [];
    for (let index = 0; index < names.length; index += 250) {
      if (!this.contextvalid(context)) return [];
      const response = await this.apicall('statfiles', context.directory, names.slice(index, index + 250));
      entries.push(...(response?.entries || []));
    }
    return entries.map(entry => {
      const item = individual.get(entry.name);
      return item
        ? { kind: 'file', path: entry.name, entry, item, resolution: 'skip', rename: this.uploadcopyname(entry.name) }
        : { kind: 'folder', path: entry.name, entry, count: folders.get(entry.name) || 0, resolution: 'skip', rename: this.uploadcopyname(entry.name) };
    });
  },

  uploadcopyname(name) {
    const dot = name.lastIndexOf('.');
    const extension = dot > 0 ? name.slice(dot) : '';
    const base = dot > 0 ? name.slice(0, dot) : name;
    return `${base} copy${extension}`;
  },

  showuploadconflicts(conflicts) {
    this._uploadconflicts = conflicts;
    const rows = conflicts.map((conflict, index) => `
      <div class="upload-conflict-row">
        <div class="upload-conflict-heading">
          <strong>${Utils.escape(conflict.path)}</strong>
          <span>${conflict.kind === 'folder' ? `${conflict.count} selected file(s)` : this.formatsize(conflict.item.size)}</span>
        </div>
        <div class="upload-conflict-options">
          <button class="active" data-upload-conflict="${index}" data-resolution="skip" onclick="ServerFiles.setuploadresolution(${index}, 'skip')">Skip</button>
          <button data-upload-conflict="${index}" data-resolution="overwrite" onclick="ServerFiles.setuploadresolution(${index}, 'overwrite')">${conflict.kind === 'folder' ? 'Merge' : 'Overwrite'}</button>
          <button data-upload-conflict="${index}" data-resolution="rename" onclick="ServerFiles.setuploadresolution(${index}, 'rename')">Rename</button>
        </div>
        <input class="form-input upload-conflict-rename" id="upload-conflict-rename-${index}" value="${Utils.escape(conflict.rename)}" maxlength="255" oninput="ServerFiles.updateuploadconflicts()" style="display:none;" />
      </div>`).join('');
    Modal.open('Upload Conflicts', `
      <div class="upload-conflict-summary">
        <span>${conflicts.length} existing item(s) found in ${Utils.escape(this._uploadcontext.directory)}.</span>
        <div><button class="btn btn-secondary btn-sm" onclick="ServerFiles.uploadconflictall('skip')">Skip All</button><button class="btn btn-secondary btn-sm" onclick="ServerFiles.uploadconflictall('overwrite')">Overwrite All</button></div>
      </div>
      <div class="upload-conflict-list">${rows}</div>
      <div class="files-new-error" id="files-new-error" style="display:none;"></div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">Close</button>
        <button class="btn btn-primary" id="upload-conflict-apply" onclick="ServerFiles.applyuploadconflicts()" disabled>Continue Upload</button>
      </div>`);
    this.updateuploadconflicts();
  },

  setuploadresolution(index, resolution) {
    const conflict = this._uploadconflicts[index];
    if (!conflict || !['skip', 'overwrite', 'rename'].includes(resolution)) return;
    conflict.resolution = resolution;
    document.querySelectorAll(`[data-upload-conflict="${index}"]`).forEach(button => {
      button.classList.toggle('active', button.dataset.resolution === resolution);
    });
    const input = Utils.el(`upload-conflict-rename-${index}`);
    if (input) input.style.display = resolution === 'rename' ? '' : 'none';
    this.updateuploadconflicts();
  },

  uploadconflictall(resolution) {
    this._uploadconflicts.forEach((conflict, index) => this.setuploadresolution(index, resolution));
  },

  updateuploadconflicts() {
    let actions = 0;
    let invalid = false;
    this._uploadconflicts.forEach((conflict, index) => {
      if (conflict.resolution === 'skip') return;
      actions++;
      if (conflict.resolution === 'rename') {
        const value = Utils.el(`upload-conflict-rename-${index}`)?.value.trim() || '';
        conflict.rename = value;
        if (!value || value.includes('/') || value.includes('\\')) invalid = true;
      }
    });
    const button = Utils.el('upload-conflict-apply');
    if (button) button.disabled = invalid || actions === 0;
    this.setmodalerror(invalid ? 'Renamed items must have a name and cannot contain path separators.' : '');
  },

  applyuploadconflicts() {
    this.updateuploadconflicts();
    if (Utils.el('upload-conflict-apply')?.disabled) return;
    const context = this._uploadcontext;
    if (!this.contextvalid(context)) {
      Modal.close();
      this.showtoast('Upload cancelled because the selected server changed.', 'error');
      return;
    }
    const lookup = new Map(this._uploadconflicts.map(conflict => [conflict.path, conflict]));
    const resolved = [];
    this._uploadItems.forEach(item => {
      const path = item.relPath.replace(/\\/g, '/');
      const slash = path.indexOf('/');
      const key = slash < 0 ? path : path.slice(0, slash);
      const conflict = lookup.get(key);
      if (!conflict) {
        resolved.push(item);
        return;
      }
      if (conflict.resolution === 'skip') return;
      if (conflict.resolution === 'rename') {
        const relpath = slash < 0 ? conflict.rename : conflict.rename + path.slice(slash);
        resolved.push({ ...item, relPath: relpath });
        return;
      }
      resolved.push(item);
    });
    Modal.close();
    if (!resolved.length) return;
    this.showuploadpreview(resolved, true, context);
  },

  async startupload() {
    const items = this._uploadItems;
    if (!items || !items.length) return;
    const context = this._uploadcontext;
    if (!this.contextvalid(context) || (this.iscalagopus() && !this.cancreate())) return;
    if (context.server.type === 'Calagopus' && !this._uploadconflictsresolved) {
      try {
        const conflicts = await this.finduploadconflicts(items, context);
        if (conflicts.length) {
          this.showuploadconflicts(conflicts);
          return;
        }
      } catch (error) {
        this.showtoast('Could not check upload conflicts. The upload will continue.', 'error');
      }
      this._uploadconflictsresolved = true;
    }

    const progress = Utils.el('uploadProgress');
    const bar = Utils.el('uploadProgressBar');
    const text = Utils.el('uploadProgressText');
    const count = Utils.el('uploadProgressCount');
    const btn = Utils.el('uploadConfirmBtn');
    btn.disabled = true;
    btn.textContent = 'Uploading...';
    progress.style.display = 'block';

    const dirsToCreate = new Set();
    if (context.server.type !== 'Calagopus') {
      items.forEach(item => {
        const parts = item.relPath.split('/');
        parts.pop();
        let acc = '';
        parts.forEach(p => {
          acc += '/' + p;
          dirsToCreate.add(acc);
        });
      });
    }
    const sortedDirs = [...dirsToCreate].sort();

    let created = 0;
    let directoryfailures = 0;
    let operationerror = '';
    const totalDirs = sortedDirs.length;
    for (const dir of sortedDirs) {
      if (!this.contextvalid(context)) {
        this.showtoast('Upload stopped because the selected server changed.', 'error');
        return;
      }
      text.textContent = `Creating folders...`;
      count.textContent = `${created + 1}/${totalDirs + 1}`;
      bar.style.width = ((created / (totalDirs + 1)) * 100) + '%';
      const name = dir.split('/').pop();
      const relativeParent = dir.replace(/\/[^/]+$/, '') || '/';
      const parent = context.directory === '/'
        ? relativeParent
        : `${context.directory}${relativeParent === '/' ? '' : relativeParent}`;
      try {
        await this.apicall('createfolder', name, parent);
      } catch (error) {
        if (!/exist|already/i.test(error.message || '')) {
          directoryfailures++;
          operationerror ||= error.message || 'Failed to create a directory.';
        }
      }
      created++;
    }
    const groups = {};
    if (context.server.type === 'Calagopus') {
      groups[context.directory] = items;
    } else {
      items.forEach(item => {
        const dirParts = item.relPath.split('/');
        dirParts.pop();
        const dir = dirParts.length
          ? (context.directory === '/' ? '/' : context.directory + '/') + dirParts.join('/')
          : context.directory;
        if (!groups[dir]) groups[dir] = [];
        groups[dir].push(item);
      });
    }
    const dirKeys = Object.keys(groups);
    let uploaded = 0;
    let failed = 0;
    const totalFiles = items.length;

    for (const dir of dirKeys) {
      if (!this.contextvalid(context)) {
        this.showtoast('Upload stopped because the selected server changed.', 'error');
        return;
      }
      const files = groups[dir];
      text.textContent = `Uploading ${files.length} file(s) to ${dir}...`;
      count.textContent = `${uploaded}/${totalFiles} files`;
      bar.style.width = ((uploaded / totalFiles) * 100) + '%';
      try {
        await this.apicall('uploadfiles', dir, files);
        uploaded += files.length;
      } catch (e) {
        failed += files.length;
        operationerror ||= e.message || 'Upload failed.';
      }
    }

    bar.style.width = '100%';
    const totalfailed = failed + directoryfailures;
    text.textContent = `Done. ${uploaded} uploaded, ${totalfailed} failed`;
    if (totalfailed) this.showtoast(operationerror || `${totalfailed} upload item(s) failed.`, 'error');
    else this.showtoast(`${uploaded} file(s) uploaded.`);
    if (this.contextvalid(context)) await this.refreshfiledirectory(context.directory);
    btn.textContent = 'Close';
    btn.disabled = false;
    btn.onclick = () => {
      Modal.close();
    };
  },

  showcontextmenu(x, y, file, isDir, isarchive) {
    this.hidecontextmenu();
    const menu = document.createElement('div');
    menu.id = 'filesContextMenu';
    menu.className = 'context-menu active';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';

    const name = file.attributes.name;
    const filePath = this.currentPath === '/' ? '/' + name : this.currentPath + '/' + name;
    let items = [];

    items.push({ label: 'Rename', icon: 'rename', action: () => this.modalrename(filePath, name) });
    items.push({ label: 'Move', icon: 'move', action: () => this.modalmove(filePath, name) });
    items.push({ label: 'Permissions', icon: 'lock', action: () => this.modalpermissions(filePath, name) });

    if (!isDir) {
      items.push({ label: 'Copy', icon: 'copy', action: () => this.modalcopy(filePath, name) });
    }

    if (!isDir && !isarchive) {
      items.push({ label: 'Archive', icon: 'archive', action: () => this.doarchive(filePath) });
    }
    if (!isDir && isarchive) {
      items.push({ label: 'Unarchive', icon: 'archive', action: () => this.dounarchive(filePath) });
    }

    if (!isDir) {
      items.push({ label: 'Download', icon: 'download', action: () => this.downloadfile(filePath, name) });
    }

    items.push({ label: 'Delete', icon: 'delete', danger: true, action: () => this.modaldelete(filePath, name) });

    const iconMap = {
      rename: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
      move: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>',
      lock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
      copy: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
      archive: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>',
      download: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
      delete: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>'
    };

    menu.innerHTML = items.map((item) => `
      <button class="context-menu-item${item.danger ? ' danger' : ''}" data-action="${item.label}">
        <span class="context-menu-icon">${iconMap[item.icon] || ''}</span>
        ${item.label}
      </button>
    `).join('');

    items.forEach((item) => {
      menu.querySelector(`[data-action="${item.label}"]`).addEventListener('click', (e) => {
        e.stopPropagation();
        this.hidecontextmenu();
        item.action();
      });
    });

    document.body.appendChild(menu);

    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (x - rect.width) + 'px';
    if (rect.bottom > window.innerHeight) menu.style.top = (y - rect.height) + 'px';
  },

  hidecontextmenu() {
    const m = document.getElementById('filesContextMenu');
    if (m) m.remove();
  },

  async doreload() {
    this.load(this.currentPath);
  },

  modalrename(filePath, name) {
    const dir = filePath.substring(0, filePath.lastIndexOf('/')) || '/';
    Modal.open('Rename', `
      <div class="form-group">
        <label class="form-label">New Name</label>
        <input class="form-input" type="text" id="renameInput" value="${Utils.escape(name)}" />
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" onclick="ServerFiles.dorename('${Utils.escape(dir)}', '${Utils.escape(name)}')">Rename</button>
      </div>
    `);
    setTimeout(() => { const el = Utils.el('renameInput'); if (el) { el.focus(); el.select(); } }, 50);
  },

  async dorename(dir, oldName) {
    const newName = Utils.el('renameInput').value.trim();
    if (!newName || newName === oldName) { Modal.close(); return; }
    const s = App.currentServer;
    if (!s) return;
    const apiKey = await Servers.resolveapikey(s);
    try {
      await this.apicall('renamefile', dir, oldName, newName);
      Modal.close();
      this.doreload();
    } catch (e) {}
  },

  modalmove(filePath, name) {
    Modal.open('Move', `
      <div class="form-group">
        <label class="form-label">File</label>
        <input class="form-input" type="text" value="${Utils.escape(filePath)}" disabled />
      </div>
      <div class="form-group">
        <label class="form-label">New Location</label>
        <input class="form-input" type="text" id="moveInput" value="${Utils.escape(this.currentPath)}" />
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" onclick="ServerFiles.domove('${Utils.escape(filePath)}', '${Utils.escape(name)}')">Move</button>
      </div>
    `);
  },

  async domove(filePath, name) {
    const dir = Utils.el('moveInput').value.trim();
    if (!dir) { Modal.close(); return; }
    const s = App.currentServer;
    if (!s) return;
    const apiKey = await Servers.resolveapikey(s);
    try {
      const root = filePath.substring(0, filePath.lastIndexOf('/')) || '/';
      const destName = dir + '/' + name;
      await this.apicall('renamefile', root, name, destName);
      Modal.close();
      this.doreload();
    } catch (e) {}
  },

  modalcopy(filePath, name) {
    Modal.open('Copy', `
      <div class="form-group">
        <label class="form-label">File</label>
        <input class="form-input" type="text" value="${Utils.escape(filePath)}" disabled />
      </div>
      <div class="form-group">
        <label class="form-label">Destination Directory</label>
        <input class="form-input" type="text" id="copyInput" value="${Utils.escape(this.currentPath)}" />
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" onclick="ServerFiles.docopy('${Utils.escape(filePath)}')">Copy</button>
      </div>
    `);
  },

  async docopy(filePath) {
    const dir = Utils.el('copyInput').value.trim();
    if (!dir) { Modal.close(); return; }
    const s = App.currentServer;
    if (!s) return;
    const apiKey = await Servers.resolveapikey(s);
    try {
      const name = filePath.split('/').pop();
      const destPath = dir + '/' + name;
      await this.apicall('copyfile', filePath, destPath);
      Modal.close();
      this.doreload();
    } catch (e) {}
  },

  modalpermissions(filePath, name) {
    Modal.open('Permissions', `
      <div class="form-group">
        <label class="form-label">File</label>
        <input class="form-input" type="text" value="${Utils.escape(name)}" disabled />
      </div>
      <div class="form-group">
        <label class="form-label">Mode (e.g. 0644, 0755)</label>
        <input class="form-input" type="text" id="permInput" value="0644" />
      </div>
      <div style="display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap;">
        <button class="btn btn-sm btn-secondary" onclick="Utils.el('permInput').value='0755'">755 (rwxr-xr-x)</button>
        <button class="btn btn-sm btn-secondary" onclick="Utils.el('permInput').value='0644'">644 (rw-r--r--)</button>
        <button class="btn btn-sm btn-secondary" onclick="Utils.el('permInput').value='0777'">777 (rwxrwxrwx)</button>
        <button class="btn btn-sm btn-secondary" onclick="Utils.el('permInput').value='0600'">600 (rw-------)</button>
        <button class="btn btn-sm btn-secondary" onclick="Utils.el('permInput').value='0666'">666 (rw-rw-rw-)</button>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" onclick="ServerFiles.dopermissions('${Utils.escape(filePath)}')">Apply</button>
      </div>
    `);
  },

  async dopermissions(filePath) {
    const mode = Utils.el('permInput').value.trim();
    if (!mode) { Modal.close(); return; }
    const s = App.currentServer;
    if (!s) return;
    const apiKey = await Servers.resolveapikey(s);
    try {
      const root = filePath.substring(0, filePath.lastIndexOf('/')) || '/';
      const name = filePath.split('/').pop();
      await this.apicall('changefilepermissions', root, name, mode);
      Modal.close();
      this.doreload();
    } catch (e) {}
  },

  async doarchive(filePath) {
    const s = App.currentServer;
    if (!s) return;
    const apiKey = await Servers.resolveapikey(s);
    try {
      const root = filePath.substring(0, filePath.lastIndexOf('/')) || '/';
      const name = filePath.split('/').pop();
      await this.apicall('compressfiles', root, [name], this.currentPath, null);
      this.doreload();
    } catch (e) {}
  },

  async dounarchive(filePath) {
    const s = App.currentServer;
    if (!s) return;
    const apiKey = await Servers.resolveapikey(s);
    try {
      const root = filePath.substring(0, filePath.lastIndexOf('/')) || '/';
      const name = filePath.split('/').pop();
      await this.apicall('decompressfile', root, name);
      this.doreload();
    } catch (e) {}
  },

  modaldelete(filePath, name) {
    Modal.open('Delete', `
      <div style="text-align:center;padding:8px 0;">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1.5" style="margin-bottom:12px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        <div style="font-size:15px;margin-bottom:4px;">Delete "${Utils.escape(name)}"?</div>
        <div style="font-size:13px;color:var(--text-muted);">This action cannot be undone.</div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-danger" onclick="ServerFiles.dodelete('${Utils.escape(filePath)}')">Delete</button>
      </div>
    `);
  },

  async dodelete(filePath) {
    const s = App.currentServer;
    if (!s) return;
    const apiKey = await Servers.resolveapikey(s);
    try {
      const root = filePath.substring(0, filePath.lastIndexOf('/')) || '/';
      const name = filePath.split('/').pop();
      await this.apicall('deletefiles', root, [name]);
      Modal.close();
      this.doreload();
    } catch (e) {}
  },

  toggleselect(idx, checked) {
    if (checked) {
      this.selected.add(idx);
    } else {
      this.selected.delete(idx);
    }
    this.updatemassbar();
    const item = Utils.el('filesList').querySelector(`.file-item[data-index="${idx}"]`);
    if (item) item.classList.toggle('selected', checked);
  },

  clearselection() {
    this.selected.clear();
    this.updatemassbar();
    Utils.el('filesList').querySelectorAll('.file-item.selected').forEach(el => el.classList.remove('selected'));
  },

  updatemassbar() {
    const bar = Utils.el('massActions');
    const count = Utils.el('massActionsCount');
    const selCount = Utils.el('filesSelectionCount');
    if (this.selected.size > 0) {
      bar.style.display = 'flex';
      count.textContent = `${this.selected.size} selected`;
      if (selCount) selCount.textContent = `${this.selected.size} selected`;
    } else {
      bar.style.display = 'none';
      if (selCount) selCount.textContent = '0 selected';
    }
  },

  getselectedpaths() {
    return Array.from(this.selected).map(idx => {
      const f = this.files[idx];
      if (!f) return null;
      const name = f.attributes.name;
      const path = this.currentPath === '/' ? '/' + name : this.currentPath + '/' + name;
      const root = this.currentPath || '/';
      return { path, name, root };
    }).filter(Boolean);
  },

  massdelete() {
    const items = this.getselectedpaths();
    if (!items.length) return;
    Modal.open('Delete', `
      <div style="text-align:center;padding:8px 0;">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1.5" style="margin-bottom:12px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        <div style="font-size:15px;margin-bottom:4px;">Delete ${items.length} item(s)?</div>
        <div style="font-size:13px;color:var(--text-muted);">This action cannot be undone.</div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-danger" onclick="ServerFiles.domassdelete()">Delete</button>
      </div>
    `);
  },

  async domassdelete() {
    const s = App.currentServer;
    if (!s) return;
    const apiKey = await Servers.resolveapikey(s);
    const items = this.getselectedpaths();
    try {
      const grouped = {};
      items.forEach(({ name, root }) => {
        if (!grouped[root]) grouped[root] = [];
        grouped[root].push(name);
      });
      for (const [root, names] of Object.entries(grouped)) {
        await this.apicall('deletefiles', root, names);
      }
      Modal.close();
      this.clearselection();
      this.doreload();
    } catch (e) {}
  },

  massmove() {
    const items = this.getselectedpaths();
    if (!items.length) return;
    Modal.open('Move', `
      <div class="form-group">
        <label class="form-label">${items.length} item(s) selected</label>
        <div style="font-size:13px;color:var(--text-muted);margin-bottom:8px;">${items.map(i => Utils.escape(i.name)).join(', ')}</div>
      </div>
      <div class="form-group">
        <label class="form-label">Destination Directory</label>
        <input class="form-input" type="text" id="massMoveInput" value="${Utils.escape(this.currentPath)}" />
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" onclick="ServerFiles.domassmove()">Move</button>
      </div>
    `);
  },

  async domassmove() {
    const s = App.currentServer;
    if (!s) return;
    const apiKey = await Servers.resolveapikey(s);
    const dir = Utils.el('massMoveInput').value.trim();
    if (!dir) { Modal.close(); return; }
    const items = this.getselectedpaths();
    try {
      for (const { name, root } of items) {
        const destName = dir + '/' + name;
        await this.apicall('renamefile', root, name, destName);
      }
      Modal.close();
      this.clearselection();
      this.doreload();
    } catch (e) {}
  },

  massarchive() {
    const items = this.getselectedpaths();
    if (!items.length) return;
    Modal.open('Archive', `
      <div class="form-group">
        <label class="form-label">${items.length} item(s) will be archived</label>
        <div style="font-size:13px;color:var(--text-muted);margin-bottom:8px;">${items.map(i => Utils.escape(i.name)).join(', ')}</div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" onclick="ServerFiles.domassarchive()">Archive</button>
      </div>
    `);
  },

  async domassarchive() {
    const s = App.currentServer;
    if (!s) return;
    const apiKey = await Servers.resolveapikey(s);
    const items = this.getselectedpaths();
    try {
      for (const { name, root } of items) {
        await this.apicall('compressfiles', root, [name], this.currentPath, null);
      }
      Modal.close();
      this.clearselection();
      this.doreload();
    } catch (e) {}
  },

  onsearch(value) {
    this._searchQuery = value.trim();
    this.render();
  },

  setfilter(tab) {
    this._filterTab = tab;
    document.querySelectorAll('.files-filter-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    this.render();
  },

  setsort(field) {
    if (this._sortBy === field) {
      this._sortDir = this._sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this._sortBy = field;
      this._sortDir = 'asc';
    }
    document.querySelectorAll('.files-sort-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.sort === field);
    });
    this.updatesortdiricon();
    this.render();
  },

  togglesortdir() {
    this._sortDir = this._sortDir === 'asc' ? 'desc' : 'asc';
    this.updatesortdiricon();
    this.render();
  },

  updatesortdiricon() {
    const icon = Utils.el('filesSortDirIcon');
    if (!icon) return;
    if (this._sortDir === 'asc') {
      icon.innerHTML = '<path d="M12 5v14"/><path d="M19 12l-7 7-7-7"/>';
    } else {
      icon.innerHTML = '<path d="M12 19V5"/><path d="M5 12l7-7 7 7"/>';
    }
  },

  showmenufor(e, idx) {
    const f = this.files[idx];
    if (!f) return;
    const isDir = this.isdirectory(f.attributes);
    const isArc = this.isarchive(f.attributes.name);
    this.showcontextmenu(e.clientX, e.clientY, f, isDir, isArc);
  },

  toggleselectall(checked) {
    if (checked) {
      this.filteredFiles.forEach((f) => {
        const realIdx = this.files.indexOf(f);
        if (realIdx >= 0) this.selected.add(realIdx);
      });
    } else {
      this.selected.clear();
    }
    this.updatemassbar();
    this.render();
  },

  formatdatetime(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    const now = new Date();
    const diff = now - d;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return mins + 'm ago';
    if (hours < 24) return hours + 'h ago';
    if (days < 7) return days + 'd ago';
    return d.toLocaleDateString();
  },

  updateinfocards() {
    const root = Utils.el('filesInfoRoot');
    const count = Utils.el('filesInfoCount');
    const sub = Utils.el('filesInfoCountSub');
    const size = Utils.el('filesInfoSize');
    if (root) root.textContent = this.currentPath || '/';
    if (count) count.textContent = this.files.length;
    const fileCount = this.files.filter(f => !this.isdirectory(f.attributes)).length;
    const folderCount = this.files.length - fileCount;
    if (sub) sub.textContent = `${fileCount} files · ${folderCount} folders`;
    if (size) {
      const total = this.files.reduce((sum, f) => {
        if (this.isdirectory(f.attributes)) return sum;
        return sum + (f.attributes.size || 0);
      }, 0);
      size.textContent = this.formatsize(total);
    }
  },
};
