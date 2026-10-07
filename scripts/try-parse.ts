import { PAGES } from "../src/shared/pages";
import { parsePage } from "../src/shared/parse";
import { unaccounted } from "../src/shared/types";
const dir = process.argv[2] ?? ".cache/docs";
let tot = { entries: 0, links: 0, bad: 0, prose: 0, internal: 0, pointer: 0, note: 0, dupe: 0, names: 0, alts: 0, extras: 0 };
for (const p of PAGES) {
  const text = await Bun.file(`${dir}/${p.k}.md`).text();
  const t0 = performance.now();
  const r = parsePage(p.k, p.n, text);
  const ms = (performance.now() - t0).toFixed(1);
  const s = r.stats;
  const u = unaccounted(s);
  console.log(p.k.padEnd(20), `entries=${s.entries} links=${s.links} names=${s.names} alts=${s.alts} ex=${s.extras} int=${s.internal} ptr=${s.pointer} note=${s.note} prose=${s.prose} dupe=${s.dupe} bad=${s.bad} unacc=${u} secs=${r.page.s.length} ${ms}ms`);
  for (const k of Object.keys(tot)) (tot as any)[k] += (s as any)[k];
  if (process.argv[3] === "-v") for (const [k, v] of Object.entries(r.samples)) if (k !== "pointer") for (const l of v.slice(0, 4)) console.log("   ", k, "|", l);
}
console.log("TOTAL", tot);
