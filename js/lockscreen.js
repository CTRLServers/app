const LockScreen = {
  _resolve: null,

  show(resolve) {
    this._resolve = resolve;
    const overlay = Utils.el('lockScreenOverlay');
    if (overlay) overlay.style.display = 'flex';
    const input = Utils.el('lockScreenInput');
    if (input) { input.value = ''; input.focus(); }
    const error = Utils.el('lockScreenError');
    if (error) error.textContent = '';
    const btn = Utils.el('lockScreenBtn');
    if (btn) btn.disabled = false;
    if (input) {
      input.onkeydown = (e) => {
        if (e.key === 'Enter') this.submit();
      };
    }
  },

  hide() {
    const overlay = Utils.el('lockScreenOverlay');
    if (overlay) overlay.style.display = 'none';
  },

  async submit() {
    const input = Utils.el('lockScreenInput');
    const error = Utils.el('lockScreenError');
    const btn = Utils.el('lockScreenBtn');
    if (!input) return;

    const pass = input.value;
    if (!pass) {
      if (error) error.textContent = 'Please enter a passcode.';
      return;
    }

    if (btn) btn.disabled = true;
    if (error) error.textContent = '';

    const ok = await AppSettings.verifypasscode(pass);

    if (ok) {
      this.hide();
      if (this._resolve) this._resolve(true);
      this._resolve = null;
    } else {
      if (error) error.textContent = 'Incorrect passcode. Try again.';
      if (btn) btn.disabled = false;
      input.value = '';
      input.focus();
    }
  },

  lock() {
    if (!AppSettings.ispasscodeenabled()) return;
    this.show((ok) => {});
  }
};
