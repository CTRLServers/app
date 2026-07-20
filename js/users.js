const ServerUsers = {
  users: [],

  PERM_GROUPS: [
    { label: 'Server Control', perms: [
      { key: 'control.console', desc: 'View console and send commands' },
      { key: 'control.start', desc: 'Start the server' },
      { key: 'control.stop', desc: 'Stop the server' },
      { key: 'control.restart', desc: 'Restart the server' },
      { key: 'control.kill', desc: 'Force kill the server' }
    ]},
    { label: 'File Management', perms: [
      { key: 'file.create', desc: 'Create files and directories' },
      { key: 'file.read', desc: 'View file contents' },
      { key: 'file.update', desc: 'Modify files' },
      { key: 'file.delete', desc: 'Delete files' },
      { key: 'file.archive', desc: 'Create/extract archives' },
      { key: 'file.sftp', desc: 'Access via SFTP' }
    ]},
    { label: 'Backups', perms: [
      { key: 'backup.create', desc: 'Create backups' },
      { key: 'backup.read', desc: 'View backups' },
      { key: 'backup.delete', desc: 'Delete backups' },
      { key: 'backup.download', desc: 'Download backups' },
      { key: 'backup.restore', desc: 'Restore backups' }
    ]},
    { label: 'Network', perms: [
      { key: 'allocation.read', desc: 'View allocations' },
      { key: 'allocation.create', desc: 'Assign allocations' },
      { key: 'allocation.update', desc: 'Modify allocations' },
      { key: 'allocation.delete', desc: 'Remove allocations' }
    ]},
    { label: 'Databases', perms: [
      { key: 'database.create', desc: 'Create databases' },
      { key: 'database.read', desc: 'View databases' },
      { key: 'database.update', desc: 'Rotate passwords' },
      { key: 'database.delete', desc: 'Delete databases' }
    ]},
    { label: 'Schedules', perms: [
      { key: 'schedule.create', desc: 'Create schedules' },
      { key: 'schedule.read', desc: 'View schedules' },
      { key: 'schedule.update', desc: 'Modify schedules' },
      { key: 'schedule.delete', desc: 'Delete schedules' }
    ]},
    { label: 'User Management', perms: [
      { key: 'user.create', desc: 'Invite subusers' },
      { key: 'user.read', desc: 'View subusers' },
      { key: 'user.update', desc: 'Modify permissions' },
      { key: 'user.delete', desc: 'Remove subusers' }
    ]},
    { label: 'Startup', perms: [
      { key: 'startup.read', desc: 'View startup config' },
      { key: 'startup.update', desc: 'Modify variables' }
    ]}
  ],

  TEMPLATES: [
    {
      label: 'Read-Only',
      perms: ['control.console', 'file.read', 'backup.read', 'allocation.read', 'database.read', 'schedule.read', 'user.read', 'startup.read']
    },
    {
      label: 'Moderator',
      perms: ['control.console', 'control.start', 'control.stop', 'control.restart', 'file.read', 'file.update', 'backup.read', 'backup.create']
    },
    {
      label: 'Admin',
      perms: ['control.console','control.start','control.stop','control.restart','control.kill','file.create','file.read','file.update','file.delete','file.archive','file.sftp','backup.create','backup.read','backup.delete','backup.download','backup.restore','allocation.read','allocation.create','allocation.update','allocation.delete','database.create','database.read','database.update','database.delete','schedule.create','schedule.read','schedule.update','schedule.delete','user.create','user.read','user.update','user.delete','startup.read','startup.update']
    },
    {
      label: 'Developer',
      perms: ['control.console', 'control.start', 'control.stop', 'control.restart', 'file.create', 'file.read', 'file.update', 'file.delete', 'file.archive', 'file.sftp', 'backup.create', 'backup.read', 'backup.download', 'database.read', 'startup.read']
    }
  ],

  async load() {
    const server = App.currentServer;
    if (!server || server.type !== 'Pterodactyl') return;
    try {
      this.users = await Api.fetchsubusers(server.panelUrl, server.apiKey, server.uuid);
    } catch (e) {
      this.users = [];
    }
    this.render();
  },

  render() {
    const tab = Utils.el('tabUsers');
    if (!tab) return;
    if (!this.users.length) {
      tab.innerHTML = `<div class="perm-content"><div class="perm-empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        <h3>No subusers yet</h3>
        <p>Invite users to grant them access to this server</p>
        <button class="btn btn-primary" onclick="ServerUsers.showinvite()">Invite User</button>
      </div></div>`;
      return;
    }

    let html = `<div class="perm-content">
      <div class="perm-header">
        <div class="network-info-box">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
          <span>${this.users.length} subuser${this.users.length !== 1 ? 's' : ''} with access to this server</span>
        </div>
        <button class="btn btn-primary btn-sm" onclick="ServerUsers.showinvite()">Invite User</button>
      </div>
      <div class="perm-users-list">`;

    for (let i = 0; i < this.users.length; i++) {
      const u = this.users[i];
      const attrs = u.attributes || u;
      const userId = u.id || attrs.id;
      const email = attrs.email || 'Unknown';
      const username = attrs.username || email.split('@')[0];
      const perms = attrs.permissions || [];

      html += `<div class="perm-user-card">
        <div class="perm-user-header">
          <div class="perm-user-info">
            <div class="perm-user-avatar">${Utils.escape(username.charAt(0).toUpperCase())}</div>
            <div>
              <div class="perm-user-name">${Utils.escape(username)}</div>
              <div class="perm-user-email">${Utils.escape(email)}</div>
            </div>
          </div>
          <div class="perm-user-actions">
            <button class="btn btn-secondary btn-sm" onclick="ServerUsers.showedit(${i})">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
              Edit
            </button>
            <button class="btn-icon btn-danger-sm" onclick="ServerUsers.confirmdelete(${i})" title="Remove">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>
        <div class="perm-user-perms">`;

      if (perms.length) {
        const grouped = {};
        for (const p of perms) {
          const prefix = p.split('.')[0];
          if (!grouped[prefix]) grouped[prefix] = [];
          grouped[prefix].push(p);
        }
        for (const [group, groupPerms] of Object.entries(grouped)) {
          html += `<div class="perm-chip-group">
            <span class="perm-chip-group-label">${Utils.escape(group)}</span>
            ${groupPerms.map(p => `<span class="perm-chip">${Utils.escape(p.split('.')[1])}</span>`).join('')}
          </div>`;
        }
      } else {
        html += '<span class="text-muted" style="font-size:12px;">No permissions assigned</span>';
      }

      html += `</div></div>`;
    }

    html += '</div></div>';
    tab.innerHTML = html;
  },

  showinvite() {
    Modal.open('Invite Subuser', `
      <div class="form-group">
        <label class="form-label">Email</label>
        <input class="form-input" type="email" id="subuserEmail" placeholder="user@example.com" />
      </div>
      <div class="form-group">
        <label class="form-label">Quick Template</label>
        <div class="perm-template-row">
          <button class="btn btn-sm btn-secondary perm-tpl-btn" onclick="ServerUsers.applytemplate('readonly')">Read-Only</button>
          <button class="btn btn-sm btn-secondary perm-tpl-btn" onclick="ServerUsers.applytemplate('moderator')">Moderator</button>
          <button class="btn btn-sm btn-secondary perm-tpl-btn" onclick="ServerUsers.applytemplate('admin')">Admin</button>
          <button class="btn btn-sm btn-secondary perm-tpl-btn" onclick="ServerUsers.applytemplate('developer')">Developer</button>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Permissions</label>
        <div class="perm-checkboxes" id="subuserPerms">
          ${this.buildpermcheckboxes([])}
        </div>
      </div>
      <div id="subuserError"></div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" id="subuserInviteBtn">Invite</button>
      </div>
    `);
    setTimeout(() => {
      document.getElementById('subuserInviteBtn').addEventListener('click', async () => {
        const email = document.getElementById('subuserEmail').value.trim();
        const perms = this.getcheckedperms();
        const err = document.getElementById('subuserError');
        if (!email) { err.innerHTML = '<div class="error-msg">Email required</div>'; return; }
        const server = App.currentServer;
        try {
          await Api.invitesubuser(server.panelUrl, server.apiKey, server.uuid, email, perms);
          Modal.close();
          this.load();
        } catch (e) {
          err.innerHTML = `<div class="error-msg">${e.message}</div>`;
        }
      });
    }, 0);
  },

  showedit(idx) {
    const u = this.users[idx];
    if (!u) return;
    const attrs = u.attributes || u;
    const userId = u.id || attrs.id;
    const email = attrs.email || '';
    const perms = attrs.permissions || [];

    Modal.open('Edit Subuser', `
      <div class="perm-edit-header">
        <div class="perm-user-avatar" style="width:36px;height:36px;font-size:14px;">${Utils.escape(email.charAt(0).toUpperCase())}</div>
        <span style="font-size:14px;font-weight:500;">${Utils.escape(email)}</span>
      </div>
      <div class="form-group">
        <label class="form-label">Quick Template</label>
        <div class="perm-template-row">
          <button class="btn btn-sm btn-secondary perm-tpl-btn" onclick="ServerUsers.applytemplate('readonly')">Read-Only</button>
          <button class="btn btn-sm btn-secondary perm-tpl-btn" onclick="ServerUsers.applytemplate('moderator')">Moderator</button>
          <button class="btn btn-sm btn-secondary perm-tpl-btn" onclick="ServerUsers.applytemplate('admin')">Admin</button>
          <button class="btn btn-sm btn-secondary perm-tpl-btn" onclick="ServerUsers.applytemplate('developer')">Developer</button>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Permissions</label>
        <div class="perm-checkboxes" id="subuserPerms">
          ${this.buildpermcheckboxes(perms)}
        </div>
      </div>
      <div id="subuserError"></div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" id="subuserSaveBtn">Save Changes</button>
      </div>
    `);
    setTimeout(() => {
      document.getElementById('subuserSaveBtn').addEventListener('click', async () => {
        const newPerms = this.getcheckedperms();
        const err = document.getElementById('subuserError');
        const server = App.currentServer;
        try {
          await Api.updatesubuser(server.panelUrl, server.apiKey, server.uuid, userId, newPerms);
          Modal.close();
          this.load();
        } catch (e) {
          err.innerHTML = `<div class="error-msg">${e.message}</div>`;
        }
      });
    }, 0);
  },

  buildpermcheckboxes(selected) {
    let html = '';
    for (const group of this.PERM_GROUPS) {
      html += `<div class="perm-group">
        <div class="perm-group-label">${Utils.escape(group.label)}</div>`;
      for (const p of group.perms) {
        const checked = selected.includes(p.key) ? 'checked' : '';
        html += `<label class="perm-check-item">
          <input type="checkbox" class="perm-cb" value="${p.key}" ${checked} />
          <div class="perm-check-content">
            <span class="perm-check-key">${Utils.escape(p.key)}</span>
            <span class="perm-check-desc">${Utils.escape(p.desc)}</span>
          </div>
        </label>`;
      }
      html += '</div>';
    }
    return html;
  },

  getcheckedperms() {
    return Array.from(document.querySelectorAll('.perm-cb:checked')).map(cb => cb.value);
  },

  applytemplate(name) {
    const tpl = this.TEMPLATES.find(t => t.label.toLowerCase() === name);
    if (!tpl) return;
    document.querySelectorAll('.perm-cb').forEach(cb => {
      cb.checked = tpl.perms.includes(cb.value);
    });
  },

  confirmdelete(idx) {
    const u = this.users[idx];
    if (!u) return;
    const attrs = u.attributes || u;
    const userId = u.id || attrs.id;
    const email = attrs.email || 'Unknown';
    Modal.confirm('Remove Subuser', `Remove "${email}" from this server?`, async () => {
      const server = App.currentServer;
      try {
        await Api.deletesubuser(server.panelUrl, server.apiKey, server.uuid, userId);
        this.load();
      } catch (e) {}
    });
  }
};
