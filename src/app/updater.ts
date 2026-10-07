import { applyGateways } from "../shared/gateways";
import { PAGES, RAW_BASE } from "../shared/pages";
import { parsePage, sourceHash } from "../shared/parse";
import { countEntries, SCHEMA, type PageData, type Seed } from "../shared/types";
import { mergePages, readStored, type Meta } from "./data";
import type { KV } from "./kv";

/*
 * Daily update, run once on the first idle moment of the first open each day.
 *
 * Why no ETag / If-None-Match: raw.githubusercontent.com rejects the CORS preflight that a custom
 * If-None-Match header triggers (HTTP 403, tested), so a hand-rolled conditional GET fails in every browser.
 * Instead we send a plain, header-less request with `cache: "no-cache"`: the browser itself revalidates with the
 * ETag it holds (cheap 304) and we detect real changes by hashing the text.
 *
 * Rules: keep current data on ANY error; never apply mid-session (new data is read on the next open);
 * reject an update that would shrink the dataset by more than 10%.
 */

export const DAY = 24 * 60 * 60 * 1000;
export const MAX_SHRINK = 0.1;

export type Fetched = { status: number; text: string };

export type Deps = {
  kv: KV;
  seed: Seed;
  fetchPage: (key: string) => Promise<Fetched>;
  now: () => number;
  pages?: readonly { k: string; n: string }[];
  /** ignore the 24h throttle (tests, manual refresh) */
  force?: boolean;
};

export type Result = {
  status: "skipped" | "unchanged" | "updated" | "rejected" | "error";
  changed: string[];
  detail?: string;
};

const tick = () => new Promise<void>((r) => setTimeout(r, 0));
const total = (pages: Iterable<PageData>) => {
  let n = 0;
  for (const p of pages) n += countEntries(p);
  return n;
};

async function pool<T>(items: readonly T[], size: number, fn: (x: T) => Promise<void>): Promise<void> {
  const q = [...items];
  await Promise.all(
    Array.from({ length: Math.min(size, q.length) }, async () => {
      for (let x = q.shift(); x !== undefined; x = q.shift()) await fn(x);
    }),
  );
}

export async function runUpdate(d: Deps): Promise<Result> {
  const pages = d.pages ?? PAGES;
  const { meta, pages: stored, stale } = await readStored(d.kv, d.seed);
  if (stale) await d.kv.write({ meta: JSON.stringify(meta) }, { clear: true });

  const now = d.now();
  if (!d.force && now - meta.lastCheck < DAY) return { status: "skipped", changed: [] };

  const current = new Map(mergePages(d.seed, stored).map((p) => [p.k, p]));

  // 1. download everything first; any failure aborts without touching lastCheck, so the next open retries
  const fetched = new Map<string, string>();
  try {
    await pool(pages, 6, async (p) => {
      const r = await d.fetchPage(p.k);
      if (r.status === 404) return; // page removed or renamed upstream: keep what we have
      if (r.status !== 200) throw new Error(`${p.k}: HTTP ${r.status}`);
      if (r.text.length < 200) throw new Error(`${p.k}: response too short`);
      fetched.set(p.k, r.text);
    });
  } catch (e) {
    return { status: "error", changed: [], detail: (e as Error).message };
  }

  // 2. parse only pages whose hash changed
  const next = new Map(current);
  const changed: string[] = [];
  for (const p of pages) {
    const text = fetched.get(p.k);
    if (text === undefined || current.get(p.k)?.h === sourceHash(text)) continue;
    try {
      await tick(); // keep the main thread responsive between pages
      const { page } = parsePage(p.k, p.n, text);
      const prev = current.get(p.k);
      if (prev && countEntries(page) === 0 && countEntries(prev) > 0) continue; // looks like a broken page
      applyGateways(page, d.seed.gw);
      next.set(p.k, page);
      changed.push(p.k);
    } catch {
      /* a page that cannot be parsed keeps its previous data */
    }
  }

  const base: Meta = { v: SCHEMA, syncedAt: meta.syncedAt, lastCheck: now };
  if (!changed.length) {
    await d.kv.write({ meta: JSON.stringify({ ...base, syncedAt: now }) });
    return { status: "unchanged", changed };
  }

  // 3. guardrail: a bad upstream commit (or a truncated download) must not wipe the homepage
  const before = total(current.values());
  const after = total(next.values());
  if (after < before * (1 - MAX_SHRINK)) {
    await d.kv.write({ meta: JSON.stringify(base) });
    return { status: "rejected", changed: [], detail: `would shrink ${before} -> ${after}` };
  }

  // 4. commit atomically: changed pages + meta in one transaction
  const puts: Record<string, string> = { meta: JSON.stringify({ ...base, syncedAt: now }) };
  for (const k of changed) puts["page:" + k] = JSON.stringify(next.get(k));
  await d.kv.write(puts);
  return { status: "updated", changed };
}

/** Browser wiring. Never throws. */
export async function maybeUpdate(kv: KV, seed: Seed): Promise<Result | null> {
  try {
    if (navigator.onLine === false) return null;
    if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return null;
    return await runUpdate({
      kv,
      seed,
      now: Date.now,
      fetchPage: async (k) => {
        const res = await fetch(RAW_BASE + k + ".md", {
          cache: "no-cache",
          credentials: "omit",
          referrerPolicy: "no-referrer",
          signal: AbortSignal.timeout(20_000),
        });
        return { status: res.status, text: res.status === 200 ? await res.text() : "" };
      },
    });
  } catch {
    return null;
  }
}
