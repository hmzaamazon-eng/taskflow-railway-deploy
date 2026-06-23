# Book Extraction Prompt (run this in Claude.ai — your subscription, no API cost)

## How to use it
1. Open a new chat in **claude.ai** (or the desktop app) on your normal plan.
2. **Attach ONE book** (PDF / DOCX). One book per chat keeps the model focused and avoids cross-contamination.
3. Find the book's canonical **id** and **category** in `registry.json`. (e.g. `profit-first`, category `finance`.)
4. Paste the prompt below, filling in the three blanks at the top.
5. Claude replies with **one JSON object**. Save it as `knowledge-base/books/<book-id>.json`.
6. Run `python3 knowledge-base/build.py` to fold it into the searchable database.

> Big books: if the file is large, Claude may run long. If it stops mid-way, reply **"continue"**; when done, ask it to **"output the complete merged JSON object now"** so you save a single valid file. Always validate with the build script (it will tell you exactly what's wrong).

---

## The prompt (copy everything in this block)

```
You are a meticulous knowledge engineer building a permanent, queryable knowledge base
for an Amazon FBA operator. Your job is to read the attached book/document COMPLETELY and
convert it into one structured JSON object. Work like a system, not a summarizer: every
distinct idea goes in its own labelled place. Do not skip chapters. Do not generalize away
specifics. Do not invent content that is not in the source.

BOOK ID:        <paste book.id from registry.json, e.g. profit-first>
CATEGORY:       <paste category from registry.json, e.g. finance>
DOMAIN RELEVANCE: <high | medium | low, from registry.json>

=== METHOD (follow in order, do not shortcut) ===
1. Build the chapter-by-chapter OUTLINE first, covering the WHOLE document start to finish.
   This is your checklist — every chapter in the outline must contribute at least one card
   below (unless it is purely front/back matter).
2. Walk the outline chapter by chapter. For each chapter, extract every distinct, reusable
   idea as its own atomic CARD in "concepts". One idea per card. If you are tempted to write
   "and also", split it into two cards.
3. Pull any step-by-step procedures or audit lists into "checklists".
4. Pull defined terms into "glossary". Pull only genuinely memorable lines into "quotes".
5. For EVERY concept card, write an "fba_application": one concrete way an Amazon FBA seller
   running multiple accounts would actually use this idea. If truly not applicable, set it to "".
6. Self-check before answering: does every outline chapter appear in some card's source_ref?
   Is every "summary" exactly one sentence? Is every id unique and formatted "<book-id>.<slug>"?

=== OUTPUT RULES ===
- Output ONE JSON object and NOTHING ELSE (no prose before or after, no markdown fences).
- Conform EXACTLY to the schema below. Use the given enums. Keep "summary" to ONE sentence
  (this is what gets indexed for cheap retrieval; the full text goes in "detail").
- ids: book.id is the value you pasted above; each card id is "<book.id>.<short-kebab-slug>".
- "source_ref" is REQUIRED on every concept (chapter/section/page — best available).
- Be exhaustive on substance, economical on words. Aim for many small precise cards rather
  than a few large vague ones. A dense business book should yield 20-60+ concept cards.
- If the document is low_relevance reference material, still extract faithfully but you may
  keep it lean (the most transferable ideas only).

=== SCHEMA (authoritative; matches knowledge-base/schema.json) ===
{
  "schema_version": "1.0",
  "book": {
    "id": "string (kebab-case, = BOOK ID above)",
    "title": "string",
    "subtitle": "string (optional)",
    "authors": ["string"],
    "year": 0,
    "category": "string (= CATEGORY above)",
    "subcategory": "string (optional)",
    "domain_relevance": "high | medium | low",
    "source_files": ["string (original filename if known, else book title)"],
    "one_line": "string, <=160 chars, the book in one sentence",
    "thesis": "string, 2-4 sentences",
    "tags": ["string"]
  },
  "outline": [ { "ref": "Ch. 1", "title": "string", "summary": "string" } ],
  "concepts": [
    {
      "id": "<book-id>.<slug>",
      "name": "string",
      "type": "framework | principle | tactic | rule | definition | process | metric | story | stat | model",
      "summary": "string — ONE sentence, <=240 chars",
      "detail": "string — full, actionable explanation",
      "when_to_use": "string (optional)",
      "steps": ["string (optional, ordered)"],
      "examples": ["string (optional)"],
      "fba_application": "string — how an Amazon FBA operator uses this",
      "source_ref": "string — REQUIRED (e.g. 'Ch. 3, pp. 45-52')",
      "tags": ["string"],
      "related": ["other.card-ids (optional)"]
    }
  ],
  "checklists": [ { "id": "<book-id>.<slug>", "name": "string", "when_to_use": "string", "items": ["string"], "source_ref": "string" } ],
  "glossary": [ { "term": "string", "definition": "string", "source_ref": "string" } ],
  "quotes": [ { "text": "string", "ref": "string" } ],
  "open_questions": ["string"]
}

Now read the attached document fully and produce the JSON object.
```

---

## Why this design saves tokens later
- Each book becomes **many small cards** with a one-sentence `summary`.
- `build.py` compiles all cards into a tiny **`INDEX.md`** (titles + one-liners only) and a
  **SQLite full-text index**.
- To answer a question you (or the Amazon Bot) load the index or run a keyword search — that
  returns only the matching one-line summaries and their card ids. You then fetch **only the
  exact card(s)** you need (`query.py --card <id>`). You never re-load a whole book.
