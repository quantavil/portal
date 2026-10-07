import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { PAGES } from "../src/shared/pages";
import { SCHEMA, type Seed } from "../src/shared/types";

/** Runs the real build end to end on small synthetic docs, fully offline. */
let tmp = "";
let out = "";
const sec = (k: string) => ["# ► Section", ...Array.from({ length: 12 }, (_, i) => `* ⭐ **[${k} site ${i}](https://${k}-${i}.example/)** - desc ${i} / [Discord](https://d.example/${k}${i})`)].join("\n") + "\n";
const nsfwMd = "# ► Adult\n* [Adult Site](https://adult.example/) - stuff\n";

async function build(extra: string[], dir: string) {
  const p = Bun.spawn(["bun", "build.ts", "--docs", join(tmp, "docs"), "--offline", "--out", dir, ...extra], { stdout: "pipe", stderr: "pipe" });
  const [o, e] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
  return { code: await p.exited, text: o + e };
}

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), "fmhy-build-"));
  await mkdir(join(tmp, "docs"));
  for (const p of PAGES) await Bun.write(join(tmp, "docs", p.k + ".md"), sec(p.k));
  await Bun.write(join(tmp, "nsfw.md"), nsfwMd);
  out = join(tmp, "dist");
  const r = await build(["--nsfw-md", join(tmp, "nsfw.md")], out);
  expect(r.code).toBe(0);
}, 60_000);
afterAll(() => rm(tmp, { recursive: true, force: true }));

const read = (f: string) => Bun.file(join(out, f)).text();

describe("build output", () => {
  test("contains the shell, manifest, icons, hashed seed/nsfw/js and a service worker", async () => {
    const files = await readdir(out);
    for (const f of ["index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "sw.js", "_headers"]) expect(files).toContain(f);
    expect(files.some((f) => /^seed\.[0-9a-f]{10}\.json$/.test(f))).toBe(true);
    expect(files.some((f) => /^nsfw\.[0-9a-f]{10}\.json$/.test(f))).toBe(true);
    expect(files.some((f) => /^main\.\w+\.js$/.test(f))).toBe(true);
  });
  test("seed is valid and holds every page; NSFW is NOT in the seed", async () => {
    const f = (await readdir(out)).find((n) => n.startsWith("seed."))!;
    const seed = JSON.parse(await read(f)) as Seed;
    expect(seed.v).toBe(SCHEMA);
    expect(seed.p.map((p) => p.k)).toEqual(PAGES.map((p) => p.k));
    expect(JSON.stringify(seed)).not.toContain("adult.example");
    const nf = (await readdir(out)).find((n) => n.startsWith("nsfw."))!;
    expect(await read(nf)).toContain("adult.example");
  });
  test("first-paint budget: html + main.js <= 20 KB gzip, main.js <= 6 KB gzip", async () => {
    const files = await readdir(out);
    const main = files.find((f) => /^main\./.test(f))!;
    const h = gzipSync(await read("index.html")).length;
    const m = gzipSync(await read(main)).length;
    expect(h + m).toBeLessThan(20 * 1024);
    expect(m).toBeLessThan(6 * 1024);
  });
  test("no inline script; CSP style hash matches the inline <style>", async () => {
    const html = await read("index.html");
    expect(/<script(?![^>]*\bsrc=)/i.test(html)).toBe(false);
    const css = /<style>([\s\S]*?)<\/style>/.exec(html)![1]!;
    const hash = "sha256-" + createHash("sha256").update(css).digest("base64");
    expect(html).toContain(`style-src '${hash}'`);
  });
  test("html talks to no third-party host (no favicons, fonts, CDNs)", async () => {
    const html = await read("index.html");
    const hosts = [...html.matchAll(/https?:\/\/([\w.-]+)/g)].map((m) => m[1]);
    expect(new Set(hosts)).toEqual(new Set(["raw.githubusercontent.com", "fmhy.net"]));
  });
  test("NSFW toggle exists only because NSFW data was built; tile is hidden by default", async () => {
    const html = await read("index.html");
    expect(html).toContain('id="nsfw"');
    expect(html).toMatch(/id="t-nsfw"[^>]*hidden/);
  });
  test("service worker precaches the seed and all js, but NOT the NSFW file", async () => {
    const sw = await read("sw.js");
    const files = await readdir(out);
    for (const f of files.filter((n) => /^(seed|main|core|updater)\./.test(n))) expect(sw).toContain(f);
    expect(sw).not.toContain(files.find((n) => n.startsWith("nsfw."))!);
  });
  test("--no-nsfw leaves no trace of NSFW in dist", async () => {
    const dir = join(tmp, "dist2");
    const r = await build(["--no-nsfw"], dir);
    expect(r.code).toBe(0);
    const files = await readdir(dir);
    expect(files.some((f) => f.startsWith("nsfw."))).toBe(false);
    expect(await Bun.file(join(dir, "index.html")).text()).not.toContain('id="nsfw"');
  }, 60_000);
  test("build refuses to ship when the parser invariant fails (a page with no entries)", async () => {
    await Bun.write(join(tmp, "docs", "ai.md"), "nothing useful here\n");
    const r = await build(["--no-nsfw"], join(tmp, "dist3"));
    expect(r.code).not.toBe(0);
    expect(r.text).toContain("parser invariant failed for ai");
  }, 60_000);
});
