const ServerSchedules = {
  loading: false,
  schedules: [],
  view: 'list',
  selected: null,
  detailloading: false,
  tasks: [],
  executingids: new Set(),

  async load() {
    const s = App.currentserver;
    if (!s || s.type !== 'Pterodactyl') return;
    this.loading = true;
    this.view = 'list';
    this.selected = null;
    this.tasks = [];
    this.render();
    try {
      const data = await Api.fetchschedules(s.panelurl, s.apikey, s.uuid);
      this.schedules = data.map(s => {
        const attrs = s.attributes || s;
        attrs.id = s.id || attrs.id;
        return attrs;
      });
    } catch (e) {
      console.error(e);
      this.schedules = [];
    } finally {
      this.loading = false;
    }
    this.render();
  },

  async opendetail(schedule) {
    this.selected = { ...schedule };
    this.view = 'detail';
    this.detailloading = true;
    this.tasks = [];
    this.render();
    const s = App.currentserver;
    if (!s) return;
    try {
      const detail = await Api.fetchscheduledetail(s.panelurl, s.apikey, s.uuid, schedule.id);
      this.selected = { ...schedule, ...detail };
      const reltasks = detail.relationships?.tasks?.data;
      if (Array.isarray(reltasks)) {
        this.tasks = reltasks.map(t => {
          const attrs = t.attributes || t;
          attrs.id = t.id || attrs.id;
          return attrs;
        }).sort((a, b) => (a.sequence_id || 0) - (b.sequence_id || 0));
      }
    } catch (e) {
      console.error('Schedule detail fetch failed:', e);
    } finally {
      this.detailloading = false;
    }
    this.render();
  },

  backtolist() {
    this.view = 'list';
    this.selected = null;
    this.tasks = [];
    this.render();
  },

  async execute(id) {
    this.executingids.add(id);
    this.render();
    const s = App.currentserver;
    if (!s) return;
    try {
      await Api.executeschedule(s.panelurl, s.apikey, s.uuid, id);
      await this.load();
    } catch (e) {
      console.error(e);
    } finally {
      this.executingids.delete(id);
    }
    this.render();
  },

  async remove(id) {
    Modal.confirm('Delete Schedule', 'Are you sure you want to delete this schedule?', async () => {
      const s = App.currentserver;
      if (!s) return;
      try {
        await Api.deleteschedule(s.panelurl, s.apikey, s.uuid, id);
        if (this.selected?.id === id) this.backtolist();
        await this.load();
      } catch (e) {
        console.error(e);
      }
    });
  },

  openeditmodal() {
    if (!this.selected) return;
    const sched = this.selected;
    const c = sched.cron || {};
    Modal.open('Edit Schedule', `
      <div class="form-group">
        <label class="form-label">Schedule Name</label>
        <input type="text" class="form-input" id="schedname" value="${Utils.escape(sched.name)}" />
      </div>
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;">
        <div class="form-group">
          <label class="form-label">Minute</label>
          <input type="text" class="form-input" id="schedmin" value="${Utils.escape(c.minute || '*')}" />
        </div>
        <div class="form-group">
          <label class="form-label">Hour</label>
          <input type="text" class="form-input" id="schedhour" value="${Utils.escape(c.hour || '*')}" />
        </div>
        <div class="form-group">
          <label class="form-label">Day (Month)</label>
          <input type="text" class="form-input" id="scheddom" value="${Utils.escape(c.day_of_month || '*')}" />
        </div>
        <div class="form-group">
          <label class="form-label">Month</label>
          <input type="text" class="form-input" id="schedmonth" value="${Utils.escape(c.month || '*')}" />
        </div>
        <div class="form-group">
          <label class="form-label">Day (Week)</label>
          <input type="text" class="form-input" id="scheddow" value="${Utils.escape(c.day_of_week || '*')}" />
        </div>
      </div>
      <div class="form-group" style="display:flex;gap:16px;">
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text-secondary);cursor:pointer;">
          <input type="checkbox" id="schedactive" ${sched.is_active ? 'checked' : ''} style="width:auto;" /> Enabled
        </label>
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text-secondary);cursor:pointer;">
          <input type="checkbox" id="schedonlyonline" ${sched.only_when_online ? 'checked' : ''} style="width:auto;" /> Only when online
        </label>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" id="schededitbtn">Save Changes</button>
      </div>
    `);
    setTimeout(() => {
      const btn = Utils.el('schededitbtn');
      if (btn) btn.addEventListener('click', async () => {
        const s = App.currentserver;
        if (!s) return;
        const name = document.getElementById('schedname').value.trim();
        if (!name) return;
        const payload = {
          name,
          minute: document.getElementById('schedmin').value.trim() || '*',
          hour: document.getElementById('schedhour').value.trim() || '*',
          day_of_month: document.getElementById('scheddom').value.trim() || '*',
          month: document.getElementById('schedmonth').value.trim() || '*',
          day_of_week: document.getElementById('scheddow').value.trim() || '*',
          is_active: document.getElementById('schedactive').checked,
          only_when_online: document.getElementById('schedonlyonline').checked,
        };
        btn.disabled = true;
        btn.textContent = 'Saving...';
        try {
          const ok = await Api.updateschedule(s.panelurl, s.apikey, s.uuid, sched.id, payload);
          if (ok) {
            Modal.close();
            await this.opendetail({ id: sched.id });
          } else {
            alert('Failed to update schedule');
            btn.disabled = false;
            btn.textContent = 'Save Changes';
          }
        } catch (e) {
          console.error(e);
          alert('Failed to update schedule');
          btn.disabled = false;
          btn.textContent = 'Save Changes';
        }
      });
    }, 0);
  },

  opencreatemodal() {
    Modal.open('New Schedule', `
      <div class="form-group">
        <label class="form-label">Schedule Name</label>
        <input type="text" class="form-input" id="schedname" placeholder="e.g. Daily restart" />
      </div>
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;">
        <div class="form-group">
          <label class="form-label">Minute</label>
          <input type="text" class="form-input" id="schedmin" value="*/5" />
        </div>
        <div class="form-group">
          <label class="form-label">Hour</label>
          <input type="text" class="form-input" id="schedhour" value="*" />
        </div>
        <div class="form-group">
          <label class="form-label">Day (Month)</label>
          <input type="text" class="form-input" id="scheddom" value="*" />
        </div>
        <div class="form-group">
          <label class="form-label">Month</label>
          <input type="text" class="form-input" id="schedmonth" value="*" />
        </div>
        <div class="form-group">
          <label class="form-label">Day (Week)</label>
          <input type="text" class="form-input" id="scheddow" value="*" />
        </div>
      </div>
      <div class="form-group" style="display:flex;gap:16px;">
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text-secondary);cursor:pointer;">
          <input type="checkbox" id="schedactive" checked style="width:auto;" /> Enabled
        </label>
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text-secondary);cursor:pointer;">
          <input type="checkbox" id="schedonlyonline" checked style="width:auto;" /> Only when online
        </label>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" id="schedcreatebtn">Create Schedule</button>
      </div>
    `);
    setTimeout(() => {
      const btn = Utils.el('schedcreatebtn');
      if (btn) btn.addEventListener('click', async () => {
        const s = App.currentserver;
        if (!s) return;
        const name = document.getElementById('schedname').value.trim();
        if (!name) return;
        const payload = {
          name,
          minute: document.getElementById('schedmin').value.trim() || '*',
          hour: document.getElementById('schedhour').value.trim() || '*',
          day_of_month: document.getElementById('scheddom').value.trim() || '*',
          month: document.getElementById('schedmonth').value.trim() || '*',
          day_of_week: document.getElementById('scheddow').value.trim() || '*',
          is_active: document.getElementById('schedactive').checked,
          only_when_online: document.getElementById('schedonlyonline').checked,
        };
        btn.disabled = true;
        btn.textContent = 'Creating...';
        try {
          const ok = await Api.createschedule(s.panelurl, s.apikey, s.uuid, payload);
          if (ok) {
            Modal.close();
            await this.load();
          } else {
            alert('Failed to create schedule');
            btn.disabled = false;
            btn.textContent = 'Create Schedule';
          }
        } catch (e) {
          console.error(e);
          alert('Failed to create schedule');
          btn.disabled = false;
          btn.textContent = 'Create Schedule';
        }
      });
    }, 0);
  },

  opentaskmodal() {
    if (!this.selected) return;
    const scheduleid = this.selected.id;
    Modal.open('New Task', `
      <div class="form-group">
        <label class="form-label">Action</label>
        <select class="form-input" id="taskaction">
          <option value="command">Send Command</option>
          <option value="power">Send Power Action</option>
          <option value="backup">Create Backup</option>
        </select>
      </div>
      <div class="form-group" id="taskpayloadgroup">
        <label class="form-label">Payload</label>
        <input type="text" class="form-input" id="taskpayload" placeholder="e.g. save-all" />
      </div>
      <div class="form-group">
        <label class="form-label">Time Offset (seconds)</label>
        <input type="number" class="form-input" id="taskoffset" value="0" />
        <p style="font-size:11px;color:var(--text-muted);margin:4px 0 0;">The amount of time to wait after the previous task executes before running this one. If this is the first task on a schedule this will not be applied.</p>
      </div>
      <div class="form-group" style="display:flex;align-items:center;gap:6px;">
        <input type="checkbox" id="taskcontinue" style="width:auto;" />
        <label for="taskcontinue" style="margin:0;font-size:13px;color:var(--text-secondary);cursor:pointer;">Continue on Failure</label>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" id="taskcreatebtn">Create Task</button>
      </div>
    `);
    setTimeout(() => {
      const actionel = document.getElementById('taskaction');
      const payloadel = document.getElementById('taskpayload');
      if (actionel) actionel.addEventListener('change', () => {
        const v = actionel.value;
        if (v === 'command') { payloadel.placeholder = 'e.g. save-all'; }
        else if (v === 'power') { payloadel.placeholder = 'start / stop / restart / kill'; }
        else if (v === 'backup') { payloadel.placeholder = 'Optional backup name'; }
      });
      const btn = Utils.el('taskcreatebtn');
      if (btn) btn.addEventListener('click', async () => {
        const s = App.currentserver;
        if (!s) return;
        const action = document.getElementById('taskaction').value;
        const payload = document.getElementById('taskpayload').value;
        const timeoffset = parseInt(document.getElementById('taskoffset').value) || 0;
        const continueonfailure = document.getElementById('taskcontinue').checked;
        btn.disabled = true;
        btn.textContent = 'Creating...';
        try {
          const ok = await Api.createscheduletask(s.panelurl, s.apikey, s.uuid, scheduleid, {
            action,
            payload: payload || undefined,
            time_offset: timeoffset,
            continue_on_failure: continueonfailure,
          });
          if (ok) {
            Modal.close();
            await ServerSchedules.opendetail({ id: scheduleid });
          } else {
            alert('Failed to create task');
            btn.disabled = false;
            btn.textContent = 'Create Task';
          }
        } catch (e) {
          console.error(e);
          alert('Failed to create task');
          btn.disabled = false;
          btn.textContent = 'Create Task';
        }
      });
    }, 0);
  },

  async removetask(taskid) {
    Modal.confirm('Delete Task', 'Are you sure you want to delete this task?', async () => {
      const s = App.currentserver;
      if (!s || !this.selected) return;
      try {
        await Api.deletescheduletask(s.panelurl, s.apikey, s.uuid, this.selected.id, taskid);
        await this.opendetail(this.selected);
      } catch (e) {
        console.error(e);
      }
    });
  },

  formatcron(s) {
    const c = s.cron;
    if (!c) return '';
    return `${c.minute} ${c.hour} ${c.day_of_month} ${c.month} ${c.day_of_week}`;
  },

  formatdate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
    return d.toLocaleDateString();
  },

  formataction(action) {
    if (action === 'command') return 'Send Command';
    if (action === 'power') return 'Send Power Action';
    if (action === 'backup') return 'Create Backup';
    return action;
  },

  renderlist() {
    let html = `
      <div class="schedule-content">
        <div class="network-header">
          <div class="network-info-box">
            <svg width="16" height="16" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <span>Schedules allow you to automate server tasks at specific intervals.</span>
          </div>
          <button class="btn btn-primary btn-sm" onclick="ServerSchedules.opencreatemodal()">
            <svg width="14" height="14" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Schedule
          </button>
        </div>
        <div class="schedule-list">`;
    for (let i = 0; i < this.schedules.length; i++) {
      const sched = this.schedules[i];
      const isexec = this.executingids.has(sched.id);
      html += `
          <div class="schedule-card${!sched.is_active ? ' disabled' : ''}">
            <div class="schedule-main" onclick="ServerSchedules.opendetail(ServerSchedules.schedules[${i}])" style="cursor:pointer;">
              <div class="schedule-icon-box">
                <svg width="18" height="18" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              </div>
              <div class="schedule-details">
                <div class="schedule-name-row">
                  <h4>${Utils.escape(sched.name)}</h4>
                  ${!sched.is_active ? '<span class="inactive-badge">Inactive</span>' : ''}
                </div>
                <div class="schedule-cron"><code>${Utils.escape(this.formatcron(sched))}</code></div>
              </div>
              <div class="schedule-timing">
                <div class="timing-item">
                  <span class="timing-label">Last run:</span>
                  <span class="timing-val">${sched.last_run_at ? this.formatdate(sched.last_run_at) : 'Never'}</span>
                </div>
                <div class="timing-item">
                  <span class="timing-label">Next run:</span>
                  <span class="timing-val">${sched.next_run_at ? this.formatdate(sched.next_run_at) : 'Not scheduled'}</span>
                </div>
              </div>
            </div>
            <div class="schedule-actions">
              <button class="btn btn-secondary btn-sm" onclick="ServerSchedules.execute('${sched.id}')" ${isexec ? 'disabled' : ''}>
                ${isexec ? '<svg class="spin" width="14" height="14" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><polyline points="23 4 23 10 17 10"/></svg>' : '<svg width="14" height="14" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>'}
                Run Now
              </button>
              <button class="btn-icon btn-danger-sm" onclick="ServerSchedules.remove('${sched.id}')" title="Delete">
                <svg width="14" height="14" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </div>
          </div>`;
    }
    if (!this.schedules.length) {
      html += '<div class="tab-empty">No automated schedules configured.</div>';
    }
    html += '</div></div>';
    return html;
  },

  renderdetail() {
    const sched = this.selected;
    if (!sched) return '';
    const status = sched.is_processing ? 'Processing' : (sched.is_active ? 'Active' : 'Inactive');
    let html = `
      <div class="schedule-content">
        <div class="schedule-detail-header">
          <button class="btn btn-secondary btn-sm" onclick="ServerSchedules.backtolist()">
            <svg width="14" height="14" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
            Back to Schedules
          </button>
        </div>`;
    if (this.detailloading) {
      html += '<div class="tab-loading"><svg class="spin" width="24" height="24" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15A9 9 0 1 1 5.64 5.64L1 10"/></svg></div>';
      return html + '</div>';
    }
    html += `
        <div class="schedule-detail-top">
          <div class="schedule-detail-title">
            <h2>${Utils.escape(sched.name)}</h2>
            <span class="schedule-status-badge ${sched.is_active ? 'active' : ''}">${status}</span>
          </div>
          <div class="schedule-detail-runs">
            <span>Last run at: <strong>${sched.last_run_at ? this.formatdate(sched.last_run_at) : 'Never'}</strong></span>
            <span class="run-sep">|</span>
            <span>Next run at: <strong>${sched.next_run_at ? this.formatdate(sched.next_run_at) : 'Not scheduled'}</strong></span>
          </div>
        </div>
        <div class="schedule-detail-actions">
          <button class="btn btn-secondary btn-sm" onclick="ServerSchedules.execute('${sched.id}')">
            <svg width="14" height="14" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            Run Now
          </button>
          <button class="btn btn-secondary btn-sm" onclick="ServerSchedules.openeditmodal()">
            <svg width="14" height="14" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
            Edit
          </button>
          <button class="btn btn-primary btn-sm" onclick="ServerSchedules.opentaskmodal()">
            <svg width="14" height="14" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Task
          </button>
        </div>`;
    const c = sched.cron || {};
    html += `
        <div class="schedule-cron-cards">
          <div class="cron-card"><span class="cron-card-label">Minute</span><code>${Utils.escape(c.minute || '*')}</code></div>
          <div class="cron-card"><span class="cron-card-label">Hour</span><code>${Utils.escape(c.hour || '*')}</code></div>
          <div class="cron-card"><span class="cron-card-label">Day (Month)</span><code>${Utils.escape(c.day_of_month || '*')}</code></div>
          <div class="cron-card"><span class="cron-card-label">Month</span><code>${Utils.escape(c.month || '*')}</code></div>
          <div class="cron-card"><span class="cron-card-label">Day (Week)</span><code>${Utils.escape(c.day_of_week || '*')}</code></div>
        </div>`;
    html += '<div class="schedule-tasks-section"><h3 class="tasks-title">Tasks</h3>';
    if (!this.tasks.length) {
      html += '<div class="tab-empty">No tasks configured for this schedule.</div>';
    } else {
      html += '<div class="task-list">';
      for (const task of this.tasks) {
        const payloadtext = task.action === 'power'
          ? ({start:'Start',stop:'Stop',restart:'Restart',kill:'Kill'}[task.payload] || task.payload)
          : (task.payload || '—');
        html += `
            <div class="task-card">
              <div class="task-main">
                <div class="task-sequence">#${task.sequence_id}</div>
                <div class="task-info">
                  <div class="task-action-row">
                    <span class="task-action-badge">${Utils.escape(this.formataction(task.action))}</span>
                    ${task.continue_on_failure ? '<span class="task-continue-badge">Continue on Failure</span>' : ''}
                  </div>
                  <div class="task-payload">${Utils.escape(payloadtext)}</div>
                  <div class="task-meta">Time offset: ${task.time_offset}s</div>
                </div>
              </div>
              <button class="btn-icon btn-danger-sm" onclick="ServerSchedules.removetask('${task.id}')" title="Delete task">
                <svg width="14" height="14" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </div>`;
      }
      html += '</div>';
    }
    html += '</div></div>';
    return html;
  },

  render() {
    const container = Utils.el('tabschedules');
    if (!container) return;
    if (this.loading) {
      container.innerHTML = '<div class="tab-loading"><svg class="spin" width="24" height="24" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15A9 9 0 1 1 5.64 5.64L1 10"/></svg></div>';
      return;
    }
    container.innerHTML = this.view === 'detail' ? this.renderdetail() : this.renderlist();
  },
};
