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
- `src/shared/svg.ts` — central static SVG art; no emoji anywhere in `src/`. Brand marks: DDG uses the simple-icons path and needs `fill-rule="evenodd"` (its ring + duck are separate sub-paths; without it the duck fills in and the icon renders as a solid blob). Reddit dispatches to site-wide `reddit.com/search`, not a subreddit.
- `src/build/template.ts` — SSR shell + strict CSP (`script-src 'self'`, styles by hash)
- `src/app/main.ts` — critical path ≤6KB gzip (prefs, pins); `core.ts` lazy-loads dataset + uFuzzy + views
- `src/app/search.ts` — uFuzzy over the full dataset, no remote suggest
- `src/app/render.ts` — rows: desc folded to one clamp-2 paragraph, extras as slim text-links
- External search is tap-only: the dock chips in the search bar are the only dispatch surface, plus zero-hit external rows in the list. Never `addRecent` for external queries.

## Conventions

- No `innerHTML` with dataset; static SVGs only via `src/shared/svg.ts`
- Recents record main links only (extras like Subreddit/Discord are not sites)
- Search a11y: input `role=combobox` + `aria-controls/list`/`aria-expanded`/`aria-activedescendant`; list `role=listbox`; rows `role=option` + `sr-N` ids
- Light `--mut-soft` must stay ≥4.5:1 against the background
- Narrow screens (`max-width:639px`): the long search placeholder is hidden (`#q::placeholder{content:"";color:transparent}`) — it truncates mid-word; the `aria-label` still names the field. The dock's "Web:" label and each chip's name span are hidden, leaving compact icon-only chips at their base size (no forced width/height); touch area comes from `.dock-chip::after{inset:-.375rem}`
- Category tiles ≤639px: the title owns the full tile width and clamps to 2 lines, `.tl-count` is hidden (counts live in the section view), and only the first 2 of 3 samples show. The count and title were fighting over one ~92px line, which cut 12/24 titles mid-word at 390px and 22/24 at 320px. Don't float or absolutely position the badge back into the title row — the float variant dropped the badge below short titles and inflated tiles to 103px. Sample separators are generated in CSS (`.tl-samples .ts::after`) so hiding a sample cannot leave a dangling `·`; each sample is its own `.ts` span
- Web engines: `DEFAULT_ENGINES` in `src/app/store.ts` is the single source of truth (dock markup, `ENGINES` in `core.ts`, `main.ts` map, settings list); stored prefs are filtered against it so removed engines can't linger
- Coarse pointers: 44px targets via the `@media(pointer:coarse)` block; extras reveal is gated on `(hover:hover) and (pointer:fine)`
- Budgets enforced by build: html+main.js ≤20KB gzip, main.js ≤6KB gzip; no third-party hosts in html
- Hosting: Cloudflare Pages static (`dist/_headers` immutable hashed files). No server code.
