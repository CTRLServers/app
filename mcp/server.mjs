import http from 'node:http';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { localhostHostValidation, localhostOriginValidation, toNodeHandler } from '@modelcontextprotocol/node';
import * as z from 'zod/v4';

const require = createRequire(import.meta.url);
const { permissionfortool } = require('./permissions.cjs');

const serverid = z.string().min(1).max(500);
const remotepath = z.string().min(1).max(4096);
const pathlist = z.array(remotepath).min(1).max(500);
const optionalhash = z.string().regex(/^[a-f0-9]{64}$/i).optional();

const tooldefinitions = [
  ['listpermissions', 'Show the MCP permissions selected by the CTRLServers user.', z.object({}), { readOnlyHint: true }],
  ['listservers', 'List saved CTRLServers servers using stable IDs. Secrets are never returned.', z.object({}), { readOnlyHint: true }],
  ['getserver', 'Get sanitized details and cached status for one saved server.', z.object({ serverid }), { readOnlyHint: true }],
  ['moveserver', 'Move one saved server before or after another server in the dashboard order.', z.object({ serverid, targetid: serverid, position: z.enum(['before', 'after']) }), { destructiveHint: false }],
  ['updateserverorganization', 'Update a server name, pinned state, workspace folder, or tags.', z.object({ serverid, name: z.string().min(1).max(200).optional(), pinned: z.boolean().optional(), folder: z.string().max(200).nullable().optional(), tags: z.array(z.string().min(1).max(100)).max(100).optional() }), { destructiveHint: false }],
  ['addserver', 'Add a Pterodactyl, VPS/VDS, or Link server. For Pterodactyl, panelurl and apikey discover and import matching remote servers.', z.object({ type: z.enum(['Pterodactyl', 'VPS/VDS', 'Link']), name: z.string().min(1).max(200).optional(), panelurl: z.string().url().optional(), apikey: z.string().min(1).optional(), remoteids: z.array(z.string()).optional(), host: z.string().optional(), port: z.number().int().min(1).max(65535).optional(), username: z.string().optional(), password: z.string().optional(), keyname: z.string().optional(), url: z.string().url().optional() }), { destructiveHint: false, openWorldHint: true }],
  ['deleteserver', 'Remove one saved server entry from CTRLServers. This does not delete the remote server.', z.object({ serverid }), { destructiveHint: true }],
  ['serverpower', 'Start, stop, restart, or kill a Pterodactyl server.', z.object({ serverid, signal: z.enum(['start', 'stop', 'restart', 'kill']) }), { destructiveHint: true, openWorldHint: true }],
  ['sendservercommand', 'Send one command to a Pterodactyl console.', z.object({ serverid, command: z.string().min(1).max(65536) }), { destructiveHint: true, openWorldHint: true }],
  ['runvpscommand', 'Run an arbitrary shell command on a VPS/VDS using the saved SSH account. This permission is unrestricted.', z.object({ serverid, command: z.string().min(1).max(262144), root: z.boolean().optional() }), { destructiveHint: true, openWorldHint: true }],
  ['listfiles', 'List a remote directory on a Pterodactyl or VPS/VDS server.', z.object({ serverid, path: remotepath.default('/') }), { readOnlyHint: true, openWorldHint: true }],
  ['readfile', 'Read a remote UTF-8 text file and return a SHA-256 content hash.', z.object({ serverid, path: remotepath }), { readOnlyHint: true, openWorldHint: true }],
  ['writefile', 'Create or replace a remote UTF-8 text file. Pass expectedhash to prevent overwriting a changed file.', z.object({ serverid, path: remotepath, content: z.string().max(8 * 1024 * 1024), expectedhash: optionalhash }), { destructiveHint: true, openWorldHint: true }],
  ['createdirectory', 'Create a remote directory.', z.object({ serverid, path: remotepath }), { destructiveHint: false, openWorldHint: true }],
  ['renamepath', 'Rename or move one remote path.', z.object({ serverid, source: remotepath, destination: remotepath }), { destructiveHint: true, openWorldHint: true }],
  ['movepaths', 'Move one or many remote paths into a destination directory.', z.object({ serverid, paths: pathlist, destination: remotepath }), { destructiveHint: true, openWorldHint: true }],
  ['copypath', 'Copy one remote file or directory to a destination path.', z.object({ serverid, source: remotepath, destination: remotepath }), { destructiveHint: false, openWorldHint: true }],
  ['deletepaths', 'Permanently delete one or many remote files or directories.', z.object({ serverid, paths: pathlist, recursive: z.boolean().default(false) }), { destructiveHint: true, openWorldHint: true }],
  ['chmodpaths', 'Change Unix permissions on one or many remote paths.', z.object({ serverid, paths: pathlist, mode: z.string().regex(/^[0-7]{3,4}$/) }), { destructiveHint: true, openWorldHint: true }],
  ['compresspaths', 'Create an archive from remote files or directories.', z.object({ serverid, paths: pathlist, destination: remotepath }), { destructiveHint: false, openWorldHint: true }],
  ['extractpath', 'Extract a remote archive into a destination directory.', z.object({ serverid, archive: remotepath, destination: remotepath }), { destructiveHint: true, openWorldHint: true }],
  ['readbinaryfile', 'Read a remote binary file as base64. The maximum file size is 8 MiB.', z.object({ serverid, path: remotepath }), { readOnlyHint: true, openWorldHint: true }],
  ['writebinaryfile', 'Create or replace a remote binary file from base64. The maximum decoded size is 8 MiB.', z.object({ serverid, path: remotepath, base64: z.string().max(12 * 1024 * 1024), expectedhash: optionalhash }), { destructiveHint: true, openWorldHint: true }],
  ['pterodactylrequest', 'Call a relative Pterodactyl client API endpoint. CTRLServers maps the endpoint and method to the matching user-selected permission.', z.object({ serverid, method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('GET'), endpoint: z.string().startsWith('/').max(4096), body: z.unknown().optional() }), { destructiveHint: true, openWorldHint: true }],
];

