#!/usr/bin/env python3
"""Vellum — zero-dependency REST API + web server (Python stdlib only).

Run:  python main.py     (no pip install required; needs Python 3.8+)

Uses the same JSON data format and serves the same web/ client as the Node server,
so you can switch runtimes freely.
"""
import json
import os
import secrets
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

# Make stdout UTF-8 friendly on Windows consoles (cp1252) so logging never crashes.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.abspath(os.path.join(HERE, "..", "web"))
DB_PATH = os.environ.get("VELLUM_DB", os.path.join(os.getcwd(), "vellum-data.json"))
PORT = int(os.environ.get("PORT", "4321"))

BLOCK_TYPES = {"text", "h1", "h2", "h3", "todo", "bullet", "numbered",
               "quote", "code", "divider", "callout", "toggle", "image"}
MIME = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8", ".json": "application/json",
        ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon"}

_lock = threading.Lock()


def now_ms():
    return int(time.time() * 1000)


def uid():
    return secrets.token_urlsafe(9)


class Store:
    def __init__(self):
        self.data = {"spaces": [], "documents": []}
        self.load()

    def load(self):
        try:
            if os.path.exists(DB_PATH):
                with open(DB_PATH, "r", encoding="utf-8") as f:
                    self.data = json.load(f)
                self.data.setdefault("spaces", [])
                self.data.setdefault("documents", [])
        except Exception as e:
            print("Failed to read data file, starting fresh:", e)
            self.data = {"spaces": [], "documents": []}

    def persist(self):
        tmp = DB_PATH + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(self.data, f, indent=2, ensure_ascii=False)
        os.replace(tmp, DB_PATH)

    # ---- blocks ----
    @staticmethod
    def normalize_block(b):
        if isinstance(b, str):
            b = {"type": "text", "text": b}
        t = b.get("type") if b.get("type") in BLOCK_TYPES else "text"
        return {
            "id": b.get("id") or uid(), "type": t, "text": b.get("text", ""),
            "checked": bool(b.get("checked")), "language": b.get("language") or "plaintext",
            "url": b.get("url", ""), "color": b.get("color", ""),
        }

    # ---- spaces ----
    def spaces_list(self):
        return sorted(self.data["spaces"], key=lambda s: (s["position"], s["createdAt"]))

    def space_get(self, sid):
        return next((s for s in self.data["spaces"] if s["id"] == sid), None)

    def space_create(self, body):
        pos = max([s["position"] for s in self.data["spaces"]] + [0]) + 1
        s = {"id": uid(), "name": body.get("name", "New Space"),
             "emoji": body.get("emoji", "📁"), "color": body.get("color", "#4a6cf7"),
             "position": pos, "createdAt": now_ms()}
        self.data["spaces"].append(s)
        self.persist()
        return s

    def space_update(self, sid, patch):
        s = self.space_get(sid)
        if not s:
            return None
        patch.pop("id", None)
        s.update(patch)
        self.persist()
        return s

    def space_remove(self, sid):
        before = len(self.data["spaces"])
        self.data["spaces"] = [s for s in self.data["spaces"] if s["id"] != sid]
        self.data["documents"] = [d for d in self.data["documents"] if d["spaceId"] != sid]
        self.persist()
        return len(self.data["spaces"]) < before

    # ---- documents ----
    def docs_list(self, space_id=None, parent_id=None, include_deleted=False, starred=False):
        out = []
        for d in self.data["documents"]:
            if not include_deleted and d.get("deleted"):
                continue
            if space_id and d.get("spaceId") != space_id:
                continue
            if parent_id is None and d.get("parentId") is not None:
                continue
            if parent_id and d.get("parentId") != parent_id:
                continue
            if starred and not d.get("starred"):
                continue
            out.append(d)
        return sorted(out, key=lambda d: (d["position"], d["createdAt"]))

    def doc_get(self, did):
        return next((d for d in self.data["documents"] if d["id"] == did), None)

    def doc_create(self, body):
        pos = max([d["position"] for d in self.data["documents"]] + [0]) + 1
        t = now_ms()
        content = [self.normalize_block(b) for b in body.get("content", [])]
        if not content:
            content = [self.normalize_block({"type": "text", "text": ""})]
        doc = {
            "id": uid(), "spaceId": body.get("spaceId"), "parentId": body.get("parentId"),
            "title": body.get("title", "Untitled"), "emoji": body.get("emoji", ""), "cover": "",
            "content": content, "starred": False, "isDaily": bool(body.get("isDaily")),
            "deleted": False, "position": pos, "createdAt": t, "updatedAt": t,
        }
        self.data["documents"].append(doc)
        self.persist()
        return doc

    def doc_update(self, did, patch):
        d = self.doc_get(did)
        if not d:
            return None
        patch.pop("id", None)
        if "content" in patch:
            patch["content"] = [self.normalize_block(b) for b in patch["content"]]
        d.update(patch)
        d["updatedAt"] = now_ms()
        self.persist()
        return d

    def doc_append_blocks(self, did, blocks):
        d = self.doc_get(did)
        if not d:
            return None
        if not isinstance(blocks, list):
            blocks = [blocks]
        d["content"].extend(self.normalize_block(b) for b in blocks)
        d["updatedAt"] = now_ms()
        self.persist()
        return d

    def doc_remove(self, did, hard=False):
        if hard:
            before = len(self.data["documents"])
            self.data["documents"] = [d for d in self.data["documents"] if d["id"] != did]
            self.persist()
            return len(self.data["documents"]) < before
        return bool(self.doc_update(did, {"deleted": True}))

    def doc_restore(self, did):
        return self.doc_update(did, {"deleted": False})

    def search(self, query, space_id=None):
        q = query.lower()
        res = [d for d in self.data["documents"]
               if not d.get("deleted") and (not space_id or d["spaceId"] == space_id)
               and (q in d["title"].lower() or q in json.dumps(d["content"]).lower())]
        return sorted(res, key=lambda d: d["updatedAt"], reverse=True)[:50]

    def seed_if_empty(self):
        if self.data["spaces"]:
            return
        personal = self.space_create({"name": "Personal", "emoji": "🏡", "color": "#4a6cf7"})
        self.space_create({"name": "Work", "emoji": "💼", "color": "#f4a340"})
        self.doc_create({
            "spaceId": personal["id"], "title": "Welcome to Vellum", "emoji": "👋",
            "content": [
                {"type": "h1", "text": "Welcome to Vellum"},
                {"type": "text", "text": "Vellum is a beautiful, open-source document workspace — an homage to Craft."},
                {"type": "callout", "text": "Type “/” on a new line to insert blocks: headings, to-dos, quotes, code, and more.", "color": "blue"},
                {"type": "h2", "text": "Try it out"},
                {"type": "todo", "text": "Create your first document", "checked": True},
                {"type": "todo", "text": "Press “/” to open the block menu", "checked": False},
                {"type": "todo", "text": "Toggle dark mode from the sidebar", "checked": False},
                {"type": "quote", "text": "Design is not just what it looks like. Design is how it works."},
                {"type": "h2", "text": "Built for automation"},
                {"type": "text", "text": "Every document here is reachable through a clean REST API, an MCP server, and a Claude skill."},
            ],
        })


