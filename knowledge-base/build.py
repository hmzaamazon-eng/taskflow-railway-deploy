#!/usr/bin/env python3
"""
build.py — compile every books/*.json extract into a token-efficient knowledge base.

Outputs (all generated; safe to delete and rebuild):
  - knowledge.sqlite : SQLite + FTS5 full-text index of every card (the query engine)
  - cards.jsonl      : one card per line (portable; easy to feed other tools)
  - INDEX.md         : ultra-compact human/LLM index (book -> card one-liners). Load this first.

Usage:
  python3 build.py            # validate + build
  python3 build.py --strict   # exit non-zero on any validation error (use in CI)

No third-party dependencies — Python 3.8+ standard library only.
"""
import json, os, sqlite3, sys, glob

HERE = os.path.dirname(os.path.abspath(__file__))
BOOKS_DIR = os.path.join(HERE, "books")
DB_PATH = os.path.join(HERE, "knowledge.sqlite")
JSONL_PATH = os.path.join(HERE, "cards.jsonl")
INDEX_PATH = os.path.join(HERE, "INDEX.md")

CONCEPT_TYPES = {"framework", "principle", "tactic", "rule", "definition",
                 "process", "metric", "story", "stat", "model"}


def validate(book, fname):
    """Return a list of human-readable problems (empty == valid)."""
    errs = []
    b = book.get("book", {})
    if book.get("schema_version") != "1.0":
        errs.append("schema_version must be '1.0'")
    for k in ("id", "title", "category", "one_line", "thesis"):
        if not b.get(k):
            errs.append(f"book.{k} is required")
    bid = b.get("id", "")
    if not book.get("concepts"):
        errs.append("at least one concept is required")
    seen = set()
    for i, c in enumerate(book.get("concepts", [])):
        loc = f"concepts[{i}]"
        for k in ("id", "name", "type", "summary", "detail", "source_ref"):
            if not c.get(k):
                errs.append(f"{loc}.{k} is required")
        cid = c.get("id", "")
        if cid in seen:
            errs.append(f"{loc}.id duplicated: {cid}")
        seen.add(cid)
        if bid and cid and not cid.startswith(bid + "."):
            errs.append(f"{loc}.id should start with '{bid}.' (got '{cid}')")
        if c.get("type") and c["type"] not in CONCEPT_TYPES:
            errs.append(f"{loc}.type '{c['type']}' not in {sorted(CONCEPT_TYPES)}")
        if len(c.get("summary", "")) > 240:
            errs.append(f"{loc}.summary exceeds 240 chars (keep it one sentence)")
    return errs


def card_rows(book):
    """Flatten a book into searchable card rows."""
    b = book["book"]
    base = {"book_id": b["id"], "book_title": b["title"], "category": b.get("category", "")}
    rows = []
    for c in book.get("concepts", []):
        body = " ".join(filter(None, [
            c.get("detail", ""), c.get("when_to_use", ""),
            " ".join(c.get("steps", []) or []), " ".join(c.get("examples", []) or []),
            c.get("fba_application", ""),
        ]))
        rows.append({**base, "card_id": c["id"], "kind": "concept", "type": c.get("type", ""),
                     "name": c["name"], "summary": c.get("summary", ""),
                     "tags": " ".join(c.get("tags", []) or []),
                     "source_ref": c.get("source_ref", ""), "body": body,
                     "full": json.dumps(c, ensure_ascii=False)})
    for cl in book.get("checklists", []):
        body = " ".join(cl.get("items", []) or [])
        rows.append({**base, "card_id": cl["id"], "kind": "checklist", "type": "checklist",
                     "name": cl["name"], "summary": cl.get("when_to_use", ""),
                     "tags": "", "source_ref": cl.get("source_ref", ""), "body": body,
                     "full": json.dumps(cl, ensure_ascii=False)})
    return rows


