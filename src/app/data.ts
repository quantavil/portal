import { SCHEMA, type NsfwFile, type PageData, type Seed } from "../shared/types";
import type { KV } from "./kv";

export type Meta = { v: number; syncedAt: number; lastCheck: number };

export type Stored = {
  meta: Meta;
  pages: Map<string, PageData>;
  /** stored data existed but must be thrown away (schema changed, or the deployed seed is newer) */
  stale: boolean;
};

/**
 * Read what the daily updater saved. Stored data is only trusted if
 *  - it was written by the same parser version (SCHEMA), and
 *  - it was verified against upstream AFTER the deployed seed was built (otherwise the seed is fresher).
 * Anything else falls back to the seed. A failed/evicted/blocked IndexedDB just means "no stored data".
 */
export async function readStored(kv: KV, seed: Seed): Promise<Stored> {
  const fresh: Meta = { v: SCHEMA, syncedAt: seed.t, lastCheck: seed.t };
  let meta: Meta | null = null;
  try {
    const raw = await kv.get("meta");
    if (raw) meta = JSON.parse(raw) as Meta;
  } catch {
    return { meta: fresh, pages: new Map(), stale: false };
  }
  if (!meta) return { meta: fresh, pages: new Map(), stale: false };
  if (meta.v !== SCHEMA || meta.syncedAt < seed.t) return { meta: fresh, pages: new Map(), stale: true };

  const pages = new Map<string, PageData>();
  try {
    for (const [, v] of await kv.list("page:")) {
      const p = JSON.parse(v) as PageData;
      pages.set(p.k, p);
    }
  } catch {
    return { meta: fresh, pages: new Map(), stale: true };
  }
  return { meta, pages, stale: false };
}

/** Seed pages, with any stored page replacing its seed counterpart. */
export function mergePages(seed: Seed, stored: Map<string, PageData>): PageData[] {
  return seed.p.map((p) => stored.get(p.k) ?? p);
}

export async function loadSeed(): Promise<Seed> {
  const res = await fetch(new URL(__SEED__, import.meta.url));
  if (!res.ok) throw new Error(`seed: HTTP ${res.status}`);
  const seed = (await res.json()) as Seed;
  if (seed.v !== SCHEMA) throw new Error("seed schema mismatch");
  return seed;
}

/** NSFW data is a separate file, fetched only when the toggle is switched on. */
export async function loadNsfw(): Promise<PageData | null> {
  if (!__NSFW__) return null;
  const res = await fetch(new URL(__NSFW__, import.meta.url));
  if (!res.ok) throw new Error(`nsfw: HTTP ${res.status}`);
  const f = (await res.json()) as NsfwFile;
  return f.v === SCHEMA ? f.page : null;
}
