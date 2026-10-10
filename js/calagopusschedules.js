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
    if (!server || server.type !== 'Calagopus') throw new Error('No Calagopus server selected');
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
    if (container) container.innerHTML = '<div class="calagopus-schedule-unavailable"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><strong>Schedules are not available</strong><span>Schedules can\'t be created for this server.</span></div>';
  },

  rendererror(message) {
    const container = Utils.el('tabSchedules');
    if (container) container.innerHTML = `<div class="calagopus-schedule-unavailable"><strong>Unable to load schedules</strong><span>${this.safe(message)}</span><button class="btn btn-secondary btn-sm" onclick="calagopusschedules.load()">Try Again</button></div>`;
  },

  date(value) {
    if (!value) return 'N/A';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'N/A' : date.toLocaleString();
  },

  render() {
    const container = Utils.el('tabSchedules');
    if (!container) return;
    const atlimit = Number(this.pagination.total || this.schedules.length) >= this.limit;
    const rows = this.schedules.map((schedule, index) => `<tr class="calagopus-schedule-row" onclick="calagopusschedules.opendetail(${index})">
      <td><button class="calagopus-schedule-name">${this.safe(schedule.name)}</button></td>
      <td>${this.safe(this.date(schedule.last_run))}</td>
      <td>${this.safe(this.date(schedule.last_failure))}</td>
      <td><span class="calagopus-schedule-status ${schedule.enabled ? 'enabled' : ''}">${schedule.enabled ? 'Enabled' : 'Disabled'}</span></td>
      <td>${this.safe(this.date(schedule.created))}</td>
      <td><div class="calagopus-schedule-actions"><button title="Run now" onclick="event.stopPropagation();calagopusschedules.run(${index})"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m8 5 11 7-11 7z"></path></svg></button><button title="Edit" onclick="event.stopPropagation();calagopusschedules.openedit(${index})">Edit</button><button class="danger" title="Delete" onclick="event.stopPropagation();calagopusschedules.remove(${index})">Delete</button></div></td>
    </tr>`).join('');
    container.innerHTML = `<div class="calagopus-schedule-page">
      <div class="calagopus-schedule-header"><div><h2>Schedules</h2><span>${Number(this.pagination.total || this.schedules.length)} of ${this.limit} schedules</span></div><div class="calagopus-schedule-header-actions"><label class="calagopus-schedule-search"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg><input value="${this.safe(this.search)}" placeholder="Search schedules" oninput="calagopusschedules.setsearch(this.value)"></label><button class="btn btn-secondary btn-sm" onclick="calagopusschedules.openimport()" ${atlimit ? 'disabled' : ''}>Import</button><button class="btn btn-primary btn-sm" onclick="calagopusschedules.opencreate()" ${atlimit ? 'disabled' : ''}>New Schedule</button></div></div>
      <div class="calagopus-schedule-table-wrap"><table class="calagopus-schedule-table"><thead><tr><th>Name</th><th>Last Run</th><th>Last Failure</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="6"><div class="calagopus-schedule-empty">No schedules found.</div></td></tr>'}</tbody></table></div>${this.paginationhtml()}</div>`;
  },

  paginationhtml() {
    const page = Number(this.pagination.page || 1);
    const perpage = Number(this.pagination.per_page || 25);
    const pages = Math.max(1, Math.ceil(Number(this.pagination.total || 0) / perpage));
    if (pages <= 1) return '';
    return `<div class="calagopus-schedule-pagination"><button class="btn btn-secondary btn-sm" onclick="calagopusschedules.setpage(${page - 1})" ${page <= 1 ? 'disabled' : ''}>Previous</button><span>Page ${page} of ${pages}</span><button class="btn btn-secondary btn-sm" onclick="calagopusschedules.setpage(${page + 1})" ${page >= pages ? 'disabled' : ''}>Next</button></div>`;
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
    container.innerHTML = `<div class="calagopus-schedule-detail"><div class="calagopus-schedule-detail-head"><div class="calagopus-schedule-detail-title"><button title="Back to schedules" onclick="calagopusschedules.backtolist()"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"></path></svg></button><div><h2>${this.safe(schedule.name)}</h2><span class="calagopus-schedule-status ${schedule.enabled ? 'enabled' : ''}">${schedule.enabled ? 'Enabled' : 'Disabled'}</span></div></div><button class="btn btn-secondary btn-sm" onclick="calagopusschedules.openeditdetail()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path></svg>Edit Schedule</button></div><div class="calagopus-schedule-facts"><div><span>Last Run</span><strong>${this.safe(this.date(schedule.last_run))}</strong></div><div><span>Last Failure</span><strong class="${schedule.last_failure ? 'failure' : ''}">${this.safe(this.date(schedule.last_failure))}</strong></div></div><div class="calagopus-schedule-detail-tabs"><button class="${this.detailtab === 'actions' ? 'active' : ''}" onclick="calagopusschedules.setdetailtab('actions')">Actions <span>${this.steps.length}</span></button><button class="${this.detailtab === 'conditions' ? 'active' : ''}" onclick="calagopusschedules.setdetailtab('conditions')">Conditions</button><button class="${this.detailtab === 'triggers' ? 'active' : ''}" onclick="calagopusschedules.setdetailtab('triggers')">Triggers <span>${(schedule.triggers || []).length}</span></button></div><div class="calagopus-schedule-detail-content">${content}</div></div>`;
  },

  openeditdetail() {
    const index = this.schedules.findIndex(schedule => schedule.uuid === this.selectedschedule?.uuid);
    if (index >= 0) this.openedit(index);
  },

  actionshtml() {
    const steps = [...this.steps].sort((left, right) => Number(left.order || 0) - Number(right.order || 0));
    const rows = steps.map((step, index) => {
      const action = step.action || {};
      return `<div class="calagopus-action-row"><span class="calagopus-action-order">${index + 1}</span><div><strong>${this.safe(this.actionlabel(action.type))}</strong><span>${this.safe(this.actionsummary(action))}</span>${step.error ? `<small>${this.safe(step.error)}</small>` : ''}</div><div class="calagopus-action-badges">${action.ignore_failure ? '<span>Ignore Failure</span>' : ''}<button title="Delete action" onclick="calagopusschedules.removeaction('${this.safe(step.uuid)}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"></path></svg></button></div></div>`;
    }).join('');
    return `<div class="calagopus-schedule-section-head"><div><h3>Actions</h3><p>Actions run in order whenever this schedule is triggered.</p></div><button class="btn btn-primary btn-sm" onclick="calagopusschedules.openaction()">New Action</button></div><div class="calagopus-action-list">${rows || '<div class="calagopus-schedule-panel-empty">No actions have been created for this schedule.</div>'}</div>`;
  },

  actionlabel(type) {
    const labels = { send_command: 'Send Command', send_power: 'Send Power Action', wait_for_state: 'Wait for Server State', create_backup: 'Create Backup', restore_backup: 'Restore Backup', delete_backup: 'Delete Backup', move_backup: 'Move Backup', create_database_backup: 'Create Database Backup', delete_database_backup: 'Delete Database Backup', move_database_backup: 'Move Database Backup', restore_database_backup: 'Restore Database Backup', compress_files: 'Compress Files', copy_file: 'Copy File', create_directory: 'Create Directory', decompress_file: 'Decompress File', delete_files: 'Delete Files', pull_file: 'Pull File', rename_files: 'Rename Files', write_file: 'Write File', update_startup_docker_image: 'Update Startup Docker Image', update_startup_command: 'Update Startup Command', update_startup_variable: 'Update Startup Variable', if: 'If', else_if: 'Else If', else: 'Else', end_if: 'End If', ensure: 'Ensure', exit: 'Exit', format: 'Format Text', http_request: 'HTTP Request', match_regex: 'Match Regular Expression', sleep: 'Wait', wait_for_console_line: 'Wait for Console Line' };
    return labels[type] || String(type || 'Action').replaceAll('_', ' ');
  },

  actionsummary(action) {
    if (action.type === 'wait_for_state') return `Wait for ${action.state || 'running'} for up to ${Number(action.timeout || 0)} ms`;
    if (action.type === 'send_command') return action.command || 'Send a console command';
    if (action.type === 'send_power') return `Send ${action.action || 'start'} power signal`;
    if (action.type === 'sleep') return `Wait ${Number(action.duration || 0)} ms`;
    return 'Configured schedule action';
  },

  openaction() {
    const options = this.actiontypes.map(type => `<option value="${type}">${this.safe(this.actionlabel(type))}</option>`).join('');
    const type = this.actiontypes[0];
    Modal.open('Create Action', `<div class="calagopus-action-form"><label class="form-group"><span class="form-label">Action Type</span><select class="form-input" id="calagopus-action-type" onchange="calagopusschedules.actiontypechanged()">${options}</select></label><p id="calagopus-action-description" class="calagopus-action-description">${this.safe(this.actiondescription(type))}</p><div id="calagopus-action-fields">${this.actionfields(type)}</div><div id="calagopus-action-error"></div><div class="modal-actions"><button class="btn btn-secondary" onclick="Modal.close()">Cancel</button><button class="btn btn-primary" onclick="calagopusschedules.createaction()">Create Action</button></div></div>`, 'calagopus-action-modal');
  },

  actiontypechanged() {
    const type = Utils.el('calagopus-action-type').value;
    Utils.el('calagopus-action-description').textContent = this.actiondescription(type);
    Utils.el('calagopus-action-fields').innerHTML = this.actionfields(type);
  },

  actiondescription(type) {
    const descriptions = { send_command: 'Sends a command to the server console.', send_power: 'Changes the server power state.', wait_for_state: 'Waits until the server reaches a selected power state or the timeout expires.', create_backup: 'Creates a new server backup.', restore_backup: 'Restores a selected server backup.', delete_backup: 'Deletes a selected server backup.', move_backup: 'Moves a backup into another backup group.', create_database_backup: 'Creates a backup of a database instance.', delete_database_backup: 'Deletes a database backup.', move_database_backup: 'Moves a database backup into another group.', restore_database_backup: 'Restores a database backup.', compress_files: 'Compresses selected files into an archive.', copy_file: 'Copies a file or directory.', create_directory: 'Creates a directory.', decompress_file: 'Extracts an archive.', delete_files: 'Deletes selected files or directories.', pull_file: 'Downloads a remote file into the server.', rename_files: 'Renames or moves files.', write_file: 'Writes content to a file.', update_startup_docker_image: 'Changes the server Docker image.', update_startup_command: 'Changes the startup command.', update_startup_variable: 'Changes a startup environment variable.', if: 'Starts a conditional action block.', else_if: 'Adds another condition to an If block.', else: 'Adds a fallback branch to an If block.', end_if: 'Ends an If block.', ensure: 'Stops the schedule unless a condition passes.', exit: 'Ends the schedule immediately.', format: 'Formats values and stores the result in a variable.', http_request: 'Sends an HTTP request.', match_regex: 'Matches input against a regular expression.', sleep: 'Pauses the schedule for a duration.', wait_for_console_line: 'Waits for matching console output.' };
    return descriptions[type] || 'Runs the selected schedule action.';
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
    return Object.entries(action).filter(([key]) => key !== 'type').map(([key, value]) => this.actionfield(key, value)).join('') || '<p class="calagopus-action-description">This action has no additional settings.</p>';
  },

  actionfield(key, value) {
    const label = key.split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
    if (key === 'state') return `<label class="form-group"><span class="form-label">${label}</span><select class="form-input" data-action-field="${key}" data-kind="string"><option value="running">Running</option><option value="offline">Offline</option><option value="starting">Starting</option><option value="stopping">Stopping</option></select></label>`;
    if (key === 'action') return `<label class="form-group"><span class="form-label">${label}</span><select class="form-input" data-action-field="${key}" data-kind="string"><option value="start">Start</option><option value="stop">Stop</option><option value="restart">Restart</option><option value="kill">Kill</option></select></label>`;
    if (key === 'method') return `<label class="form-group"><span class="form-label">${label}</span><select class="form-input" data-action-field="${key}" data-kind="string"><option value="get">GET</option><option value="post" selected>POST</option><option value="put">PUT</option><option value="patch">PATCH</option><option value="delete">DELETE</option><option value="head">HEAD</option></select></label>`;
    if (key === 'format' && value === 'tar_gz') return `<label class="form-group"><span class="form-label">Archive Format</span><select class="form-input" data-action-field="${key}" data-kind="string"><option value="tar_gz">tar.gz</option><option value="tar_xz">tar.xz</option><option value="tar_bz2">tar.bz2</option><option value="zip">zip</option></select></label>`;
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
      Utils.el('calagopus-action-error').innerHTML = `<div class="error-msg">Invalid JSON: ${this.safe(error.message)}</div>`;
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
      this.toast('Action created');
      this.renderdetail();
    } catch (error) {
      Utils.el('calagopus-action-error').innerHTML = `<div class="error-msg">${this.safe(error.message)}</div>`;
    }
  },

  removeaction(uuid) {
    Modal.confirm('Delete Action', 'Delete this schedule action?', async () => {
      try {
        await this.request(`/schedules/${this.selectedschedule.uuid}/steps/${uuid}`, 'DELETE');
        this.steps = this.steps.filter(step => step.uuid !== uuid);
        Modal.close();
        this.toast('Action deleted');
        this.renderdetail();
      } catch (error) {
        this.toast(error.message, 'error');
      }
    });
  },

  conditionshtml() {
    const condition = this.condition || { type: 'none' };
    const types = [['none','None'],['and','All Conditions (AND)'],['or','Any Condition (OR)'],['not','Negated Condition (NOT)'],['server_state','Server State'],['uptime','Uptime'],['resource_usage','Resource Usage'],['file_exists','File Exists'],['variable_exists','Variable Exists'],['variable_equals','Variable Equals'],['variable_contains','Variable Contains'],['variable_starts_with','Variable Starts With'],['variable_ends_with','Variable Ends With']];
    const options = types.map(item => `<option value="${item[0]}" ${condition.type === item[0] ? 'selected' : ''}>${item[1]}</option>`).join('');
    return `<div class="calagopus-schedule-section-head"><div><h3>Conditions</h3><p>The schedule runs only when its condition passes.</p></div><button class="btn btn-primary btn-sm" onclick="calagopusschedules.savecondition()">Save Condition</button></div><div class="calagopus-condition-editor"><label class="form-group"><span class="form-label">Condition Type</span><select class="form-input" id="calagopus-condition-type" onchange="calagopusschedules.conditiontypechanged(this.value)">${options}</select></label><div id="calagopus-condition-fields">${this.conditionfields(condition)}</div><div id="calagopus-condition-error"></div></div>`;
  },

  conditiontypechanged(type) {
    const defaults = { none: { type: 'none' }, and: { type: 'and', conditions: [{ type: 'none' }, { type: 'none' }] }, or: { type: 'or', conditions: [{ type: 'none' }, { type: 'none' }] }, not: { type: 'not', condition: { type: 'none' } }, server_state: { type: 'server_state', state: 'running' }, uptime: { type: 'uptime', value: 60, comparator: 'greater_than_or_equals' }, resource_usage: { type: 'resource_usage', metric: 'cpu', value: 90, comparator: 'greater_than' }, file_exists: { type: 'file_exists', file: '/' }, variable_exists: { type: 'variable_exists', variable: { variable: '' } }, variable_equals: { type: 'variable_equals', variable: { variable: '' }, equals: '' }, variable_contains: { type: 'variable_contains', variable: { variable: '' }, contains: '' }, variable_starts_with: { type: 'variable_starts_with', variable: { variable: '' }, starts_with: '' }, variable_ends_with: { type: 'variable_ends_with', variable: { variable: '' }, ends_with: '' } };
    this.condition = defaults[type];
    Utils.el('calagopus-condition-fields').innerHTML = this.conditionfields(this.condition);
  },

  comparatorhtml(value) {
    return `<select class="form-input" id="calagopus-condition-comparator"><option value="smaller_than" ${value === 'smaller_than' ? 'selected' : ''}>Less than</option><option value="smaller_than_or_equals" ${value === 'smaller_than_or_equals' ? 'selected' : ''}>Less than or equal</option><option value="equal" ${value === 'equal' ? 'selected' : ''}>Equal</option><option value="greater_than" ${value === 'greater_than' ? 'selected' : ''}>Greater than</option><option value="greater_than_or_equals" ${value === 'greater_than_or_equals' ? 'selected' : ''}>Greater than or equal</option></select>`;
  },

  conditionfields(condition) {
    if (condition.type === 'none') return '<p class="calagopus-action-description">This schedule has no precondition.</p>';
    if (condition.type === 'and' || condition.type === 'or') return `<label class="form-group"><span class="form-label">Nested Conditions (JSON)</span><textarea class="form-input calagopus-action-json" id="calagopus-condition-json" rows="9">${this.safe(JSON.stringify(condition.conditions, null, 2))}</textarea><small>Enter an array of Calagopus condition objects. Nested AND, OR, and NOT groups are supported.</small></label>`;
    if (condition.type === 'not') return `<label class="form-group"><span class="form-label">Nested Condition (JSON)</span><textarea class="form-input calagopus-action-json" id="calagopus-condition-json" rows="7">${this.safe(JSON.stringify(condition.condition, null, 2))}</textarea><small>Enter the Calagopus condition object that should be negated.</small></label>`;
    if (condition.type === 'server_state') return `<label class="form-group"><span class="form-label">Server State</span><select class="form-input" id="calagopus-condition-state"><option value="running" ${condition.state === 'running' ? 'selected' : ''}>Running</option><option value="offline" ${condition.state === 'offline' ? 'selected' : ''}>Offline</option><option value="starting" ${condition.state === 'starting' ? 'selected' : ''}>Starting</option><option value="stopping" ${condition.state === 'stopping' ? 'selected' : ''}>Stopping</option></select></label>`;
    if (condition.type === 'uptime') return `<div class="calagopus-trigger-grid"><label class="form-group"><span class="form-label">Comparator</span>${this.comparatorhtml(condition.comparator)}</label><label class="form-group"><span class="form-label">Seconds</span><input class="form-input" type="number" id="calagopus-condition-value" min="0" value="${Number(condition.value || 0)}"></label></div>`;
    if (condition.type === 'resource_usage') return `<div class="calagopus-trigger-grid wide"><label class="form-group"><span class="form-label">Metric</span><select class="form-input" id="calagopus-condition-metric"><option value="cpu" ${condition.metric === 'cpu' ? 'selected' : ''}>CPU</option><option value="memory" ${condition.metric === 'memory' ? 'selected' : ''}>Memory</option><option value="disk" ${condition.metric === 'disk' ? 'selected' : ''}>Disk</option></select></label><label class="form-group"><span class="form-label">Comparator</span>${this.comparatorhtml(condition.comparator)}</label><label class="form-group"><span class="form-label">Value</span><input class="form-input" type="number" id="calagopus-condition-value" min="0" value="${Number(condition.value || 0)}"></label></div>`;
    if (condition.type === 'file_exists') return `<label class="form-group"><span class="form-label">File Path</span><input class="form-input" id="calagopus-condition-file" value="${this.safe(condition.file || '')}"></label>`;
    const fieldmap = { variable_equals: ['equals','Equals'], variable_contains: ['contains','Contains'], variable_starts_with: ['starts_with','Starts With'], variable_ends_with: ['ends_with','Ends With'] };
    const extra = fieldmap[condition.type];
    return `<div class="calagopus-trigger-grid"><label class="form-group"><span class="form-label">Variable</span><input class="form-input" id="calagopus-condition-variable" value="${this.safe(condition.variable?.variable || '')}"></label>${extra ? `<label class="form-group"><span class="form-label">${extra[1]}</span><input class="form-input" id="calagopus-condition-extra" value="${this.safe(condition[extra[0]] || '')}"></label>` : ''}</div>`;
  },

  async savecondition() {
    const type = Utils.el('calagopus-condition-type').value;
    let condition = { type };
    try {
      if (type === 'and' || type === 'or') condition.conditions = JSON.parse(Utils.el('calagopus-condition-json').value);
      if (type === 'not') condition.condition = JSON.parse(Utils.el('calagopus-condition-json').value);
    } catch (error) {
      Utils.el('calagopus-condition-error').innerHTML = `<div class="error-msg">Invalid JSON: ${this.safe(error.message)}</div>`;
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
      this.toast('Condition saved');
    } catch (error) {
      Utils.el('calagopus-condition-error').innerHTML = `<div class="error-msg">${this.safe(error.message)}</div>`;
    }
  },

  triggershtml() {
    const triggers = this.selectedschedule?.triggers || [];
    const rows = triggers.map((trigger, index) => `<div class="calagopus-trigger-summary"><span>${index + 1}</span><div><strong>${this.safe(this.triggerlabel(trigger.type))}</strong><small>${this.safe(this.triggersummary(trigger))}</small></div></div>`).join('');
    return `<div class="calagopus-schedule-section-head"><div><h3>Triggers</h3><p>Any configured trigger can start this schedule.</p></div><button class="btn btn-secondary btn-sm" onclick="calagopusschedules.openeditdetail()">Edit Triggers</button></div><div class="calagopus-trigger-summary-list">${rows || '<div class="calagopus-schedule-panel-empty">No triggers have been configured.</div>'}</div>`;
  },

  triggerlabel(type) {
    const labels = { cron: 'Time Interval (Cron)', power_action: 'Power Action', server_state: 'Server State', backup_status: 'Backup Status', database_backup_status: 'Database Backup Status', schedule_completion: 'Schedule Completion', resource_usage: 'Resource Usage', console_line: 'Console Line', crash: 'Server Crash' };
    return labels[type] || type;
  },

  triggersummary(trigger) {
    if (trigger.type === 'cron') return trigger.schedule;
    if (trigger.type === 'power_action') return trigger.action;
    if (trigger.type === 'server_state') return trigger.state;
    if (trigger.type === 'backup_status' || trigger.type === 'database_backup_status') return trigger.status;
    if (trigger.type === 'schedule_completion') return `${trigger.successful ? 'Successful' : 'Failed'} schedule completion`;
    if (trigger.type === 'resource_usage') return `${trigger.metric} ${trigger.comparator.replaceAll('_', ' ')} ${trigger.value} for ${trigger.for_seconds || 0} seconds`;
    if (trigger.type === 'console_line') return `Console contains ${trigger.contains}`;
    return 'Runs when the server crashes';
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
    const title = this.editinguuid ? 'Edit Schedule' : 'Create Schedule';
    const triggers = this.triggers.map((trigger, index) => this.triggerhtml(trigger, index)).join('');
    Modal.open(title, `<div class="calagopus-schedule-form">
      <div class="form-group"><label class="form-label">Schedule Name *</label><input class="form-input" id="calagopus-schedule-name" maxlength="255" value="${this.safe(schedule?.name || '')}" placeholder="Daily backup"></div>
      <label class="calagopus-schedule-toggle"><input type="checkbox" id="calagopus-schedule-enabled" ${schedule?.enabled === false ? '' : 'checked'}><span></span><strong id="calagopus-schedule-enabled-label">${schedule?.enabled === false ? 'Disabled' : 'Enabled'}</strong></label>
      <div class="calagopus-trigger-title"><div><strong>Triggers</strong><span>${this.triggers.length} / ${this.triggerlimit}</span></div><button class="btn btn-secondary btn-sm" onclick="calagopusschedules.addtrigger()" ${this.triggers.length >= this.triggerlimit ? 'disabled' : ''}>Add Trigger</button></div>
      <div class="calagopus-trigger-list">${triggers || '<div class="calagopus-trigger-empty">No triggers added. Add one to decide when this schedule runs.</div>'}</div>
      <div id="calagopus-schedule-error"></div>
      <div class="modal-actions"><button class="btn btn-secondary" onclick="Modal.close()">Cancel</button><button class="btn btn-primary" onclick="calagopusschedules.save('${this.editinguuid}')">${this.editinguuid ? 'Save Changes' : 'Create Schedule'}</button></div>
    </div>`);
    const toggle = Utils.el('calagopus-schedule-enabled');
    toggle?.addEventListener('change', () => { Utils.el('calagopus-schedule-enabled-label').textContent = toggle.checked ? 'Enabled' : 'Disabled'; });
  },

  triggerhtml(trigger, index) {
    const options = [['cron','Time Interval (Cron)'],['power_action','Power Action'],['server_state','Server State'],['backup_status','Backup Status'],['database_backup_status','Database Backup Status'],['schedule_completion','Schedule Completion'],['resource_usage','Resource Usage'],['console_line','Console Line'],['crash','Server Crash']].map(item => `<option value="${item[0]}" ${trigger.type === item[0] ? 'selected' : ''}>${item[1]}</option>`).join('');
    return `<div class="calagopus-trigger-card"><div class="calagopus-trigger-head"><label class="form-group"><span class="form-label">Trigger ${index + 1}</span><select class="form-input" onchange="calagopusschedules.changetype(${index},this.value)">${options}</select></label><button class="calagopus-trigger-remove" title="Remove trigger" onclick="calagopusschedules.removetrigger(${index})">&times;</button></div>${this.triggerfields(trigger, index)}</div>`;
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
    if (trigger.type === 'power_action') return this.selectfield(index, 'action', 'Action', [['start','Start'],['stop','Stop'],['restart','Restart'],['kill','Kill']], trigger.action);
    if (trigger.type === 'server_state') return this.selectfield(index, 'state', 'State', [['offline','Offline'],['starting','Starting'],['stopping','Stopping'],['running','Running']], trigger.state);
    if (trigger.type === 'backup_status' || trigger.type === 'database_backup_status') return this.selectfield(index, 'status', 'Status', [['starting','Starting'],['finished','Finished'],['failed','Failed']], trigger.status);
    if (trigger.type === 'schedule_completion') {
      const schedules = this.schedules.map(schedule => [schedule.uuid, schedule.name]);
      return `<div class="calagopus-trigger-grid">${this.selectfield(index, 'schedule', 'Schedule', [['','Select a schedule'], ...schedules], trigger.schedule)}${this.selectfield(index, 'successful', 'Result', [['true','Successful'],['false','Failed']], String(trigger.successful))}</div>`;
    }
    if (trigger.type === 'resource_usage') return `<div class="calagopus-trigger-grid wide">${this.selectfield(index, 'metric', 'Metric', [['cpu','CPU'],['memory','Memory'],['disk','Disk']], trigger.metric)}${this.selectfield(index, 'comparator', 'Comparison', [['smaller_than','Less than'],['smaller_than_or_equals','Less than or equal'],['equal','Equal'],['greater_than','Greater than'],['greater_than_or_equals','Greater than or equal']], trigger.comparator)}${this.inputfield(index, 'value', 'Value', trigger.value, 'number', 'min="0"')}${this.inputfield(index, 'for_seconds', 'For seconds', trigger.for_seconds, 'number', 'min="0" max="86400"')}</div>`;
    if (trigger.type === 'console_line') return `<div class="calagopus-trigger-grid">${this.inputfield(index, 'contains', 'Line contains', trigger.contains)}${this.inputfield(index, 'variable', 'Output variable (optional)', trigger.variable)}</div><label class="calagopus-trigger-check"><input type="checkbox" ${trigger.case_insensitive ? 'checked' : ''} onchange="calagopusschedules.settrigger(${index},'case_insensitive',this.checked)">Case insensitive</label>`;
    return '<div class="calagopus-trigger-note">Runs when the server process crashes.</div>';
  },

  cronfields(trigger, index) {
    if (trigger.advanced) return `${this.inputfield(index, 'schedule', 'Cron Schedule *', trigger.schedule)}<label class="calagopus-trigger-check"><input type="checkbox" checked onchange="calagopusschedules.setadvanced(${index},this.checked)">Edit as cron expression</label>`;
    const runs = this.selectfield(index, 'frequency', 'Runs', [['everyminutes','Every few minutes'],['everyhours','Every few hours'],['daily','Daily'],['weekly','Weekly'],['monthly','Monthly']], trigger.frequency);
    let extra = '';
    if (trigger.frequency === 'everyminutes') extra = this.inputfield(index, 'interval', 'Every minutes', trigger.interval, 'number', 'min="1" max="59"');
    if (trigger.frequency === 'everyhours') extra = this.inputfield(index, 'interval', 'Every hours', trigger.interval, 'number', 'min="1" max="23"');
    if (trigger.frequency === 'weekly') extra = this.selectfield(index, 'weekday', 'Weekday', [['0','Sunday'],['1','Monday'],['2','Tuesday'],['3','Wednesday'],['4','Thursday'],['5','Friday'],['6','Saturday']], trigger.weekday);
    if (trigger.frequency === 'monthly') extra = this.inputfield(index, 'day', 'Day of month', trigger.day, 'number', 'min="1" max="31"');
    const time = ['daily','weekly','monthly'].includes(trigger.frequency) ? this.inputfield(index, 'time', 'At', trigger.time, 'time') : '';
    return `<div class="calagopus-trigger-grid">${runs}${extra}${time}</div><label class="calagopus-trigger-check"><input type="checkbox" onchange="calagopusschedules.setadvanced(${index},this.checked)">Edit as cron expression</label>`;
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
      errorbox.innerHTML = '<div class="error-msg">Enter a schedule name.</div>';
      return;
    }
    if (!data.triggers.length) {
      errorbox.innerHTML = '<div class="error-msg">Add at least one trigger.</div>';
      return;
    }
    try {
      await this.request(uuid ? `/schedules/${uuid}` : '/schedules', uuid ? 'PATCH' : 'POST', data);
      Modal.close();
      this.toast(uuid ? 'Schedule updated' : 'Schedule created');
      this.load();
    } catch (error) {
      errorbox.innerHTML = `<div class="error-msg">${this.safe(error.message)}</div>`;
    }
  },

  async run(index) {
    try {
      await this.request(`/schedules/${this.schedules[index].uuid}/trigger`, 'POST', { skip_condition: false });
      this.toast('Schedule started');
    } catch (error) {
      this.toast(error.message, 'error');
    }
  },

  remove(index) {
    const schedule = this.schedules[index];
    Modal.confirm('Delete Schedule', `Delete ${this.safe(schedule.name)}?`, async () => {
      try {
        await this.request(`/schedules/${schedule.uuid}`, 'DELETE');
        Modal.close();
        this.toast('Schedule deleted');
        this.load();
      } catch (error) {
        this.toast(error.message, 'error');
      }
    });
  },

  openimport() {
    Modal.open('Import Schedule', '<div class="calagopus-schedule-import"><p>Select a Calagopus schedule export in JSON format.</p><input class="form-input" type="file" id="calagopus-schedule-import" accept=".json,application/json"><div id="calagopus-schedule-import-error"></div><div class="modal-actions"><button class="btn btn-secondary" onclick="Modal.close()">Cancel</button><button class="btn btn-primary" onclick="calagopusschedules.importfile()">Import</button></div></div>');
  },

  async importfile() {
    const file = Utils.el('calagopus-schedule-import').files?.[0];
    const errorbox = Utils.el('calagopus-schedule-import-error');
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      await this.request('/schedules/import', 'POST', data);
      Modal.close();
      this.toast('Schedule imported');
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
