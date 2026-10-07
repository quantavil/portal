import { describe, expect, test } from "bun:test";
import { mergePages, readStored } from "../src/app/data";
import type { KV } from "../src/app/kv";
import { DAY, runUpdate, type Deps } from "../src/app/updater";
import { parsePage } from "../src/shared/parse";
import { countEntries, SCHEMA, type Seed } from "../src/shared/types";

function memKV(init: Record<string, string> = {}): KV & { data: Map<string, string>; writes: number } {
  const data = new Map(Object.entries(init));
  const kv = {
    data, writes: 0,
    async get(k: string) { return data.get(k); },
    async list(prefix: string) { return [...data].filter(([k]) => k.startsWith(prefix)) as [string, string][]; },
    async write(puts: Record<string, string>, o?: { clear?: boolean }) { kv.writes++; if (o?.clear) data.clear(); for (const [k, v] of Object.entries(puts)) data.set(k, v); },
  };
  return kv;
}

const md = (n: number, tag = "x") => ["# ► Sec", ...Array.from({ length: n }, (_, i) => `* [${tag}${i}](https://${tag}${i}.example/) - desc ${i} / extra filler text to pass length`)].join("\n") + "\n";
const PAGES = [{ k: "a", n: "A" }, { k: "b", n: "B" }];
const T0 = 1_000_000_000_000;

function makeSeed(texts: Record<string, string>, t = T0): Seed {
  return { v: SCHEMA, t, gw: {}, p: PAGES.map((p) => parsePage(p.k, p.n, texts[p.k]!).page) };
}

function deps(seed: Seed, kv: KV, texts: Record<string, string | number>, now = T0 + 2 * DAY, extra: Partial<Deps> = {}): Deps & { calls: string[] } {
  const calls: string[] = [];
  return {
    kv, seed, now: () => now, pages: PAGES, calls,
    fetchPage: async (k) => {
      calls.push(k);
      const v = texts[k];
      if (typeof v === "number") return { status: v, text: "" };
      if (v === undefined) throw new TypeError("network down");
      return { status: 200, text: v };
    },
    ...extra,
  };
}

const base = { a: md(20, "a"), b: md(20, "b") };

