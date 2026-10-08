import { F_STAR } from "../shared/types";
import { canon } from "../shared/links";
import { PIN_SVG, starSvg } from "../shared/svg";
import { PAGES, NSFW_KEY } from "../shared/pages";
import type { Row } from "./model";
import { isPinned } from "./pins";
import { prefs } from "./store";

const PAGE_HUES: Record<string, number> = Object.fromEntries(
  PAGES.map((p, i) => [p.k, Math.round((i * 137.508) % 360)]),
);
PAGE_HUES[NSFW_KEY] = Math.round((PAGES.length * 137.508) % 360);
export const catHue = (k: string) => PAGE_HUES[k] ?? 200;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function link(url: string, text: string, cls: string): HTMLAnchorElement {
  const a = el("a", cls, text);
  a.href = url;
  a.rel = "noopener noreferrer";
  if (prefs.newTab) a.target = "_blank";
  return a;
}

// static markup only; nothing from the dataset ever goes through innerHTML
const PIN = PIN_SVG;

export function pinButton(url: string, name: string): HTMLButtonElement {
  const b = el("button", "pb keycap");
  b.type = "button";
  b.dataset.u = url;
  b.dataset.n = name;
  b.dataset.k = canon(url);
  setPinned(b, isPinned(url));
  b.innerHTML = PIN;
  return b;
}

export function setPinned(b: HTMLElement, on: boolean): void {
  b.setAttribute("aria-pressed", String(on));
  b.setAttribute("aria-label", (on ? "Unpin " : "Pin ") + b.dataset.n);
  b.title = on ? "Unpin" : "Pin to start page";
}

export function rowEl(r: Row, o: { also?: Row[]; where?: boolean } = {}): HTMLLIElement {
  const li = el("li", "r");

  const m = el("div", "m");
  const t = el("div", "t");
  const a = link(r.u, r.n, "n");
  a.dir = "auto";
  if (r.h) a.title = r.h;
  t.append(a);
  if (r.f & F_STAR) {
    const star = el("span", "s");
    star.title = "Starred by FMHY";
    star.setAttribute("aria-hidden", "true");
    star.innerHTML = starSvg(12);
    t.append(star);
  }
  m.append(t);

  if (r.d) {
    const d = el("p", "d", r.d.split(/\s+\/\s+/).join(" \u00b7 "));
    d.dir = "auto";
    d.title = r.d;
    m.append(d);
  }

  if (r.a.length || r.x.length) {
    const x = el("div", "x");
    for (const [l, u] of r.a) x.append(link(u, "Mirror " + l, "c"));
    for (const [l, u] of r.x) x.append(link(u, l, "c"));
    m.append(x);
  }

  if (o.where) {
    const w = el("p", "w");
    const dot = el("span", "cat-dot");
    dot.style.setProperty("--h", String(catHue(r.pk)));
    const loc = el("span", "loc-txt", [r.pn, r.sc, r.sb].filter(Boolean).join(" \u203a "));
    w.append(dot, loc);
    if (o.also?.length) {
      w.append(el("span", "also-txt", `  \u00b7  +${o.also.length} more place${o.also.length > 1 ? "s" : ""}`));
    }
    m.append(w);
  }

  li.append(m, pinButton(r.u, r.n));
  return li;
}
