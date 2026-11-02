const ServerActivity = {
  activities: [],
  page: 1,
  totalPages: 1,
  loading: false,
  filter: 'all',
  searchquery: '',
  _exporting: false,

  CATEGORIES: [
    { key: 'all', label: 'act.cat.all', icon: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>', events: [] },
    { key: 'console', label: 'act.cat.console', icon: '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>', events: ['server:console.command'] },
    { key: 'file', label: 'act.cat.file', icon: '<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>', events: ['server:file.uploaded', 'server:file.read', 'server:file.write', 'server:file.download', 'server:file.delete', 'server:file.create-directory', 'server:file.rename', 'server:file.compress', 'server:file.decompress', 'server:file.copy'] },
    { key: 'power', label: 'act.cat.power', icon: '<path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/>', events: ['server:power.start', 'server:power.stop', 'server:power.restart', 'server:power.kill'] },
    { key: 'database', label: 'act.cat.database', icon: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>', events: ['server:database.create', 'server:database.delete', 'server:database.rotate-password'] },
    { key: 'schedule', label: 'act.cat.schedule', icon: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>', events: ['server:schedule.create', 'server:schedule.update', 'server:schedule.delete', 'server:schedule.execute'] },
    { key: 'task', label: 'act.cat.task', icon: '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>', events: ['server:task.create', 'server:task.update', 'server:task.delete'] },
    { key: 'subuser', label: 'act.cat.subuser', icon: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>', events: ['server:subuser.create', 'server:subuser.update', 'server:subuser.delete'] },
    { key: 'user', label: 'act.cat.user', icon: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>', events: ['user:user.create'] },
    { key: 'backup', label: 'act.cat.backup', icon: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>', events: ['server:backup.start', 'server:backup.complete', 'server:backup.delete', 'server:backup.restore', 'server:backup.restore-complete'] },
    { key: 'allocation', label: 'act.cat.allocation', icon: '<rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>', events: ['server:allocation.create', 'server:allocation.delete'] },
    { key: 'startup', label: 'act.cat.startup', icon: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>', events: ['server:startup.edit'] },
  ],

  MAINCATS: ['all', 'console', 'file', 'power', 'database', 'schedule'],

  async load(page = 1) {
    const s = App.currentServer;
    if (!s || s.type !== 'Pterodactyl') return;
    this.loading = true;
    this.page = page;
    this.render();
    const apiKey = await Servers.resolveapikey(s);
    try {
      const data = await Api.fetchactivity(s.panelUrl, apiKey, s.uuid, page);
      if (data.data) {
        this.activities = data.data.map(item => ({
          id: item.attributes.timestamp,
          event: item.attributes.event,
          ip: item.attributes.ip,
          properties: item.attributes.properties,
          actor: item.attributes.relationships?.actor,
          timestamp: item.attributes.timestamp,
          description: this.format(item.attributes),
        }));
      }
      if (data.meta && data.meta.pagination) {
        this.totalPages = data.meta.pagination.total_pages || 1;
      }
    } catch (e) {
      this.activities = [];
    } finally {
      this.loading = false;
    }
    this.render();
  },

  geteventkeyword(event) {
    const parts = event.split(':');
    if (parts.length < 2) return '';
    return parts[1].split('.')[0];
  },

  geticon(event) {
    const keyword = this.geteventkeyword(event);
    const map = {
      file: { svg: '<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>', color: '#3b82f6' },
      database: { svg: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>', color: '#8b5cf6' },
      schedule: { svg: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>', color: '#f59e0b' },
      task: { svg: '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>', color: '#10b981' },
      subuser: { svg: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>', color: '#06b6d4' },
      backup: { svg: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>', color: '#14b8a6' },
      allocation: { svg: '<rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>', color: '#ec4899' },
      startup: { svg: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>', color: '#64748b' },
      power: { svg: '<path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/>', color: '#ef4444' },
      console: { svg: '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>', color: '#22c55e' },
      user: { svg: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>', color: '#a78bfa' },
    };
    return map[keyword] || { svg: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>', color: '#64748b' };
  },

  format(item) {
    const event = item.event;
    const properties = item.properties;
    const base = event.split('.').pop();
    switch (event) {
      case 'server:file.uploaded':
      case 'server:file.read':
      case 'server:file.write':
      case 'server:file.download':
        return t('act.ev.' + base, { name: properties?.file || properties?.name || '' }).trim();
      case 'server:file.delete':
        return t('act.ev.delfiles', { n: properties?.count || '', dir: properties?.directory || '' }).trim();
      case 'server:file.create-directory':
        return t('act.ev.mkdir', { dir: properties?.directory || '' }).trim();
      case 'server:console.command':
        return t('act.ev.command', { cmd: properties?.command || '' }).trim();
      case 'server:file.rename': {
        const rename = (properties?.files && properties.files[0]) || {};
        return t('act.ev.rename', { from: rename.from || '', to: rename.to || '' }).trim();
      }
      case 'server:file.compress':
        return t('act.ev.compress', { n: properties?.count || '', dir: properties?.directory || '' }).trim();
      case 'server:file.decompress':
        return t('act.ev.decompress', { files: properties?.files || '', dir: properties?.directory || '' }).trim();
      case 'server:file.copy':
        return t('act.ev.copy', { file: properties?.file || '' }).trim();
      case 'server:database.create':
        return t('act.ev.dbcreate', { name: properties?.database || properties?.name || '' }).trim();
      case 'server:database.delete':
      case 'server:database.rotate-password':
        return t('act.ev.' + base, { name: properties?.database || properties?.name || '' }).trim();
      case 'server:schedule.create':
      case 'server:schedule.delete':
        return t('act.ev.' + base, { name: properties?.name || '' }).trim();
      case 'server:schedule.update':
        return t('act.ev.schedupdate', { name: properties?.name || '' }).trim();
      case 'server:task.create':
        return t('act.ev.taskcreate', { action: properties?.action || '', name: properties?.name || '' }).trim();
      case 'server:task.delete':
      case 'server:task.update':
        return t('act.ev.' + base, { name: properties?.name || '' }).trim();
      case 'server:schedule.execute':
        return t('act.ev.schedexec', { name: properties?.name || '' }).trim();
      case 'server:subuser.create':
        return t('act.ev.subcreate', { name: properties?.email || '' }).trim();
      case 'server:subuser.update':
        return t('act.ev.' + base, { name: properties?.email || '' }).trim();
      case 'server:subuser.delete':
        return t('act.ev.subdelete', { name: properties?.email || '' }).trim();
      case 'user:user.create':
        return t('act.ev.usercreate', { name: properties?.email || '' }).trim();
      case 'server:backup.start':
        return t('act.ev.bstart', { name: properties?.name || '' }).trim();
      case 'server:backup.complete':
        return t('act.ev.bcomplete', { name: properties?.name || '' }).trim();
      case 'server:backup.delete':
        return t('act.ev.bdelete', { name: properties?.name || '' }).trim();
      case 'server:backup.restore':
        return t('act.ev.brestore', { name: properties?.name || '' }).trim();
      case 'server:backup.restore-complete':
        return t('act.ev.brestorecomplete', { name: properties?.name || '' }).trim();
      case 'server:allocation.create':
        return t('act.ev.allocadd', { alloc: properties?.allocation || '' }).trim();
      case 'server:allocation.delete':
        return t('act.ev.allocdel', { alloc: properties?.allocation || '' }).trim();
      case 'server:allocation.notes':
        return t('act.ev.allocnotes', { alloc: properties?.allocation || '', old: properties?.old, new: properties?.new });
      case 'server:startup.edit':
        return t('act.ev.stedit', { variable: properties?.variable || '', old: properties?.old || '', new: properties?.new || '' }).trim();
      case 'server:power.start':
        return t('act.ev.pstart');
      case 'server:power.stop':
        return t('act.ev.pstop');
      case 'server:power.restart':
        return t('act.ev.prestart');
      case 'server:power.kill':
        return t('act.ev.pkill');
      case 'server:startup.image':
        return t('act.ev.stimage', { old: properties?.old, new: properties?.new });
      case 'server:sftp.create':
        return t('act.ev.sftpcreate', { files: properties?.files });
      case 'server:sftp.delete':
        return t('act.ev.sftpdelete', { files: properties?.files });
      case 'server:allocation.primary':
        return t('act.ev.allocprimary', { alloc: properties?.allocation });
      case 'server:backup.unlock':
        return t('act.ev.bunlock', { name: properties?.name });
      case 'server:settings.rename':
        return t('act.ev.setrename', { old: properties?.old, new: properties?.new });
      case 'server:settings.description':
        return t('act.ev.setdesc', { old: properties?.old, new: properties?.new });
      case 'server:backup.lock':
        return t('act.ev.block', { name: properties?.name });
      case 'server:backup.download':
        return t('act.ev.bdownload', { name: properties?.name });
      default:
        return base;
    }
  },

  formatdate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 60) return t('time.justnow');
    if (diff < 3600) return t('time.mago', { n: Math.floor(diff / 60) });
    if (diff < 86400) return t('time.hago', { n: Math.floor(diff / 3600) });
    if (diff < 604800) return t('time.dago', { n: Math.floor(diff / 86400) });
    return d.toLocaleDateString();
  },

  formatfulldate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
  },

  getfiltered() {
    let items = this.activities;
    if (this.filter !== 'all') {
      const cat = this.CATEGORIES.find(c => c.key === this.filter);
      if (cat && cat.events.length) {
        items = items.filter(a => cat.events.includes(a.event));
      }
    }
    if (this.searchquery) {
      const q = this.searchquery.toLowerCase();
      items = items.filter(a => (a.description || '').toLowerCase().includes(q) || (a.event || '').toLowerCase().includes(q));
    }
    return items;
  },

  setfilter(key) {
    this.filter = key;
    this.render();
  },

  onsearch(q) {
    this.searchquery = q;
    this.render();
  },

  async exportcsv(scope) {
    const s = App.currentServer;
    if (!s || s.type !== 'Pterodactyl' || this._exporting) return;

    if (scope === 'all') {
      this._exporting = true;
      Modal.open(t('act.export.title'), `
        <div style="text-align:center;padding:20px 0;">
          <div class="export-progress-ring">
            <svg width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" fill="none" stroke="var(--border)" stroke-width="4"/><circle id="exportRing" cx="24" cy="24" r="20" fill="none" stroke="var(--accent)" stroke-width="4" stroke-linecap="round" stroke-dasharray="125.6" stroke-dashoffset="125.6" transform="rotate(-90 24 24)"/></svg>
          </div>
          <h3 style="margin:16px 0 4px;color:var(--text-primary);">${t('act.preparing')}</h3>
          <p id="exportProgress" style="color:var(--text-muted);font-size:13px;">${t('act.starting')}</p>
        </div>
      `);
      const all = await this.fetchallwithprogress();
      if (all.length) this.downloadcsv(all, 'activity-all.csv');
      Modal.close();
      this._exporting = false;
    } else {
      const filename = 'activity-page-' + this.page + '.csv';
      this.downloadcsv(this.activities, filename);
    }
  },

  async fetchallwithprogress() {
    const s = App.currentServer;
    if (!s || s.type !== 'Pterodactyl') return [];
    let all = [];
    let page = 1;
    let total = 1;
    const circumference = 125.6;
    const apiKey = await Servers.resolveapikey(s);

    while (page <= total) {
      try {
        const data = await Api.fetchactivity(s.panelUrl, apiKey, s.uuid, page);
        if (data.data) {
          all = all.concat(data.data.map(item => ({
            id: item.attributes.timestamp,
            event: item.attributes.event,
            ip: item.attributes.ip,
            properties: item.attributes.properties,
            actor: item.attributes.relationships?.actor,
            timestamp: item.attributes.timestamp,
            description: this.format(item.attributes),
          })));
        }
        if (data.meta && data.meta.pagination) {
          total = data.meta.pagination.total_pages || 1;
        }
      } catch (e) {
        break;
      }
      const textEl = Utils.el('exportProgress');
      const ringEl = Utils.el('exportRing');
      if (textEl) textEl.textContent = t('act.progress', { a: page, b: total });
      if (ringEl) {
        const progress = total > 0 ? page / total : 0;
        ringEl.setAttribute('stroke-dashoffset', String(circumference * (1 - progress)));
      }
      page++;
      if (page <= total) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    return all;
  },

  downloadcsv(rows, filename) {
    if (!rows.length) return;
    const header = 'Date,Time,Event,Description,Actor,IP\n';
    const csvrows = rows.map(a => {
      let actorName = '';
      if (a.actor) {
        const attr = a.actor.attributes || a.actor;
        actorName = attr.username || attr.email || '';
      }
      const d = new Date(a.timestamp);
      const date = d.toLocaleDateString();
      const time = d.toLocaleTimeString();
      const esc = (s) => '"' + (s || '').replace(/"/g, '""') + '"';
      return [date, time, esc(a.event), esc(a.description), esc(actorName), esc(a.ip)].join(',');
    }).join('\n');

    const blob = new Blob([header + csvrows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },

  render() {
    const container = Utils.el('tabActivity');
    if (!container) return;
    if (this.loading) {
      container.innerHTML = '<div class="tab-loading"><svg class="spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15A9 9 0 1 1 5.64 5.64L1 10"/></svg></div>';
      return;
    }

    let html = '';

    html += '<div class="activity-toolbar">';

    html += '<div class="activity-cats">';
    const maincats = this.CATEGORIES.filter(c => this.MAINCATS.includes(c.key));
    const overflowcats = this.CATEGORIES.filter(c => !this.MAINCATS.includes(c.key));

    for (const cat of maincats) {
      const active = this.filter === cat.key ? ' active' : '';
      html += '<button class="activity-cat-btn' + active + '" onclick="ServerActivity.setfilter(\'' + cat.key + '\')">';
      html += '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + cat.icon + '</svg>';
      html += t(cat.label) + '</button>';
    }

    if (overflowcats.length) {
      const anyoverflow = overflowcats.some(c => c.key === this.filter);
      html += '<div class="activity-dropdown-wrap">';
      html += '<button class="activity-cat-btn activity-cat-more' + (anyoverflow ? ' active' : '') + '" onclick="ServerActivity.toggledropdown(event)">';
      html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>';
      html += '</button>';
      html += '<div class="activity-dropdown" id="activityDropdown">';
      for (const cat of overflowcats) {
        const active = this.filter === cat.key ? ' active' : '';
        html += '<div class="activity-dropdown-item' + active + '" onclick="ServerActivity.setfilter(\'' + cat.key + '\')">';
        html += '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + cat.icon + '</svg>';
        html += t(cat.label) + '</div>';
      }
      html += '</div>';
      html += '</div>';
    }

    html += '</div>';

    html += '<div class="activity-actions">';
    html += `<input type="text" class="activity-search" placeholder="${t('act.search')}" value="${Utils.escape(this.searchquery)}" oninput="ServerActivity.onsearch(this.value)" />`;
    html += `<button class="btn btn-secondary btn-sm" onclick="ServerActivity.exportcsv('current')" title="${t('act.export.current')}">`;
    html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
    html += ` ${t('act.page')}</button>`;
    html += `<button class="btn btn-secondary btn-sm" onclick="ServerActivity.exportcsv('all')" title="${t('act.export.all')}">`;
    html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
    html += ` ${t('act.all')}</button>`;
    html += '</div>';

    html += '</div>';

    const filtered = this.getfiltered();
    if (!filtered.length) {
      html += `<div class="tab-empty">${t('act.empty')}</div>`;
    } else {
      html += '<div class="activity-list">';
      for (const item of filtered) {
        let actorName = t('users.unknown');
        if (item.actor) {
          const a = item.actor.attributes || item.actor;
          actorName = a.username || a.email || t('users.unknown');
        }
        const icon = this.geticon(item.event);
        const timeStr = this.formatdate(item.timestamp);
        html += `
          <div class="activity-item">
            <div class="activity-time">${timeStr}</div>
            <div class="activity-icon" style="background:${icon.color}15;color:${icon.color}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon.svg}</svg>
            </div>
            <div class="activity-details">
              <div class="activity-desc">${Utils.escape(item.description)}</div>
              <div class="activity-meta">
                <span class="activity-actor">${Utils.escape(actorName)}</span>
                ${item.ip ? `<span class="activity-dot">&middot;</span><span class="activity-ip">${Utils.escape(item.ip)}</span>` : ''}
              </div>
            </div>
            <div class="activity-event">${Utils.escape(item.event)}</div>
          </div>`;
      }
      html += '</div>';
    }

    if (this.totalPages > 1) {
      html += `
        <div class="pagination">
          <button class="btn btn-secondary btn-sm" ${this.page <= 1 ? 'disabled' : ''} onclick="ServerActivity.load(${this.page - 1})">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
            Prev
          </button>
          <span class="pagination-info">Page ${this.page} of ${this.totalPages}</span>
          <button class="btn btn-secondary btn-sm" ${this.page >= this.totalPages ? 'disabled' : ''} onclick="ServerActivity.load(${this.page + 1})">
            Next
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>`;
    }
    container.innerHTML = html;
  },

  toggledropdown(e) {
    e.stopPropagation();
    const dd = Utils.el('activityDropdown');
    if (dd) dd.classList.toggle('open');
  },
};

document.addEventListener('click', () => {
  const dd = Utils.el('activityDropdown');
  if (dd) dd.classList.remove('open');
});
