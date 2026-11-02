const calagopusschedules = {
  schedules: [],
  pagination: {},
  page: 1,
  search: '',
  limit: null,
  triggers: [],
  triggerlimit: 10,
  editinguuid: '',
  view: 'list',
  selectedschedule: null,
  detailtab: 'actions',
  steps: [],
  condition: { type: 'none' },
  actiontypes: ['send_command','send_power','wait_for_state','create_backup','restore_backup','delete_backup','move_backup','create_database_backup','delete_database_backup','move_database_backup','restore_database_backup','compress_files','copy_file','create_directory','decompress_file','delete_files','pull_file','rename_files','write_file','update_startup_docker_image','update_startup_command','update_startup_variable','if','else_if','else','end_if','ensure','exit','format','http_request','match_regex','sleep','wait_for_console_line'],
  timer: null,

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
        const error = await response.json();
        message = error.errors?.[0] || error.message || message;
      } catch (error) {}
      const failure = new Error(message);
      failure.status = response.status;
      throw failure;
    }
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  },

  safe(value) {
    return Utils.escape(String(value ?? ''));
  },

  async load() {
    this.view = 'list';
    this.selectedschedule = null;
    this.renderloading();
    try {
      const server = App.currentServer;
      let limits = server.featurelimits || {};
      if (limits.schedules === undefined) {
        const result = await Api.fetchcalagopusserver(server.panelUrl, await Servers.resolveapikey(server), server.uuid);
        limits = result.feature_limits || {};
        server.featurelimits = limits;
        Servers.save();
      }
      this.limit = Number(limits.schedules ?? 0);
      if (this.limit <= 0) {
        this.renderunavailable();
        return;
      }
      const query = new URLSearchParams({ page: String(this.page), per_page: '25' });
      if (this.search) query.set('search', this.search);
      const result = await this.request(`/schedules?${query}`);
      this.pagination = result?.schedules || {};
      this.schedules = this.pagination.data || [];
      this.render();
    } catch (error) {
      if (error.status === 404) this.renderunavailable();
      else this.rendererror(error.message);
    }
  },

  renderloading() {
    const container = Utils.el('tabSchedules');
    if (container) container.innerHTML = '<div class="tab-loading"><span class="spinner"></span></div>';
  },

  renderunavailable() {
    const container = Utils.el('tabSchedules');
    if (container) container.innerHTML = `<div class="calagopus-schedule-unavailable"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><strong>${t('csched.unavailable')}</strong><span>${t('csched.unavailable.desc')}</span></div>`;
  },

  rendererror(message) {
    const container = Utils.el('tabSchedules');
    if (container) container.innerHTML = `<div class="calagopus-schedule-unavailable"><strong>${t('csched.loadfail')}</strong><span>${this.safe(message)}</span><button class="btn btn-secondary btn-sm" onclick="calagopusschedules.load()">${t('csub.retry')}</button></div>`;
  },

  date(value) {
    if (!value) return t('csub.na');
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? t('csub.na') : date.toLocaleString();
  },

  render() {
    const container = Utils.el('tabSchedules');
    if (!container) return;
    const atlimit = Number(this.pagination.total || this.schedules.length) >= this.limit;
    const rows = this.schedules.map((schedule, index) => `<tr class="calagopus-schedule-row" onclick="calagopusschedules.opendetail(${index})">
      <td><button class="calagopus-schedule-name">${this.safe(schedule.name)}</button></td>
      <td>${this.safe(this.date(schedule.last_run))}</td>
      <td>${this.safe(this.date(schedule.last_failure))}</td>
      <td><span class="calagopus-schedule-status ${schedule.enabled ? 'enabled' : ''}">${schedule.enabled ? t('csub.enabled') : t('csub.disabled')}</span></td>
      <td>${this.safe(this.date(schedule.created))}</td>
      <td><div class="calagopus-schedule-actions"><button title="${t('csched.runnow')}" onclick="event.stopPropagation();calagopusschedules.run(${index})"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m8 5 11 7-11 7z"></path></svg></button><button title="${t('csched.edit')}" onclick="event.stopPropagation();calagopusschedules.openedit(${index})">${t('csched.edit')}</button><button class="danger" title="${t('csched.delete')}" onclick="event.stopPropagation();calagopusschedules.remove(${index})">${t('csched.delete')}</button></div></td>
    </tr>`).join('');
    container.innerHTML = `<div class="calagopus-schedule-page">
      <div class="calagopus-schedule-header"><div><h2>${t('csched.heading')}</h2><span>${t('csched.count', { n: Number(this.pagination.total || this.schedules.length), max: this.limit })}</span></div><div class="calagopus-schedule-header-actions"><label class="calagopus-schedule-search"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg><input value="${this.safe(this.search)}" placeholder="${t('csched.search')}" oninput="calagopusschedules.setsearch(this.value)"></label><button class="btn btn-secondary btn-sm" onclick="calagopusschedules.openimport()" ${atlimit ? 'disabled' : ''}>${t('csched.import')}</button><button class="btn btn-primary btn-sm" onclick="calagopusschedules.opencreate()" ${atlimit ? 'disabled' : ''}>${t('csched.new')}</button></div></div>
      <div class="calagopus-schedule-table-wrap"><table class="calagopus-schedule-table"><thead><tr><th>${t('csched.h.name')}</th><th>${t('csched.h.lastrun')}</th><th>${t('csched.h.lastfailure')}</th><th>${t('csched.h.status')}</th><th>${t('csched.h.created')}</th><th></th></tr></thead><tbody>${rows || `<tr><td colspan="6"><div class="calagopus-schedule-empty">${t('csched.empty')}</div></td></tr>`}</tbody></table></div>${this.paginationhtml()}</div>`;
  },

  paginationhtml() {
    const page = Number(this.pagination.page || 1);
    const perpage = Number(this.pagination.per_page || 25);
    const pages = Math.max(1, Math.ceil(Number(this.pagination.total || 0) / perpage));
    if (pages <= 1) return '';
    return `<div class="calagopus-schedule-pagination"><button class="btn btn-secondary btn-sm" onclick="calagopusschedules.setpage(${page - 1})" ${page <= 1 ? 'disabled' : ''}>${t('csub.previous')}</button><span>${t('csub.page', { page, pages })}</span><button class="btn btn-secondary btn-sm" onclick="calagopusschedules.setpage(${page + 1})" ${page >= pages ? 'disabled' : ''}>${t('csub.next')}</button></div>`;
  },

  setpage(page) {
    if (page < 1) return;
    this.page = page;
    this.load();
  },

  setsearch(value) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.search = value.trim();
      this.page = 1;
      this.load();
    }, 350);
  },

  async opendetail(index) {
    const schedule = this.schedules[index];
    this.view = 'detail';
    this.selectedschedule = schedule;
    this.detailtab = 'actions';
    this.condition = schedule.condition || { type: 'none' };
    this.steps = [];
    this.renderdetailloading();
    try {
      const [detail, steps] = await Promise.all([
        this.request(`/schedules/${schedule.uuid}`),
        this.request(`/schedules/${schedule.uuid}/steps`)
      ]);
      this.selectedschedule = detail?.schedule || schedule;
      this.condition = this.selectedschedule.condition || { type: 'none' };
      this.steps = steps?.schedule_steps || [];
      this.renderdetail();
    } catch (error) {
      this.rendererror(error.message);
    }
  },

  renderdetailloading() {
    const container = Utils.el('tabSchedules');
    if (container) container.innerHTML = '<div class="tab-loading"><span class="spinner"></span></div>';
  },

  backtolist() {
    this.view = 'list';
    this.selectedschedule = null;
    this.render();
  },

  setdetailtab(tab) {
    this.detailtab = tab;
    this.renderdetail();
  },

  renderdetail() {
    const container = Utils.el('tabSchedules');
    const schedule = this.selectedschedule;
    if (!container || !schedule) return;
    let content = '';
    if (this.detailtab === 'actions') content = this.actionshtml();
    if (this.detailtab === 'conditions') content = this.conditionshtml();
    if (this.detailtab === 'triggers') content = this.triggershtml();
    container.innerHTML = `<div class="calagopus-schedule-detail"><div class="calagopus-schedule-detail-head"><div class="calagopus-schedule-detail-title"><button title="${t('csched.back')}" onclick="calagopusschedules.backtolist()"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"></path></svg></button><div><h2>${this.safe(schedule.name)}</h2><span class="calagopus-schedule-status ${schedule.enabled ? 'enabled' : ''}">${schedule.enabled ? t('csub.enabled') : t('csub.disabled')}</span></div></div><button class="btn btn-secondary btn-sm" onclick="calagopusschedules.openeditdetail()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path></svg>${t('csched.edit.title')}</button></div><div class="calagopus-schedule-facts"><div><span>${t('csched.h.lastrun')}</span><strong>${this.safe(this.date(schedule.last_run))}</strong></div><div><span>${t('csched.h.lastfailure')}</span><strong class="${schedule.last_failure ? 'failure' : ''}">${this.safe(this.date(schedule.last_failure))}</strong></div></div><div class="calagopus-schedule-detail-tabs"><button class="${this.detailtab === 'actions' ? 'active' : ''}" onclick="calagopusschedules.setdetailtab('actions')">${t('csched.actions')} <span>${this.steps.length}</span></button><button class="${this.detailtab === 'conditions' ? 'active' : ''}" onclick="calagopusschedules.setdetailtab('conditions')">${t('csched.conditions')}</button><button class="${this.detailtab === 'triggers' ? 'active' : ''}" onclick="calagopusschedules.setdetailtab('triggers')">${t('csched.triggers')} <span>${(schedule.triggers || []).length}</span></button></div><div class="calagopus-schedule-detail-content">${content}</div></div>`;
  },

  openeditdetail() {
    const index = this.schedules.findIndex(schedule => schedule.uuid === this.selectedschedule?.uuid);
    if (index >= 0) this.openedit(index);
  },

  actionshtml() {
    const steps = [...this.steps].sort((left, right) => Number(left.order || 0) - Number(right.order || 0));
    const rows = steps.map((step, index) => {
      const action = step.action || {};
      return `<div class="calagopus-action-row"><span class="calagopus-action-order">${index + 1}</span><div><strong>${this.safe(this.actionlabel(action.type))}</strong><span>${this.safe(this.actionsummary(action))}</span>${step.error ? `<small>${this.safe(step.error)}</small>` : ''}</div><div class="calagopus-action-badges">${action.ignore_failure ? `<span>${t('csched.ignorefailure')}</span>` : ''}<button title="${t('csched.deleteaction')}" onclick="calagopusschedules.removeaction('${this.safe(step.uuid)}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"></path></svg></button></div></div>`;
    }).join('');
    return `<div class="calagopus-schedule-section-head"><div><h3>${t('csched.actions')}</h3><p>${t('csched.actions.desc')}</p></div><button class="btn btn-primary btn-sm" onclick="calagopusschedules.openaction()">${t('csched.newaction')}</button></div><div class="calagopus-action-list">${rows || `<div class="calagopus-schedule-panel-empty">${t('csched.actions.empty')}</div>`}</div>`;
  },

  actionlabel(type) {
    const labels = { send_command: t('csched.action.send_command'), send_power: t('csched.action.send_power'), wait_for_state: t('csched.action.wait_for_state'), create_backup: t('csched.action.create_backup'), restore_backup: t('csched.action.restore_backup'), delete_backup: t('csched.action.delete_backup'), move_backup: t('csched.action.move_backup'), create_database_backup: t('csched.action.create_database_backup'), delete_database_backup: t('csched.action.delete_database_backup'), move_database_backup: t('csched.action.move_database_backup'), restore_database_backup: t('csched.action.restore_database_backup'), compress_files: t('csched.action.compress_files'), copy_file: t('csched.action.copy_file'), create_directory: t('csched.action.create_directory'), decompress_file: t('csched.action.decompress_file'), delete_files: t('csched.action.delete_files'), pull_file: t('csched.action.pull_file'), rename_files: t('csched.action.rename_files'), write_file: t('csched.action.write_file'), update_startup_docker_image: t('csched.action.update_startup_docker_image'), update_startup_command: t('csched.action.update_startup_command'), update_startup_variable: t('csched.action.update_startup_variable'), if: t('csched.action.if'), else_if: t('csched.action.else_if'), else: t('csched.action.else'), end_if: t('csched.action.end_if'), ensure: t('csched.action.ensure'), exit: t('csched.action.exit'), format: t('csched.action.format'), http_request: t('csched.action.http_request'), match_regex: t('csched.action.match_regex'), sleep: t('csched.action.sleep'), wait_for_console_line: t('csched.action.wait_for_console_line') };
    return labels[type] || String(type || t('csched.action.default')).replaceAll('_', ' ');
  },

  actionsummary(action) {
    if (action.type === 'wait_for_state') return t('csched.sum.waitstate', { state: { running: t('status.running'), offline: t('status.offline'), starting: t('status.starting'), stopping: t('status.stopping') }[action.state] || action.state || t('status.running'), ms: Number(action.timeout || 0) });
    if (action.type === 'send_command') return action.command || t('csched.sum.command');
    if (action.type === 'send_power') return t('csched.sum.power', { action: { start: t('csched.power.start'), stop: t('csched.power.stop'), restart: t('csched.power.restart'), kill: t('csched.power.kill') }[action.action] || action.action || t('csched.power.start') });
    if (action.type === 'sleep') return t('csched.sum.sleep', { ms: Number(action.duration || 0) });
    return t('csched.sum.default');
  },

  openaction() {
    const options = this.actiontypes.map(type => `<option value="${type}">${this.safe(this.actionlabel(type))}</option>`).join('');
    const type = this.actiontypes[0];
    Modal.open(t('csched.newaction'), `<div class="calagopus-action-form"><label class="form-group"><span class="form-label">${t('csched.action.type')}</span><select class="form-input" id="calagopus-action-type" onchange="calagopusschedules.actiontypechanged()">${options}</select></label><p id="calagopus-action-description" class="calagopus-action-description">${this.safe(this.actiondescription(type))}</p><div id="calagopus-action-fields">${this.actionfields(type)}</div><div id="calagopus-action-error"></div><div class="modal-actions"><button class="btn btn-secondary" onclick="Modal.close()">${t('csub.cancel')}</button><button class="btn btn-primary" onclick="calagopusschedules.createaction()">${t('csched.createaction')}</button></div></div>`, 'calagopus-action-modal');
  },

  actiontypechanged() {
    const type = Utils.el('calagopus-action-type').value;
    Utils.el('calagopus-action-description').textContent = this.actiondescription(type);
    Utils.el('calagopus-action-fields').innerHTML = this.actionfields(type);
  },

  actiondescription(type) {
    const descriptions = { send_command: t('csched.desc.send_command'), send_power: t('csched.desc.send_power'), wait_for_state: t('csched.desc.wait_for_state'), create_backup: t('csched.desc.create_backup'), restore_backup: t('csched.desc.restore_backup'), delete_backup: t('csched.desc.delete_backup'), move_backup: t('csched.desc.move_backup'), create_database_backup: t('csched.desc.create_database_backup'), delete_database_backup: t('csched.desc.delete_database_backup'), move_database_backup: t('csched.desc.move_database_backup'), restore_database_backup: t('csched.desc.restore_database_backup'), compress_files: t('csched.desc.compress_files'), copy_file: t('csched.desc.copy_file'), create_directory: t('csched.desc.create_directory'), decompress_file: t('csched.desc.decompress_file'), delete_files: t('csched.desc.delete_files'), pull_file: t('csched.desc.pull_file'), rename_files: t('csched.desc.rename_files'), write_file: t('csched.desc.write_file'), update_startup_docker_image: t('csched.desc.update_startup_docker_image'), update_startup_command: t('csched.desc.update_startup_command'), update_startup_variable: t('csched.desc.update_startup_variable'), if: t('csched.desc.if'), else_if: t('csched.desc.else_if'), else: t('csched.desc.else'), end_if: t('csched.desc.end_if'), ensure: t('csched.desc.ensure'), exit: t('csched.desc.exit'), format: t('csched.desc.format'), http_request: t('csched.desc.http_request'), match_regex: t('csched.desc.match_regex'), sleep: t('csched.desc.sleep'), wait_for_console_line: t('csched.desc.wait_for_console_line') };
    return descriptions[type] || t('csched.desc.default');
  },

  defaultaction(type) {
    const defaults = {
      send_command: { type, ignore_failure: false, command: '' }, send_power: { type, ignore_failure: false, action: 'start' }, wait_for_state: { type, ignore_failure: false, state: 'running', timeout: 60000 },
      create_backup: { type, ignore_failure: false, foreground: false, name: null, backup_group_uuid: null, ignored_files: [], output_into: null }, restore_backup: { type, ignore_failure: false, truncate_directory: false, restore_startup: false, backup: { mode: 'latest', backup_group_uuid: null } }, delete_backup: { type, ignore_failure: false, backup: { mode: 'oldest', backup_group_uuid: null } }, move_backup: { type, ignore_failure: false, backup: { mode: 'oldest', backup_group_uuid: null }, backup_group_uuid: null },
      create_database_backup: { type, ignore_failure: false, foreground: false, name: null, database_instance_uuid: '', backup_group_uuid: null, output_into: null }, delete_database_backup: { type, ignore_failure: false, backup: { mode: 'oldest', backup_group_uuid: null }, database_instance_uuid: null }, move_database_backup: { type, ignore_failure: false, backup: { mode: 'oldest', backup_group_uuid: null }, database_instance_uuid: null, backup_group_uuid: null }, restore_database_backup: { type, ignore_failure: false, backup: { mode: 'latest', backup_group_uuid: null }, source_database_instance_uuid: null, database_instance_uuid: null },
      compress_files: { type, ignore_failure: false, foreground: false, root: '/', files: [], format: 'tar_gz', name: 'backup.tar.gz' }, copy_file: { type, ignore_failure: false, foreground: false, file: '', destination: '' }, create_directory: { type, ignore_failure: false, root: '/', name: '' }, decompress_file: { type, ignore_failure: false, foreground: false, root: '/', file: '' }, delete_files: { type, ignore_failure: false, root: '/', files: [] }, pull_file: { type, ignore_failure: false, foreground: false, root: '/', url: '', file_name: null, use_header: true }, rename_files: { type, ignore_failure: false, root: '/', files: [] }, write_file: { type, ignore_failure: false, append: false, file: '', content: '' },
      update_startup_docker_image: { type, ignore_failure: false, image: '' }, update_startup_command: { type, ignore_failure: false, command: '' }, update_startup_variable: { type, ignore_failure: false, env_variable: '', value: '' },
      if: { type, condition: { type: 'none' } }, else_if: { type, condition: { type: 'none' } }, else: { type }, end_if: { type }, ensure: { type, condition: { type: 'none' } }, exit: { type, successful: true }, format: { type, format: '', output_into: { variable: '' } }, http_request: { type, ignore_failure: false, method: 'post', url: '', headers: [], body: null, timeout: 10000, ignore_error_status: false, output_status_into: null, output_body_into: null }, match_regex: { type, input: '', regex: '', output_into: [] }, sleep: { type, duration: 1000 }, wait_for_console_line: { type, ignore_failure: false, contains: '', case_insensitive: false, timeout: 5000, output_into: null }
    };
    return defaults[type];
  },

  actionfields(type) {
    const action = this.defaultaction(type);
    return Object.entries(action).filter(([key]) => key !== 'type').map(([key, value]) => this.actionfield(key, value)).join('') || `<p class="calagopus-action-description">${t('csched.action.emptyfields')}</p>`;
  },

  actionfieldlabel(key) {
    const labels = { ignore_failure: t('csched.field.ignore_failure'), command: t('csched.field.command'), action: t('csched.field.action'), state: t('csched.field.state'), timeout: t('csched.field.timeout'), foreground: t('csched.field.foreground'), name: t('csched.field.name'), backup_group_uuid: t('csched.field.backup_group_uuid'), ignored_files: t('csched.field.ignored_files'), output_into: t('csched.field.output_into'), truncate_directory: t('csched.field.truncate_directory'), restore_startup: t('csched.field.restore_startup'), backup: t('csched.field.backup'), database_instance_uuid: t('csched.field.database_instance_uuid'), source_database_instance_uuid: t('csched.field.source_database_instance_uuid'), root: t('csched.field.root'), files: t('csched.field.files'), format: t('csched.field.format'), destination: t('csched.field.destination'), file: t('csched.field.file'), url: t('csched.field.url'), file_name: t('csched.field.file_name'), use_header: t('csched.field.use_header'), append: t('csched.field.append'), content: t('csched.field.content'), image: t('csched.field.image'), env_variable: t('csched.field.env_variable'), value: t('csched.field.value'), condition: t('csched.field.condition'), successful: t('csched.field.successful'), method: t('csched.field.method'), headers: t('csched.field.headers'), body: t('csched.field.body'), ignore_error_status: t('csched.field.ignore_error_status'), output_status_into: t('csched.field.output_status_into'), output_body_into: t('csched.field.output_body_into'), input: t('csched.field.input'), regex: t('csched.field.regex'), duration: t('csched.field.duration'), contains: t('csched.field.contains'), case_insensitive: t('csched.field.case_insensitive'), variable: t('csched.field.variable') };
    return labels[key] || key.split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
  },

  actionfield(key, value) {
    const label = this.actionfieldlabel(key);
    if (key === 'state') return `<label class="form-group"><span class="form-label">${label}</span><select class="form-input" data-action-field="${key}" data-kind="string"><option value="running">${t('status.running')}</option><option value="offline">${t('status.offline')}</option><option value="starting">${t('status.starting')}</option><option value="stopping">${t('status.stopping')}</option></select></label>`;
    if (key === 'action') return `<label class="form-group"><span class="form-label">${label}</span><select class="form-input" data-action-field="${key}" data-kind="string"><option value="start">${t('csched.power.start')}</option><option value="stop">${t('csched.power.stop')}</option><option value="restart">${t('csched.power.restart')}</option><option value="kill">${t('csched.power.kill')}</option></select></label>`;
    if (key === 'method') return `<label class="form-group"><span class="form-label">${label}</span><select class="form-input" data-action-field="${key}" data-kind="string"><option value="get">GET</option><option value="post" selected>POST</option><option value="put">PUT</option><option value="patch">PATCH</option><option value="delete">DELETE</option><option value="head">HEAD</option></select></label>`;
    if (key === 'format' && value === 'tar_gz') return `<label class="form-group"><span class="form-label">${t('csched.field.archiveformat')}</span><select class="form-input" data-action-field="${key}" data-kind="string"><option value="tar_gz">tar.gz</option><option value="tar_xz">tar.xz</option><option value="tar_bz2">tar.bz2</option><option value="zip">zip</option></select></label>`;
    if (typeof value === 'boolean') return `<label class="calagopus-trigger-check"><input type="checkbox" data-action-field="${key}" data-kind="boolean" ${value ? 'checked' : ''}>${label}</label>`;
    if (typeof value === 'number') return `<label class="form-group"><span class="form-label">${label}${key.includes('timeout') || key === 'duration' ? ' (ms)' : ''}</span><input class="form-input" type="number" data-action-field="${key}" data-kind="number" min="0" value="${value}"></label>`;
    if (Array.isArray(value) || (value && typeof value === 'object')) return `<label class="form-group"><span class="form-label">${label} (JSON)</span><textarea class="form-input calagopus-action-json" data-action-field="${key}" data-kind="json" rows="3">${this.safe(JSON.stringify(value, null, 2))}</textarea></label>`;
    return `<label class="form-group"><span class="form-label">${label}</span><input class="form-input" data-action-field="${key}" data-kind="${value === null ? 'nullable' : 'string'}" value="${this.safe(value ?? '')}"></label>`;
  },

  async createaction() {
    const type = Utils.el('calagopus-action-type').value;
    const action = { type };
    try {
      document.querySelectorAll('[data-action-field]').forEach(field => {
        const key = field.getAttribute('data-action-field');
        const kind = field.dataset.kind;
        if (kind === 'boolean') action[key] = field.checked;
        else if (kind === 'number') action[key] = Number(field.value || 0);
        else if (kind === 'json') action[key] = JSON.parse(field.value);
        else if (kind === 'nullable') action[key] = field.value.trim() ? (key.includes('output_') ? { variable: field.value } : field.value) : null;
        else action[key] = field.value;
      });
    } catch (error) {
      Utils.el('calagopus-action-error').innerHTML = `<div class="error-msg">${t('csched.invalidjson')}: ${this.safe(error.message)}</div>`;
      return;
    }
    try {
      const order = this.steps.reduce((highest, step) => Math.max(highest, Number(step.order || 0)), 0) + 1;
      const result = await this.request(`/schedules/${this.selectedschedule.uuid}/steps`, 'POST', { order, action });
      this.steps.push(result.schedule_step);
      if (type === 'if') {
        const ending = await this.request(`/schedules/${this.selectedschedule.uuid}/steps`, 'POST', { order: order + 1, action: { type: 'end_if' } });
        this.steps.push(ending.schedule_step);
      }
      Modal.close();
      this.toast(t('csched.action.created'));
      this.renderdetail();
    } catch (error) {
      Utils.el('calagopus-action-error').innerHTML = `<div class="error-msg">${this.safe(error.message)}</div>`;
    }
  },

  removeaction(uuid) {
    Modal.confirm(t('csched.deleteaction'), t('csched.deleteaction.confirm'), async () => {
      try {
        await this.request(`/schedules/${this.selectedschedule.uuid}/steps/${uuid}`, 'DELETE');
        this.steps = this.steps.filter(step => step.uuid !== uuid);
        Modal.close();
        this.toast(t('csched.action.deleted'));
        this.renderdetail();
      } catch (error) {
        this.toast(error.message, 'error');
      }
    });
  },

  conditionshtml() {
    const condition = this.condition || { type: 'none' };
    const types = ['none', 'and', 'or', 'not', 'server_state', 'uptime', 'resource_usage', 'file_exists', 'variable_exists', 'variable_equals', 'variable_contains', 'variable_starts_with', 'variable_ends_with'];
    const options = types.map(type => `<option value="${type}" ${condition.type === type ? 'selected' : ''}>${this.conditionlabel(type)}</option>`).join('');
    return `<div class="calagopus-schedule-section-head"><div><h3>${t('csched.conditions')}</h3><p>${t('csched.conditions.desc')}</p></div><button class="btn btn-primary btn-sm" onclick="calagopusschedules.savecondition()">${t('csched.savecondition')}</button></div><div class="calagopus-condition-editor"><label class="form-group"><span class="form-label">${t('csched.condition.type')}</span><select class="form-input" id="calagopus-condition-type" onchange="calagopusschedules.conditiontypechanged(this.value)">${options}</select></label><div id="calagopus-condition-fields">${this.conditionfields(condition)}</div><div id="calagopus-condition-error"></div></div>`;
  },

  conditionlabel(type) {
    const labels = { none: t('csched.cond.none'), and: t('csched.cond.and'), or: t('csched.cond.or'), not: t('csched.cond.not'), server_state: t('csched.cond.server_state'), uptime: t('csched.cond.uptime'), resource_usage: t('csched.cond.resource_usage'), file_exists: t('csched.cond.file_exists'), variable_exists: t('csched.cond.variable_exists'), variable_equals: t('csched.cond.variable_equals'), variable_contains: t('csched.cond.variable_contains'), variable_starts_with: t('csched.cond.variable_starts_with'), variable_ends_with: t('csched.cond.variable_ends_with') };
    return labels[type] || type;
  },

  conditiontypechanged(type) {
    const defaults = { none: { type: 'none' }, and: { type: 'and', conditions: [{ type: 'none' }, { type: 'none' }] }, or: { type: 'or', conditions: [{ type: 'none' }, { type: 'none' }] }, not: { type: 'not', condition: { type: 'none' } }, server_state: { type: 'server_state', state: 'running' }, uptime: { type: 'uptime', value: 60, comparator: 'greater_than_or_equals' }, resource_usage: { type: 'resource_usage', metric: 'cpu', value: 90, comparator: 'greater_than' }, file_exists: { type: 'file_exists', file: '/' }, variable_exists: { type: 'variable_exists', variable: { variable: '' } }, variable_equals: { type: 'variable_equals', variable: { variable: '' }, equals: '' }, variable_contains: { type: 'variable_contains', variable: { variable: '' }, contains: '' }, variable_starts_with: { type: 'variable_starts_with', variable: { variable: '' }, starts_with: '' }, variable_ends_with: { type: 'variable_ends_with', variable: { variable: '' }, ends_with: '' } };
    this.condition = defaults[type];
    Utils.el('calagopus-condition-fields').innerHTML = this.conditionfields(this.condition);
  },

  comparatorhtml(value) {
    return `<select class="form-input" id="calagopus-condition-comparator"><option value="smaller_than" ${value === 'smaller_than' ? 'selected' : ''}>${t('csched.cmp.smaller_than')}</option><option value="smaller_than_or_equals" ${value === 'smaller_than_or_equals' ? 'selected' : ''}>${t('csched.cmp.smaller_than_or_equals')}</option><option value="equal" ${value === 'equal' ? 'selected' : ''}>${t('csched.cmp.equal')}</option><option value="greater_than" ${value === 'greater_than' ? 'selected' : ''}>${t('csched.cmp.greater_than')}</option><option value="greater_than_or_equals" ${value === 'greater_than_or_equals' ? 'selected' : ''}>${t('csched.cmp.greater_than_or_equals')}</option></select>`;
  },

  conditionfields(condition) {
    if (condition.type === 'none') return `<p class="calagopus-action-description">${t('csched.cond.empty')}</p>`;
    if (condition.type === 'and' || condition.type === 'or') return `<label class="form-group"><span class="form-label">${t('csched.cond.nested')}</span><textarea class="form-input calagopus-action-json" id="calagopus-condition-json" rows="9">${this.safe(JSON.stringify(condition.conditions, null, 2))}</textarea><small>${t('csched.cond.nested.desc')}</small></label>`;
    if (condition.type === 'not') return `<label class="form-group"><span class="form-label">${t('csched.cond.nestedone')}</span><textarea class="form-input calagopus-action-json" id="calagopus-condition-json" rows="7">${this.safe(JSON.stringify(condition.condition, null, 2))}</textarea><small>${t('csched.cond.nestedone.desc')}</small></label>`;
    if (condition.type === 'server_state') return `<label class="form-group"><span class="form-label">${t('csched.field.server_state')}</span><select class="form-input" id="calagopus-condition-state"><option value="running" ${condition.state === 'running' ? 'selected' : ''}>${t('status.running')}</option><option value="offline" ${condition.state === 'offline' ? 'selected' : ''}>${t('status.offline')}</option><option value="starting" ${condition.state === 'starting' ? 'selected' : ''}>${t('status.starting')}</option><option value="stopping" ${condition.state === 'stopping' ? 'selected' : ''}>${t('status.stopping')}</option></select></label>`;
    if (condition.type === 'uptime') return `<div class="calagopus-trigger-grid"><label class="form-group"><span class="form-label">${t('csched.field.comparator')}</span>${this.comparatorhtml(condition.comparator)}</label><label class="form-group"><span class="form-label">${t('csched.field.seconds')}</span><input class="form-input" type="number" id="calagopus-condition-value" min="0" value="${Number(condition.value || 0)}"></label></div>`;
    if (condition.type === 'resource_usage') return `<div class="calagopus-trigger-grid wide"><label class="form-group"><span class="form-label">${t('csched.field.metric')}</span><select class="form-input" id="calagopus-condition-metric"><option value="cpu" ${condition.metric === 'cpu' ? 'selected' : ''}>${t('csched.metric.cpu')}</option><option value="memory" ${condition.metric === 'memory' ? 'selected' : ''}>${t('csched.metric.memory')}</option><option value="disk" ${condition.metric === 'disk' ? 'selected' : ''}>${t('csched.metric.disk')}</option></select></label><label class="form-group"><span class="form-label">${t('csched.field.comparator')}</span>${this.comparatorhtml(condition.comparator)}</label><label class="form-group"><span class="form-label">${t('csched.field.value')}</span><input class="form-input" type="number" id="calagopus-condition-value" min="0" value="${Number(condition.value || 0)}"></label></div>`;
    if (condition.type === 'file_exists') return `<label class="form-group"><span class="form-label">${t('csched.field.filepath')}</span><input class="form-input" id="calagopus-condition-file" value="${this.safe(condition.file || '')}"></label>`;
    const fieldmap = { variable_equals: ['equals', t('csched.field.equals')], variable_contains: ['contains', t('csched.field.contains')], variable_starts_with: ['starts_with', t('csched.field.starts_with')], variable_ends_with: ['ends_with', t('csched.field.ends_with')] };
    const extra = fieldmap[condition.type];
    return `<div class="calagopus-trigger-grid"><label class="form-group"><span class="form-label">${t('csched.field.variable')}</span><input class="form-input" id="calagopus-condition-variable" value="${this.safe(condition.variable?.variable || '')}"></label>${extra ? `<label class="form-group"><span class="form-label">${extra[1]}</span><input class="form-input" id="calagopus-condition-extra" value="${this.safe(condition[extra[0]] || '')}"></label>` : ''}</div>`;
  },

  async savecondition() {
    const type = Utils.el('calagopus-condition-type').value;
    let condition = { type };
    try {
      if (type === 'and' || type === 'or') condition.conditions = JSON.parse(Utils.el('calagopus-condition-json').value);
      if (type === 'not') condition.condition = JSON.parse(Utils.el('calagopus-condition-json').value);
    } catch (error) {
      Utils.el('calagopus-condition-error').innerHTML = `<div class="error-msg">${t('csched.invalidjson')}: ${this.safe(error.message)}</div>`;
      return;
    }
    if (type === 'server_state') condition.state = Utils.el('calagopus-condition-state').value;
    if (type === 'uptime') condition = { type, comparator: Utils.el('calagopus-condition-comparator').value, value: Number(Utils.el('calagopus-condition-value').value || 0) };
    if (type === 'resource_usage') condition = { type, metric: Utils.el('calagopus-condition-metric').value, comparator: Utils.el('calagopus-condition-comparator').value, value: Number(Utils.el('calagopus-condition-value').value || 0) };
    if (type === 'file_exists') condition.file = Utils.el('calagopus-condition-file').value;
    if (type.startsWith('variable_')) {
      condition.variable = { variable: Utils.el('calagopus-condition-variable').value };
      const map = { variable_equals: 'equals', variable_contains: 'contains', variable_starts_with: 'starts_with', variable_ends_with: 'ends_with' };
      if (map[type]) condition[map[type]] = Utils.el('calagopus-condition-extra').value;
    }
    try {
      await this.request(`/schedules/${this.selectedschedule.uuid}`, 'PATCH', { condition });
      this.condition = condition;
      this.selectedschedule.condition = condition;
      this.toast(t('csched.condition.saved'));
    } catch (error) {
      Utils.el('calagopus-condition-error').innerHTML = `<div class="error-msg">${this.safe(error.message)}</div>`;
    }
  },

  triggershtml() {
    const triggers = this.selectedschedule?.triggers || [];
    const rows = triggers.map((trigger, index) => `<div class="calagopus-trigger-summary"><span>${index + 1}</span><div><strong>${this.safe(this.triggerlabel(trigger.type))}</strong><small>${this.safe(this.triggersummary(trigger))}</small></div></div>`).join('');
    return `<div class="calagopus-schedule-section-head"><div><h3>${t('csched.triggers')}</h3><p>${t('csched.triggers.desc')}</p></div><button class="btn btn-secondary btn-sm" onclick="calagopusschedules.openeditdetail()">${t('csched.edittriggers')}</button></div><div class="calagopus-trigger-summary-list">${rows || `<div class="calagopus-schedule-panel-empty">${t('csched.triggers.empty')}</div>`}</div>`;
  },

  triggerlabel(type) {
    const labels = { cron: t('csched.trigger.cron'), power_action: t('csched.trigger.power_action'), server_state: t('csched.trigger.server_state'), backup_status: t('csched.trigger.backup_status'), database_backup_status: t('csched.trigger.database_backup_status'), schedule_completion: t('csched.trigger.schedule_completion'), resource_usage: t('csched.trigger.resource_usage'), console_line: t('csched.trigger.console_line'), crash: t('csched.trigger.crash') };
    return labels[type] || type;
  },

  triggersummary(trigger) {
    if (trigger.type === 'cron') return trigger.schedule;
    if (trigger.type === 'power_action') return { start: t('csched.power.start'), stop: t('csched.power.stop'), restart: t('csched.power.restart'), kill: t('csched.power.kill') }[trigger.action] || trigger.action;
    if (trigger.type === 'server_state') return { running: t('status.running'), offline: t('status.offline'), starting: t('status.starting'), stopping: t('status.stopping') }[trigger.state] || trigger.state;
    if (trigger.type === 'backup_status' || trigger.type === 'database_backup_status') return { starting: t('csched.bstatus.starting'), finished: t('csched.bstatus.finished'), failed: t('csched.bstatus.failed') }[trigger.status] || trigger.status;
    if (trigger.type === 'schedule_completion') return trigger.successful ? t('csched.sum.successful') : t('csched.sum.failed');
    if (trigger.type === 'resource_usage') return t('csched.sum.resource', { metric: { cpu: t('csched.metric.cpu'), memory: t('csched.metric.memory'), disk: t('csched.metric.disk') }[trigger.metric] || trigger.metric, comparator: { smaller_than: t('csched.cmp.smaller_than'), smaller_than_or_equals: t('csched.cmp.smaller_than_or_equals'), equal: t('csched.cmp.equal'), greater_than: t('csched.cmp.greater_than'), greater_than_or_equals: t('csched.cmp.greater_than_or_equals') }[trigger.comparator] || trigger.comparator, value: trigger.value, seconds: trigger.for_seconds || 0 });
    if (trigger.type === 'console_line') return t('csched.sum.console', { text: trigger.contains });
    return t('csched.sum.crash');
  },

  defaulttrigger(type = 'cron') {
    const defaults = {
      cron: { type: 'cron', schedule: '*/30 * * * *', advanced: false, frequency: 'everyminutes', interval: 30, time: '00:00', weekday: '0', day: 1 },
      power_action: { type: 'power_action', action: 'start' },
      server_state: { type: 'server_state', state: 'running' },
      backup_status: { type: 'backup_status', status: 'finished' },
      database_backup_status: { type: 'database_backup_status', status: 'finished' },
      schedule_completion: { type: 'schedule_completion', schedule: '', successful: true },
      resource_usage: { type: 'resource_usage', metric: 'cpu', comparator: 'greater_than', value: 90, for_seconds: 0 },
      console_line: { type: 'console_line', contains: '', case_insensitive: false, variable: '' },
      crash: { type: 'crash' }
    };
    return { ...defaults[type] };
  },

  opencreate() {
    this.editinguuid = '';
    this.triggers = [];
    this.rendermodal(null);
  },

  openedit(index) {
    const schedule = this.schedules[index];
    this.editinguuid = schedule.uuid;
    this.triggers = (schedule.triggers || []).map(trigger => ({ ...trigger, variable: trigger.output_into?.variable || '', advanced: trigger.type === 'cron' }));
    this.rendermodal(schedule);
  },

  rendermodal(schedule) {
    const title = this.editinguuid ? t('csched.edit.title') : t('csched.create.title');
    const triggers = this.triggers.map((trigger, index) => this.triggerhtml(trigger, index)).join('');
    Modal.open(title, `<div class="calagopus-schedule-form">
      <div class="form-group"><label class="form-label">${t('csched.name')}</label><input class="form-input" id="calagopus-schedule-name" maxlength="255" value="${this.safe(schedule?.name || '')}" placeholder="${t('csched.name.placeholder')}"></div>
      <label class="calagopus-schedule-toggle"><input type="checkbox" id="calagopus-schedule-enabled" ${schedule?.enabled === false ? '' : 'checked'}><span></span><strong id="calagopus-schedule-enabled-label">${schedule?.enabled === false ? t('csub.disabled') : t('csub.enabled')}</strong></label>
      <div class="calagopus-trigger-title"><div><strong>${t('csched.triggers')}</strong><span>${this.triggers.length} / ${this.triggerlimit}</span></div><button class="btn btn-secondary btn-sm" onclick="calagopusschedules.addtrigger()" ${this.triggers.length >= this.triggerlimit ? 'disabled' : ''}>${t('csched.addtrigger')}</button></div>
      <div class="calagopus-trigger-list">${triggers || `<div class="calagopus-trigger-empty">${t('csched.triggers.emptyadd')}</div>`}</div>
      <div id="calagopus-schedule-error"></div>
      <div class="modal-actions"><button class="btn btn-secondary" onclick="Modal.close()">${t('csub.cancel')}</button><button class="btn btn-primary" onclick="calagopusschedules.save('${this.editinguuid}')">${this.editinguuid ? t('csched.savechanges') : t('csched.create.title')}</button></div>
    </div>`);
    const toggle = Utils.el('calagopus-schedule-enabled');
    toggle?.addEventListener('change', () => { Utils.el('calagopus-schedule-enabled-label').textContent = toggle.checked ? t('csub.enabled') : t('csub.disabled'); });
  },

  triggerhtml(trigger, index) {
    const options = ['cron', 'power_action', 'server_state', 'backup_status', 'database_backup_status', 'schedule_completion', 'resource_usage', 'console_line', 'crash'].map(type => `<option value="${type}" ${trigger.type === type ? 'selected' : ''}>${this.triggerlabel(type)}</option>`).join('');
    return `<div class="calagopus-trigger-card"><div class="calagopus-trigger-head"><label class="form-group"><span class="form-label">${t('csched.trigger.n', { n: index + 1 })}</span><select class="form-input" onchange="calagopusschedules.changetype(${index},this.value)">${options}</select></label><button class="calagopus-trigger-remove" title="${t('csched.removetrigger')}" onclick="calagopusschedules.removetrigger(${index})">&times;</button></div>${this.triggerfields(trigger, index)}</div>`;
  },

  selectfield(index, key, label, choices, value) {
    const options = choices.map(choice => `<option value="${choice[0]}" ${String(value) === String(choice[0]) ? 'selected' : ''}>${choice[1]}</option>`).join('');
    return `<label class="form-group"><span class="form-label">${label}</span><select class="form-input" onchange="calagopusschedules.settrigger(${index},'${key}',this.value)">${options}</select></label>`;
  },

  inputfield(index, key, label, value, type = 'text', extra = '') {
    return `<label class="form-group"><span class="form-label">${label}</span><input class="form-input" type="${type}" value="${this.safe(value)}" ${extra} oninput="calagopusschedules.settrigger(${index},'${key}',this.value)"></label>`;
  },

  triggerfields(trigger, index) {
    if (trigger.type === 'cron') return this.cronfields(trigger, index);
    if (trigger.type === 'power_action') return this.selectfield(index, 'action', t('csched.field.action'), [['start', t('csched.power.start')], ['stop', t('csched.power.stop')], ['restart', t('csched.power.restart')], ['kill', t('csched.power.kill')]], trigger.action);
    if (trigger.type === 'server_state') return this.selectfield(index, 'state', t('csched.field.state'), [['offline', t('status.offline')], ['starting', t('status.starting')], ['stopping', t('status.stopping')], ['running', t('status.running')]], trigger.state);
    if (trigger.type === 'backup_status' || trigger.type === 'database_backup_status') return this.selectfield(index, 'status', t('csched.field.status'), [['starting', t('csched.bstatus.starting')], ['finished', t('csched.bstatus.finished')], ['failed', t('csched.bstatus.failed')]], trigger.status);
    if (trigger.type === 'schedule_completion') {
      const schedules = this.schedules.map(schedule => [schedule.uuid, schedule.name]);
      return `<div class="calagopus-trigger-grid">${this.selectfield(index, 'schedule', t('csched.field.schedule'), [['', t('csched.field.selectschedule')], ...schedules], trigger.schedule)}${this.selectfield(index, 'successful', t('csched.field.result'), [['true', t('csched.sum.successful')], ['false', t('csched.sum.failed')]], String(trigger.successful))}</div>`;
    }
    if (trigger.type === 'resource_usage') return `<div class="calagopus-trigger-grid wide">${this.selectfield(index, 'metric', t('csched.field.metric'), [['cpu', t('csched.metric.cpu')], ['memory', t('csched.metric.memory')], ['disk', t('csched.metric.disk')]], trigger.metric)}${this.selectfield(index, 'comparator', t('csched.field.comparison'), [['smaller_than', t('csched.cmp.smaller_than')], ['smaller_than_or_equals', t('csched.cmp.smaller_than_or_equals')], ['equal', t('csched.cmp.equal')], ['greater_than', t('csched.cmp.greater_than')], ['greater_than_or_equals', t('csched.cmp.greater_than_or_equals')]], trigger.comparator)}${this.inputfield(index, 'value', t('csched.field.value'), trigger.value, 'number', 'min="0"')}${this.inputfield(index, 'for_seconds', t('csched.field.forseconds'), trigger.for_seconds, 'number', 'min="0" max="86400"')}</div>`;
    if (trigger.type === 'console_line') return `<div class="calagopus-trigger-grid">${this.inputfield(index, 'contains', t('csched.field.linecontains'), trigger.contains)}${this.inputfield(index, 'variable', t('csched.field.outputvariable'), trigger.variable)}</div><label class="calagopus-trigger-check"><input type="checkbox" ${trigger.case_insensitive ? 'checked' : ''} onchange="calagopusschedules.settrigger(${index},'case_insensitive',this.checked)">${t('csched.field.caseinsensitive')}</label>`;
    return `<div class="calagopus-trigger-note">${t('csched.trigger.crash.desc')}</div>`;
  },

  cronfields(trigger, index) {
    if (trigger.advanced) return `${this.inputfield(index, 'schedule', t('csched.field.cronschedule'), trigger.schedule)}<label class="calagopus-trigger-check"><input type="checkbox" checked onchange="calagopusschedules.setadvanced(${index},this.checked)">${t('csched.field.editascron')}</label>`;
    const runs = this.selectfield(index, 'frequency', t('csched.field.runs'), [['everyminutes', t('csched.freq.everyminutes')], ['everyhours', t('csched.freq.everyhours')], ['daily', t('csched.freq.daily')], ['weekly', t('csched.freq.weekly')], ['monthly', t('csched.freq.monthly')]], trigger.frequency);
    let extra = '';
    if (trigger.frequency === 'everyminutes') extra = this.inputfield(index, 'interval', t('csched.field.everyminutes'), trigger.interval, 'number', 'min="1" max="59"');
    if (trigger.frequency === 'everyhours') extra = this.inputfield(index, 'interval', t('csched.field.everyhours'), trigger.interval, 'number', 'min="1" max="23"');
    if (trigger.frequency === 'weekly') extra = this.selectfield(index, 'weekday', t('csched.field.weekday'), [['0', t('csched.weekday.0')], ['1', t('csched.weekday.1')], ['2', t('csched.weekday.2')], ['3', t('csched.weekday.3')], ['4', t('csched.weekday.4')], ['5', t('csched.weekday.5')], ['6', t('csched.weekday.6')]], trigger.weekday);
    if (trigger.frequency === 'monthly') extra = this.inputfield(index, 'day', t('csched.field.dayofmonth'), trigger.day, 'number', 'min="1" max="31"');
    const time = ['daily', 'weekly', 'monthly'].includes(trigger.frequency) ? this.inputfield(index, 'time', t('csched.field.at'), trigger.time, 'time') : '';
    return `<div class="calagopus-trigger-grid">${runs}${extra}${time}</div><label class="calagopus-trigger-check"><input type="checkbox" onchange="calagopusschedules.setadvanced(${index},this.checked)">${t('csched.field.editascron')}</label>`;
  },

  settrigger(index, key, value) {
    if (['interval','day','value','for_seconds'].includes(key)) value = Number(value);
    if (key === 'successful') value = value === 'true';
    this.triggers[index][key] = value;
    if (this.triggers[index].type === 'cron') this.triggers[index].schedule = this.makecron(this.triggers[index]);
    if (key === 'frequency') this.refreshmodal();
  },

  makecron(trigger) {
    const parts = String(trigger.time || '00:00').split(':');
    const hour = Number(parts[0] || 0);
    const minute = Number(parts[1] || 0);
    if (trigger.frequency === 'everyminutes') return `*/${Math.max(1, Number(trigger.interval || 1))} * * * *`;
    if (trigger.frequency === 'everyhours') return `0 */${Math.max(1, Number(trigger.interval || 1))} * * *`;
    if (trigger.frequency === 'weekly') return `${minute} ${hour} * * ${trigger.weekday || 0}`;
    if (trigger.frequency === 'monthly') return `${minute} ${hour} ${Math.min(31, Math.max(1, Number(trigger.day || 1)))} * *`;
    return `${minute} ${hour} * * *`;
  },

  setadvanced(index, enabled) {
    const trigger = this.triggers[index];
    trigger.advanced = enabled;
    if (!enabled && !trigger.frequency) {
      trigger.frequency = 'daily';
      trigger.time = '00:00';
      trigger.interval = 30;
      trigger.weekday = '0';
      trigger.day = 1;
      trigger.schedule = this.makecron(trigger);
    }
    this.refreshmodal();
  },

  syncmodal() {
    const name = Utils.el('calagopus-schedule-name')?.value || '';
    const enabled = Utils.el('calagopus-schedule-enabled')?.checked ?? true;
    return { name, enabled };
  },

  refreshmodal() {
    const values = this.syncmodal();
    this.rendermodal({ name: values.name, enabled: values.enabled });
  },

  addtrigger() {
    if (this.triggers.length >= this.triggerlimit) return;
    const values = this.syncmodal();
    this.triggers.push(this.defaulttrigger());
    this.rendermodal({ name: values.name, enabled: values.enabled });
  },

  removetrigger(index) {
    const values = this.syncmodal();
    this.triggers.splice(index, 1);
    this.rendermodal({ name: values.name, enabled: values.enabled });
  },

  changetype(index, type) {
    const values = this.syncmodal();
    this.triggers[index] = this.defaulttrigger(type);
    this.rendermodal({ name: values.name, enabled: values.enabled });
  },

  payload() {
    const triggers = this.triggers.map(trigger => {
      const result = { ...trigger };
      delete result.advanced;
      delete result.frequency;
      delete result.interval;
      delete result.time;
      delete result.weekday;
      delete result.day;
      if (result.type === 'console_line') {
        result.output_into = result.variable ? { variable: result.variable } : null;
        delete result.variable;
      }
      return result;
    });
    return { name: Utils.el('calagopus-schedule-name').value.trim(), enabled: Utils.el('calagopus-schedule-enabled').checked, triggers, condition: { type: 'none' } };
  },

  async save(uuid) {
    const data = this.payload();
    const errorbox = Utils.el('calagopus-schedule-error');
    if (!data.name) {
      errorbox.innerHTML = `<div class="error-msg">${t('csched.error.name')}</div>`;
      return;
    }
    if (!data.triggers.length) {
      errorbox.innerHTML = `<div class="error-msg">${t('csched.error.triggers')}</div>`;
      return;
    }
    try {
      await this.request(uuid ? `/schedules/${uuid}` : '/schedules', uuid ? 'PATCH' : 'POST', data);
      Modal.close();
      this.toast(uuid ? t('csched.updated') : t('csched.created'));
      this.load();
    } catch (error) {
      errorbox.innerHTML = `<div class="error-msg">${this.safe(error.message)}</div>`;
    }
  },

  async run(index) {
    try {
      await this.request(`/schedules/${this.schedules[index].uuid}/trigger`, 'POST', { skip_condition: false });
      this.toast(t('csched.started'));
    } catch (error) {
      this.toast(error.message, 'error');
    }
  },

  remove(index) {
    const schedule = this.schedules[index];
    Modal.confirm(t('csched.deleteschedule'), t('csched.deleteschedule.confirm', { name: this.safe(schedule.name) }), async () => {
      try {
        await this.request(`/schedules/${schedule.uuid}`, 'DELETE');
        Modal.close();
        this.toast(t('csched.deleted'));
        this.load();
      } catch (error) {
        this.toast(error.message, 'error');
      }
    });
  },

  openimport() {
    Modal.open(t('csched.import.title'), `<div class="calagopus-schedule-import"><p>${t('csched.import.desc')}</p><input class="form-input" type="file" id="calagopus-schedule-import" accept=".json,application/json"><div id="calagopus-schedule-import-error"></div><div class="modal-actions"><button class="btn btn-secondary" onclick="Modal.close()">${t('csub.cancel')}</button><button class="btn btn-primary" onclick="calagopusschedules.importfile()">${t('csched.import')}</button></div></div>`);
  },

  async importfile() {
    const file = Utils.el('calagopus-schedule-import').files?.[0];
    const errorbox = Utils.el('calagopus-schedule-import-error');
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      await this.request('/schedules/import', 'POST', data);
      Modal.close();
      this.toast(t('csched.imported'));
      this.load();
    } catch (error) {
      errorbox.innerHTML = `<div class="error-msg">${this.safe(error.message)}</div>`;
    }
  },

  toast(message, type = 'success') {
    document.querySelector('.calagopus-schedule-toast')?.remove();
    const toast = document.createElement('div');
    toast.className = `toast file-toast calagopus-schedule-toast file-toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
  }
};
