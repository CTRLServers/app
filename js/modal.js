const Modal = {
  init() {
    Utils.el('modalOverlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.close();
    });
    Utils.el('modalClose').addEventListener('click', () => this.close());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
    });
  },

  open(title, html) {
    Utils.el('modalTitle').textContent = title;
    Utils.el('modalBody').innerHTML = html;
    Utils.el('modalOverlay').classList.add('active');
  },

  close() {
    Utils.el('modalOverlay').classList.remove('active');
  },

  confirm(title, message, onConfirm) {
    this.open(title, `
      <p style="font-size:14px;color:var(--text-secondary);margin-bottom:24px;">${message}</p>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="modalCancelBtn">Cancel</button>
        <button class="btn btn-danger" id="modalConfirmBtn">Confirm</button>
      </div>
    `);
    setTimeout(() => {
      Utils.el('modalCancelBtn').addEventListener('click', () => this.close());
      Utils.el('modalConfirmBtn').addEventListener('click', async () => {
        const btn = Utils.el('modalConfirmBtn');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-sm"></span> Processing...';
        try {
          await onConfirm();
          this.close();
        } catch (e) {
          this.close();
        }
      });
    }, 0);
  }
};
