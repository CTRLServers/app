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
    Modal.open('Keyboard Shortcuts', this._render(), 'modal-wide');
  },

  close() {
    this._open = false;
    Modal.close();
  },

  _render() {
    const sections = [
      {
        title: 'General',
        shortcuts: [
          ['Ctrl + N', 'Add new server'],
          ['Ctrl + W', 'Close active server window'],
          ['Ctrl + Shift + T', 'Reopen last closed server'],
          ['Ctrl + /', 'Show keyboard shortcuts'],
          ['Ctrl + `', 'Toggle CLI terminal'],
          ['Escape', 'Close editor / modal'],
        ]
      },
      {
        title: 'Dashboard',
        shortcuts: [
          ['Ctrl + 1-9', 'Open server by position'],
          ['Ctrl + R', 'Refresh all servers from API'],
        ]
      },
      {
        title: 'Console (Pterodactyl)',
        shortcuts: [
          ['Ctrl + F', 'Search console output'],
          ['Ctrl + +', 'Increase font size'],
          ['Ctrl + -', 'Decrease font size'],
          ['Up / Down', 'Navigate command history'],
          ['Enter', 'Send command'],
        ]
      },
      {
        title: 'File Manager',
        shortcuts: [
          ['Escape', 'Close file editor'],
        ]
      },
      {
        title: 'CLI Terminal',
        shortcuts: [
          ['Tab', 'Autocomplete command'],
          ['Up / Down', 'Navigate command history'],
          ['Escape', 'Close terminal'],
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
