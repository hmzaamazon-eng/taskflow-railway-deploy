# TaskFlow Knowledge Base

A structured, token-efficient knowledge base built from your books and reference docs.
Every book is parsed into small atomic "cards" so that later you (or the Amazon Bot) can
fetch **exactly the piece of information you need** without re-reading a whole book.

## Why it's built this way (the token argument)
- A whole book = tens of thousands of tokens. Loading one to answer a question is wasteful.
- Here, each book becomes **20-60 small cards**, each with a one-sentence `summary`.
- `build.py` compiles all cards into:
  - **`INDEX.md`** — a compact map (book → card one-liners). Tiny. Load this first.
  - **`knowledge.sqlite`** — a full-text (FTS5) search index.
  - **`cards.jsonl`** — portable flat list.
- To answer something: **search** (returns one-liners + ids) → **fetch only the matching card**.
  Cost is a few hundred tokens, not a whole book.

## Important constraint (how the books actually get processed)
The PDFs live on **your Mac** — this repo/cloud session can't read your local drive, and you
asked to process them on **your Claude.ai account, not the API**. So the workflow is:

> **You** run the reading in claude.ai (your subscription = no API token cost), one book per
> chat, using `EXTRACTION_PROMPT.md`. Claude returns one JSON file per book. You save it in
> `books/` and run the build. The repo holds the *system*; your cloud account does the *reading*.

## Workflow
1. Pick a book from `registry.json` (it has the canonical `id`, `category`, and relevance for
   every file you listed — duplicates already collapsed into one entry).
2. Open **claude.ai**, attach that one book, paste the prompt from `EXTRACTION_PROMPT.md`
   (fill in the book id / category / relevance at the top).
3. Save Claude's JSON reply as `books/<book-id>.json`.
4. Build the database:
   ```bash
   cd knowledge-base
   python3 build.py          # validates every file, tells you exactly what to fix
   ```
5. Query it (token-efficient):
   ```bash
   python3 query.py "negotiation tactics"     # search → compact hits + card ids
   python3 query.py --card profit-first.target-allocation-percentages   # one full card
   python3 query.py --book the-mom-test        # list a book's cards
   python3 query.py --books                    # everything loaded so far
   ```

## Files
| File | Role |
|------|------|
| `registry.json` | Canonical, de-duplicated list of every book you gave me, with category + FBA relevance. Tracks `status` (pending/extracted) and flags unknown / likely-misfiled files. |
| `EXTRACTION_PROMPT.md` | The prompt you paste into claude.ai. Forces detail-by-detail, no-skipping, strict-JSON output. |
| `schema.json` | The exact shape every `books/*.json` must follow. |
| `books/*.json` | One structured extract per book. `sellerboard-reports.json` is a complete worked example. |
| `build.py` | Validates extracts and compiles `INDEX.md` + `knowledge.sqlite` + `cards.jsonl`. Stdlib only. |
| `query.py` | Token-efficient retrieval CLI. Stdlib only. |

## Status / what's left
- ✅ System built and verified end-to-end on the **sellerboard Reports** doc (worked example).
- ⏳ The ~35 de-duplicated books in `registry.json` are marked `pending` — extract them in
  claude.ai (one per chat) and drop the JSON into `books/`.
- ❓ Three files need you to tell me what they are (hash/timestamp-named) or confirm they're
  unrelated — see `needs_identification` in `registry.json`.
