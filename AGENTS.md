# AGENTS.md — Portal (fmhy-home)

Personal start page for the FMHY link directory. Static only, no framework, no accounts, no tracking.

## Commands

- `bun install` — Bun >= 1.4.2
- `bun run build [--offline] [--no-nsfw] [--docs DIR] [--out DIR]` — parse pages, bundle, write `dist/`, enforce budgets
- `bun run dev [port]` — serve `dist/` (`scripts/serve.ts`, default 8080)
- `bun test` — 93 tests (parser, search, updater, NSFW, build)
- `bunx tsc --noEmit` — typecheck
- `bun run docs` — download upstream pages to `.cache/docs`
- `python3 e2e/smoke.py` — optional Chromium suite (needs Playwright)

## Architecture

- `src/shared/parse.ts` — tolerant FMHY markdown parser; invariant: every `](http` lands in one stats bucket
- `src/shared/svg.ts` — central static SVGs; no emoji anywhere in `src/`
- `src/build/template.ts` — SSR shell + strict CSP (`script-src 'self'`, styles by hash)
- `src/app/main.ts` — critical path ≤6KB gzip (prefs, pins); `core.ts` lazy-loads dataset + uFuzzy + views
- `src/app/search.ts` — uFuzzy over the full dataset, no remote suggest
- `src/app/render.ts` — rows: desc folded to one clamp-2 paragraph, extras as slim text-links
- External search is tap-only: web chip strip + zero-hit external rows. Never `addRecent` for external queries.

## Conventions

- No `innerHTML` with dataset; static SVGs only via `src/shared/svg.ts`
- Recents record main links only (extras like Subreddit/Discord are not sites)
- Search a11y: input `role=combobox` + `aria-controls/list`/`aria-expanded`/`aria-activedescendant`; list `role=listbox`; rows `role=option` + `sr-N` ids
- Light `--mut-soft` must stay ≥4.5:1 against the background
- Coarse pointers: 44px targets via the `@media(pointer:coarse)` block; extras reveal is gated on `(hover:hover) and (pointer:fine)`
- Budgets enforced by build: html+main.js ≤20KB gzip, main.js ≤6KB gzip; no third-party hosts in html
- Hosting: Cloudflare Pages static (`dist/_headers` immutable hashed files). No server code.
