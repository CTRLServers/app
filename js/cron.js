const Cron = {
  server: null,
  loading: false,
  entries: [],
  rawcrontab: '',

  async load() {
    this.server = App.currentserver;
    if (!this.server || this.server.type !== 'VPS/VDS') return;

    this.loading = true;
    this.render();

    try {
      await this.fetchentries();
    } catch (e) {
      console.error('Cron load error:', e);
    }

    this.loading = false;
    this.render();
  },

  async fetchentries() {
    this.entries = [];
    this.rawcrontab = '';

    const r = await this.exec('crontab -l 2>/dev/null');
    if (r.exitcode !== 0 || !r.stdout.trim()) {
      this.rawcrontab = r.stdout || '';
      return;
    }

    this.rawcrontab = r.stdout;
    const lines = r.stdout.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#')) continue;

      const parts = line.split(/\s+/);
      if (parts.length >= 6) {
        this.entries.push({
          linenum: i,
          minute: parts[0],
          hour: parts[1],
          dom: parts[2],
          month: parts[3],
          dow: parts[4],
          command: parts.slice(5).join(' '),
          raw: line
        });
      }
    }
  },

  async addentry(minute, hour, dom, month, dow, command) {
    const newline = `${minute} ${hour} ${dom} ${month} ${dow} ${command}`;
    const current = this.rawcrontab.trim();
    const content = current ? current + '\n' + newline : newline;

    const r = await this.exec(`echo '${content.replace(/'/g, "'\\''")}' | crontab -`);
    if (r.exitcode !== 0) return { error: r.stdout || r.stderr || 'Failed to add entry' };

    await this.fetchentries();
    return { success: true };
  },

  async deleteentry(index) {
    const lines = this.rawcrontab.split('\n');
    const targetline = this.entries[index];
    if (!targetline) return { error: 'Entry not found' };

    const newlines = [];
    for (let i = 0; i < lines.length; i++) {
      if (i !== targetline.linenum) {
        newlines.push(lines[i]);
      }
    }

    const content = newlines.join('\n').trim();
    const r = content
      ? await this.exec(`echo '${content.replace(/'/g, "'\\''")}' | crontab -`)
      : await this.exec('crontab -r 2>/dev/null; echo done');

    if (r.exitcode !== 0) return { error: r.stdout || r.stderr || 'Failed to delete entry' };

    await this.fetchentries();
    return { success: true };
  },

  async exec(command) {
    const cfg = {
      host: this.server.host,
      port: this.server.port || 22,
      username: this.server.username || 'root'
    };
    if (this.server.authtype === 'key' && this.server.privatekey) {
      cfg.authtype = 'privatekey';
      cfg.privatekey = this.server.privatekey;
    } else {
      cfg.authtype = 'password';
      cfg.password = this.server.password || '';
    }
    const isroot = (this.server.username || 'root') === 'root';
    if (isroot) {
      return await window.electronapi.sshexec(cfg, command);
    }
    const pass = (this.server.password || '').replace(/'/g, "'\\''");
    const wrapped = command.replace(/'/g, "'\\''");
    return await window.electronapi.sshexec(cfg, `echo '${pass}' | sudo -S sh -c '${wrapped}' 2>/dev/null`);
  },

  render() {
    const tab = Utils.el('tabcron');
    if (!tab) return;

    if (this.loading) {
      tab.innerHTML = '<div class="loading"><div class="spinner"></div><div class="loading-text">Loading cron jobs...</div></div>';
      return;
    }

    let html = `<div class="cron-container">
      <div class="fw-card">
        <div class="fw-card-header">
          <h3>Cron Jobs</h3>
          <div class="cron-header-right">
            <span class="packages-count-badge">${this.entries.length}</span>
            <button class="btn btn-primary btn-sm" onclick="Cron.showaddentry()">Add Job</button>
          </div>
        </div>
        <div class="fw-card-body">`;

    if (this.entries.length > 0) {
      html += `<div class="cron-table-wrap"><table class="fw-table cron-table">
        <thead><tr>
          <th>Schedule</th>
          <th>Minute</th>
          <th>Hour</th>
          <th>Day</th>
          <th>Month</th>
          <th>Weekday</th>
          <th>Command</th>
          <th></th>
        </tr></thead>
        <tbody>`;

      for (let i = 0; i < this.entries.length; i++) {
        const e = this.entries[i];
        html += `<tr>
          <td><code class="cron-schedule">${Utils.escape(e.minute)} ${Utils.escape(e.hour)} ${Utils.escape(e.dom)} ${Utils.escape(e.month)} ${Utils.escape(e.dow)}</code></td>
          <td><code>${Utils.escape(e.minute)}</code></td>
          <td><code>${Utils.escape(e.hour)}</code></td>
          <td><code>${Utils.escape(e.dom)}</code></td>
          <td><code>${Utils.escape(e.month)}</code></td>
          <td><code>${Utils.escape(e.dow)}</code></td>
          <td><code class="cron-cmd">${Utils.escape(e.command)}</code></td>
          <td>
            <button class="btn-icon btn-danger-sm" onclick="Cron.confirmdelete(${i})" title="Delete">
              <svg width="14" height="14" viewbox="0 0 24 24" fill="none" stroke="currentcolor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </td>
        </tr>`;
      }

      html += '</tbody></table></div>';
    } else {
      html += '<div class="fw-empty">No cron jobs configured</div>';
    }

    html += `</div></div>

      <div class="fw-card">
        <div class="fw-card-header"><h3>Raw Crontab</h3></div>
        <div class="fw-card-body">
          <pre class="fw-raw">${Utils.escape(this.rawcrontab || 'No crontab for current user')}</pre>
        </div>
      </div>
    </div>`;

    tab.innerHTML = html;
  },

  showaddentry() {
    Modal.open('Add Cron Job', `
      <p style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">Use * for any field. Example: 0 2 * * * = daily at 2:00 AM</p>
      <div class="cron-form-grid">
        <div class="form-group">
          <label class="form-label">Minute</label>
          <input class="form-input" type="text" id="cronmin" value="0" placeholder="0-59" />
        </div>
        <div class="form-group">
          <label class="form-label">Hour</label>
          <input class="form-input" type="text" id="cronhour" value="0" placeholder="0-23" />
        </div>
        <div class="form-group">
          <label class="form-label">Day (1-31)</label>
          <input class="form-input" type="text" id="crondom" value="*" placeholder="1-31" />
        </div>
        <div class="form-group">
          <label class="form-label">Month (1-12)</label>
          <input class="form-input" type="text" id="cronmonth" value="*" placeholder="1-12" />
        </div>
        <div class="form-group">
          <label class="form-label">Weekday (0-6)</label>
          <input class="form-input" type="text" id="crondow" value="*" placeholder="0-6" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Command</label>
        <input class="form-input" type="text" id="croncmd" placeholder="/path/to/script.sh" />
      </div>
      <div class="cron-presets">
        <span class="cron-preset-label">Presets:</span>
        <button class="btn btn-sm btn-secondary" onclick="Cron.preset('minute')">Every minute</button>
        <button class="btn btn-sm btn-secondary" onclick="Cron.preset('hourly')">Every hour</button>
        <button class="btn btn-sm btn-secondary" onclick="Cron.preset('daily')">Daily</button>
        <button class="btn btn-sm btn-secondary" onclick="Cron.preset('weekly')">Weekly</button>
        <button class="btn btn-sm btn-secondary" onclick="Cron.preset('monthly')">Monthly</button>
      </div>
      <div id="cronerror"></div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" id="cronaddbtn">Add Job</button>
      </div>
    `);
    setTimeout(() => {
      const btn = Utils.el('cronaddbtn');
      if (btn) btn.addEventListener('click', async () => {
        const min = Utils.el('cronmin').value.trim() || '*';
        const hour = Utils.el('cronhour').value.trim() || '*';
        const dom = Utils.el('crondom').value.trim() || '*';
        const month = Utils.el('cronmonth').value.trim() || '*';
        const dow = Utils.el('crondow').value.trim() || '*';
        const cmd = Utils.el('croncmd').value.trim();
        const err = Utils.el('cronerror');
        if (!cmd) { err.innerHTML = '<div class="error-msg">Command is required</div>'; return; }
        btn.disabled = true;
        btn.textContent = 'Adding...';
        const res = await Cron.addentry(min, hour, dom, month, dow, cmd);
        if (res.error) {
          err.innerHTML = `<div class="error-msg">${Utils.escape(res.error)}</div>`;
          btn.disabled = false;
          btn.textContent = 'Add Job';
          return;
        }
        Modal.close();
        Cron.render();
      });
    }, 0);
  },

  preset(type) {
    const map = {
      minute: { m: '*', h: '*', dom: '*', mo: '*', dow: '*' },
      hourly: { m: '0', h: '*', dom: '*', mo: '*', dow: '*' },
      daily: { m: '0', h: '0', dom: '*', mo: '*', dow: '*' },
      weekly: { m: '0', h: '0', dom: '*', mo: '*', dow: '0' },
      monthly: { m: '0', h: '0', dom: '1', mo: '*', dow: '*' }
    };
    const p = map[type];
    if (!p) return;
    Utils.el('cronmin').value = p.m;
    Utils.el('cronhour').value = p.h;
    Utils.el('crondom').value = p.dom;
    Utils.el('cronmonth').value = p.mo;
    Utils.el('crondow').value = p.dow;
  },

  confirmdelete(index) {
    const entry = this.entries[index];
    if (!entry) return;
    Modal.confirm('Delete Cron Job', `Delete "${entry.command}"?`, async () => {
      await this.deleteentry(index);
      this.render();
    });
  }
};