describe("daily updater", () => {
  test("throttled: nothing is fetched within 24h", async () => {
    const kv = memKV();
    const d = deps(makeSeed(base), kv, base, T0 + DAY / 2);
    expect((await runUpdate(d)).status).toBe("skipped");
    expect(d.calls).toEqual([]);
  });

  test("unchanged (same content): no page rewrites, lastCheck + syncedAt advance", async () => {
    const kv = memKV();
    const r = await runUpdate(deps(makeSeed(base), kv, base));
    expect(r.status).toBe("unchanged");
    const meta = JSON.parse(kv.data.get("meta")!);
    expect(meta.lastCheck).toBe(T0 + 2 * DAY);
    expect(meta.syncedAt).toBe(T0 + 2 * DAY);
    expect([...kv.data.keys()]).toEqual(["meta"]);
  });

  test("changed page (200): only that page is parsed + stored, atomically with meta", async () => {
    const kv = memKV();
    const seed = makeSeed(base);
    const next = { ...base, b: md(22, "b") };
    const r = await runUpdate(deps(seed, kv, next));
    expect(r).toEqual({ status: "updated", changed: ["b"] });
    expect(kv.writes).toBe(1);
    expect([...kv.data.keys()].sort()).toEqual(["meta", "page:b"]);
    const st = await readStored(kv, seed);
    expect(countEntries(mergePages(seed, st.pages).find((p) => p.k === "b")!)).toBe(22);
    expect(countEntries(mergePages(seed, st.pages).find((p) => p.k === "a")!)).toBe(20);
  });

  test("second day: stored hash is used, so identical content is 'unchanged' again", async () => {
    const kv = memKV();
    const seed = makeSeed(base);
    const next = { ...base, b: md(22, "b") };
    await runUpdate(deps(seed, kv, next, T0 + 2 * DAY));
    expect((await runUpdate(deps(seed, kv, next, T0 + 4 * DAY))).status).toBe("unchanged");
  });

  test("network failure: error, data and lastCheck untouched (retry next open)", async () => {
    const kv = memKV();
    const r = await runUpdate(deps(makeSeed(base), kv, { a: base.a }));
    expect(r.status).toBe("error");
    expect(kv.writes).toBe(0);
  });

  test("HTTP 500 aborts the whole update; 404 only skips that page", async () => {
    let kv = memKV();
    expect((await runUpdate(deps(makeSeed(base), kv, { a: base.a, b: 500 }))).status).toBe("error");
    kv = memKV();
    const r = await runUpdate(deps(makeSeed(base), kv, { a: md(21, "a"), b: 404 }));
    expect(r).toEqual({ status: "updated", changed: ["a"] });
  });

  test("an error page / truncated body is not accepted", async () => {
    const r = await runUpdate(deps(makeSeed(base), memKV(), { a: "<html>Rate limited</html>", b: base.b }));
    expect(r.status).toBe("error");
  });

  test(">10% shrink is rejected: old data kept, lastCheck advances so we do not hammer", async () => {
    const kv = memKV();
    const seed = makeSeed(base);
    const r = await runUpdate(deps(seed, kv, { a: md(5, "a"), b: base.b }));
    expect(r.status).toBe("rejected");
    expect([...kv.data.keys()]).toEqual(["meta"]);
    const meta = JSON.parse(kv.data.get("meta")!);
    expect(meta.lastCheck).toBe(T0 + 2 * DAY);
    expect(meta.syncedAt).toBe(T0);
  });

  test("exactly within the guardrail (-5%) is accepted", async () => {
    expect((await runUpdate(deps(makeSeed(base), memKV(), { a: md(18, "a"), b: base.b }))).status).toBe("updated");
  });

  test("a page that parses to zero entries never replaces real data", async () => {
    const kv = memKV();
    const junk = "just some prose with no links at all. ".repeat(10);
    const r = await runUpdate(deps(makeSeed(base), kv, { a: junk, b: base.b }));
    expect(r.status).toBe("unchanged");
    expect(kv.data.has("page:a")).toBe(false);
  });

  test("schema bump: stored data from another parser version is discarded and re-synced from the seed", async () => {
    const seed = makeSeed(base);
    const kv = memKV({ meta: JSON.stringify({ v: SCHEMA - 1, syncedAt: T0 + 100, lastCheck: T0 + 100 }), "page:a": JSON.stringify({ k: "a", n: "A", h: "old", s: [] }) });
    expect((await readStored(kv, seed)).stale).toBe(true);
    const r = await runUpdate(deps(seed, kv, base));
    expect(r.status).toBe("unchanged");
    expect(kv.data.has("page:a")).toBe(false);
    expect(JSON.parse(kv.data.get("meta")!).v).toBe(SCHEMA);
  });

  test("a redeployed seed newer than the stored sync wins over stored pages", async () => {
    const oldSeed = makeSeed(base, T0);
    const kv = memKV();
    await runUpdate(deps(oldSeed, kv, { ...base, b: md(22, "b") }));
    const newSeed = makeSeed({ ...base, b: md(30, "b") }, T0 + 10 * DAY);
    const st = await readStored(kv, newSeed);
    expect(st.stale).toBe(true);
    expect(countEntries(mergePages(newSeed, st.pages).find((p) => p.k === "b")!)).toBe(30);
  });

  test("a broken / unavailable store behaves like 'no stored data'", async () => {
    const broken: KV = { get: async () => { throw new Error("idb blocked"); }, list: async () => { throw new Error("x"); }, write: async () => { throw new Error("x"); } };
    const st = await readStored(broken, makeSeed(base));
    expect(st.pages.size).toBe(0);
  });

  test("gateway links in updated pages are resolved with the seed's map", async () => {
    const seed = makeSeed(base);
    seed.gw = { thing: ["https://direct.example/"] };
    const kv = memKV();
    const next = { ...base, a: base.a + "* [G](https://rentry.co/FMHYB64#thing) - gate / filler filler filler filler filler\n" };
    await runUpdate(deps(seed, kv, next));
    expect(kv.data.get("page:a")).toContain("https://direct.example/");
    expect(kv.data.get("page:a")).not.toContain("FMHYB64");
  });
});
