const PERMISSION_DEFINITIONS = [
  { id: 'servers.read', group: 'Servers', label: 'View servers and status', description: 'List saved servers and read sanitized status and resource data.', default: 'allow' },
  { id: 'servers.organize', group: 'Servers', label: 'Organize servers', description: 'Reorder, pin, tag, rename, and move servers between workspace folders.', default: 'ask' },
  { id: 'servers.manage', group: 'Servers', label: 'Manage saved servers', description: 'Add, update, clone, or remove saved server connections.', default: 'ask' },
  { id: 'power.control', group: 'Execution', label: 'Control server power', description: 'Start, stop, restart, or kill Pterodactyl servers.', default: 'ask' },
  { id: 'console.execute', group: 'Execution', label: 'Send console commands', description: 'Send commands to Pterodactyl server consoles.', default: 'ask' },
  { id: 'shell.execute', group: 'Execution', label: 'Execute VPS shell commands', description: 'Run arbitrary commands with the saved SSH account. This can bypass every narrower VPS permission.', default: 'deny' },
  { id: 'files.read', group: 'Files', label: 'Read files', description: 'List directories and read remote text files.', default: 'allow' },
  { id: 'files.write', group: 'Files', label: 'Write files', description: 'Create or replace remote text file contents.', default: 'ask' },
  { id: 'files.create', group: 'Files', label: 'Create directories', description: 'Create remote directories.', default: 'ask' },
  { id: 'files.move', group: 'Files', label: 'Rename and move files', description: 'Rename or move remote files and directories, including bulk moves.', default: 'ask' },
  { id: 'files.copy', group: 'Files', label: 'Copy files', description: 'Copy remote files and directories.', default: 'ask' },
  { id: 'files.delete', group: 'Files', label: 'Delete files', description: 'Delete remote files and directories, including bulk and recursive deletion.', default: 'ask' },
  { id: 'files.permissions', group: 'Files', label: 'Change file permissions', description: 'Apply chmod modes to one or many remote paths.', default: 'ask' },
  { id: 'files.archives', group: 'Files', label: 'Manage archives', description: 'Compress and extract remote files and directories.', default: 'ask' },
  { id: 'files.binary', group: 'Files', label: 'Transfer binary files', description: 'Read or write base64-encoded binary files through MCP.', default: 'deny' },
  { id: 'backups.read', group: 'Pterodactyl', label: 'View backups', description: 'List backups and request download information.', default: 'allow' },
  { id: 'backups.manage', group: 'Pterodactyl', label: 'Create and lock backups', description: 'Create backups and change their lock state.', default: 'ask' },
  { id: 'backups.restore', group: 'Pterodactyl', label: 'Restore backups', description: 'Replace server data by restoring a backup.', default: 'ask' },
  { id: 'backups.delete', group: 'Pterodactyl', label: 'Delete backups', description: 'Permanently delete unlocked backups.', default: 'ask' },
  { id: 'databases.read', group: 'Pterodactyl', label: 'View databases', description: 'List database names and connection endpoints without passwords.', default: 'allow' },
  { id: 'databases.credentials', group: 'Pterodactyl', label: 'View database credentials', description: 'Return database usernames and passwords to the connected AI client.', default: 'deny' },
  { id: 'databases.manage', group: 'Pterodactyl', label: 'Manage databases', description: 'Create, delete, or rotate Pterodactyl database passwords.', default: 'ask' },
  { id: 'network.read', group: 'Pterodactyl', label: 'View allocations', description: 'List server IP and port allocations.', default: 'allow' },
  { id: 'network.manage', group: 'Pterodactyl', label: 'Manage allocations', description: 'Create, edit, select, or delete network allocations.', default: 'ask' },
  { id: 'schedules.read', group: 'Pterodactyl', label: 'View schedules', description: 'List schedules and their tasks.', default: 'allow' },
  { id: 'schedules.manage', group: 'Pterodactyl', label: 'Manage schedules', description: 'Create, edit, run, or delete schedules and tasks.', default: 'ask' },
  { id: 'subusers.read', group: 'Pterodactyl', label: 'View sub-users', description: 'List sub-users and assigned permissions.', default: 'allow' },
  { id: 'subusers.manage', group: 'Pterodactyl', label: 'Manage sub-users', description: 'Invite, edit, or delete Pterodactyl sub-users.', default: 'ask' },
  { id: 'startup.read', group: 'Pterodactyl', label: 'View startup settings', description: 'Read startup commands, variables, and Docker images.', default: 'allow' },
  { id: 'startup.manage', group: 'Pterodactyl', label: 'Change startup settings', description: 'Change startup variables, Docker images, server names, or descriptions.', default: 'ask' },
  { id: 'activity.read', group: 'Pterodactyl', label: 'View activity logs', description: 'Read Pterodactyl activity and audit entries.', default: 'allow' },
  { id: 'pterodactyl.advanced', group: 'Pterodactyl', label: 'Advanced API requests', description: 'Call other relative Pterodactyl client API endpoints not covered above.', default: 'deny' },
];

