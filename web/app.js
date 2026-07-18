/* Vellum web client — Craft-style workspace (docs, tasks, calendar).
   Vanilla JS. Talks to the REST API when available, falls back to localStorage. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
  const uid = () => Math.random().toString(36).slice(2, 11);
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ================= Icons (Lucide-style line icons) =================
  const ICONS = {
    'panel-left': '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    'chevron-up': '<path d="m18 15-6-6-6 6"/>',
    'file-pen': '<path d="M12.5 22H18a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v10"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M13.378 15.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"/>',
    'files': '<path d="M20 7h-3a2 2 0 0 1-2-2V2"/><path d="M9 18a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h7l4 4v10a2 2 0 0 1-2 2Z"/><path d="M3 7.6v12.8A1.6 1.6 0 0 0 4.6 22h9.8"/>',
    'circle-check': '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    'calendar': '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
    'cloud': '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
    'users': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    'folder': '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    'inbox': '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    'tag': '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5"/>',
    'search': '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    'bell': '<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>',
    'help': '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    'plus': '<path d="M5 12h14"/><path d="M12 5v14"/>',
    'grid': '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
    'columns': '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="M15 3v18"/>',
    'list': '<path d="M3 5h.01"/><path d="M3 12h.01"/><path d="M3 19h.01"/><path d="M8 5h13"/><path d="M8 12h13"/><path d="M8 19h13"/>',
    'more': '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    'crown': '<path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.52l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/>',
    'sun': '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
    'moon': '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    'calendar-days': '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/>',
    'clipboard-list': '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>',
    'check': '<path d="M20 6 9 17l-5-5"/>',
    'trash': '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    'monitor': '<rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>',
    'download': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    'sliders': '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
    'text': '<path d="M17 6.1H3"/><path d="M21 12.1H3"/><path d="M15.1 18H3"/>',
    'heading': '<path d="M6 12h12"/><path d="M6 20V4"/><path d="M18 20V4"/>',
    'quote': '<path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v1a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/><path d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v1a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/>',
    'code': '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
    'lightbulb': '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
    'list-bullet': '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><circle cx="4" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1" fill="currentColor" stroke="none"/>',
    'list-numbered': '<path d="M10 6h11"/><path d="M10 12h11"/><path d="M10 18h11"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6.5 15.5A1.5 1.5 0 1 0 4 17"/><path d="M4 18h2.5"/>',
    'minus': '<path d="M5 12h14"/>',
    'inbox-empty': '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    'clock': '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    'send': '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
    'x': '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  };
  const FILL = new Set(['more']);
  const svgWrap = (inner, fill) => `<svg viewBox="0 0 24 24" ${fill ? 'fill="currentColor" stroke="none"' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'}>${inner}</svg>`;
  const icon = (name, cls) => `<span class="ico ${cls || ''}">${svgWrap(ICONS[name] || ICONS.text, FILL.has(name))}</span>`;

  // ================= Time helpers =================
  const startOfDay = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
  function relTime(ts) {
    const diff = Date.now() - ts, m = 60000, h = 3600000, d = 86400000;
    if (diff < m) return 'just now';
    if (diff < h) return Math.floor(diff / m) + 'm ago';
    if (diff < d) return Math.floor(diff / h) + 'h ago';
    if (diff < 7 * d) return Math.floor(diff / d) + 'd ago';
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  // ================= Store =================
  const API = (location.origin.startsWith('http') ? location.origin : '') + '/api';

  const seedData = () => {
    const f1 = uid(), f2 = uid();
    return {
      spaces: [
        { id: f1, name: 'How to use Vellum', emoji: '👋', color: '#3b82f6', position: 1, createdAt: Date.now() },
        { id: f2, name: 'Unsorted', emoji: '', color: '#8a8a8a', position: 2, createdAt: Date.now() },
      ],
      documents: [
        doc(f1, 'Getting Started', [
          { type: 'h1', text: 'Getting Started' },
          { type: 'text', text: 'Think of Vellum as your personal notebook — bring together Docs, Tasks and your Calendar in one calm, offline-first place.' },
          { type: 'callout', text: 'Press “/” on a new line to insert blocks: headings, to-dos, quotes, code and more.' },
          { type: 'h2', text: 'The basics' },
          { type: 'todo', text: 'Create your first document', checked: true },
          { type: 'todo', text: 'Try the block menu with “/”', checked: false },
          { type: 'todo', text: 'Open Tasks and Calendar from the sidebar', checked: false },
          { type: 'quote', text: 'Design is not just what it looks like. Design is how it works.' },
        ]),
        doc(f1, 'Vellum Handbook', [
          { type: 'h1', text: 'Vellum Handbook' },
          { type: 'text', text: 'A quick overview of everything Vellum can do.' },
          { type: 'h2', text: 'Blocks & pages' },
          { type: 'bullet', text: 'Every paragraph is a block you can restyle' },
          { type: 'bullet', text: 'Headings build structure automatically' },
          { type: 'h2', text: 'Tasks & scheduling' },
          { type: 'text', text: 'Capture tasks in the Inbox, then schedule them for Today or Upcoming.' },
        ]),
        doc(f1, 'Tips & Shortcuts', [
          { type: 'h1', text: 'Tips & Shortcuts' },
          { type: 'text', text: 'Work faster with markdown-style shortcuts.' },
          { type: 'code', text: '# → Heading 1\n- → Bullet list\n[] → To-do\n> → Quote' },
          { type: 'callout', text: 'Everything is saved automatically and works offline.' },
        ]),
      ],
      tasks: [],
    };
    function doc(spaceId, title, content) {
      return { id: uid(), spaceId, parentId: null, title, emoji: '', cover: '', starred: false, isDaily: false, deleted: false, position: Date.now() + Math.random(), createdAt: Date.now(), updatedAt: Date.now() - Math.floor(Math.random() * 8.64e7), content: content.map((b) => ({ id: uid(), checked: false, ...b })) };
    }
  };

  const LocalStore = {
    key: 'vellum:data',
    load() { let d; try { d = JSON.parse(localStorage.getItem(this.key)); } catch { d = null; } if (!d) { d = seedData(); this.save(d); } d.tasks ||= []; return d; },
    save(d) { localStorage.setItem(this.key, JSON.stringify(d)); },
    async listSpaces() { return this.load().spaces; },
    async createSpace(p) { const d = this.load(); const s = { id: uid(), name: p.name || 'New Folder', emoji: p.emoji || '', color: '#8a8a8a', position: d.spaces.length + 1, createdAt: Date.now() }; d.spaces.push(s); this.save(d); return s; },
    async listDocs(spaceId) { return this.load().documents.filter((x) => !x.deleted && (!spaceId || x.spaceId === spaceId)); },
    async getDoc(id) { return this.load().documents.find((x) => x.id === id) || null; },
    async createDoc(p) { const d = this.load(); const doc = { id: uid(), spaceId: p.spaceId || null, parentId: null, title: p.title || 'Untitled', emoji: p.emoji || '', cover: '', content: (p.content || [{ id: uid(), type: 'text', text: '' }]), starred: false, isDaily: false, deleted: false, position: Date.now(), createdAt: Date.now(), updatedAt: Date.now() }; d.documents.push(doc); this.save(d); return doc; },
    async updateDoc(id, patch) { const d = this.load(); const doc = d.documents.find((x) => x.id === id); if (!doc) return null; Object.assign(doc, patch, { updatedAt: Date.now() }); this.save(d); return doc; },
    async deleteDoc(id) { const d = this.load(); const doc = d.documents.find((x) => x.id === id); if (doc) doc.deleted = true; this.save(d); },
    async search(q) { q = q.toLowerCase(); return this.load().documents.filter((x) => !x.deleted && (x.title.toLowerCase().includes(q) || JSON.stringify(x.content).toLowerCase().includes(q))); },
    async listTasks(filter) { const t = this.load().tasks; const today = startOfDay(Date.now()); let o = [...t]; if (filter === 'inbox') o = o.filter((x) => !x.done && x.due == null); else if (filter === 'today') o = o.filter((x) => !x.done && x.due != null && startOfDay(x.due) <= today); else if (filter === 'upcoming') o = o.filter((x) => !x.done && x.due != null && startOfDay(x.due) > today); return o.sort((a, b) => (a.done - b.done) || ((a.due ?? Infinity) - (b.due ?? Infinity)) || a.createdAt - b.createdAt); },
    async createTask(p) { const d = this.load(); const task = { id: uid(), title: p.title || 'New task', done: false, due: p.due ?? null, docId: null, createdAt: Date.now(), updatedAt: Date.now() }; d.tasks.push(task); this.save(d); return task; },
    async updateTask(id, patch) { const d = this.load(); const t = d.tasks.find((x) => x.id === id); if (!t) return null; Object.assign(t, patch, { updatedAt: Date.now() }); this.save(d); return t; },
    async deleteTask(id) { const d = this.load(); d.tasks = d.tasks.filter((x) => x.id !== id); this.save(d); },
  };

  const Remote = {
    async req(m, path, body) { const r = await fetch(API + path, { method: m, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); const j = await r.json(); return j.data; },
    async listSpaces() { return this.req('GET', '/spaces'); },
    async createSpace(p) { return this.req('POST', '/spaces', p); },
    async listDocs(spaceId) { return this.req('GET', '/documents' + (spaceId ? '?spaceId=' + spaceId : '')); },
    async getDoc(id) { return this.req('GET', '/documents/' + id); },
    async createDoc(p) { return this.req('POST', '/documents', p); },
    async updateDoc(id, p) { return this.req('PATCH', '/documents/' + id, p); },
    async deleteDoc(id) { return this.req('DELETE', '/documents/' + id); },
    async search(q) { return this.req('GET', '/search?q=' + encodeURIComponent(q)); },
    async listTasks(filter) { return this.req('GET', '/tasks?filter=' + (filter || 'all')); },
    async createTask(p) { return this.req('POST', '/tasks', p); },
    async updateTask(id, p) { return this.req('PATCH', '/tasks/' + id, p); },
    async deleteTask(id) { return this.req('DELETE', '/tasks/' + id); },
  };
  let Store = LocalStore;

  // ================= State =================
  const state = { view: 'docs', spaces: [], folderId: null, docId: null, doc: null, docsView: 'grid', taskTab: 'inbox', showPrevDays: false, backend: false };

  const BLOCKS = [
    { type: 'text', icon: 'text', t: 'Text', d: 'Plain paragraph', ph: "Type '/' for commands", kw: 'text paragraph body plain' },
    { type: 'h1', icon: 'heading', t: 'Heading 1', d: 'Big section heading', ph: 'Heading 1', kw: 'h1 heading title big' },
    { type: 'h2', icon: 'heading', t: 'Heading 2', d: 'Medium heading', ph: 'Heading 2', kw: 'h2 heading subtitle' },
    { type: 'h3', icon: 'heading', t: 'Heading 3', d: 'Small heading', ph: 'Heading 3', kw: 'h3 heading small' },
    { type: 'todo', icon: 'circle-check', t: 'To-do', d: 'Track tasks with a checkbox', ph: 'To-do', kw: 'todo task checkbox check tick' },
    { type: 'bullet', icon: 'list-bullet', t: 'Bulleted list', d: 'Simple bullet list', ph: 'List item', kw: 'bullet list unordered point' },
    { type: 'numbered', icon: 'list-numbered', t: 'Numbered list', d: 'Ordered list', ph: 'List item', kw: 'numbered ordered list number' },
    { type: 'quote', icon: 'quote', t: 'Quote', d: 'Capture a quotation', ph: 'Quote', kw: 'quote blockquote citation' },
    { type: 'callout', icon: 'lightbulb', t: 'Callout', d: 'Make text stand out', ph: 'Write a callout', kw: 'callout note info highlight tip' },
    { type: 'code', icon: 'code', t: 'Code', d: 'Monospace code block', ph: 'Code', kw: 'code snippet monospace' },
    { type: 'divider', icon: 'minus', t: 'Divider', d: 'Visual separator', ph: '', kw: 'divider separator line hr rule' },
  ];
  const blockDef = (t) => BLOCKS.find((b) => b.type === t) || BLOCKS[0];
  const matchesBlock = (b, f) => !f || (b.t + ' ' + b.kw).toLowerCase().includes(f);

  // ================= Toast =================
  const toastEl = el('div', 'toast'); document.body.appendChild(toastEl);
  const toast = (m) => { toastEl.textContent = m; toastEl.classList.add('show'); setTimeout(() => toastEl.classList.remove('show'), 1700); };

  // ================= Theme =================
  function initTheme() { const s = localStorage.getItem('vellum:theme') || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'); document.documentElement.dataset.theme = s; }
  function toggleTheme() { const n = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = n; localStorage.setItem('vellum:theme', n); renderTopbar(); }

  // ================= Sidebar =================
  async function renderSidebar() {
    state.spaces = await Store.listSpaces();
    const sb = $('#sidebar');
    const navItem = (ic, label, active, opts = {}) => {
      const it = el('div', 'sb-item' + (active ? ' active' : ''));
      const em = opts.emoji ? `<span class="emoji">${opts.emoji}</span>` : icon(ic);
      it.innerHTML = `${em}<span class="label">${escapeHtml(label)}</span>${opts.trail || ''}`;
      if (opts.onClick) it.onclick = opts.onClick;
      return it;
    };
    sb.innerHTML = '';

    const top = el('div', 'sb-top');
    const tog = el('button', 'tb-btn', icon('panel-left')); tog.style.cssText = 'background:none;border:none;cursor:pointer;color:inherit;padding:4px;border-radius:6px';
    tog.onclick = () => $('#sidebar').classList.toggle('collapsed');
    top.appendChild(tog);
    sb.appendChild(top);

    const scroll = el('div', 'sb-scroll');

    const sw = el('div', 'space-switch', `<span class="space-avatar"></span><span class="name">My Space</span>${icon('chevron-down')}`);
    sw.onclick = () => { state.folderId = null; go('docs'); };
    scroll.appendChild(sw);

    const nd = navItem('file-pen', 'New Document', false, { onClick: newDocument });
    scroll.appendChild(nd);
    scroll.appendChild(el('div', 'sb-gap'));

    scroll.appendChild(navItem('files', 'All Docs', state.view === 'docs' && state.folderId == null, { onClick: () => { state.folderId = null; go('docs'); } }));
    scroll.appendChild(navItem('circle-check', 'Tasks', state.view === 'tasks', { onClick: () => go('tasks') }));
    scroll.appendChild(navItem('calendar', 'Calendar', state.view === 'calendar', { onClick: () => go('calendar') }));
    scroll.appendChild(el('div', 'sb-gap'));
    scroll.appendChild(navItem('cloud', 'Imagine', false, { onClick: () => toast('Imagine — AI generation is coming soon') }));
    scroll.appendChild(navItem('users', 'Shared with Me', false, { onClick: () => toast('Sharing is coming soon') }));

    scroll.appendChild(el('div', 'sb-label', 'Starred'));
    scroll.appendChild(el('div', 'sb-placeholder', 'Star Docs to keep them close'));

    const folderLabel = el('div', 'sb-label', `Folders<span class="spacer"></span><span class="add">${icon('plus')}</span>`);
    folderLabel.querySelector('.add').onclick = async (e) => { e.stopPropagation(); const s = await Store.createSpace({ name: 'New Folder' }); state.folderId = s.id; go('docs'); };
    scroll.appendChild(folderLabel);
    for (const f of state.spaces) {
      const active = state.view === 'docs' && state.folderId === f.id;
      const it = navItem('folder', f.name, active, {
        emoji: f.emoji || null,
        trail: `<span class="trail" title="New doc in folder">${icon('plus')}</span>`,
        onClick: () => { state.folderId = f.id; go('docs'); },
      });
      it.querySelector('.trail').onclick = async (e) => { e.stopPropagation(); const d = await Store.createDoc({ spaceId: f.id, title: 'Untitled' }); openDoc(d.id); };
      scroll.appendChild(it);
    }

    scroll.appendChild(el('div', 'sb-label', 'Tags'));
    scroll.appendChild(el('div', 'sb-placeholder', 'Pin your key tags for quick access'));

    sb.appendChild(scroll);

    const footer = el('div', 'sb-footer');
    ['monitor', 'download', 'users'].forEach((n) => { const b = el('button', 'fbtn', icon(n)); b.onclick = () => toast('Coming soon'); footer.appendChild(b); });
    sb.appendChild(footer);
  }

  // ================= Topbar =================
  function renderTopbar() {
    const tb = $('#topbar');
    tb.innerHTML = '';
    const search = el('div', 'search-open', `${icon('search')}<input id="search-input" placeholder="Open" />`);
    tb.appendChild(el('div', '', '')); // left spacer to balance
    tb.firstChild.style.flex = '0 0 40px';
    tb.appendChild(search);
    const right = el('div'); right.style.cssText = 'display:flex;align-items:center;gap:2px;flex:0 0 auto';
    const themeIcon = document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon';
    [['bell', () => toast('No new notifications')], [themeIcon, toggleTheme], ['help', () => toast('Vellum — open source. See the README.')]].forEach(([n, fn]) => {
      const b = el('button', 'tb-btn', icon(n)); b.onclick = fn; right.appendChild(b);
    });
    tb.appendChild(right);
    const si = $('#search-input');
    si.oninput = (e) => { const v = e.target.value; if (v.trim()) runSearch(v); else if (state.view === 'search') go('docs'); };
  }
  const runSearch = debounce(async (q) => {
    const res = await Store.search(q);
    state.view = 'search';
    renderSidebar();
    const c = $('#content'); c.innerHTML = '';
    c.appendChild(viewHead(icon('search'), `Results for “${escapeHtml(q)}”`, ''));
    const wrap = el('div', 'docs-wrap');
    if (!res.length) wrap.appendChild(el('div', 'empty-state', `<div class="e-ico">${icon('search')}</div><div class="e-text">No documents found</div>`));
    else { const grid = el('div', 'card-grid'); res.forEach((d) => grid.appendChild(docCard(d))); wrap.appendChild(grid); }
    c.appendChild(wrap);
  }, 220);

  // ================= Router =================
  function go(view) { state.view = view; state.docId = null; state.doc = null; renderSidebar(); renderView(); }
  async function newDocument() { const sid = state.folderId || (state.spaces[0] && state.spaces[0].id); const d = await Store.createDoc({ spaceId: sid, title: 'Untitled' }); openDoc(d.id); }
  async function openDoc(id) { state.doc = await Store.getDoc(id); state.docId = id; if (state.doc) state.folderId = state.doc.spaceId; state.view = 'doc'; renderSidebar(); renderView(); }

  function renderView() {
    const c = $('#content'); c.innerHTML = '';
    if (state.view === 'doc' && state.doc) return renderDoc(c);
    if (state.view === 'tasks') return renderTasks(c);
    if (state.view === 'calendar') return renderCalendar(c);
    return renderDocs(c);
  }

  function viewHead(addOrIcon, title, actionsHtml) {
    const h = el('div', 'view-head');
    if (typeof addOrIcon === 'function') { const b = el('button', 'addbtn', icon('plus')); b.onclick = addOrIcon; h.appendChild(b); }
    else if (addOrIcon) { const s = el('div'); s.innerHTML = `<div class="addbtn" style="border:none">${addOrIcon}</div>`; h.appendChild(s.firstChild); }
    h.appendChild(el('h1', '', title));
    const a = el('div', 'actions'); if (actionsHtml) a.innerHTML = actionsHtml; h.appendChild(a);
    return h;
  }

  // ================= All Docs =================
  async function renderDocs(c) {
    const folder = state.spaces.find((s) => s.id === state.folderId);
    const title = folder ? `${folder.emoji ? folder.emoji + ' ' : ''}${escapeHtml(folder.name)}` : 'All Docs';
    const docs = await Store.listDocs(state.folderId);

    const head = viewHead(newDocument, title, '');
    const actions = head.querySelector('.actions');
    const seg = el('div', 'seg');
    const gridBtn = el('button', 'hbtn' + (state.docsView === 'grid' ? ' active' : ''), icon('grid'));
    const listBtn = el('button', 'hbtn' + (state.docsView === 'list' ? ' active' : ''), icon('list'));
    gridBtn.onclick = () => { state.docsView = 'grid'; renderView(); };
    listBtn.onclick = () => { state.docsView = 'list'; renderView(); };
    seg.append(gridBtn, listBtn);
    const more = el('button', 'hbtn', icon('more')); more.onclick = () => toast('More options');
    actions.append(seg, more);
    c.appendChild(head);

    const wrap = el('div', 'docs-wrap');
    if (state.docsView === 'list') {
      const list = el('div', 'doc-list');
      const nc = el('div', 'doc-row'); nc.innerHTML = `${icon('plus')}<span class="r-title" style="color:var(--text-3)">New document</span>`; nc.onclick = newDocument; list.appendChild(nc);
      docs.forEach((d) => {
        const row = el('div', 'doc-row');
        row.innerHTML = `${d.emoji ? `<span style="font-size:16px">${d.emoji}</span>` : icon('files')}<span class="r-title">${escapeHtml(d.title || 'Untitled')}</span><span class="r-meta">${(state.spaces.find((s) => s.id === d.spaceId) || {}).name || ''} · ${relTime(d.updatedAt)}</span>`;
        row.onclick = () => openDoc(d.id);
        list.appendChild(row);
      });
      wrap.appendChild(list);
    } else {
      const grid = el('div', 'card-grid');
      const nc = el('div', 'doc-card new', `${icon('plus')}<div>New document</div>`); nc.onclick = newDocument; grid.appendChild(nc);
      docs.forEach((d) => grid.appendChild(docCard(d)));
      wrap.appendChild(grid);
    }
    c.appendChild(wrap);
  }

  function docCard(d) {
    const folder = state.spaces.find((s) => s.id === d.spaceId);
    const card = el('div', 'doc-card');
    const head = el('div', 'card-head');
    head.innerHTML = `<div class="c-title">${d.emoji ? `<span>${d.emoji}</span>` : icon('files')}${escapeHtml(d.title || 'Untitled')}</div>
      <div class="c-meta">${icon('folder')}${escapeHtml(folder ? folder.name : 'Unsorted')} · Updated ${relTime(d.updatedAt)}</div>`;
    card.appendChild(head);
    const prev = el('div', 'c-preview');
    prev.innerHTML = (d.content || []).slice(0, 12).map((b) => {
      const txt = escapeHtml((b.text || '').slice(0, 90));
      if (b.type === 'h1' || b.type === 'h2') return `<div class="p-h">${txt}</div>`;
      if (b.type === 'todo') return `<div class="p-todo"><span class="p-box"></span>${txt}</div>`;
      if (b.type === 'divider') return '<div class="p-line">———</div>';
      if (b.type === 'bullet') return `<div class="p-line">• ${txt}</div>`;
      if (!txt) return '';
      return `<div class="p-line">${txt}</div>`;
    }).join('');
    card.appendChild(prev);
    card.onclick = () => openDoc(d.id);
    return card;
  }

  // ================= Tasks =================
  async function renderTasks(c) {
    const head = viewHead(() => focusAddTask(), 'Tasks', `<button class="hbtn">${icon('sliders')}</button>`);
    c.appendChild(head);

    const tabs = el('div', 'tabs');
    [['inbox', 'inbox', 'Inbox'], ['today', 'sun', 'Today'], ['upcoming', 'calendar-days', 'Upcoming'], ['all', 'clipboard-list', 'All Tasks']].forEach(([id, ic, label]) => {
      const t = el('button', 'tab' + (state.taskTab === id ? ' active' : ''), `${icon(ic)}${label}`);
      t.onclick = () => { state.taskTab = id; renderView(); };
      tabs.appendChild(t);
    });
    c.appendChild(tabs);

    const body = el('div', 'task-body');
    const tasks = await Store.listTasks(state.taskTab);
    if (!tasks.length) {
      const empty = el('div', 'empty-state', `<div class="e-ico">${icon('inbox-empty')}</div><div class="e-text">Well done, all your tasks are organized!</div>`);
      const add = el('button', 'btn', 'Add Task'); add.onclick = () => addTaskInline(body, true); empty.appendChild(add);
      body.appendChild(empty);
    } else {
      tasks.forEach((t) => body.appendChild(taskRow(t)));
      body.appendChild(addTaskRowEl());
    }
    c.appendChild(body);
  }

  function taskRow(t) {
    const row = el('div', 'task' + (t.done ? ' done' : ''));
    const chk = el('div', 'check' + (t.done ? ' done' : ''), t.done ? icon('check') : '');
    chk.onclick = async () => { await Store.updateTask(t.id, { done: !t.done }); renderView(); };
    const title = el('div', 't-title'); title.contentEditable = 'true'; title.setAttribute('spellcheck', 'false'); title.textContent = t.title;
    title.onblur = async () => { const v = title.textContent.trim(); if (v && v !== t.title) await Store.updateTask(t.id, { title: v }); };
    title.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); title.blur(); } };
    row.append(chk, title);
    if (t.due != null) {
      const today = startOfDay(Date.now()), due = startOfDay(t.due);
      const label = due === today ? 'Today' : due === today + 86400000 ? 'Tomorrow' : new Date(t.due).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      row.appendChild(el('span', 'due-chip' + (due <= today ? ' today' : ''), label));
    }
    const del = el('button', 'task-del', icon('trash')); del.onclick = async () => { await Store.deleteTask(t.id); renderView(); };
    row.appendChild(del);
    return row;
  }

  function dueForTab() { const today = startOfDay(Date.now()); if (state.taskTab === 'today') return today; if (state.taskTab === 'upcoming') return today + 86400000; return null; }
  function addTaskRowEl() {
    const row = el('div', 'add-task-row', `${icon('plus')}<input placeholder="Add a task…" />`);
    const input = row.querySelector('input');
    input.onkeydown = async (e) => { if (e.key === 'Enter' && input.value.trim()) { await Store.createTask({ title: input.value.trim(), due: dueForTab() }); input.value = ''; renderView(); setTimeout(focusAddTask, 30); } };
    return row;
  }
  function focusAddTask() { const i = $('.add-task-row input'); if (i) i.focus(); else { const b = $('.task-body'); if (b) { const r = addTaskRowEl(); b.appendChild(r); r.querySelector('input').focus(); } } }
  function addTaskInline(body, replaceEmpty) { if (replaceEmpty) { const e = body.querySelector('.empty-state'); if (e) e.remove(); } const r = addTaskRowEl(); body.appendChild(r); r.querySelector('input').focus(); }

  // ================= Calendar =================
  async function renderCalendar(c) {
    const head = viewHead(() => go('tasks'), 'Calendar', `<button class="hbtn">${icon('more')}</button>`);
    c.appendChild(head);
    const body = el('div', 'cal-body');
    const link = el('div', 'cal-link', `${icon(state.showPrevDays ? 'chevron-down' : 'chevron-up')}${state.showPrevDays ? 'Hide Previous Days' : 'Show Previous Days'}`);
    link.onclick = () => { state.showPrevDays = !state.showPrevDays; renderView(); };
    body.appendChild(link);

    const allTasks = await Store.listTasks('all');
    const byDay = {};
    allTasks.forEach((t) => { if (t.due != null) { const k = startOfDay(t.due); (byDay[k] ||= []).push(t); } });

    const today = startOfDay(Date.now());
    const start = state.showPrevDays ? -7 : 0;
    for (let i = start; i <= 14; i++) {
      const day = today + i * 86400000;
      const card = el('div', 'day-card' + (i === 0 ? ' today' : ''));
      const num = new Date(day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      const dow = new Date(day).toLocaleDateString(undefined, { weekday: 'long' });
      const special = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : i === -1 ? 'Yesterday' : null;
      const relLine = special ? `<span class="d-rel">${special}</span><span class="d-dow">${dow}</span>` : `<span class="d-rel">${dow}</span>`;
      card.innerHTML = `<div class="d-head"><span class="d-num">${num}</span>${relLine}</div>`;
      const dtasks = el('div', 'd-tasks');
      (byDay[day] || []).forEach((t) => dtasks.appendChild(taskRow(t)));
      card.appendChild(dtasks);
      const add = el('div', 'add-here', `${icon('plus')}<input placeholder="Add a task…" />`);
      const inp = add.querySelector('input');
      inp.onclick = (e) => e.stopPropagation();
      inp.onkeydown = async (e) => { if (e.key === 'Enter' && inp.value.trim()) { await Store.createTask({ title: inp.value.trim(), due: day }); renderView(); } };
      card.appendChild(add);
      body.appendChild(card);
    }
    c.appendChild(body);
  }

  // ================= Document editor =================
  const saveDoc = debounce(async () => { if (!state.doc) return; await Store.updateDoc(state.doc.id, { title: state.doc.title, emoji: state.doc.emoji, content: state.doc.content }); }, 500);

  function renderDoc(c) {
    const doc = state.doc;
    const folder = state.spaces.find((s) => s.id === doc.spaceId);
    const wrap = el('div', 'doc');

    const iconRow = el('div', 'doc-icon-row');
    if (doc.emoji) {
      const emo = el('div', 'doc-emoji', doc.emoji);
      emo.onclick = (e) => openEmojiPicker(e, (em) => { doc.emoji = em; saveDoc(); renderView(); renderSidebar(); });
      iconRow.appendChild(emo);
    } else {
      const add = el('button', 'add-icon-btn', `${icon('lightbulb')}Add icon`);
      add.onclick = (e) => openEmojiPicker(e, (em) => { doc.emoji = em; saveDoc(); renderView(); renderSidebar(); });
      iconRow.appendChild(add);
    }
    wrap.appendChild(iconRow);

    const title = el('div', 'doc-title'); title.contentEditable = 'true'; title.setAttribute('spellcheck', 'false');
    title.textContent = doc.title === 'Untitled' ? '' : doc.title;
    title.oninput = () => { doc.title = title.textContent.trim() || 'Untitled'; saveDoc(); debounce(renderSidebar, 500)(); };
    title.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); focusBlock(0, true); } };
    wrap.appendChild(title);
    wrap.appendChild(el('div', 'doc-meta', `${icon('folder')}${escapeHtml(folder ? folder.name : 'Unsorted')} · ${icon('clock')}Edited ${relTime(doc.updatedAt)}`));

    const blocks = el('div', 'blocks'); blocks.id = 'blocks';
    if (!doc.content.length) doc.content.push({ id: uid(), type: 'text', text: '' });
    doc.content.forEach((b, i) => blocks.appendChild(renderBlock(b, i)));
    wrap.appendChild(blocks);
    c.appendChild(wrap);
    setTimeout(() => title.focus(), 0);
  }

  function renderBlock(b, index) {
    const def = blockDef(b.type);
    const node = el('div', 'block'); node.dataset.type = b.type; node.dataset.id = b.id; node.dataset.checked = !!b.checked;
    node.appendChild(el('div', 'block-handle', '⋮⋮'));
    if (b.type === 'divider') { node.appendChild(el('hr')); return node; }
    if (b.type === 'bullet') node.appendChild(el('div', 'bullet-mark', '•'));
    if (b.type === 'numbered') node.appendChild(el('div', 'bullet-mark', (index + 1) + '.'));
    if (b.type === 'todo') { const chk = el('div', 'todo-check' + (b.checked ? ' checked' : ''), b.checked ? icon('check') : ''); chk.onclick = () => { b.checked = !b.checked; chk.classList.toggle('checked'); chk.innerHTML = b.checked ? icon('check') : ''; node.dataset.checked = b.checked; saveDoc(); }; node.appendChild(chk); }
    const content = el('div', 'block-content'); content.contentEditable = 'true'; content.setAttribute('spellcheck', 'false');
    content.dataset.ph = index === 0 && b.type === 'text' ? "Type '/' for commands" : def.ph;
    content.textContent = b.text || '';
    content.oninput = () => {
      b.text = content.textContent;
      if (content.textContent.startsWith('/')) { if (!slashState || slashState.b !== b) openSlash(b, content, node); slashState && slashState.draw(content.textContent.slice(1).toLowerCase()); return; }
      else if (slashState && slashState.b === b) closeSlash();
      handleMarkdownShortcut(b, content, node); saveDoc();
    };
    content.onkeydown = (e) => onBlockKey(e, b, content, node);
    node.appendChild(content);
    return node;
  }

  function handleMarkdownShortcut(b, content, node) {
    const txt = content.textContent;
    const map = { '# ': 'h1', '## ': 'h2', '### ': 'h3', '- ': 'bullet', '* ': 'bullet', '[] ': 'todo', '[ ] ': 'todo', '> ': 'quote', '```': 'code', '1. ': 'numbered' };
    for (const [k, type] of Object.entries(map)) {
      if (txt === k) { b.type = type; b.text = ''; content.textContent = ''; const i = state.doc.content.indexOf(b); const nn = renderBlock(b, i); node.replaceWith(nn); focusEl(nn.querySelector('.block-content')); saveDoc(); return; }
    }
  }

  function onBlockKey(e, b, content, node) {
    const idx = state.doc.content.indexOf(b);
    if (slashState && slashState.b === b) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const caret = getCaret(content); const before = content.textContent.slice(0, caret), after = content.textContent.slice(caret);
      b.text = before; content.textContent = before;
      if (['bullet', 'numbered', 'todo'].includes(b.type) && before === '') { b.type = 'text'; node.replaceWith(renderBlock(b, idx)); focusBlock(idx); saveDoc(); return; }
      const carry = ['bullet', 'numbered', 'todo'].includes(b.type) ? b.type : 'text';
      state.doc.content.splice(idx + 1, 0, { id: uid(), type: carry, text: after, checked: false });
      rerenderBlocks(); focusBlock(idx + 1, true); saveDoc(); return;
    }
    if (e.key === 'Backspace' && getCaret(content) === 0 && content.textContent === '') {
      if (b.type !== 'text') { e.preventDefault(); b.type = 'text'; node.replaceWith(renderBlock(b, idx)); focusBlock(idx); saveDoc(); return; }
      if (idx > 0) { e.preventDefault(); const prev = state.doc.content[idx - 1]; const at = prev.text.length; prev.text += b.text; state.doc.content.splice(idx, 1); rerenderBlocks(); focusBlock(idx - 1); setCaret($('#blocks').children[idx - 1].querySelector('.block-content'), at); saveDoc(); }
      return;
    }
    if (e.key === 'ArrowUp' && idx > 0 && getCaret(content) === 0) { e.preventDefault(); focusBlock(idx - 1, true); }
    if (e.key === 'ArrowDown' && idx < state.doc.content.length - 1 && getCaret(content) === content.textContent.length) { e.preventDefault(); focusBlock(idx + 1); }
  }

  function rerenderBlocks() { const blocks = $('#blocks'); blocks.innerHTML = ''; state.doc.content.forEach((b, i) => blocks.appendChild(renderBlock(b, i))); }
  function focusBlock(i, toEnd) { const n = $('#blocks').children[i]; if (!n) return; const c = n.querySelector('.block-content'); if (c) { c.focus(); if (toEnd) setCaret(c, c.textContent.length); } }
  function focusEl(c) { if (c) c.focus(); }

  // ---- Slash menu ----
  let slashState = null;
  function openSlash(b, content, node) {
    closeSlash();
    const menu = el('div', 'slash-menu'); const r = content.getBoundingClientRect();
    menu.style.left = r.left + 'px'; menu.style.top = (r.bottom + 6) + 'px';
    let sel = 0; const items = BLOCKS.slice();
    function draw(filter = '') {
      const f = items.filter((x) => matchesBlock(x, filter)); menu.innerHTML = '<div class="slash-group">Basic blocks</div>';
      f.forEach((x, i) => { const it = el('div', 'slash-item' + (i === sel ? ' sel' : '')); it.innerHTML = `<div class="slash-ico">${icon(x.icon)}</div><div><div class="t">${x.t}</div><div class="d">${x.d}</div></div>`; it.onmousedown = (e) => { e.preventDefault(); choose(x); }; menu.appendChild(it); });
      slashState.filtered = f; if (sel >= f.length) sel = 0;
    }
    function choose(x) { b.type = x.type; b.text = ''; content.textContent = ''; const i = state.doc.content.indexOf(b); if (x.type === 'divider') state.doc.content.splice(i + 1, 0, { id: uid(), type: 'text', text: '' }); rerenderBlocks(); closeSlash(); focusBlock(x.type === 'divider' ? i + 1 : i); saveDoc(); }
    document.body.appendChild(menu);
    slashState = { menu, b, content, draw, choose, _f: items, get filtered() { return this._f; }, set filtered(v) { this._f = v; } };
    draw();
    const onKey = (e) => {
      if (!slashState) return; const f = slashState.filtered;
      if (e.key === 'Escape') closeSlash();
      else if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % f.length; draw(content.textContent.slice(1).toLowerCase()); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + f.length) % f.length; draw(content.textContent.slice(1).toLowerCase()); }
      else if (e.key === 'Enter') { e.preventDefault(); if (f[sel]) choose(f[sel]); }
    };
    slashState.onKey = onKey; content.addEventListener('keydown', onKey);
  }
  function closeSlash() { if (!slashState) return; slashState.menu.remove(); slashState.content.removeEventListener('keydown', slashState.onKey); slashState = null; }
  document.addEventListener('click', (e) => { if (slashState && !slashState.menu.contains(e.target)) closeSlash(); });

  // ---- caret ----
  function getCaret(node) { const s = getSelection(); if (!s.rangeCount) return 0; const r = s.getRangeAt(0).cloneRange(); r.selectNodeContents(node); r.setEnd(s.getRangeAt(0).endContainer, s.getRangeAt(0).endOffset); return r.toString().length; }
  function setCaret(node, pos) { const r = document.createRange(), s = getSelection(); let cur = 0, done = false; (function walk(n) { if (done) return; if (n.nodeType === 3) { if (cur + n.length >= pos) { r.setStart(n, pos - cur); done = true; } else cur += n.length; } else n.childNodes.forEach(walk); })(node); if (!done) { r.selectNodeContents(node); r.collapse(false); } r.collapse(true); s.removeAllRanges(); s.addRange(r); }

  // ---- emoji picker ----
  const EMOJIS = '📄📝📔📕📗📘📙📓📒✏️💡🔥⭐️🌟✨🎯🚀🧠💼🏡🎨🎵🍎🌈🌍🔬🧪🕹️🎮🛠️⚙️📌📎🔖🏷️📊📈🗂️📁💎🪄🧭🗺️🎁🍀🌱📅✅💬📮🔭🧩'.match(/\p{Emoji}(️)?/gu) || [];
  function openEmojiPicker(e, cb) {
    $('.emoji-pop')?.remove();
    const pop = el('div', 'emoji-pop');
    EMOJIS.forEach((em) => { const s = el('span', null, em); s.onclick = () => { cb(em); pop.remove(); }; pop.appendChild(s); });
    pop.style.left = Math.min(e.clientX, innerWidth - 310) + 'px'; pop.style.top = (e.clientY + 10) + 'px';
    document.body.appendChild(pop);
    setTimeout(() => document.addEventListener('click', function h(ev) { if (!pop.contains(ev.target)) { pop.remove(); document.removeEventListener('click', h); } }), 0);
  }

  // ================= AI Assistant panel =================
  const assistant = { open: false, history: [], busy: false, el: null };

  function toggleAssistant() { assistant.open ? closeAssistant() : openAssistant(); }
  function closeAssistant() { assistant.open = false; assistant.el?.remove(); assistant.el = null; $('#assistant').classList.remove('hidden'); }

  function openAssistant() {
    assistant.open = true;
    $('#assistant').classList.add('hidden');
    const panel = el('div', 'ap');
    panel.innerHTML = `
      <div class="ap-head">
        <span class="orb"></span>
        <div style="flex:1"><div class="t">Assistant</div><div class="sub">${state.backend ? 'Powered by Claude' : 'Needs the Vellum server'}</div></div>
        <button class="x" title="Close">${icon('x')}</button>
      </div>
      <div class="ap-msgs" id="ap-msgs"></div>
      <div class="ap-input">
        <textarea id="ap-text" rows="1" placeholder="Ask anything, or ask about this doc…"></textarea>
        <button class="ap-send" id="ap-send" title="Send">${icon('send')}</button>
      </div>`;
    $('.main').appendChild(panel);
    assistant.el = panel;
    panel.querySelector('.x').onclick = closeAssistant;
    const text = panel.querySelector('#ap-text');
    const send = panel.querySelector('#ap-send');
    text.oninput = () => { text.style.height = 'auto'; text.style.height = Math.min(text.scrollHeight, 120) + 'px'; };
    text.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); } };
    send.onclick = doSend;
    drawAssistant();
    setTimeout(() => text.focus(), 30);
  }

  function drawAssistant() {
    const box = $('#ap-msgs'); if (!box) return;
    box.innerHTML = '';
    if (!assistant.history.length) {
      const suggestions = state.view === 'doc'
        ? ['Summarise this document', 'Improve the writing', 'Suggest 3 next steps']
        : ['Draft a project brief', 'Give me a daily standup template', 'Brainstorm blog post ideas'];
      const empty = el('div', 'ap-empty');
      empty.innerHTML = `<div class="orb-lg"></div><div class="h">How can I help?</div><div style="font-size:13px">Ask me to write, edit, summarise or brainstorm.</div>`;
      const chips = el('div', 'ap-chips'); chips.className = 'chips';
      suggestions.forEach((s) => { const c = el('button', 'ap-chip', escapeHtml(s)); c.onclick = () => { $('#ap-text').value = s; doSend(); }; chips.appendChild(c); });
      empty.appendChild(chips);
      box.appendChild(empty);
    } else {
      assistant.history.forEach((m) => box.appendChild(el('div', 'chat-msg ' + m.role + (m.error ? ' error' : ''), escapeHtml(m.content))));
    }
    if (assistant.busy) { const t = el('div', 'ap-typing', '<span></span><span></span><span></span>'); box.appendChild(t); }
    box.scrollTop = box.scrollHeight;
  }

  async function doSend() {
    if (assistant.busy) return;
    const text = $('#ap-text');
    const prompt = text.value.trim();
    if (!prompt) return;
    if (!state.backend) {
      assistant.history.push({ role: 'user', content: prompt });
      assistant.history.push({ role: 'assistant', error: true, content: 'The AI assistant needs the Vellum server running (node / python / docker) with an ANTHROPIC_API_KEY set. It’s unavailable in offline mode.' });
      text.value = ''; text.style.height = 'auto'; drawAssistant(); return;
    }
    assistant.history.push({ role: 'user', content: prompt });
    text.value = ''; text.style.height = 'auto';
    assistant.busy = true; drawAssistant();
    try {
      const payload = { prompt, history: assistant.history.slice(0, -1).map((m) => ({ role: m.role, content: m.content })) };
      if (state.view === 'doc' && state.doc) payload.doc = { title: state.doc.title, content: state.doc.content };
      const r = await fetch(API + '/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const j = await r.json();
      const data = j.data || {};
      assistant.history.push({ role: 'assistant', content: data.reply || '(no response)', error: !!data.error });
    } catch (e) {
      assistant.history.push({ role: 'assistant', content: 'Could not reach the assistant: ' + e.message, error: true });
    }
    assistant.busy = false; drawAssistant();
  }

  // ================= Boot =================
  async function boot() {
    initTheme();
    try { const r = await fetch(API + '/health', { signal: AbortSignal.timeout(1200) }); if (r.ok) { Store = Remote; state.backend = true; } } catch { Store = LocalStore; }
    $('#assistant').onclick = toggleAssistant;
    renderTopbar();
    await renderSidebar();
    renderView();
  }
  document.addEventListener('DOMContentLoaded', boot);
})();
