const Cron = {
  server: null,
  loading: false,
  entries: [],
  rawCrontab: '',

  async load() {
    this.server = App.currentServer;
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
    this.rawCrontab = '';

    const r = await this.exec('crontab -l 2>/dev/null');
    if (r.exitCode !== 0 || !r.stdout.trim()) {
      this.rawCrontab = r.stdout || '';
      return;
    }

    this.rawCrontab = r.stdout;
    const lines = r.stdout.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#')) continue;

      const parts = line.split(/\s+/);
      if (parts.length >= 6) {
        this.entries.push({
          lineNum: i,
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
    const newLine = `${minute} ${hour} ${dom} ${month} ${dow} ${command}`;
    const current = this.rawCrontab.trim();
    const content = current ? current + '\n' + newLine : newLine;

    const r = await this.exec(`echo '${content.replace(/'/g, "'\\''")}' | crontab -`);
    if (r.exitCode !== 0) return { error: r.stdout || r.stderr || t('cron.error.add') };

    await this.fetchentries();
    return { success: true };
  },

  async deleteentry(index) {
    const lines = this.rawCrontab.split('\n');
    const targetLine = this.entries[index];
    if (!targetLine) return { error: t('cron.error.not_found') };

    const newLines = [];
    for (let i = 0; i < lines.length; i++) {
      if (i !== targetLine.lineNum) {
        newLines.push(lines[i]);
      }
    }

    const content = newLines.join('\n').trim();
    const r = content
      ? await this.exec(`echo '${content.replace(/'/g, "'\\''")}' | crontab -`)
      : await this.exec('crontab -r 2>/dev/null; echo done');

    if (r.exitCode !== 0) return { error: r.stdout || r.stderr || t('cron.error.delete') };

    await this.fetchentries();
    return { success: true };
  },

  async exec(command) {
    const cfg = {
      host: this.server.host,
      port: this.server.port || 22,
      username: this.server.username || 'root'
    };
    if (this.server.authType === 'key') {
      const pk = await Servers.resolvevpsprivatekey(this.server);
      if (pk) {
        cfg.authType = 'privateKey';
        cfg.privateKey = pk;
      }
    }
    if (!cfg.authType) {
      cfg.authType = 'password';
      cfg.password = this.server.password || '';
    }
    const isRoot = (this.server.username || 'root') === 'root';
    if (isRoot) {
      return await window.electronAPI.sshexec(cfg, command);
    }
    const pass = (this.server.password || '').replace(/'/g, "'\\''");
    const wrapped = command.replace(/'/g, "'\\''");
    return await window.electronAPI.sshexec(cfg, `echo '${pass}' | sudo -S sh -c '${wrapped}' 2>/dev/null`);
  },

  render() {
    const tab = Utils.el('tabCron');
    if (!tab) return;

    if (this.loading) {
      tab.innerHTML = `<div class="loading"><div class="spinner"></div><div class="loading-text">${t('common.loading')}</div></div>`;
      return;
    }

    let html = `<div class="cron-container">
      <div class="fw-card">
        <div class="fw-card-header">
          <h3>${t('cron.title')}</h3>
          <div class="cron-header-right">
            <span class="packages-count-badge">${this.entries.length}</span>
            <button class="btn btn-primary btn-sm" onclick="Cron.showaddentry()">${t('cron.add_job')}</button>
          </div>
        </div>
        <div class="fw-card-body">`;

    if (this.entries.length > 0) {
      html += `<div class="cron-table-wrap"><table class="fw-table cron-table">
        <thead><tr>
          <th>${t('cron.col.schedule')}</th>
          <th>${t('cron.col.minute')}</th>
          <th>${t('cron.col.hour')}</th>
          <th>${t('cron.col.day')}</th>
          <th>${t('cron.col.month')}</th>
          <th>${t('cron.col.weekday')}</th>
          <th>${t('cron.col.command')}</th>
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
            <button class="btn-icon btn-danger-sm" onclick="Cron.confirmdelete(${i})" title="${t('cron.delete')}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </td>
        </tr>`;
      }

      html += '</tbody></table></div>';
    } else {
      html += `<div class="fw-empty">${t('cron.empty')}</div>`;
    }

    html += `</div></div>

      <div class="fw-card">
        <div class="fw-card-header"><h3>${t('cron.raw')}</h3></div>
        <div class="fw-card-body">
          <pre class="fw-raw">${Utils.escape(this.rawCrontab || t('cron.no_crontab'))}</pre>
        </div>
      </div>
    </div>`;

    tab.innerHTML = html;
  },

  showaddentry() {
    Modal.open(t('cron.add_title'), `
      <p style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">${t('cron.hint')}</p>
      <div class="cron-form-grid">
        <div class="form-group">
          <label class="form-label">${t('cron.label.minute')}</label>
          <input class="form-input" type="text" id="cronMin" value="0" placeholder="0-59" />
        </div>
        <div class="form-group">
          <label class="form-label">${t('cron.label.hour')}</label>
          <input class="form-input" type="text" id="cronHour" value="0" placeholder="0-23" />
        </div>
        <div class="form-group">
          <label class="form-label">${t('cron.label.day')}</label>
          <input class="form-input" type="text" id="cronDom" value="*" placeholder="1-31" />
        </div>
        <div class="form-group">
          <label class="form-label">${t('cron.label.month')}</label>
          <input class="form-input" type="text" id="cronMonth" value="*" placeholder="1-12" />
        </div>
        <div class="form-group">
          <label class="form-label">${t('cron.label.weekday')}</label>
          <input class="form-input" type="text" id="cronDow" value="*" placeholder="0-6" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">${t('cron.label.command')}</label>
        <input class="form-input" type="text" id="cronCmd" placeholder="/path/to/script.sh" />
      </div>
      <div class="cron-presets">
        <span class="cron-preset-label">${t('cron.presets')}</span>
        <button class="btn btn-sm btn-secondary" onclick="Cron.preset('minute')">${t('cron.preset.minute')}</button>
        <button class="btn btn-sm btn-secondary" onclick="Cron.preset('hourly')">${t('cron.preset.hourly')}</button>
        <button class="btn btn-sm btn-secondary" onclick="Cron.preset('daily')">${t('cron.preset.daily')}</button>
        <button class="btn btn-sm btn-secondary" onclick="Cron.preset('weekly')">${t('cron.preset.weekly')}</button>
        <button class="btn btn-sm btn-secondary" onclick="Cron.preset('monthly')">${t('cron.preset.monthly')}</button>
      </div>
      <div id="cronError"></div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">${t('cron.cancel')}</button>
        <button class="btn btn-primary" id="cronAddBtn">${t('cron.add_job')}</button>
      </div>
    `);
    setTimeout(() => {
      const btn = Utils.el('cronAddBtn');
      if (btn) btn.addEventListener('click', async () => {
        const min = Utils.el('cronMin').value.trim() || '*';
        const hour = Utils.el('cronHour').value.trim() || '*';
        const dom = Utils.el('cronDom').value.trim() || '*';
        const month = Utils.el('cronMonth').value.trim() || '*';
        const dow = Utils.el('cronDow').value.trim() || '*';
        const cmd = Utils.el('cronCmd').value.trim();
        const err = Utils.el('cronError');
        if (!cmd) { err.innerHTML = `<div class="error-msg">${t('cron.error.command_required')}</div>`; return; }
        btn.disabled = true;
        btn.textContent = t('cron.adding');
        const res = await Cron.addentry(min, hour, dom, month, dow, cmd);
        if (res.error) {
          err.innerHTML = `<div class="error-msg">${Utils.escape(res.error)}</div>`;
          btn.disabled = false;
          btn.textContent = t('cron.add_job');
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
    Utils.el('cronMin').value = p.m;
    Utils.el('cronHour').value = p.h;
    Utils.el('cronDom').value = p.dom;
    Utils.el('cronMonth').value = p.mo;
    Utils.el('cronDow').value = p.dow;
  },

  confirmdelete(index) {
    const entry = this.entries[index];
    if (!entry) return;
    Modal.confirm(t('cron.delete_title'), t('cron.delete_message', { command: Utils.escape(entry.command) }), async () => {
      await this.deleteentry(index);
      this.render();
    });
  }
};
