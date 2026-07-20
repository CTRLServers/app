const ServerStartup = {
  loading: false,
  savingimage: false,
  startupcommand: '',
  variables: [],
  dockerimages: {},
  currentimage: '',

  async load() {
    const s = App.currentserver;
    if (!s || s.type !== 'Pterodactyl') return;
    this.loading = true;
    this.render();
    try {
      const data = await Api.fetchstartup(s.panelurl, s.apikey, s.uuid);
      if (data.meta) {
        this.startupcommand = data.meta.startup_command || '';
        this.variables = (data.data || []).map(v => v.attributes);
        this.dockerimages = data.meta.docker_images || {};
        if (data.meta.raw_startup_command) {
          this.currentimage = '';
        } else {
          this.currentimage = 'loading';
        }
      }
      try {
        const details = await Api.getcachedserver(s.panelurl, s.apikey, s.uuid);
        this.currentimage = details.docker_image || '';
      } catch (e) {
        this.currentimage = '';
      }
    } catch (e) {
      console.error(e);
    } finally {
      this.loading = false;
    }
    this.render();
  },

  async updatevariable(idx) {
    const v = this.variables[idx];
    if (!v) return;
    const s = App.currentserver;
    if (!s) return;
    v._saving = true;
    this.render();
    try {
      await Api.updatestartupvariable(s.panelurl, s.apikey, s.uuid, v.env_variable, v.server_value);
      await this.load();
    } catch (e) {
      console.error(e);
    } finally {
      v._saving = false;
    }
  },

  async updateimage() {
    const s = App.currentserver;
    if (!s) return;
    this.savingimage = true;
    this.render();
    try {
      await Api.updatedockerimage(s.panelurl, s.apikey, s.uuid, this.currentimage);
      await this.load();
    } catch (e) {
      console.error(e);
    } finally {
      this.savingimage = false;
    }
  },

  render() {
    const container = Utils.el('tabstartup');
    if (!container) return;
    if (this.loading) {
      container.innerHTML = '<div class="tab-loading"><svg class="spin" width="24" height="24" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15A9 9 0 1 1 5.64 5.64L1 10"/></svg></div>';
      return;
    }
    const imageoptions = Object.entries(this.dockerimages);
    const hascurrentinoptions = imageoptions.some(([, val]) => val === this.currentimage);
    let html = `
      <div class="startup-content">
        <div class="startup-top">
          <div class="startup-card">
            <div class="startup-card-header">
              <svg width="16" height="16" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/></svg>
              <h3>Startup Command</h3>
            </div>
            <div class="startup-cmd-box">
              <code>${Utils.escape(this.startupcommand)}</code>
            </div>
          </div>
          <div class="startup-card">
            <div class="startup-card-header">
              <svg width="16" height="16" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
              <h3>Docker Image</h3>
              ${this.savingimage ? '<svg class="spin" width="14" height="14" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15A9 9 0 1 1 5.64 5.64L1 10"/></svg>' : ''}
            </div>
            <div class="startup-docker-body">
              <p class="settings-note">The Docker image defines the environment your server runs in.</p>
              <select id="dockerimageselect" class="form-input" onchange="ServerStartup.onimagechange(this.value)">
                ${imageoptions.map(([name, img]) => `<option value="${Utils.escape(img)}" ${this.currentimage === img ? 'selected' : ''}>${Utils.escape(name)}</option>`).join('')}
                ${this.currentimage && !hascurrentinoptions ? `<option value="${Utils.escape(this.currentimage)}" selected>${Utils.escape(this.currentimage)} (Manual)</option>` : ''}
              </select>
              <button class="btn btn-primary btn-sm" style="margin-top:8px;" onclick="ServerStartup.updateimage()" ${this.savingimage ? 'disabled' : ''}>
                ${this.savingimage ? '<svg class="spin" width="14" height="14" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15A9 9 0 1 1 5.64 5.64L1 10"/></svg>' : ''}
                Save Image
              </button>
            </div>
          </div>
        </div>
        <div class="startup-vars">`;
    for (let i = 0; i < this.variables.length; i++) {
      const v = this.variables[i];
      html += `
          <div class="startup-card var-card">
            <div class="var-header">
              <div class="var-info">
                <span class="var-name">${Utils.escape(v.name)}</span>
                <span class="var-key">${Utils.escape(v.env_variable)}</span>
              </div>
              ${v._saving ? '<svg class="spin" width="14" height="14" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15A9 9 0 1 1 5.64 5.64L1 10"/></svg>' : ''}
            </div>
            <div class="var-body">
              <p class="settings-note">${Utils.escape(v.description || '')}</p>
              <input type="text" class="form-input" id="var_${i}" value="${Utils.escape(v.server_value || '')}" placeholder="${Utils.escape(v.default_value || '')}" ${!v.is_editable ? 'disabled' : ''} onchange="ServerStartup.onvarchange(${i}, this.value)" />
              ${!v.is_editable ? '<span class="var-readonly">Read Only</span>' : ''}
            </div>
          </div>`;
    }
    html += `
        </div>
      </div>`;
    container.innerHTML = html;
  },

  onimagechange(val) {
    this.currentimage = val;
  },

  onvarchange(idx, val) {
    if (this.variables[idx]) {
      this.variables[idx].server_value = val;
    }
  },
};
