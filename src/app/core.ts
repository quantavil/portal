/** Loaded after first paint (or on first interaction): dataset, search, category views, updater. */
import { F_STAR, type PageData, type Seed } from "../shared/types";
import { loadNsfw, loadSeed, mergePages, readStored } from "./data";
import { idbKV } from "./kv";
import { entryRow, toRows, type Row } from "./model";
import { isPinned, renderPins, togglePin } from "./pins";
import { catHue, pinButton, rowEl, setPinned } from "./render";
import { buildIndex, search, type Hit, type Index } from "./search";
import {
  backSvg,
  copySvg,
  searchSvg,
  yandexSvg,
  googleSvg,
  googleAiSvg,
  duckDuckGoSvg,
  githubSvg,
  wikiSvg,
  redditSvg,
  arrowUpSvg,
  arrowDownSvg,
  dragHandleSvg,
} from "../shared/svg";
import { addRecent, clearRecents, prefs, save, type Theme } from "./store";
import { showToast } from "./toast";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const q = $<HTMLInputElement>("q");
const clr = $("clr");
const st = $("st");
const list = $("list");
const more = $("more");
const home = $("home");
const view = $("view");
const pinsEl = $("pins");
const recentsSec = $("recents-sec");
const recentsList = $("recents-list");
const PAGE = 50;

let seed: Seed;
let pages: PageData[] = [];
let nsfwPage: PageData | null = null;
let ix: Index;
let hits: Hit[] = [];
let limit = PAGE;
let sel = -1;
let ready = false;
let hasNavigated = false;
let catObs: IntersectionObserver | null = null;

const fmt = (n: number) => n.toLocaleString();
const vis = () => pages.filter((p) => !p.nsfw || prefs.nsfw);
const countOf = (p: PageData) => p.s.reduce((n, s) => n + s.e.length + s.b.reduce((m, b) => m + b.e.length, 0), 0);

// ---------- external search: tap-only chips + zero-hit rows, no remote fetch ----------
const ENGINES = {
  y: { n: "Yandex", u: (s: string) => (s ? `https://yandex.com/search/?text=${encodeURIComponent(s)}` : "https://yandex.com"), svg: yandexSvg, cls: "dock-chip-yandex" },
  g: { n: "Google", u: (s: string) => (s ? `https://www.google.com/search?q=${encodeURIComponent(s)}` : "https://www.google.com"), svg: googleSvg, cls: "dock-chip-google" },
  a: { n: "Google AI", u: (s: string) => (s ? `https://www.google.com/search?udm=50&q=${encodeURIComponent(s)}` : "https://www.google.com/search?udm=50"), svg: googleAiSvg, cls: "dock-chip-ai" },
  d: { n: "DDG", u: (s: string) => (s ? `https://duckduckgo.com/?q=${encodeURIComponent(s)}` : "https://duckduckgo.com"), svg: duckDuckGoSvg, cls: "dock-chip-ddg" },
  gh: { n: "GitHub", u: (s: string) => (s ? `https://github.com/search?q=${encodeURIComponent(s)}` : "https://github.com"), svg: githubSvg, cls: "dock-chip-github" },
  w: { n: "Wiki", u: (s: string) => (s ? `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(s)}` : "https://en.wikipedia.org"), svg: wikiSvg, cls: "dock-chip-wiki" },
  r: { n: "Reddit", u: (s: string) => (s ? `https://www.reddit.com/r/piracy/search/?q=${encodeURIComponent(s)}` : "https://www.reddit.com/r/piracy"), svg: redditSvg, cls: "dock-chip-reddit" },
} as const;
type EngineKey = keyof typeof ENGINES;

function renderDockEngines() {
  const row = document.getElementById("dock-engines");
  if (!row) return;
  row.textContent = "";
  const lbl = document.createElement("span");
  lbl.className = "dock-engine-label";
  lbl.textContent = "Web:";
  row.append(lbl);

  const disabled = new Set(prefs.disabledEngines);
  const ordered = prefs.engines.filter((k) => k in ENGINES && !disabled.has(k)) as EngineKey[];

  for (const k of ordered) {
    const conf = ENGINES[k];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `dock-chip ${conf.cls}`;
    btn.dataset.engine = k;
    btn.draggable = true;
    btn.setAttribute("aria-label", `Search ${conf.n}`);
    btn.innerHTML = `${conf.svg(13)}<span>${conf.n}</span>`;

    btn.addEventListener("dragstart", (e) => {
      e.dataTransfer?.setData("text/plain", `dock:${k}`);
      btn.classList.add("dragging");
    });
    btn.addEventListener("dragend", () => {
      btn.classList.remove("dragging");
      row.querySelectorAll(".dock-chip").forEach((b) => b.classList.remove("drag-over"));
    });
    btn.addEventListener("dragover", (e) => {
      e.preventDefault();
      btn.classList.add("drag-over");
    });
    btn.addEventListener("dragleave", () => {
      btn.classList.remove("drag-over");
    });
    btn.addEventListener("drop", (e) => {
      e.preventDefault();
      btn.classList.remove("drag-over");
      const data = e.dataTransfer?.getData("text/plain") || "";
      if (data.startsWith("dock:")) {
        const fromKey = data.slice(5);
        if (fromKey !== k) {
          const fromIdx = prefs.engines.indexOf(fromKey);
          const toIdx = prefs.engines.indexOf(k);
          if (fromIdx >= 0 && toIdx >= 0) {
            const [moved] = prefs.engines.splice(fromIdx, 1);
            prefs.engines.splice(toIdx, 0, moved!);
            save();
            renderDockEngines();
            const sv = $("settings-view");
            if (sv && !sv.hidden) renderSettingsPage(sv);
          }
        }
      }
    });

    row.append(btn);
  }
}
function openExternal(url: string) {
  if (prefs.newTab) window.open(url, "_blank", "noopener,noreferrer");
  else location.assign(url);
}

