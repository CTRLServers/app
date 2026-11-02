const CheatSheet = {
  _open: false,

  init() {
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === '/') {
        e.preventDefault();
        this.toggle();
      }
    });
  },

  toggle() {
    this._open ? this.close() : this.open();
  },

  open() {
    this._open = true;
    Modal.open(t('cheatsheet.title'), this._render(), 'modal-wide');
  },

  close() {
    this._open = false;
    Modal.close();
  },

  _render() {
    const sections = [
      {
        title: t('cheatsheet.section.general'),
        shortcuts: [
          ['Ctrl + N', t('cheatsheet.general.add_server')],
          ['Ctrl + W', t('cheatsheet.general.close_window')],
          ['Ctrl + Shift + T', t('cheatsheet.general.reopen')],
          ['Ctrl + /', t('cheatsheet.general.show_shortcuts')],
          ['Ctrl + `', t('cheatsheet.general.toggle_cli')],
          ['Escape', t('cheatsheet.general.close_modal')],
        ]
      },
      {
        title: t('cheatsheet.section.dashboard'),
        shortcuts: [
          ['Ctrl + 1-9', t('cheatsheet.dashboard.open_server')],
          ['Ctrl + R', t('cheatsheet.dashboard.refresh')],
        ]
      },
      {
        title: t('cheatsheet.section.console'),
        shortcuts: [
          ['Ctrl + F', t('cheatsheet.console.search')],
          ['Ctrl + +', t('cheatsheet.console.font_up')],
          ['Ctrl + -', t('cheatsheet.console.font_down')],
          ['Up / Down', t('cheatsheet.console.history')],
          ['Enter', t('cheatsheet.console.send')],
        ]
      },
      {
        title: t('cheatsheet.section.files'),
        shortcuts: [
          ['Escape', t('cheatsheet.files.close_editor')],
        ]
      },
      {
        title: t('cheatsheet.section.cli'),
        shortcuts: [
          ['Tab', t('cheatsheet.cli.autocomplete')],
          ['Up / Down', t('cheatsheet.cli.history')],
          ['Escape', t('cheatsheet.cli.close')],
        ]
      },
    ];

    return `
      <div class="cheatsheet">
        ${sections.map(s => `
          <div class="cheatsheet-section">
            <div class="cheatsheet-title">${s.title}</div>
            <div class="cheatsheet-list">
              ${s.shortcuts.map(([key, desc]) => `
                <div class="cheatsheet-row">
                  <span class="cheatsheet-keys">${key.split(' + ').map(k => `<kbd class="cheatsheet-kbd">${k}</kbd>`).join('<span class="cheatsheet-plus">+</span>')}</span>
                  <span class="cheatsheet-desc">${desc}</span>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>`;
  }
};
