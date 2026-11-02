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
    Utils.el('hostTrustTitle').textContent = kind === 'changed' ? t('trust.title.changed')
      : (kind === 'revoked' ? t('trust.title.revoked') : t('trust.title.new'));
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
      '<span class="host-trust-fp-value">' + Utils.escape(value || t('trust.unknown')) + '</span>' +
      '</div>';
  },

  row(label, value) {
    return '<div class="host-trust-row"><span>' + Utils.escape(label) + '</span><span>' +
      Utils.escape(value) + '</span></div>';
  },

  backgroundnote(payload) {
    if (!payload.background) return '';
    return '<p class="host-trust-note">' + t('trust.background_note') + '</p>';
  },

  body(kind, payload) {
    const label = payload.label || ((payload.host || '') + ':' + (payload.port || 22));
    if (kind === 'changed') {
      return '<div class="host-trust-warning">' + t('trust.changed.warning') + '</div>' +
        '<p class="host-trust-text">' + t('trust.changed.text') + '</p>' +
        this.row(t('trust.host'), label) +
        this.row(t('trust.key_type'), payload.keyType || t('trust.unknown')) +
        this.fpblock(t('trust.stored_fp'), payload.storedFingerprint, 'host-trust-fp-old') +
        this.fpblock(t('trust.offending'), payload.fingerprint, 'host-trust-fp-new') +
        this.backgroundnote(payload) +
        '<div class="modal-actions">' +
        '<button class="btn btn-secondary" id="hostTrustDeny">' + t('trust.disconnect') + '</button>' +
        '<button class="btn btn-danger" id="hostTrustAccept">' + t('trust.accept_unsafe') + '</button>' +
        '</div>';
    }
    if (kind === 'revoked') {
      return '<div class="host-trust-warning">' + t('trust.revoked.warning') + '</div>' +
        '<p class="host-trust-text">' + t('trust.revoked.text', { host: '<strong>' + Utils.escape(label) + '</strong>' }) + '</p>' +
        this.fpblock(t('trust.revoked_fp'), payload.fingerprint) +
        '<div class="modal-actions">' +
        '<button class="btn btn-danger" id="hostTrustDeny">' + t('trust.disconnect') + '</button>' +
        '</div>';
    }
    return '<p class="host-trust-text">' + t('trust.new.text', { host: '<strong>' + Utils.escape(label) + '</strong>' }) + '</p>' +
      this.row(t('trust.key_type'), payload.keyType || t('trust.unknown')) +
      this.fpblock(t('trust.fingerprint'), payload.fingerprint) +
      '<p class="host-trust-text">' + t('trust.new.note') + '</p>' +
      this.backgroundnote(payload) +
      '<div class="modal-actions">' +
      '<button class="btn btn-secondary" id="hostTrustDeny">' + t('trust.cancel') + '</button>' +
      '<button class="btn btn-primary" id="hostTrustAccept">' + t('trust.trust_connect') + '</button>' +
      '</div>';
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => HostTrust.init());
} else {
  HostTrust.init();
}