/** Chip strip under the status line. Shown for any non-empty term; Tab-reachable on desktop, tap on mobile. */
function extStripEl(): HTMLElement {
  const found = document.getElementById("ext");
  if (found) return found;
  const bar = document.createElement("div");
  bar.id = "ext";
  bar.className = "ext-strip";
  bar.hidden = true;
  st.after(bar);
  return bar;
}

function renderExtStrip(term: string) {
  const bar = extStripEl();
  bar.textContent = "";
  if (!term) {
    bar.hidden = true;
    return;
  }
  const lbl = document.createElement("span");
  lbl.className = "ext-lbl";
  lbl.textContent = "Web:";
  bar.append(lbl);
  const disabled = new Set(prefs.disabledEngines);
  const ordered = prefs.engines.filter((k) => k in ENGINES && !disabled.has(k)) as EngineKey[];
  ordered.forEach((k) => {
    const conf = ENGINES[k];
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ext-chip keycap";
    b.innerHTML = `${conf.svg(12)}<span>${conf.n}</span>`;
    b.setAttribute("aria-label", `Search ${conf.n} for "${term}"`);
    b.addEventListener("click", () => openExternal(conf.u(term)));
    bar.append(b);
  });
  bar.hidden = false;
}

/** Zero-hit external row. Plain anchor (class ext-link, never a.n) so recents never record it. */
function extRow(k: EngineKey, term: string, idx: number): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "r ext-row";
  li.setAttribute("role", "option");
  li.id = `sx-${idx}`;
  li.setAttribute("aria-selected", "false");
  const m = document.createElement("div");
  m.className = "m";
  const t = document.createElement("div");
  t.className = "t";
  const a = document.createElement("a");
  a.className = "ext-link";
  a.dir = "auto";
  a.href = ENGINES[k].u(term);
  a.rel = "noopener noreferrer";
  if (prefs.newTab) a.target = "_blank";
  a.textContent = `Search ${ENGINES[k].n} for \u201c${term}\u201d`;
  t.append(a);
  m.append(t);
  li.append(m);
  li.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest("a")) return;
    openExternal(ENGINES[k].u(term));
  });
  return li;
}

function rebuild() {
  const all = nsfwPage ? [...pages.filter((p) => !p.nsfw), nsfwPage] : pages.filter((p) => !p.nsfw);
  pages = all;
  ix = buildIndex(toRows(pages));
  for (const p of pages) {
    const tile = document.getElementById("t-" + p.k);
    if (tile) tile.querySelector("i")!.textContent = fmt(countOf(p));
  }
}

async function ensureNsfw() {
  if (!prefs.nsfw || nsfwPage) return;
  try {
    nsfwPage = await loadNsfw();
    if (nsfwPage) rebuild();
  } catch {
    st.hidden = false;
    st.textContent = "Could not load the NSFW list. It will be retried next time you turn it on.";
  }
}

function syncNsfwTile() {
  const t = document.getElementById("t-nsfw");
  if (t) t.hidden = !(prefs.nsfw && nsfwPage);
}

// ---------- recents ----------
function renderRecents() {
  if (!recentsSec || !recentsList) return;
  if (!prefs.recents.length) {
    recentsSec.hidden = true;
    recentsList.textContent = "";
    return;
  }
  recentsList.textContent = "";
  for (const [u, n] of prefs.recents) {
    const a = document.createElement("a");
    a.className = "recent-chip keycap";
    a.href = u;
    a.rel = "noopener noreferrer";
    if (prefs.newTab) a.target = "_blank";
    const lb = document.createElement("span");
    lb.textContent = n;
    a.append(lb);
    recentsList.append(a);
  }
  recentsSec.hidden = false;
}

// ---------- results ----------
function mark(i: number) {
  const prev = list.children[sel] as HTMLElement | undefined;
  prev?.classList.remove("on");
  prev?.setAttribute("aria-selected", "false");
  sel = i;
  const li = list.children[sel] as HTMLElement | undefined;
  if (!li) {
    q.removeAttribute("aria-activedescendant");
    return;
  }
  li.classList.add("on");
  li.setAttribute("aria-selected", "true");
  if (li.id) q.setAttribute("aria-activedescendant", li.id);
  li.scrollIntoView({ block: "nearest" });
}

