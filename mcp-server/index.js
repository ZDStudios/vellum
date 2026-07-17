#!/usr/bin/env node
/*
 * Vellum MCP server — zero-dependency.
 *
 * Exposes a running Vellum instance's REST API as Model Context Protocol tools
 * over stdio (newline-delimited JSON-RPC 2.0). No npm install required.
 *
 * Point it at your Vellum server with the VELLUM_URL env var (default http://localhost:4321).
 *
 * Example Claude Desktop / Claude Code config:
 *   {
 *     "mcpServers": {
 *       "vellum": {
 *         "command": "node",
 *         "args": ["/absolute/path/to/vellum/mcp-server/index.js"],
 *         "env": { "VELLUM_URL": "http://localhost:4321" }
 *       }
 *     }
 *   }
 */
'use strict';

const BASE = (process.env.VELLUM_URL || 'http://localhost:4321').replace(/\/$/, '');
const PROTOCOL_VERSION = '2024-11-05';

const log = (...a) => process.stderr.write('[vellum-mcp] ' + a.join(' ') + '\n');

async function api(method, path, body) {
  const res = await fetch(BASE + '/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok || json.ok === false) {
    throw new Error(`Vellum API ${method} ${path} failed: ${res.status} ${text}`);
  }
  return json.data !== undefined ? json.data : json;
}

// ---------------- Tool definitions ----------------
const tools = [
  {
    name: 'list_spaces',
    description: 'List all spaces (top-level collections of documents) in the Vellum workspace.',
    inputSchema: { type: 'object', properties: {} },
    handler: () => api('GET', '/spaces'),
  },
  {
    name: 'create_space',
    description: 'Create a new space. A space groups related documents (e.g. "Personal", "Work").',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Display name of the space' },
        emoji: { type: 'string', description: 'Emoji icon, e.g. "🚀"' },
        color: { type: 'string', description: 'Hex accent color, e.g. "#4a6cf7"' },
      },
      required: ['name'],
    },
    handler: (a) => api('POST', '/spaces', a),
  },
  {
    name: 'list_documents',
    description: 'List documents, optionally filtered to a single space by spaceId.',
    inputSchema: {
      type: 'object',
      properties: { spaceId: { type: 'string', description: 'Optional space id to filter by' } },
    },
    handler: (a) => api('GET', '/documents' + (a.spaceId ? '?spaceId=' + encodeURIComponent(a.spaceId) : '')),
  },
  {
    name: 'get_document',
    description: 'Fetch a single document by id, including its full block content.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Document id' } },
      required: ['id'],
    },
    handler: (a) => api('GET', '/documents/' + encodeURIComponent(a.id)),
  },
  {
    name: 'create_document',
    description:
      'Create a new document in a space. Content is an array of blocks. Each block is ' +
      '{ type, text, checked? }. Valid types: text, h1, h2, h3, todo, bullet, numbered, quote, code, callout, divider.',
    inputSchema: {
      type: 'object',
      properties: {
        spaceId: { type: 'string', description: 'Space to create the document in' },
        title: { type: 'string', description: 'Document title' },
        emoji: { type: 'string', description: 'Optional emoji icon' },
        content: {
          type: 'array',
          description: 'Array of block objects, e.g. [{ "type": "h1", "text": "Hello" }]',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string' },
              text: { type: 'string' },
              checked: { type: 'boolean' },
            },
          },
        },
      },
      required: ['title'],
    },
    handler: (a) => api('POST', '/documents', a),
  },
  {
    name: 'update_document',
    description: 'Update a document\'s title, emoji, or full block content by id.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Document id' },
        title: { type: 'string' },
        emoji: { type: 'string' },
        content: { type: 'array', items: { type: 'object' } },
      },
      required: ['id'],
    },
    handler: (a) => { const { id, ...patch } = a; return api('PATCH', '/documents/' + encodeURIComponent(id), patch); },
  },
  {
    name: 'append_blocks',
    description: 'Append one or more blocks to the end of a document. Great for logging or appending notes.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Document id' },
        blocks: {
          type: 'array',
          description: 'Blocks to append, e.g. [{ "type": "todo", "text": "Ship it", "checked": false }]',
          items: { type: 'object', properties: { type: { type: 'string' }, text: { type: 'string' }, checked: { type: 'boolean' } } },
        },
      },
      required: ['id', 'blocks'],
    },
    handler: (a) => api('POST', '/documents/' + encodeURIComponent(a.id) + '/blocks', { blocks: a.blocks }),
  },
  {
    name: 'search_documents',
    description: 'Full-text search across document titles and content. Returns matching documents.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Search text' } },
      required: ['query'],
    },
    handler: (a) => api('GET', '/search?q=' + encodeURIComponent(a.query)),
  },
  {
    name: 'delete_document',
    description: 'Move a document to trash (soft delete) by id, or permanently remove it with hard=true.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Document id' },
        hard: { type: 'boolean', description: 'If true, permanently delete instead of trashing' },
      },
      required: ['id'],
    },
    handler: (a) => api('DELETE', '/documents/' + encodeURIComponent(a.id) + (a.hard ? '?hard=true' : '')),
  },
  {
    name: 'list_tasks',
    description: 'List tasks. filter can be "inbox" (unscheduled), "today", "upcoming", or "all" (default).',
    inputSchema: {
      type: 'object',
      properties: { filter: { type: 'string', enum: ['inbox', 'today', 'upcoming', 'all'], description: 'Which tasks to return' } },
    },
    handler: (a) => api('GET', '/tasks?filter=' + encodeURIComponent(a.filter || 'all')),
  },
  {
    name: 'create_task',
    description: 'Create a task. Optionally schedule it with a due date (epoch milliseconds). Omit due to place it in the Inbox.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task text' },
        due: { type: 'number', description: 'Due date as epoch milliseconds (optional)' },
      },
      required: ['title'],
    },
    handler: (a) => api('POST', '/tasks', a),
  },
  {
    name: 'update_task',
    description: 'Update a task by id — mark it done/undone, rename it, or reschedule it.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Task id' },
        title: { type: 'string' },
        done: { type: 'boolean' },
        due: { type: 'number', description: 'Due date as epoch milliseconds' },
      },
      required: ['id'],
    },
    handler: (a) => { const { id, ...patch } = a; return api('PATCH', '/tasks/' + encodeURIComponent(id), patch); },
  },
  {
    name: 'delete_task',
    description: 'Delete a task by id.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Task id' } },
      required: ['id'],
    },
    handler: (a) => api('DELETE', '/tasks/' + encodeURIComponent(a.id)),
  },
];

