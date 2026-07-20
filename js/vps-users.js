const VPSUsers = {
  server: null,
  loading: false,
  users: [],
  loggedin: [],
  sudogroup: 'sudo',

  async load() {
    this.server = App.currentserver;
    if (!this.server || this.server.type !== 'VPS/VDS') return;

    this.loading = true;
    this.render();

    try {
      await this.detectsudogroup();
      await Promise.all([this.fetchusers(), this.fetchloggedin()]);
    } catch (e) {
      console.error('Users load error:', e);
    }

    this.loading = false;
    this.render();
  },

  async detectsudogroup() {
    const r = await this.exec('getent group sudo 2>/dev/null | head -1');
    if (r.exitcode === 0 && r.stdout.trim()) {
      this.sudogroup = 'sudo';
    } else {
      const r2 = await this.exec('getent group wheel 2>/dev/null | head -1');
      if (r2.exitcode === 0 && r2.stdout.trim()) {
        this.sudogroup = 'wheel';
      }
    }
  },

  async fetchusers() {
    const r = await this.exec("cat /etc/passwd | awk -F: '$3 >= 1000 || $3 == 0 {print $1\":\"$3\":\"$4\":\"$6\":\"$7}'");
    this.users = [];
    if (r.exitcode !== 0 || !r.stdout.trim()) return;

    const sudor = await this.exec(`getent group ${this.sudogroup} 2>/dev/null`);
    const sudomembers = new Set();
    if (sudor.exitcode === 0 && sudor.stdout.trim()) {
      const parts = sudor.stdout.split(':');
      if (parts[2]) {
        parts[2].split(',').forEach(m => sudomembers.add(m.trim()));
      }
    }

    for (const line of r.stdout.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const [name, uid, gid, home, shell] = trimmed.split(':');
      this.users.push({
        name,
        uid: parseInt(uid),
        gid: parseInt(gid),
        home,
        shell,
        isroot: parseInt(uid) === 0,
        issudo: sudomembers.has(name)
      });
    }
    this.users.sort((a, b) => a.uid - b.uid);
  },

  async fetchloggedin() {
    const r = await this.exec('who 2>/dev/null');
    this.loggedin = [];
    if (r.exitcode !== 0 || !r.stdout.trim()) return;

    for (const line of r.stdout.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 5) {
        this.loggedin.push({
          user: parts[0],
          terminal: parts[1],
          from: parts[2],
          time: parts.slice(3).join(' ')
        });
      }
    }
  },

  async adduser(username, password) {
    const r = await this.exec(`useradd -m -s /bin/bash '${username.replace(/'/g, "'\\''")}' 2>&1`);
    if (r.exitcode !== 0) return { error: r.stdout || r.stderr || 'Failed to create user' };

    if (password) {
      const pw = await this.exec(`echo '${username.replace(/'/g, "'\\''")}:${password.replace(/'/g, "'\\''")}' | chpasswd 2>&1`);
      if (pw.exitcode !== 0) return { error: 'User created but failed to set password: ' + (pw.stdout || pw.stderr) };
    }
    return { success: true };
  },

  async deleteuser(username) {
    const r = await this.exec(`userdel -r '${username.replace(/'/g, "'\\''")}' 2>&1`);
    return r.exitcode === 0 ? { success: true } : { error: r.stdout || r.stderr || 'Failed to delete user' };
  },

  async changepassword(username, password) {
    const r = await this.exec(`echo '${username.replace(/'/g, "'\\''")}:${password.replace(/'/g, "'\\''")}' | chpasswd 2>&1`);
    return r.exitcode === 0 ? { success: true } : { error: r.stdout || r.stderr || 'Failed to change password' };
  },

  async togglesudo(username, add) {
    if (add) {
      const r = await this.exec(`usermod -ag ${this.sudogroup} '${username.replace(/'/g, "'\\''")}' 2>&1`);
      return r.exitcode === 0 ? { success: true } : { error: r.stdout || r.stderr || 'Failed to add to sudo' };
    } else {
      const r = await this.exec(`deluser '${username.replace(/'/g, "'\\''")}' ${this.sudogroup} 2>&1`);
      return r.exitcode === 0 ? { success: true } : { error: r.stdout || r.stderr || 'Failed to remove from sudo' };
    }
  },

  async exec(command) {
    const cfg = {
      host: this.server.host,
      port: this.server.port || 22,
      username: this.server.username || 'root'
    };
    if (this.server.authtype === 'key' && this.server.privatekey) {
      cfg.authtype = 'privatekey';
      cfg.privatekey = this.server.privatekey;
    } else {
      cfg.authtype = 'password';
      cfg.password = this.server.password || '';
    }
    const isroot = (this.server.username || 'root') === 'root';
    if (isroot) {
      return await window.electronapi.sshexec(cfg, command);
    }
    const pass = (this.server.password || '').replace(/'/g, "'\\''");
    const wrapped = command.replace(/'/g, "'\\''");
    return await window.electronapi.sshexec(cfg, `echo '${pass}' | sudo -S sh -c '${wrapped}' 2>/dev/null`);
  },

  render() {
    const tab = Utils.el('tabvpsusers');
    if (!tab) return;

    if (this.loading) {
      tab.innerHTML = '<div class="loading"><div class="spinner"></div><div class="loading-text">Loading users...</div></div>';
      return;
    }

    const loggedinnames = new Set(this.loggedin.map(l => l.user));

    let html = `<div class="vps-users-container">
      <div class="fw-card">
        <div class="fw-card-header">
          <h3>Logged In</h3>
          <span class="packages-count-badge">${this.loggedin.length}</span>
        </div>
        <div class="fw-card-body">`;

    if (this.loggedin.length > 0) {
      html += `<div class="vps-users-loggedin">`;
      for (const l of this.loggedin) {
        html += `<div class="vps-loggedin-item">
          <span class="vps-loggedin-dot"></span>
          <span class="vps-loggedin-user">${Utils.escape(l.user)}</span>
          <span class="vps-loggedin-detail">${Utils.escape(l.terminal)} from ${Utils.escape(l.from)}</span>
          <span class="vps-loggedin-time">${Utils.escape(l.time)}</span>
        </div>`;
      }
      html += '</div>';
    } else {
      html += '<div class="fw-empty">No users currently logged in</div>';
    }

    html += `</div></div>

      <div class="fw-card">
        <div class="fw-card-header">
          <h3>System Users</h3>
          <button class="btn btn-primary btn-sm" onclick="VPSUsers.showadduser()">Add User</button>
        </div>
        <div class="fw-card-body">
          <div class="vps-users-table-wrap"><table class="fw-table">
            <thead><tr><th>User</th><th>UID</th><th>Home</th><th>Shell</th><th>Groups</th><th></th></tr></thead>
            <tbody>`;

    for (const u of this.users) {
      const isonline = loggedinnames.has(u.name);
      html += `<tr>
        <td>
          <div class="vps-user-name">
            ${isonline ? '<span class="vps-loggedin-dot"></span>' : ''}
            <span>${Utils.escape(u.name)}</span>
            ${u.isroot ? '<span class="pkg-badge-installed" style="background:rgba(239,68,68,0.1);color:#ef4444;">root</span>' : ''}
          </div>
        </td>
        <td>${u.uid}</td>
        <td><code>${Utils.escape(u.home)}</code></td>
        <td><code>${Utils.escape(u.shell)}</code></td>
        <td>`;

      if (u.isroot) html += '<span class="fw-action fw-action-deny">root</span> ';
      if (u.issudo) html += `<span class="fw-action fw-action-allow">${this.sudogroup}</span>`;

      html += `</td>
        <td>`;

      if (!u.isroot) {
        html += `<div class="vps-user-actions">
          <button class="btn btn-secondary btn-sm" onclick="VPSUsers.showchangepassword('${Utils.escape(u.name)}')" title="Change Password">
            <svg width="13" height="13" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </button>
          <button class="btn btn-secondary btn-sm" onclick="VPSUsers.togglesudouser('${Utils.escape(u.name)}', ${!u.issudo})" title="${u.issudo ? 'Remove Sudo' : 'Grant Sudo'}">
            <svg width="13" height="13" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </button>
          <button class="btn-icon btn-danger-sm" onclick="VPSUsers.confirmdelete('${Utils.escape(u.name)}')" title="Delete User">
            <svg width="14" height="14" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>`;
      }

      html += '</td></tr>';
    }

    html += '</tbody></table></div></div></div></div>';

    tab.innerHTML = html;
  },

  showadduser() {
    Modal.open('Add User', `
      <div class="form-group">
        <label class="form-label">Username</label>
        <input class="form-input" type="text" id="vpsnewuser" placeholder="username" />
      </div>
      <div class="form-group">
        <label class="form-label">Password</label>
        <input class="form-input" type="password" id="vpsnewpass" placeholder="password" />
      </div>
      <div id="vpsusererror"></div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" id="vpsadduserbtn">Create User</button>
      </div>
    `);
    setTimeout(() => {
      const btn = Utils.el('vpsadduserbtn');
      if (btn) btn.addEventListener('click', async () => {
        const name = Utils.el('vpsnewuser').value.trim();
        const pass = Utils.el('vpsnewpass').value;
        const err = Utils.el('vpsusererror');
        if (!name) { err.innerHTML = '<div class="error-msg">Username required</div>'; return; }
        btn.disabled = true;
        btn.textContent = 'Creating...';
        const res = await VPSUsers.adduser(name, pass);
        if (res.error) {
          err.innerHTML = `<div class="error-msg">${Utils.escape(res.error)}</div>`;
          btn.disabled = false;
          btn.textContent = 'Create User';
          return;
        }
        Modal.close();
        await VPSUsers.fetchusers();
        VPSUsers.render();
      });
    }, 0);
  },

  showchangepassword(username) {
    Modal.open('Change Password', `
      <div class="form-group">
        <label class="form-label">New Password for ${Utils.escape(username)}</label>
        <input class="form-input" type="password" id="vpschangepass" placeholder="new password" />
      </div>
      <div id="vpspasserror"></div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" id="vpschangepassbtn">Change Password</button>
      </div>
    `);
    setTimeout(() => {
      const btn = Utils.el('vpschangepassbtn');
      if (btn) btn.addEventListener('click', async () => {
        const pass = Utils.el('vpschangepass').value;
        const err = Utils.el('vpspasserror');
        if (!pass) { err.innerHTML = '<div class="error-msg">Password required</div>'; return; }
        btn.disabled = true;
        btn.textContent = 'Changing...';
        const res = await VPSUsers.changepassword(username, pass);
        if (res.error) {
          err.innerHTML = `<div class="error-msg">${Utils.escape(res.error)}</div>`;
          btn.disabled = false;
          btn.textContent = 'Change Password';
          return;
        }
        Modal.close();
      });
    }, 0);
  },

  async togglesudouser(username, add) {
    await this.togglesudo(username, add);
    await this.fetchusers();
    this.render();
  },

  confirmdelete(username) {
    Modal.confirm('Delete User', `Are you sure you want to delete "${username}"? This will remove their home directory.`, async () => {
      const res = await this.deleteuser(username);
      if (res.error) {
        Modal.open('Error', `<div class="error-msg">${Utils.escape(res.error)}</div><div class="modal-actions"><button class="btn btn-secondary" onclick="Modal.close()">OK</button></div>`);
        return;
      }
      await this.fetchusers();
      this.render();
    });
  }
};