function showResults(term: string) {
  const r = search(ix, term, { star: prefs.star, nsfw: prefs.nsfw }, limit);
  hits = r.hits;
  st.hidden = false;
  renderExtStrip(term);
  if (!r.total) {
    st.textContent = `Nothing matches \u201c${term}\u201d. Try fewer or shorter words, or search the web below.`;
    const rows = (Object.keys(ENGINES) as EngineKey[]).map((k, i) => extRow(k, term, i));
    list.replaceChildren(...rows);
    list.hidden = false;
    q.setAttribute("aria-expanded", "true");
    more.hidden = true;
    sel = -1;
    q.removeAttribute("aria-activedescendant");
    return;
  }
  st.textContent = `${fmt(r.total)} result${r.total === 1 ? "" : "s"}`;
  const nodes = hits.map((h, idx) => {
    const li = rowEl(h.r, { also: h.also, where: true });
    li.setAttribute("role", "option");
    li.id = `sr-${idx}`;
    li.setAttribute("aria-selected", "false");
    return li;
  });
  list.replaceChildren(...nodes);
  list.hidden = false;
  q.setAttribute("aria-expanded", hits.length ? "true" : "false");
  more.hidden = r.total <= hits.length;
  sel = -1;
  q.removeAttribute("aria-activedescendant");
  if (hits.length) mark(0);
}

// ---------- category view ----------
function searchIconSvg(): SVGSVGElement {
  const wrap = document.createElement("span");
  wrap.innerHTML = searchSvg(18);
  const svg = wrap.firstChild as SVGSVGElement;
  svg.setAttribute("aria-hidden", "true");
  return svg;
}

type RowItem = { el: HTMLElement; text: string };
type SubGroup = { subLi: HTMLElement; subText: string; rows: RowItem[] };
type SecData = {
  sec: HTMLElement;
  countEl: HTMLElement;
  origCount: number;
  direct: RowItem[];
  subs: SubGroup[];
};

function sectionEl(p: PageData, s: PageData["s"][number], idx: number): SecData | null {
  const keep = (e: { 3: number }) => !prefs.star || !!(e[3] & F_STAR);
  const direct = s.e.filter(keep);
  const subs = s.b.map((b) => ({ n: b.n, e: b.e.filter(keep) })).filter((b) => b.e.length);
  const n = direct.length + subs.reduce((m, b) => m + b.e.length, 0);
  if (!n) return null;

  const sec = document.createElement("section");
  sec.className = "cat-sec";
  sec.id = `sec-${idx}`;

  const hdr = document.createElement("div");
  hdr.className = "cat-sec-header";

  const left = document.createElement("div");
  left.className = "cat-sec-header-left";
  const h3 = document.createElement("h3");
  h3.textContent = s.n;
  const count = document.createElement("span");
  count.className = "cat-sec-count";
  count.textContent = fmt(n);
  left.append(h3, count);

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "btn-text btn-copy-sec";
  copyBtn.title = `Copy link to section "${s.n}"`;
  copyBtn.setAttribute("aria-label", `Copy link to section ${s.n}`);
  copyBtn.innerHTML = copySvg(14);
  copyBtn.addEventListener("click", () => {
    const u = new URL(location.href);
    u.hash = `${p.k}?sec=sec-${idx}`;
    navigator.clipboard?.writeText(u.href).catch(() => {});
    showToast(`Copied link to "${s.n}"`);
  });

  hdr.append(left, copyBtn);

  const ol = document.createElement("ol");
  ol.className = "list";
  const directRows: RowItem[] = [];
  for (const e of direct) {
    const el = rowEl(entryRow(e, p, s.n, ""));
    directRows.push({ el, text: `${e[0]} ${e[2]}`.toLowerCase() });
    ol.append(el);
  }
  const subGroups: SubGroup[] = [];
  for (const b of subs) {
    const subLi = document.createElement("li");
    subLi.className = "sub";
    subLi.textContent = b.n;
    ol.append(subLi);
    const subRows: RowItem[] = [];
    for (const e of b.e) {
      const el = rowEl(entryRow(e, p, s.n, b.n));
      subRows.push({ el, text: `${e[0]} ${e[2]}`.toLowerCase() });
      ol.append(el);
    }
    subGroups.push({ subLi, subText: b.n.toLowerCase(), rows: subRows });
  }

  sec.append(hdr, ol);
  return { sec, countEl: count, origCount: n, direct: directRows, subs: subGroups };
}

