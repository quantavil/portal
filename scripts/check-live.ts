/**
 * bun run check:live
 * Downloads the CURRENT upstream pages and verifies the parser still understands them:
 * every link accounted for, entry counts within 15% of test/baseline.json. Run it when a build or the daily
 * updater seems to have lost data, or before changing the parser. Exit code 1 on any problem.
 */
import { fetchDocs } from "./fetch-docs";
import { PAGES } from "../src/shared/pages";
import { parsePage } from "../src/shared/parse";
import { unaccounted } from "../src/shared/types";
import baseline from "../test/baseline.json";

const dir = ".cache/live-docs";
await fetchDocs(dir, () => {});
let bad = 0;
for (const p of PAGES) {
  const r = parsePage(p.k, p.n, await Bun.file(`${dir}/${p.k}.md`).text());
  const want = (baseline as Record<string, number>)[p.k]!;
  const drift = (r.stats.entries - want) / want;
  const problems = [unaccounted(r.stats) !== 0 && `unaccounted=${unaccounted(r.stats)}`, r.stats.bad > 0 && `bad=${r.stats.bad}`, Math.abs(drift) > 0.15 && `drift ${(drift * 100).toFixed(0)}%`].filter(Boolean);
  if (problems.length) bad++;
  console.log(`${problems.length ? "FAIL" : "ok  "} ${p.k.padEnd(20)} entries=${String(r.stats.entries).padStart(5)} (baseline ${want}) ${problems.join(", ")}`);
}
console.log(bad ? `\n${bad} page(s) need attention` : "\nAll pages parse cleanly.");
process.exit(bad ? 1 : 0);
