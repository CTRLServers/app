const adminpanel = {
  section: 'general',
  releaseurl: '',

  async credentials() {
    const server = App.currentServer;
    if (!server || server.type !== 'Pterodactyl Admin') throw new Error(t('apanel.err.unavailable'));
    const apikey = await Servers.resolveapikey(server);
    if (!apikey) throw new Error(t('apanel.err.apikey'));
    return { server, apikey };
  },

  load(page) {
    if (page === 'paneloverview') this.loadoverview();
    else if (page === 'panelsettings') this.opensettings();
    else if (page === 'panelapplicationapi') adminapplicationapi.load();
    else if (page === 'paneldatabases') admindatabases.load();
    else if (page === 'panellocations') adminlocations.load();
    else if (page === 'panelnodes') adminnodes.load();
    else if (page === 'panelservers') adminservers.load();
    else if (page === 'panelnests') adminnests.load();
    else if (page === 'panelusers') adminusers.load();
    else if (page === 'panelmounts') adminmounts.load();
    else {
      const container = Utils.el('tab' + page);
      if (container) container.innerHTML = '';
    }
  },

  loading(container) {
    container.innerHTML = `<div class="paneladmin-loading"><div class="spinner"></div><span>${t('apanel.loading')}</span></div>`;
  },

  async loadoverview() {
    const container = Utils.el('tabpaneloverview');
    if (!container) return;
    this.loading(container);
    try {
      const { server, apikey } = await this.credentials();
      const [versions, system] = await Promise.all([
        Api.adminrequest(server.panelUrl, apikey, '/admin/getpanelversion'),
        Api.adminrequest(server.panelUrl, apikey, '/admin/getsysteminformation').catch(() => null)
      ]);
      if (App.currentServer !== server) return;
      this.releaseurl = versions.release_url || 'https://github.com/pterodactyl/panel/releases/latest';
      this.renderoverview(versions, system);
    } catch (error) {
      this.renderconnectionerror(container, error);
    }
  },

  renderoverview(versions, system) {
    const container = Utils.el('tabpaneloverview');
    const installed = versions.version || t('aapi.unknown');
    const latest = versions.latest_version || t('cset.unavailable');
    let state = 'neutral';
    let description = t('apanel.desc.neutral', { version: this.safe(installed) });
    let update = '';
    if (versions.up_to_date === true) {
      state = 'current';
      description = t('apanel.desc.current', { version: this.safe(installed) });
    } else if (versions.up_to_date === false) {
      state = 'outdated';
      description = t('apanel.desc.outdated', { version: this.safe(installed) });
      update = `<button type="button" class="btn btn-primary btn-sm" onclick="adminpanel.openrelease()">${t('apanel.viewrelease', { latest: this.safe(latest) })}</button>`;
    }
    container.innerHTML = `
      <div class="paneladmin-page">
        <section class="paneladmin-system-card">
          <div class="paneladmin-system-heading">
            <h2>${t('apanel.systeminfo')}</h2>
            <button type="button" class="paneladmin-refresh" onclick="adminpanel.loadoverview()" title="${t('aloc.refresh')}">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15"/></svg>
            </button>
          </div>
          <div class="paneladmin-system-line ${state}"></div>
          <p>${description}</p>
          ${update}
          ${this.systemmetrics(system)}
        </section>
      </div>`;
  },

  systemmetrics(system) {
    if (!system) return '';
    const cpu = system.cpu || {};
    const memory = system.memory || {};
    const disk = system.disk || {};
    const cpuused = this.percentage(cpu.used_percent, 100);
    const memoryused = this.percentage(memory.used, memory.total);
    const diskused = this.percentage(disk.used, disk.total);
    return `
      <div class="paneladmin-resources">
        <div class="paneladmin-resource">
          <div class="paneladmin-resource-heading"><span>${t('apanel.cpu')}</span><strong>${cpuused}% / 100%</strong></div>
          <div class="paneladmin-resource-track"><span style="width:${cpuused}%"></span></div>
          <small>${this.safe(cpu.name || t('apanel.unknownproc'))} &middot; ${this.safe(this.cores(cpu.cores || 1))}</small>
        </div>
        <div class="paneladmin-resource">
          <div class="paneladmin-resource-heading"><span>${t('apanel.memory')}</span><strong>${this.formatbytes(memory.used)} / ${this.formatbytes(memory.total)}</strong></div>
          <div class="paneladmin-resource-track"><span style="width:${memoryused}%"></span></div>
          <small>${t('apanel.inuse', { value: memoryused })}</small>
        </div>
        <div class="paneladmin-resource">
          <div class="paneladmin-resource-heading"><span>${t('apanel.disk')}</span><strong>${this.formatbytes(disk.used)} / ${this.formatbytes(disk.total)}</strong></div>
          <div class="paneladmin-resource-track"><span style="width:${diskused}%"></span></div>
          <small>${t('apanel.inuse', { value: diskused })}</small>
        </div>
      </div>`;
  },

  cores(count) {
    const value = Number(count || 1);
    const key = value % 10 === 1 && value % 100 !== 11
      ? 'apanel.cores.one'
      : value % 10 >= 2 && value % 10 <= 4 && (value % 100 < 10 || value % 100 >= 20)
        ? 'apanel.cores.few'
        : 'apanel.cores.many';
    return t(key, { count: value });
  },

  percentage(used, total) {
    const maximum = Number(total || 0);
    if (maximum <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((Number(used || 0) / maximum) * 100)));
  },

  formatbytes(value) {
    const bytes = Number(value || 0);
    if (bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const amount = bytes / Math.pow(1024, index);
    return `${amount >= 10 || index === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[index]}`;
  },

  opensettings() {
    const container = Utils.el('tabpanelsettings');
    if (!container) return;
    container.innerHTML = `
      <div class="paneladmin-page paneladmin-settings-page">
        <div class="paneladmin-heading">
          <div>
            <h2>${t('apanel.settings')}</h2>
          </div>
        </div>
        <div class="paneladmin-settings-tabs">
          <button type="button" data-paneladmin-section="general" onclick="adminpanel.switchsettings('general')">${t('apanel.tab.general')}</button>
          <button type="button" data-paneladmin-section="mail" onclick="adminpanel.switchsettings('mail')">${t('apanel.tab.mail')}</button>
          <button type="button" data-paneladmin-section="advanced" onclick="adminpanel.switchsettings('advanced')">${t('apanel.tab.advanced')}</button>
        </div>
        <div class="paneladmin-settings-body" id="paneladmin-settings-body"></div>
      </div>`;
    this.switchsettings(this.section);
  },

  switchsettings(section) {
    this.section = section;
    document.querySelectorAll('[data-paneladmin-section]').forEach(button => {
      button.classList.toggle('active', button.getAttribute('data-paneladmin-section') === section);
    });
    this.loadsettings(section);
  },

  async loadsettings(section) {
    const container = Utils.el('paneladmin-settings-body');
    if (!container) return;
    this.loading(container);
    try {
      const { server, apikey } = await this.credentials();
      const data = await Api.adminrequest(server.panelUrl, apikey, '/admin/ctrlservers/settings/' + section);
      if (App.currentServer !== server || section !== this.section) return;
      if (section === 'general') this.rendergeneral(data);
      else if (section === 'mail') this.rendermail(data);
      else this.renderadvanced(data);
    } catch (error) {
      this.renderconnectionerror(container, error);
    }
  },

  rendergeneral(data) {
    const fields = data.fields || {};
    const options = data.options || {};
    const twofactor = (options.two_factor_requirement || []).map(option => `<option value="${this.safe(option.value)}" ${String(option.value) === String(fields.two_factor_requirement) ? 'selected' : ''}>${this.safe(option.label)}</option>`).join('');
    const languages = (options.languages || []).map(option => `<option value="${this.safe(option.value)}" ${String(option.value) === String(fields.default_language) ? 'selected' : ''}>${this.safe(option.label)}</option>`).join('');
    this.setsettingsbody(`
      <div class="paneladmin-form-grid">
        <label class="paneladmin-field paneladmin-field-wide">
          <span>${t('apanel.company')}</span>
          <input type="text" id="panel-company-name" value="${this.safe(fields.company_name)}" maxlength="191" />
        </label>
        <label class="paneladmin-field">
          <span>${t('apanel.twofactor')}</span>
          <select id="panel-two-factor">${twofactor}</select>
        </label>
        <label class="paneladmin-field">
          <span>${t('apanel.defaultlang')}</span>
          <select id="panel-default-language">${languages}</select>
        </label>
      </div>
      ${this.formactions('savegeneral')}`);
  },

  rendermail(data) {
    const fields = data.fields || {};
    const disabled = data.smtp_available === false;
    const configured = fields.smtp_password_configured ? t('apanel.smtp.configured') : t('apanel.smtp.notconfigured');
    this.setsettingsbody(`
      ${disabled ? `<div class="paneladmin-notice error">${t('apanel.smtp.warning', { driver: this.safe(data.mail_driver || t('apanel.smtp.otherdriver')) })}</div>` : ''}
      <div class="paneladmin-form-grid">
        <label class="paneladmin-field paneladmin-field-wide">
          <span>${t('apanel.mail.host')}</span>
          <input type="text" id="panel-smtp-host" value="${this.safe(fields.smtp_host)}" ${disabled ? 'disabled' : ''} />
        </label>
        <label class="paneladmin-field">
          <span>${t('apanel.mail.port')}</span>
          <input type="number" id="panel-smtp-port" value="${this.safe(fields.smtp_port)}" min="1" max="65535" ${disabled ? 'disabled' : ''} />
        </label>
        <label class="paneladmin-field">
          <span>${t('apanel.mail.encryption')}</span>
          <select id="panel-encryption" ${disabled ? 'disabled' : ''}>
            <option value="tls" ${fields.encryption === 'tls' ? 'selected' : ''}>TLS</option>
            <option value="ssl" ${fields.encryption === 'ssl' ? 'selected' : ''}>SSL</option>
          </select>
        </label>
        <label class="paneladmin-field">
          <span>${t('apanel.mail.username')}</span>
          <input type="text" id="panel-smtp-username" value="${this.safe(fields.smtp_username)}" ${disabled ? 'disabled' : ''} />
        </label>
        <label class="paneladmin-field">
          <span>${t('apanel.mail.password')}</span>
          <input type="password" id="panel-smtp-password" value="" placeholder="${this.safe(configured)}" ${disabled ? 'disabled' : ''} />
        </label>
        <label class="paneladmin-field">
          <span>${t('apanel.mail.from')}</span>
          <input type="email" id="panel-mail-from" value="${this.safe(fields.mail_from)}" ${disabled ? 'disabled' : ''} />
        </label>
        <label class="paneladmin-field">
          <span>${t('apanel.mail.fromname')}</span>
          <input type="text" id="panel-mail-from-name" value="${this.safe(fields.mail_from_name)}" ${disabled ? 'disabled' : ''} />
        </label>
      </div>
      ${this.formactions('savemail', disabled)}`);
  },

  renderadvanced(data) {
    const fields = data.fields || {};
    const allocationdisabled = !fields.automatic_allocation_enabled;
    this.setsettingsbody(`
      <div class="paneladmin-form-section">
        <div class="paneladmin-form-section-heading">
          <div><h3>${t('apanel.recaptcha')}</h3></div>
          ${this.toggle('panel-recaptcha-status', fields.recaptcha_enabled, "adminpanel.statustoggle('panel-recaptcha-status')")}
        </div>
        <div class="paneladmin-form-grid">
          <label class="paneladmin-field"><span>${t('apanel.sitekey')}</span><input type="text" id="panel-recaptcha-site-key" value="${this.safe(fields.recaptcha_site_key)}" /></label>
          <label class="paneladmin-field"><span>${t('apanel.secretkey')}</span><input type="password" id="panel-recaptcha-secret-key" value="${this.safe(fields.recaptcha_secret_key)}" /></label>
        </div>
      </div>
      <div class="paneladmin-form-section">
        <div class="paneladmin-form-section-heading"><div><h3>${t('apanel.http')}</h3></div></div>
        <div class="paneladmin-form-grid">
          <label class="paneladmin-field"><span>${t('apanel.conntimeout')}</span><input type="number" id="panel-connection-timeout" value="${this.safe(fields.connection_timeout)}" min="1" max="60" /></label>
          <label class="paneladmin-field"><span>${t('apanel.reqtimeout')}</span><input type="number" id="panel-request-timeout" value="${this.safe(fields.request_timeout)}" min="1" max="60" /></label>
        </div>
      </div>
      <div class="paneladmin-form-section">
        <div class="paneladmin-form-section-heading">
          <div><h3>${t('apanel.allocation')}</h3></div>
          ${this.toggle('panel-allocation-status', fields.automatic_allocation_enabled, 'adminpanel.allocationtoggle()')}
        </div>
        <div class="paneladmin-form-grid">
          <label class="paneladmin-field"><span>${t('apanel.startingport')}</span><input type="number" id="panel-starting-port" value="${this.safe(fields.starting_port)}" min="1024" max="65535" ${allocationdisabled ? 'disabled' : ''} /></label>
          <label class="paneladmin-field"><span>${t('apanel.endingport')}</span><input type="number" id="panel-ending-port" value="${this.safe(fields.ending_port)}" min="1024" max="65535" ${allocationdisabled ? 'disabled' : ''} /></label>
        </div>
      </div>
      ${this.formactions('saveadvanced')}`);
  },

  setsettingsbody(content) {
    const container = Utils.el('paneladmin-settings-body');
    if (container) container.innerHTML = `<div id="paneladmin-form-message"></div>${content}`;
  },

  formactions(action, disabled = false) {
    return `<div class="paneladmin-form-actions"><button type="button" class="btn btn-primary" id="paneladmin-save" onclick="adminpanel.${action}()" ${disabled ? 'disabled' : ''}>${t('aloc.save')}</button></div>`;
  },

  toggle(id, checked, action = '') {
    return `<label class="paneladmin-toggle"><input type="checkbox" id="${id}" ${checked ? 'checked' : ''} ${action ? `onchange="${action}"` : ''} /><span></span><em>${checked ? t('csub.enabled') : t('csub.disabled')}</em></label>`;
  },

  allocationtoggle() {
    const enabled = Utils.el('panel-allocation-status')?.checked || false;
    const starting = Utils.el('panel-starting-port');
    const ending = Utils.el('panel-ending-port');
    if (starting) starting.disabled = !enabled;
    if (ending) ending.disabled = !enabled;
    const label = Utils.el('panel-allocation-status')?.closest('.paneladmin-toggle')?.querySelector('em');
    if (label) label.textContent = enabled ? t('csub.enabled') : t('csub.disabled');
  },

  statustoggle(id) {
    const input = Utils.el(id);
    const label = input?.closest('.paneladmin-toggle')?.querySelector('em');
    if (label) label.textContent = input.checked ? t('csub.enabled') : t('csub.disabled');
  },

  async savegeneral() {
    await this.savesettings('general', {
      company_name: Utils.el('panel-company-name')?.value.trim() || '',
      two_factor_requirement: Number(Utils.el('panel-two-factor')?.value || 0),
      default_language: Utils.el('panel-default-language')?.value || 'en'
    });
  },

  async savemail() {
    const payload = {
      smtp_host: Utils.el('panel-smtp-host')?.value.trim() || '',
      smtp_port: Number(Utils.el('panel-smtp-port')?.value || 0),
      encryption: Utils.el('panel-encryption')?.value || 'tls',
      smtp_username: Utils.el('panel-smtp-username')?.value.trim() || '',
      mail_from: Utils.el('panel-mail-from')?.value.trim() || '',
      mail_from_name: Utils.el('panel-mail-from-name')?.value.trim() || ''
    };
    const password = Utils.el('panel-smtp-password')?.value || '';
    if (password) payload.smtp_password = password;
    await this.savesettings('mail', payload);
  },

  async saveadvanced() {
    const allocationenabled = Utils.el('panel-allocation-status')?.checked || false;
    await this.savesettings('advanced', {
      recaptcha_enabled: Utils.el('panel-recaptcha-status')?.checked || false,
      recaptcha_site_key: Utils.el('panel-recaptcha-site-key')?.value.trim() || '',
      recaptcha_secret_key: Utils.el('panel-recaptcha-secret-key')?.value || '',
      connection_timeout: Number(Utils.el('panel-connection-timeout')?.value || 0),
      request_timeout: Number(Utils.el('panel-request-timeout')?.value || 0),
      automatic_allocation_enabled: allocationenabled,
      starting_port: allocationenabled ? Number(Utils.el('panel-starting-port')?.value || 0) : null,
      ending_port: allocationenabled ? Number(Utils.el('panel-ending-port')?.value || 0) : null
    });
  },

  async savesettings(section, payload) {
    const button = Utils.el('paneladmin-save');
    const message = Utils.el('paneladmin-form-message');
    if (button) {
      button.disabled = true;
      button.textContent = t('cset.saving');
    }
    if (message) message.innerHTML = '';
    try {
      const { server, apikey } = await this.credentials();
      const data = await Api.adminrequest(server.panelUrl, apikey, '/admin/ctrlservers/settings/' + section, 'PATCH', payload);
      if (App.currentServer !== server || section !== this.section) return;
      if (section === 'general' && data.fields?.company_name) {
        server.name = data.fields.company_name;
        Servers.save();
        Servers.render();
        const title = Utils.el('windowTitleText');
        if (title) title.textContent = server.name;
        const windowentry = Windows.windows.find(entry => Servers.list[entry.serverIndex] === server);
        if (windowentry) windowentry.title = server.name;
        Windows.rendertaskbar();
      }
      if (section === 'general') this.rendergeneral(data);
      else if (section === 'mail') this.rendermail(data);
      else this.renderadvanced(data);
      const refreshed = Utils.el('paneladmin-form-message');
      if (refreshed) refreshed.innerHTML = `<div class="paneladmin-notice success">${t('apanel.saved')}</div>`;
    } catch (error) {
      if (message) message.innerHTML = `<div class="paneladmin-notice error">${this.safe(error.message)}</div>`;
      if (button) {
        button.disabled = false;
        button.textContent = t('aloc.save');
      }
    }
  },

  renderconnectionerror(container, error) {
    container.innerHTML = `
      <div class="paneladmin-error-state">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <strong>${t('apanel.loaderror')}</strong>
        <span>${this.safe(error.message)}</span>
        <button type="button" class="btn btn-secondary btn-sm" onclick="adminpanel.openextension()">${t('apanel.openext')}</button>
      </div>`;
  },

  openrelease() {
    const url = this.releaseurl.startsWith('https://github.com/pterodactyl/panel/')
      ? this.releaseurl
      : 'https://github.com/pterodactyl/panel/releases/latest';
    window.electronAPI.openexternal(url);
  },

  openextension() {
    window.electronAPI.openexternal('https://github.com/CTRLServers/adminextension');
  },

  safe(value) {
    return Utils.escape(String(value ?? ''));
  }
};