function showView(p: PageData) {
  const topBar = document.createElement("div");
  topBar.className = "cat-top-bar";
  const back = document.createElement("button");
  back.type = "button";
  back.className = "back keycap";
  back.setAttribute("aria-label", "Back to Categories");
  back.innerHTML = `${backSvg(16)}<span>Back to Categories</span>`;
  back.addEventListener("click", () => {
    if (hasNavigated && history.length > 1) {
      history.back();
    } else {
      location.hash = "";
    }
  });
  topBar.append(back);

  const hueVal = catHue(p.k);
  const hero = document.createElement("div");
  hero.className = "cat-hero";
  hero.style.setProperty("--h", String(hueVal));

  const heroTop = document.createElement("div");
  heroTop.className = "cat-hero-top";

  const titleWrap = document.createElement("div");
  titleWrap.className = "m";
  const h = document.createElement("h2");
  h.textContent = p.n;
  const pills = document.createElement("div");
  pills.className = "cat-meta-pills";
  const pillLinks = document.createElement("span");
  pillLinks.className = "pill-badge";
  pillLinks.textContent = `${fmt(countOf(p))} links`;
  const pillSecs = document.createElement("span");
  pillSecs.className = "pill-badge";
  pillSecs.textContent = `${p.s.length} sections`;
  pills.append(pillLinks, pillSecs);
  titleWrap.append(h, pills);

  heroTop.append(titleWrap);

  // Scoped search box inside hero
  const searchBox = document.createElement("div");
  searchBox.className = "cat-search-box";
  const catInput = document.createElement("input");
  catInput.type = "search";
  catInput.id = "cat-q";
  catInput.placeholder = `Filter in ${p.n}\u2026`;
  catInput.setAttribute("aria-label", `Filter in ${p.n}`);
  catInput.autocomplete = "off";
  catInput.autocapitalize = "off";
  catInput.spellcheck = false;
  const catClr = document.createElement("button");
  catClr.type = "button";
  catClr.id = "cat-clr";
  catClr.textContent = "\u00d7";
  catClr.setAttribute("aria-label", "Clear filter");
  catClr.hidden = true;
  catClr.addEventListener("click", () => {
    catInput.value = "";
    catClr.hidden = true;
    clearTimeout(filterTimer);
    cancelAnimationFrame(filterRaf);
    filterCat("");
    catInput.focus();
  });
  let filterTimer = 0;
  let filterRaf = 0;
  catInput.addEventListener("input", () => {
    const val = catInput.value;
    catClr.hidden = !val;
    clearTimeout(filterTimer);
    cancelAnimationFrame(filterRaf);
    filterTimer = window.setTimeout(() => {
      filterRaf = requestAnimationFrame(() => filterCat(val));
    }, 30);
  });
  catInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      catInput.value = "";
      catClr.hidden = true;
      clearTimeout(filterTimer);
      cancelAnimationFrame(filterRaf);
      filterCat("");
    }
  });

  searchBox.append(searchIconSvg(), catInput, catClr);
  hero.append(heroTop, searchBox);

  // Mobile horizontal section chips
  const secChips = document.createElement("nav");
  secChips.className = "sec-chips";
  secChips.setAttribute("aria-label", `Sections in ${p.n}`);
  p.s.forEach((s, idx) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "sec-chip keycap";
    const span = document.createElement("span");
    span.textContent = s.n;
    const ct = document.createElement("i");
    ct.className = "chip-count";
    ct.textContent = fmt(s.e.length + s.b.reduce((m, b) => m + b.e.length, 0));
    chip.append(span, ct);
    chip.addEventListener("click", () => {
      document.getElementById(`sec-${idx}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    secChips.append(chip);
  });

  // Desktop rail
  const rail = document.createElement("aside");
  rail.className = "cat-rail";
  rail.setAttribute("aria-label", "Category sections");
  const railTitle = document.createElement("div");
  railTitle.className = "cat-rail-title";
  railTitle.textContent = "SECTIONS";
  const railNav = document.createElement("nav");
  railNav.className = "cat-rail-nav";
  p.s.forEach((s, idx) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `cat-rail-item${idx === 0 ? " active" : ""}`;
    item.dataset.target = `sec-${idx}`;
    const span = document.createElement("span");
    span.textContent = s.n;
    const ct = document.createElement("i");
    ct.textContent = fmt(s.e.length + s.b.reduce((m, b) => m + b.e.length, 0));
    item.append(span, ct);
    item.addEventListener("click", () => {
      document.getElementById(`sec-${idx}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    railNav.append(item);
  });
  rail.append(railTitle, railNav);

  // Content column
  const content = document.createElement("div");
  content.className = "cat-content";
  const secDataList = p.s
    .map((s, idx) => sectionEl(p, s, idx))
    .filter((x): x is SecData => !!x);
  const secEls = secDataList.map((d) => d.sec);
  content.append(...secEls);

  const catLayout = document.createElement("div");
  catLayout.className = "cat-layout";
  catLayout.append(rail, content);

  function filterCat(qStr: string) {
    const terms = qStr.trim().toLowerCase().split(/\s+/).filter(Boolean);
    for (const sc of secDataList) {
      let visible = 0;
      for (const r of sc.direct) {
        const match = !terms.length || terms.every((t) => r.text.includes(t));
        if (r.el.hidden !== !match) r.el.hidden = !match;
        if (match) visible++;
      }
      for (const sub of sc.subs) {
        let subVis = 0;
        const subMatch = terms.length > 0 && terms.every((t) => sub.subText.includes(t));
        for (const r of sub.rows) {
          const match = !terms.length || subMatch || terms.every((t) => r.text.includes(t));
          if (r.el.hidden !== !match) r.el.hidden = !match;
          if (match) {
            visible++;
            subVis++;
          }
        }
        const hideSub = terms.length > 0 && subVis === 0;
        if (sub.subLi.hidden !== hideSub) sub.subLi.hidden = hideSub;
      }
      const hideSec = visible === 0;
      if (sc.sec.hidden !== hideSec) sc.sec.hidden = hideSec;
      const txt = fmt(terms.length ? visible : sc.origCount);
      if (sc.countEl.textContent !== txt) sc.countEl.textContent = txt;
    }
  }

  if (catObs) {
    catObs.disconnect();
    catObs = null;
  }
  if ("IntersectionObserver" in window) {
    const railItems = rail.querySelectorAll(".cat-rail-item");
    catObs = new IntersectionObserver((entries) => {
      if (catInput.value.trim()) return;
      for (const ent of entries) {
        if (ent.isIntersecting) {
          const id = ent.target.id;
          for (const it of railItems) {
            it.classList.toggle("active", (it as HTMLElement).dataset.target === id);
          }
        }
      }
    }, { rootMargin: "-10% 0px -70% 0px" });
    for (const s of secEls) catObs.observe(s);
  }

  const elements: HTMLElement[] = [topBar, hero, secChips, catLayout];
  view.replaceChildren(...elements);
  scrollTo(0, 0);

  const hash = location.hash;
  const secMatch = hash.match(/\?sec=(sec-\d+)/);
  if (secMatch) {
    const targetEl = document.getElementById(secMatch[1]!);
    if (targetEl) targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

// ---------- routing ----------
function route() {
  if (!ready) return;
  const term = q.value.trim();
  document.body.classList.toggle("q", !!term);
  clr.hidden = !q.value;
  const key = decodeURIComponent(location.hash.slice(1).split("?")[0] || "");
  const isSettings = key === "settings";
  const page = !isSettings ? vis().find((p) => p.k === key) : undefined;
  const showRes = !!term;
  const showVw = !showRes && !!page;
  const showSettings = !showRes && isSettings;

  const barEl = document.querySelector<HTMLElement>(".bar");
  const optsEl = document.querySelector<HTMLElement>(".opts");
  if (barEl) barEl.hidden = showVw || showSettings;
  if (optsEl) optsEl.hidden = showVw || showSettings;

  if (!showRes) document.getElementById("ext")?.setAttribute("hidden", "");
  list.hidden = !showRes;
  st.hidden = !showRes;
  view.hidden = !showVw;
  const settingsView = $("settings-view");
  if (settingsView) {
    settingsView.hidden = !showSettings;
    if (showSettings) {
      renderSettingsPage(settingsView);
      window.scrollTo(0, 0);
    }
  }
  home.hidden = showRes || showVw || showSettings;
  if (showRes) showResults(term);
  else if (showVw) showView(page!);
  else if (!showSettings) {
    q.setAttribute("aria-expanded", "false");
    q.removeAttribute("aria-activedescendant");
  }
  more.hidden = more.hidden || !showRes;
}

let searchTimer = 0;
const schedule = () => {
  limit = PAGE;
  clearTimeout(searchTimer);
  searchTimer = window.setTimeout(route, 70);
};

// ---------- events ----------
q.addEventListener("input", schedule);
clr.addEventListener("click", () => {
  q.value = "";
  schedule();
  q.focus();
});
$("moreb")?.addEventListener("click", () => {
  limit += 100;
  route();
});
addEventListener("hashchange", () => {
  hasNavigated = true;
  route();
});

q.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    if (!hits.length) return;
    e.preventDefault();
    mark(Math.min(hits.length - 1, Math.max(0, sel + (e.key === "ArrowDown" ? 1 : -1))));
  } else if (e.key === "Enter") {
    const h = hits[sel >= 0 ? sel : 0];
    if (!h || list.hidden) return;
    e.preventDefault();
    addRecent(h.r.u, h.r.n, h.r.h);
    if (prefs.newTab || e.ctrlKey || e.metaKey) {
      window.open(h.r.u, "_blank", "noopener,noreferrer");
      q.focus();
    } else {
      location.assign(h.r.u);
    }
  } else if (e.key === "Escape") {
    if (q.value) {
      q.value = "";
      schedule();
    } else {
      q.blur();
    }
  }
});

