const HostTrust = {
  queue: [],
  activeId: null,

  init() {
    if (!window.electronAPI || typeof window.electronAPI.onhosttrustrequest !== 'function') return;
    window.electronAPI.onhosttrustrequest((id, payload) => this.enqueue(id, payload || {}));
    Utils.el('hostTrustClose').addEventListener('click', () => this.respond(false));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.activeId !== null) {
        e.preventDefault();
        e.stopPropagation();
        this.respond(false);
      }
    });
  },

  enqueue(id, payload) {
    if (typeof id !== 'number') return;
    this.queue.push({ id, payload });
    this.show();
  },

  show() {
    if (this.activeId !== null || !this.queue.length) return;
    const item = this.queue.shift();
    const kind = item.payload.kind === 'changed' ? 'changed'
      : (item.payload.kind === 'revoked' ? 'revoked' : 'new');
    this.activeId = item.id;
    Utils.el('hostTrustTitle').textContent = kind === 'changed' ? 'Host key changed'
      : (kind === 'revoked' ? 'Host key revoked' : 'Unknown host key');
    Utils.el('hostTrustBody').innerHTML = this.body(kind, item.payload);
    Utils.el('hostTrustOverlay').className = 'modal-overlay host-trust-overlay active'
      + (kind === 'new' ? '' : ' is-danger');
    const deny = Utils.el('hostTrustDeny');
    const accept = Utils.el('hostTrustAccept');
    if (deny) deny.addEventListener('click', () => this.respond(false));
    if (accept) accept.addEventListener('click', () => this.respond(true));
    if (deny) deny.focus();
  },

  respond(accepted) {
    if (this.activeId === null) return;
    const id = this.activeId;
    this.activeId = null;
    Utils.el('hostTrustOverlay').className = 'modal-overlay host-trust-overlay';
    Utils.el('hostTrustBody').innerHTML = '';
    if (window.electronAPI && typeof window.electronAPI.hosttrustresponse === 'function') {
      Promise.resolve(window.electronAPI.hosttrustresponse(id, accepted === true)).catch(() => {});
    }
    setTimeout(() => this.show(), 120);
  },

  fpblock(label, value, cls) {
    return '<div class="host-trust-fp' + (cls ? ' ' + cls : '') + '">' +
      '<span class="host-trust-fp-label">' + Utils.escape(label) + '</span>' +
      '<span class="host-trust-fp-value">' + Utils.escape(value || 'unknown') + '</span>' +
      '</div>';
  },

  row(label, value) {
    return '<div class="host-trust-row"><span>' + Utils.escape(label) + '</span><span>' +
      Utils.escape(value) + '</span></div>';
  },

  backgroundnote(payload) {
    if (!payload.background) return '';
    return '<p class="host-trust-note">This is an automatic background connection (resource polling). ' +
      'If you cancel, polling for this host stops until you connect to it manually.</p>';
  },

  body(kind, payload) {
    const label = payload.label || ((payload.host || '') + ':' + (payload.port || 22));
    if (kind === 'changed') {
      return '<div class="host-trust-warning">REMOTE HOST IDENTIFICATION HAS CHANGED!</div>' +
        '<p class="host-trust-text">Someone could be eavesdropping on you right now (man-in-the-middle attack). ' +
        'It is also possible that the host simply has a new key. Only accept the new key if you know why the old key is gone.</p>' +
        this.row('Host', label) +
        this.row('Key type', payload.keyType || 'unknown') +
        this.fpblock('Stored fingerprint', payload.storedFingerprint, 'host-trust-fp-old') +
        this.fpblock('Offending key', payload.fingerprint, 'host-trust-fp-new') +
        this.backgroundnote(payload) +
        '<div class="modal-actions">' +
        '<button class="btn btn-secondary" id="hostTrustDeny">Disconnect</button>' +
        '<button class="btn btn-danger" id="hostTrustAccept">Accept new key (unsafe)</button>' +
        '</div>';
    }
    if (kind === 'revoked') {
      return '<div class="host-trust-warning">This host key has been revoked.</div>' +
        '<p class="host-trust-text">Connections to <strong>' + Utils.escape(label) +
        '</strong> are blocked because its key was marked as revoked in a known_hosts file.</p>' +
        this.fpblock('Revoked fingerprint', payload.fingerprint) +
        '<div class="modal-actions">' +
        '<button class="btn btn-danger" id="hostTrustDeny">Disconnect</button>' +
        '</div>';
    }
    return '<p class="host-trust-text">The authenticity of <strong>' + Utils.escape(label) +
      '</strong> can\'t be established.</p>' +
      this.row('Key type', payload.keyType || 'unknown') +
      this.fpblock('Fingerprint', payload.fingerprint) +
      '<p class="host-trust-text">The fingerprint will be stored and checked on every future connection to this host. ' +
      'Only continue if you were expecting this host.</p>' +
      this.backgroundnote(payload) +
      '<div class="modal-actions">' +
      '<button class="btn btn-secondary" id="hostTrustDeny">Cancel</button>' +
      '<button class="btn btn-primary" id="hostTrustAccept">Trust and connect</button>' +
      '</div>';
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => HostTrust.init());
} else {
  HostTrust.init();
}
