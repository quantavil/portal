import { hash } from "./hash";
import { canon, hostOf, isHttpUrl, isInternal, scanLinks, type MdLink } from "./links";
import { emptyStats, F_INDEX, F_STAR, type Entry, type PageData, type Pair, type Section, type Stats, type Sub } from "./types";

/*
 * Hand-written, tolerant line parser for FMHY's markdown. No markdown library.
 *
 * Grammar (verified against all upstream pages, 2026-10):
 *   # ► Section            ## ▷ Sub          (storage.md uses plain ## / ###)
 *   * [⭐|🌟|🌐|↪️] **[Name](url)**, [2](mirror) or [Other](url) - desc / [Discord](url)
 *
 * The primary group is the leading run of links joined by "," / "or" / "and". What follows (after an
 * optional " - " or " / ") is the description; " / "-separated pieces that are bare links are `extras`.
 * Items with no " - " at all are common (1,400+), so we never split on " - " blindly.
 *
 * INVARIANT: every "](http" in the source lands in exactly one Stats bucket (see `unaccounted`).
 */

export type ParseResult = { page: PageData; stats: Stats; samples: Record<string, string[]> };

const INVISIBLE = /[\u200b-\u200d\u2060\ufeff]/g;
const HTML_TAG = /<\/?[a-z][^>]*>/gi;
const ESCAPES = /\\([\\`*_{}[\]()#+\-.!|<>~])/g;
const HEAD = /^(#{1,6})\s+(.+?)\s*$/;
const LIST = /^\s*[*+-]\s+(.*)$/;
const NOTE = /^\*{0,2}(?:note|warning|tip|info|caution|important)s?\*{0,2}\s*(?:[-:–—]|$)/i;
const PRIMARY_SEP = /^[\s*_]*(?:,|\bor\b|\band\b|,\s*or\b|,\s*and\b)[\s*_]*$/i;
const NOISE = /^[\s*_]*$/;
const MIRROR_LABEL = /^\d{1,2}$/;

/** Change-detection hash of an upstream page. Normalises BOM and CRLF so build and browser always agree. */
export function sourceHash(text: string): string {
  return hash(text.replace(/^\ufeff/, "").replace(/\r\n/g, "\n"));
}

function clean(s: string): string {
  return s
    .replace(INVISIBLE, "")
    .replace(HTML_TAG, "")
    .replace(ESCAPES, "$1")
    .replace(/\*\*|__/g, "")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

type Rec = { name: string; url: string; alts: Pair[]; extras: Pair[]; desc: string; flags: number };

export function parsePage(key: string, title: string, text: string): ParseResult {
  const st = emptyStats();
  const samples: Record<string, string[]> = { prose: [], group: [], pointer: [], dupe: [] };
  const sample = (k: string, l: string) => { if (samples[k]!.length < 25) samples[k]!.push(l.slice(0, 200)); };

  const h = sourceHash(text);
  text = text.replace(/^\ufeff/, "");
  st.links = (text.match(/\]\(http/g) ?? []).length;
  const hasMarkers = /^#\s+►/m.test(text);

  const sections: Section[] = [];
  let secName = "";
  let subName = "";
  let secObj: Section | null = null;
  let subObj: Sub | null = null;
  let seen = new Set<string>();

  const bucket = (): Entry[] => {
    if (!secObj) { secObj = { n: secName || "General", e: [], b: [] }; sections.push(secObj); }
    if (subName) {
      if (!subObj) { subObj = { n: subName, e: [] }; secObj.b.push(subObj); }
      return subObj.e;
    }
    return secObj.e;
  };

  /** http(s) links of a string; malformed or non-http ones are counted as `bad`, never silently lost. */
  const linksOf = (s: string): MdLink[] => {
    const r = scanLinks(s);
    st.bad += r.bad;
    const out: MdLink[] = [];
    for (const l of r.links) (isHttpUrl(l.url) ? out.push(l) : st.bad++);
    return out;
  };

  const emit = (r: Rec) => {
    const k = canon(r.url);
    if (seen.has(k)) { st.dupe += 1 + r.alts.length + r.extras.length; sample("dupe", `${secName} | ${r.url}`); return; }
    seen.add(k);
    st.names++; st.alts += r.alts.length; st.extras += r.extras.length; st.entries++;
    const e: Entry = [r.name, r.url, r.desc, r.flags];
    if (r.alts.length || r.extras.length) e.push(r.alts);
    if (r.extras.length) e.push(r.extras);
    bucket().push(e);
  };

  /** Turn links into records; digit-labelled links ("[2]", "[3]") are mirrors of the previous record. */
  const records = (ls: MdLink[], desc: string, flags: number): Rec[] => {
    const out: Rec[] = [];
    for (const l of ls) {
      if (isInternal(l.url)) { st.internal++; continue; }
      const label = clean(l.label);
      const last = out[out.length - 1];
      if (last && MIRROR_LABEL.test(label)) { last.alts.push([label, l.url]); continue; }
      out.push({ name: label || hostOf(l.url), url: l.url, alts: [], extras: [], desc, flags });
    }
    return out;
  };

  const heading = (level: number, raw: string) => {
    const hl = linksOf(raw);
    st.pointer += hl.length; // a heading that is itself a link is a pointer to another section
    const mark = raw.trimStart()[0];
    let name = hl.length ? clean(hl[0]!.label) : clean(raw.replace(/\s*\{#[^}]*\}\s*$/, ""));
    name = name.replace(/^[►▷▶]\s*/, "").trim();
    const isSection = mark === "►" ? true : mark === "▷" ? false : hasMarkers ? level === 1 : level <= 2;
    if (isSection) {
      secName = name; subName = ""; secObj = null; subObj = null; seen = new Set();
    } else {
      subName = name; subObj = null;
    }
  };

  const item = (body: string, rawLine: string) => {
    const ls = linksOf(body);
    if (!ls.length) return;

    // leading markers
    let i = 0;
    let flags = 0;
    let pointer = false;
    for (;;) {
      while (body[i] === " " || body[i] === "\t") i++;
      if (body.startsWith("⭐", i)) { flags |= F_STAR; i += 1; }
      else if (body.startsWith("🌟", i)) { flags |= F_STAR; i += 2; }
      else if (body.startsWith("🌐", i)) { flags |= F_INDEX; i += 2; }
      else if (body.startsWith("↪", i)) { pointer = true; i += 1; }
      else break;
      while (body[i] === "\ufe0f") i++;
    }

    if (pointer) { st.pointer += ls.length; sample("pointer", rawLine); return; }
    if (NOTE.test(body.slice(i))) { st.note += ls.length; return; }

    // primary group: leading links joined by "," / "or" / "and"
    let k = 0;
    if (NOISE.test(body.slice(i, ls[0]!.s))) {
      k = 1;
      while (k < ls.length && PRIMARY_SEP.test(body.slice(ls[k - 1]!.e, ls[k]!.s))) k++;
    }

    if (k === 0) {
      // no leading link: a grouped line like "**Streaming: [A](..) / [B](..)**"
      const pre = clean(body.slice(i, ls[0]!.s)).replace(/[:\-–—\s]+$/, "");
      sample("group", rawLine);
      for (const r of records(ls, pre, flags)) emit(r);
      return;
    }

    const prim = ls.slice(0, k);
    if (prim.every((l) => isInternal(l.url))) {
      // points at another FMHY section; the real entries live there
      st.pointer += ls.length; sample("pointer", rawLine); return;
    }

    // description + extras from everything after the primary group
    const rest = ls.slice(k);
    let t = "";
    let pos = prim[prim.length - 1]!.e;
    for (let n = 0; n < rest.length; n++) { t += body.slice(pos, rest[n]!.s) + `\u0000${n}\u0000`; pos = rest[n]!.e; }
    t += body.slice(pos);
    t = t.replace(/^[\s*_]*(?:[-–—/]\s+)?/, "");

    const extras: Pair[] = [];
    const addExtra = (n: number) => {
      const l = rest[n]!;
      if (isInternal(l.url)) { st.internal++; return; }
      extras.push([clean(l.label) || hostOf(l.url), l.url]);
    };
    const parts: string[] = [];
    for (const seg of t.split(" / ")) {
      const only = /^[\s*_]*\u0000(\d+)\u0000[\s*_]*$/.exec(seg);
      if (only) { addExtra(+only[1]!); continue; }
      const text = seg.replace(/\u0000(\d+)\u0000/g, (_m, n: string) => { addExtra(+n); return clean(rest[+n]!.label); });
      const c = clean(text);
      if (c) parts.push(c);
    }
    const desc = parts.join(" / ");

    const recs = records(prim, desc, flags);
    if (recs[0]) recs[0].extras = extras;
    for (const r of recs) emit(r);
  };

  /** Non-list line containing links: either a bare run of sites ("[A](..), [B](..)") or prose. */
  const loose = (line: string) => {
    // soft-wrapped continuation of the previous item: " or [Other](url) - desc"
    const cont = /^\s+(?:or|and|,)\s+(\[.*)$/.exec(line);
    if (cont) { item(cont[1]!, line); return; }
    const ls = linksOf(line);
    if (!ls.length) return;
    let t = "";
    let pos = 0;
    for (const l of ls) { t += line.slice(pos, l.s); pos = l.e; }
    t += line.slice(pos);
    const leftover = t.replace(/\b(?:or|and)\b/gi, "").replace(/[\s,/*_&+|-]/g, "");
    if (leftover === "") { for (const r of records(ls, "", 0)) emit(r); }
    else { st.prose += ls.length; sample("prose", line); }
  };

  for (const line of text.split(/\r?\n/)) {
    const hm = HEAD.exec(line);
    if (hm) { heading(hm[1]!.length, hm[2]!); continue; }
    if (!line.includes("](http")) continue;
    const li = LIST.exec(line);
    if (li) item(li[1]!, line);
    else loose(line);
  }

  return { page: { k: key, n: title, h, s: sections }, stats: st, samples };
}