window.addEventListener("keydown", (e) => {
  const t = e.target as HTMLElement;
  const typing = t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t.isContentEditable;
  if ((e.key === "/" && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")) {
    e.preventDefault();
    q.focus();
    q.select();
  } else if (e.key === "?" && !typing) {
    e.preventDefault();
    const dlg = getShortcutsDialog();
    if (dlg.open) dlg.close();
    else dlg.showModal();
  } else if (e.key === "Escape") {
    if (location.hash === "#settings") {
      if (hasNavigated) history.back();
      else location.hash = "#";
    }
    (document.getElementById("shortcuts-dlg") as HTMLDialogElement | null)?.close();
  }
});

// Record recents on main link clicks only (extras like Subreddit/Discord are not sites)
document.addEventListener("click", (e) => {
  const t = e.target as HTMLElement;
  const a = t.closest<HTMLAnchorElement>("a.n");
  if (a && a.href && !a.href.startsWith("javascript:") && !a.href.startsWith("#")) {
    const host = a.hostname.replace(/^www\./, "");
    const name = a.textContent?.trim() || host;
    addRecent(a.href, name, host);
  }
});

// Pin toggle button with Undo toast
document.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>(".pb");
  if (!b) return;
  e.preventDefault();
  const u = b.dataset.u!;
  const n = b.dataset.n!;
  const on = togglePin(u, n);
  for (const o of document.querySelectorAll<HTMLElement>(".pb")) if (o.dataset.k === b.dataset.k) setPinned(o, on);
  renderPins(pinsEl);
  showToast(on ? `Pinned ${n}` : `Unpinned ${n}`, () => {
    const reverted = togglePin(u, n);
    for (const o of document.querySelectorAll<HTMLElement>(".pb")) if (o.dataset.k === b.dataset.k) setPinned(o, reverted);
    renderPins(pinsEl);
    document.dispatchEvent(new CustomEvent("fh:pins"));
  });
});

