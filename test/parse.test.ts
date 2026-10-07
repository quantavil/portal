import { describe, expect, test } from "bun:test";
import { scanLinks } from "../src/shared/links";
import { parsePage } from "../src/shared/parse";
import { PAGES } from "../src/shared/pages";
import { unaccounted, F_INDEX, F_STAR } from "../src/shared/types";
import { DOCS, flat, hasDocs, parseLines } from "./helpers";
import baseline from "./baseline.json";

describe("link scanner", () => {
  test("balanced parentheses in urls", () => {
    const { links } = scanLinks("[GSI](https://x.org/wiki/Generic-System-Image-(GSI)-list) and [b](http://y.z/)");
    expect(links.map((l) => l.url)).toEqual(["https://x.org/wiki/Generic-System-Image-(GSI)-list", "http://y.z/"]);
  });
  test("a space ends the url (markdown title)", () => {
    expect(scanLinks('[a](https://x.y/ "title")').links[0]!.url).toBe("https://x.y/");
  });
  test("unclosed paren is salvaged, not lost", () => {
    const r = scanLinks("[A](https://a.b/c, [B](https://d.e/)");
    expect(r.links.map((l) => l.url)).toEqual(["https://a.b/c", "https://d.e/"]);
    expect(r.bad).toBe(0);
  });
  test("nested brackets in label", () => {
    expect(scanLinks("[Foo [bar]](https://x.y/)").links[0]!.label).toBe("Foo [bar]");
  });
});

