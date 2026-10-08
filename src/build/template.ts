import { createHash } from "node:crypto";
import { PAGES, NSFW_KEY, NSFW_TITLE } from "../shared/pages";
import {
  FAVICON_SVG,
  keyboardSvg,
  searchSvg,
  gearSvg,
  yandexSvg,
  googleSvg,
  googleAiSvg,
  duckDuckGoSvg,
  githubSvg,
  wikiSvg,
  redditSvg,
} from "../shared/svg";

export type TemplateInput = {
  css: string;
  mainJs: string;
  counts: Record<string, number>;
  topStarred?: Record<string, string[]>;
  hasNsfw: boolean;
};

const sha256 = (s: string) => "sha256-" + createHash("sha256").update(s).digest("base64");

/** Golden-angle hue per category so neighbours are always distinguishable. */
const hueOf = (i: number) => Math.round((i * 137.508) % 360);
export const hueCss = () => Array.from({ length: PAGES.length + 1 }, (_, i) => `.h${i}{--h:${hueOf(i)}}`).join("");

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const fmt = (n: number) => n.toLocaleString("en-US");

const SEARCH_ICON = searchSvg(22);
const FAVICON = "data:image/svg+xml," + encodeURIComponent(FAVICON_SVG);

export function renderHtml(t: TemplateInput): string {
  const tiles = PAGES.map((p, i) => {
    const stars = t.topStarred?.[p.k]?.slice(0, 3);
    const starHtml = stars && stars.length ? `<span class="tl-samples">${esc(stars.join(" \u00b7 "))}</span>` : "";
    return `<a class="tl keycap h${i}" id="t-${p.k}" href="#${p.k}"><div class="tl-top"><span class="tl-title">${esc(p.n)}</span><i class="tl-count">${fmt(t.counts[p.k] ?? 0)}</i></div>${starHtml}</a>`;
  }).join("");
  const nsfwStars = t.topStarred?.[NSFW_KEY]?.slice(0, 3);
  const nsfwStarHtml = nsfwStars && nsfwStars.length ? `<span class="tl-samples">${esc(nsfwStars.join(" \u00b7 "))}</span>` : "";
  const nsfwTile = t.hasNsfw ? `<a class="tl keycap h${PAGES.length}" id="t-${NSFW_KEY}" href="#${NSFW_KEY}" hidden><div class="tl-top"><span class="tl-title">${NSFW_TITLE}</span><i class="tl-count"></i></div>${nsfwStarHtml}</a>` : "";
  const nsfwChip = t.hasNsfw ? '<label class="chip keycap" id="nsfw-chip" hidden><input type="checkbox" id="nsfw"><span>Show NSFW</span></label>' : "";

  const totalLinks = Object.values(t.counts).reduce((a, b) => a + b, 0);
  const searchPlaceholder = `Search ${fmt(totalLinks)} links or dispatch to Web Engines\u2026`;

  const csp = [
    "default-src 'none'",
    "script-src 'self'",
    `style-src '${sha256(t.css)}'`,
    "img-src 'self' data:",
    "connect-src 'self' https://raw.githubusercontent.com",
    "manifest-src 'self'",
    "worker-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,interactive-widget=overlays-content">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="referrer" content="no-referrer">
<meta name="color-scheme" content="dark light">
<meta name="theme-color" content="#090a0e">
<title>Seaxch</title>
<link rel="icon" href="${FAVICON}">
<link rel="apple-touch-icon" href="icon-192.png">
<link rel="manifest" href="manifest.webmanifest">
<link rel="modulepreload" href="${t.mainJs}">
<style>${t.css}</style></head><body><main>
<header class="top-nav"><a href="#" class="brand" aria-label="Seaxch home"><span class="brand-text">Seaxch</span></a><div class="nav-actions"><a href="#settings" id="btn-settings" class="keycap btn-action" aria-label="Settings">${gearSvg(16)}</a></div></header>
<section class="hero"><h1>SEAXCH // SEARCH</h1><p class="hero-sub">Fast directory &amp; web dispatch</p></section>
<div class="bar" role="search"><div class="dock-input-inner">${SEARCH_ICON}<input id="q" type="search" placeholder="${searchPlaceholder}" aria-label="Search links" role="combobox" aria-expanded="false" aria-controls="list" aria-autocomplete="list" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go" dir="auto"><button id="clr" type="button" aria-label="Clear search" hidden>\u00d7</button></div><div class="dock-engine-row" id="dock-engines"><span class="dock-engine-label">Web:</span><button type="button" class="dock-chip dock-chip-yandex" data-engine="y" aria-label="Search Yandex">${yandexSvg(13)}<span>Yandex</span></button><button type="button" class="dock-chip dock-chip-google" data-engine="g" aria-label="Search Google">${googleSvg(13)}<span>Google</span></button><button type="button" class="dock-chip dock-chip-ai" data-engine="a" aria-label="Search Google AI">${googleAiSvg(13)}<span>Google AI</span></button><button type="button" class="dock-chip dock-chip-ddg" data-engine="d" aria-label="Search DuckDuckGo">${duckDuckGoSvg(13)}<span>DDG</span></button><button type="button" class="dock-chip dock-chip-github" data-engine="gh" aria-label="Search GitHub">${githubSvg(13)}<span>GitHub</span></button><button type="button" class="dock-chip dock-chip-wiki" data-engine="w" aria-label="Search Wikipedia">${wikiSvg(13)}<span>Wiki</span></button><button type="button" class="dock-chip dock-chip-reddit" data-engine="r" aria-label="Search Reddit">${redditSvg(13)}<span>Reddit</span></button></div></div>
<div class="opts">${nsfwChip}</div>
<p class="st" id="st" aria-live="polite" hidden></p>
<ol class="list" id="list" role="listbox" aria-label="Search results" hidden></ol>
<div id="more" hidden><button id="moreb" type="button" class="keycap">Show more</button></div>
<section id="home">
<div id="pins-sec" class="pins-sec" hidden><div class="sh"><h2>Pinned</h2><button id="edit" type="button" class="btn-text">Edit</button></div><div class="pins" id="pins"></div></div>
<div id="recents-sec" class="recents-sec" hidden><div class="sh"><h2>Recent</h2><button id="clr-recents" type="button" class="btn-text">Clear</button></div><div class="recents-row" id="recents-list"></div></div>
<div class="cats-hdr"><span class="cats-hdr-title">CATEGORIES DIRECTORY</span><span class="cats-hdr-count">${PAGES.length} SECTIONS</span></div>
<nav class="cats" id="cats" aria-label="Categories">${tiles}${nsfwTile}</nav>
</section>
<section id="view" hidden></section>
<section id="settings-view" class="settings-view" hidden></section>
<footer><div>Curated by <a href="https://fmhy.net" rel="noopener noreferrer">FMHY</a> · Synced <span id="sync">at build time</span></div><div class="footer-actions"><button type="button" id="btn-shortcuts" class="btn-text">${keyboardSvg(16)}<span> Keys</span></button></div></footer>
<div id="toast" class="toast" role="status" aria-live="polite" hidden></div>
</main><script type="module" src="${t.mainJs}"></script></body></html>`;
}

export function manifest() {
  return {
    name: "Seaxch",
    short_name: "Seaxch",
    description: "Instant start page for the FMHY link directory",
    start_url: "./",
    scope: "./",
    display: "standalone",
    background_color: "#090a0e",
    theme_color: "#090a0e",
    icons: [
      { src: "icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
