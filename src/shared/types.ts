/** Bump when the parser's output shape or semantics change: client data with a different value is discarded. */
export const SCHEMA = 1;

export type Pair = [label: string, url: string];

/** [name, url, desc, flags, alts?, extras?]. Trailing empty fields are omitted. */
export type Entry = [name: string, url: string, desc: string, flags: number, alts?: Pair[], extras?: Pair[]];

export const F_STAR = 1; // ⭐ or 🌟 (upstream treats both as "starred")
export const F_INDEX = 2; // 🌐 index / list-of-lists

export type Sub = { n: string; e: Entry[] };
export type Section = { n: string; e: Entry[]; b: Sub[] };

export type PageData = {
  /** page key = upstream file name without .md */
  k: string;
  /** display title */
  n: string;
  /** hash of the upstream source text, used to detect change without re-parsing */
  h: string;
  s: Section[];
  /** present only on the NSFW page */
  nsfw?: 1;
};

export type Seed = {
  v: number;
  /** build time (ms). Client data synced before this is considered older than the seed. */
  t: number;
  /** Base64-gateway id -> direct destination urls */
  gw: Record<string, string[]>;
  p: PageData[];
};

export type NsfwFile = { v: number; t: number; page: PageData };

export type Stats = {
  /** independent raw count of "](http" in the source */
  links: number;
  names: number;
  alts: number;
  extras: number;
  internal: number;
  note: number;
  pointer: number;
  prose: number;
  dupe: number;
  bad: number;
  entries: number;
};

export const emptyStats = (): Stats => ({
  links: 0, names: 0, alts: 0, extras: 0, internal: 0, note: 0, pointer: 0, prose: 0, dupe: 0, bad: 0, entries: 0,
});

/** Every link in the source must land in exactly one bucket. Returns the number of unaccounted links (0 = good). */
export function unaccounted(s: Stats): number {
  return s.links - (s.names + s.alts + s.extras + s.internal + s.note + s.pointer + s.prose + s.dupe + s.bad);
}

export function countEntries(p: PageData): number {
  let n = 0;
  for (const s of p.s) {
    n += s.e.length;
    for (const b of s.b) n += b.e.length;
  }
  return n;
}
