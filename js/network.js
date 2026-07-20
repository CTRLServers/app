const ServerNetwork = {
  loading: false,
  allocations: [],

  async load() {
    const s = App.currentserver;
    if (!s || s.type !== 'Pterodactyl') return;
    this.loading = true;
    this.render();
    try {
      const data = await Api.fetchnetwork(s.panelurl, s.apikey, s.uuid);
      this.allocations = data.map(a => {
        const attrs = a.attributes || a;
        attrs.id = a.id || attrs.id;
        return attrs;
      });
    } catch (e) {
      console.error(e);
      this.allocations = [];
    } finally {
      this.loading = false;
    }
    this.render();
  },

  async create() {
    const s = App.currentserver;
    if (!s) return;
    try {
      await Api.createallocation(s.panelurl, s.apikey, s.uuid);
      await this.load();
    } catch (e) {
      console.error(e);
    }
  },

  async setprimary(id) {
    const s = App.currentserver;
    if (!s) return;
    try {
      await Api.setprimaryallocation(s.panelurl, s.apikey, s.uuid, id);
      await this.load();
    } catch (e) {
      console.error(e);
    }
  },

  async remove(id) {
    Modal.confirm('Remove Allocation', 'Are you sure you want to remove this allocation? The server must be stopped.', async () => {
      const s = App.currentserver;
      if (!s) return;
      try {
        await Api.deleteallocation(s.panelurl, s.apikey, s.uuid, id);
        await this.load();
      } catch (e) {
        console.error(e);
        alert('Failed to remove allocation. Server must be stopped.');
      }
    });
  },

  opennotes(allocid) {
    const alloc = this.allocations.find(a => a.id === allocid);
    if (!alloc) return;
    this._editingAlloc = alloc;
    const current = alloc.notes || '';
    Modal.open('Allocation Notes', `
      <div class="form-group">
        <label class="form-label">Notes for ${Utils.escape(alloc.ip)}:${alloc.port}</label>
        <textarea class="form-input" id="allocnotes" rows="3" placeholder="Add notes...">${Utils.escape(current)}</textarea>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" id="allocnotesbtn">Save</button>
      </div>
    `);
    setTimeout(() => {
      const btn = Utils.el('allocnotesbtn');
      if (btn) btn.addEventListener('click', async () => {
        const s = App.currentserver;
        if (!s || !this._editingAlloc) return;
        const val = document.getElementById('allocnotes').value;
        try {
          await Api.setallocationnotes(s.panelurl, s.apikey, s.uuid, this._editingAlloc.id, val);
          Modal.close();
          await this.load();
        } catch (e) {
          console.error(e);
          Modal.close();
        }
      });
    }, 0);
  },

  render() {
    const container = Utils.el('tabnetwork');
    if (!container) return;
    if (this.loading) {
      container.innerHTML = '<div class="tab-loading"><svg class="spin" width="24" height="24" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15A9 9 0 1 1 5.64 5.64L1 10"/></svg></div>';
      return;
    }
    let html = `
      <div class="network-content">
        <div class="network-header">
          <div class="network-info-box">
            <svg width="16" height="16" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            <span>Port allocations allow your server to communicate over different ports.</span>
          </div>
          <button class="btn btn-primary btn-sm" onclick="ServerNetwork.create()">
            <svg width="14" height="14" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Create Allocation
          </button>
        </div>
        <div class="alloc-list">`;
    for (const alloc of this.allocations) {
      const addr = alloc.ip_alias || alloc.ip;
      html += `
          <div class="alloc-card${alloc.is_default ? ' primary' : ''}">
            <div class="alloc-main">
              <div class="alloc-details">
                <div class="alloc-address">
                  <code>${Utils.escape(addr)}</code><span class="port-sep">:</span><code>${alloc.port}</code>
                </div>
                <div class="alloc-note" onclick="ServerNetwork.opennotes(${alloc.id})">
                  ${Utils.escape(alloc.notes || 'No notes added')}
                  <svg width="12" height="12" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                </div>
              </div>
              ${alloc.is_default ? '<span class="primary-badge"><svg width="12" height="12" viewbox="0 0 24 24" fill="currentcolor" stroke="currentcolor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> Primary</span>' : ''}
            </div>
            <div class="alloc-actions">
              ${!alloc.is_default ? `<button class="btn btn-secondary btn-sm" onclick="ServerNetwork.setprimary(${alloc.id})">Make Primary</button>` : ''}
              ${!alloc.is_default ? `<button class="btn-icon btn-danger-sm" onclick="ServerNetwork.remove(${alloc.id})" title="Remove allocation">
                <svg width="14" height="14" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>` : ''}
            </div>
          </div>`;
    }
    if (!this.allocations.length) {
      html += '<div class="tab-empty">No allocations configured.</div>';
    }
    html += '</div></div>';
    container.innerHTML = html;
  },
};
