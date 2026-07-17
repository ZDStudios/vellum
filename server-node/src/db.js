// Vellum — zero-dependency JSON data store (Node).
// Persists to a single JSON file. No native modules, no build step: `node src/index.js` just works.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = process.env.VELLUM_DB || path.join(process.cwd(), 'vellum-data.json');

const now = () => Date.now();
const uid = () => crypto.randomBytes(9).toString('base64url');

let data = { spaces: [], documents: [], tasks: [] };
let saveTimer = null;

function load() {
  try {
    if (fs.existsSync(DB_PATH)) {
      data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
      data.spaces ||= [];
      data.documents ||= [];
      data.tasks ||= [];
    }
  } catch (e) {
    console.error('Failed to read data file, starting fresh:', e.message);
    data = { spaces: [], documents: [] };
  }
}

function persist() {
  // Debounced atomic write so rapid edits don't thrash the disk.
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = DB_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, DB_PATH);
  }, 120);
}

load();

const BLOCK_TYPES = new Set([
  'text', 'h1', 'h2', 'h3', 'todo', 'bullet', 'numbered',
  'quote', 'code', 'divider', 'callout', 'toggle', 'image',
]);

function normalizeBlock(b) {
  if (typeof b === 'string') b = { type: 'text', text: b };
  const type = BLOCK_TYPES.has(b.type) ? b.type : 'text';
  return {
    id: b.id || uid(),
    type,
    text: b.text ?? '',
    checked: !!b.checked,
    language: b.language || 'plaintext',
    url: b.url || '',
    color: b.color || '',
  };
}

// ---- Spaces ----
const Spaces = {
  list() {
    return [...data.spaces].sort((a, b) => a.position - b.position || a.createdAt - b.createdAt);
  },
  get(id) {
    return data.spaces.find((s) => s.id === id) || null;
  },
  create({ name = 'New Space', emoji = '📁', color = '#4a6cf7' } = {}) {
    const pos = data.spaces.reduce((m, s) => Math.max(m, s.position), 0) + 1;
    const s = { id: uid(), name, emoji, color, position: pos, createdAt: now() };
    data.spaces.push(s);
    persist();
    return s;
  },
  update(id, patch) {
    const s = Spaces.get(id);
    if (!s) return null;
    delete patch.id;
    Object.assign(s, patch);
    persist();
    return s;
  },
  remove(id) {
    const before = data.spaces.length;
    data.spaces = data.spaces.filter((s) => s.id !== id);
    data.documents = data.documents.filter((d) => d.spaceId !== id);
    persist();
    return data.spaces.length < before;
  },
};

// ---- Documents ----
const Docs = {
  list({ spaceId, parentId = null, includeDeleted = false, starred } = {}) {
    return data.documents
      .filter((d) => {
        if (!includeDeleted && d.deleted) return false;
        if (spaceId && d.spaceId !== spaceId) return false;
        if (parentId === null && d.parentId != null) return false;
        else if (parentId && d.parentId !== parentId) return false;
        if (starred && !d.starred) return false;
        return true;
      })
      .sort((a, b) => a.position - b.position || a.createdAt - b.createdAt);
  },
  get(id) {
    return data.documents.find((d) => d.id === id) || null;
  },
  create({ spaceId = null, parentId = null, title = 'Untitled', emoji = '', content = [], isDaily = false } = {}) {
    const pos = data.documents.reduce((m, d) => Math.max(m, d.position), 0) + 1;
    const t = now();
    const doc = {
      id: uid(), spaceId, parentId, title, emoji, cover: '',
      content: content.map(normalizeBlock),
      starred: false, isDaily: !!isDaily, deleted: false,
      position: pos, createdAt: t, updatedAt: t,
    };
    if (!doc.content.length) doc.content = [normalizeBlock({ type: 'text', text: '' })];
    data.documents.push(doc);
    persist();
    return doc;
  },
  update(id, patch) {
    const d = Docs.get(id);
    if (!d) return null;
    delete patch.id;
    if (patch.content) patch.content = patch.content.map(normalizeBlock);
    Object.assign(d, patch, { updatedAt: now() });
    persist();
    return d;
  },
  appendBlocks(id, blocks) {
    const d = Docs.get(id);
    if (!d) return null;
    const normalized = (Array.isArray(blocks) ? blocks : [blocks]).map(normalizeBlock);
    d.content.push(...normalized);
    d.updatedAt = now();
    persist();
    return d;
  },
  remove(id, { hard = false } = {}) {
    if (hard) {
      const before = data.documents.length;
      data.documents = data.documents.filter((d) => d.id !== id);
      persist();
      return data.documents.length < before;
    }
    return !!Docs.update(id, { deleted: true });
  },
  restore(id) {
    return Docs.update(id, { deleted: false });
  },
  search(query, { spaceId } = {}) {
    const q = query.toLowerCase();
    return data.documents
      .filter((d) => !d.deleted && (!spaceId || d.spaceId === spaceId))
      .filter((d) => d.title.toLowerCase().includes(q) || JSON.stringify(d.content).toLowerCase().includes(q))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 50);
  },
};