const TOOL_PERMISSIONS = {
  listpermissions: 'servers.read',
  listservers: 'servers.read',
  getserver: 'servers.read',
  moveserver: 'servers.organize',
  updateserverorganization: 'servers.organize',
  addserver: 'servers.manage',
  deleteserver: 'servers.manage',
  serverpower: 'power.control',
  sendservercommand: 'console.execute',
  runvpscommand: 'shell.execute',
  listfiles: 'files.read',
  readfile: 'files.read',
  writefile: 'files.write',
  createdirectory: 'files.create',
  renamepath: 'files.move',
  movepaths: 'files.move',
  copypath: 'files.copy',
  deletepaths: 'files.delete',
  chmodpaths: 'files.permissions',
  compresspaths: 'files.archives',
  extractpath: 'files.archives',
  readbinaryfile: 'files.binary',
  writebinaryfile: 'files.binary',
};

function defaultpermissions() {
  return Object.fromEntries(PERMISSION_DEFINITIONS.map(item => [item.id, item.default]));
}

function pterodactylpermission(args = {}) {
  const method = String(args.method || 'GET').toUpperCase();
  const endpoint = String(args.endpoint || '').toLowerCase();
  const read = method === 'GET';

  if (endpoint.startsWith('/files/contents') || endpoint.startsWith('/files/list')) return read ? 'files.read' : 'files.write';
  if (endpoint.startsWith('/files/write')) return 'files.write';
  if (endpoint.startsWith('/files/create-folder')) return 'files.create';
  if (endpoint.startsWith('/files/rename') || endpoint.startsWith('/files/move')) return 'files.move';
  if (endpoint.startsWith('/files/copy')) return 'files.copy';
  if (endpoint.startsWith('/files/delete')) return 'files.delete';
  if (endpoint.startsWith('/files/chmod')) return 'files.permissions';
  if (endpoint.startsWith('/files/compress') || endpoint.startsWith('/files/decompress')) return 'files.archives';
  if (endpoint.startsWith('/backups')) {
    if (read) return 'backups.read';
    if (method === 'DELETE') return 'backups.delete';
    if (endpoint.includes('/restore')) return 'backups.restore';
    return 'backups.manage';
  }
  if (endpoint.startsWith('/databases')) {
    if (read && (endpoint.includes('include=password') || endpoint.includes('/password'))) return 'databases.credentials';
    return read ? 'databases.read' : 'databases.manage';
  }
  if (endpoint.startsWith('/network') || endpoint.startsWith('/allocations')) return read ? 'network.read' : 'network.manage';
  if (endpoint.startsWith('/schedules')) return read ? 'schedules.read' : 'schedules.manage';
  if (endpoint.startsWith('/users')) return read ? 'subusers.read' : 'subusers.manage';
  if (endpoint.startsWith('/startup')) return read ? 'startup.read' : 'startup.manage';
  if (endpoint.startsWith('/settings')) return 'startup.manage';
  if (endpoint.startsWith('/activity')) return read ? 'activity.read' : 'pterodactyl.advanced';
  if (endpoint === '/resources') return read ? 'servers.read' : 'pterodactyl.advanced';
  if (endpoint === '/power') return 'power.control';
  if (endpoint === '/command') return 'console.execute';
  return 'pterodactyl.advanced';
}

function permissionfortool(tool, args) {
  if (tool === 'pterodactylrequest') return pterodactylpermission(args);
  return TOOL_PERMISSIONS[tool] || 'pterodactyl.advanced';
}

module.exports = {
  PERMISSION_DEFINITIONS,
  TOOL_PERMISSIONS,
  defaultpermissions,
  permissionfortool,
};
