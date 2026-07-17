/* Vellum web client — vanilla JS block editor.
   Talks to the REST API when available; falls back to localStorage otherwise. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
  const uid = () => Math.random().toString(36).slice(2, 11);
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  // ---------------- Store: remote (REST) with local fallback ----------------
  const API = (location.origin.startsWith('http') ? location.origin : '') + '/api';

  const LocalStore = {
    key: 'vellum:data',
    load() {
      let d = null;
      try { d = JSON.parse(localStorage.getItem(this.key)); } catch { /* ignore */ }
      if (!d) { d = this.seed(); this.save(d); }
      return d;
    },
    save(d) { localStorage.setItem(this.key, JSON.stringify(d)); },
    seed() {
      const sp = uid(), sw = uid(), doc = uid();
      return {
        spaces: [
          { id: sp, name: 'Personal', emoji: '🏡', color: '#4a6cf7', position: 1, createdAt: Date.now() },
          { id: sw, name: 'Work', emoji: '💼', color: '#f4a340', position: 2, createdAt: Date.now() },
        ],
        documents: [{
          id: doc, spaceId: sp, parentId: null, title: 'Welcome to Vellum', emoji: '👋',
          cover: '', starred: false, isDaily: false, deleted: false, position: 1,
          createdAt: Date.now(), updatedAt: Date.now(),
          content: [
            { id: uid(), type: 'h1', text: 'Welcome to Vellum' },
            { id: uid(), type: 'text', text: 'Vellum is a beautiful, open-source document workspace — an homage to Craft.' },
            { id: uid(), type: 'callout', text: 'Type “/” on a new line to insert blocks: headings, to-dos, quotes, code, and more.', color: 'blue' },
            { id: uid(), type: 'h2', text: 'Try it out' },
            { id: uid(), type: 'todo', text: 'Create your first document', checked: true },
            { id: uid(), type: 'todo', text: 'Press “/” to open the block menu', checked: false },
            { id: uid(), type: 'todo', text: 'Toggle dark mode from the sidebar', checked: false },
            { id: uid(), type: 'quote', text: 'Design is not just what it looks like. Design is how it works.' },
          ],
        }],
      };
    },
    async listSpaces() { return this.load().spaces; },
    async createSpace(p) { const d = this.load(); const s = { id: uid(), name: p.name || 'New Space', emoji: p.emoji || '📁', color: p.color || '#4a6cf7', position: d.spaces.length + 1, createdAt: Date.now() }; d.spaces.push(s); this.save(d); return s; },
    async updateSpace(id, patch) { const d = this.load(); const s = d.spaces.find(x => x.id === id); Object.assign(s, patch); this.save(d); return s; },
    async deleteSpace(id) { const d = this.load(); d.spaces = d.spaces.filter(x => x.id !== id); d.documents = d.documents.filter(x => x.spaceId !== id); this.save(d); },
    async listDocs(spaceId) { return this.load().documents.filter(x => x.spaceId === spaceId && !x.deleted); },
    async getDoc(id) { return this.load().documents.find(x => x.id === id) || null; },
    async createDoc(p) { const d = this.load(); const doc = { id: uid(), spaceId: p.spaceId || null, parentId: p.parentId || null, title: p.title || 'Untitled', emoji: p.emoji || '', cover: '', content: p.content || [{ id: uid(), type: 'text', text: '' }], starred: false, isDaily: false, deleted: false, position: d.documents.length + 1, createdAt: Date.now(), updatedAt: Date.now() }; d.documents.push(doc); this.save(d); return doc; },
    async updateDoc(id, patch) { const d = this.load(); const doc = d.documents.find(x => x.id === id); if (!doc) return null; Object.assign(doc, patch, { updatedAt: Date.now() }); this.save(d); return doc; },
    async deleteDoc(id) { const d = this.load(); const doc = d.documents.find(x => x.id === id); if (doc) doc.deleted = true; this.save(d); },
    async search(q) { q = q.toLowerCase(); return this.load().documents.filter(x => !x.deleted && (x.title.toLowerCase().includes(q) || JSON.stringify(x.content).toLowerCase().includes(q))); },
  };

  const Remote = {
    async req(m, path, body) {
      const r = await fetch(API + path, { method: m, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      const j = await r.json(); return j.data;
    },
    async listSpaces() { return this.req('GET', '/spaces'); },
    async createSpace(p) { return this.req('POST', '/spaces', p); },
    async updateSpace(id, p) { return this.req('PATCH', '/spaces/' + id, p); },
    async deleteSpace(id) { return this.req('DELETE', '/spaces/' + id); },
    async listDocs(spaceId) { return this.req('GET', '/documents?spaceId=' + spaceId); },
    async getDoc(id) { return this.req('GET', '/documents/' + id); },
    async createDoc(p) { return this.req('POST', '/documents', p); },
    async updateDoc(id, p) { return this.req('PATCH', '/documents/' + id, p); },
    async deleteDoc(id) { return this.req('DELETE', '/documents/' + id); },
    async search(q) { return this.req('GET', '/search?q=' + encodeURIComponent(q)); },
  };

  let Store = LocalStore;

  // ---------------- App state ----------------
  const state = { spaces: [], spaceId: null, docId: null, doc: null };

  // ---------------- Block definitions ----------------
  const BLOCKS = [
    { type: 'text', ico: '¶', t: 'Text', d: 'Plain paragraph', ph: "Type '/' for commands", kw: 'text paragraph body plain' },
    { type: 'h1', ico: 'H₁', t: 'Heading 1', d: 'Big section heading', ph: 'Heading 1', kw: 'h1 heading title big' },
    { type: 'h2', ico: 'H₂', t: 'Heading 2', d: 'Medium heading', ph: 'Heading 2', kw: 'h2 heading subtitle' },
    { type: 'h3', ico: 'H₃', t: 'Heading 3', d: 'Small heading', ph: 'Heading 3', kw: 'h3 heading small' },
    { type: 'todo', ico: '☑', t: 'To-do', d: 'Track tasks with a checkbox', ph: 'To-do', kw: 'todo task checkbox check tick list' },
    { type: 'bullet', ico: '•', t: 'Bulleted list', d: 'Simple bullet list', ph: 'List item', kw: 'bullet list unordered ul point' },
    { type: 'numbered', ico: '1.', t: 'Numbered list', d: 'Ordered list', ph: 'List item', kw: 'numbered ordered list ol number' },
    { type: 'quote', ico: '❝', t: 'Quote', d: 'Capture a quotation', ph: 'Quote', kw: 'quote blockquote citation' },
    { type: 'callout', ico: '💡', t: 'Callout', d: 'Make text stand out', ph: 'Callout', kw: 'callout note info highlight tip' },
    { type: 'code', ico: '</>', t: 'Code', d: 'Monospace code block', ph: 'Code', kw: 'code snippet monospace pre' },
    { type: 'divider', ico: '—', t: 'Divider', d: 'Visual separator', ph: '', kw: 'divider separator line hr rule' },
  ];
  const matchesBlock = (b, f) => !f || (b.t + ' ' + b.kw).toLowerCase().includes(f);
  const blockDef = (t) => BLOCKS.find(b => b.type === t) || BLOCKS[0];

  // ---------------- Toast ----------------
  const toastEl = el('div', 'toast'); document.body.appendChild(toastEl);
  const toast = (m) => { toastEl.textContent = m; toastEl.classList.add('show'); setTimeout(() => toastEl.classList.remove('show'), 1600); };

  // ---------------- Theme ----------------
  function initTheme() {
    const saved = localStorage.getItem('vellum:theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = saved;
  }
  function toggleTheme() {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('vellum:theme', next);
  }

  // ================= Sidebar =================
  async function renderSidebar() {
    const nav = $('#nav'); nav.innerHTML = '';
    state.spaces = await Store.listSpaces();

    const spLabel = el('div', 'section-label', 'Spaces<span class="spacer"></span><span class="add" title="New space">＋</span>');
    spLabel.querySelector('.add').onclick = async (e) => { e.stopPropagation(); const s = await Store.createSpace({ name: 'New Space' }); await selectSpace(s.id); };
    nav.appendChild(spLabel);

    for (const sp of state.spaces) {
      const item = el('div', 'nav-item' + (sp.id === state.spaceId && !state.docId ? ' active' : ''));
      item.innerHTML = `<span class="emoji">${sp.emoji}</span><span class="label">${escapeHtml(sp.name)}</span><span class="row-btn add" title="Add page">＋</span>`;
      item.onclick = () => selectSpace(sp.id);
      item.querySelector('.add').onclick = async (e) => { e.stopPropagation(); const d = await Store.createDoc({ spaceId: sp.id, title: 'Untitled' }); await selectDoc(d.id); };
      nav.appendChild(item);

      if (sp.id === state.spaceId) {
        const docs = await Store.listDocs(sp.id);
        for (const d of docs) {
          const di = el('div', 'nav-item child' + (d.id === state.docId ? ' active' : ''));
          di.innerHTML = `<span class="emoji">${d.emoji || '📄'}</span><span class="label">${escapeHtml(d.title || 'Untitled')}</span><span class="row-btn del" title="Delete">🗑</span>`;
          di.onclick = () => selectDoc(d.id);
          di.querySelector('.del').onclick = async (e) => { e.stopPropagation(); await Store.deleteDoc(d.id); if (state.docId === d.id) { state.docId = null; renderMain(); } toast('Moved to trash'); renderSidebar(); };
          nav.appendChild(di);
        }
      }
    }
  }

  async function selectSpace(id) { state.spaceId = id; state.docId = null; state.doc = null; await renderSidebar(); renderMain(); }
  async function selectDoc(id) {
    state.doc = await Store.getDoc(id); state.docId = id;
    if (state.doc) state.spaceId = state.doc.spaceId;
    await renderSidebar(); renderMain();
  }

  // ================= Main area =================
  function renderMain() {
    const main = $('#main-scroll');
    if (state.docId && state.doc) return renderDoc(main);
    if (state.spaceId) return renderHome(main);
    main.innerHTML = '<div class="empty"><div class="big">✦</div>Select a space to begin</div>';
    $('#crumb').innerHTML = 'Vellum';
  }

  async function renderHome(main) {
    const sp = state.spaces.find(s => s.id === state.spaceId);
    const docs = await Store.listDocs(state.spaceId);
    $('#crumb').innerHTML = `<strong>${sp ? sp.emoji + ' ' + escapeHtml(sp.name) : ''}</strong>`;
    main.innerHTML = '';
    const home = el('div', 'home');
    home.appendChild(el('h1', null, `${sp ? sp.emoji : ''} ${sp ? escapeHtml(sp.name) : ''}`));
    home.appendChild(el('div', 'sub', `${docs.length} document${docs.length === 1 ? '' : 's'}`));
    const grid = el('div', 'card-grid');
    const nc = el('div', 'doc-card new', '<div style="font-size:26px">＋</div><div>New document</div>');
    nc.onclick = async () => { const d = await Store.createDoc({ spaceId: state.spaceId, title: 'Untitled' }); selectDoc(d.id); };
    grid.appendChild(nc);
    for (const d of docs) {
      const prev = (d.content.find(b => b.text && b.type !== 'h1') || {}).text || '';
      const card = el('div', 'doc-card');
      card.innerHTML = `<div class="c-emoji">${d.emoji || '📄'}</div><div class="c-title">${escapeHtml(d.title || 'Untitled')}</div><div class="c-prev">${escapeHtml(prev)}</div>`;
      card.onclick = () => selectDoc(d.id);
      grid.appendChild(card);
    }
    home.appendChild(grid);
    main.appendChild(home);
  }

  const saveDoc = debounce(async () => {
    if (!state.doc) return;
    await Store.updateDoc(state.doc.id, { title: state.doc.title, emoji: state.doc.emoji, content: state.doc.content });
  }, 500);

  function renderDoc(main) {
    const doc = state.doc;
    const sp = state.spaces.find(s => s.id === doc.spaceId);
    $('#crumb').innerHTML = `${sp ? sp.emoji + ' ' + escapeHtml(sp.name) : ''} <span style="opacity:.5">/</span> <strong>${doc.emoji || ''} ${escapeHtml(doc.title || 'Untitled')}</strong>`;
    main.innerHTML = '';

    const wrap = el('div', 'doc');
    // emoji
    const emo = el('div', 'doc-emoji', doc.emoji || '📄');
    emo.onclick = (e) => openEmojiPicker(e, (em) => { doc.emoji = em; emo.textContent = em; saveDoc(); renderSidebar(); });
    wrap.appendChild(emo);
    // title
    const title = el('div', 'doc-title'); title.contentEditable = 'true'; title.textContent = doc.title === 'Untitled' ? '' : doc.title;
    title.setAttribute('spellcheck', 'false');
    title.oninput = () => { doc.title = title.textContent.trim() || 'Untitled'; saveDoc(); debounce(renderSidebar, 400)(); };
    title.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); focusBlock(0, true); } };
    wrap.appendChild(title);
    wrap.appendChild(el('div', 'doc-meta', 'Edited ' + new Date(doc.updatedAt || Date.now()).toLocaleString()));

    const blocks = el('div', 'blocks'); blocks.id = 'blocks';
    if (!doc.content.length) doc.content.push({ id: uid(), type: 'text', text: '' });
    doc.content.forEach((b, i) => blocks.appendChild(renderBlock(b, i)));
    wrap.appendChild(blocks);
    main.appendChild(wrap);
  }

  function renderBlock(b, index) {
    const def = blockDef(b.type);
    const node = el('div', 'block'); node.dataset.type = b.type; node.dataset.id = b.id; node.dataset.checked = !!b.checked;

    node.appendChild(el('div', 'block-handle', '⋮⋮'));

    if (b.type === 'divider') { node.appendChild(el('hr')); return node; }
    if (b.type === 'bullet') node.appendChild(el('div', 'bullet-mark', '•'));
    if (b.type === 'numbered') node.appendChild(el('div', 'bullet-mark', (index + 1) + '.'));
    if (b.type === 'callout') node.appendChild(el('div', 'callout-emoji', '💡'));
    if (b.type === 'todo') {
      const chk = el('div', 'todo-check' + (b.checked ? ' checked' : ''), b.checked ? '✓' : '');
      chk.onclick = () => { b.checked = !b.checked; chk.classList.toggle('checked'); chk.textContent = b.checked ? '✓' : ''; node.dataset.checked = b.checked; saveDoc(); };
      node.appendChild(chk);
    }

    const content = el('div', 'block-content');
    content.contentEditable = 'true'; content.setAttribute('spellcheck', 'false');
    content.dataset.ph = index === 0 && b.type === 'text' ? "Type '/' for commands" : def.ph;
    content.textContent = b.text || '';
    content.oninput = () => {
      b.text = content.textContent;
      // Slash menu is input-driven so it works with real keyboards, IMEs and programmatic input.
      if (content.textContent.startsWith('/')) {
        if (!slashState || slashState.b !== b) openSlash(b, content, node);
        slashState && slashState.draw(content.textContent.slice(1).toLowerCase());
        return;
      } else if (slashState && slashState.b === b) { closeSlash(); }
      handleMarkdownShortcut(b, content, node);
      saveDoc();
    };
    content.onkeydown = (e) => onBlockKey(e, b, content, node);
    node.appendChild(content);
    return node;
  }

  // convert "# " etc. at start into headings/lists
  function handleMarkdownShortcut(b, content, node) {
    const txt = content.textContent;
    const map = { '# ': 'h1', '## ': 'h2', '### ': 'h3', '- ': 'bullet', '* ': 'bullet', '[] ': 'todo', '[ ] ': 'todo', '> ': 'quote', '```': 'code', '1. ': 'numbered' };
    for (const [k, type] of Object.entries(map)) {
      if (txt === k || (txt.startsWith(k) && content.textContent.length === k.length)) {
        b.type = type; b.text = ''; content.textContent = '';
        const i = state.doc.content.indexOf(b); const nn = renderBlock(b, i);
        node.replaceWith(nn); focusEl(nn.querySelector('.block-content')); saveDoc(); return;
      }
    }
  }

  function onBlockKey(e, b, content, node) {
    const idx = state.doc.content.indexOf(b);
    // Slash menu is opened from the input handler; ignore Enter here while it is open.
    if (slashState && slashState.b === b) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const caret = getCaret(content);
      const before = content.textContent.slice(0, caret), after = content.textContent.slice(caret);
      b.text = before; content.textContent = before;
      // exiting a list/heading with empty line -> back to text
      const carryType = ['bullet', 'numbered', 'todo'].includes(b.type) && before === '' ? 'text' : (['h1', 'h2', 'h3', 'quote', 'callout', 'code'].includes(b.type) ? 'text' : b.type);
      if (['bullet', 'numbered', 'todo'].includes(b.type) && before === '') { b.type = 'text'; node.replaceWith(renderBlock(b, idx)); focusBlock(idx); saveDoc(); return; }
      const nb = { id: uid(), type: carryType, text: after, checked: false };
      state.doc.content.splice(idx + 1, 0, nb);
      rerenderBlocks(); focusBlock(idx + 1, true); saveDoc();
      return;
    }
    if (e.key === 'Backspace' && getCaret(content) === 0 && content.textContent === '' ) {
      if (b.type !== 'text') { e.preventDefault(); b.type = 'text'; node.replaceWith(renderBlock(b, idx)); focusBlock(idx); saveDoc(); return; }
      if (idx > 0) {
        e.preventDefault();
        const prev = state.doc.content[idx - 1];
        const at = prev.text.length;
        prev.text += b.text;
        state.doc.content.splice(idx, 1);
        rerenderBlocks(); focusBlock(idx - 1); setCaret($('#blocks').children[idx - 1].querySelector('.block-content'), at); saveDoc();
      }
      return;
    }
    if (e.key === 'ArrowUp' && idx > 0 && getCaret(content) === 0) { e.preventDefault(); focusBlock(idx - 1); }
    if (e.key === 'ArrowDown' && idx < state.doc.content.length - 1 && getCaret(content) === content.textContent.length) { e.preventDefault(); focusBlock(idx + 1); }
  }

  function rerenderBlocks() {
    const blocks = $('#blocks'); blocks.innerHTML = '';
    state.doc.content.forEach((b, i) => blocks.appendChild(renderBlock(b, i)));
  }
  function focusBlock(i, toEnd) {
    const node = $('#blocks').children[i]; if (!node) return;
    const c = node.querySelector('.block-content'); if (c) { c.focus(); if (toEnd) setCaret(c, c.textContent.length); }
  }
  function focusEl(c) { if (c) c.focus(); }

  // ================= Slash menu =================
  let slashState = null;
  function openSlash(b, content, node) {
    closeSlash();
    const menu = el('div', 'slash-menu');
    const r = content.getBoundingClientRect();
    menu.style.left = r.left + 'px'; menu.style.top = (r.bottom + 6) + 'px';
    let sel = 0;
    const items = BLOCKS.slice();
    function draw(filter = '') {
      const f = items.filter(x => matchesBlock(x, filter));
      menu.innerHTML = '';
      f.forEach((x, i) => {
        const it = el('div', 'slash-item' + (i === sel ? ' sel' : ''));
        it.innerHTML = `<div class="slash-ico">${x.ico}</div><div><div class="t">${x.t}</div><div class="d">${x.d}</div></div>`;
        it.onmousedown = (e) => { e.preventDefault(); choose(x); };
        menu.appendChild(it);
      });
      slashState.filtered = f;
    }
    function choose(x) {
      b.type = x.type; b.text = ''; content.textContent = '';
      const i = state.doc.content.indexOf(b);
      if (x.type === 'divider') { state.doc.content.splice(i + 1, 0, { id: uid(), type: 'text', text: '' }); }
      rerenderBlocks(); closeSlash(); focusBlock(x.type === 'divider' ? i + 1 : i); saveDoc();
    }
    document.body.appendChild(menu);
    slashState = { menu, b, content, sel, draw, choose, get filtered() { return this._f || items; }, set filtered(v) { this._f = v; } };
    draw();

    const onKey = (e) => {
      if (!slashState) return;
      const f = slashState.filtered;
      if (e.key === 'Escape') { closeSlash(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % f.length; slashState.sel = sel; draw(content.textContent.replace('/', '').toLowerCase()); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + f.length) % f.length; slashState.sel = sel; draw(content.textContent.replace('/', '').toLowerCase()); }
      else if (e.key === 'Enter') { e.preventDefault(); if (f[sel]) choose(f[sel]); }
      else { setTimeout(() => { sel = 0; draw(content.textContent.replace('/', '').toLowerCase()); if (!content.textContent.startsWith('/')) closeSlash(); }, 0); }
    };
    slashState.onKey = onKey;
    content.addEventListener('keydown', onKey);
  }
  function closeSlash() {
    if (!slashState) return;
    slashState.menu.remove();
    slashState.content.removeEventListener('keydown', slashState.onKey);
    slashState = null;
  }
  document.addEventListener('click', (e) => { if (slashState && !slashState.menu.contains(e.target)) closeSlash(); });

  // ================= Emoji picker =================
  const EMOJIS = '📄📝📔📕📗📘📙📓📒✏️🖊️💡🔥⭐️🌟✨🎯🚀🧠💼🏡🎨🎵🍎🌈🌍🔬🧪⚗️🧬🕹️🎮🛠️⚙️📌📎🔖🏷️📊📈📉🗂️📁📂🗃️💎🪄🧭🗺️🎁🍀🌱🐣'.match(/\p{Emoji}(️)?/gu) || [];
  function openEmojiPicker(e, cb) {
    $('.emoji-pop')?.remove();
    const pop = el('div', 'emoji-pop');
    EMOJIS.forEach(em => { const s = el('span', null, em); s.onclick = () => { cb(em); pop.remove(); }; pop.appendChild(s); });
    pop.style.left = e.clientX + 'px'; pop.style.top = (e.clientY + 10) + 'px';
    document.body.appendChild(pop);
    setTimeout(() => document.addEventListener('click', function h(ev) { if (!pop.contains(ev.target)) { pop.remove(); document.removeEventListener('click', h); } }), 0);
  }

  // ================= Caret helpers =================
  function getCaret(node) {
    const s = getSelection(); if (!s.rangeCount) return 0;
    const r = s.getRangeAt(0).cloneRange(); r.selectNodeContents(node); r.setEnd(s.getRangeAt(0).endContainer, s.getRangeAt(0).endOffset);
    return r.toString().length;
  }
  function setCaret(node, pos) {
    const r = document.createRange(), s = getSelection();
    let cur = 0, done = false;
    (function walk(n) {
      if (done) return;
      if (n.nodeType === 3) { if (cur + n.length >= pos) { r.setStart(n, pos - cur); done = true; } else cur += n.length; }
      else n.childNodes.forEach(walk);
    })(node);
    if (!done) { r.selectNodeContents(node); r.collapse(false); }
    r.collapse(true); s.removeAllRanges(); s.addRange(r);
  }

  // ================= Search =================
  const runSearch = debounce(async (q) => {
    if (!q.trim()) return;
    const res = await Store.search(q);
    const main = $('#main-scroll');
    main.innerHTML = '';
    const home = el('div', 'home');
    home.appendChild(el('h1', null, `Search`));
    home.appendChild(el('div', 'sub', `${res.length} result${res.length === 1 ? '' : 's'} for “${escapeHtml(q)}”`));
    const grid = el('div', 'card-grid');
    for (const d of res) {
      const card = el('div', 'doc-card');
      card.innerHTML = `<div class="c-emoji">${d.emoji || '📄'}</div><div class="c-title">${escapeHtml(d.title)}</div>`;
      card.onclick = () => { $('#search-input').value = ''; selectDoc(d.id); };
      grid.appendChild(card);
    }
    home.appendChild(grid); main.appendChild(home);
    $('#crumb').innerHTML = '<strong>Search</strong>';
  }, 200);

  // ================= Utils =================
  function escapeHtml(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  // ================= Boot =================
  async function boot() {
    initTheme();
    // detect backend
    try {
      const r = await fetch(API + '/health', { signal: AbortSignal.timeout(1200) });
      if (r.ok) { Store = Remote; $('#backend-dot').style.background = '#3ecf6b'; $('#backend-dot').title = 'Connected to API'; }
    } catch { Store = LocalStore; $('#backend-dot').style.background = '#f4a340'; $('#backend-dot').title = 'Offline — using local storage'; }

    $('#toggle-sidebar').onclick = () => $('#sidebar').classList.toggle('collapsed');
    $('#theme-btn').onclick = toggleTheme;
    $('#search-input').oninput = (e) => { const v = e.target.value; if (v.trim()) runSearch(v); else renderMain(); };
    $('#new-doc-btn').onclick = async () => { if (!state.spaceId) return toast('Pick a space first'); const d = await Store.createDoc({ spaceId: state.spaceId, title: 'Untitled' }); selectDoc(d.id); };

    await renderSidebar();
    if (state.spaces[0]) await selectSpace(state.spaces[0].id);
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
