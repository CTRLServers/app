const ServerSettings = {
  loading: false,
  saving: false,
  sftpdetails: { ip: '', port: 2022 },
  panelusername: '',
  servername: '',
  serverdescription: '',
  servernode: '',
  shortuuid: '',

  async load() {
    const s = App.currentserver;
    if (!s || s.type !== 'Pterodactyl') return;
    this.loading = true;
    this.render();
    try {
      const [details, account] = await Promise.all([
        Api.getcachedserver(s.panelurl, s.apikey, s.uuid),
        Api.fetchaccount(s.panelurl, s.apikey)
      ]);
      if (details.sftp_details) {
        this.sftpdetails = details.sftp_details;
      }
      if (account.username) {
        this.panelusername = account.username;
      }
      this.servername = details.name || s.name || '';
      this.serverdescription = details.description || '';
      this.servernode = details.node || '';
      this.shortuuid = details.identifier || s.uuid || '';
    } catch (e) {
      console.error(e);
    } finally {
      this.loading = false;
    }
    this.render();
  },

  async savedetails() {
    if (!this.servername.trim()) return;
    const s = App.currentserver;
    if (!s) return;
    this.saving = true;
    this.render();
    try {
      const ok = await Api.renameserver(s.panelurl, s.apikey, s.uuid, this.servername, this.serverdescription);
      if (ok) {
        s.name = this.servername;
      }
    } catch (e) {
      console.error(e);
    } finally {
      this.saving = false;
    }
    this.render();
  },

  launchsftp() {
    const addr = `sftp://${this.panelusername}.${this.shortuuid}@${this.sftpdetails.ip}:${this.sftpdetails.port}`;
    window.open(addr, '_blank');
  },

  async copyfield(value) {
    try {
      await navigator.clipboard.writetext(value);
    } catch (e) {}
  },

  render() {
    const container = Utils.el('tabsettings');
    if (!container) return;
    if (this.loading) {
      container.innerHTML = '<div class="tab-loading"><svg class="spin" width="24" height="24" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15A9 9 0 1 1 5.64 5.64L1 10"/></svg></div>';
      return;
    }
    const s = App.currentserver;
    const sftpuser = this.panelusername + '.' + this.shortuuid;
    container.innerHTML = `
      <div class="settings-content">
        <div class="settings-card">
          <div class="settings-card-header">
            <svg width="16" height="16" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
            <h3>SFTP Details</h3>
          </div>
          <div class="settings-body">
            <div class="settings-grid">
              <div class="settings-field">
                <label>IP Address</label>
                <div class="copy-field" onclick="ServerSettings.copyfield('${Utils.escape(this.sftpdetails.ip || '')}')" title="Click to copy">
                  <span>${Utils.escape(this.sftpdetails.ip || '')}</span>
                  <svg width="14" height="14" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                </div>
              </div>
              <div class="settings-field">
                <label>Port</label>
                <div class="copy-field" onclick="ServerSettings.copyfield('${Utils.escape(String(this.sftpdetails.port || ''))}')" title="Click to copy">
                  <span>${Utils.escape(String(this.sftpdetails.port || ''))}</span>
                  <svg width="14" height="14" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                </div>
              </div>
              <div class="settings-field">
                <label>Username</label>
                <div class="copy-field" onclick="ServerSettings.copyfield('${Utils.escape(sftpuser)}')" title="Click to copy">
                  <span>${Utils.escape(sftpuser)}</span>
                  <svg width="14" height="14" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                </div>
              </div>
            </div>
            <p class="settings-note">Your SFTP password is the same as the password you use to access this panel.</p>
            <button class="btn btn-primary btn-sm" onclick="ServerSettings.launchsftp()">
              <svg width="14" height="14" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              Connect via SFTP
            </button>
          </div>
        </div>
        <div class="settings-card">
          <div class="settings-card-header">
            <svg width="16" height="16" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            <h3>Server Details</h3>
          </div>
          <div class="settings-body">
            <div class="settings-field">
              <label>Server Name</label>
              <input type="text" class="settings-input" id="settingsname" value="${Utils.escape(this.servername)}" placeholder="Server name..." />
            </div>
            <div class="settings-field">
              <label>Description</label>
              <input type="text" class="settings-input" id="settingsdesc" value="${Utils.escape(this.serverdescription)}" placeholder="Optional description..." />
            </div>
            <button class="btn btn-primary btn-sm" onclick="ServerSettings.savedetails()" ${this.saving ? 'disabled' : ''}>
              ${this.saving ? '<svg class="spin" width="14" height="14" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15A9 9 0 1 1 5.64 5.64L1 10"/></svg>' : ''}
              Save Details
            </button>
          </div>
        </div>
        <div class="settings-card">
          <div class="settings-card-header">
            <svg width="16" height="16" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            <h3>Debug Information</h3>
          </div>
          <div class="settings-body">
            <div class="debug-grid">
              <div class="debug-row">
                <span class="debug-label">Server ID</span>
                <span class="debug-value">${Utils.escape(s ? s.uuid : '')}</span>
              </div>
              <div class="debug-row">
                <span class="debug-label">Node</span>
                <span class="debug-value">${Utils.escape(this.servernode)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>`;

    const nameinput = Utils.el('settingsname');
    const descinput = Utils.el('settingsdesc');
    if (nameinput) nameinput.addEventListener('change', (e) => { this.servername = e.target.value; });
    if (descinput) descinput.addEventListener('change', (e) => { this.serverdescription = e.target.value; });
  },
};
