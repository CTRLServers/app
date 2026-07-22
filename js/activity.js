const ServerActivity = {
  activities: [],
  page: 1,
  totalPages: 1,
  loading: false,
  filter: 'all',
  searchquery: '',
  _exporting: false,

  CATEGORIES: [
    { key: 'all', label: 'All actions', icon: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>', events: [] },
    { key: 'console', label: 'Console', icon: '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>', events: ['server:console.command'] },
    { key: 'file', label: 'Files', icon: '<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>', events: ['server:file.uploaded', 'server:file.read', 'server:file.write', 'server:file.download', 'server:file.delete', 'server:file.create-directory', 'server:file.rename', 'server:file.compress', 'server:file.decompress', 'server:file.copy'] },
    { key: 'power', label: 'Power', icon: '<path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/>', events: ['server:power.start', 'server:power.stop', 'server:power.restart', 'server:power.kill'] },
    { key: 'database', label: 'Databases', icon: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>', events: ['server:database.create', 'server:database.delete', 'server:database.rotate-password'] },
    { key: 'schedule', label: 'Schedules', icon: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>', events: ['server:schedule.create', 'server:schedule.update', 'server:schedule.delete', 'server:schedule.execute'] },
    { key: 'task', label: 'Tasks', icon: '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>', events: ['server:task.create', 'server:task.update', 'server:task.delete'] },
    { key: 'subuser', label: 'SubUsers', icon: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>', events: ['server:subuser.create', 'server:subuser.update', 'server:subuser.delete'] },
    { key: 'user', label: 'Users', icon: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>', events: ['user:user.create'] },
    { key: 'backup', label: 'Backups', icon: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>', events: ['server:backup.start', 'server:backup.complete', 'server:backup.delete', 'server:backup.restore', 'server:backup.restore-complete'] },
    { key: 'allocation', label: 'Allocation', icon: '<rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>', events: ['server:allocation.create', 'server:allocation.delete'] },
    { key: 'startup', label: 'Startup', icon: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>', events: ['server:startup.edit'] },
  ],

  MAINCATS: ['all', 'console', 'file', 'power', 'database', 'schedule'],

  async load(page = 1) {
    const s = App.currentServer;
    if (!s || s.type !== 'Pterodactyl') return;
    this.loading = true;
    this.page = page;
    this.render();
    try {
      const data = await Api.fetchactivity(s.panelUrl, s.apiKey, s.uuid, page);
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
        return `${base} ${properties?.file || properties?.name || ''}`.trim();
      case 'server:file.delete':
        return `Deleted ${properties?.count || ''} files in ${properties?.directory || ''}`.trim();
      case 'server:file.create-directory':
        return `Created directory ${properties?.directory || ''}`.trim();
      case 'server:console.command':
        return `Executed "${properties?.command || ''}" on the server`.trim();
      case 'server:file.rename': {
        const rename = (properties?.files && properties.files[0]) || {};
        return `Renamed ${rename.from || ''} to ${rename.to || ''}`.trim();
      }
      case 'server:file.compress':
        return `Compressed ${properties?.count || ''} files in ${properties?.directory || ''}`.trim();
      case 'server:file.decompress':
        return `Decompressed ${properties?.files || ''} in ${properties?.directory || ''}`.trim();
      case 'server:file.copy':
        return `Created a copy of ${properties?.file || ''}`.trim();
      case 'server:database.create':
        return `Created new database ${properties?.database || properties?.name || ''}`.trim();
      case 'server:database.delete':
      case 'server:database.rotate-password':
        return `${base} ${properties?.database || properties?.name || ''}`.trim();
      case 'server:schedule.create':
      case 'server:schedule.delete':
        return `${base} ${properties?.name || ''}`.trim();
      case 'server:schedule.update':
        return `Updated the ${properties?.name || ''} schedule`.trim();
      case 'server:task.create':
        return `Created a new "${properties?.action || ''}" task for the ${properties?.name || ''} schedule`.trim();
      case 'server:task.delete':
      case 'server:task.update':
        return `${base} ${properties?.name || ''}`.trim();
      case 'server:schedule.execute':
        return `Manually executed the ${properties?.name || ''} schedule`.trim();
      case 'server:subuser.create':
        return `Added ${properties?.email || ''} as a subuser`.trim();
      case 'server:subuser.update':
        return `${base} ${properties?.email || ''}`.trim();
      case 'server:subuser.delete':
        return `Removed ${properties?.email || ''} as a subuser`.trim();
      case 'user:user.create':
        return `Created a new user ${properties?.email || ''}`.trim();
      case 'server:backup.start':
        return `Started a new ${properties?.name || ''} backup`.trim();
      case 'server:backup.complete':
        return `Marked the ${properties?.name || ''} backup as complete`.trim();
      case 'server:backup.delete':
        return `Deleted the ${properties?.name || ''} backup`.trim();
      case 'server:backup.restore':
        return `Restored the ${properties?.name || ''} backup`.trim();
      case 'server:backup.restore-complete':
        return `Completed restoration of the ${properties?.name || ''} backup`.trim();
      case 'server:allocation.create':
        return `Added ${properties?.allocation || ''} to the server`.trim();
      case 'server:allocation.delete':
        return `Deleted the ${properties?.allocation || ''} allocation`.trim();
      case 'server:allocation.notes':
        return `Updated the notes for ${properties?.allocation || ''} from ${properties?.old} to ${properties?.new}`;
      case 'server:startup.edit':
        return `Changed the ${properties?.variable || ''} variable from "${properties?.old || ''}" to "${properties?.new || ''}"`.trim();
      case 'server:power.start':
        return 'Started the server';
      case 'server:power.stop':
        return 'Stopped the server';
      case 'server:power.restart':
        return 'Restarted the server';
      case 'server:power.kill':
        return 'Killed the server process';
      case 'server:startup.image':
        return `Updated the docker image for the server from ${properties?.old} to ${properties?.new}`;
      case 'server:sftp.create':
        return `Created ${properties?.files}`;
      case 'server:sftp.delete':
        return `Deleted ${properties?.files}`;
      case 'server:allocation.primary':
        return `Set ${properties?.allocation} as primary allocation.`;
      case 'server:backup.unlock':
        return `Unlocked ${properties?.name} backup.`;
      case 'server:settings.rename':
        return `Renamed the server from ${properties?.old} to ${properties?.new}`;
      case 'server:settings.description':
        return `Changed the server description from ${properties?.old} to ${properties?.new}`;
      case 'server:backup.lock':
        return `Locked the ${properties?.name} backup.`;
      case 'server:backup.download':
        return `Downloaded the ${properties?.name} backup`;
      default:
        return base;
    }
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
      Modal.open('Exporting Activity', `
        <div style="text-align:center;padding:20px 0;">
          <div class="export-progress-ring">
            <svg width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" fill="none" stroke="var(--border)" stroke-width="4"/><circle id="exportRing" cx="24" cy="24" r="20" fill="none" stroke="var(--accent)" stroke-width="4" stroke-linecap="round" stroke-dasharray="125.6" stroke-dashoffset="125.6" transform="rotate(-90 24 24)"/></svg>
          </div>
          <h3 style="margin:16px 0 4px;color:var(--text-primary);">Your file is being prepared, please wait</h3>
          <p id="exportProgress" style="color:var(--text-muted);font-size:13px;">Status: Starting...</p>
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

    while (page <= total) {
      try {
        const data = await Api.fetchactivity(s.panelUrl, s.apiKey, s.uuid, page);
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
      if (textEl) textEl.textContent = 'Status: ' + page + '/' + total + ' pages loaded';
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
      html += cat.label + '</button>';
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
        html += cat.label + '</div>';
      }
      html += '</div>';
      html += '</div>';
    }

    html += '</div>';

    html += '<div class="activity-actions">';
    html += '<input type="text" class="activity-search" placeholder="Search activity..." value="' + Utils.escape(this.searchquery) + '" oninput="ServerActivity.onsearch(this.value)" />';
    html += '<button class="btn btn-secondary btn-sm" onclick="ServerActivity.exportcsv(\'current\')" title="Export current page">';
    html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
    html += ' Page</button>';
    html += '<button class="btn btn-secondary btn-sm" onclick="ServerActivity.exportcsv(\'all\')" title="Export all pages">';
    html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
    html += ' All</button>';
    html += '</div>';

    html += '</div>';

    const filtered = this.getfiltered();
    if (!filtered.length) {
      html += '<div class="tab-empty">No activity found.</div>';
    } else {
      html += '<div class="activity-list">';
      for (const item of filtered) {
        let actorName = 'Unknown';
        if (item.actor) {
          const a = item.actor.attributes || item.actor;
          actorName = a.username || a.email || 'Unknown';
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
