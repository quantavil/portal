export type MdLink = { label: string; url: string; s: number; e: number };

const MARK = "](http";

/**
 * Find every `[label](http...)` link in a line. URLs may contain balanced parentheses
 * (e.g. Wikipedia-style links). Count of results + `bad` always equals the number of "](http" in the line.
 */
export function scanLinks(line: string): { links: MdLink[]; bad: number } {
  const links: MdLink[] = [];
  let bad = 0;
  let from = 0;
  let prevEnd = 0;
  for (;;) {
    const i = line.indexOf(MARK, from);
    if (i === -1) break;
    from = i + MARK.length;

    // label start: walk back to the matching "["
    let depth = 0;
    let s = -1;
    for (let j = i - 1; j >= prevEnd; j--) {
      const c = line.charCodeAt(j);
      if (c === 93 /* ] */) depth++;
      else if (c === 91 /* [ */) {
        if (depth === 0) { s = j; break; }
        depth--;
      }
    }
    // url end: balanced parens; a space ends the url (markdown title follows)
    let d = 1;
    let urlEnd = -1;
    let close = -1;
    for (let k = i + 2; k < line.length; k++) {
      const c = line.charCodeAt(k);
      if (c === 40) d++;
      else if (c === 41) { d--; if (d === 0) { close = k; break; } }
      else if ((c === 32 || c === 9) && urlEnd === -1) urlEnd = k;
    }
    if (s === -1) { bad++; continue; }
    let url: string;
    let end: number;
    if (close === -1) {
      // unclosed "(" (upstream typo): salvage the url up to the next space, comma or bracket
      const m = /^[^\s,)\]]+/.exec(line.slice(i + 2));
      if (!m) { bad++; continue; }
      url = m[0];
      end = i + 2 + url.length;
    } else {
      url = line.slice(i + 2, urlEnd === -1 ? close : urlEnd);
      end = close + 1;
    }
    links.push({ label: line.slice(s + 1, i), url, s, e: end });
    prevEnd = end;
    from = end;
  }
  return { links, bad };
}

export function isHttpUrl(u: string): boolean {
  return /^https?:\/\/[^\s<>"`]+$/i.test(u);
}

/** Canonical form for de-duplication and pin identity: no scheme, no www, no trailing slash, lower-case host. */
export function canon(url: string): string {
  try {
    const u = new URL(url);
    return u.host.toLowerCase().replace(/^www\./, "") + u.pathname.replace(/\/+$/, "") + u.search + u.hash;
  } catch {
    return url.toLowerCase();
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Links that point back into FMHY itself (wiki sections, fmhy.net pages): navigation, not content. */
export function isInternal(url: string): boolean {
  try {
    const u = new URL(url);
    const h = u.hostname.replace(/^www\./, "").replace(/^old\./, "");
    const p = u.pathname.toLowerCase();
    if (h === "reddit.com" && p.startsWith("/r/freemediaheckyeah")) return true;
    if (h === "fmhy.net" || h === "fmhy.pages.dev" || h === "fmhy.xyz" || h === "fmhy.vercel.app") return true;
    if (h === "github.com" && p.startsWith("/fmhy/fmhy/wiki")) return true;
    return false;
  } catch {
    return false;
  }
}
