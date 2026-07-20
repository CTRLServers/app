const Modal = {
  init() {
    Utils.el('modaloverlay').addEventListener('click', (e) => {
      if (e.target === e.currenttarget) this.close();
    });
    Utils.el('modalclose').addEventListener('click', () => this.close());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
    });
  },

  open(title, html) {
    Utils.el('modaltitle').textContent = title;
    Utils.el('modalbody').innerHTML = html;
    Utils.el('modaloverlay').classList.add('active');
  },

  close() {
    Utils.el('modaloverlay').classList.remove('active');
  },

  confirm(title, message, onconfirm) {
    this.open(title, `
      <p style="font-size:14px;color:var(--text-secondary);margin-bottom:24px;">${message}</p>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="modalcancelbtn">Cancel</button>
        <button class="btn btn-danger" id="modalconfirmbtn">Confirm</button>
      </div>
    `);
    setTimeout(() => {
      Utils.el('modalcancelbtn').addEventListener('click', () => this.close());
      Utils.el('modalconfirmbtn').addEventListener('click', async () => {
        const btn = Utils.el('modalconfirmbtn');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-sm"></span> Processing...';
        try {
          await onconfirm();
          this.close();
        } catch (e) {
          this.close();
        }
      });
    }, 0);
  }
};