document.addEventListener("fh:pins", () => {
  for (const o of document.querySelectorAll<HTMLElement>(".pb")) setPinned(o, isPinned(o.dataset.u!));
});

document.addEventListener("fh:recents", () => {
  renderRecents();
});

document.addEventListener("fh:prefs", async () => {
  await ensureNsfw();
  syncNsfwTile();
  route();
});

// Clear recents buttons
$("clr-recents")?.addEventListener("click", () => clearRecents());

// ---------- dedicated settings page & draggable search engine workbench ----------
function renderSettingsPage(container: HTMLElement) {
  container.textContent = "";

  const hero = document.createElement("div");
  hero.className = "cat-hero settings-hero";

  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.className = "back keycap";
  backBtn.setAttribute("aria-label", "Back to Home");
  backBtn.innerHTML = `${backSvg(16)}<span>Back</span>`;
  backBtn.addEventListener("click", () => {
    if (hasNavigated) history.back();
    else location.hash = "#";
  });

  const titleGroup = document.createElement("div");
  titleGroup.className = "settings-page-title";
  const h1 = document.createElement("h1");
  h1.textContent = "Settings & Engines";
  const sub = document.createElement("p");
  sub.className = "settings-page-sub";
  sub.textContent = "Drag engines to reorder dock priority. Customize appearance and data backup.";
  titleGroup.append(h1, sub);

  hero.append(backBtn, titleGroup);

  const grid = document.createElement("div");
  grid.className = "settings-page-grid";

  // Section 1: Draggable Engine Reordering & Toggling
  const secEngines = document.createElement("div");
  secEngines.className = "settings-card";
  const hEngine = document.createElement("h3");
  hEngine.textContent = "Search Engines (Drag to Reorder)";
  const pEngine = document.createElement("p");
  pEngine.className = "setting-desc";
  pEngine.textContent = "Drag any engine to adjust order in the dock. Uncheck to disable.";
  secEngines.append(hEngine, pEngine);

  const engineList = document.createElement("div");
  engineList.className = "engine-sort-list";

  function refreshEngineList() {
    engineList.textContent = "";
    const disabledSet = new Set(prefs.disabledEngines);

    prefs.engines.forEach((k, idx) => {
      const conf = ENGINES[k as keyof typeof ENGINES];
      if (!conf) return;

      const row = document.createElement("div");
      row.className = "engine-sort-item";
      row.draggable = true;

      // Drag and drop event handlers
      row.addEventListener("dragstart", (e) => {
        e.dataTransfer?.setData("text/plain", `sort:${idx}`);
        row.classList.add("dragging");
      });
      row.addEventListener("dragend", () => {
        row.classList.remove("dragging");
        engineList.querySelectorAll(".engine-sort-item").forEach((el) => el.classList.remove("drag-over"));
      });
      row.addEventListener("dragover", (e) => {
        e.preventDefault();
        row.classList.add("drag-over");
      });
      row.addEventListener("dragleave", () => {
        row.classList.remove("drag-over");
      });
      row.addEventListener("drop", (e) => {
        e.preventDefault();
        row.classList.remove("drag-over");
        const data = e.dataTransfer?.getData("text/plain") || "";
        if (data.startsWith("sort:")) {
          const fromIdx = parseInt(data.slice(5), 10);
          const toIdx = idx;
          if (!isNaN(fromIdx) && fromIdx !== toIdx) {
            const [moved] = prefs.engines.splice(fromIdx, 1);
            prefs.engines.splice(toIdx, 0, moved!);
            save();
            renderDockEngines();
            refreshEngineList();
          }
        }
      });

      // Drag handle icon
      const handle = document.createElement("span");
      handle.className = "engine-drag-handle";
      handle.title = "Drag to reorder";
      handle.innerHTML = dragHandleSvg(14);

      // Checkbox
      const label = document.createElement("label");
      label.className = "engine-item-label";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !disabledSet.has(k);
      cb.addEventListener("change", () => {
        if (cb.checked) {
          prefs.disabledEngines = prefs.disabledEngines.filter((x) => x !== k);
        } else {
          if (!prefs.disabledEngines.includes(k)) prefs.disabledEngines.push(k);
        }
        save();
        renderDockEngines();
      });
      const iconSpan = document.createElement("span");
      iconSpan.className = "engine-icon";
      iconSpan.innerHTML = conf.svg(16);
      const nameSpan = document.createElement("span");
      nameSpan.className = "engine-name";
      nameSpan.textContent = conf.n;
      label.append(cb, iconSpan, nameSpan);

      // Reorder buttons [↑] [↓]
      const orderBtns = document.createElement("div");
      orderBtns.className = "engine-order-btns";

      const btnUp = document.createElement("button");
      btnUp.type = "button";
      btnUp.className = "keycap btn-arrow";
      btnUp.disabled = idx === 0;
      btnUp.innerHTML = arrowUpSvg(12);
      btnUp.setAttribute("aria-label", `Move ${conf.n} up`);
      btnUp.addEventListener("click", () => {
        if (idx > 0) {
          const temp = prefs.engines[idx - 1]!;
          prefs.engines[idx - 1] = prefs.engines[idx]!;
          prefs.engines[idx] = temp;
          save();
          renderDockEngines();
          refreshEngineList();
        }
      });

      const btnDown = document.createElement("button");
      btnDown.type = "button";
      btnDown.className = "keycap btn-arrow";
      btnDown.disabled = idx === prefs.engines.length - 1;
      btnDown.innerHTML = arrowDownSvg(12);
      btnDown.setAttribute("aria-label", `Move ${conf.n} down`);
      btnDown.addEventListener("click", () => {
        if (idx < prefs.engines.length - 1) {
          const temp = prefs.engines[idx + 1]!;
          prefs.engines[idx + 1] = prefs.engines[idx]!;
          prefs.engines[idx] = temp;
          save();
          renderDockEngines();
          refreshEngineList();
        }
      });

      orderBtns.append(btnUp, btnDown);
      row.append(handle, label, orderBtns);
      engineList.append(row);
    });
  }

  refreshEngineList();
  secEngines.append(engineList);

  // Section 2: General Preferences
  const secPrefs = document.createElement("div");
  secPrefs.className = "settings-card";
  const hPrefs = document.createElement("h3");
  hPrefs.textContent = "Preferences";
  secPrefs.append(hPrefs);

  // Appearance
  const rowTheme = document.createElement("div");
  rowTheme.className = "setting-row";
  const infoTheme = document.createElement("div");
  infoTheme.className = "setting-info";
  infoTheme.innerHTML = "<span>Appearance</span><p>Theme selection</p>";
  const themeBtns = document.createElement("div");
  themeBtns.className = "theme-btns";
  (["system", "light", "dark"] as Theme[]).forEach((t) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `keycap theme-btn${prefs.theme === t ? " on" : ""}`;
    btn.dataset.t = t;
    btn.textContent = t.charAt(0).toUpperCase() + t.slice(1);
    btn.addEventListener("click", () => {
      prefs.theme = t;
      save();
      themeBtns.querySelectorAll(".theme-btn").forEach((b) => b.classList.toggle("on", (b as HTMLElement).dataset.t === t));
      if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
      else delete document.documentElement.dataset.theme;
    });
    themeBtns.append(btn);
  });
  rowTheme.append(infoTheme, themeBtns);

  // New tab
  const rowNewTab = document.createElement("div");
  rowNewTab.className = "setting-row";
  rowNewTab.innerHTML = "<div class=\"setting-info\"><span>Open links in new tab</span><p>Keep Seaxch open</p></div>";
  const cbNewTab = document.createElement("input");
  cbNewTab.type = "checkbox";
  cbNewTab.className = "switch";
  cbNewTab.checked = prefs.newTab;
  cbNewTab.setAttribute("aria-label", "Open links in new tab");
  cbNewTab.addEventListener("change", () => {
    prefs.newTab = cbNewTab.checked;
    save();
  });
  rowNewTab.append(cbNewTab);

  // Starred only
  const rowStar = document.createElement("div");
  rowStar.className = "setting-row";
  rowStar.innerHTML = "<div class=\"setting-info\"><span>Starred only</span><p>Only show FMHY-starred links</p></div>";
  const cbStar = document.createElement("input");
  cbStar.type = "checkbox";
  cbStar.className = "switch";
  cbStar.checked = prefs.star;
  cbStar.setAttribute("aria-label", "Starred only");
  cbStar.addEventListener("change", () => {
    prefs.star = cbStar.checked;
    save();
    document.dispatchEvent(new CustomEvent("fh:prefs"));
  });
  rowStar.append(cbStar);

  secPrefs.append(rowTheme, rowNewTab, rowStar);

  // NSFW if enabled
  const mainBox = document.getElementById("nsfw") as HTMLInputElement | null;
  if (mainBox) {
    const rowNsfw = document.createElement("div");
    rowNsfw.className = "setting-row";
    rowNsfw.innerHTML = "<div class=\"setting-info\"><span>Show NSFW content</span><p>Include adult directory</p></div>";
    const cbNsfw = document.createElement("input");
    cbNsfw.type = "checkbox";
    cbNsfw.className = "switch";
    cbNsfw.checked = prefs.nsfw;
    cbNsfw.setAttribute("aria-label", "Show NSFW content");
    cbNsfw.addEventListener("change", () => {
      prefs.nsfw = cbNsfw.checked;
      mainBox.checked = prefs.nsfw;
      save();
      document.dispatchEvent(new CustomEvent("fh:prefs"));
    });
    rowNsfw.append(cbNsfw);
    secPrefs.append(rowNsfw);
  }

  // Section 3: Data & Pins
  const secData = document.createElement("div");
  secData.className = "settings-card";
  const hData = document.createElement("h3");
  hData.textContent = "Data & History";
  secData.append(hData);

  // Backup Pins
  const rowPins = document.createElement("div");
  rowPins.className = "setting-row";
  rowPins.innerHTML = "<div class=\"setting-info\"><span>Backup Pins</span><p>Export or import your saved pins</p></div>";
  const actionsPins = document.createElement("div");
  actionsPins.className = "setting-actions";
  const btnExport = document.createElement("button");
  btnExport.type = "button";
  btnExport.className = "keycap btn-sec";
  btnExport.textContent = "Export";
  btnExport.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(prefs.pins, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "seaxch-pins.json";
    a.click();
    URL.revokeObjectURL(url);
    showToast("Pins exported!");
  });
  const labelImport = document.createElement("label");
  labelImport.className = "keycap btn-sec file-btn";
  labelImport.textContent = "Import";
  const fileImport = document.createElement("input");
  fileImport.type = "file";
  fileImport.accept = ".json";
  fileImport.addEventListener("change", async () => {
    const f = fileImport.files?.[0];
    if (!f) return;
    try {
      const txt = await f.text();
      const data = JSON.parse(txt);
      if (Array.isArray(data) && data.every((x) => Array.isArray(x) && typeof x[0] === "string" && typeof x[1] === "string")) {
        prefs.pins = data.map((x) => [x[0], x[1], +x[2] || 0]);
        save();
        renderPins(pinsEl);
        document.dispatchEvent(new CustomEvent("fh:pins"));
        showToast("Pins imported successfully!");
      } else {
        showToast("Invalid pins JSON file format.");
      }
    } catch {
      showToast("Could not parse JSON file.");
    }
    fileImport.value = "";
  });
  labelImport.append(fileImport);
  actionsPins.append(btnExport, labelImport);
  rowPins.append(actionsPins);

  // Clear recents
  const rowRecents = document.createElement("div");
  rowRecents.className = "setting-row";
  rowRecents.innerHTML = "<div class=\"setting-info\"><span>Recent history</span><p>Clear visited link history</p></div>";
  const btnClearR = document.createElement("button");
  btnClearR.type = "button";
  btnClearR.className = "keycap btn-sec";
  btnClearR.textContent = "Clear";
  btnClearR.addEventListener("click", () => {
    clearRecents();
    showToast("Recent history cleared");
  });
  rowRecents.append(btnClearR);

  secData.append(rowPins, rowRecents);

  grid.append(secEngines, secPrefs, secData);
  container.append(hero, grid);
}

