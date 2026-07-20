const ServerKeychain = {
  keys: [],

  STORAGE_KEY: 'ctrlservers_keychain',

  load() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      this.keys = raw ? JSON.parse(raw) : [];
    } catch (e) {
      this.keys = [];
    }
    this.render();
  },

  save() {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.keys));
  },

  opencreatemodal(editIdx) {
    const isEdit = editIdx !== undefined && editIdx !== null;
    const existing = isEdit ? this.keys[editIdx] : null;
    Modal.open(isEdit ? 'Edit Key' : 'New Key', `
      <div class="form-group">
        <label class="form-label">Name</label>
        <input type="text" class="form-input" id="keyName" placeholder="e.g. My SSH Key" value="${existing ? Utils.escape(existing.name) : ''}" />
      </div>
      <div class="form-group">
        <label class="form-label">Public Key</label>
        <textarea class="form-input keychain-textarea" id="keyPublic" placeholder="ssh-rsa AAAA... user@host">${existing ? Utils.escape(existing.publicKey) : ''}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Private Key</label>
        <textarea class="form-input keychain-textarea" id="keyPrivate" placeholder="-----BEGIN OPENSSH PRIVATE KEY-----...">${existing ? Utils.escape(existing.privateKey) : ''}</textarea>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" id="keySaveBtn">${isEdit ? 'Save Changes' : 'Create Key'}</button>
      </div>
    `);
    setTimeout(() => {
      const btn = Utils.el('keySaveBtn');
      if (btn) btn.addEventListener('click', () => {
        const name = document.getElementById('keyName').value.trim();
        const publicKey = document.getElementById('keyPublic').value.trim();
        const privateKey = document.getElementById('keyPrivate').value.trim();
        if (!name) return;
        if (isEdit) {
          this.keys[editIdx] = { name, publicKey, privateKey, updatedAt: Date.now() };
        } else {
          this.keys.push({ name, publicKey, privateKey, createdAt: Date.now(), updatedAt: Date.now() });
        }
        this.save();
        Modal.close();
        this.renderall();
      });
    }, 0);
  },

  remove(idx) {
    const key = this.keys[idx];
    if (!key) return;
    Modal.confirm('Delete Key', `Are you sure you want to delete "${Utils.escape(key.name)}"? This cannot be undone.`, () => {
      this.keys.splice(idx, 1);
      this.save();
      this.renderall();
    });
  },

  renderall() {
    this.render();
    this.renderdashboard();
  },

  renderdashboard() {
    const container = Utils.el('dashboardKeychain');
    if (!container || container.style.display === 'none') return;
    container.innerHTML = this.buildhtml();
  },

  render() {
    const container = Utils.el('tabKeychain');
    if (!container) return;
    container.innerHTML = this.buildhtml();
  },

  buildhtml() {
    const copySvg = '<svg class="copy-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    if (!this.keys.length) {
      return `
        <div class="keychain-content">
          <div class="keychain-empty">
            <div class="keychain-empty-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
              </svg>
            </div>
            <h3>You have no keys right now.</h3>
            <button class="btn btn-primary" onclick="ServerKeychain.opencreatemodal()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Create one!
            </button>
          </div>
        </div>`;
    }
    let html = `
      <div class="keychain-content">
        <div class="network-header">
          <div class="network-info-box">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
            <span>Store and manage your SSH keys locally.</span>
          </div>
          <button class="btn btn-primary btn-sm" onclick="ServerKeychain.opencreatemodal()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Key
          </button>
        </div>
        <div class="keychain-list">`;
    for (let i = 0; i < this.keys.length; i++) {
      const key = this.keys[i];
      const fingerprint = key.publicKey ? key.publicKey.substring(0, 60) + (key.publicKey.length > 60 ? '...' : '') : 'No public key';
      const maskedPrivate = key.privateKey ? '\u2022'.repeat(20) : 'No private key';
      html += `
          <div class="keychain-card">
            <div class="keychain-card-header">
              <div class="keychain-card-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
                <h4>${Utils.escape(key.name)}</h4>
              </div>
              <div class="keychain-card-actions">
                <button class="btn btn-secondary btn-sm" onclick="ServerKeychain.opencreatemodal(${i})">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                  Edit
                </button>
                <button class="btn-icon btn-danger-sm" onclick="ServerKeychain.remove(${i})" title="Delete">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </div>
            </div>
            <div class="keychain-card-details">
              <div class="db-row">
                <span class="db-label">Public Key</span>
                <div class="db-val-box">
                  <code>${Utils.escape(fingerprint)}</code>
                  <span class="copy-icon" onclick="ServerKeychain.copyfield(${i}, 'publicKey')" title="Copy">${copySvg}</span>
                </div>
              </div>
              <div class="db-row">
                <span class="db-label">Private Key</span>
                <div class="db-val-box">
                  <code>${Utils.escape(maskedPrivate)}</code>
                  <span class="copy-icon" onclick="ServerKeychain.copyfield(${i}, 'privateKey')" title="Copy">${copySvg}</span>
                </div>
              </div>
            </div>
          </div>`;
    }
    html += '</div></div>';
    return html;
  },

  copyfield(idx, field) {
    const key = this.keys[idx];
    if (!key) return;
    navigator.clipboard.writeText(key[field] || '').catch(() => {});
  },
};