// ---- Tasks ----
const startOfDay = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };

const Tasks = {
  list({ filter = 'all' } = {}) {
    const today = startOfDay(now());
    let out = [...data.tasks];
    if (filter === 'inbox') out = out.filter((t) => !t.done && t.due == null);
    else if (filter === 'today') out = out.filter((t) => !t.done && t.due != null && startOfDay(t.due) <= today);
    else if (filter === 'upcoming') out = out.filter((t) => !t.done && t.due != null && startOfDay(t.due) > today);
    return out.sort((a, b) => (a.done - b.done) || ((a.due ?? Infinity) - (b.due ?? Infinity)) || a.createdAt - b.createdAt);
  },
  forDay(dayTs) {
    const day = startOfDay(dayTs);
    return data.tasks.filter((t) => t.due != null && startOfDay(t.due) === day)
      .sort((a, b) => (a.done - b.done) || a.createdAt - b.createdAt);
  },
  get(id) { return data.tasks.find((t) => t.id === id) || null; },
  create({ title = 'New task', due = null, done = false, docId = null } = {}) {
    const t = now();
    const task = { id: uid(), title, done: !!done, due: due != null ? Number(due) : null, docId, createdAt: t, updatedAt: t };
    data.tasks.push(task);
    persist();
    return task;
  },
  update(id, patch) {
    const task = Tasks.get(id);
    if (!task) return null;
    delete patch.id;
    if ('due' in patch && patch.due != null) patch.due = Number(patch.due);
    Object.assign(task, patch, { updatedAt: now() });
    persist();
    return task;
  },
  remove(id) {
    const before = data.tasks.length;
    data.tasks = data.tasks.filter((t) => t.id !== id);
    persist();
    return data.tasks.length < before;
  },
};

function seedIfEmpty() {
  if (data.spaces.length > 0) return;
  const guide = Spaces.create({ name: 'How to use Vellum', emoji: '👋', color: '#3b82f6' });
  Spaces.create({ name: 'Unsorted', emoji: '', color: '#8a8a8a' });
  Docs.create({
    spaceId: guide.id,
    title: 'Getting Started',
    content: [
      { type: 'h1', text: 'Getting Started' },
      { type: 'text', text: 'Think of Vellum as your personal notebook — bring together Docs, Tasks and your Calendar in one calm, offline-first place.' },
      { type: 'callout', text: 'Press “/” on a new line to insert blocks: headings, to-dos, quotes, code and more.' },
      { type: 'h2', text: 'The basics' },
      { type: 'todo', text: 'Create your first document', checked: true },
      { type: 'todo', text: 'Try the block menu with “/”', checked: false },
      { type: 'todo', text: 'Open Tasks and Calendar from the sidebar', checked: false },
      { type: 'quote', text: 'Design is not just what it looks like. Design is how it works.' },
    ],
  });
  Docs.create({
    spaceId: guide.id,
    title: 'Vellum Handbook',
    content: [
      { type: 'h1', text: 'Vellum Handbook' },
      { type: 'text', text: 'A quick overview of everything Vellum can do.' },
      { type: 'h2', text: 'Blocks & pages' },
      { type: 'bullet', text: 'Every paragraph is a block you can restyle' },
      { type: 'bullet', text: 'Headings build structure automatically' },
      { type: 'h2', text: 'Tasks & scheduling' },
      { type: 'text', text: 'Capture tasks in the Inbox, then schedule them for Today or Upcoming.' },
    ],
  });
  Docs.create({
    spaceId: guide.id,
    title: 'Tips & Shortcuts',
    content: [
      { type: 'h1', text: 'Tips & Shortcuts' },
      { type: 'text', text: 'Work faster with markdown-style shortcuts.' },
      { type: 'code', text: '# → Heading 1\n- → Bullet list\n[] → To-do\n> → Quote' },
      { type: 'callout', text: 'Everything is saved automatically and works offline.' },
    ],
  });
}

module.exports = { Spaces, Docs, Tasks, uid, now, normalizeBlock, seedIfEmpty, BLOCK_TYPES, DB_PATH };
