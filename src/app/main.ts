/*
 * Critical path (target <= 6 KB gzip): preferences, pins, wiring. Everything heavy (dataset, uFuzzy, search UI,
 * category views, updater) lives in ./core and is loaded after first paint or on first interaction.
 */
import { bump, renderPins, togglePin } from "./pins";
import { addRecent, prefs, save } from "./store";
import { showToast } from "./toast";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const q = $<HTMLInputElement>("q");
const pins = $("pins");

function applyTheme(theme: string) {
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}
applyTheme(prefs.theme);

renderPins(pins);

pins.addEventListener("click", (e) => {
  const t = e.target as HTMLElement;
  const rm = t.closest<HTMLElement>(".rm");
  if (rm) {
    e.preventDefault();
    const u = rm.dataset.u!;
    const p = prefs.pins.find((x) => x[0] === u);
    const n = p ? p[1] : "";
    togglePin(u, "");
    renderPins(pins);
    document.dispatchEvent(new CustomEvent("fh:pins"));
    showToast(`Unpinned ${n || "link"}`, () => {
      togglePin(u, n);
      renderPins(pins);
      document.dispatchEvent(new CustomEvent("fh:pins"));
    });
    return;
  }
  const sc = t.closest<HTMLElement>(".starter-chip");
  if (sc) {
    e.preventDefault();
    const u = sc.dataset.u!;
    const n = sc.dataset.n!;
    togglePin(u, n);
    renderPins(pins);
    document.dispatchEvent(new CustomEvent("fh:pins"));
    showToast(`Pinned ${n}`, () => {
      togglePin(u, n);
      renderPins(pins);
      document.dispatchEvent(new CustomEvent("fh:pins"));
    });
    return;
  }
  const a = t.closest<HTMLAnchorElement>("a.pin");
  if (a) {
    bump(a.dataset.u!);
    addRecent(a.href, a.querySelector(".lb")?.textContent || "", a.hostname.replace(/^www\./, ""));
  }
});

pins.addEventListener("auxclick", (e) => {
  const a = (e.target as HTMLElement).closest<HTMLAnchorElement>("a.pin");
  if (a) {
    bump(a.dataset.u!);
    addRecent(a.href, a.querySelector(".lb")?.textContent || "", a.hostname.replace(/^www\./, ""));
  }
});

for (const id of ["star", "nsfw"] as const) {
  const box = $<HTMLInputElement>(id);
  if (!box) continue;
  box.checked = prefs[id];
  box.addEventListener("change", () => {
    prefs[id] = box.checked;
    save();
    document.dispatchEvent(new CustomEvent("fh:prefs"));
  });
}

// Layout state reacts instantly for mobile search bar docking
const body = document.body;
q.addEventListener("focus", () => body.classList.add("f"));
q.addEventListener("blur", () => body.classList.remove("f"));
q.addEventListener("input", () => body.classList.toggle("q", !!q.value.trim()));

const edit = $("edit");
edit.addEventListener("click", () => {
  const on = pins.classList.toggle("edit");
  edit.textContent = on ? "Done" : "Edit";
});

let core: Promise<unknown> | undefined;
const loadCore = () => (core ??= import("./core"));
q.addEventListener("focus", loadCore, { once: true });
q.addEventListener("input", loadCore, { once: true });
addEventListener("hashchange", loadCore);
if (location.hash.length > 1) loadCore();

// Trigger core on dialogs/actions
$("btn-settings")?.addEventListener("click", () => {
  void loadCore().then(() => document.dispatchEvent(new CustomEvent("fh:open-settings")));
});
$("btn-shortcuts")?.addEventListener("click", () => {
  void loadCore().then(() => document.dispatchEvent(new CustomEvent("fh:open-shortcuts")));
});

// Rotating search placeholder
const initialPlaceholder = q.placeholder;
const PLACEHOLDERS = [
  initialPlaceholder,
  'Try "adblock", "ublock", "dns"...',
  'Try "streaming", "anime", "movies"...',
  'Try "audio", "flac", "podcasts"...',
  'Try "books", "libgen", "manga"...',
  'No match? Tap Google / AI Mode / DuckDuckGo / Yandex below...',
  'Press / or Ctrl+K to search',
];
let phIdx = 0;
setInterval(() => {
  if (document.activeElement === q || q.value.trim()) return;
  phIdx = (phIdx + 1) % PLACEHOLDERS.length;
  q.placeholder = PLACEHOLDERS[phIdx]!;
}, 3500);

// Focus search only where keyboard is primary input
if (matchMedia("(hover: hover) and (pointer: fine)").matches) q.focus({ preventScroll: true });

addEventListener("load", () => {
  (window.requestIdleCallback ?? ((f: () => void) => setTimeout(f, 300)))(() => void loadCore());
  if ("serviceWorker" in navigator) navigator.serviceWorker.register(__SW__).catch(() => {});
});