function timingequals(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function toolresult(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  const result = { content: [{ type: 'text', text }] };
  if (value && typeof value === 'object' && !Array.isArray(value)) result.structuredContent = value;
  return result;
}

export async function startmcpserver(options) {
  const host = options.host || '127.0.0.1';
  const parsedport = Number(options.port);
  const requestedport = Number.isInteger(parsedport) && parsedport >= 0 && parsedport <= 65535 ? parsedport : 12748;
  const maxbodysize = 12 * 1024 * 1024;

  const handler = createMcpHandler(() => {
    const server = new McpServer(
      { name: 'ctrlservers', version: options.version || '1.0.0' },
      { instructions: 'Use listservers before server operations. Use stable server IDs. Read a file before changing it and pass its expectedhash when writing. Never request or expose saved CTRLServers credentials.' }
    );

    for (const [name, description, inputSchema, annotations] of tooldefinitions) {
      server.registerTool(name, { description, inputSchema, annotations }, async args => {
        const started = Date.now();
        const permission = permissionfortool(name, args);
        try {
          const value = name === 'listpermissions'
            ? options.getpermissionstatus()
            : await options.execute(name, args, permission);
          options.onactivity?.({ time: new Date().toISOString(), tool: name, permission, success: true, duration: Date.now() - started });
          return toolresult(value);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          options.onactivity?.({ time: new Date().toISOString(), tool: name, permission, success: false, duration: Date.now() - started });
          return { content: [{ type: 'text', text: message }], isError: true };
        }
      });
    }
    return server;
  }, { legacy: 'stateless', responseMode: 'auto', maxRequestBodySize: maxbodysize, onerror: options.onerror });

  const nodehandler = toNodeHandler(handler, { maxRequestBodySize: maxbodysize, onerror: options.onerror });
  const validhost = localhostHostValidation();
  const validorigin = localhostOriginValidation();
  const httpserver = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${host}:${requestedport}`);
      if (url.pathname === '/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ name: 'CTRLServers MCP', running: true }));
        return;
      }
      if (url.pathname !== '/mcp') {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
        return;
      }
      if (!validhost(req, res) || !validorigin(req, res)) return;
      const authorization = String(req.headers.authorization || '');
      const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
      if (!timingequals(supplied, options.gettoken())) {
        res.writeHead(401, { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Bearer realm="CTRLServers MCP"', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ error: 'Invalid or missing MCP access token' }));
        return;
      }
      req.auth = { token: supplied, clientId: 'ctrlservers-local-client', scopes: [] };
      await nodehandler(req, res);
    } catch (error) {
      options.onerror?.(error instanceof Error ? error : new Error(String(error)));
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
      if (!res.writableEnded) res.end(JSON.stringify({ error: 'MCP request failed' }));
    }
  });

  await new Promise((resolve, reject) => {
    httpserver.once('error', reject);
    httpserver.listen(requestedport, host, resolve);
  });
  const address = httpserver.address();
  const port = typeof address === 'object' && address ? address.port : requestedport;

  return {
    endpoint: `http://${host}:${port}/mcp`,
    async close() {
      await handler.close();
      await new Promise(resolve => httpserver.close(() => resolve()));
    },
  };
}
