// Vellum — zero-dependency REST API + static web server (Node built-ins only).
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { Spaces, Docs, Tasks, seedIfEmpty } = require('./db');

seedIfEmpty();

const PORT = process.env.PORT || 4321;
const WEB_DIR = path.join(__dirname, '..', '..', 'web');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon',
};

const send = (res, code, body, headers = {}) => {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(code, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    ...headers,
  });
  res.end(data);
};
const json = (res, code, data) => send(res, code, data, { 'Content-Type': 'application/json' });
const ok = (res, data) => json(res, 200, { ok: true, data });
const notFound = (res) => json(res, 404, { ok: false, error: 'not_found' });

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); }
    });
  });
}

// Tiny router: [method, /pattern/:params, handler]
const routes = [];
const route = (method, pattern, handler) => routes.push({ method, parts: pattern.split('/').filter(Boolean), handler });

route('GET', '/api/health', (_p, _q, _b, res) => json(res, 200, { ok: true, name: 'vellum', version: '1.0.0' }));

route('GET', '/api/spaces', (_p, _q, _b, res) => ok(res, Spaces.list()));
route('POST', '/api/spaces', (_p, _q, b, res) => ok(res, Spaces.create(b)));
route('GET', '/api/spaces/:id', (p, _q, _b, res) => { const s = Spaces.get(p.id); s ? ok(res, s) : notFound(res); });
route('PATCH', '/api/spaces/:id', (p, _q, b, res) => { const s = Spaces.update(p.id, b); s ? ok(res, s) : notFound(res); });
route('DELETE', '/api/spaces/:id', (p, _q, _b, res) => ok(res, { removed: Spaces.remove(p.id) }));

route('GET', '/api/documents', (_p, q, _b, res) => ok(res, Docs.list({
  spaceId: q.spaceId,
  parentId: q.parentId === 'root' ? null : q.parentId,
  starred: q.starred === 'true',
  includeDeleted: q.includeDeleted === 'true',
})));
route('POST', '/api/documents', (_p, _q, b, res) => ok(res, Docs.create(b)));
route('GET', '/api/documents/:id', (p, _q, _b, res) => { const d = Docs.get(p.id); d ? ok(res, d) : notFound(res); });
route('PATCH', '/api/documents/:id', (p, _q, b, res) => { const d = Docs.update(p.id, b); d ? ok(res, d) : notFound(res); });
route('POST', '/api/documents/:id/blocks', (p, _q, b, res) => { const d = Docs.appendBlocks(p.id, b.blocks ?? b); d ? ok(res, d) : notFound(res); });
route('POST', '/api/documents/:id/restore', (p, _q, _b, res) => { const d = Docs.restore(p.id); d ? ok(res, d) : notFound(res); });
route('DELETE', '/api/documents/:id', (p, q, _b, res) => ok(res, { removed: Docs.remove(p.id, { hard: q.hard === 'true' }) }));

route('GET', '/api/search', (_p, q, _b, res) => {
  const term = String(q.q || '').trim();
  ok(res, term ? Docs.search(term, { spaceId: q.spaceId }) : []);
});

route('GET', '/api/tasks', (_p, q, _b, res) => {
  if (q.day) return ok(res, Tasks.forDay(Number(q.day)));
  ok(res, Tasks.list({ filter: q.filter || 'all' }));
});
route('POST', '/api/tasks', (_p, _q, b, res) => ok(res, Tasks.create(b)));
route('PATCH', '/api/tasks/:id', (p, _q, b, res) => { const t = Tasks.update(p.id, b); t ? ok(res, t) : notFound(res); });
route('DELETE', '/api/tasks/:id', (p, _q, _b, res) => ok(res, { removed: Tasks.remove(p.id) }));

function match(routeParts, pathParts) {
  if (routeParts.length !== pathParts.length) return null;
  const params = {};
  for (let i = 0; i < routeParts.length; i++) {
    if (routeParts[i].startsWith(':')) params[routeParts[i].slice(1)] = decodeURIComponent(pathParts[i]);
    else if (routeParts[i] !== pathParts[i]) return null;
  }
  return params;
}

function serveStatic(pathname, res) {
  let rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  let file = path.join(WEB_DIR, rel);
  if (!file.startsWith(WEB_DIR)) return notFound(res); // path traversal guard
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(WEB_DIR, 'index.html');
  fs.readFile(file, (err, buf) => {
    if (err) return notFound(res);
    send(res, 200, buf, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  if (req.method === 'OPTIONS') return send(res, 204, '');

  if (pathname.startsWith('/api/')) {
    const pathParts = pathname.split('/').filter(Boolean);
    const query = Object.fromEntries(url.searchParams);
    const body = ['POST', 'PATCH', 'PUT'].includes(req.method) ? await readBody(req) : {};
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const params = match(r.parts, pathParts);
      if (params) return r.handler(params, query, body, res);
    }
    return notFound(res);
  }

  serveStatic(pathname, res);
});

server.listen(PORT, () => {
  console.log(`\n  ✦ Vellum running at http://localhost:${PORT}`);
  console.log(`  ✦ REST API at http://localhost:${PORT}/api\n`);
});
