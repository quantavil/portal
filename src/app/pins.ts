import { canon } from "../shared/links";
import { prefs, save } from "./store";

const find = (url: string) => prefs.pins.findIndex((p) => canon(p[0]) === canon(url));
export const isPinned = (url: string) => find(url) >= 0;

export const STARTER_PINS: [url: string, name: string][] = [
  ["https://ublockorigin.com/", "uBlock Origin"],
  ["https://annas-archive.org/", "Anna's Archive"],
  ["https://freetubeapp.io/", "FreeTube"],
  ["https://archive.org/", "Internet Archive"],
  ["https://fmhy.net/", "FMHY Wiki"],
];

export function togglePin(url: string, name: string): boolean {
  const i = find(url);
  if (i >= 0) prefs.pins.splice(i, 1);
  else prefs.pins.push([url, name, 0]);
  save();
  return i < 0;
}

export function bump(url: string): void {
  const i = find(url);
  if (i < 0) return;
  prefs.pins[i]![2]++;
  save();
}

/** Pins ranked by clicks (stable for ties). Re-ranked only on load, so tiles never jump under your cursor. */
export function renderPins(el: HTMLElement): void {
  el.textContent = "";
  const edit = document.getElementById("edit");
  if (edit) edit.hidden = !prefs.pins.length;
  if (!prefs.pins.length) {
    el.classList.remove("edit");
    if (edit) edit.textContent = "Edit";
  }
  const ranked = prefs.pins.map((p, i) => ({ p, i })).sort((a, b) => b.p[2] - a.p[2] || a.i - b.i);
  if (!ranked.length) {
    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = "Pin a site with the pin button on any result. Pins stay in this browser.";

    const starters = document.createElement("div");
    starters.className = "starter-box";
    const lbl = document.createElement("span");
    lbl.className = "starter-lbl";
    lbl.textContent = "Quick Starter Pins:";
    const chips = document.createElement("div");
    chips.className = "starter-chips";

    for (const [u, n] of STARTER_PINS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "starter-chip keycap";
      btn.dataset.u = u;
      btn.dataset.n = n;
      const txt = document.createElement("span");
      txt.className = "starter-txt";
      txt.textContent = `+ ${n}`;
      btn.append(txt);
      chips.append(btn);
    }

    starters.append(lbl, chips);
    el.append(hint, starters);
    return;
  }
  for (const { p } of ranked) {
    const a = document.createElement("a");
    a.className = "pin keycap";
    a.href = p[0];
    a.rel = "noopener noreferrer";
    if (prefs.newTab) a.target = "_blank";
    a.dataset.u = p[0];
    const label = document.createElement("span");
    label.className = "lb";
    label.textContent = p[1];
    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "rm";
    rm.dataset.u = p[0];
    rm.setAttribute("aria-label", "Remove " + p[1]);
    rm.textContent = "\u00d7";
    a.append(label, rm);
    el.append(a);
  }
}
