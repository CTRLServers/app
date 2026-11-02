const Autostart = {
  server: null,
  loading: false,
  entries: [],
  filter: '',

  async load() {
    this.server = App.currentServer;
    if (!this.server || this.server.type !== 'VPS/VDS') return;
    this.loading = true;
    this.render();
    try {
      await this.fetchentries();
    } catch (error) {
      console.error('Auto start load error:', error);
    }
    this.loading = false;
    this.render();
  },

  async fetchentries() {
    const servicecommand = [
      'if command -v systemctl >/dev/null 2>&1; then',
      '  systemctl list-unit-files --type=service --state=enabled,enabled-runtime --no-legend --no-pager 2>/dev/null | while read -r unit state preset; do',
      '    [ -n "$unit" ] || continue;',
      '    active=$(systemctl is-active "$unit" 2>/dev/null || true);',
      '    description=$(systemctl show "$unit" -p Description --value 2>/dev/null | tr "\\t\\n" "  ");',
      '    printf "__CTRL_AUTOSTART__\\tsystemd\\t%s\\tSystem service\\t%s\\t%s\\t%s\\n" "$unit" "$state" "$active" "$description";',
      '  done;',
      '  systemctl --user list-unit-files --type=service --state=enabled,enabled-runtime --no-legend --no-pager 2>/dev/null | while read -r unit state preset; do',
      '    [ -n "$unit" ] || continue;',
      '    active=$(systemctl --user is-active "$unit" 2>/dev/null || true);',
      '    description=$(systemctl --user show "$unit" -p Description --value 2>/dev/null | tr "\\t\\n" "  ");',
      '    printf "__CTRL_AUTOSTART__\\tsystemd-user\\t%s\\tUser service\\t%s\\t%s\\t%s\\n" "$unit" "$state" "$active" "$description";',
      '  done;',
      'fi'
    ].join(' ');

    const usercroncommand = [
      'crontab -l 2>/dev/null | sed -n "/^[[:space:]]*@reboot[[:space:]]/p" | while IFS= read -r line; do',
      '  command=$(printf "%s" "$line" | sed "s/^[[:space:]]*@reboot[[:space:]]*//");',
      '  printf "__CTRL_AUTOSTART__\\tcron\\tCron @reboot\\tUser crontab\\tenabled\\tscheduled\\t%s\\n" "$command";',
      'done'
    ].join(' ');

    const systemcommand = [
      'for link in /etc/rc[2-5].d/S*; do',
      '  [ -e "$link" ] || continue;',
      '  name=$(basename "$link" | sed "s/^S[0-9][0-9]//");',
      '  printf "__CTRL_AUTOSTART__\\tsysv\\t%s\\tSysV init\\tenabled\\tboot\\t%s\\n" "$name" "$link";',
      'done;',
      'for file in /etc/crontab /etc/cron.d/*; do',
      '  [ -r "$file" ] || continue;',
      '  grep -E "^[[:space:]]*@reboot[[:space:]]" "$file" 2>/dev/null | while IFS= read -r line; do',
      '    printf "__CTRL_AUTOSTART__\\tcron-system\\tCron @reboot\\t%s\\tenabled\\tscheduled\\t%s\\n" "$file" "$line";',
      '  done;',
      'done;',
      'if [ -x /etc/rc.local ]; then',
      '  sed -e "/^[[:space:]]*#/d" -e "/^[[:space:]]*$/d" -e "/^[[:space:]]*exit 0[[:space:]]*$/d" /etc/rc.local 2>/dev/null | while IFS= read -r line; do',
      '    printf "__CTRL_AUTOSTART__\\trc-local\\trc.local\\t/etc/rc.local\\tenabled\\tboot\\t%s\\n" "$line";',
      '  done;',
      'fi'
    ].join(' ');

    const dockercommand = [
      'if command -v docker >/dev/null 2>&1; then',
      '  docker ps -a --format "{{.Names}}\\t{{.Image}}\\t{{.Status}}" 2>/dev/null | while IFS="$(printf "\\t")" read -r name image status; do',
      '    policy=$(docker inspect -f "{{.HostConfig.RestartPolicy.Name}}" "$name" 2>/dev/null);',
      '    case "$policy" in always|unless-stopped|on-failure) ;; *) continue ;; esac;',
      '    case "$status" in Up*) runtime=active ;; *) runtime=inactive ;; esac;',
      '    printf "__CTRL_AUTOSTART__\\tdocker\\t%s\\tDocker container\\t%s\\t%s\\t%s\\n" "$name" "$policy" "$runtime" "$image";',
      '  done;',
      'fi'
    ].join(' ');

    const results = await Promise.allSettled([
      this.exec(servicecommand, { root: false, notify: false }),
      this.exec(usercroncommand, { root: false, notify: false }),
      this.exec(systemcommand, { root: true, notify: false }),
      this.exec(dockercommand, { root: true, notify: false })
    ]);

    const entries = [];
    const seen = new Set();
    results.forEach(result => {
      if (result.status !== 'fulfilled') return;
      this.parseentries(result.value?.stdout || '').forEach(entry => {
        const detailkey = ['cron', 'cron-system', 'rc-local'].includes(entry.type) ? entry.detail : '';
        const key = `${entry.type}|${entry.name}|${entry.source}|${detailkey}`;
        if (seen.has(key)) return;
        seen.add(key);
        entries.push(entry);
      });
    });
    this.entries = entries.sort((a, b) => a.source.localeCompare(b.source) || a.name.localeCompare(b.name));
  },

  parseentries(output) {
    const entries = [];
    for (const line of output.split(/\r?\n/)) {
      if (!line.startsWith('__CTRL_AUTOSTART__\t')) continue;
      const fields = line.split('\t');
      if (!fields[1] || !fields[2]) continue;
      entries.push({
        type: fields[1],
        name: fields[2],
        source: fields[3] || '',
        state: fields[4] || '',
        runtime: fields[5] || '',
        detail: fields.slice(6).join('\t').trim()
      });
    }
    return entries;
  },

  async exec(command, options = {}) {
    return await Servers.execvps(this.server, command, { ...options, page: 'autostart' });
  },

  filteredentries() {
    const query = this.filter.trim().toLowerCase();
    if (!query) return this.entries;
    return this.entries.filter(entry => [entry.name, this.namelabel(entry.name), this.sourcelabel(entry.source), this.runtimelabel(entry), entry.state, entry.detail]
      .some(value => value.toLowerCase().includes(query)));
  },

  entrieshtml() {
    const entries = this.filteredentries();
    if (!entries.length) return `<div class="fw-empty">${t('autostart.empty.filtered')}</div>`;
    return entries.map(entry => {
      const active = ['active', 'boot', 'scheduled'].includes(entry.runtime);
      const runtime = this.runtimelabel(entry);
      return `<div class="svc-card autostart-card">
        <div class="svc-card-main">
          <div class="svc-status-dot ${active ? 'svc-active' : 'svc-inactive'}"></div>
          <div class="svc-card-info">
            <div class="svc-card-name">${Utils.escape(this.namelabel(entry.name))}</div>
            <div class="svc-card-desc">${Utils.escape(entry.detail || this.sourcelabel(entry.source))}</div>
          </div>
          <span class="autostart-source">${Utils.escape(this.sourcelabel(entry.source))}</span>
          <span class="svc-state-badge ${active ? 'svc-active' : 'svc-inactive'}">${Utils.escape(runtime)}</span>
        </div>
        <div class="autostart-meta">${Utils.escape(entry.type)} - ${Utils.escape(entry.state)}</div>
      </div>`;
    }).join('');
  },

  namelabel(name) {
    return name === 'Cron @reboot' ? t('autostart.name.cronreboot') : name;
  },

  sourcelabel(source) {
    const map = {
      'System service': 'autostart.src.systemd',
      'User service': 'autostart.src.systemduser',
      'User crontab': 'autostart.src.usercron',
      'SysV init': 'autostart.src.sysv',
      'Docker container': 'autostart.src.docker'
    };
    return map[source] ? t(map[source]) : source;
  },

  runtimelabel(entry) {
    const map = {
      boot: 'autostart.runtime.boot',
      scheduled: 'autostart.runtime.scheduled',
      active: 'autostart.runtime.active',
      inactive: 'autostart.runtime.inactive',
      failed: 'autostart.runtime.failed'
    };
    return map[entry.runtime] ? t(map[entry.runtime]) : entry.runtime || entry.state;
  },

  render() {
    const tab = Utils.el('tabAutostart');
    if (!tab) return;
    if (this.loading) {
      tab.innerHTML = `<div class="loading"><div class="spinner"></div><div class="loading-text">${t('common.loading')}</div></div>`;
      return;
    }

    const services = this.entries.filter(entry => entry.type === 'systemd' || entry.type === 'systemd-user' || entry.type === 'sysv').length;
    const scheduled = this.entries.filter(entry => entry.type === 'cron' || entry.type === 'cron-system' || entry.type === 'rc-local').length;
    const containers = this.entries.filter(entry => entry.type === 'docker').length;
    tab.innerHTML = `<div class="svc-container">
      <div class="vps-section-header">
        <h2>${t('autostart.heading')}</h2>
        <button class="btn btn-sm btn-secondary" onclick="Autostart.load()">${t('autostart.refresh')}</button>
      </div>
      <div class="svc-stats">
        <div class="svc-stat"><span class="svc-stat-value">${this.entries.length}</span><span class="svc-stat-label">${t('autostart.stat.total')}</span></div>
        <div class="svc-stat svc-stat-active"><span class="svc-stat-value">${services}</span><span class="svc-stat-label">${t('autostart.stat.services')}</span></div>
        <div class="svc-stat"><span class="svc-stat-value">${scheduled}</span><span class="svc-stat-label">${t('autostart.stat.bootjobs')}</span></div>
        <div class="svc-stat"><span class="svc-stat-value">${containers}</span><span class="svc-stat-label">${t('autostart.stat.containers')}</span></div>
      </div>
      <div class="svc-search-wrap">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" class="svc-search" id="autostartSearch" placeholder="${t('autostart.search')}" value="${Utils.escape(this.filter)}" oninput="Autostart.setfilter(this.value)" />
      </div>
      <div class="svc-list" id="autostartList">${this.entries.length ? this.entrieshtml() : `<div class="fw-empty">${t('autostart.empty.found')}</div>`}</div>
    </div>`;
  },

  setfilter(value) {
    this.filter = value;
    const list = Utils.el('autostartList');
    if (list) list.innerHTML = this.entrieshtml();
  }
};
