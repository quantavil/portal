import { beforeAll, describe, expect, test } from "bun:test";
import { toRows } from "../src/app/model";
import { buildIndex, search } from "../src/app/search";
import { PAGES } from "../src/shared/pages";
import { parsePage } from "../src/shared/parse";
import { DOCS, hasDocs } from "./helpers";

const F = { star: false, nsfw: false };

describe("search ranking (synthetic)", () => {
  const p = parsePage("t", "T", [
    "# ► S",
    "* [Pi-Hole](https://pi-hole.net/) - Network Adblocker",
    "* ⭐ [YouTube Tools](https://yt.example/) - youtube helpers",
    "* [YouTube](https://www.youtube.com/) - Video",
    "* [Some Tool](https://some.example/) - works with youtube too",
    "# ► Other",
    "* [YouTube](https://youtube.com) - Video again",
  ].join("\n")).page;
  const ix = buildIndex(toRows([p]));
  test("a starred prefix match outranks an unstarred exact match; duplicates collapse with placements kept", () => {
    const { hits } = search(ix, "youtube", F);
    expect(hits[0]!.r.n).toBe("YouTube Tools");
    expect(hits[1]!.also.length).toBe(1);
    expect(hits.map((h) => h.r.n)).toEqual(["YouTube Tools", "YouTube", "Some Tool"]);
  });
  test("without a star in play, an exact name still comes first", () => {
    const ix2 = buildIndex(toRows([parsePage("t", "T", "# ► S\n* [Foo Bar](https://a.example/) - x\n* [Foo](https://b.example/) - y").page]));
    expect(search(ix2, "foo", F).hits[0]!.r.n).toBe("Foo");
  });
  test("punctuation-insensitive names", () => expect(search(ix, "pihole", F).hits[0]!.r.n).toBe("Pi-Hole"));
  test("typo tolerance only kicks in when strict finds little", () => expect(search(ix, "youtbe", F).hits.length).toBeGreaterThan(0));
  test("starred-only filter", () => expect(search(ix, "youtube", { ...F, star: true }).hits.map((h) => h.r.n)).toEqual(["YouTube Tools"]));
  test("empty / punctuation-only queries return nothing", () => {
    expect(search(ix, "  ", F).hits).toEqual([]);
    expect(search(ix, "...", F).hits).toEqual([]);
  });
});

describe.skipIf(!hasDocs)("search quality on the real dataset", () => {
  let ix: ReturnType<typeof buildIndex>;
  beforeAll(async () => {
    const pages = [];
    for (const pg of PAGES) pages.push(parsePage(pg.k, pg.n, await Bun.file(`${DOCS}/${pg.k}.md`).text()).page);
    ix = buildIndex(toRows(pages));
  });
  test("well-known sites are the top hit", () => {
    for (const [q, name] of [["ublock", /ublock origin/i], ["libgen", /libgen|library genesis/i], ["z-lib", /z-lib/i], ["vlc", /^vlc/i], ["1337x", /1337x/i], ["netflx", /netflix/i], ["pihole", /pi-?hole/i]] as const)
      expect(search(ix, q, F).hits[0]!.r.n).toMatch(name);
  });
  test("every keystroke stays fast (<40ms) on ~20k rows", () => {
    for (const q of ["a", "an", "ani", "anim", "anime", "movie stream", "free music download"]) {
      const t = performance.now();
      search(ix, q, F);
      expect(performance.now() - t).toBeLessThan(40);
    }
  });
});
