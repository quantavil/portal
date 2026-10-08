/** Synchronous per-browser preferences. One localStorage key, always wrapped: storage can be blocked or full. */
type Pin = [url: string, name: string, clicks: number];
type Recent = [url: string, name: string, host: string, time: number];
export type Theme = "system" | "light" | "dark";

const DEFAULT_ENGINES = ["y", "g", "a", "d", "gh", "w", "r"];

export type Prefs = {
  pins: Pin[];
  nsfw: boolean;
  star: boolean;
  newTab: boolean;
  theme: Theme;
  recents: Recent[];
  engines: string[];
  disabledEngines: string[];
};

const KEY = "fh1";

function read(): Prefs {
  const p: Prefs = {
    pins: [],
    nsfw: false,
    star: false,
    newTab: true,
    theme: "system",
    recents: [],
    engines: [...DEFAULT_ENGINES],
    disabledEngines: [],
  };
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || "{}");
    if (Array.isArray(o.pins)) {
      p.pins = o.pins
        .filter((x: unknown): x is Pin => Array.isArray(x) && typeof x[0] === "string" && typeof x[1] === "string")
        .map((x: Pin) => [x[0], x[1], +x[2] || 0]);
    }
    p.nsfw = o.nsfw === 1;
    p.star = o.star === 1;
    if (o.newTab !== undefined) p.newTab = o.newTab !== 0;
    if (o.theme === "light" || o.theme === "dark" || o.theme === "system") p.theme = o.theme;
    if (Array.isArray(o.recents)) {
      p.recents = o.recents
        .filter((x: unknown): x is Recent => Array.isArray(x) && typeof x[0] === "string" && typeof x[1] === "string")
        .slice(0, 10);
    }
    if (Array.isArray(o.engines)) {
      const valid = o.engines.filter((x: unknown) => typeof x === "string");
      if (valid.length) {
        // ensure all DEFAULT_ENGINES exist
        const set = new Set(valid);
        for (const e of DEFAULT_ENGINES) {
          if (!set.has(e)) valid.push(e);
        }
        p.engines = valid;
      }
    }
    if (Array.isArray(o.disabledEngines)) {
      p.disabledEngines = o.disabledEngines.filter((x: unknown): x is string => typeof x === "string");
    }
  } catch {
    /* first run, blocked storage, or corrupt value: start empty */
  }
  return p;
}

export const prefs: Prefs = read();

export function save(): void {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        pins: prefs.pins,
        nsfw: prefs.nsfw ? 1 : 0,
        star: prefs.star ? 1 : 0,
        newTab: prefs.newTab ? 1 : 0,
        theme: prefs.theme,
        recents: prefs.recents,
        engines: prefs.engines,
        disabledEngines: prefs.disabledEngines,
      }),
    );
  } catch {
    /* ignore */
  }
}

export function addRecent(url: string, name: string, host: string): void {
  if (!url || !name) return;
  const i = prefs.recents.findIndex((r) => r[0] === url);
  if (i >= 0) prefs.recents.splice(i, 1);
  prefs.recents.unshift([url, name, host, Date.now()]);
  if (prefs.recents.length > 8) prefs.recents.pop();
  save();
  document.dispatchEvent(new CustomEvent("fh:recents"));
}

export function clearRecents(): void {
  prefs.recents = [];
  save();
  document.dispatchEvent(new CustomEvent("fh:recents"));
}
