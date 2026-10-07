import { canon, hostOf } from "../shared/links";
import type { Entry, PageData, Pair } from "../shared/types";

export type Row = {
  /** name, url, description */
  n: string;
  u: string;
  d: string;
  /** flags (F_STAR | F_INDEX) */
  f: number;
  /** mirrors, extra links */
  a: Pair[];
  x: Pair[];
  /** page key, page title, section, sub-section */
  pk: string;
  pn: string;
  sc: string;
  sb: string;
  /** canonical url: identity for collapsing duplicates and for pins */
  k: string;
  /** host without www */
  h: string;
  ns: boolean;
};

const NONE: Pair[] = [];

export function entryRow(e: Entry, p: PageData, sc: string, sb: string): Row {
  return {
    n: e[0], u: e[1], d: e[2], f: e[3], a: e[4] ?? NONE, x: e[5] ?? NONE,
    pk: p.k, pn: p.n, sc, sb, k: canon(e[1]), h: hostOf(e[1]), ns: !!p.nsfw,
  };
}

export function toRows(pages: PageData[]): Row[] {
  const out: Row[] = [];
  for (const p of pages) {
    for (const s of p.s) {
      for (const e of s.e) out.push(entryRow(e, p, s.n, ""));
      for (const b of s.b) for (const e of b.e) out.push(entryRow(e, p, s.n, b.n));
    }
  }
  return out;
}
