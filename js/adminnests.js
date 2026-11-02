const adminnests = {
  nests: [],
  pagination: {},
  page: 1,
  perpage: 25,
  search: '',
  searchtimer: null,
  panel: null,
  nest: null,
  eggs: [],
  egg: null,
  variables: [],
  options: [],
  containers: [],
  entries: [],
  eggsection: 'configuration',
  importfile: null,
  variableid: null,
  deletevariableid: null,

  async load(page = 1) {
    const container = Utils.el('tabpanelnests');
    if (!container) return;
    if (this.panel !== App.currentServer) {
      this.panel = App.currentServer;
      this.search = '';
    }
    this.nest = null;
    this.egg = null;
    this.page = Math.max(1, Number(page) || 1);
    this.loading(t('anest.loading.nests'));
    try {
      const { server, apikey } = await adminpanel.credentials();
      const query = new URLSearchParams({ page: String(this.page), per_page: String(this.perpage) });
      if (this.search) query.set('search', this.search);
      const data = await Api.adminrequest(server.panelUrl, apikey, '/admin/ctrlservers/nests?' + query.toString());
      if (App.currentServer !== server) return;
      this.nests = data.data || [];
      this.pagination = data.meta?.pagination || {};
      this.renderlist();
    } catch (error) {
      this.rendererror(t('anest.err.nests'), error, 'adminnests.load(adminnests.page)');
    }
  },

  loading(text) {
    const container = Utils.el('tabpanelnests');
    if (container) container.innerHTML = `<div class="paneladmin-loading"><div class="spinner"></div><span>${this.safe(text)}</span></div>`;
  },

  renderlist() {
    const container = Utils.el('tabpanelnests');
    if (!container) return;
    const total = Number(this.pagination.total || this.nests.length);
    container.innerHTML = `
      <div class="paneladmin-page adminnests-page">
        <div class="paneladmin-heading adminnests-heading">
          <div>
            <h2>${t('anest.title')}</h2>
            <span class="paneladmin-url">${this.count('anest.count', total)}</span>
          </div>
        </div>
        <div class="adminnests-toolbar">
          <label class="adminnests-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.7" y2="16.7"/></svg>
            <input type="search" id="adminnests-search" value="${this.safeattr(this.search)}" placeholder="${this.safeattr(t('anest.search'))}" oninput="adminnests.searchinput(this.value)" />
          </label>
          <button type="button" class="paneladmin-refresh" onclick="adminnests.load(adminnests.page)" title="${t('aloc.refresh')}">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15"/></svg>
          </button>
        </div>
        ${this.nests.length ? `<div class="adminnests-list">${this.nests.map(nest => this.rendernestcard(nest)).join('')}</div>` : this.renderempty(t('anest.empty.nests'))}
        ${this.renderpagination()}
      </div>`;
    const search = Utils.el('adminnests-search');
    if (search) {
      search.focus();
      search.setSelectionRange(search.value.length, search.value.length);
    }
  },

  rendernestcard(nest) {
    const id = Number(nest.id);
    return `
      <div class="adminnests-card" role="button" tabindex="0" onclick="adminnests.opennest(${id})" onkeydown="adminnests.nestkey(event, ${id})">
        <span class="adminnests-id">#${id}</span>
        <span class="adminnests-main"><strong>${this.safe(nest.name)}</strong><small>${this.safe(nest.description || t('aloc.nodesc'))}</small></span>
        <span class="adminnests-stat"><small>${t('aapi.res.eggs')}</small><strong>${Number(nest.eggs || 0)}</strong></span>
        <span class="adminnests-stat"><small>${t('aapi.res.servers')}</small><strong>${Number(nest.servers || 0)}</strong></span>
        <svg class="adminnests-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </div>`;
  },

  nestkey(event, id) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    this.opennest(id);
  },

  searchinput(value) {
    this.search = value.trim();
    clearTimeout(this.searchtimer);
    this.searchtimer = setTimeout(() => this.load(1), 350);
  },

  count(base, value) {
    const n = Number(value || 0);
    const key = n % 10 === 1 && n % 100 !== 11
      ? base + '.one'
      : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)
        ? base + '.few'
        : base + '.many';
    return t(key, { count: n });
  },

  renderpagination() {
    const current = Number(this.pagination.current_page || 1);
    const pages = Number(this.pagination.total_pages || 1);
    if (pages <= 1) return '';
    return `
      <div class="adminnests-pagination">
        <span>${t('aloc.page', { current, pages })}</span>
        <div>
          <button type="button" onclick="adminnests.load(${current - 1})" ${current <= 1 ? 'disabled' : ''} title="${t('aloc.prevpage')}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg></button>
          <button type="button" onclick="adminnests.load(${current + 1})" ${current >= pages ? 'disabled' : ''} title="${t('aloc.nextpage')}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></button>
        </div>
      </div>`;
  },

  async opennest(id) {
    this.loading(t('anest.loading.nest'));
    try {
      const { server, apikey } = await adminpanel.credentials();
      const data = await Api.adminrequest(server.panelUrl, apikey, '/admin/ctrlservers/nests/' + Number(id));
      if (App.currentServer !== server) return;
      this.nest = data.nest;
      this.eggs = data.eggs || [];
      this.egg = null;
      this.rendernest();
    } catch (error) {
      this.rendererror(t('anest.err.nest'), error, `adminnests.opennest(${Number(id)})`);
    }
  },

  rendernest() {
    const container = Utils.el('tabpanelnests');
    if (!container || !this.nest) return;
    const blocked = Number(this.nest.servers || 0) > 0;
    container.innerHTML = `
      <div class="paneladmin-page adminnests-page">
        <div class="adminnests-detail-heading">
          <button type="button" class="adminnests-back" onclick="adminnests.load(adminnests.page)" title="${t('anest.back.nests')}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg></button>
          <div><span class="paneladmin-eyebrow">${t('anest.nest')}</span><h2>${this.safe(this.nest.name)}</h2></div>
        </div>
        <div id="adminnests-message"></div>
        <div class="adminnests-detail-grid">
          <section class="adminnests-editor">
            <h3>${t('anest.editnest')}</h3>
            <label class="adminnests-field"><span>${t('anest.name')}</span><input type="text" id="adminnest-name" value="${this.safeattr(this.nest.name)}" maxlength="191" /></label>
            <label class="adminnests-field"><span>${t('anest.description')}</span><textarea id="adminnest-description" rows="5">${this.safe(this.nest.description || '')}</textarea></label>
            <div class="adminnests-editor-actions">
              <button type="button" class="btn btn-danger btn-outline" onclick="adminnests.confirmnestdelete()" ${blocked ? 'disabled' : ''}>${t('anest.deletenest')}</button>
              <button type="button" class="btn btn-primary" id="adminnest-save" onclick="adminnests.savenest()">${t('aloc.save')}</button>
            </div>
            ${blocked ? `<div class="adminnests-delete-warning">${t('anest.delete.warning')}</div>` : ''}
          </section>
          <aside class="adminnests-information">
            <h3>${t('anest.additional')}</h3>
            <dl>
              <div><dt>${t('anest.nestid')}</dt><dd>${Number(this.nest.id)}</dd></div>
              <div><dt>${t('anest.author')}</dt><dd>${this.safe(this.nest.author)}</dd></div>
              <div><dt>${t('anest.uuid')}</dt><dd>${this.safe(this.nest.uuid)}</dd></div>
            </dl>
          </aside>
        </div>
        <section class="adminnests-eggs-section">
          <div class="adminnests-section-heading"><div><h3>${t('anest.eggs.title')}</h3><span>${this.count('anest.eggs', this.eggs.length)}</span></div></div>
          ${this.eggs.length ? `<div class="adminnests-eggs-list">${this.eggs.map(egg => this.rendereggrow(egg)).join('')}</div>` : this.renderempty(t('anest.empty.eggs'))}
        </section>
      </div>`;
  },

  rendereggrow(egg) {
    const id = Number(egg.id);
    return `
      <div class="adminnests-egg-row" role="button" tabindex="0" onclick="adminnests.openegg(${id})" onkeydown="adminnests.eggkey(event, ${id})">
        <span class="adminnests-id">#${id}</span>
        <span class="adminnests-main"><strong>${this.safe(egg.name)}</strong><small>${this.safe(egg.description || t('aloc.nodesc'))}</small></span>
        <span class="adminnests-stat"><small>${t('aapi.res.servers')}</small><strong>${Number(egg.servers || 0)}</strong></span>
        <button type="button" class="adminnests-export" onclick="event.stopPropagation(); adminnests.exportegg(${id})" title="${t('anest.exportegg')}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>
        <svg class="adminnests-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </div>`;
  },

  eggkey(event, id) {
    if (event.target.closest('button')) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    this.openegg(id);
  },

  async savenest() {
    const payload = {
      name: Utils.el('adminnest-name')?.value.trim() || '',
      description: Utils.el('adminnest-description')?.value.trim() || null
    };
    if (!payload.name) return this.message(t('anest.err.nestname'), 'error');
    const button = Utils.el('adminnest-save');
    if (button) { button.disabled = true; button.textContent = t('cset.saving'); }
    try {
      const data = await this.request('/admin/ctrlservers/nests/' + this.nest.id, 'PATCH', payload);
      this.nest = data.nest;
      this.eggs = data.eggs || [];
      this.rendernest();
      this.message(t('anest.saved'), 'success');
    } catch (error) {
      this.message(error.message, 'error');
      if (button) { button.disabled = false; button.textContent = t('aloc.save'); }
    }
  },

  confirmnestdelete() {
    if (!this.nest || Number(this.nest.servers || 0) > 0) return;
    Modal.open(t('anest.delete.title'), `
      <div id="adminnest-delete-error"></div>
      <p class="adminnests-delete-copy">${t('anest.delete.confirm', { name: this.safe(this.nest.name) })}</p>
      <div class="modal-actions"><button type="button" class="btn btn-secondary" onclick="Modal.close()">${t('cset.cancel')}</button><button type="button" class="btn btn-danger" id="adminnest-delete" onclick="adminnests.deletenest()">${t('anest.deletenest')}</button></div>`);
  },

  async deletenest() {
    const button = Utils.el('adminnest-delete');
    const errorbox = Utils.el('adminnest-delete-error');
    if (button) { button.disabled = true; button.textContent = t('anest.deleting'); }
    try {
      await this.request('/admin/ctrlservers/nests/' + this.nest.id, 'DELETE');
      Modal.close();
      await this.load(this.page);
    } catch (error) {
      if (errorbox) errorbox.innerHTML = `<div class="paneladmin-notice error">${this.safe(error.message)}</div>`;
      if (button) { button.disabled = false; button.textContent = t('anest.deletenest'); }
    }
  },

  async openegg(id) {
    this.loading(t('anest.loading.egg'));
    try {
      const data = await this.request(`/admin/ctrlservers/nests/${this.nest.id}/eggs/${Number(id)}`);
      this.seteggdata(data);
      this.eggsection = 'configuration';
      this.renderegg();
    } catch (error) {
      this.rendererror(t('anest.err.egg'), error, `adminnests.openegg(${Number(id)})`);
    }
  },

  seteggdata(data) {
    this.egg = data.egg;
    this.variables = data.variables || [];
    this.options = data.options || [];
    this.containers = data.containers || [];
    this.entries = data.entries || [];
  },

  renderegg() {
    const container = Utils.el('tabpanelnests');
    if (!container || !this.egg || !this.nest) return;
    container.innerHTML = `
      <div class="paneladmin-page adminnests-page">
        <div class="adminnests-detail-heading adminnests-egg-heading">
          <button type="button" class="adminnests-back" onclick="adminnests.opennest(${Number(this.nest.id)})" title="${t('anest.back.nest')}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg></button>
          <div><span class="paneladmin-eyebrow">${this.safe(this.nest.name)}</span><h2>${this.safe(this.egg.name)}</h2></div>
          <button type="button" class="btn btn-secondary btn-sm" onclick="adminnests.exportegg(${Number(this.egg.id)})"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>${t('anest.export')}</button>
        </div>
        <div id="adminnests-message"></div>
        <div class="adminnests-subtabs">
          <button type="button" data-adminnests-section="configuration" onclick="adminnests.switchegg('configuration')">${t('anest.tab.config')}</button>
          <button type="button" data-adminnests-section="variables" onclick="adminnests.switchegg('variables')">${t('anest.tab.variables')}</button>
          <button type="button" data-adminnests-section="install" onclick="adminnests.switchegg('install')">${t('anest.tab.install')}</button>
        </div>
        <div id="adminnests-egg-body"></div>
      </div>`;
    this.switchegg(this.eggsection);
  },

  switchegg(section) {
    this.eggsection = section;
    document.querySelectorAll('[data-adminnests-section]').forEach(button => {
      button.classList.toggle('active', button.getAttribute('data-adminnests-section') === section);
    });
    if (section === 'configuration') this.renderconfiguration();
    else if (section === 'variables') this.rendervariables();
    else this.renderinstall();
  },

  renderconfiguration() {
    const body = Utils.el('adminnests-egg-body');
    if (!body) return;
    body.innerHTML = `
      <section class="adminnests-import">
        <div><strong>${t('anest.eggfile')}</strong><span id="adminnests-file-name">${t('anest.selectfile')}</span></div>
        <label class="btn btn-secondary btn-sm">${t('anest.choosefile')}<input type="file" accept="application/json,.json" onchange="adminnests.selecteggfile(this)" /></label>
        <button type="button" class="btn btn-primary btn-sm" id="adminnests-import" onclick="adminnests.importegg()" disabled>${t('anest.updateegg')}</button>
      </section>
      <div class="adminnests-egg-layout">
        <div class="adminnests-egg-forms">
          <section class="adminnests-form-section">
            <h3>${t('anest.tab.config')}</h3>
            <div class="adminnests-form-grid">
              <label class="adminnests-field"><span>${t('anest.name')}</span><input type="text" id="adminegg-name" value="${this.safeattr(this.egg.name)}" maxlength="191" /></label>
              <label class="adminnests-field"><span>${t('anest.description')}</span><textarea id="adminegg-description" rows="5">${this.safe(this.egg.description || '')}</textarea></label>
              <label class="adminnests-field"><span>${t('anest.dockerimages')}</span><textarea id="adminegg-images" rows="6">${this.safe(this.imagevalues())}</textarea></label>
              <label class="adminnests-field"><span>${t('anest.startup')}</span><textarea id="adminegg-startup" rows="6">${this.safe(this.egg.startup || '')}</textarea></label>
              <label class="adminnests-field adminnests-field-wide"><span>${t('anest.features')}</span><input type="text" id="adminegg-features" value="${this.safeattr((this.egg.features || []).join(', '))}" placeholder="eula, java_version" /></label>
              <div class="adminnests-field adminnests-field-wide"><span>${t('anest.forceip')}</span>${this.toggle('adminegg-force-ip', this.egg.force_outgoing_ip)}</div>
            </div>
          </section>
          <section class="adminnests-form-section">
            <h3>${t('anest.process')}</h3>
            <div class="adminnests-form-grid">
              <label class="adminnests-field"><span>${t('anest.copyfrom')}</span><select id="adminegg-config-from">${this.eggoptions(this.egg.config_from, true)}</select></label>
              <label class="adminnests-field"><span>${t('anest.stopcommand')}</span><input type="text" id="adminegg-stop" value="${this.safeattr(this.egg.config_stop || '')}" maxlength="191" /></label>
              <label class="adminnests-field"><span>${t('anest.configfiles')}</span><textarea id="adminegg-files" rows="9">${this.safe(this.jsontext(this.egg.config_files))}</textarea></label>
              <label class="adminnests-field"><span>${t('anest.startconfig')}</span><textarea id="adminegg-start-config" rows="9">${this.safe(this.jsontext(this.egg.config_startup))}</textarea></label>
              <label class="adminnests-field adminnests-field-wide"><span>${t('anest.logconfig')}</span><textarea id="adminegg-logs" rows="7">${this.safe(this.jsontext(this.egg.config_logs))}</textarea></label>
            </div>
          </section>
          <div class="adminnests-save-row"><button type="button" class="btn btn-primary" id="adminegg-save" onclick="adminnests.saveconfiguration()">${t('anest.saveconfig')}</button></div>
        </div>
        <aside class="adminnests-information adminnests-egg-information">
          <h3>${t('anest.additional')}</h3>
          <dl>
            <div><dt>${t('anest.eggid')}</dt><dd>${Number(this.egg.id)}</dd></div>
            <div><dt>${t('anest.author')}</dt><dd>${this.safe(this.egg.author)}</dd></div>
            <div><dt>${t('anest.uuid')}</dt><dd>${this.safe(this.egg.uuid)}</dd></div>
            <div><dt>${t('aapi.res.servers')}</dt><dd>${Number(this.egg.servers || 0)}</dd></div>
          </dl>
        </aside>
      </div>`;
  },

  imagevalues() {
    return Object.entries(this.egg.docker_images || {}).map(([name, image]) => name === image ? image : `${name}|${image}`).join('\n');
  },

  parseimages() {
    const lines = (Utils.el('adminegg-images')?.value || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const images = {};
    lines.forEach(line => {
      const parts = line.split('|');
      const image = parts.length > 1 ? parts.slice(1).join('|').trim() : parts[0];
      const name = parts.length > 1 ? parts[0].trim() : image;
      if (name && image) images[name] = image;
    });
    return images;
  },

  async saveconfiguration() {
    try {
      const payload = {
        name: Utils.el('adminegg-name')?.value.trim() || '',
        description: Utils.el('adminegg-description')?.value.trim() || null,
        docker_images: this.parseimages(),
        force_outgoing_ip: Utils.el('adminegg-force-ip')?.checked || false,
        features: (Utils.el('adminegg-features')?.value || '').split(',').map(value => value.trim()).filter(Boolean),
        startup: Utils.el('adminegg-startup')?.value || '',
        config_from: Number(Utils.el('adminegg-config-from')?.value || 0) || null,
        config_stop: Utils.el('adminegg-stop')?.value.trim() || null,
        config_files: this.validjson('adminegg-files', t('anest.configfiles')),
        config_startup: this.validjson('adminegg-start-config', t('anest.startconfig')),
        config_logs: this.validjson('adminegg-logs', t('anest.logconfig'))
      };
      if (!payload.name || !payload.startup || !Object.keys(payload.docker_images).length) throw new Error(t('anest.err.requiredconfig'));
      const button = Utils.el('adminegg-save');
      if (button) { button.disabled = true; button.textContent = t('cset.saving'); }
      const data = await this.request(this.eggbasename() + '/configuration', 'PATCH', payload);
      this.seteggdata(data);
      this.renderegg();
      this.message(t('anest.savedconfig'), 'success');
    } catch (error) {
      this.message(error.message, 'error');
      const button = Utils.el('adminegg-save');
      if (button) { button.disabled = false; button.textContent = t('anest.saveconfig'); }
    }
  },

  validjson(id, label) {
    const value = Utils.el(id)?.value.trim() || '{}';
    try {
      JSON.parse(value);
      return value;
    } catch (error) {
      throw new Error(t('anest.err.json', { label }));
    }
  },

  selecteggfile(input) {
    this.importfile = input.files?.[0] || null;
    const name = Utils.el('adminnests-file-name');
    const button = Utils.el('adminnests-import');
    if (name) name.textContent = this.importfile?.name || t('anest.selectfile');
    if (button) button.disabled = !this.importfile;
  },

  async importegg() {
    if (!this.importfile) return;
    const button = Utils.el('adminnests-import');
    if (button) { button.disabled = true; button.textContent = t('anest.updating'); }
    try {
      const content = JSON.parse(await this.importfile.text());
      const data = await this.request(this.eggbasename() + '/import', 'POST', { egg: content });
      this.seteggdata(data);
      this.importfile = null;
      this.renderegg();
      this.message(t('anest.updated'), 'success');
    } catch (error) {
      this.message(error.message || t('anest.err.eggjson'), 'error');
      if (button) { button.disabled = false; button.textContent = t('anest.updateegg'); }
    }
  },

  rendervariables() {
    const body = Utils.el('adminnests-egg-body');
    if (!body) return;
    body.innerHTML = `
      <div class="adminnests-section-heading adminnests-variable-heading">
        <div><h3>${t('anest.tab.variables')}</h3><span>${this.count('anest.vars', this.variables.length)}</span></div>
        <button type="button" class="btn btn-primary btn-sm" onclick="adminnests.openvariable()"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>${t('anest.addvariable')}</button>
      </div>
      ${this.variables.length ? `<div class="adminnests-variable-list">${this.variables.map(variable => this.rendervariable(variable)).join('')}</div>` : this.renderempty(t('anest.empty.variables'))}`;
  },

  rendervariable(variable) {
    return `
      <div class="adminnests-variable-row">
        <span class="adminnests-main"><strong>${this.safe(variable.name)}</strong><small>${this.safe(variable.description || t('aloc.nodesc'))}</small></span>
        <span class="adminnests-variable-value"><small>${t('anest.environment')}</small><strong>${this.safe(variable.env_variable)}</strong></span>
        <span class="adminnests-variable-value"><small>${t('anest.default')}</small><strong>${this.safe(variable.default_value)}</strong></span>
        <span class="adminnests-variable-flags"><span>${variable.user_viewable ? t('anest.visible') : t('anest.hidden')}</span><span>${variable.user_editable ? t('anest.editable') : t('anest.locked')}</span></span>
        <span class="adminnests-row-actions">
          <button type="button" onclick="adminnests.openvariable(${Number(variable.id)})" title="${t('anest.editvariable')}"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
          <button type="button" class="danger" onclick="adminnests.confirmvariabledelete(${Number(variable.id)})" title="${t('anest.deletevariable')}"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6m3 0V4h8v2"/></svg></button>
        </span>
      </div>`;
  },

  openvariable(id = null) {
    const variable = id === null ? null : this.variables.find(item => Number(item.id) === Number(id));
    this.variableid = variable ? Number(variable.id) : null;
    Modal.open(variable ? t('anest.editvariable.title') : t('anest.addvariable.title'), `
      <div id="adminvariable-error"></div>
      <div class="adminnests-variable-form">
        <label class="adminnests-field"><span>${t('anest.name')}</span><input type="text" id="adminvariable-name" value="${this.safeattr(variable?.name)}" /></label>
        <label class="adminnests-field"><span>${t('anest.envvar')}</span><input type="text" id="adminvariable-environment" value="${this.safeattr(variable?.env_variable)}" /></label>
        <label class="adminnests-field adminnests-field-wide"><span>${t('anest.description')}</span><textarea id="adminvariable-description" rows="3">${this.safe(variable?.description || '')}</textarea></label>
        <label class="adminnests-field"><span>${t('anest.defaultvalue')}</span><input type="text" id="adminvariable-default" value="${this.safeattr(variable?.default_value)}" /></label>
        <label class="adminnests-field"><span>${t('anest.rules')}</span><input type="text" id="adminvariable-rules" value="${this.safeattr(variable?.rules || 'required|string|max:191')}" /></label>
        <div class="adminnests-field"><span>${t('anest.userviewable')}</span>${this.toggle('adminvariable-viewable', variable ? variable.user_viewable : true)}</div>
        <div class="adminnests-field"><span>${t('anest.usereditable')}</span>${this.toggle('adminvariable-editable', variable ? variable.user_editable : true)}</div>
      </div>
      <div class="modal-actions adminnests-variable-actions"><button type="button" class="btn btn-secondary" onclick="Modal.close()">${t('cset.cancel')}</button><button type="button" class="btn btn-primary" id="adminvariable-save" onclick="adminnests.savevariable()">${variable ? t('aloc.save') : t('anest.addvariable')}</button></div>`, 'modal-wide');
  },

  async savevariable() {
    const payload = {
      name: Utils.el('adminvariable-name')?.value.trim() || '',
      description: Utils.el('adminvariable-description')?.value.trim() || null,
      env_variable: Utils.el('adminvariable-environment')?.value.trim() || '',
      default_value: Utils.el('adminvariable-default')?.value || '',
      rules: Utils.el('adminvariable-rules')?.value.trim() || '',
      user_viewable: Utils.el('adminvariable-viewable')?.checked || false,
      user_editable: Utils.el('adminvariable-editable')?.checked || false
    };
    const errorbox = Utils.el('adminvariable-error');
    const button = Utils.el('adminvariable-save');
    if (!payload.name || !payload.env_variable || !payload.rules) {
      if (errorbox) errorbox.innerHTML = `<div class="paneladmin-notice error">${t('anest.err.varrequired')}</div>`;
      return;
    }
    if (button) { button.disabled = true; button.textContent = t('cset.saving'); }
    try {
      const endpoint = this.variableid === null ? this.eggbasename() + '/variables' : this.eggbasename() + '/variables/' + this.variableid;
      const method = this.variableid === null ? 'POST' : 'PATCH';
      await this.request(endpoint, method, payload);
      Modal.close();
      await this.refreshegg(t('anest.varsaved'), 'variables');
    } catch (error) {
      if (errorbox) errorbox.innerHTML = `<div class="paneladmin-notice error">${this.safe(error.message)}</div>`;
      if (button) { button.disabled = false; button.textContent = this.variableid === null ? t('anest.addvariable') : t('aloc.save'); }
    }
  },

  confirmvariabledelete(id) {
    const variable = this.variables.find(item => Number(item.id) === Number(id));
    if (!variable) return;
    this.deletevariableid = Number(id);
    Modal.open(t('anest.deletevariable.title'), `<div id="adminvariable-delete-error"></div><p class="adminnests-delete-copy">${t('anest.deletevariable.confirm', { name: this.safe(variable.name) })}</p><div class="modal-actions"><button type="button" class="btn btn-secondary" onclick="Modal.close()">${t('cset.cancel')}</button><button type="button" class="btn btn-danger" id="adminvariable-delete" onclick="adminnests.deletevariable()">${t('anest.deletevariable')}</button></div>`);
  },

  async deletevariable() {
    const errorbox = Utils.el('adminvariable-delete-error');
    const button = Utils.el('adminvariable-delete');
    if (button) { button.disabled = true; button.textContent = t('anest.deleting'); }
    try {
      await this.request(this.eggbasename() + '/variables/' + this.deletevariableid, 'DELETE');
      Modal.close();
      await this.refreshegg(t('anest.vardeleted'), 'variables');
    } catch (error) {
      if (errorbox) errorbox.innerHTML = `<div class="paneladmin-notice error">${this.safe(error.message)}</div>`;
      if (button) { button.disabled = false; button.textContent = t('anest.deletevariable'); }
    }
  },

  renderinstall() {
    const body = Utils.el('adminnests-egg-body');
    if (!body) return;
    body.innerHTML = `
      <section class="adminnests-form-section adminnests-install-form">
        <h3>${t('anest.tab.install')}</h3>
        <div class="adminnests-form-grid">
          <label class="adminnests-field"><span>${t('anest.copyscript')}</span><select id="adminegg-copy-script">${this.eggoptions(this.egg.copy_script_from, true)}</select></label>
          <label class="adminnests-field"><span>${t('anest.scriptcontainer')}</span><select id="adminegg-script-container">${this.textoptions(['ghcr.io/pterodactyl/installers:debian', 'ghcr.io/pterodactyl/installers:alpine', ...this.containers], this.egg.script_container)}</select></label>
          <label class="adminnests-field"><span>${t('anest.scriptentry')}</span><select id="adminegg-script-entry">${this.textoptions(['/bin/bash', '/bin/ash', 'bash', ...this.entries], this.egg.script_entry)}</select></label>
          <div class="adminnests-field"><span>${t('anest.privileged')}</span>${this.toggle('adminegg-script-privileged', this.egg.script_is_privileged)}</div>
          <label class="adminnests-field adminnests-field-wide"><span>${t('anest.installscript')}</span><textarea id="adminegg-script" rows="20">${this.safe(this.egg.script_install || '')}</textarea></label>
        </div>
        <div class="adminnests-save-row"><button type="button" class="btn btn-primary" id="adminegg-script-save" onclick="adminnests.saveinstall()">${t('anest.saveinstall')}</button></div>
      </section>`;
  },

  async saveinstall() {
    const payload = {
      copy_script_from: Number(Utils.el('adminegg-copy-script')?.value || 0) || null,
      script_container: Utils.el('adminegg-script-container')?.value || '',
      script_entry: Utils.el('adminegg-script-entry')?.value || '',
      script_is_privileged: Utils.el('adminegg-script-privileged')?.checked || false,
      script_install: Utils.el('adminegg-script')?.value || null
    };
    if (!payload.script_container || !payload.script_entry) return this.message(t('anest.err.installrequired'), 'error');
    const button = Utils.el('adminegg-script-save');
    if (button) { button.disabled = true; button.textContent = t('cset.saving'); }
    try {
      const data = await this.request(this.eggbasename() + '/install-script', 'PATCH', payload);
      this.seteggdata(data);
      this.eggsection = 'install';
      this.renderegg();
      this.message(t('anest.installsaved'), 'success');
    } catch (error) {
      this.message(error.message, 'error');
      if (button) { button.disabled = false; button.textContent = t('anest.saveinstall'); }
    }
  },

  eggoptions(selected, empty) {
    const options = this.options.filter(option => Number(option.id) !== Number(this.egg.id));
    return `${empty ? `<option value="">${t('anest.none')}</option>` : ''}${options.map(option => `<option value="${Number(option.id)}" ${Number(option.id) === Number(selected) ? 'selected' : ''}>${this.safe(option.name)}</option>`).join('')}`;
  },

  textoptions(values, selected) {
    const options = [...new Set([selected, ...(values || [])].filter(Boolean))];
    return options.map(value => `<option value="${this.safeattr(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${this.safe(value)}</option>`).join('');
  },

  toggle(id, checked) {
    return `<label class="paneladmin-toggle"><input type="checkbox" id="${id}" ${checked ? 'checked' : ''} onchange="adminpanel.statustoggle('${id}')" /><span></span><em>${checked ? t('csub.enabled') : t('csub.disabled')}</em></label>`;
  },

  async exportegg(id) {
    try {
      const data = await this.request(`/admin/ctrlservers/nests/${this.nest.id}/eggs/${Number(id)}/export`);
      const blob = new Blob([data.content || ''], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = data.filename || 'egg.json';
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      this.message(error.message, 'error');
    }
  },

  async refreshegg(text, section) {
    const data = await this.request(this.eggbasename());
    this.seteggdata(data);
    this.eggsection = section;
    this.renderegg();
    this.message(text, 'success');
  },

  eggbasename() {
    return `/admin/ctrlservers/nests/${this.nest.id}/eggs/${this.egg.id}`;
  },

  jsontext(value) {
    if (!value) return '{}';
    try {
      return JSON.stringify(typeof value === 'string' ? JSON.parse(value) : value, null, 2);
    } catch (error) {
      return String(value);
    }
  },

  message(text, type) {
    const container = Utils.el('adminnests-message');
    if (container) container.innerHTML = `<div class="paneladmin-notice ${type}">${this.safe(text)}</div>`;
  },

  renderempty(text) {
    return `<div class="adminnests-empty"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 12l9 5 9-5"/><path d="M3 16l9 5 9-5"/></svg><strong>${this.safe(text)}</strong></div>`;
  },

  rendererror(title, error, retry) {
    const container = Utils.el('tabpanelnests');
    if (!container) return;
    container.innerHTML = `<div class="paneladmin-error-state"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><strong>${this.safe(title)}</strong><span>${this.safe(error.message)}</span><button type="button" class="btn btn-secondary btn-sm" onclick="${retry}">${t('cset.banner.retry')}</button></div>`;
  },

  async request(endpoint, method = 'GET', payload = null) {
    const { server, apikey } = await adminpanel.credentials();
    const data = await Api.adminrequest(server.panelUrl, apikey, endpoint, method, payload);
    if (App.currentServer !== server) throw new Error(t('anest.panelchanged'));
    return data;
  },

  safe(value) {
    return Utils.escape(String(value ?? ''));
  },

  safeattr(value) {
    return this.safe(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
};
