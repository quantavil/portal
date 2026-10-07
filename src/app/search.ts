import uFuzzy from "@leeoniya/ufuzzy";
import { F_STAR } from "../shared/types";
import type { Row } from "./model";

const OPTS: uFuzzy.Options = {
  unicode: true,
  interSplit: "[^\\p{L}\\d']+",
  intraBound: "\\p{L}\\d|\\d\\p{L}|\\p{Ll}\\p{Lu}",
  interBound: "[^\\p{L}\\d]",
  intraChars: "[\\p{L}\\d]",
  interLft: 1,
};

const STAR_WEIGHT = 1.5;
const strip = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

export type Index = {
  rows: Row[];
  hay: string[];
  /** lower-cased name with punctuation removed: "Pi-Hole" -> "pihole" */
  nn: string[];
  strict: uFuzzy;
  typo: uFuzzy;
};

export function buildIndex(rows: Row[]): Index {
  const nn = rows.map((r) => strip(r.n));
  const hay = rows.map((r, i) => {
    const plain = r.n.toLowerCase();
    return `${r.n} ${r.h} ${r.d}` + (nn[i] !== plain ? ` ${nn[i]}` : "");
  });
  return { rows, hay, nn, strict: new uFuzzy(OPTS), typo: new uFuzzy({ ...OPTS, intraMode: 1 }) };
}

export type Hit = {
  r: Row;
  /** other placements of the same url (other sections/pages) */
  also: Row[];
};

export type Filters = { star: boolean; nsfw: boolean };

function candidates(ix: Index, q: string): number[] {
  if (q.length < 2) {
    // one character: names that start with it
    const out: number[] = [];
    const qn = strip(q);
    if (qn) for (let i = 0; i < ix.rows.length; i++) if (ix.nn[i]!.startsWith(qn)) out.push(i);
    return out;
  }
  const run = (uf: uFuzzy) => {
    const [idxs, info, order] = uf.search(ix.hay, q, 3, 1500);
    if (!idxs) return [];
    return info && order ? order.map((i) => info.idx[i]!) : idxs;
  };
  let found = run(ix.strict);
  if (found.length < 5) {
    // typo tolerant pass, keeping strict hits first
    const seen = new Set(found);
    found = found.concat(run(ix.typo).filter((i) => !seen.has(i)));
  }
  return found;
}

/** Ranking tiers on top of uFuzzy's order: exact name, name prefix, name contains, host contains, anything else. */
function tier(ix: Index, i: number, qn: string, terms: string[]): number {
  const n = ix.nn[i]!;
  if (n === qn) return 0;
  if (n.startsWith(qn)) return 1;
  if (n.includes(qn) || (terms.length > 1 && terms.every((t) => n.includes(t)))) return 2;
  if (strip(ix.rows[i]!.h).includes(qn)) return 3;
  return 4;
}

export function search(ix: Index, query: string, f: Filters, limit = 200): { hits: Hit[]; total: number } {
  const q = query.trim().toLowerCase();
  if (!q) return { hits: [], total: 0 };
  const qn = strip(q);
  if (!qn) return { hits: [], total: 0 };
  const terms = q.split(/\s+/).map(strip).filter(Boolean);

  const scored: { i: number; k: number; pos: number }[] = [];
  const idxs = candidates(ix, q);
  for (let pos = 0; pos < idxs.length; pos++) {
    const i = idxs[pos]!;
    const r = ix.rows[i]!;
    if (r.ns && !f.nsfw) continue;
    const starred = !!(r.f & F_STAR);
    if (f.star && !starred) continue;
    // an FMHY star is worth 1.5 tiers: a starred name-prefix match outranks an unstarred exact match
    scored.push({ i, k: tier(ix, i, qn, terms) + (starred ? 0 : STAR_WEIGHT), pos });
  }
  scored.sort((a, b) => a.k - b.k || a.pos - b.pos);

  // collapse placements of the same url into one hit
  const byKey = new Map<string, Hit>();
  const hits: Hit[] = [];
  for (const { i } of scored) {
    const r = ix.rows[i]!;
    const prev = byKey.get(r.k);
    if (prev) { prev.also.push(r); continue; }
    const h: Hit = { r, also: [] };
    byKey.set(r.k, h);
    hits.push(h);
  }
  return { hits: hits.slice(0, limit), total: hits.length };
}
