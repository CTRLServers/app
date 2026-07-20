const ServerFiles = {
  currentpath: '/',
  files: [],
  editor: null,
  _editingPath: null,
  _editingName: null,
  selected: new Set(),

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

    Utils.el('fileslist').addEventListener('click', (e) => {
      if (e.target.closest('.file-checkbox')) return;
      const item = e.target.closest('.file-item');
      if (!item) return;
      const idx = parseInt(item.dataset.index);
      if (isNaN(idx) || !this.files[idx]) return;
      const f = this.files[idx];
      const isdir = f.attributes.mimetype === 'inode/directory' || !f.attributes.is_file;
      if (isdir) {
        this.opendir(f.attributes.name);
      } else {
        const filepath = this.currentpath === '/' ? '/' + f.attributes.name : this.currentpath + '/' + f.attributes.name;
        this.openfile(filepath, f.attributes.name, f.attributes.size);
      }
    });

    Utils.el('filesbreadcrumb').addEventListener('click', (e) => {
      const item = e.target.closest('.breadcrumb-item');
      if (!item) return;
      const path = item.dataset.bcpath;
      if (path) this.load(path);
    });

    Utils.el('fileslist').addEventListener('contextmenu', (e) => {
      if (e.target.closest('.file-checkbox')) return;
      const item = e.target.closest('.file-item');
      if (!item) return;
      e.preventDefault();
      e.stopPropagation();
      const idx = parseInt(item.dataset.index);
      if (isNaN(idx) || !this.files[idx]) return;
      const f = this.files[idx];
      const isdir = f.attributes.mimetype === 'inode/directory' || !f.attributes.is_file;
      const isarc = this.isarchive(f.attributes.name);
      this.showcontextmenu(e.clientx, e.clienty, f, isdir, isarc);
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
    const s = App.currentserver;
    if (!s) return '';
    return `${s.panelurl.replace(/\/+$/, '')}/api/client/servers/${s.uuid}/files/download?file=${encodeURIComponent(path)}`;
  },

  async fetchasblob(path) {
    const s = App.currentserver;
    if (!s) return '';
    const url = this.getdownloadurl(path);
    const res = await fetch(url, {
      headers: { 'Authorization': 'Bearer ' + s.apikey, 'Accept': 'application/vnd.pterodactyl.v1+json' },
      redirect: 'follow'
    });
    if (!res.ok) throw new Error('Download failed: ' + res.status);
    const ct = res.headers.get('content-type') || '';

    if (ct.includes('application/json')) {
      const json = await res.json();
      const signedurl = json.attributes && json.attributes.url;
      if (!signedurl) throw new Error('No signed URL');
      const fileres = await fetch(signedurl);
      if (!fileres.ok) throw new Error('File download failed');
      const filect = fileres.headers.get('content-type') || 'application/octet-stream';
      const buf = await fileres.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = '';
      for (let i = 0; i < bytes.bytelength; i++) binary += String.fromcharcode(bytes[i]);
      return `data:${filect};base64,${btoa(binary)}`;
    }

    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.bytelength; i++) binary += String.fromcharcode(bytes[i]);
    return `data:${ct};base64,${btoa(binary)}`;
  },

  async load(path) {
    this.currentpath = path || '/';
    this.selected.clear();
    this.updatemassbar();
    const s = App.currentserver;
    if (!s || s.type !== 'Pterodactyl') return;
    this.closeeditor();
    try {
      this.files = await Api.listfiles(s.panelurl, s.apikey, s.uuid, this.currentpath);
      this.render();
    } catch (e) {
      Utils.el('fileslist').innerHTML = `<div class="files-empty">Failed to load: ${Utils.escape(e.message)}</div>`;
    }
  },

  render() {
    this.renderbreadcrumb();
    const list = Utils.el('fileslist');
    if (!this.files.length) {
      list.innerHTML = '<div class="files-empty">This directory is empty</div>';
      return;
    }

    const sorted = [...this.files].sort((a, b) => {
      const adir = a.attributes.mimetype === 'inode/directory' || !a.attributes.is_file;
      const bdir = b.attributes.mimetype === 'inode/directory' || !b.attributes.is_file;
      if (adir !== bdir) return adir ? -1 : 1;
      return a.attributes.name.localeCompare(b.attributes.name);
    });

    this.files = sorted;

    list.innerHTML = sorted.map((f, i) => {
      const a = f.attributes;
      const isdir = a.mimetype === 'inode/directory' || !a.is_file;
      const name = a.name;
      const icon = this.geticon(name, isdir);
      const size = !isdir ? this.formatsize(a.size) : '—';
      const modified = a.modified_at ? new Date(a.modified_at).toLocaleDateString() : '—';

      return `<div class="file-item${this.selected.has(i) ? ' selected' : ''}" data-index="${i}">
        <label class="file-checkbox" onclick="event.stopPropagation()">
          <input type="checkbox" ${this.selected.has(i) ? 'checked' : ''} onchange="ServerFiles.toggleselect(${i}, this.checked)" />
        </label>
        <div class="file-icon">${icon}</div>
        <div class="file-name">${Utils.escape(name)}</div>
        <div class="file-size">${size}</div>
        <div class="file-date">${modified}</div>
      </div>`;
    }).join('');
  },

  geticon(name, isdir) {
    if (isdir) return `<svg width="18" height="18" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
    if (this.isimage(name)) return `<svg width="18" height="18" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
    if (this.isvideo(name)) return `<svg width="18" height="18" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>`;
    if (this.isaudio(name)) return `<svg width="18" height="18" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
    if (this.isarchive(name)) return `<svg width="18" height="18" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></svg>`;
    if (this.isbinary(name)) return `<svg width="18" height="18" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/></svg>`;
    return `<svg width="18" height="18" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
  },

  renderbreadcrumb() {
    const bc = Utils.el('filesbreadcrumb');
    const parts = this.currentpath.split('/').filter(Boolean);
    let html = `<span class="breadcrumb-item" data-bc-path="/">/</span>`;
    let acc = '';
    parts.forEach((p) => {
      acc += '/' + p;
      html += `<span class="breadcrumb-sep">/</span><span class="breadcrumb-item" data-bc-path="${Utils.escape(acc)}">${Utils.escape(p)}</span>`;
    });
    bc.innerHTML = html;
  },

  opendir(name) {
    if (name === '/') {
      this.load('/');
    } else {
      const path = this.currentpath === '/' ? '/' + name : this.currentpath + '/' + name;
      this.load(path);
    }
  },

  async openfile(path, name, size) {
    const s = App.currentserver;
    if (!s) return;

    if (this.isimage(name)) {
      try {
        const bloburl = await this.fetchasblob(path);
        Modal.open(name, `
          <div class="file-preview">
            <img src="${bloburl}" alt="${Utils.escape(name)}" style="max-width:100%;max-height:60vh;border-radius:var(--radius-sm);" />
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
          <svg width="48" height="48" viewbox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" style="margin-bottom:16px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
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
          <svg width="48" height="48" viewbox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" style="margin-bottom:16px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
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
        const content = await Api.readfile(s.panelurl, s.apikey, s.uuid, path);
        this.showeditor(path, name, content);
      } catch (e) {
        Modal.open(name, `
          <div class="file-preview" style="text-align:center;padding:32px 0;">
            <svg width="48" height="48" viewbox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" style="margin-bottom:16px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
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
        <svg width="48" height="48" viewbox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" style="margin-bottom:16px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
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

    Utils.el('fileslist').style.display = 'none';
    Utils.el('filesactions').style.display = 'none';
    const breadcrumb = Utils.el('filesbreadcrumb');
    breadcrumb.innerHTML = `<span style="font-size:13px;color:var(--text-muted);">/</span>${path.split('/').filter(Boolean).map(p => `<span class="breadcrumb-sep">/</span><span style="font-size:13px;">${Utils.escape(p)}</span>`).join('')}`;
    breadcrumb.style.pointerevents = 'none';

    Utils.el('editorcontainer').style.display = 'flex';
    Utils.el('editorfilename').textContent = name;

    const wrapper = Utils.el('editorwrapper');
    wrapper.innerHTML = '';

    const mode = this.getmode(name);
    const istext = this.TEXT_MODES.has(typeof mode === 'string' ? mode : mode.name);

    if (!istext && mode !== 'null') {
      wrapper.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;color:var(--text-muted);">
        <svg width="48" height="48" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <div>Cannot preview this file type</div>
      </div>`;
      return;
    }

    const theme = document.documentelement.getAttribute('data-theme') === 'dark' ? 'material-darker' : 'default';

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
      styleactiveline: true,
      indentunit: 2,
      tabsize: 2,
      indentwithtabs: false,
      extraKeys: {
        'Ctrl-Space': (cm) => this.autocomplete(cm),
        'Cmd-Space': (cm) => this.autocomplete(cm),
        'Ctrl-S': () => this.savefile(),
        'Cmd-S': () => this.savefile(),
        'Ctrl-/': (cm) => cm.toggleComment(),
        'Cmd-/': (cm) => cm.toggleComment(),
      },
    });

    this.editor.setsize('100%', '100%');

    this.editor.on('inputread', (cm, change) => {
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

    Utils.el('editorcontainer').style.display = 'none';
    Utils.el('fileslist').style.display = '';
    Utils.el('filesactions').style.display = '';
    Utils.el('filesbreadcrumb').style.pointerevents = '';
    this.renderbreadcrumb();
  },

  autocomplete(cm) {
    const cur = cm.getCursor();
    const token = cm.getTokenAt(cur);
    const line = cm.getLine(cur.line);
    const before = line.slice(0, cur.ch);

    if (token.string.trim().length < 1) return;

    CodeMirror.showHint(cm, CodeMirror.hint.anyword, { completesingle: false });
  },

  async savefile() {
    if (!this.editor || !this._editingPath) return;
    const s = App.currentserver;
    if (!s) return;
    const content = this.editor.getValue();
    try {
      await Api.writefile(s.panelurl, s.apikey, s.uuid, this._editingPath, content);
    } catch (e) { /* silent */ }
  },

  createfolder() {
    Modal.open('New Folder', `
      <div class="form-group">
        <label class="form-label">Folder Name</label>
        <input class="form-input" type="text" id="newfoldername" placeholder="my-folder" />
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" onclick="ServerFiles.docreatefolder()">Create</button>
      </div>
    `);
  },

  async docreatefolder() {
    const name = Utils.el('newfoldername').value.trim();
    const s = App.currentserver;
    if (!name || !s) return;
    try {
      await Api.createfolder(s.panelurl, s.apikey, s.uuid, name, this.currentpath);
      Modal.close();
      this.load(this.currentpath);
    } catch (e) { /* silent */ }
  },

  createfile() {
    Modal.open('New File', `
      <div class="form-group">
        <label class="form-label">File Name</label>
        <input class="form-input" type="text" id="newfilename" placeholder="file" />
      </div>
      <div class="form-group">
        <label class="form-label">Extension</label>
        <input class="form-input" type="text" id="newfileext" placeholder="txt" />
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" onclick="ServerFiles.docreatefile()">Create</button>
      </div>
    `);
  },

  async docreatefile() {
    const name = Utils.el('newfilename').value.trim();
    const ext = Utils.el('newfileext').value.trim();
    const s = App.currentserver;
    if (!name || !s) return;
    const file = ext ? `${name}.${ext}` : name;
    const path = this.currentpath === '/' ? `/${file}` : `${this.currentpath}/${file}`;
    try {
      await Api.writefile(s.panelurl, s.apikey, s.uuid, path, '');
      Modal.close();
      this.load(this.currentpath);
    } catch (e) { /* silent */ }
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
    } catch (e) { /* silent */ }
  },

  initupload() {
    const fileinput = Utils.el('fileuploadinput');
    if (!fileinput || fileinput._bound) return;
    fileinput._bound = true;

    fileinput.addEventListener('change', (e) => {
      if (e.target.files.length) this.showuploadpreview(e.target.files);
      fileinput.value = '';
    });

    const container = Utils.el('filescontainer');
    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      container.style.outline = '2px dashed var(--accent)';
      container.style.outlineoffset = '-2px';
    });
    container.addEventListener('dragleave', (e) => {
      if (!container.contains(e.relatedtarget)) {
        container.style.outline = '';
        container.style.outlineoffset = '';
      }
    });
    container.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      container.style.outline = '';
      container.style.outlineoffset = '';
      const items = e.datatransfer.items;
      if (items) {
        const files = await this.readdatatransferitems(items);
        if (files.length) this.showuploadpreview(files);
      }
    });

    document.addEventListener('paste', async (e) => {
      if (App.currentserverpage !== 'files') return;
      if (Utils.el('editorcontainer').style.display === 'flex') return;
      const items = e.clipboarddata && e.clipboarddata.items;
      if (!items) return;
      const files = [];
      for (const item of items) {
        if (item.kind === 'file') {
          const entry = item.webkitgetasentry && item.webkitgetasentry();
          if (entry) {
            const walked = await this.walkentry(entry);
            files.push(...walked);
          } else {
            const f = item.getasfile();
            if (f) files.push({ file: f, relpath: f.name });
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
      const entry = items[i].webkitgetasentry && items[i].webkitgetasentry();
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
      if (entry.isfile) {
        entry.file((file) => {
          resolve([{ file, relpath: prefix + file.name }]);
        }, () => resolve([]));
      } else if (entry.isdirectory) {
        const reader = entry.createreader();
        const dirname = prefix + entry.name;
        const allentries = [];
        const readbatch = () => {
          reader.readentries(async (batch) => {
            if (batch.length === 0) {
              const results = [];
              for (const child of allentries) {
                const walked = await this.walkentry(child, dirname + '/');
                results.push(...walked);
              }
              resolve(results);
            } else {
              allentries.push(...batch);
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

  showuploadpreview(filelist) {
    const files = Array.from(filelist);
    const s = App.currentserver;
    if (!s) return;

    let totalsize = 0;
    const items = files.map(f => {
      const isobj = f.relpath !== undefined;
      const file = isobj ? f.file : f;
      const relpath = isobj ? f.relpath : (f.webkitrelativepath || f.name);
      totalsize += file.size;
      return { file, relpath, size: file.size };
    });

    const listhtml = items.map((item) => `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid var(--border);font-size:13px;">
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-primary);" title="${Utils.escape(item.relpath)}">${Utils.escape(item.relpath)}</span>
        <span style="color:var(--text-muted);flex-shrink:0;">${this.formatsize(item.size)}</span>
      </div>
    `).join('');

    Modal.open(`${items.length} file(s) — ${this.formatsize(totalsize)}`, `
      <div style="max-height:300px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:8px;">
        ${listhtml}
      </div>
      <div id="uploadprogress" style="display:none;margin-top:12px;">
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px;">
          <span id="uploadprogresstext">Uploading...</span>
          <span id="uploadprogresscount"></span>
        </div>
        <div style="height:6px;background:var(--accent-light);border-radius:3px;overflow:hidden;">
          <div id="uploadprogressbar" style="height:100%;background:var(--accent);border-radius:3px;transition:width 0.3s ease;width:0%;"></div>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" id="uploadconfirmbtn" onclick="ServerFiles.startupload()">Upload</button>
      </div>
    `);

    this._uploadItems = items;
  },

  async startupload() {
    const items = this._uploadItems;
    if (!items || !items.length) return;
    const s = App.currentserver;
    if (!s) return;

    const progress = Utils.el('uploadprogress');
    const bar = Utils.el('uploadprogressbar');
    const text = Utils.el('uploadprogresstext');
    const count = Utils.el('uploadprogresscount');
    const btn = Utils.el('uploadconfirmbtn');
    btn.disabled = true;
    btn.textContent = 'Uploading...';
    progress.style.display = 'block';

    const dirstocreate = new Set();
    items.forEach(item => {
      const parts = item.relpath.split('/');
      parts.pop();
      let acc = '';
      parts.forEach(p => {
        acc += '/' + p;
        dirstocreate.add(acc);
      });
    });
    const sorteddirs = [...dirstocreate].sort();

    let created = 0;
    const totaldirs = sorteddirs.length;
    for (const dir of sorteddirs) {
      text.textContent = `Creating folders...`;
      count.textContent = `${created + 1}/${totaldirs + 1}`;
      bar.style.width = ((created / (totaldirs + 1)) * 100) + '%';
      const name = dir.split('/').pop();
      const parent = dir.replace(/\/[^/]+$/, '') || '/';
      try { await Api.createfolder(s.panelurl, s.apikey, s.uuid, name, parent); } catch (e) { /* */ }
      created++;
    }
    const groups = {};
    items.forEach(item => {
      const dirparts = item.relpath.split('/');
      dirparts.pop();
      const dir = dirparts.length
        ? (this.currentpath === '/' ? '/' : this.currentpath + '/') + dirparts.join('/')
        : this.currentpath;
      if (!groups[dir]) groups[dir] = [];
      groups[dir].push(item);
    });
    const dirkeys = Object.keys(groups);
    let uploaded = 0;
    let failed = 0;
    const totalfiles = items.length;

    for (const dir of dirkeys) {
      const files = groups[dir];
      text.textContent = `Uploading ${files.length} file(s) to ${dir}...`;
      count.textContent = `${uploaded}/${totalfiles} files`;
      bar.style.width = ((uploaded / totalfiles) * 100) + '%';
      try {
        await Api.uploadfiles(s.panelurl, s.apikey, s.uuid, dir, files);
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
      this.load(this.currentpath);
    };
  },

  showcontextmenu(x, y, file, isdir, isarchive) {
    this.hidecontextmenu();
    const menu = document.createElement('div');
    menu.id = 'filescontextmenu';
    menu.className = 'context-menu active';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';

    const name = file.attributes.name;
    const filepath = this.currentpath === '/' ? '/' + name : this.currentpath + '/' + name;
    let items = [];

    items.push({ label: 'Rename', icon: 'rename', action: () => this.modalrename(filepath, name) });
    items.push({ label: 'Move', icon: 'move', action: () => this.modalmove(filepath, name) });
    items.push({ label: 'Permissions', icon: 'lock', action: () => this.modalpermissions(filepath, name) });

    if (!isdir) {
      items.push({ label: 'Copy', icon: 'copy', action: () => this.modalcopy(filepath, name) });
    }

    if (!isdir && !isarchive) {
      items.push({ label: 'Archive', icon: 'archive', action: () => this.doarchive(filepath) });
    }
    if (!isdir && isarchive) {
      items.push({ label: 'Unarchive', icon: 'archive', action: () => this.dounarchive(filepath) });
    }

    if (!isdir) {
      items.push({ label: 'Download', icon: 'download', action: () => this.downloadfile(filepath, name) });
    }

    items.push({ label: 'Delete', icon: 'delete', danger: true, action: () => this.modaldelete(filepath, name) });

    const iconmap = {
      rename: '<svg width="14" height="14" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
      move: '<svg width="14" height="14" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>',
      lock: '<svg width="14" height="14" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
      copy: '<svg width="14" height="14" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
      archive: '<svg width="14" height="14" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>',
      download: '<svg width="14" height="14" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
      delete: '<svg width="14" height="14" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>'
    };

    menu.innerHTML = items.map((item) => `
      <button class="context-menu-item${item.danger ? ' danger' : ''}" data-action="${item.label}">
        <span class="context-menu-icon">${iconmap[item.icon] || ''}</span>
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
    if (rect.right > window.innerwidth) menu.style.left = (x - rect.width) + 'px';
    if (rect.bottom > window.innerheight) menu.style.top = (y - rect.height) + 'px';
  },

  hidecontextmenu() {
    const m = document.getElementById('filescontextmenu');
    if (m) m.remove();
  },

  async doreload() {
    this.load(this.currentpath);
  },

  modalrename(filepath, name) {
    const dir = filepath.substring(0, filepath.lastIndexOf('/')) || '/';
    Modal.open('Rename', `
      <div class="form-group">
        <label class="form-label">New Name</label>
        <input class="form-input" type="text" id="renameinput" value="${Utils.escape(name)}" />
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" onclick="ServerFiles.dorename('${Utils.escape(dir)}', '${Utils.escape(name)}')">Rename</button>
      </div>
    `);
    setTimeout(() => { const el = Utils.el('renameinput'); if (el) { el.focus(); el.select(); } }, 50);
  },

  async dorename(dir, oldname) {
    const newname = Utils.el('renameinput').value.trim();
    if (!newname || newname === oldname) { Modal.close(); return; }
    const s = App.currentserver;
    if (!s) return;
    try {
      await Api.renamefile(s.panelurl, s.apikey, s.uuid, dir, oldname, newname);
      Modal.close();
      this.doreload();
    } catch (e) { /* silent */ }
  },

  modalmove(filepath, name) {
    Modal.open('Move', `
      <div class="form-group">
        <label class="form-label">File</label>
        <input class="form-input" type="text" value="${Utils.escape(filepath)}" disabled />
      </div>
      <div class="form-group">
        <label class="form-label">New Location</label>
        <input class="form-input" type="text" id="moveinput" value="${Utils.escape(this.currentpath)}" />
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" onclick="ServerFiles.domove('${Utils.escape(filepath)}', '${Utils.escape(name)}')">Move</button>
      </div>
    `);
  },

  async domove(filepath, name) {
    const dir = Utils.el('moveinput').value.trim();
    if (!dir) { Modal.close(); return; }
    const s = App.currentserver;
    if (!s) return;
    try {
      const root = filepath.substring(0, filepath.lastIndexOf('/')) || '/';
      const destname = dir + '/' + name;
      await Api.renamefile(s.panelurl, s.apikey, s.uuid, root, name, destname);
      Modal.close();
      this.doreload();
    } catch (e) { /* silent */ }
  },

  modalcopy(filepath, name) {
    Modal.open('Copy', `
      <div class="form-group">
        <label class="form-label">File</label>
        <input class="form-input" type="text" value="${Utils.escape(filepath)}" disabled />
      </div>
      <div class="form-group">
        <label class="form-label">Destination Directory</label>
        <input class="form-input" type="text" id="copyinput" value="${Utils.escape(this.currentpath)}" />
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" onclick="ServerFiles.docopy('${Utils.escape(filepath)}')">Copy</button>
      </div>
    `);
  },

  async docopy(filepath) {
    const dir = Utils.el('copyinput').value.trim();
    if (!dir) { Modal.close(); return; }
    const s = App.currentserver;
    if (!s) return;
    try {
      const name = filepath.split('/').pop();
      const destpath = dir + '/' + name;
      await Api.copyfile(s.panelurl, s.apikey, s.uuid, destpath);
      Modal.close();
      this.doreload();
    } catch (e) { /* silent */ }
  },

  modalpermissions(filepath, name) {
    Modal.open('Permissions', `
      <div class="form-group">
        <label class="form-label">File</label>
        <input class="form-input" type="text" value="${Utils.escape(name)}" disabled />
      </div>
      <div class="form-group">
        <label class="form-label">Mode (e.g. 0644, 0755)</label>
        <input class="form-input" type="text" id="perminput" value="0644" />
      </div>
      <div style="display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap;">
        <button class="btn btn-sm btn-secondary" onclick="Utils.el('perminput').value='0755'">755 (rwxr-xr-x)</button>
        <button class="btn btn-sm btn-secondary" onclick="Utils.el('perminput').value='0644'">644 (rw-r--r--)</button>
        <button class="btn btn-sm btn-secondary" onclick="Utils.el('perminput').value='0777'">777 (rwxrwxrwx)</button>
        <button class="btn btn-sm btn-secondary" onclick="Utils.el('perminput').value='0600'">600 (rw-------)</button>
        <button class="btn btn-sm btn-secondary" onclick="Utils.el('perminput').value='0666'">666 (rw-rw-rw-)</button>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" onclick="ServerFiles.dopermissions('${Utils.escape(filepath)}')">Apply</button>
      </div>
    `);
  },

  async dopermissions(filepath) {
    const mode = Utils.el('perminput').value.trim();
    if (!mode) { Modal.close(); return; }
    const s = App.currentserver;
    if (!s) return;
    try {
      const root = filepath.substring(0, filepath.lastIndexOf('/')) || '/';
      const name = filepath.split('/').pop();
      await Api.changefilepermissions(s.panelurl, s.apikey, s.uuid, root, name, mode);
      Modal.close();
      this.doreload();
    } catch (e) { /* silent */ }
  },

  async doarchive(filepath) {
    const s = App.currentserver;
    if (!s) return;
    try {
      const root = filepath.substring(0, filepath.lastIndexOf('/')) || '/';
      const name = filepath.split('/').pop();
      await Api.compressfiles(s.panelurl, s.apikey, s.uuid, root, [name], this.currentpath, null);
      this.doreload();
    } catch (e) { /* silent */ }
  },

  async dounarchive(filepath) {
    const s = App.currentserver;
    if (!s) return;
    try {
      const root = filepath.substring(0, filepath.lastIndexOf('/')) || '/';
      const name = filepath.split('/').pop();
      await Api.decompressfile(s.panelurl, s.apikey, s.uuid, root, name);
      this.doreload();
    } catch (e) { /* silent */ }
  },

  modaldelete(filepath, name) {
    Modal.open('Delete', `
      <div style="text-align:center;padding:8px 0;">
        <svg width="48" height="48" viewbox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1.5" style="margin-bottom:12px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        <div style="font-size:15px;margin-bottom:4px;">Delete "${Utils.escape(name)}"?</div>
        <div style="font-size:13px;color:var(--text-muted);">This action cannot be undone.</div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-danger" onclick="ServerFiles.dodelete('${Utils.escape(filepath)}')">Delete</button>
      </div>
    `);
  },

  async dodelete(filepath) {
    const s = App.currentserver;
    if (!s) return;
    try {
      const root = filepath.substring(0, filepath.lastIndexOf('/')) || '/';
      const name = filepath.split('/').pop();
      await Api.deletefiles(s.panelurl, s.apikey, s.uuid, root, [name]);
      Modal.close();
      this.doreload();
    } catch (e) { /* silent */ }
  },

  toggleselect(idx, checked) {
    if (checked) {
      this.selected.add(idx);
    } else {
      this.selected.delete(idx);
    }
    this.updatemassbar();
    const item = Utils.el('fileslist').querySelector(`.file-item[data-index="${idx}"]`);
    if (item) item.classList.toggle('selected', checked);
  },

  clearselection() {
    this.selected.clear();
    this.updatemassbar();
    Utils.el('fileslist').querySelectorAll('.file-item.selected').forEach(el => el.classList.remove('selected'));
    Utils.el('fileslist').querySelectorAll('.file-checkbox input[type="checkbox"]').forEach(cb => cb.checked = false);
  },

  updatemassbar() {
    const bar = Utils.el('massactions');
    const count = Utils.el('massactionscount');
    if (this.selected.size > 0) {
      bar.style.display = 'flex';
      count.textContent = `${this.selected.size} selected`;
    } else {
      bar.style.display = 'none';
    }
  },

  getselectedpaths() {
    return Array.from(this.selected).map(idx => {
      const f = this.files[idx];
      if (!f) return null;
      const name = f.attributes.name;
      const path = this.currentpath === '/' ? '/' + name : this.currentpath + '/' + name;
      const root = this.currentpath || '/';
      return { path, name, root };
    }).filter(Boolean);
  },

  massdelete() {
    const items = this.getselectedpaths();
    if (!items.length) return;
    Modal.open('Delete', `
      <div style="text-align:center;padding:8px 0;">
        <svg width="48" height="48" viewbox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1.5" style="margin-bottom:12px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
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
    const s = App.currentserver;
    if (!s) return;
    const items = this.getselectedpaths();
    try {
      const grouped = {};
      items.forEach(({ name, root }) => {
        if (!grouped[root]) grouped[root] = [];
        grouped[root].push(name);
      });
      for (const [root, names] of Object.entries(grouped)) {
        await Api.deletefiles(s.panelurl, s.apikey, s.uuid, root, names);
      }
      Modal.close();
      this.clearselection();
      this.doreload();
    } catch (e) { /* silent */ }
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
        <input class="form-input" type="text" id="massmoveinput" value="${Utils.escape(this.currentpath)}" />
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" onclick="ServerFiles.domassmove()">Move</button>
      </div>
    `);
  },

  async domassmove() {
    const s = App.currentserver;
    if (!s) return;
    const dir = Utils.el('massmoveinput').value.trim();
    if (!dir) { Modal.close(); return; }
    const items = this.getselectedpaths();
    try {
      for (const { name, root } of items) {
        const destname = dir + '/' + name;
        await Api.renamefile(s.panelurl, s.apikey, s.uuid, root, name, destname);
      }
      Modal.close();
      this.clearselection();
      this.doreload();
    } catch (e) { /* silent */ }
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
    const s = App.currentserver;
    if (!s) return;
    const items = this.getselectedpaths();
    try {
      for (const { name, root } of items) {
        await Api.compressfiles(s.panelurl, s.apikey, s.uuid, root, [name], this.currentpath, null);
      }
      Modal.close();
      this.clearselection();
      this.doreload();
    } catch (e) { /* silent */ }
  },
};