store = Store()
store.seed_if_empty()


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):
        pass  # quiet

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def _send(self, code, body, ctype="application/json"):
        if isinstance(body, (dict, list)):
            body = json.dumps(body, ensure_ascii=False)
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _ok(self, data):
        self._send(200, {"ok": True, "data": data})

    def _nf(self):
        self._send(404, {"ok": False, "error": "not_found"})

    def _body(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        if not length:
            return {}
        try:
            return json.loads(self.rfile.read(length) or b"{}")
        except Exception:
            return {}

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        self.route("GET")

    def do_POST(self):
        self.route("POST")

    def do_PATCH(self):
        self.route("PATCH")

    def do_PUT(self):
        self.route("PATCH")

    def do_DELETE(self):
        self.route("DELETE")

    def route(self, method):
        parsed = urlparse(self.path)
        path = parsed.path
        q = {k: v[0] for k, v in parse_qs(parsed.query).items()}
        if not path.startswith("/api/"):
            return self.serve_static(path)
        with _lock:
            self.api(method, path, q)

    def api(self, method, path, q):
        body = self._body() if method in ("POST", "PATCH", "PUT") else {}
        parts = [p for p in path.split("/") if p]  # e.g. ['api','documents','ID','blocks']

        if path == "/api/health":
            return self._send(200, {"ok": True, "name": "vellum", "version": "1.0.0"})

        # /api/spaces
        if parts[:2] == ["api", "spaces"]:
            if len(parts) == 2:
                if method == "GET":
                    return self._ok(store.spaces_list())
                if method == "POST":
                    return self._ok(store.space_create(body))
            if len(parts) == 3:
                sid = parts[2]
                if method == "GET":
                    s = store.space_get(sid); return self._ok(s) if s else self._nf()
                if method == "PATCH":
                    s = store.space_update(sid, body); return self._ok(s) if s else self._nf()
                if method == "DELETE":
                    return self._ok({"removed": store.space_remove(sid)})

        # /api/documents
        if parts[:2] == ["api", "documents"]:
            if len(parts) == 2:
                if method == "GET":
                    return self._ok(store.docs_list(
                        space_id=q.get("spaceId"),
                        parent_id=None if q.get("parentId") in (None, "root") else q.get("parentId"),
                        starred=q.get("starred") == "true",
                        include_deleted=q.get("includeDeleted") == "true"))
                if method == "POST":
                    return self._ok(store.doc_create(body))
            if len(parts) == 3:
                did = parts[2]
                if method == "GET":
                    d = store.doc_get(did); return self._ok(d) if d else self._nf()
                if method == "PATCH":
                    d = store.doc_update(did, body); return self._ok(d) if d else self._nf()
                if method == "DELETE":
                    return self._ok({"removed": store.doc_remove(did, hard=q.get("hard") == "true")})
            if len(parts) == 4 and method == "POST":
                did, action = parts[2], parts[3]
                if action == "blocks":
                    d = store.doc_append_blocks(did, body.get("blocks", body))
                    return self._ok(d) if d else self._nf()
                if action == "restore":
                    d = store.doc_restore(did); return self._ok(d) if d else self._nf()

        # /api/search
        if path == "/api/search" and method == "GET":
            term = (q.get("q") or "").strip()
            return self._ok(store.search(term, q.get("spaceId")) if term else [])

        return self._nf()

    def serve_static(self, path):
        rel = "index.html" if path == "/" else path.lstrip("/")
        target = os.path.abspath(os.path.join(WEB_DIR, rel))
        if not target.startswith(WEB_DIR):  # path traversal guard
            return self._nf()
        if not os.path.isfile(target):
            target = os.path.join(WEB_DIR, "index.html")
        try:
            with open(target, "rb") as f:
                data = f.read()
        except OSError:
            return self._nf()
        ext = os.path.splitext(target)[1]
        self._send(200, data, MIME.get(ext, "application/octet-stream"))


def main():
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"\n  * Vellum (Python) running at http://localhost:{PORT}")
    print(f"  * REST API at http://localhost:{PORT}/api\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()


if __name__ == "__main__":
    main()