def main():
    strict = "--strict" in sys.argv
    files = sorted(glob.glob(os.path.join(BOOKS_DIR, "*.json")))
    if not files:
        print(f"No extracts found in {BOOKS_DIR}/ — add <book-id>.json files first.")
        return 0

    all_rows, all_books, had_errors = [], [], False
    for f in files:
        name = os.path.basename(f)
        try:
            with open(f, encoding="utf-8") as fh:
                book = json.load(fh)
        except json.JSONDecodeError as e:
            print(f"  ✗ {name}: invalid JSON — {e}")
            had_errors = True
            continue
        errs = validate(book, name)
        if errs:
            had_errors = True
            print(f"  ✗ {name}:")
            for e in errs:
                print(f"      - {e}")
            continue
        rows = card_rows(book)
        all_rows.extend(rows)
        all_books.append(book)
        print(f"  ✓ {name}: {len(rows)} cards")

    if not all_books:
        print("Nothing valid to build.")
        return 1 if (strict and had_errors) else 0

    # --- SQLite + FTS5 ---
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)
    con = sqlite3.connect(DB_PATH)
    con.execute("CREATE TABLE cards (card_id TEXT PRIMARY KEY, book_id TEXT, book_title TEXT, "
                "category TEXT, kind TEXT, type TEXT, name TEXT, summary TEXT, tags TEXT, "
                "source_ref TEXT, full TEXT)")
    con.execute("CREATE VIRTUAL TABLE search USING fts5(card_id UNINDEXED, name, summary, "
                "tags, body, book_title)")
    for r in all_rows:
        con.execute("INSERT OR REPLACE INTO cards VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                    (r["card_id"], r["book_id"], r["book_title"], r["category"], r["kind"],
                     r["type"], r["name"], r["summary"], r["tags"], r["source_ref"], r["full"]))
        con.execute("INSERT INTO search (card_id, name, summary, tags, body, book_title) "
                    "VALUES (?,?,?,?,?,?)",
                    (r["card_id"], r["name"], r["summary"], r["tags"], r["body"], r["book_title"]))
    con.commit()
    con.close()

    # --- cards.jsonl ---
    with open(JSONL_PATH, "w", encoding="utf-8") as fh:
        for r in all_rows:
            fh.write(json.dumps({k: r[k] for k in
                     ("card_id", "book_id", "book_title", "category", "kind", "type",
                      "name", "summary", "tags", "source_ref")}, ensure_ascii=False) + "\n")

    # --- INDEX.md (compact: load this first to spend few tokens) ---
    by_cat = {}
    for bk in all_books:
        by_cat.setdefault(bk["book"].get("category", "uncategorized"), []).append(bk)
    lines = ["# Knowledge Base Index",
             "",
             f"{len(all_books)} documents · {len(all_rows)} cards. "
             "Find a card here, then fetch only it: `python3 query.py --card <id>`.",
             ""]
    for cat in sorted(by_cat):
        lines.append(f"## {cat}")
        for bk in sorted(by_cat[cat], key=lambda x: x["book"]["title"]):
            b = bk["book"]
            lines.append(f"\n### {b['title']}  —  `{b['id']}`")
            lines.append(f"_{b.get('one_line','')}_")
            for c in bk.get("concepts", []):
                lines.append(f"- `{c['id']}` ({c.get('type','')}): {c.get('summary','')}")
            for cl in bk.get("checklists", []):
                lines.append(f"- `{cl['id']}` (checklist): {cl.get('name','')}")
        lines.append("")
    with open(INDEX_PATH, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))

    print(f"\nBuilt {len(all_rows)} cards from {len(all_books)} documents.")
    print(f"  → {os.path.relpath(DB_PATH)}  (search engine)")
    print(f"  → {os.path.relpath(INDEX_PATH)}  (compact index)")
    print(f"  → {os.path.relpath(JSONL_PATH)}")
    return 1 if (strict and had_errors) else 0


if __name__ == "__main__":
    sys.exit(main())
