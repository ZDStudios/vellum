---
name: vellum
description: Create, read, edit, and search documents in a Vellum workspace (an open-source Craft-style block editor). Use when the user wants to capture notes, draft docs, manage to-dos, or organize knowledge in Vellum, or mentions their Vellum workspace, spaces, or documents.
---

# Vellum

Vellum is a block-based document workspace. This skill lets you manage a running Vellum
instance through its REST API (or the bundled MCP server).

## Connecting

- Default base URL: `http://localhost:4321`. Override with the `VELLUM_URL` environment
  variable if the user runs it elsewhere.
- If the Vellum **MCP server** is configured, prefer its tools (`list_spaces`,
  `create_document`, `append_blocks`, `search_documents`, …) — they wrap the same API.
- Otherwise call the REST API directly with `curl` / `fetch`.

Always confirm the server is reachable first: `GET {VELLUM_URL}/api/health` → `{"ok":true}`.

## Data model

- **Space** — a top-level collection (e.g. "Personal", "Work"). Fields: `id`, `name`, `emoji`, `color`.
- **Document** — belongs to a space. Fields: `id`, `spaceId`, `title`, `emoji`, `content`, `starred`, `updatedAt`.
- **Block** — an item in a document's `content` array: `{ type, text, checked? }`.
  Valid `type` values: `text`, `h1`, `h2`, `h3`, `todo`, `bullet`, `numbered`, `quote`, `code`, `callout`, `divider`.

## REST endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/spaces` | List spaces |
| POST | `/api/spaces` | Create space `{name, emoji?, color?}` |
| GET | `/api/documents?spaceId=` | List documents (optionally by space) |
| POST | `/api/documents` | Create `{spaceId, title, emoji?, content?}` |
| GET | `/api/documents/:id` | Get one document (full content) |
| PATCH | `/api/documents/:id` | Update `{title?, emoji?, content?}` |
| POST | `/api/documents/:id/blocks` | Append `{blocks: [...]}` |
| DELETE | `/api/documents/:id` | Trash (add `?hard=true` to purge) |
| GET | `/api/search?q=` | Full-text search |
| GET | `/api/tasks?filter=` | Tasks by `inbox` / `today` / `upcoming` / `all` (or `?day=<ms>`) |
| POST | `/api/tasks` | Create `{title, due?}` (`due` = epoch ms; omit for Inbox) |
| PATCH | `/api/tasks/:id` | Update `{title?, done?, due?}` |
| DELETE | `/api/tasks/:id` | Delete a task |

All responses are `{ "ok": true, "data": ... }`.

- **Task** — `{ id, title, done, due }`. `due` is epoch milliseconds, or `null` for the Inbox.
  A task is "Today" when its `due` is today or earlier, "Upcoming" when later.

## Recipes

**Create a document**
```bash
curl -s -X POST $VELLUM_URL/api/documents -H 'Content-Type: application/json' -d '{
  "spaceId": "<space-id>",
  "title": "Meeting notes",
  "emoji": "🗓️",
  "content": [
    {"type": "h1", "text": "Weekly sync"},
    {"type": "todo", "text": "Send recap", "checked": false},
    {"type": "quote", "text": "Ship early, ship often."}
  ]
}'
```

**Append to a daily log / existing doc**
```bash
curl -s -X POST $VELLUM_URL/api/documents/<id>/blocks -H 'Content-Type: application/json' \
  -d '{"blocks": [{"type": "bullet", "text": "Fixed the deploy pipeline"}]}'
```

**Find something**
```bash
curl -s "$VELLUM_URL/api/search?q=roadmap"
```

**Add a task for today**
```bash
TODAY=$(node -e "const d=new Date();d.setHours(0,0,0,0);console.log(d.getTime())")
curl -s -X POST $VELLUM_URL/api/tasks -H 'Content-Type: application/json' \
  -d "{\"title\": \"Review the PR\", \"due\": $TODAY}"
```

## Guidance

- When the user asks to "add a note" or "log" something, prefer `append_blocks` on an
  existing document over creating a new one, unless they ask for a new document.
- Pick sensible `emoji` and block `type`s so documents look good in the editor
  (headings for structure, `todo` for tasks, `callout` for tips/warnings).
- After a write, report the document `id` and title so the user can open it at
  `{VELLUM_URL}` in the browser.
- Never hard-delete (`?hard=true`) without explicit confirmation.