document.addEventListener("fh:open-settings", () => {
  location.hash = "#settings";
});

function getShortcutsDialog(): HTMLDialogElement {
  let dlg = document.getElementById("shortcuts-dlg") as HTMLDialogElement | null;
  if (dlg) return dlg;

  dlg = document.createElement("dialog");
  dlg.id = "shortcuts-dlg";
  dlg.className = "dlg";
  dlg.setAttribute("aria-labelledby", "shortcuts-h");

  const header = document.createElement("div");
  header.className = "dlg-header";
  const h3 = document.createElement("h3");
  h3.id = "shortcuts-h";
  h3.textContent = "Keyboard Shortcuts";
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "btn-text";
  closeBtn.setAttribute("aria-label", "Close shortcuts");
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", () => dlg!.close());
  header.append(h3, closeBtn);

  const body = document.createElement("div");
  body.className = "dlg-body";
  const grid = document.createElement("div");
  grid.className = "shortcuts-grid";

  const rows: [string, string][] = [
    ["/", "Focus search"],
    ["Ctrl+K", "Focus search"],
    ["↑  ↓", "Navigate search results"],
    ["↵ Enter", "Open link in new tab"],
    ["Esc", "Clear search / Close modal"],
    ["?", "Toggle keyboard shortcuts"],
  ];
  for (const [k, desc] of rows) {
    const kbd = document.createElement("kbd");
    kbd.textContent = k;
    const txt = document.createElement("span");
    txt.textContent = desc;
    grid.append(kbd, txt);
  }
  body.append(grid);
  dlg.append(header, body);
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg) dlg!.close();
  });
  document.body.append(dlg);
  return dlg;
}

document.addEventListener("fh:open-shortcuts", () => {
  const dlg = getShortcutsDialog();
  if (!dlg.open) dlg.showModal();
});

// ---------- boot ----------
async function boot() {
  renderDockEngines();
  try {
    seed = await loadSeed();
  } catch {
    st.hidden = false;
    st.textContent = "Could not load the link data. Check your connection and reload.";
    return;
  }
  const kv = idbKV();
  const stored = await readStored(kv, seed);
  pages = mergePages(seed, stored.pages);
  nsfwPage = null;
  rebuild();
  if (prefs.nsfw) await ensureNsfw();
  syncNsfwTile();
  renderRecents();
  $("sync").textContent = new Date(stored.meta.syncedAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  ready = true;
  route();

  (window.requestIdleCallback ?? ((f: () => void) => setTimeout(f, 2000)))(
    () => void import("./updater").then((m) => m.maybeUpdate(kv, seed)),
    { timeout: 10_000 },
  );
}

void boot();
export {};
