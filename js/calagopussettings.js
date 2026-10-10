const calagopussettings = {
  session: null,
  clocktimer: null,
  polltimer: null,
  modalform: null,

  safe(value) {
    return Utils.escape(String(value ?? '')).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  active(session = this.session) {
    return !!session && this.session === session && App.currentServer === session.server;
  },

  can(permission, session = this.session) {
    const permissions = [...(session?.detail?.permissions || []), ...(session?.user?.role?.server_permissions || [])];
    return permissions.includes('*') || permissions.includes(permission);
  },

  async request(session, path, method = 'GET', body = undefined, absolute = false) {
    const apikey = await Servers.resolveapikey(session.server);
    if (method !== 'GET' && !this.active(session)) throw new Error('The selected server changed. Please reopen Settings.');
    const options = { method, headers: Api.calagopusheaders(apikey) };
    if (body !== undefined) options.body = JSON.stringify(body);
    const response = await fetch(`${session.base}${absolute ? path : `/api/client/servers/${encodeURIComponent(session.server.uuid)}${path}`}`, options);
    const raw = await response.text();
    let data;
    try { data = raw ? JSON.parse(raw) : {}; }
    catch (error) {
      if (response.ok) throw new Error('The panel returned an invalid JSON response.');
      data = {};
    }
    if (!response.ok) {
      const errors = Array.isArray(data.errors) ? data.errors : Object.values(data.errors || {});
      const message = errors.map(item => typeof item === 'string' ? item : item.detail || item.message || JSON.stringify(item)).join('; ');
      throw new Error(message || data.message || `Request failed (HTTP ${response.status})`);
    }
    return { data, status: response.status };
  },

  start(server) {
    clearTimeout(this.polltimer);
    clearInterval(this.clocktimer);
    if (this.modalform && Utils.el('modalBody')?.contains(this.modalform)) { Modal.closeguard = null; Modal.close(); }
    this.modalform = null;
    this.session = null;
    const banner = Utils.el('calagopus-installation');
    if (banner) { banner.hidden = true; banner.innerHTML = ''; }
    if (Utils.el('consoleInput')) Utils.el('consoleInput').disabled = false;
    if (server?.type !== 'Calagopus') return;
    const session = { server, base: server.panelUrl.replace(/\/+$/, ''), detail: null, user: null, config: null, revision: 0, sequence: 0, progress: null, pulls: new Map(), cancelling: false, busy: new Set(), warnings: [], events: [] };
    this.session = session;
    session.ready = this.initialize(session);
  },

  async initialize(session) {
    const results = await Promise.allSettled([
      this.refresh(session),
      this.request(session, '/api/client/account', 'GET', undefined, true),
      this.request(session, '/api/settings', 'GET', undefined, true)
    ]);
    if (!this.active(session)) return;
    if (results[1].status === 'fulfilled') session.user = results[1].value.data.user || results[1].value.data;
    else session.warnings.push(`Unable to load role permissions: ${results[1].reason.message}`);
    if (results[2].status === 'fulfilled') session.config = results[2].value.data;
    else session.warnings.push(`Unable to load installation failure policy: ${results[2].reason.message}`);
    if (results[0].status === 'rejected') session.error = results[0].reason.message;
    this.updatebanner();
    this.schedulepoll(session);
  },

  async refresh(session) {
    const sequence = ++session.sequence;
    const revision = session.revision;
    const result = await this.request(session, '');
    if (!this.active(session) || revision !== session.revision || sequence !== session.sequence) return;
    const detail = result.data.server || result.data;
    if (!detail.uuid || !Array.isArray(detail.permissions)) throw new Error('The panel returned incomplete server information.');
    const previous = session.detail?.status;
    session.detail = detail;
    session.error = null;
    const events = session.events.splice(0);
    events.forEach(message => this.socketevent(session.server, message));
    if ((previous === 'installing' && detail.status !== 'installing') || (session.cancelling && !detail.status)) this.completed(session, detail.status);
    this.updatebanner();
  },

  schedulepoll(session) {
    clearTimeout(this.polltimer);
    this.polltimer = setTimeout(async () => {
      if (!this.active(session)) return;
      try { await this.refresh(session); }
      catch (error) { if (this.active(session)) { session.error = error.message; this.updatebanner(); } }
      if (this.active(session)) this.schedulepoll(session);
    }, session.detail?.status === 'installing' || session.cancelling ? 4000 : 15000);
  },

  blocked(session = this.session) {
    if (!this.active(session)) return false;
    const detail = session.detail;
    return !!(detail && (detail.status || detail.is_transferring || detail.node_maintenance_enabled || (detail.is_suspended && !session.user?.admin)));
  },

  guard(page) {
    clearInterval(this.clocktimer);
    return this.blocked() ? 'console' : page;
  },

  async load() {
    if (!this.active()) this.start(App.currentServer);
    const session = this.session;
    if (!session) return;
    const container = Utils.el('tabSettings');
    container.innerHTML = '<div class="tab-loading" role="status"><span class="spinner"></span>Loading settings...</div>';
    await session.ready;
    if (!this.active(session) || App.currentServerPage !== 'settings') return;
    try {
      await this.refresh(session);
      if (!this.active(session) || App.currentServerPage !== 'settings') return;
      if (this.blocked(session)) { App.switchserverpage('console'); return; }
      this.render(session);
    } catch (error) {
      if (!this.active(session) || App.currentServerPage !== 'settings') return;
      container.innerHTML = `<div class="calagopus-settings-empty" role="alert"><strong>Unable to load Settings</strong><p>${this.safe(error.message)}</p><button class="btn btn-secondary" id="calagopus-settings-retry">Try Again</button></div>`;
      Utils.el('calagopus-settings-retry').onclick = () => { this.start(session.server); this.load(); };
    }
  },

  section(title, content, kind = '') {
    return `<section class="calagopus-settings-section"><h3>${title}</h3>${kind ? `<form data-setting="${kind}"><fieldset>${content}<p class="calagopus-settings-feedback" role="status"></p><button type="submit" class="btn btn-primary btn-sm">Save</button></fieldset></form>` : content}</section>`;
  },

  field(label, content) {
    return `<label class="calagopus-settings-field"><span>${label}</span>${content}</label>`;
  },

  render(session) {
    const detail = session.detail;
    const input = (name, value, extra = '') => `<input class="settings-input" name="${name}" value="${this.safe(value)}" ${extra}>`;
    const nameduuid = (name, uuid) => uuid ? (name ? `${name} (${uuid})` : uuid) : '';
    const fields = [['Node (UUID)', nameduuid(detail.node_name, detail.node_uuid)], ['Location (UUID)', nameduuid(detail.location_name, detail.location_uuid)], ['Server UUID', detail.uuid]];
    let html = this.section('Debug Information', fields.map(([label, value], index) => `<div class="calagopus-settings-field"><span>${label}</span><button type="button" class="copy-field" data-debug="${index}" title="Copy ${label}" ${value ? '' : 'disabled'}><span>${index === 1 && detail.location_flag ? `<img class="calagopus-settings-flag" src="${this.safe(session.base)}/flags/${encodeURIComponent(detail.location_flag)}.svg" alt="">` : ''}${this.safe(value || 'Unavailable')}</span><span class="calagopus-settings-copy">Copy</span></button></div>`).join(''));
    if (this.can('settings.rename', session)) html += this.section('Rename Server', this.field('Server Name *', input('name', detail.name, 'required maxlength="255"')) + this.field('Description', `<textarea name="description" class="settings-input" rows="3" maxlength="1024">${this.safe(detail.description)}</textarea>`), 'rename');
    if (this.can('settings.auto-kill', session)) html += detail.auto_kill && typeof detail.auto_kill.enabled === 'boolean' && Number.isInteger(detail.auto_kill.seconds)
      ? this.section('Auto-Kill', `<label class="calagopus-settings-toggle"><input type="checkbox" role="switch" name="enabled" ${detail.auto_kill.enabled ? 'checked' : ''}>Enabled</label>` + this.field('Seconds until auto-kill', input('seconds', detail.auto_kill.seconds, 'type="number" required min="1" max="3600" step="1"')), 'auto-kill')
      : this.section('Auto-Kill', '<p>This panel version did not return auto-kill settings.</p>');
    if (this.can('settings.auto-start', session)) html += ['always', 'unless_stopped', 'never'].includes(detail.auto_start_behavior)
      ? this.section('Auto-Start', this.field('Behavior *', `<select class="settings-input" name="behavior">${[['always', 'Always'], ['unless_stopped', 'Unless Stopped'], ['never', 'Never']].map(([value, label]) => `<option value="${value}" ${detail.auto_start_behavior === value ? 'selected' : ''}>${label}</option>`).join('')}</select>`), 'auto-start')
      : this.section('Auto-Start', '<p>This panel version did not return auto-start settings.</p>');
    if (this.can('settings.timezone', session)) html += Object.hasOwn(detail, 'timezone')
      ? this.section('Timezone', this.field('Timezone', `<div class="calagopus-settings-timezone">${input('timezone', detail.timezone, 'list="calagopus-timezones" placeholder="System" autocomplete="off" aria-label="Timezone"')}<button type="button" class="btn btn-secondary btn-sm" data-clear title="Use the node system timezone">Clear</button></div>`) + `<datalist id="calagopus-timezones">${calagopustimezones.map(zone => `<option value="${zone}"></option>`).join('')}</datalist><p class="settings-note" data-zone-current>Current: ${this.safe(detail.timezone || 'System (node timezone)')}</p><p class="calagopus-settings-clock" data-clock aria-live="off"></p>`, 'timezone')
      : this.section('Timezone', '<p>This panel version did not return timezone settings.</p>');
    if (this.can('settings.install', session)) html += this.section('Reinstall Server', '<p>Reinstalling your server will stop it, and then re-run the installation script that initially set it up. Some files may be deleted or modified during this process, please back up your data before continuing.</p><button type="button" class="btn btn-danger btn-sm" data-reinstall>Reinstall Server</button>');
    const container = Utils.el('tabSettings');
    container.innerHTML = `<div class="calagopus-settings">${session.warnings.map(message => `<p role="alert" class="calagopus-settings-warning">${this.safe(message)}</p>`).join('')}${html}</div>`;
    container.querySelectorAll('[data-debug]').forEach(button => {
      button.onclick = async () => {
        try {
          await navigator.clipboard.writeText(fields[Number(button.dataset.debug)][1]);
          button.querySelector('.calagopus-settings-copy').textContent = 'Copied';
          this.toast('Copied to clipboard');
          setTimeout(() => { if (button.isConnected) button.querySelector('.calagopus-settings-copy').textContent = 'Copy'; }, 2000);
        } catch (error) { this.toast(`Unable to copy: ${error.message}`, 'error'); }
      };
    });
    container.querySelectorAll('form').forEach(form => {
      form.onsubmit = event => { event.preventDefault(); this.save(session, form); };
      form.oninput = () => this.validate(form);
      this.validate(form);
    });
    container.querySelector('[data-reinstall]')?.addEventListener('click', () => this.reinstall(session));
    const timezone = container.querySelector('[name="timezone"]');
    if (timezone) {
      container.querySelector('[data-clear]').onclick = () => { timezone.value = ''; this.validate(timezone.form); this.clock(timezone); timezone.focus(); };
      timezone.addEventListener('input', () => this.clock(timezone));
      this.clock(timezone);
      clearInterval(this.clocktimer);
      this.clocktimer = setInterval(() => {
        if (!this.active(session) || App.currentServerPage !== 'settings' || !timezone.isConnected) { clearInterval(this.clocktimer); return; }
        this.clock(timezone);
      }, 1000);
    }
  },

  clock(input) {
    const target = input.form.querySelector('[data-clock]');
    if (!input.value) { target.textContent = ''; return; }
    try {
      target.textContent = new Intl.DateTimeFormat(undefined, { timeZone: input.value, year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', timeZoneName: 'short' }).format(new Date());
    } catch (error) { target.textContent = 'Clock preview unavailable for this timezone.'; }
  },

  validate(form) {
    const zone = form.elements.namedItem('timezone');
    if (zone) zone.setCustomValidity(!zone.value || calagopustimezones.includes(zone.value) ? '' : 'Select a timezone from the list, or clear to use System.');
    const seconds = form.elements.namedItem('seconds');
    if (seconds) seconds.setCustomValidity(Number.isInteger(Number(seconds.value)) && Number(seconds.value) >= 1 && Number(seconds.value) <= 3600 ? '' : 'Enter a whole number from 1 to 3600.');
    const valid = form.checkValidity();
    form.querySelector('[type="submit"]').disabled = !valid;
    return valid;
  },

  payload(form) {
    const value = name => form.elements.namedItem(name).value;
    switch (form.dataset.setting) {
      case 'rename': return { name: value('name'), description: value('description') || null };
      case 'auto-kill': return { enabled: form.elements.namedItem('enabled').checked, seconds: Number(value('seconds')) };
      case 'auto-start': return { behavior: value('behavior') };
      case 'timezone': return { timezone: value('timezone') || null };
      default: throw new Error('Unknown setting');
    }
  },

  async save(session, form) {
    const kind = form.dataset.setting;
    if (!this.active(session) || session.busy.has(kind) || this.blocked(session) || !this.can(`settings.${kind}`, session) || !this.validate(form)) return;
    const body = this.payload(form);
    const feedback = form.querySelector('[role="status"]');
    const fieldset = form.querySelector('fieldset');
    session.busy.add(kind);
    session.revision++;
    fieldset.disabled = true;
    feedback.textContent = 'Saving...';
    feedback.classList.remove('error');
    try {
      await this.request(session, `/settings/${kind}`, kind === 'rename' ? 'POST' : 'PUT', body);
      session.revision++;
      if (kind === 'rename') { Object.assign(session.detail, body); this.rename(session, body); }
      if (kind === 'auto-kill') session.detail.auto_kill = body;
      if (kind === 'auto-start') session.detail.auto_start_behavior = body.behavior;
      if (kind === 'timezone') {
        session.detail.timezone = body.timezone;
        form.querySelector('[data-zone-current]').textContent = `Current: ${body.timezone || 'System (node timezone)'}`;
      }
      feedback.textContent = 'Saved';
      if (this.active(session)) this.toast('Settings saved');
    } catch (error) {
      feedback.classList.add('error');
      feedback.textContent = error.message;
      if (this.active(session)) this.toast(error.message, 'error');
    } finally {
      session.busy.delete(kind);
      fieldset.disabled = false;
      this.validate(form);
    }
  },

  rename(session, body) {
    const matches = server => server?.type === 'Calagopus' && server.uuid === session.server.uuid && server.panelUrl.replace(/\/+$/, '') === session.base;
    Object.assign(session.server, body);
    Servers.list.filter(matches).forEach(server => Object.assign(server, body));
    Servers.save();
    Servers.render();
    Windows.windows.forEach(win => { if (matches(Servers.list[win.serverIndex])) win.title = body.name; });
    Windows.rendertaskbar();
    if (matches(App.currentServer)) {
      Object.assign(App.currentServer, body);
      if (Utils.el('pageTitle')) Utils.el('pageTitle').textContent = body.name;
      if (Utils.el('windowTitleText')) Utils.el('windowTitleText').textContent = body.name;
      if (ServerConsole.serverInfo) Object.assign(ServerConsole.serverInfo, body);
      DiscordRPC.updateserver(body.name);
    }
  },

  reinstall(session) {
    if (!this.active(session) || !this.can('settings.install', session) || this.blocked(session)) return;
    Modal.open('Reinstall Server', `<form id="calagopus-reinstall"><fieldset><p>Reinstalling your server will stop it, and then re-run the installation script that initially set it up. Some files may be deleted or modified during this process, please back up your data before continuing.</p><label class="calagopus-settings-toggle"><input type="checkbox" role="switch" name="truncate_directory">Delete all server files</label><p class="settings-note">Do you want to delete all files of this server before performing this action? This cannot be undone.</p>${this.can('control.start', session) ? '<label class="calagopus-settings-toggle"><input type="checkbox" role="switch" name="start_on_completion">Start the server after the reinstall has finished.</label>' : ''}<p role="status" class="calagopus-settings-feedback"></p><div class="modal-actions"><button type="button" class="btn btn-secondary" data-close>Close</button><button type="submit" class="btn btn-danger">Reinstall</button></div></fieldset></form>`);
    const form = Utils.el('calagopus-reinstall');
    this.modalform = form;
    Modal.closeguard = event => !session.busy.has('install') && (event?.key !== 'Escape' || ![...form.querySelectorAll('input')].some(input => input.checked));
    form.querySelector('[data-close]').onclick = () => Modal.close();
    form.onsubmit = async event => {
      event.preventDefault();
      if (!this.active(session) || session.busy.has('install') || this.blocked(session) || !this.can('settings.install', session)) return;
      const body = { truncate_directory: form.elements.namedItem('truncate_directory').checked, start_on_completion: this.can('control.start', session) && !!form.elements.namedItem('start_on_completion')?.checked };
      session.busy.add('install');
      const revision = ++session.revision;
      form.querySelector('fieldset').disabled = true;
      const feedback = form.querySelector('[role="status"]');
      feedback.textContent = 'Requesting reinstall...';
      try {
        await this.request(session, '/settings/install', 'POST', body);
        if (session.revision === revision) { session.detail.status = 'installing'; session.progress = null; }
        session.revision++;
        if (this.active(session)) {
          if (form.isConnected) { Modal.closeguard = null; Modal.close(); }
          this.toast('Server reinstall requested');
          App.switchserverpage('console');
          this.updatebanner();
          this.schedulepoll(session);
        }
      } catch (error) { feedback.textContent = error.message; feedback.classList.add('error'); }
      finally { session.busy.delete('install'); form.querySelector('fieldset').disabled = false; }
    };
  },

  canacknowledge(session) {
    return this.can('settings.cancel-install', session) && !!(session.config?.server?.allow_acknowledging_installation_failure || session.user?.admin || session.user?.role?.admin_permissions?.length);
  },

  acknowledge(session) {
    if (!this.active(session) || !this.canacknowledge(session)) return;
    Modal.open('Acknowledge Installation Failure', '<form id="calagopus-acknowledge"><fieldset><p>This will clear the failed installation state and allow you to interact with the server again. The server may not function correctly until the underlying issue is resolved.</p><p role="status" class="calagopus-settings-feedback"></p><div class="modal-actions"><button type="button" class="btn btn-secondary" data-close>Cancel</button><button type="submit" class="btn btn-danger">Acknowledge Failure</button></div></fieldset></form>');
    const form = Utils.el('calagopus-acknowledge');
    this.modalform = form;
    form.querySelector('[data-close]').onclick = () => Modal.close();
    form.onsubmit = async event => { event.preventDefault(); await this.cancelinstall(session, form); };
  },

  async cancelinstall(session, form = null) {
    if (!this.active(session) || session.cancelling || !this.can('settings.cancel-install', session)) return;
    if (session.detail.status === 'install_failed' ? !form || !this.canacknowledge(session) : session.detail.status !== 'installing') return;
    session.cancelling = true;
    session.revision++;
    if (form) form.querySelector('fieldset').disabled = true;
    this.updatebanner();
    try {
      const result = await this.request(session, '/settings/install/cancel', 'POST');
      session.revision++;
      if (result.status === 200) {
        session.detail.status = null;
        this.completed(session, null);
        if (this.active(session) && form?.isConnected) Modal.close();
      } else if (form) form.querySelector('[role="status"]').textContent = 'Waiting for the node to confirm cancellation...';
      if (this.active(session)) this.schedulepoll(session);
    } catch (error) {
      session.cancelling = false;
      if (form) { form.querySelector('[role="status"]').textContent = error.message; form.querySelector('fieldset').disabled = false; }
      if (this.active(session)) this.toast(error.message, 'error');
    }
    this.updatebanner();
  },

  completed(session, status) {
    session.progress = null;
    session.pulls.clear();
    const cancelling = session.cancelling;
    session.cancelling = false;
    if (!this.active(session)) return;
    if (cancelling && !status && this.modalform?.id === 'calagopus-acknowledge' && this.modalform.isConnected) Modal.close();
    if (status === 'install_failed') this.toast('Server installation failed', 'error');
    else if (!status) this.toast(cancelling ? 'Installation cancelled or failure acknowledged' : 'Server installation completed');
  },

  socketevent(server, message) {
    const session = this.session;
    if (!this.active(session) || session.server !== server) return;
    if (!session.detail) {
      if (['install started', 'install progress', 'install completed', 'image pull progress', 'image pull completed'].includes(message.event)) session.events.push(message);
      return;
    }
    const args = message.args || [];
    try {
      if (message.event === 'install started') { session.revision++; session.progress = null; session.detail.status = 'installing'; }
      else if (message.event === 'install progress') { session.revision++; session.progress = JSON.parse(args[0]); session.detail.status = 'installing'; }
      else if (message.event === 'install completed') { session.revision++; session.detail.status = args[0] === 'true' ? null : 'install_failed'; this.completed(session, session.detail.status); }
      else if (message.event === 'image pull progress') session.pulls.set(args[0], JSON.parse(args[1]));
      else if (message.event === 'image pull completed') session.pulls.delete(args[0]);
      else return;
    } catch (error) { return; }
    this.updatebanner();
    this.schedulepoll(session);
  },

  progresshtml(progress, label) {
    if (!progress) return '';
    const total = Number(progress.total);
    const amount = Number(progress.progress);
    const valid = Number.isFinite(total) && total > 0 && Number.isFinite(amount);
    const percent = valid ? Math.max(0, Math.min(100, amount / total * 100)) : 0;
    const text = valid ? total === 100 ? `${Math.round(percent)}%` : `${Utils.formatbytes(amount)} / ${Utils.formatbytes(total)}` : '';
    return `<div class="calagopus-install-progress"><span>${this.safe(label || '')} ${this.safe(text)}</span><progress aria-label="${this.safe(label || 'Installation progress')}" ${valid ? `value="${percent}" max="100"` : ''}></progress></div>`;
  },

  updatebanner() {
    const session = this.session;
    const banner = Utils.el('calagopus-installation');
    if (!banner || !this.active(session)) return;
    const detail = session.detail;
    const installing = detail?.status === 'installing';
    const failed = detail?.status === 'install_failed';
    const blocked = this.blocked(session);
    let title = installing ? 'Installing server' : failed ? 'Server installation failed' : blocked ? 'Server unavailable' : '';
    let message = installing ? 'The installation script is running. Please wait for it to finish.' : failed ? 'The installation failed. Resolve the underlying issue before using this server.' : blocked ? detail.node_maintenance_enabled ? 'The node is under maintenance.' : detail.is_suspended ? 'This server is suspended.' : detail.is_transferring ? 'This server is being transferred.' : `Server state: ${detail.status}` : '';
    if (session.error) { title ||= 'Unable to refresh server settings'; message += ` ${session.error}`; }
    banner.hidden = !title && !session.pulls.size;
    banner.innerHTML = `<div class="calagopus-install-header"><div><strong>${this.safe(title)}</strong><p>${this.safe(message)}</p></div>${installing && this.can('settings.cancel-install', session) ? `<button class="btn btn-secondary btn-sm" data-cancel ${session.cancelling ? 'disabled' : ''}>${session.cancelling ? 'Cancelling...' : 'Cancel Installation'}</button>` : failed && this.canacknowledge(session) ? `<button class="btn btn-danger btn-sm" data-acknowledge ${session.cancelling ? 'disabled' : ''}>Acknowledge Failure</button>` : ''}${session.error ? '<button class="btn btn-secondary btn-sm" data-retry>Retry</button>' : ''}</div>${installing ? this.progresshtml(session.progress, session.progress?.label) : ''}${[...session.pulls].map(([id, item]) => this.progresshtml({ progress: item.bytes_processed, total: item.bytes_total }, `${id}: ${item.status}`)).join('')}`;
    banner.querySelector('[data-cancel]')?.addEventListener('click', () => this.cancelinstall(session));
    banner.querySelector('[data-acknowledge]')?.addEventListener('click', () => this.acknowledge(session));
    banner.querySelector('[data-retry]')?.addEventListener('click', () => { this.start(session.server); if (App.currentServerPage === 'settings') this.load(); });
    if (blocked && App.currentServerPage && App.currentServerPage !== 'console') { App.switchserverpage('console'); return; }
    if (App.currentServerPage === 'console') Utils.el('tabConsole').style.display = blocked && !installing ? 'none' : 'flex';
    if (ServerConsole.server === session.server) {
      ServerConsole._updatebuttons(session.server.status || 'offline');
      const input = Utils.el('consoleInput');
      if (input) input.disabled = blocked;
      if (installing) ['consoleEmpty', 'consoleOffline', 'consoleConnecting'].forEach(id => { if (Utils.el(id)) Utils.el(id).style.display = 'none'; });
    }
  },

  toast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast file-toast file-toast-${type}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 4500);
  }
};