const toolMap = Object.fromEntries(tools.map((t) => [t.name, t]));

// ---------------- JSON-RPC plumbing ----------------
function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function reply(id, result) { send({ jsonrpc: '2.0', id, result }); }
function replyError(id, code, message) { send({ jsonrpc: '2.0', id, error: { code, message } }); }

async function handle(msg) {
  const { id, method, params } = msg;

  if (method === 'initialize') {
    return reply(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: 'vellum', version: '1.0.0' },
    });
  }
  if (method === 'notifications/initialized' || method === 'notifications/cancelled') return; // no response
  if (method === 'ping') return reply(id, {});

  if (method === 'tools/list') {
    return reply(id, {
      tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
    });
  }

  if (method === 'tools/call') {
    const tool = toolMap[params?.name];
    if (!tool) return replyError(id, -32602, `Unknown tool: ${params?.name}`);
    try {
      const data = await tool.handler(params.arguments || {});
      return reply(id, { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
    } catch (err) {
      return reply(id, { content: [{ type: 'text', text: 'Error: ' + err.message }], isError: true });
    }
  }

  if (id !== undefined) replyError(id, -32601, `Method not found: ${method}`);
}

// ---------------- stdio loop (newline-delimited JSON) ----------------
let buffer = '';
let pending = 0;
let endRequested = false;
const maybeExit = () => { if (endRequested && pending === 0) process.exit(0); };

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { log('bad JSON line ignored'); continue; }
    pending++;
    Promise.resolve(handle(msg))
      .catch((e) => log('handler error', e.message))
      .finally(() => { pending--; maybeExit(); });
  }
});
// When the client disconnects, finish any in-flight tool calls before exiting.
process.stdin.on('end', () => { endRequested = true; maybeExit(); });

log(`ready — proxying ${BASE}/api  (${tools.length} tools)`);
