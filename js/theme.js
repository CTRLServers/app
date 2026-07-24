const Theme = {
  themes: ['dark', 'light', 'oled'],

  _icons: {
    dark: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
    light: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
    oled: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="12" r="3"/></svg>',
  },

  init() {
    const theme = localStorage.getItem('ctrl_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    this.updateicon(theme);
    Utils.el('themeToggle').addEventListener('click', () => this.toggle());
  },

  toggle() {
    const current = document.documentElement.getAttribute('data-theme');
    const idx = this.themes.indexOf(current);
    const next = this.themes[(idx + 1) % this.themes.length];
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('ctrl_theme', next);
    this.updateicon(next);
    this.applytoeditor(next);
  },

  settheme(theme) {
    if (!this.themes.includes(theme)) return;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ctrl_theme', theme);
    this.updateicon(theme);
    this.applytoeditor(theme);
  },

  updateicon(theme) {
    const el = Utils.el('themeToggleIcon');
    if (el) el.innerHTML = this._icons[theme] || this._icons.dark;
  },

  applytoeditor(theme) {
    if (ServerFiles.editor) {
      ServerFiles.editor.setOption('theme', theme === 'dark' || theme === 'oled' ? 'material-darker' : 'default');
    }
    if (VPSConsole && VPSConsole.term) {
      VPSConsole.term.options.theme = VPSConsole._getxtermtheme();
    }
  },

  getcurrent() {
    return document.documentElement.getAttribute('data-theme') || 'dark';
  }
};
