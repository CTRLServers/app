const adminservers = {
  servers: [],
  server: null,
  openingurl: '',
  targetid: null,
  detailtab: 'about',
  ownerid: null,
  ownersearchtimer: null,
  buildadditions: [],
  buildremovals: [],
  startupnestid: null,
  startupeggid: null,

  async load() {
    const container = Utils.el('tabpanelservers');
    if (!container) return;
    if (this.targetid !== null) {
      const id = this.targetid;
      this.targetid = null;
      await this.openserver(id);
      return;
    }
    container.innerHTML = '<div class="paneladmin-loading"><div class="spinner"></div><span>Loading servers...</span></div>';
    try {
      const { server, apikey } = await adminpanel.credentials();
      const data = await Api.adminrequest(server.panelUrl, apikey, '/admin/ctrlservers/servers');
      if (App.currentServer !== server) return;
      this.servers = data.servers || [];
      this.server = null;
      this.renderlist();
    } catch (error) {
      container.innerHTML = `<div class="paneladmin-error-state"><strong>Unable to load servers</strong><span>${this.safe(error.message)}</span><button type="button" class="btn btn-secondary btn-sm" onclick="adminservers.load()">Retry</button></div>`;
    }
  },

  renderlist() {
    const container = Utils.el('tabpanelservers');
    if (!container) return;
    container.innerHTML = `
      <div class="paneladmin-page adminservers-page">
        <div class="paneladmin-heading"><div><h2>Servers</h2><span class="paneladmin-url">${this.servers.length} server${this.servers.length === 1 ? '' : 's'}</span></div></div>
        <section class="adminservers-card">
          <div class="adminservers-card-heading"><h3>Server List</h3></div>
          ${this.servers.length ? `<div class="adminservers-table-wrap"><table class="adminservers-table"><thead><tr><th>Server Name</th><th>UUID</th><th>Owner</th><th>Node</th><th>Connection</th><th>Status</th><th></th></tr></thead><tbody>${this.servers.map(server => this.renderrow(server)).join('')}</tbody></table></div>` : '<div class="adminservers-empty">No servers found.</div>'}
        </section>
      </div>`;
  },

  renderrow(server) {
    const owner = server.owner ? [server.owner.first_name, server.owner.last_name].filter(Boolean).join(' ') || server.owner.username : '-';
    const allocation = server.allocation || {};
    const connection = allocation.ip ? `${allocation.alias || allocation.ip}:${Number(allocation.port)}` : '-';
    const status = this.status(server);
    return `<tr><td><button type="button" class="adminservers-link adminservers-name" onclick="adminservers.openserver(${Number(server.id)})">${this.safe(server.name)}</button></td><td><code>${this.safe(server.uuid)}</code></td><td>${server.owner ? `<button type="button" class="adminservers-link" onclick="adminservers.openowner(${Number(server.owner.id)})">${this.safe(owner)}</button>` : '-'}</td><td>${server.node ? `<button type="button" class="adminservers-link" onclick="adminservers.opennode(${Number(server.node.id)})">${this.safe(server.node.name)}</button>` : '-'}</td><td>${this.safe(connection)}</td><td><span class="adminservers-status ${this.safe(status.classname)}">${this.safe(status.label)}</span></td><td><button type="button" class="adminservers-open" onclick="adminservers.confirmopen(${Number(server.id)})" title="Open in Pterodactyl"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3h7v7M10 14L21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg></button></td></tr>`;
  },

  async openserver(id) {
    const container = Utils.el('tabpanelservers');
    if (!container) return;
    container.innerHTML = '<div class="paneladmin-loading"><div class="spinner"></div><span>Loading server...</span></div>';
    try {
      const { server, apikey } = await adminpanel.credentials();
      const data = await Api.adminrequest(server.panelUrl, apikey, '/admin/ctrlservers/servers/' + Number(id));
      if (App.currentServer !== server) return;
      this.server = data.server;
      this.detailtab = 'about';
      this.ownerid = Number(this.server.owner?.id || 0) || null;
      this.buildadditions = [];
      this.buildremovals = [];
      this.startupnestid = null;
      this.startupeggid = null;
      this.renderdetail();
    } catch (error) {
      container.innerHTML = `<div class="paneladmin-error-state"><strong>Unable to load server</strong><span>${this.safe(error.message)}</span><button type="button" class="btn btn-secondary btn-sm" onclick="adminservers.openserver(${Number(id)})">Retry</button></div>`;
    }
  },

  openfromlink(id) {
    this.targetid = Number(id);
    App.switchserverpage('panelservers');
  },

  renderdetail() {
    const container = Utils.el('tabpanelservers');
    if (!container || !this.server) return;
    container.innerHTML = `
      <div class="paneladmin-page adminservers-page">
        <div class="adminservers-detail-heading">
          <button type="button" class="adminnodes-back" onclick="adminservers.load()" title="Back to servers"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg></button>
          <div><h2>${this.safe(this.server.name)}</h2><span>${this.safe(this.server.uuid)}</span></div>
          <button type="button" class="btn btn-secondary" onclick="adminservers.confirmopen(${Number(this.server.id)})"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3h7v7M10 14L21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>Open server</button>
        </div>
        <div class="adminservers-tabs"><button type="button" class="${this.detailtab === 'about' ? 'active' : ''}" onclick="adminservers.switchtab('about')">About</button><button type="button" class="${this.detailtab === 'details' ? 'active' : ''}" onclick="adminservers.switchtab('details')">Details</button><button type="button" class="${this.detailtab === 'build' ? 'active' : ''}" onclick="adminservers.switchtab('build')">Build Configuration</button><button type="button" class="${this.detailtab === 'startup' ? 'active' : ''}" onclick="adminservers.switchtab('startup')">Startup</button><button type="button" class="${this.detailtab === 'databases' ? 'active' : ''}" onclick="adminservers.switchtab('databases')">Database</button><button type="button" class="${this.detailtab === 'mounts' ? 'active' : ''}" onclick="adminservers.switchtab('mounts')">Mount</button><button type="button" class="${this.detailtab === 'manage' ? 'active' : ''}" onclick="adminservers.switchtab('manage')">Manage</button><button type="button" class="danger" disabled>Delete</button></div>
        ${this.detailtab === 'details' ? this.renderdetails() : this.detailtab === 'build' ? this.renderbuild() : this.detailtab === 'startup' ? this.renderstartup() : this.detailtab === 'databases' ? this.renderdatabases() : this.detailtab === 'mounts' ? this.rendermounts() : this.detailtab === 'manage' ? this.rendermanage() : this.renderabout()}
      </div>`;
  },

  switchtab(tab) {
    this.detailtab = tab;
    this.renderdetail();
  },

  renderdetails() {
    const server = this.server;
    const owner = server.owner ? this.ownerlabel(server.owner) : '';
    return `<section class="adminservers-card adminservers-details-card"><div class="adminservers-card-heading"><h3>Base Information</h3></div><div id="adminservers-details-error"></div><div class="adminservers-details-form"><label><span>Server Name</span><input type="text" id="adminserver-name" value="${this.safeattr(server.name)}" /></label><label><span>External Identifier</span><input type="text" id="adminserver-external-id" value="${this.safeattr(server.external_id)}" placeholder="Not set" /></label><label class="adminservers-owner-field"><span>Server Owner</span><input type="search" id="adminserver-owner" value="${this.safeattr(owner)}" placeholder="Type at least 2 letters" autocomplete="off" oninput="adminservers.searchowners(this.value)" /><div id="adminserver-owner-results" class="adminservers-owner-results"></div></label><label class="adminservers-description-field"><span>Server Description</span><textarea id="adminserver-description" rows="5">${this.safe(server.description || '')}</textarea></label></div><div class="adminservers-details-actions"><button type="button" class="btn btn-primary" id="adminservers-details-save" onclick="adminservers.savedetails()">Save changes</button></div></section>`;
  },

  renderbuild() {
    const limits = this.server.limits || {};
    const assigned = this.server.assigned_allocations || [];
    const gameport = Number(this.server.allocation?.id || 0);
    return `<div id="adminservers-build-error"></div><section class="adminservers-card adminservers-build-card"><div class="adminservers-card-heading"><h3>Resource Management</h3></div><div class="adminservers-build-fields">${this.buildfield('CPU Limit', 'adminserver-build-cpu', limits.cpu, '%', 'Each virtual core (thread) on the system is considered to be 100%. Setting this value to 0 will allow a server to use CPU time without restrictions.', 'number', '0')}${this.buildfield('CPU Pinning', 'adminserver-build-threads', limits.threads || '', '', 'Advanced: Enter the specific CPU cores that this process can run on, or leave blank to allow all cores. This can be a single number, or a comma seperated list. Example: 0, 0-1,3, or 0,1,3,4.')}${this.buildfield('Allocated Memory', 'adminserver-build-memory', limits.memory, 'MiB', 'The maximum amount of memory allowed for this container. Setting this to 0 will allow unlimited memory in a container.', 'number', '0')}${this.buildfield('Allocated Swap', 'adminserver-build-swap', limits.swap, 'MiB', 'Setting this to 0 will disable swap space on this server. Setting to -1 will allow unlimited swap.', 'number', '-1')}${this.buildfield('Disk Space Limit', 'adminserver-build-disk', limits.disk, 'MiB', 'This server will not be allowed to boot if it is using more than this amount of space. If a server goes over this limit while running it will be safely stopped and locked until enough space is available. Set to 0 to allow unlimited disk usage.', 'number', '0')}${this.buildfield('Block IO Proportion', 'adminserver-build-io', limits.io, '', 'Advanced: The IO performance of this server relative to other running containers on the system. Value should be between 10 and 1000.', 'number', '10', '1000')}<div class="adminservers-build-field adminservers-build-wide"><span>OOM Killer</span><label class="paneladmin-toggle"><input type="checkbox" id="adminserver-build-oom" ${limits.oom_disabled ? '' : 'checked'} onchange="adminservers.togglebuildlabel()" /><span></span><em>${limits.oom_disabled ? 'Disabled' : 'Enabled'}</em></label><small>Enabling OOM killer may cause server processes to exit unexpectedly.</small></div></div></section><section class="adminservers-card adminservers-build-card"><div class="adminservers-card-heading"><h3>Application Feature Limits</h3></div><div class="adminservers-build-fields adminservers-feature-fields">${this.buildfield('Database Limit', 'adminserver-build-databases', limits.database_limit || 0, '', 'The total number of databases a user is allowed to create for this server.', 'number', '0')}${this.buildfield('Allocation Limit', 'adminserver-build-allocations', limits.allocation_limit || 0, '', 'The total number of allocations a user is allowed to create for this server.', 'number', '0')}${this.buildfield('Backup Limit', 'adminserver-build-backups', limits.backup_limit || 0, '', 'The total number of backups that can be created for this server.', 'number', '0')}</div></section><section class="adminservers-card adminservers-build-card"><div class="adminservers-card-heading"><h3>Allocation Management</h3></div><div class="adminservers-allocation-fields"><label class="adminservers-build-field"><span>Game Port</span><select id="adminserver-build-gameport" onchange="adminservers.refreshremovals()">${assigned.map(allocation => `<option value="${Number(allocation.id)}" ${Number(allocation.id) === gameport ? 'selected' : ''}>${this.safe(this.allocationlabel(allocation))}</option>`).join('')}</select><small>The default connection address that will be used for this game server.</small></label>${this.renderallocationsearch('add')}${this.renderallocationsearch('remove')}</div></section><div class="adminservers-build-actions"><button type="button" class="btn btn-primary" id="adminservers-build-save" onclick="adminservers.savebuild()">Save changes</button></div>`;
  },

  buildfield(label, id, value, unit, note, type = 'text', min = '', max = '') {
    return `<label class="adminservers-build-field"><span>${this.safe(label)}</span><div class="adminservers-unit-input"><input type="${type}" id="${id}" value="${this.safeattr(value)}" ${min !== '' ? `min="${min}"` : ''} ${max !== '' ? `max="${max}"` : ''} />${unit ? `<em>${this.safe(unit)}</em>` : ''}</div><small>${this.safe(note)}</small></label>`;
  },

  renderallocationsearch(type) {
    const add = type === 'add';
    const selected = add ? this.buildadditions : this.buildremovals;
    const source = add ? this.server.available_allocations || [] : this.removableallocations();
    const title = add ? 'Assign Additional Ports' : 'Remove Additional Ports';
    const note = add ? 'Please note that due to software limitations you cannot assign identical ports on different IPs to the same server.' : 'Simply select which ports you would like to remove from the list above. If you want to assign a port on a different IP that is already in use you can select it from the left and delete it here.';
    return `<div class="adminservers-build-field adminservers-allocation-search"><span>${title}</span><div class="adminservers-allocation-selected" id="adminserver-build-${type}-selected">${selected.map(id => { const allocation = source.find(entry => Number(entry.id) === Number(id)); return allocation ? `<button type="button" onclick="adminservers.removeallocation('${type}', ${Number(id)})">${this.safe(this.allocationlabel(allocation))}<b>&times;</b></button>` : ''; }).join('')}</div><input type="search" id="adminserver-build-${type}-search" placeholder="Type an IP address or port" autocomplete="off" oninput="adminservers.filterallocations('${type}', this.value)" onfocus="adminservers.filterallocations('${type}', this.value)" onblur="adminservers.hideallocationresults('${type}')" /><div class="adminservers-allocation-results" id="adminserver-build-${type}-results" onmousedown="event.preventDefault()"></div><small>${note}</small></div>`;
  },

  renderstartup() {
    const startup = this.server.startup || {};
    const nests = this.server.startup_nests || [];
    const nestid = Number(this.startupnestid || startup.nest_id || 0);
    const nest = nests.find(entry => Number(entry.id) === nestid) || nests[0];
    const eggid = Number(this.startupeggid || startup.egg_id || 0);
    const egg = nest?.eggs?.find(entry => Number(entry.id) === eggid) || nest?.eggs?.[0];
    const currentegg = Number(egg?.id || 0) === Number(startup.egg_id || 0);
    const command = currentegg ? startup.command : egg?.startup || '';
    const images = this.startupimages(egg);
    const image = currentegg ? startup.image : images[0]?.value || '';
    const variables = egg?.variables || [];
    return `<div id="adminservers-startup-error"></div><section class="adminservers-card adminservers-startup-card"><div class="adminservers-card-heading"><h3>Startup Command Modification</h3></div><div class="adminservers-startup-section"><label class="adminservers-startup-field"><span>Startup Command</span><textarea id="adminserver-startup-command" rows="4">${this.safe(command)}</textarea><small>Edit your server's startup command here. The following variables are available by default: {{SERVER_MEMORY}}, {{SERVER_IP}}, and {{SERVER_PORT}}.</small></label><div class="adminservers-default-command"><span>Default Service Start Command</span><code>${this.safe(egg?.startup || 'Not set')}</code></div></div></section><section class="adminservers-card adminservers-startup-card"><div class="adminservers-card-heading"><h3>Service Configuration</h3></div><div class="adminservers-startup-warning"><p>Changing any of the below values will result in the server processing a re-install command. The server will be stopped and will then proceed. If you would like the service scripts to not run, ensure the box is checked at the bottom.</p><strong>This is a destructive operation in many cases. This server will be stopped immediately in order for this action to proceed.</strong></div><div class="adminservers-startup-grid"><label class="adminservers-startup-field"><span>Nest</span><select id="adminserver-startup-nest" onchange="adminservers.selectstartupnest(this.value)">${nests.map(entry => `<option value="${Number(entry.id)}" ${Number(entry.id) === Number(nest?.id) ? 'selected' : ''}>${this.safe(entry.name)}</option>`).join('')}</select><small>Select the Nest that this server will be grouped into.</small></label><label class="adminservers-startup-field"><span>Egg</span><select id="adminserver-startup-egg" onchange="adminservers.selectstartupegg(this.value)">${(nest?.eggs || []).map(entry => `<option value="${Number(entry.id)}" ${Number(entry.id) === Number(egg?.id) ? 'selected' : ''}>${this.safe(entry.name)}</option>`).join('')}</select><small>Select the Egg that will provide processing data for this server.</small></label><div class="adminservers-startup-field adminservers-startup-wide"><span>Skip Egg Install Script</span><label class="paneladmin-toggle"><input type="checkbox" id="adminserver-startup-skip" ${startup.skip_scripts ? 'checked' : ''} onchange="adminservers.togglestartuplabel()" /><span></span><em>${startup.skip_scripts ? 'Enabled' : 'Disabled'}</em></label><small>If the selected Egg has an install script attached to it, the script will run during install. If you would like to skip this step, check this box.</small></div></div></section><section class="adminservers-card adminservers-startup-card"><div class="adminservers-card-heading"><h3>Docker Image Configuration</h3></div><div class="adminservers-startup-section"><label class="adminservers-startup-field"><span>Image</span><input type="text" id="adminserver-startup-image" value="${this.safeattr(image)}" /><select id="adminserver-startup-image-option" onchange="adminservers.selectstartupimage(this.value)"><option value="">Select an image</option>${images.map(entry => `<option value="${this.safeattr(entry.value)}" ${entry.value === image ? 'selected' : ''}>${this.safe(entry.label)}</option>`).join('')}</select><small>This is the Docker image that will be used to run this server. Select an image from the dropdown or enter a custom image in the text field above.</small></label></div></section><section class="adminservers-card adminservers-startup-card"><div class="adminservers-card-heading"><h3>Startup Variables</h3></div><div class="adminservers-startup-variables">${variables.length ? variables.map(variable => this.renderstartupvariable(variable, currentegg)).join('') : '<div class="adminservers-empty">This Egg has no startup variables.</div>'}</div></section><div class="adminservers-build-actions"><button type="button" class="btn btn-primary" id="adminservers-startup-save" onclick="adminservers.savestartup()">Save changes</button></div>`;
  },

  startupimages(egg) {
    const images = egg?.docker_images || {};
    if (Array.isArray(images)) return images.map(value => ({ label: value, value }));
    return Object.entries(images).map(([label, value]) => ({ label, value }));
  },

  renderstartupvariable(variable, currentegg) {
    const value = currentegg && variable.server_value !== null && variable.server_value !== undefined ? variable.server_value : variable.default_value;
    return `<label class="adminservers-startup-variable"><span>${this.safe(variable.name)}</span><input type="text" data-startup-variable="${this.safeattr(variable.env_variable)}" value="${this.safeattr(value)}" /><small>${this.safe(variable.description || '')}</small><dl><div><dt>Startup Command Variable</dt><dd>${this.safe(variable.env_variable)}</dd></div><div><dt>Input Rules</dt><dd>${this.safe(variable.rules)}</dd></div></dl></label>`;
  },

  renderdatabases() {
    const databases = this.server.databases || [];
    const hosts = this.server.database_hosts || [];
    const prefix = `s${Number(this.server.id)}_`;
    return `<div id="adminservers-database-error"></div><div class="adminservers-database-note">Database passwords can be viewed when visiting this server on the front-end.</div><section class="adminservers-card adminservers-database-card"><div class="adminservers-card-heading"><h3>Active Databases</h3></div>${databases.length ? `<div class="adminservers-table-wrap"><table class="adminservers-table adminservers-database-table"><thead><tr><th>Database</th><th>Username</th><th>Connections From</th><th>Host</th><th>Max Connections</th><th></th></tr></thead><tbody>${databases.map(database => `<tr><td><code>${this.safe(database.database)}</code></td><td><code>${this.safe(database.username)}</code></td><td>${this.safe(database.remote)}</td><td>${this.safe(database.host ? `${database.host.host}:${Number(database.host.port)}` : 'Not available')}</td><td>${Number(database.max_connections || 0) === 0 ? 'Unlimited' : Number(database.max_connections).toLocaleString()}</td><td><button type="button" class="adminservers-database-delete" onclick="adminservers.confirmdeletedatabase(${Number(database.id)})" title="Delete database"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6m3 0V4h8v2"/></svg></button></td></tr>`).join('')}</tbody></table></div>` : '<div class="adminservers-empty">No databases have been created for this server.</div>'}</section><section class="adminservers-card adminservers-database-card"><div class="adminservers-card-heading"><h3>Create New Database</h3></div><div class="adminservers-database-form"><label class="adminservers-startup-field"><span>Database Host</span><select id="adminserver-database-host"><option value="">Select a database host</option>${hosts.map(host => `<option value="${Number(host.id)}">${this.safe(host.name)} (${this.safe(host.host)}:${Number(host.port)})</option>`).join('')}</select><small>Select the host database server that this database should be created on.</small></label><label class="adminservers-startup-field"><span>Database</span><div class="adminservers-database-name"><em>${this.safe(prefix)}</em><input type="text" id="adminserver-database-name" autocomplete="off" /></div></label><label class="adminservers-startup-field"><span>Connections</span><input type="text" id="adminserver-database-remote" value="%" autocomplete="off" /><small>This should reflect the IP address that connections are allowed from. Uses standard MySQL notation. If unsure leave as %.</small></label><label class="adminservers-startup-field"><span>Concurrent Connections</span><input type="number" id="adminserver-database-connections" min="0" placeholder="Unlimited" /><small>This should reflect the max number of concurrent connections from this user to the database. Leave empty for unlimited.</small></label></div><div class="adminservers-database-footer"><span>A username and password for this database will be randomly generated after form submission.</span><button type="button" class="btn btn-primary" id="adminservers-database-create" onclick="adminservers.createdatabase()" ${hosts.length ? '' : 'disabled'}>Create database</button></div></section>`;
  },

  rendermounts() {
    const mounts = this.server.mounts || [];
    return `<div id="adminservers-mount-error"></div><section class="adminservers-card adminservers-mount-card"><div class="adminservers-card-heading"><h3>Mounts</h3></div>${mounts.length ? `<div class="adminservers-table-wrap"><table class="adminservers-table adminservers-mount-table"><thead><tr><th>ID</th><th>Name</th><th>Source</th><th>Target</th><th>Status</th><th></th></tr></thead><tbody>${mounts.map(mount => `<tr><td>${Number(mount.id)}</td><td><button type="button" class="adminservers-link adminservers-name" onclick="adminmounts.openfromserver(${Number(mount.id)})">${this.safe(mount.name)}</button></td><td><code>${this.safe(mount.source)}</code></td><td><code>${this.safe(mount.target)}</code></td><td><span class="adminservers-mount-status ${mount.mounted ? 'mounted' : ''}">${mount.mounted ? 'Mounted' : 'Unmounted'}</span></td><td><button type="button" class="btn ${mount.mounted ? 'btn-secondary' : 'btn-primary'} btn-sm" id="adminserver-mount-${Number(mount.id)}" onclick="adminservers.togglemount(${Number(mount.id)})">${mount.mounted ? 'Unmount' : 'Mount'}</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="adminservers-empty">No mounts are available for this server Egg and Node.</div>'}</section>`;
  },

  rendermanage() {
    const suspended = Boolean(this.server.suspended);
    const installed = Boolean(this.server.installed);
    const nodes = this.server.transfer_nodes || [];
    return `<div class="adminservers-manage-grid"><section class="adminservers-manage-card danger"><div><h3>Reinstall Server</h3><p>This will reinstall the server with the assigned service scripts. <strong>Danger! This could overwrite server data.</strong></p></div><button type="button" class="btn btn-danger" onclick="adminservers.confirmaction('reinstall')">Reinstall server</button></section><section class="adminservers-manage-card"><div><h3>Install Status</h3><p>If you need to change the install status from uninstalled to installed, or vice versa, you may do so with the button below.</p></div><button type="button" class="btn btn-secondary" onclick="adminservers.confirmaction('install')">Mark as ${installed ? 'uninstalled' : 'installed'}</button></section><section class="adminservers-manage-card ${suspended ? '' : 'danger'}"><div><h3>${suspended ? 'Unsuspend Server' : 'Suspend Server'}</h3><p>${suspended ? 'This will restore the user\'s access to this server and allow its processes to run again.' : 'This will suspend the server, stop any running processes, and immediately block the user from being able to access their files or otherwise manage the server through the panel or API.'}</p></div><button type="button" class="btn ${suspended ? 'btn-primary' : 'btn-danger'}" onclick="adminservers.confirmaction('suspension')">${suspended ? 'Unsuspend server' : 'Suspend server'}</button></section><section class="adminservers-manage-card"><div><h3>Transfer Server</h3><p>Transfer this server to another node connected to this panel. <strong>Warning! This feature has not been fully tested and may have bugs.</strong></p><p>Transferring a server requires more than one node to be configured on your panel.</p></div><button type="button" class="btn btn-secondary" onclick="adminservers.opentransfer()" ${nodes.length ? '' : 'disabled'}>Transfer server</button></section></div>`;
  },

  renderabout() {
    const server = this.server;
    const limits = server.limits || {};
    const allocation = server.allocation || {};
    const owner = server.owner ? [server.owner.first_name, server.owner.last_name].filter(Boolean).join(' ') || server.owner.username : 'Not Set';
    const egg = server.egg ? [server.egg.nest, server.egg.name].filter(Boolean).join(' :: ') : 'Not Set';
    const connection = allocation.ip ? `${allocation.ip}:${Number(allocation.port)}` : 'Not Set';
    return `<div class="adminservers-about-layout"><section class="adminservers-information"><h3>Server Information</h3><dl>${this.informationrow('Internal Identifier', server.id)}${this.informationrow('External Identifier', server.external_id || 'Not Set')}${this.informationrow('UUID / Docker Container ID', server.uuid)}${this.informationrow('Current Egg', egg)}${this.informationrow('Server Name', server.name)}${this.informationrow('CPU Limit', Number(limits.cpu || 0) === 0 ? 'Unlimited' : Number(limits.cpu) + '%')}${this.informationrow('CPU Pinning', limits.threads || 'Not Set')}${this.informationrow('Memory', `${this.capacity(limits.memory)} / ${Number(limits.swap || 0) === 0 ? 'Not Set' : this.capacity(limits.swap)}`)}${this.informationrow('Disk Space', this.capacity(limits.disk))}${this.informationrow('Block IO Weight', limits.io || 0)}${this.informationrow('Default Connection', connection)}${this.informationrow('Connection Alias', allocation.alias || 'No Alias Assigned')}</dl></section><aside class="adminservers-relations"><div><strong>${this.safe(owner)}</strong><span>Server Owner</span>${server.owner ? `<button type="button" onclick="adminservers.openowner(${Number(server.owner.id)})">More info</button>` : ''}</div><div><strong>${this.safe(server.node?.name || 'Not Set')}</strong><span>Server Node</span>${server.node ? `<button type="button" onclick="adminservers.opennode(${Number(server.node.id)})">More info</button>` : ''}</div></aside></div>`;
  },

  informationrow(label, value) {
    return `<div><dt>${this.safe(label)}</dt><dd>${this.safe(value)}</dd></div>`;
  },

  status(server) {
    if (server.suspended) return { label: 'Suspended', classname: 'suspended' };
    const value = String(server.status || '').trim().toLowerCase();
    if (value) return { label: value.charAt(0).toUpperCase() + value.slice(1), classname: value.replace(/[^a-z0-9]+/g, '-') };
    return { label: 'Active', classname: 'active' };
  },

  serverurl(server) {
    const base = String(App.currentServer?.panelUrl || '').replace(/\/+$/, '');
    const identifier = String(server?.identifier || server?.uuid || '').slice(0, 8);
    return `${base}/server/${identifier}`;
  },

  confirmopen(id) {
    const server = this.server && Number(this.server.id) === Number(id) ? this.server : this.servers.find(entry => Number(entry.id) === Number(id));
    if (!server) return;
    this.openingurl = this.serverurl(server);
    Modal.open('Warning! This button will open your browser', `<p class="adminservers-browser-warning">You are trying to open Pterodactyl server: <strong>${this.safe(this.openingurl)}</strong>, you can't open it in CTRLServers so a browser will be used instead. Press confirm to go.</p><div class="modal-actions"><button type="button" class="btn btn-secondary" onclick="Modal.close()">Cancel</button><button type="button" class="btn btn-primary" onclick="adminservers.openexternal()">Confirm</button></div>`);
  },

  openexternal() {
    const url = this.openingurl;
    Modal.close();
    if (url) window.electronAPI.openexternal(url);
  },

  searchowners(value) {
    this.ownerid = null;
    const results = Utils.el('adminserver-owner-results');
    clearTimeout(this.ownersearchtimer);
    if (!results) return;
    if (value.trim().length < 2) {
      results.innerHTML = '';
      results.classList.remove('visible');
      return;
    }
    results.innerHTML = '<span class="adminservers-owner-loading">Searching...</span>';
    results.classList.add('visible');
    this.ownersearchtimer = setTimeout(() => this.loadowners(value.trim()), 300);
  },

  async loadowners(search) {
    const results = Utils.el('adminserver-owner-results');
    if (!results) return;
    try {
      const { server, apikey } = await adminpanel.credentials();
      const data = await Api.adminrequest(server.panelUrl, apikey, '/admin/ctrlservers/server-users?search=' + encodeURIComponent(search));
      if (!Utils.el('adminserver-owner-results')) return;
      const users = data.users || [];
      results.innerHTML = users.length ? users.map(user => `<button type="button" onclick="adminservers.selectowner(${Number(user.id)})"><strong>${this.safe(this.ownerlabel(user))}</strong><span>${this.safe(user.email)}</span></button>`).join('') : '<span class="adminservers-owner-loading">No users found.</span>';
      this.ownerresults = users;
    } catch (error) {
      results.innerHTML = `<span class="adminservers-owner-loading">${this.safe(error.message)}</span>`;
    }
  },

  selectowner(id) {
    const user = (this.ownerresults || []).find(entry => Number(entry.id) === Number(id));
    if (!user) return;
    this.ownerid = Number(user.id);
    const input = Utils.el('adminserver-owner');
    const results = Utils.el('adminserver-owner-results');
    if (input) input.value = this.ownerlabel(user);
    if (results) {
      results.innerHTML = '';
      results.classList.remove('visible');
    }
  },

  ownerlabel(user) {
    const name = [user.first_name, user.last_name].filter(Boolean).join(' ');
    return name ? `${name} (${user.username})` : user.username;
  },

  async savedetails() {
    const errorbox = Utils.el('adminservers-details-error');
    const button = Utils.el('adminservers-details-save');
    const payload = {
      name: Utils.el('adminserver-name')?.value.trim() || '',
      external_id: Utils.el('adminserver-external-id')?.value.trim() || null,
      owner_id: this.ownerid,
      description: Utils.el('adminserver-description')?.value.trim() || ''
    };
    if (!payload.name || !payload.owner_id) {
      if (errorbox) errorbox.innerHTML = '<div class="paneladmin-notice error">Enter a server name and select an owner from the search results.</div>';
      return;
    }
    if (button) {
      button.disabled = true;
      button.textContent = 'Saving...';
    }
    try {
      const data = await this.serverrequest('/details', 'PATCH', payload);
      this.server = data.server;
      this.ownerid = Number(this.server.owner?.id || 0) || null;
      this.renderdetail();
    } catch (error) {
      if (errorbox) errorbox.innerHTML = `<div class="paneladmin-notice error">${this.safe(error.message)}</div>`;
      if (button) {
        button.disabled = false;
        button.textContent = 'Save changes';
      }
    }
  },

  togglebuildlabel() {
    const input = Utils.el('adminserver-build-oom');
    const label = input?.closest('.paneladmin-toggle')?.querySelector('em');
    if (label) label.textContent = input.checked ? 'Enabled' : 'Disabled';
  },

  allocationlabel(allocation) {
    return `${allocation.alias || allocation.ip}:${Number(allocation.port)}`;
  },

  removableallocations() {
    const gameport = Number(Utils.el('adminserver-build-gameport')?.value || this.server.allocation?.id || 0);
    return (this.server.assigned_allocations || []).filter(allocation => Number(allocation.id) !== gameport);
  },

  filterallocations(type, value) {
    const results = Utils.el(`adminserver-build-${type}-results`);
    if (!results) return;
    const selected = type === 'add' ? this.buildadditions : this.buildremovals;
    const source = type === 'add' ? this.server.available_allocations || [] : this.removableallocations();
    const search = value.trim().toLowerCase();
    const matches = source.filter(allocation => !selected.includes(Number(allocation.id)) && (!search || this.allocationlabel(allocation).toLowerCase().includes(search) || String(allocation.ip).toLowerCase().includes(search))).slice(0, 20);
    results.innerHTML = matches.length ? matches.map(allocation => `<button type="button" onclick="adminservers.selectallocation('${type}', ${Number(allocation.id)})"><strong>${this.safe(allocation.alias || allocation.ip)}</strong><span>${this.safe(allocation.ip)}:${Number(allocation.port)}</span></button>`).join('') : '<span>No matching ports found.</span>';
    results.classList.add('visible');
  },

  hideallocationresults(type) {
    Utils.el(`adminserver-build-${type}-results`)?.classList.remove('visible');
  },

  selectallocation(type, id) {
    const list = type === 'add' ? this.buildadditions : this.buildremovals;
    if (!list.includes(Number(id))) list.push(Number(id));
    this.replaceallocationsearch(type);
  },

  removeallocation(type, id) {
    if (type === 'add') this.buildadditions = this.buildadditions.filter(value => Number(value) !== Number(id));
    else this.buildremovals = this.buildremovals.filter(value => Number(value) !== Number(id));
    this.replaceallocationsearch(type);
  },

  replaceallocationsearch(type) {
    const input = Utils.el(`adminserver-build-${type}-search`);
    const field = input?.closest('.adminservers-allocation-search');
    if (field) field.outerHTML = this.renderallocationsearch(type);
  },

  refreshremovals() {
    const allowed = this.removableallocations().map(allocation => Number(allocation.id));
    this.buildremovals = this.buildremovals.filter(id => allowed.includes(Number(id)));
    this.replaceallocationsearch('remove');
  },

  async savebuild() {
    const errorbox = Utils.el('adminservers-build-error');
    const button = Utils.el('adminservers-build-save');
    const numbervalue = id => Number(Utils.el(id)?.value || 0);
    const payload = {
      cpu: numbervalue('adminserver-build-cpu'),
      threads: Utils.el('adminserver-build-threads')?.value.trim() || null,
      memory: numbervalue('adminserver-build-memory'),
      swap: Number(Utils.el('adminserver-build-swap')?.value || 0),
      disk: numbervalue('adminserver-build-disk'),
      io: numbervalue('adminserver-build-io'),
      oom_disabled: !(Utils.el('adminserver-build-oom')?.checked || false),
      database_limit: numbervalue('adminserver-build-databases'),
      allocation_limit: numbervalue('adminserver-build-allocations'),
      backup_limit: numbervalue('adminserver-build-backups'),
      allocation_id: numbervalue('adminserver-build-gameport'),
      add_allocations: [...this.buildadditions],
      remove_allocations: [...this.buildremovals]
    };
    if (!payload.allocation_id || payload.cpu < 0 || payload.memory < 0 || payload.swap < -1 || payload.disk < 0 || payload.io < 10 || payload.io > 1000 || payload.database_limit < 0 || payload.allocation_limit < 0 || payload.backup_limit < 0) {
      if (errorbox) errorbox.innerHTML = '<div class="paneladmin-notice error">Check the resource limits and select a valid game port.</div>';
      return;
    }
    if (button) {
      button.disabled = true;
      button.textContent = 'Saving...';
    }
    try {
      const data = await this.serverrequest('/build', 'PATCH', payload);
      this.server = data.server;
      this.buildadditions = [];
      this.buildremovals = [];
      this.renderdetail();
    } catch (error) {
      if (errorbox) errorbox.innerHTML = `<div class="paneladmin-notice error">${this.safe(error.message)}</div>`;
      if (button) {
        button.disabled = false;
        button.textContent = 'Save changes';
      }
    }
  },

  selectstartupnest(value) {
    this.startupnestid = Number(value);
    const nest = (this.server.startup_nests || []).find(entry => Number(entry.id) === this.startupnestid);
    this.startupeggid = Number(nest?.eggs?.[0]?.id || 0) || null;
    this.renderdetail();
  },

  selectstartupegg(value) {
    this.startupeggid = Number(value);
    this.renderdetail();
  },

  selectstartupimage(value) {
    const input = Utils.el('adminserver-startup-image');
    if (input && value) input.value = value;
  },

  togglestartuplabel() {
    const input = Utils.el('adminserver-startup-skip');
    const label = input?.closest('.paneladmin-toggle')?.querySelector('em');
    if (label) label.textContent = input.checked ? 'Enabled' : 'Disabled';
  },

  async savestartup() {
    const errorbox = Utils.el('adminservers-startup-error');
    const button = Utils.el('adminservers-startup-save');
    const environment = {};
    document.querySelectorAll('[data-startup-variable]').forEach(input => {
      environment[input.getAttribute('data-startup-variable')] = input.value;
    });
    const payload = {
      startup: Utils.el('adminserver-startup-command')?.value.trim() || '',
      egg_id: Number(Utils.el('adminserver-startup-egg')?.value || 0),
      skip_scripts: Utils.el('adminserver-startup-skip')?.checked || false,
      docker_image: Utils.el('adminserver-startup-image')?.value.trim() || '',
      environment
    };
    if (!payload.startup || !payload.egg_id || !payload.docker_image) {
      if (errorbox) errorbox.innerHTML = '<div class="paneladmin-notice error">Select an Egg and provide a startup command and Docker image.</div>';
      return;
    }
    if (button) {
      button.disabled = true;
      button.textContent = 'Saving...';
    }
    try {
      const data = await this.serverrequest('/startup', 'PATCH', payload);
      this.server = data.server;
      this.startupnestid = null;
      this.startupeggid = null;
      this.renderdetail();
    } catch (error) {
      if (errorbox) errorbox.innerHTML = `<div class="paneladmin-notice error">${this.safe(error.message)}</div>`;
      if (button) {
        button.disabled = false;
        button.textContent = 'Save changes';
      }
    }
  },

  async createdatabase() {
    const errorbox = Utils.el('adminservers-database-error');
    const button = Utils.el('adminservers-database-create');
    const connections = Utils.el('adminserver-database-connections')?.value.trim() || '';
    const payload = {
      database_host_id: Number(Utils.el('adminserver-database-host')?.value || 0),
      database: Utils.el('adminserver-database-name')?.value.trim() || '',
      remote: Utils.el('adminserver-database-remote')?.value.trim() || '%',
      max_connections: connections === '' ? null : Number(connections)
    };
    if (!payload.database_host_id || !payload.database || !/^[a-zA-Z0-9_]+$/.test(payload.database) || payload.max_connections !== null && payload.max_connections < 0) {
      if (errorbox) errorbox.innerHTML = '<div class="paneladmin-notice error">Select a database host and enter a valid database name.</div>';
      return;
    }
    if (button) {
      button.disabled = true;
      button.textContent = 'Creating...';
    }
    try {
      const data = await this.serverrequest('/databases', 'POST', payload);
      this.server = data.server;
      this.renderdetail();
    } catch (error) {
      if (errorbox) errorbox.innerHTML = `<div class="paneladmin-notice error">${this.safe(error.message)}</div>`;
      if (button) {
        button.disabled = false;
        button.textContent = 'Create database';
      }
    }
  },

  confirmdeletedatabase(id) {
    const database = (this.server.databases || []).find(entry => Number(entry.id) === Number(id));
    if (!database) return;
    this.deletingdatabaseid = Number(id);
    Modal.open('Delete Database', `<p class="adminservers-action-warning">Delete <strong>${this.safe(database.database)}</strong>? All data stored in this database will be permanently removed.</p><div id="adminservers-database-delete-error"></div><div class="modal-actions"><button type="button" class="btn btn-secondary" onclick="Modal.close()">Cancel</button><button type="button" class="btn btn-danger" id="adminservers-database-delete-confirm" onclick="adminservers.deletedatabase()">Delete database</button></div>`);
  },

  async deletedatabase() {
    const errorbox = Utils.el('adminservers-database-delete-error');
    const button = Utils.el('adminservers-database-delete-confirm');
    if (!this.deletingdatabaseid) return;
    if (button) button.disabled = true;
    try {
      const data = await this.serverrequest('/databases/' + Number(this.deletingdatabaseid), 'DELETE');
      this.server = data.server;
      this.deletingdatabaseid = null;
      Modal.close();
      this.renderdetail();
    } catch (error) {
      if (errorbox) errorbox.innerHTML = `<div class="paneladmin-notice error">${this.safe(error.message)}</div>`;
      if (button) button.disabled = false;
    }
  },

  async togglemount(id) {
    const mount = (this.server.mounts || []).find(entry => Number(entry.id) === Number(id));
    const errorbox = Utils.el('adminservers-mount-error');
    const button = Utils.el('adminserver-mount-' + Number(id));
    if (!mount) return;
    if (button) {
      button.disabled = true;
      button.textContent = mount.mounted ? 'Unmounting...' : 'Mounting...';
    }
    try {
      const data = await this.serverrequest('/mounts/' + Number(id), mount.mounted ? 'DELETE' : 'POST');
      this.server = data.server;
      this.renderdetail();
    } catch (error) {
      if (errorbox) errorbox.innerHTML = `<div class="paneladmin-notice error">${this.safe(error.message)}</div>`;
      if (button) {
        button.disabled = false;
        button.textContent = mount.mounted ? 'Unmount' : 'Mount';
      }
    }
  },

  confirmaction(action) {
    const suspended = Boolean(this.server.suspended);
    const content = {
      reinstall: ['Reinstall server?', 'This can overwrite server data. The assigned service scripts will be run again.', 'Reinstall'],
      install: ['Change install status?', `This server will be marked as ${this.server.installed ? 'uninstalled' : 'installed'}.`, 'Change status'],
      suspension: [suspended ? 'Unsuspend server?' : 'Suspend server?', suspended ? 'The owner will regain access to this server.' : 'The server will be stopped and its owner will immediately lose access.', suspended ? 'Unsuspend' : 'Suspend']
    }[action];
    if (!content) return;
    Modal.open(content[0], `<p class="adminservers-action-warning">${this.safe(content[1])}</p><div id="adminservers-action-error"></div><div class="modal-actions"><button type="button" class="btn btn-secondary" onclick="Modal.close()">Cancel</button><button type="button" class="btn ${action === 'reinstall' || action === 'suspension' && !suspended ? 'btn-danger' : 'btn-primary'}" id="adminservers-action-confirm" onclick="adminservers.runaction('${action}')">${this.safe(content[2])}</button></div>`);
  },

  async runaction(action) {
    const button = Utils.el('adminservers-action-confirm');
    const errorbox = Utils.el('adminservers-action-error');
    if (button) button.disabled = true;
    try {
      let endpoint = '/' + action;
      let payload = null;
      if (action === 'suspension') payload = { action: this.server.suspended ? 'unsuspend' : 'suspend' };
      const data = await this.serverrequest(endpoint, 'POST', payload);
      this.server = data.server;
      Modal.close();
      this.renderdetail();
    } catch (error) {
      if (errorbox) errorbox.innerHTML = `<div class="paneladmin-notice error">${this.safe(error.message)}</div>`;
      if (button) button.disabled = false;
    }
  },

  opentransfer() {
    const nodes = this.server.transfer_nodes || [];
    if (!nodes.length) return;
    Modal.open('Transfer Server', `<div id="adminservers-transfer-error"></div><div class="adminservers-transfer-form"><label><span>Target Node</span><select id="adminserver-transfer-node" onchange="adminservers.renderallocations()"><option value="">Select a node</option>${nodes.map(node => `<option value="${Number(node.id)}">${this.safe(node.name)}</option>`).join('')}</select></label><label><span>Primary Allocation</span><select id="adminserver-transfer-allocation" disabled><option value="">Select a node first</option></select></label><p>Warning! This feature has not been fully tested and may have bugs.</p></div><div class="modal-actions"><button type="button" class="btn btn-secondary" onclick="Modal.close()">Cancel</button><button type="button" class="btn btn-primary" id="adminservers-transfer-confirm" onclick="adminservers.transfer()">Transfer server</button></div>`, 'modal-wide');
  },

  renderallocations() {
    const nodeid = Number(Utils.el('adminserver-transfer-node')?.value || 0);
    const select = Utils.el('adminserver-transfer-allocation');
    const node = (this.server.transfer_nodes || []).find(entry => Number(entry.id) === nodeid);
    if (!select) return;
    const allocations = node?.allocations || [];
    select.disabled = !allocations.length;
    select.innerHTML = allocations.length ? `<option value="">Select an allocation</option>${allocations.map(allocation => `<option value="${Number(allocation.id)}">${this.safe(allocation.alias || allocation.ip)}:${Number(allocation.port)}</option>`).join('')}` : '<option value="">No free allocations</option>';
  },

  async transfer() {
    const nodeid = Number(Utils.el('adminserver-transfer-node')?.value || 0);
    const allocationid = Number(Utils.el('adminserver-transfer-allocation')?.value || 0);
    const errorbox = Utils.el('adminservers-transfer-error');
    const button = Utils.el('adminservers-transfer-confirm');
    if (!nodeid || !allocationid) {
      if (errorbox) errorbox.innerHTML = '<div class="paneladmin-notice error">Select a target node and a free allocation.</div>';
      return;
    }
    if (button) button.disabled = true;
    try {
      const data = await this.serverrequest('/transfer', 'POST', { node_id: nodeid, allocation_id: allocationid });
      this.server = data.server;
      Modal.close();
      this.renderdetail();
    } catch (error) {
      if (errorbox) errorbox.innerHTML = `<div class="paneladmin-notice error">${this.safe(error.message)}</div>`;
      if (button) button.disabled = false;
    }
  },

  async serverrequest(endpoint, method, payload = null) {
    const { server, apikey } = await adminpanel.credentials();
    const data = await Api.adminrequest(server.panelUrl, apikey, '/admin/ctrlservers/servers/' + Number(this.server.id) + endpoint, method, payload);
    if (App.currentServer !== server) throw new Error('The selected panel changed.');
    return data;
  },

  async openowner(id) {
    await adminusers.openremote(id);
  },

  opennode(id) {
    adminnodes.openfromlink(id);
  },

  capacity(value) {
    return `${Number(value || 0).toLocaleString()} MiB`;
  },

  safe(value) {
    return Utils.escape(String(value ?? ''));
  },

  safeattr(value) {
    return this.safe(value).replace(/`/g, '&#96;');
  }
};
