const calagopusstartup = {
  server: null,
  variables: [],
  changed: new Map(),

  async request(endpoint, method = 'GET', body = null) {
    const server = App.currentServer;
    if (!server || server.type !== 'Calagopus') throw new Error(t('csub.noserver'));
    const apikey = await Servers.resolveapikey(server);
    const options = { method, headers: { Authorization: `Bearer ${apikey}`, Accept: 'application/json' } };
    if (body !== null) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    const response = await fetch(`${server.panelUrl.replace(/\/+$/, '')}/api/client/servers/${server.uuid}${endpoint}`, options);
    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try {
        const data = await response.json();
        message = data.errors?.[0]?.detail || data.errors?.[0] || data.message || message;
      } catch (error) {}
      throw new Error(message);
    }
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  },

  safe(value) {
    return Utils.escape(String(value ?? ''));
  },

  async load() {
    const container = Utils.el('tabStartup');
    if (!container) return;
    container.innerHTML = '<div class="tab-loading"><span class="spinner"></span></div>';
    try {
      const current = App.currentServer;
      const apikey = await Servers.resolveapikey(current);
      const [server, result] = await Promise.all([
        Api.fetchcalagopusserver(current.panelUrl, apikey, current.uuid),
        this.request('/startup/variables')
      ]);
      this.server = server;
      this.variables = result?.variables || [];
      this.changed = new Map();
      this.render();
    } catch (error) {
      container.innerHTML = `<div class="calagopus-startup-empty"><strong>${t('cstart.loadfail')}</strong><span>${this.safe(error.message)}</span><button class="btn btn-secondary btn-sm" onclick="calagopusstartup.load()">${t('csub.retry')}</button></div>`;
    }
  },

  render() {
    const container = Utils.el('tabStartup');
    if (!container || !this.server) return;
    const egg = this.server.egg || {};
    const config = this.server.egg_configuration || {};
    const commands = Object.entries(egg.startup_commands || {});
    const images = Object.entries(egg.docker_images || {});
    const custom = config.startup_allow_custom_command !== false;
    const command = this.server.startup || '';
    const commandoptions = commands.map(([name, value]) => `<option value="${this.safe(value)}" ${value === command ? 'selected' : ''}>${this.safe(name)}</option>`).join('');
    const imageoptions = images.map(([name, value]) => `<option value="${this.safe(value)}" ${value === this.server.image ? 'selected' : ''}>${this.safe(name)}</option>`).join('');
    const variables = this.variables.map((variable, index) => this.variablehtml(variable, index)).join('');
    container.innerHTML = `<div class="calagopus-startup-page"><div class="calagopus-startup-heading"><div><h2>${t('cstart.heading')}</h2><span>${this.safe(egg.name || t('cstart.subtitle'))}</span></div></div><div class="calagopus-startup-top"><section class="calagopus-startup-card calagopus-startup-command"><div class="calagopus-startup-card-head"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 3 14 9-14 9Z"></path></svg><h3>${t('startup.command')}</h3></div>${commands.length ? `<label class="calagopus-startup-field"><span>${t('cstart.predefined')}</span><select onchange="calagopusstartup.selectcommand(this.value)"><option value="" ${commands.some(entry => entry[1] === command) ? '' : 'selected'}>${custom ? t('cstart.custom') : t('cstart.selectcommand')}</option>${commandoptions}</select></label>` : ''}<label class="calagopus-startup-field"><textarea id="calagopus-startup-command" rows="7" ${custom ? '' : 'readonly'}>${this.safe(command)}</textarea></label><div class="calagopus-startup-card-actions"><button class="btn btn-primary btn-sm" onclick="calagopusstartup.savecommand()">${t('cstart.savecommand')}</button></div></section><section class="calagopus-startup-card"><div class="calagopus-startup-card-head"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8h16l-1.5 11h-13Z"></path><path d="M8 8V5h8v3M9 12v3M15 12v3"></path></svg><h3>${t('startup.image')}</h3></div><label class="calagopus-startup-field"><select id="calagopus-startup-image">${imageoptions}${images.some(entry => entry[1] === this.server.image) ? '' : `<option value="${this.safe(this.server.image)}" selected>${this.safe(this.server.image)}</option>`}</select><small>${t('cstart.image.desc')}</small></label><div class="calagopus-startup-card-actions"><button class="btn btn-primary btn-sm" onclick="calagopusstartup.saveimage()">${t('cstart.saveimage')}</button></div></section></div><div class="calagopus-startup-variables-head"><div><h2>${t('cstart.variables')}</h2><span>${t('cstart.variables.desc')}</span></div><button class="btn btn-primary btn-sm" id="calagopus-startup-save" onclick="calagopusstartup.savevariables()" disabled>${t('cstart.savevars')}</button></div><div class="calagopus-startup-variables">${variables || `<div class="calagopus-startup-empty">${t('cstart.empty')}</div>`}</div></div>`;
  },

  variablehtml(variable, index) {
    const value = variable.value ?? variable.default_value ?? '';
    const secret = !!variable.is_secret;
    const editable = variable.is_editable !== false;
    const rules = Array.isArray(variable.rules) ? variable.rules.join(' | ') : variable.rules || '';
    return `<section class="calagopus-startup-variable"><div class="calagopus-startup-variable-head"><div><h3>${this.safe(variable.name || variable.env_variable)}</h3><code>${this.safe(variable.env_variable)}</code></div>${secret ? `<span>${t('cstart.secret')}</span>` : ''}</div><p>${this.safe(variable.description || '')}</p><div class="calagopus-startup-input"><input type="${secret ? 'password' : 'text'}" value="${this.safe(value)}" ${editable ? '' : 'disabled'} oninput="calagopusstartup.changevariable(${index},this.value)">${secret ? `<button title="${t('cstart.togglesecret')}" onclick="calagopusstartup.togglesecret(this)"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"></path><circle cx="12" cy="12" r="3"></circle></svg></button>` : ''}</div>${rules ? `<small>${t('cstart.rules', { rules: this.safe(rules) })}</small>` : ''}</section>`;
  },

  selectcommand(value) {
    const input = Utils.el('calagopus-startup-command');
    if (input && value) input.value = value;
  },

  async savecommand() {
    const command = Utils.el('calagopus-startup-command')?.value || '';
    if (!command.trim()) return this.toast(t('cstart.command.empty'), 'error');
    try {
      await this.request('/startup/command', 'PUT', { command });
      this.server.startup = command;
      this.toast(t('cstart.command.updated'));
    } catch (error) {
      this.toast(error.message, 'error');
    }
  },

  async saveimage() {
    const image = Utils.el('calagopus-startup-image')?.value || '';
    if (!image) return this.toast(t('cstart.image.select'), 'error');
    try {
      await this.request('/startup/docker-image', 'PUT', { image });
      this.server.image = image;
      this.toast(t('cstart.image.updated'));
    } catch (error) {
      this.toast(error.message, 'error');
    }
  },

  changevariable(index, value) {
    const variable = this.variables[index];
    if (!variable) return;
    const original = variable.value ?? variable.default_value ?? '';
    if (value === original) this.changed.delete(variable.env_variable);
    else this.changed.set(variable.env_variable, value);
    const button = Utils.el('calagopus-startup-save');
    if (button) button.disabled = this.changed.size === 0;
  },

  togglesecret(button) {
    const input = button.parentElement?.querySelector('input');
    if (input) input.type = input.type === 'password' ? 'text' : 'password';
  },

  async savevariables() {
    if (!this.changed.size) return;
    const button = Utils.el('calagopus-startup-save');
    if (button) button.disabled = true;
    const variables = [...this.changed].map(([env_variable, value]) => ({ env_variable, value }));
    try {
      await this.request('/startup/variables', 'PUT', { variables });
      this.variables.forEach(variable => {
        if (this.changed.has(variable.env_variable)) variable.value = this.changed.get(variable.env_variable);
      });
      this.changed.clear();
      this.toast(t('cstart.vars.updated'));
    } catch (error) {
      if (button) button.disabled = false;
      this.toast(error.message, 'error');
    }
  },

  toast(message, type = 'success') {
    document.querySelector('.calagopus-startup-toast')?.remove();
    const toast = document.createElement('div');
    toast.className = `toast file-toast calagopus-startup-toast file-toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
  }
};
