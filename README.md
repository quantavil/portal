# Portal

An instant personal start page for the [FMHY](https://fmhy.net) link directory: one search box over ~19,000 links, category browsing, pins, offline, and a client-side daily refresh. Static files only, no framework, no accounts, no tracking, no third-party requests.

## Quick start

```bash
bun install                 # Bun >= 1.4.2
bun run build               # downloads FMHY pages, builds dist/
bun run dev                 # serve dist/ on http://localhost:8080
```

`dist/` is the whole site (git-ignored; build it yourself). Add `--offline` to build with no network (uses the last good snapshots).

| Command | What it does |
|---|---|
| `bun run build` | Parse upstream pages, bundle, write `dist/`, enforce budgets |
| `bun run dev [port]` | Static server for `dist/` |
| `bun test` | 93 tests (parser, search, updater, NSFW, build) |
| `bun run docs` | Download the upstream pages to `.cache/docs` |
| `bun run check:live` | Parse today's live upstream and compare with `test/baseline.json` |
| `bun run typecheck` | `tsc --noEmit` |
| `python3 e2e/smoke.py` | Optional Chromium suite (needs Playwright) |

Build flags: `--docs DIR`, `--nsfw-md FILE` (use an already-decrypted NSFW markdown), `--no-nsfw` (leave NSFW out of `dist/` entirely), `--offline` (no network for gateways/NSFW; uses last good snapshot), `--out DIR`.

## Use it

- **Firefox desktop / Chrome**: set the deployed URL as your homepage.
- **Firefox Android**: Settings → Home → Custom URL, then menu → *Install* for the PWA.
- **Keys**: `/` or `Ctrl/Cmd+K` focuses search · `↑ ↓` move · `Enter` opens · `Ctrl/Cmd+Enter` opens a new tab · `Esc` clears.
- **Pins**: pin button on any row. Pins are stored in this browser, ranked by how often you click them, and render before any data loads.

## Deploy

Any static host. Put the contents of `dist/` at the site root or any sub-path (all URLs are relative).

- **Cloudflare Pages / Netlify**: `dist/_headers` sets `immutable` on hashed files and `must-revalidate` on the rest. Compression is automatic, which is why the build does not write `.br`/`.gz` files.
- **GitHub Pages**: works, but ignores `_headers` (the service worker handles caching) — and see the NSFW note below.

### NSFW

NSFW is a **separate file** (`nsfw.<hash>.json`) that is only downloaded when you switch *Show NSFW* on. It is never part of the seed. If your host's terms forbid it, build with `--no-nsfw`: the toggle disappears and no trace ships.

## How it works

```
build (you, rarely)                       browser
  parse pages ─► seed.<hash>.json          first paint: index.html + main.js (13.1 KB gzip)
  bundle app, inline CSS                    idle: core.js (dataset + uFuzzy + UI), service worker
  index.html, sw.js, icons ─► dist/         first open of each day: updater.js
```

- **First paint** is `index.html` (CSS inlined, categories prerendered) plus a small script that draws your pins from `localStorage`. Nothing waits for the dataset.
- **Data**: the seed (~2 MB raw, ~580 KB gzip, fetched once, then cached by the service worker) plus optional per-page overrides in IndexedDB from the daily updater.
- **Daily update** (first idle moment of the first open each day): the browser revalidates pages against GitHub with its own ETag (cheap 304s); a changed page is detected by hash, re-parsed, and stored. New data takes effect on the **next** open. An update that would shrink the dataset by more than 10% is rejected. Any error keeps current data.
- **Offline**: the service worker precaches the shell and seed; every later load works with no network.
- **Safety**: no `innerHTML` with data, only `http(s)` links are ever stored, strict CSP (`script-src 'self'`, styles by hash), `rel="noopener noreferrer"` and `no-referrer` everywhere.

## Measured (this build)

| | |
|---|---|
| Dataset | 19,900 entries · 19,057 unique URLs · 28,508 raw links, every one accounted for (+552 NSFW) |
| First paint payload | 13.1 KB gzip (budget 20) · critical JS 3.2 KB gzip (budget 6) |
| Seed | ~2 MB raw · ~580 KB gzip (one-time, then cached) |
| Search | uFuzzy over the full dataset, per keystroke, no network |

## Maintenance

- FMHY adds a page → add one line to `src/shared/pages.ts`, run `bun run docs && bun run check:live`.
- Parser change → bump `SCHEMA` in `src/shared/types.ts` (clients discard stored data and re-sync from the seed), then `bun scripts/update-baseline.ts`.
- Re-deploy whenever you like: a newer seed automatically wins over older stored data.

Link data © FMHY contributors; this project only presents it and links back.
