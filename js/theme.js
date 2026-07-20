const Theme = {
  init() {
    const theme = localStorage.getItem('ctrl_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    Utils.el('themeToggle').addEventListener('click', () => this.toggle());
  },

  toggle() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('ctrl_theme', next);
    this.applytoeditor(next);
  },

  applytoeditor(theme) {
    if (ServerFiles.editor) {
      ServerFiles.editor.setOption('theme', theme === 'dark' ? 'material-darker' : 'default');
    }
  },

  getcurrent() {
    return document.documentElement.getAttribute('data-theme') || 'dark';
  }
};
