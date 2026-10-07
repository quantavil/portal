/**
 * bun run build [--docs DIR] [--nsfw-md FILE] [--no-nsfw] [--offline] [--out DIR]
 *
 *   --docs DIR      read the upstream pages from DIR (default .cache/docs, downloaded if missing)
 *   --nsfw-md FILE  use an already-decrypted NSFW markdown file instead of fetching the checkpoint
 *   --no-nsfw       leave NSFW out of dist entirely (e.g. for hosts whose terms forbid it)
 *   --offline       never touch the network for gateways/NSFW; use the last good snapshot if there is one
 *   --out DIR       output directory (default dist)
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { basename } from "node:path";
import { parseArgs } from "node:util";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { fetchDocs } from "./scripts/fetch-docs";
import { renderHtml, hueCss, manifest } from "./src/build/template";
import { fetchText, GATEWAY_SOURCE, parseGatewayMap } from "./src/build/gateways";
import { renderIcon } from "./src/build/icons";
import { fetchNsfwMarkdown } from "./src/build/nsfw";
import { applyGateways, type GatewayMap } from "./src/shared/gateways";
import { NSFW_KEY, NSFW_TITLE, PAGES } from "./src/shared/pages";
import { parsePage } from "./src/shared/parse";
import { countEntries, SCHEMA, unaccounted, type NsfwFile, type PageData, type Seed } from "./src/shared/types";

const { values: a } = parseArgs({
  options: { docs: { type: "string" }, "nsfw-md": { type: "string" }, "no-nsfw": { type: "boolean" }, offline: { type: "boolean" }, out: { type: "string" } },
});
const OUT = a.out ?? "dist";
const DOCS = a.docs ?? ".cache/docs";
const GOOD = ".cache/last-good";
const BUDGET = { firstPaintGz: 20 * 1024, mainJsGz: 6 * 1024 };

const log = (m: string) => console.log(m);
const warn = (m: string) => console.warn("  ! " + m);
const sha = (s: string | Uint8Array) => createHash("sha256").update(s).digest("hex").slice(0, 10);
const kb = (n: number) => (n / 1024).toFixed(1) + " KB";
const gz = (s: string | Uint8Array) => gzipSync(s, { level: 9 }).length;
const br = (s: string | Uint8Array) => brotliCompressSync(s).length;

// ---------------------------------------------------------------- 1. upstream pages
if (!PAGES.every((p) => existsSync(`${DOCS}/${p.k}.md`))) {
  log("Downloading upstream pages...");
  await fetchDocs(DOCS, log);
}

log("Parsing...");
const pages: PageData[] = [];
let totalLinks = 0;
for (const p of PAGES) {
  const r = parsePage(p.k, p.n, await Bun.file(`${DOCS}/${p.k}.md`).text());
  const lost = unaccounted(r.stats);
  if (lost !== 0 || r.stats.bad > 0 || r.stats.entries === 0) {
    throw new Error(`parser invariant failed for ${p.k}: unaccounted=${lost} bad=${r.stats.bad} entries=${r.stats.entries}`);
  }
  totalLinks += r.stats.links;
  pages.push(r.page);
}

// ---------------------------------------------------------------- 2. Base64 gateways (non-fatal)
async function loadGateways(): Promise<GatewayMap> {
  const file = `${GOOD}/gateways.json`;
  if (!a.offline) {
    try {
      const map = parseGatewayMap(await fetchText(GATEWAY_SOURCE));
      await Bun.write(file, JSON.stringify(map));
      return map;
    } catch (e) {
      warn(`gateway map unavailable (${(e as Error).message})`);
    }
  }
  if (existsSync(file)) { log("  using last good gateway snapshot"); return await Bun.file(file).json(); }
  warn("no gateway map: Base64 gateway links stay as rentry links (they still work)");
  return {};
}
const gw = await loadGateways();
let resolved = 0;
for (const p of pages) resolved += applyGateways(p, gw);
log(`Gateways: ${resolved} link(s) resolved`);

// ---------------------------------------------------------------- 3. NSFW (non-fatal, optional)
async function loadNsfw(): Promise<PageData | null> {
  if (a["no-nsfw"]) return null;
  const file = `${GOOD}/nsfw.md`;
  let md: string | null = null;
  if (a["nsfw-md"]) md = await Bun.file(a["nsfw-md"]).text();
  else if (!a.offline) {
    try {
      md = await fetchNsfwMarkdown();
      await Bun.write(file, md);
    } catch (e) {
      warn(`NSFW fetch failed (${(e as Error).message})`);
    }
  }
  if (md === null && existsSync(file)) { log("  using last good NSFW snapshot"); md = await Bun.file(file).text(); }
  if (md === null) { warn("NSFW not included in this build"); return null; }
  const r = parsePage(NSFW_KEY, NSFW_TITLE, md);
  if (unaccounted(r.stats) !== 0 || r.stats.entries === 0) { warn("NSFW parse failed its invariant; skipped"); return null; }
  r.page.nsfw = 1;
  applyGateways(r.page, gw);
  return r.page;
}
const nsfw = await loadNsfw();

// ---------------------------------------------------------------- 4. data files (content-hashed)
const t = Date.now();
const seed: Seed = { v: SCHEMA, t, gw, p: pages };
const seedJson = JSON.stringify(seed);
const seedName = `seed.${sha(seedJson)}.json`;
let nsfwName = "";
let nsfwJson = "";
if (nsfw) {
  nsfwJson = JSON.stringify({ v: SCHEMA, t, page: nsfw } satisfies NsfwFile);
  nsfwName = `nsfw.${sha(nsfwJson)}.json`;
}

// ---------------------------------------------------------------- 5. bundle app
await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const define = { __SEED__: JSON.stringify(seedName), __NSFW__: JSON.stringify(nsfwName), __SW__: JSON.stringify("sw.js") };
const app = await Bun.build({
  entrypoints: ["src/app/main.ts"],
  target: "browser",
  format: "esm",
  splitting: true,
  minify: true,
  define,
  naming: { entry: "main.[hash].[ext]", chunk: "[name].[hash].[ext]" },
});
if (!app.success) { for (const l of app.logs) console.error(l); throw new Error("app bundle failed"); }
const js: { name: string; text: string; entry: boolean }[] = [];
for (const o of app.outputs) js.push({ name: basename(o.path), text: await o.text(), entry: o.kind === "entry-point" });
const main = js.find((f) => f.entry)!;

// css (minified by Bun's own CSS pipeline); hue classes are generated, not hand-written
await Bun.write(".cache/style.css", (await Bun.file("src/app/style.css").text()) + hueCss());
const cssBuild = await Bun.build({ entrypoints: [".cache/style.css"], minify: true });
if (!cssBuild.success) throw new Error("css build failed");
const css = (await cssBuild.outputs[0]!.text()).trim();

// ---------------------------------------------------------------- 6. html, manifest, icons, service worker
const counts: Record<string, number> = Object.fromEntries(pages.map((p) => [p.k, countEntries(p)]));
const topStarred: Record<string, string[]> = {};
for (const p of [...pages, ...(nsfw ? [nsfw] : [])]) {
  const stars: string[] = [];
  for (const s of p.s) {
    for (const e of s.e) {
      if ((e[3] & 1) && stars.length < 3) stars.push(e[0]);
    }
    for (const b of s.b) {
      for (const e of b.e) {
        if ((e[3] & 1) && stars.length < 3) stars.push(e[0]);
      }
    }
    if (stars.length >= 3) break;
  }
  topStarred[p.k] = stars;
}
const unique = new Set<string>();
for (const p of pages) for (const s of p.s) for (const e of [...s.e, ...s.b.flatMap((b) => b.e)]) unique.add(e[1].toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, ""));
const html = renderHtml({ css, mainJs: main.name, counts, topStarred, hasNsfw: !!nsfw });

const files: Record<string, string | Uint8Array> = {
  "index.html": html,
  "manifest.webmanifest": JSON.stringify(manifest()),
  "icon-192.png": renderIcon(192),
  "icon-512.png": renderIcon(512),
  "icon-maskable-512.png": renderIcon(512, true),
  [seedName]: seedJson,
};
if (nsfw) files[nsfwName] = nsfwJson;
for (const f of js) files[f.name] = f.text;

const precache = ["index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png", seedName, ...js.map((f) => f.name)];
const version = sha(precache.map((n) => n + sha(files[n]!)).join("|"));
const swBuild = await Bun.build({
  entrypoints: ["src/app/sw.ts"],
  target: "browser",
  minify: true,
  define: { __PRECACHE__: JSON.stringify(precache), __VERSION__: JSON.stringify(version) },
});
if (!swBuild.success) { for (const l of swBuild.logs) console.error(l); throw new Error("sw bundle failed"); }
files["sw.js"] = await swBuild.outputs[0]!.text();

// headers for hosts that honour a _headers file (Cloudflare Pages, Netlify). Hashed files are immutable.
const immutable = [...js.map((f) => f.name), seedName, ...(nsfw ? [nsfwName] : [])];
files["_headers"] =
  `/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Cache-Control: public, max-age=0, must-revalidate\n` +
  immutable.map((n) => `/${n}\n  Cache-Control: public, max-age=31536000, immutable\n`).join("");
files[".nojekyll"] = "";

for (const [name, data] of Object.entries(files)) await Bun.write(`${OUT}/${name}`, data);

// ---------------------------------------------------------------- 7. report + budgets
const allEntries = pages.reduce((n, p) => n + countEntries(p), 0);
log(`\nBuilt ${OUT}/  (${allEntries.toLocaleString()} entries, ${unique.size.toLocaleString()} unique urls, ${totalLinks.toLocaleString()} raw links${nsfw ? `, +${countEntries(nsfw).toLocaleString()} NSFW` : ", no NSFW"})`);
const row = (n: string, d: string | Uint8Array) => log(`  ${n.padEnd(30)} raw ${kb(typeof d === "string" ? Buffer.byteLength(d) : d.length).padStart(10)}   gzip ${kb(gz(d)).padStart(9)}   brotli ${kb(br(d)).padStart(9)}`);
for (const [n, d] of Object.entries(files)) if (!n.startsWith(".") && n !== "_headers") row(n, d);

const firstPaint = gz(html) + gz(main.text);
log(`\nFirst paint (html + main.js, gzip): ${kb(firstPaint)}  [budget ${kb(BUDGET.firstPaintGz)}]   main.js: ${kb(gz(main.text))}  [budget ${kb(BUDGET.mainJsGz)}]`);
const problems: string[] = [];
if (firstPaint > BUDGET.firstPaintGz) problems.push("first paint over budget");
if (gz(main.text) > BUDGET.mainJsGz) problems.push("critical JS over budget");
if (/<script(?![^>]*\bsrc=)/i.test(html)) problems.push("inline <script> found (CSP forbids it)");
if (problems.length) { console.error("\nBUDGET FAILURES: " + problems.join("; ")); process.exit(1); }
log("Budgets OK.");
