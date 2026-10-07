/** Regenerate test/baseline.json (per-page entry counts) from .cache/docs. Run after intentional parser changes. */
import { PAGES } from "../src/shared/pages";
import { parsePage } from "../src/shared/parse";
const dir = process.env.FMHY_DOCS ?? ".cache/docs";
const out: Record<string, number> = {};
for (const p of PAGES) out[p.k] = parsePage(p.k, p.n, await Bun.file(`${dir}/${p.k}.md`).text()).stats.entries;
await Bun.write("test/baseline.json", JSON.stringify(out, null, 2) + "\n");
console.log("baseline written", out);
