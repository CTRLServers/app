const ServerBackups = {
  loading: false,
  backups: [],

  async load() {
    const s = App.currentServer;
    if (!s || s.type !== 'Pterodactyl') return;
    this.loading = true;
    this.render();
    try {
      const data = await Api.fetchbackups(s.panelUrl, s.apiKey, s.uuid);
      this.backups = data.map(b => {
        const attrs = b.attributes || b;
        attrs.id = b.id || attrs.id;
        return attrs;
      });
    } catch (e) {
      console.error(e);
      this.backups = [];
    } finally {
      this.loading = false;
    }
    this.render();
  },

  opencreatemodal() {
    Modal.open('Create Backup', `
      <div class="form-group">
        <label class="form-label">Backup Name</label>
        <p style="font-size:12px;color:var(--text-muted);margin:0 0 6px;">If provided, the name that should be used to reference this backup.</p>
        <input type="text" class="form-input" id="backupName" placeholder="Optional backup name" />
      </div>
      <div class="form-group">
        <label class="form-label">Ignored Files & Directories</label>
        <p style="font-size:12px;color:var(--text-muted);margin:0 0 6px;">Enter the files or folders to ignore while generating this backup. Leave blank to use the contents of the .pteroignore file in the root of the server directory if present. Wildcard matching of files and folders is supported in addition to negating a rule by prefixing the path with an exclamation point.</p>
        <input type="text" class="form-input" id="backupIgnored" placeholder="e.g. cache/, *.log" />
      </div>
      <div class="form-group" style="display:flex;align-items:center;gap:8px;">
        <input type="checkbox" id="backupLocked" style="width:auto;" />
        <div>
          <label for="backupLocked" style="margin:0;font-size:13px;font-weight:500;color:var(--text-primary);cursor:pointer;">Locked</label>
          <p style="font-size:12px;color:var(--text-muted);margin:2px 0 0;">Prevents this backup from being deleted until explicitly unlocked.</p>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" id="backupCreateBtn">Start Backup</button>
      </div>
    `);
    setTimeout(() => {
      const btn = Utils.el('backupCreateBtn');
      if (btn) btn.addEventListener('click', async () => {
        const s = App.currentServer;
        if (!s) return;
        const name = document.getElementById('backupName').value.trim();
        const ignored = document.getElementById('backupIgnored').value.trim();
        const locked = document.getElementById('backupLocked').checked;
        btn.disabled = true;
        btn.textContent = 'Creating...';
        try {
          const ok = await Api.createbackup(s.panelUrl, s.apiKey, s.uuid, name, ignored, locked);
          if (ok) {
            Modal.close();
            await this.load();
          } else {
            alert('Failed to create backup');
            btn.disabled = false;
            btn.textContent = 'Start Backup';
          }
        } catch (e) {
          console.error(e);
          alert('Failed to create backup');
          btn.disabled = false;
          btn.textContent = 'Start Backup';
        }
      });
    }, 0);
  },

  async deletebackup(idx) {
    const backup = this.backups[idx];
    if (!backup) return;
    if (backup.is_locked) {
      alert('Unlock the backup before deleting.');
      return;
    }
    Modal.confirm('Delete Backup', `Delete backup "${backup.name}"? This cannot be undone.`, async () => {
      const s = App.currentServer;
      if (!s) return;
      try {
        await Api.deletebackup(s.panelUrl, s.apiKey, s.uuid, backup.uuid);
        await this.load();
      } catch (e) {
        console.error(e);
      }
    });
  },

  async restorebackup(idx) {
    const backup = this.backups[idx];
    if (!backup) return;
    Modal.confirm('Restore Backup', `Restore server from backup "${backup.name}"? Current files will be truncated.`, async () => {
      const s = App.currentServer;
      if (!s) return;
      try {
        await Api.restorebackup(s.panelUrl, s.apiKey, s.uuid, backup.uuid);
        await this.load();
      } catch (e) {
        console.error(e);
      }
    });
  },

  async downloadbackup(idx) {
    const backup = this.backups[idx];
    if (!backup) return;
    const s = App.currentServer;
    if (!s) return;
    try {
      const url = await Api.downloadbackup(s.panelUrl, s.apiKey, s.uuid, backup.uuid);
      if (url) {
        window.open(url, '_blank');
      } else {
        alert('Failed to get download URL');
      }
    } catch (e) {
      console.error(e);
    }
  },

  async togglelock(idx) {
    const backup = this.backups[idx];
    if (!backup) return;
    const s = App.currentServer;
    if (!s) return;
    try {
      await Api.togglebackuplock(s.panelUrl, s.apiKey, s.uuid, backup.uuid);
      await this.load();
    } catch (e) {
      console.error(e);
    }
  },

  formatdate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
    return d.toLocaleDateString();
  },

  formatbytes(b) {
    if (!b || b === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(b) / Math.log(k));
    return parseFloat((b / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  },

  render() {
    const container = Utils.el('tabBackups');
    if (!container) return;
    if (this.loading) {
      container.innerHTML = '<div class="tab-loading"><svg class="spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15A9 9 0 1 1 5.64 5.64L1 10"/></svg></div>';
      return;
    }
    let html = `
      <div class="backups-content">
        <div class="network-header">
          <div class="network-info-box">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            <span>Backups let you restore your server to a previous state.</span>
          </div>
          <button class="btn btn-primary btn-sm" onclick="ServerBackups.opencreatemodal()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Create Backup
          </button>
        </div>
        <div class="backups-list">`;
    for (let i = 0; i < this.backups.length; i++) {
      const backup = this.backups[i];
      const isFailed = backup.is_successful === false;
      const isInProgress = backup.completed_at === null && backup.is_successful === null;
      const isOk = backup.is_successful === true;
      let statusClass = 'pending';
      let statusText = 'In Progress';
      if (isFailed) { statusClass = 'failed'; statusText = 'Failed'; }
      else if (isOk) { statusClass = 'success'; statusText = 'Completed'; }

      html += `
          <div class="backup-card${backup.is_locked ? ' locked' : ''}${isFailed ? ' failed' : ''}${isInProgress ? ' in-progress' : ''}">
            <div class="backup-card-header">
              <div class="backup-info-box">
                <div class="backup-icon-box ${statusClass}">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
                </div>
                <div class="backup-details">
                  <h4>${Utils.escape(backup.name)}</h4>
                  <span class="backup-date">${this.formatdate(backup.created_at)}</span>
                </div>
              </div>
              <div class="backup-badges">
                ${backup.is_locked ? '<span class="backup-badge locked"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Locked</span>' : ''}
                <span class="backup-badge ${statusClass}">${statusText}</span>
              </div>
            </div>
            <div class="backup-card-body">
              <div class="backup-meta">
                <span class="meta-item">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
                  ${this.formatbytes(backup.bytes)}
                </span>
                ${backup.completed_at ? `<span class="meta-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ${this.formatdate(backup.completed_at)}</span>` : ''}
              </div>
            </div>
            <div class="backup-card-actions">
              ${isOk ? `<button class="btn btn-secondary btn-sm" onclick="ServerBackups.downloadbackup(${i})">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Download
              </button>` : ''}
              ${isOk ? `<button class="btn btn-secondary btn-sm" onclick="ServerBackups.restorebackup(${i})">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                Restore
              </button>` : ''}
              <button class="btn btn-secondary btn-sm" onclick="ServerBackups.togglelock(${i})">
                ${backup.is_locked ? 'Unlock' : 'Lock'}
              </button>
              ${!backup.is_locked ? `<button class="btn-icon btn-danger-sm" onclick="ServerBackups.deletebackup(${i})" title="Delete">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>` : ''}
            </div>
          </div>`;
    }
    if (!this.backups.length) {
      html += '<div class="tab-empty">No backups found. Create one to get started.</div>';
    }
    html += '</div></div>';
    container.innerHTML = html;
  },
};
