const Theme = {
  init() {
    const theme = localStorage.getItem('ctrl_theme') || 'dark';
    document.documentelement.setAttribute('data-theme', theme);
    Utils.el('themetoggle').addEventListener('click', () => this.toggle());
  },

  toggle() {
    const current = document.documentelement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentelement.setAttribute('data-theme', next);
    localStorage.setItem('ctrl_theme', next);
    this.applytoeditor(next);
  },

  applytoeditor(theme) {
    if (ServerFiles.editor) {
      ServerFiles.editor.setOption('theme', theme === 'dark' ? 'material-darker' : 'default');
    }
  },

  getcurrent() {
    return document.documentelement.getAttribute('data-theme') || 'dark';
  }
};
