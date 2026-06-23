#!/usr/bin/env python3
"""
query.py — token-efficient retrieval from the knowledge base.

The whole point: never load a whole book. Search returns one-line summaries +
card ids; then you fetch only the exact card you need.

Usage:
  python3 query.py "profit allocation percentages"   # full-text search -> compact hits
  python3 query.py "negotiation" --limit 5
  python3 query.py --card profit-first.target-allocation-percentages   # full card JSON
  python3 query.py --book profit-first                 # list all cards in one book
  python3 query.py --books                             # list every document
  python3 query.py --stats

Run build.py first to (re)generate knowledge.sqlite.
No third-party dependencies.
"""
import json, os, sqlite3, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(HERE, "knowledge.sqlite")


def _con():
    if not os.path.exists(DB_PATH):
        sys.exit("knowledge.sqlite not found — run: python3 build.py")
    return sqlite3.connect(DB_PATH)


def search(term, limit):
    con = _con()
    # bm25() ranks best matches first (lower is better).
    try:
        cur = con.execute(
            "SELECT s.card_id, c.book_title, c.type, c.name, c.summary "
            "FROM search s JOIN cards c ON c.card_id = s.card_id "
            "WHERE search MATCH ? ORDER BY bm25(search) LIMIT ?", (term, limit))
        rows = cur.fetchall()
    except sqlite3.OperationalError as e:
        sys.exit(f"search error ({e}). Tip: quote multi-word phrases or simplify the query.")
    if not rows:
        print("No matches.")
        return
    for cid, btitle, typ, name, summ in rows:
        print(f"• {cid}  [{typ}]  — {name}")
        print(f"    {summ}")
        print(f"    ({btitle})")
    print(f"\n{len(rows)} hit(s). Fetch one in full: python3 query.py --card <id>")


def show_card(cid):
    con = _con()
    row = con.execute("SELECT full FROM cards WHERE card_id = ?", (cid,)).fetchone()
    if not row:
        sys.exit(f"No card with id '{cid}'. List a book's cards: python3 query.py --book <book-id>")
    print(json.dumps(json.loads(row[0]), ensure_ascii=False, indent=2))


def list_book(bid):
    con = _con()
    rows = con.execute("SELECT card_id, type, name, summary FROM cards WHERE book_id = ? "
                       "ORDER BY card_id", (bid,)).fetchall()
    if not rows:
        sys.exit(f"No cards for book '{bid}'.")
    for cid, typ, name, summ in rows:
        print(f"• {cid}  [{typ}]  — {name}\n    {summ}")


def list_books():
    con = _con()
    rows = con.execute("SELECT book_id, book_title, category, COUNT(*) FROM cards "
                       "GROUP BY book_id ORDER BY category, book_title").fetchall()
    for bid, title, cat, n in rows:
        print(f"{cat:24} {bid:28} {n:>3} cards  {title}")


def stats():
    con = _con()
    nb = con.execute("SELECT COUNT(DISTINCT book_id) FROM cards").fetchone()[0]
    nc = con.execute("SELECT COUNT(*) FROM cards").fetchone()[0]
    print(f"{nb} documents, {nc} cards.")


def main(argv):
    if not argv:
        print(__doc__)
        return
    if argv[0] == "--card" and len(argv) > 1:
        return show_card(argv[1])
    if argv[0] == "--book" and len(argv) > 1:
        return list_book(argv[1])
    if argv[0] == "--books":
        return list_books()
    if argv[0] == "--stats":
        return stats()
    limit = 8
    if "--limit" in argv:
        i = argv.index("--limit")
        limit = int(argv[i + 1])
        argv = argv[:i] + argv[i + 2:]
    term = " ".join(argv)
    search(term, limit)


if __name__ == "__main__":
    main(sys.argv[1:])