describe("grammar", () => {
  test("starred, bold name, description", () => {
    const r = parseLines("* ⭐ **[Name](https://a.example)** - Movies / TV / No Sign-Up");
    expect(flat(r.page)).toEqual([["Name", "https://a.example", "Movies / TV / No Sign-Up", F_STAR]]);
  });
  test("🌟 is starred too; 🌐 is index", () => {
    const r = parseLines("* 🌟 **[A](https://a.example)** - x", "* 🌐 **[B](https://b.example)** - y", "* ⭐🌐 [C](https://c.example)");
    expect(flat(r.page).map((e) => e[3])).toEqual([F_STAR, F_INDEX, F_STAR | F_INDEX]);
  });
  test("multiple primaries share description; [2] [3] are mirrors", () => {
    const r = parseLines("* **[Rive](https://r.a)**, [2](https://r.b), [3](https://r.c) or [Cors](https://c.a), [2](https://c.b) - Movies / [Discord](https://d.example)");
    const e = flat(r.page);
    expect(e.map((x) => x[0])).toEqual(["Rive", "Cors"]);
    expect(e[0]![2]).toBe("Movies");
    expect(e[0]![4]).toEqual([["2", "https://r.b"], ["3", "https://r.c"]]);
    expect(e[0]![5]).toEqual([["Discord", "https://d.example"]]);
    expect(e[1]![4]).toEqual([["2", "https://c.b"]]);
  });
  test("item with NO ' - ' (uses ' / ' after the name)", () => {
    const r = parseLines("* ⭐ **[Invoke](https://invoke.ai/)** / [Discord](https://discord.com/x) / [GitHub](https://github.com/y)");
    const e = flat(r.page)[0]!;
    expect(e[2]).toBe("");
    expect(e[5]).toEqual([["Discord", "https://discord.com/x"], ["GitHub", "https://github.com/y"]]);
  });
  test("a ' / ' inside a link label does not split the description", () => {
    const r = parseLines("* [A](https://a.b) - Foo / [Movies / TV](https://m.tv) / Bar");
    const e = flat(r.page)[0]!;
    expect(e[2]).toBe("Foo / Bar");
    expect(e[5]).toEqual([["Movies / TV", "https://m.tv"]]);
  });
  test("invisible characters are stripped from names", () => {
    expect(flat(parseLines("* [\u2060Unsloth\u200b](https://u.ai/) - x").page)[0]![0]).toBe("Unsloth");
  });
  test("pointer lines (↪️) and internal-primary lines produce no records", () => {
    const r = parseLines(
      "* ↪️ **[AI API Tools](https://www.reddit.com/r/FREEMEDIAHECKYEAH/wiki/dev-tools/#wiki_.25B7_api_tools)**",
      "* 🌟 **[P-Stream Forks](https://www.reddit.com/r/FREEMEDIAHECKYEAH/wiki/video#wiki_x)** - Movies / TV",
    );
    expect(flat(r.page)).toEqual([]);
    expect(r.stats.pointer).toBe(2);
    expect(unaccounted(r.stats)).toBe(0);
  });
  test("notes are never links", () => {
    const r = parseLines("* **Note** - Use an [adblocker](https://ublockorigin.com) and a [VPN](https://proton.me)");
    expect(flat(r.page)).toEqual([]);
    expect(r.stats.note).toBe(2);
  });
  test("grouped line without a leading link", () => {
    const r = parseLines("* **Streaming: [NEPU](https://nepu.io/) / [Movy](https://www.movy.sx/)**");
    expect(flat(r.page).map((e) => [e[0], e[2]])).toEqual([["NEPU", "Streaming"], ["Movy", "Streaming"]]);
  });
  test("bare run of sites on a non-list line", () => {
    const r = parseLines("", "[PostSpark](https://postspark.app/), [Mockup World](https://www.mockupworld.co/)");
    expect(flat(r.page).map((e) => e[0])).toEqual(["PostSpark", "Mockup World"]);
  });
  test("soft-wrapped continuation line is kept", () => {
    const r = parseLines("* [A](https://a.b) - x", " or [GeoEstimation](https://labs.tib.eu/geoestimation) - Image Geolocation");
    expect(flat(r.page).map((e) => e[0])).toEqual(["A", "GeoEstimation"]);
  });
  test("prose with links is counted but not turned into records", () => {
    const r = parseLines("This sentence mentions [one](https://a.b) site.");
    expect(flat(r.page)).toEqual([]);
    expect(r.stats.prose).toBe(1);
  });
  test("identical canonical url in the same section is de-duplicated, other sections keep it", () => {
    const r = parsePage("t", "T", ["# ► A", "* [X](https://www.x.com/)", "* [X again](http://x.com)", "# ► B", "* [X](https://x.com/)"].join("\n"));
    expect(flat(r.page).length).toBe(2);
    expect(r.stats.dupe).toBe(1);
    expect(unaccounted(r.stats)).toBe(0);
  });
  test("hostname is NOT used for de-duplication", () => {
    const r = parseLines("* [A](https://github.com/a/one)", "* [B](https://github.com/b/two)");
    expect(flat(r.page).length).toBe(2);
  });
  test("javascript: and other schemes never become records", () => {
    const r = parseLines("* [Evil](javascript:alert(1)) - x", "* [Ok](https://ok.example) - y");
    expect(flat(r.page).map((e) => e[1])).toEqual(["https://ok.example"]);
  });
  test("sections and subs; links in headings are pointers", () => {
    const r = parsePage("t", "T", ["# ► One", "* [a](https://a.b)", "## ▷ Sub", "* [b](https://b.c)", "## ▷ [Ptr](https://www.reddit.com/r/FREEMEDIAHECKYEAH/wiki/x)", "# ► Two", "* [c](https://c.d)"].join("\n"));
    expect(r.page.s.map((s) => [s.n, s.e.length, s.b.map((b) => b.n)])).toEqual([["One", 1, ["Sub"]], ["Two", 1, []]]);
    expect(r.stats.pointer).toBe(1);
  });
  test("files without ► markers (storage.md style): ## is a section, ### a sub", () => {
    const r = parsePage("t", "T", ["## Design", "* [a](https://a.b)", "### Fonts", "* [b](https://b.c)"].join("\n"));
    expect(r.page.s.map((s) => [s.n, s.b.map((b) => b.n)])).toEqual([["Design", ["Fonts"]]]);
  });
  test("never throws on garbage", () => {
    expect(() => parsePage("t", "T", "](http\n* [\n* ](http://\n#\n* **\n[[[](http://a.b)\n\u0000")).not.toThrow();
    const r = parsePage("t", "T", "](http\n* [a](http://\n* ](http://x.y)");
    expect(unaccounted(r.stats)).toBe(0);
  });
});

describe.skipIf(!hasDocs)("real upstream pages (run `bun run docs` first)", () => {
  const results = new Map<string, ReturnType<typeof parsePage>>();
  for (const p of PAGES) {
    test(`${p.k}: every link is accounted for`, async () => {
      const r = parsePage(p.k, p.n, await Bun.file(`${DOCS}/${p.k}.md`).text());
      results.set(p.k, r);
      expect(unaccounted(r.stats)).toBe(0);
      expect(r.stats.bad).toBe(0);
      expect(r.stats.entries).toBeGreaterThan(0);
    });
  }
  test("per-page entry counts are within 15% of the baseline (parser regressions, not upstream drift)", () => {
    for (const p of PAGES) {
      const got = results.get(p.k)!.stats.entries;
      const want = (baseline as Record<string, number>)[p.k]!;
      expect(Math.abs(got - want) / want).toBeLessThan(0.15);
    }
  });
  test("no record has an empty name or non-http url", () => {
    for (const r of results.values())
      for (const e of flat(r.page)) {
        expect(e[0].length).toBeGreaterThan(0);
        expect(/^https?:\/\//.test(e[1])).toBe(true);
      }
  });
  test("unsafe.md is not part of the dataset", () => {
    expect(PAGES.some((p) => p.k === "unsafe")).toBe(false);
  });
});
