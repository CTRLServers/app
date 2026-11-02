const ServerUsers = {
  users: [],

  PERM_GROUPS: [
    { label: 'users.pg.control', perms: [
      { key: 'control.console', desc: 'users.pd.control_console' },
      { key: 'control.start', desc: 'users.pd.control_start' },
      { key: 'control.stop', desc: 'users.pd.control_stop' },
      { key: 'control.restart', desc: 'users.pd.control_restart' },
      { key: 'control.kill', desc: 'users.pd.control_kill' }
    ]},
    { label: 'users.pg.files', perms: [
      { key: 'file.create', desc: 'users.pd.file_create' },
      { key: 'file.read', desc: 'users.pd.file_read' },
      { key: 'file.update', desc: 'users.pd.file_update' },
      { key: 'file.delete', desc: 'users.pd.file_delete' },
      { key: 'file.archive', desc: 'users.pd.file_archive' },
      { key: 'file.sftp', desc: 'users.pd.file_sftp' }
    ]},
    { label: 'users.pg.backups', perms: [
      { key: 'backup.create', desc: 'users.pd.backup_create' },
      { key: 'backup.read', desc: 'users.pd.backup_read' },
      { key: 'backup.delete', desc: 'users.pd.backup_delete' },
      { key: 'backup.download', desc: 'users.pd.backup_download' },
      { key: 'backup.restore', desc: 'users.pd.backup_restore' }
    ]},
    { label: 'users.pg.network', perms: [
      { key: 'allocation.read', desc: 'users.pd.allocation_read' },
      { key: 'allocation.create', desc: 'users.pd.allocation_create' },
      { key: 'allocation.update', desc: 'users.pd.allocation_update' },
      { key: 'allocation.delete', desc: 'users.pd.allocation_delete' }
    ]},
    { label: 'users.pg.databases', perms: [
      { key: 'database.create', desc: 'users.pd.database_create' },
      { key: 'database.read', desc: 'users.pd.database_read' },
      { key: 'database.update', desc: 'users.pd.database_update' },
      { key: 'database.delete', desc: 'users.pd.database_delete' }
    ]},
    { label: 'users.pg.schedules', perms: [
      { key: 'schedule.create', desc: 'users.pd.schedule_create' },
      { key: 'schedule.read', desc: 'users.pd.schedule_read' },
      { key: 'schedule.update', desc: 'users.pd.schedule_update' },
      { key: 'schedule.delete', desc: 'users.pd.schedule_delete' }
    ]},
    { label: 'users.pg.users', perms: [
      { key: 'user.create', desc: 'users.pd.user_create' },
      { key: 'user.read', desc: 'users.pd.user_read' },
      { key: 'user.update', desc: 'users.pd.user_update' },
      { key: 'user.delete', desc: 'users.pd.user_delete' }
    ]},
    { label: 'users.pg.startup', perms: [
      { key: 'startup.read', desc: 'users.pd.startup_read' },
      { key: 'startup.update', desc: 'users.pd.startup_update' }
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
    const apiKey = await Servers.resolveapikey(server);
    try {
      this.users = await Api.fetchsubusers(server.panelUrl, apiKey, server.uuid);
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
        <h3>${t('users.none.title')}</h3>
        <p>${t('users.none.text')}</p>
        <button class="btn btn-primary" onclick="ServerUsers.showinvite()">${t('users.invite')}</button>
      </div></div>`;
      return;
    }

    let html = `<div class="perm-content">
      <div class="perm-header">
        <div class="network-info-box">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
          <span>${t('users.count', { n: this.users.length })}</span>
        </div>
        <button class="btn btn-primary btn-sm" onclick="ServerUsers.showinvite()">${t('users.invite')}</button>
      </div>
      <div class="perm-users-list">`;

    for (let i = 0; i < this.users.length; i++) {
      const u = this.users[i];
      const attrs = u.attributes || u;
      const userId = attrs.uuid;
      const email = attrs.email || t('users.unknown');
      const username = attrs.username || email.split('@')[0];
      const perms = attrs.permissions || [];
      const avatarImg = attrs.image;

      html += `<div class="perm-user-card">
        <div class="perm-user-header">
          <div class="perm-user-info">
            <div class="perm-user-avatar">${avatarImg ? `<img src="${Utils.escape(avatarImg)}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" />` : Utils.escape(username.charAt(0).toUpperCase())}</div>
            <div>
              <div class="perm-user-name">${Utils.escape(username)}</div>
              <div class="perm-user-email">${Utils.escape(email)}</div>
            </div>
          </div>
          <div class="perm-user-actions">
            <button class="btn btn-secondary btn-sm" onclick="ServerUsers.showedit(${i})">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
              ${t('users.editbtn')}
            </button>
            <button class="btn-icon btn-danger-sm" onclick="ServerUsers.confirmdelete(${i})" title="${t('users.remove')}">
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
        html += `<span class="text-muted" style="font-size:12px;">${t('users.noperms')}</span>`;
      }

      html += `</div></div>`;
    }

    html += '</div></div>';
    tab.innerHTML = html;
  },

  showinvite() {
    Modal.open(t('users.invite.title'), `
      <div class="form-group">
        <label class="form-label">${t('users.email')}</label>
        <input class="form-input" type="email" id="subuserEmail" placeholder="user@example.com" />
      </div>
      <div class="form-group">
        <label class="form-label">${t('users.quicktpl')}</label>
        <div class="perm-template-row">
          <button class="btn btn-sm btn-secondary perm-tpl-btn" onclick="ServerUsers.applytemplate('readonly')">${t('users.tpl.readonly')}</button>
          <button class="btn btn-sm btn-secondary perm-tpl-btn" onclick="ServerUsers.applytemplate('moderator')">${t('users.tpl.moderator')}</button>
          <button class="btn btn-sm btn-secondary perm-tpl-btn" onclick="ServerUsers.applytemplate('admin')">${t('users.tpl.admin')}</button>
          <button class="btn btn-sm btn-secondary perm-tpl-btn" onclick="ServerUsers.applytemplate('developer')">${t('users.tpl.developer')}</button>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">${t('users.permissions')}</label>
        <div class="perm-checkboxes" id="subuserPerms">
          ${this.buildpermcheckboxes([])}
        </div>
      </div>
      <div id="subuserError"></div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" id="subuserInviteBtn">${t('users.invite.btn')}</button>
      </div>
    `);
    setTimeout(() => {
      document.getElementById('subuserInviteBtn').addEventListener('click', async () => {
        const email = document.getElementById('subuserEmail').value.trim();
        const perms = this.getcheckedperms();
        const err = document.getElementById('subuserError');
        if (!email) { err.innerHTML = `<div class="error-msg">${t('users.emailrequired')}</div>`; return; }
        const server = App.currentServer;
        const apiKey = await Servers.resolveapikey(server);
        try {
          await Api.invitesubuser(server.panelUrl, apiKey, server.uuid, email, perms);
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
    const userId = attrs.uuid;
    const email = attrs.email || '';
    const username = attrs.username || email.split('@')[0];
    const perms = attrs.permissions || [];
    const avatarImg = attrs.image;

    Modal.open(t('users.edit.title'), `
      <div class="perm-edit-header">
        <div class="perm-user-avatar" style="width:36px;height:36px;font-size:14px;">${avatarImg ? `<img src="${Utils.escape(avatarImg)}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" />` : Utils.escape(username.charAt(0).toUpperCase())}</div>
        <span style="font-size:14px;font-weight:500;">${Utils.escape(username)}</span>
      </div>
      <div class="form-group">
        <label class="form-label">${t('users.quicktpl')}</label>
        <div class="perm-template-row">
          <button class="btn btn-sm btn-secondary perm-tpl-btn" onclick="ServerUsers.applytemplate('readonly')">${t('users.tpl.readonly')}</button>
          <button class="btn btn-sm btn-secondary perm-tpl-btn" onclick="ServerUsers.applytemplate('moderator')">${t('users.tpl.moderator')}</button>
          <button class="btn btn-sm btn-secondary perm-tpl-btn" onclick="ServerUsers.applytemplate('admin')">${t('users.tpl.admin')}</button>
          <button class="btn btn-sm btn-secondary perm-tpl-btn" onclick="ServerUsers.applytemplate('developer')">${t('users.tpl.developer')}</button>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">${t('users.permissions')}</label>
        <div class="perm-checkboxes" id="subuserPerms">
          ${this.buildpermcheckboxes(perms)}
        </div>
      </div>
      <div id="subuserError"></div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" id="subuserSaveBtn">${t('sched.save')}</button>
      </div>
    `);
    setTimeout(() => {
      document.getElementById('subuserSaveBtn').addEventListener('click', async () => {
        const newPerms = this.getcheckedperms();
        const err = document.getElementById('subuserError');
        const server = App.currentServer;
        const apiKey = await Servers.resolveapikey(server);
        try {
          await Api.updatesubuser(server.panelUrl, apiKey, server.uuid, userId, newPerms);
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
        <div class="perm-group-label">${Utils.escape(t(group.label))}</div>`;
      for (const p of group.perms) {
        const checked = selected.includes(p.key) ? 'checked' : '';
        html += `<label class="perm-check-item">
          <input type="checkbox" class="perm-cb" value="${p.key}" ${checked} />
          <div class="perm-check-content">
            <span class="perm-check-key">${Utils.escape(p.key)}</span>
            <span class="perm-check-desc">${Utils.escape(t(p.desc))}</span>
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
    const userId = attrs.uuid;
    const email = attrs.email || t('users.unknown');
    Modal.confirm(t('users.remove.title'), t('users.remove.confirm', { email: email }), async () => {
      const server = App.currentServer;
      const apiKey = await Servers.resolveapikey(server);
      try {
        await Api.deletesubuser(server.panelUrl, apiKey, server.uuid, userId);
        this.load();
      } catch (e) {}
    });
  }
};
