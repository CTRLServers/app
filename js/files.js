const ServerFiles = {
  currentPath: '/',
  files: [],
  filteredFiles: [],
  editor: null,
  _editingPath: null,
  _editingName: null,
  selected: new Set(),
  _searchQuery: '',
  _filterTab: 'all',
  _sortBy: 'name',
  _sortDir: 'asc',

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

    Utils.el('filesList').addEventListener('click', (e) => {
      if (e.target.closest('.file-checkbox')) return;
      const item = e.target.closest('.file-item');
      if (!item) return;
      const idx = parseInt(item.dataset.index);
      if (isNaN(idx) || !this.files[idx]) return;
      const f = this.files[idx];
      const isDir = f.attributes.mimetype === 'inode/directory' || !f.attributes.is_file;
      if (isDir) {
        this.opendir(f.attributes.name);
      } else {
        const filePath = this.currentPath === '/' ? '/' + f.attributes.name : this.currentPath + '/' + f.attributes.name;
        this.openfile(filePath, f.attributes.name, f.attributes.size);
      }
    });

    Utils.el('filesBreadcrumb').addEventListener('click', (e) => {
      const item = e.target.closest('.breadcrumb-item');
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
      const isDir = f.attributes.mimetype === 'inode/directory' || !f.attributes.is_file;
      const isArc = this.isarchive(f.attributes.name);
      this.showcontextmenu(e.clientX, e.clientY, f, isDir, isArc);
    });

    document.addEventListener('click', () => this.hidecontextmenu());
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

  istextfile(name, size) {
    if (size && size > 5 * 1024 * 1024) return false;
    if (this.isimage(name) || this.isvideo(name) || this.isaudio(name) || this.isarchive(name)) return false;
    const ext = this.getext(name);
    return ext in this.MODE_MAP || name === 'Dockerfile' || name === 'Makefile' || name === 'Jenkinsfile';
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
    const url = this.getdownloadurl(path);
    const res = await fetch(url, {
      headers: { 'Authorization': 'Bearer ' + s.apiKey, 'Accept': 'application/vnd.pterodactyl.v1+json' },
      redirect: 'follow'
    });
    if (!res.ok) throw new Error('Download failed: ' + res.status);
    const ct = res.headers.get('content-type') || '';

    if (ct.includes('application/json')) {
      const json = await res.json();
      const signedUrl = json.attributes && json.attributes.url;
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
    this.currentPath = path || '/';
    this.selected.clear();
    this._searchQuery = '';
    if (Utils.el('filesSearchInput')) Utils.el('filesSearchInput').value = '';
    this.updatemassbar();
    const s = App.currentServer;
    if (!s || s.type !== 'Pterodactyl') return;
    this.closeeditor();
    try {
      this.files = await Api.listfiles(s.panelUrl, s.apiKey, s.uuid, this.currentPath);
      this.files.sort((a, b) => {
        const aDir = a.attributes.mimetype === 'inode/directory' || !a.attributes.is_file;
        const bDir = b.attributes.mimetype === 'inode/directory' || !b.attributes.is_file;
        if (aDir !== bDir) return aDir ? -1 : 1;
        return a.attributes.name.localeCompare(b.attributes.name);
      });
      this.render();
    } catch (e) {
      Utils.el('filesList').innerHTML = `<div class="files-empty">Failed to load: ${Utils.escape(e.message)}</div>`;
    }
  },

  render() {
    this.renderbreadcrumb();
    const list = Utils.el('filesList');

    this.filteredFiles = this.files.filter(f => {
      if (this._searchQuery) {
        const q = this._searchQuery.toLowerCase();
        if (!f.attributes.name.toLowerCase().includes(q)) return false;
      }
      if (this._filterTab === 'files') {
        return f.attributes.mimetype !== 'inode/directory' && f.attributes.is_file;
      }
      if (this._filterTab === 'folders') {
        return f.attributes.mimetype === 'inode/directory' || !f.attributes.is_file;
      }
      return true;
    });

    const sorted = [...this.filteredFiles].sort((a, b) => {
      const aDir = a.attributes.mimetype === 'inode/directory' || !a.attributes.is_file;
      const bDir = b.attributes.mimetype === 'inode/directory' || !b.attributes.is_file;
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
      const isDir = a.mimetype === 'inode/directory' || !a.is_file;
      const name = a.name;
      const icon = this.geticon(name, isDir);
      const size = !isDir ? this.formatsize(a.size) : '—';
      const modified = a.modified_at ? this.formatdatetime(a.modified_at) : '—';
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

  geticon(name, isDir) {
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

  async openfile(path, name, size) {
    const s = App.currentServer;
    if (!s) return;

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

    if (this.istextfile(name, size)) {
      try {
        const content = await Api.readfile(s.panelUrl, s.apiKey, s.uuid, path);
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

  showeditor(path, name, content) {
    this._editingPath = path;
    this._editingName = name;

    Utils.el('filesInfoCards').style.display = 'none';
    Utils.el('massActions').style.display = 'none';
    Utils.el('filesActionBar').style.display = 'none';
    Utils.el('filesTable').style.display = 'none';
    Utils.el('filesActions').style.display = 'none';
    const breadcrumb = Utils.el('filesBreadcrumb');
    breadcrumb.innerHTML = `<span style="font-size:13px;color:var(--text-muted);">/</span>${path.split('/').filter(Boolean).map(p => `<span class="breadcrumb-sep">/</span><span style="font-size:13px;">${Utils.escape(p)}</span>`).join('')}`;
    breadcrumb.style.pointerEvents = 'none';

    Utils.el('editorContainer').style.display = 'flex';
    Utils.el('editorFilename').textContent = name;

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

    const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'material-darker' : 'default';

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

    this.editor.on('inputRead', (cm, change) => {
      if (change.text[0] && /[a-zA-Z_.]/.test(change.text[0])) {
        clearTimeout(this._autocompleteTimer);
        this._autocompleteTimer = setTimeout(() => this.autocomplete(cm), 400);
      }
    });

    setTimeout(() => this.editor.refresh(), 10);
  },

  closeeditor() {
    if (this.editor) {
      this.editor.getWrapperElement().remove();
      this.editor = null;
    }
    this._editingPath = null;
    this._editingName = null;

    Utils.el('editorContainer').style.display = 'none';
    Utils.el('filesInfoCards').style.display = '';
    Utils.el('filesActionBar').style.display = '';
    Utils.el('filesTable').style.display = '';
    Utils.el('filesActions').style.display = '';
    Utils.el('filesBreadcrumb').style.pointerEvents = '';
    this.renderbreadcrumb();
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
    if (!this.editor || !this._editingPath) return;
    const s = App.currentServer;
    if (!s) return;
    const content = this.editor.getValue();
    try {
      await Api.writefile(s.panelUrl, s.apiKey, s.uuid, this._editingPath, content);
    } catch (e) {}
  },

  createfolder() {
    Modal.open('New Folder', `
      <div class="form-group">
        <label class="form-label">Folder Name</label>
        <input class="form-input" type="text" id="newFolderName" placeholder="my-folder" />
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" onclick="ServerFiles.docreatefolder()">Create</button>
      </div>
    `);
  },

  async docreatefolder() {
    const name = Utils.el('newFolderName').value.trim();
    const s = App.currentServer;
    if (!name || !s) return;
    try {
      await Api.createfolder(s.panelUrl, s.apiKey, s.uuid, name, this.currentPath);
      Modal.close();
      this.load(this.currentPath);
    } catch (e) {}
  },

  createfile() {
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
    const file = ext ? `${name}.${ext}` : name;
    const path = this.currentPath === '/' ? `/${file}` : `${this.currentPath}/${file}`;
    try {
      await Api.writefile(s.panelUrl, s.apiKey, s.uuid, path, '');
      Modal.close();
      this.load(this.currentPath);
    } catch (e) {}
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
      if (e.target.files.length) this.showuploadpreview(e.target.files);
      fileInput.value = '';
    });

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
      const items = e.dataTransfer.items;
      if (items) {
        const files = await this.readdatatransferitems(items);
        if (files.length) this.showuploadpreview(files);
      }
    });

    document.addEventListener('paste', async (e) => {
      if (App.currentServerPage !== 'files') return;
      if (Utils.el('editorContainer').style.display === 'flex') return;
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

  showuploadpreview(fileList) {
    const files = Array.from(fileList);
    const s = App.currentServer;
    if (!s) return;

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

    Modal.open(`${items.length} file(s) — ${this.formatsize(totalSize)}`, `
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

  async startupload() {
    const items = this._uploadItems;
    if (!items || !items.length) return;
    const s = App.currentServer;
    if (!s) return;

    const progress = Utils.el('uploadProgress');
    const bar = Utils.el('uploadProgressBar');
    const text = Utils.el('uploadProgressText');
    const count = Utils.el('uploadProgressCount');
    const btn = Utils.el('uploadConfirmBtn');
    btn.disabled = true;
    btn.textContent = 'Uploading...';
    progress.style.display = 'block';

    const dirsToCreate = new Set();
    items.forEach(item => {
      const parts = item.relPath.split('/');
      parts.pop();
      let acc = '';
      parts.forEach(p => {
        acc += '/' + p;
        dirsToCreate.add(acc);
      });
    });
    const sortedDirs = [...dirsToCreate].sort();

    let created = 0;
    const totalDirs = sortedDirs.length;
    for (const dir of sortedDirs) {
      text.textContent = `Creating folders...`;
      count.textContent = `${created + 1}/${totalDirs + 1}`;
      bar.style.width = ((created / (totalDirs + 1)) * 100) + '%';
      const name = dir.split('/').pop();
      const parent = dir.replace(/\/[^/]+$/, '') || '/';
      try { await Api.createfolder(s.panelUrl, s.apiKey, s.uuid, name, parent); } catch (e) {}
      created++;
    }
    const groups = {};
    items.forEach(item => {
      const dirParts = item.relPath.split('/');
      dirParts.pop();
      const dir = dirParts.length
        ? (this.currentPath === '/' ? '/' : this.currentPath + '/') + dirParts.join('/')
        : this.currentPath;
      if (!groups[dir]) groups[dir] = [];
      groups[dir].push(item);
    });
    const dirKeys = Object.keys(groups);
    let uploaded = 0;
    let failed = 0;
    const totalFiles = items.length;

    for (const dir of dirKeys) {
      const files = groups[dir];
      text.textContent = `Uploading ${files.length} file(s) to ${dir}...`;
      count.textContent = `${uploaded}/${totalFiles} files`;
      bar.style.width = ((uploaded / totalFiles) * 100) + '%';
      try {
        await Api.uploadfiles(s.panelUrl, s.apiKey, s.uuid, dir, files);
        uploaded += files.length;
      } catch (e) {
        failed += files.length;
      }
    }

    bar.style.width = '100%';
    text.textContent = `Done! ${uploaded} uploaded, ${failed} failed`;
    btn.textContent = 'Close';
    btn.disabled = false;
    btn.onclick = () => {
      Modal.close();
      this.load(this.currentPath);
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
    try {
      await Api.renamefile(s.panelUrl, s.apiKey, s.uuid, dir, oldName, newName);
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
    try {
      const root = filePath.substring(0, filePath.lastIndexOf('/')) || '/';
      const destName = dir + '/' + name;
      await Api.renamefile(s.panelUrl, s.apiKey, s.uuid, root, name, destName);
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
    try {
      const name = filePath.split('/').pop();
      const destPath = dir + '/' + name;
      await Api.copyfile(s.panelUrl, s.apiKey, s.uuid, destPath);
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
    try {
      const root = filePath.substring(0, filePath.lastIndexOf('/')) || '/';
      const name = filePath.split('/').pop();
      await Api.changefilepermissions(s.panelUrl, s.apiKey, s.uuid, root, name, mode);
      Modal.close();
      this.doreload();
    } catch (e) {}
  },

  async doarchive(filePath) {
    const s = App.currentServer;
    if (!s) return;
    try {
      const root = filePath.substring(0, filePath.lastIndexOf('/')) || '/';
      const name = filePath.split('/').pop();
      await Api.compressfiles(s.panelUrl, s.apiKey, s.uuid, root, [name], this.currentPath, null);
      this.doreload();
    } catch (e) {}
  },

  async dounarchive(filePath) {
    const s = App.currentServer;
    if (!s) return;
    try {
      const root = filePath.substring(0, filePath.lastIndexOf('/')) || '/';
      const name = filePath.split('/').pop();
      await Api.decompressfile(s.panelUrl, s.apiKey, s.uuid, root, name);
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
    try {
      const root = filePath.substring(0, filePath.lastIndexOf('/')) || '/';
      const name = filePath.split('/').pop();
      await Api.deletefiles(s.panelUrl, s.apiKey, s.uuid, root, [name]);
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
    const items = this.getselectedpaths();
    try {
      const grouped = {};
      items.forEach(({ name, root }) => {
        if (!grouped[root]) grouped[root] = [];
        grouped[root].push(name);
      });
      for (const [root, names] of Object.entries(grouped)) {
        await Api.deletefiles(s.panelUrl, s.apiKey, s.uuid, root, names);
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
    const dir = Utils.el('massMoveInput').value.trim();
    if (!dir) { Modal.close(); return; }
    const items = this.getselectedpaths();
    try {
      for (const { name, root } of items) {
        const destName = dir + '/' + name;
        await Api.renamefile(s.panelUrl, s.apiKey, s.uuid, root, name, destName);
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
    const items = this.getselectedpaths();
    try {
      for (const { name, root } of items) {
        await Api.compressfiles(s.panelUrl, s.apiKey, s.uuid, root, [name], this.currentPath, null);
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
    const isDir = f.attributes.mimetype === 'inode/directory' || !f.attributes.is_file;
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
    if (!iso) return '—';
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
    const fileCount = this.files.filter(f => f.attributes.mimetype !== 'inode/directory' && f.attributes.is_file).length;
    const folderCount = this.files.length - fileCount;
    if (sub) sub.textContent = `${fileCount} files · ${folderCount} folders`;
    if (size) {
      const total = this.files.reduce((sum, f) => {
        if (f.attributes.mimetype === 'inode/directory' || !f.attributes.is_file) return sum;
        return sum + (f.attributes.size || 0);
      }, 0);
      size.textContent = this.formatsize(total);
    }
  },
};
