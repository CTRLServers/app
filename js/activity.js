const ServerActivity = {
  activities: [],
  page: 1,
  totalPages: 1,
  loading: false,

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

  render() {
    const container = Utils.el('tabActivity');
    if (!container) return;
    if (this.loading) {
      container.innerHTML = '<div class="tab-loading"><svg class="spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15A9 9 0 1 1 5.64 5.64L1 10"/></svg></div>';
      return;
    }
    if (!this.activities.length) {
      container.innerHTML = '<div class="tab-empty">No recent activity recorded.</div>';
      return;
    }
    let html = '<div class="activity-list">';
    for (const item of this.activities) {
      let actorName = 'Unknown';
      if (item.actor) {
        const a = item.actor.attributes || item.actor;
        actorName = a.username || a.email || 'Unknown';
      }
      html += `
        <div class="activity-item">
          <div class="activity-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
          <div class="activity-details">
            <div class="activity-desc">${Utils.escape(item.description)}</div>
            <div class="activity-meta">
              <span class="activity-actor">${Utils.escape(actorName)}</span>
              ${item.ip ? `<span class="activity-dot">&middot;</span><span class="activity-ip">${Utils.escape(item.ip)}</span>` : ''}
              <span class="activity-dot">&middot;</span>
              <span class="activity-time">${this.formatdate(item.timestamp)}</span>
            </div>
          </div>
          <div class="activity-event">${Utils.escape(item.event)}</div>
        </div>`;
    }
    html += '</div>';
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
};
