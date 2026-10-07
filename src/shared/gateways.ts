import type { Entry, PageData, Pair } from "./types";

/**
 * FMHY wraps some destinations in a "Base64 gateway": https://rentry.co/FMHYB64#<id>.
 * The build resolves them to direct URLs using the mapping page. Unresolvable ones are left as-is
 * (the gateway page still works, it is just one click further).
 */
const GATEWAY = /^https?:\/\/rentry\.(?:co|org)\/FMHYB64#([\w-]+)\/?$/i;

export type GatewayMap = Record<string, string[]>;

export function gatewayId(url: string): string | null {
  const m = GATEWAY.exec(url);
  return m ? m[1]!.toLowerCase() : null;
}

/** Resolve gateway links in place. Returns how many links were replaced. */
export function applyGateways(page: PageData, map: GatewayMap): number {
  let n = 0;
  const lookup = (url: string): string[] | null => {
    const id = gatewayId(url);
    const dest = id ? map[id] : undefined;
    return dest && dest.length ? dest : null;
  };
  const fixPairs = (pairs: Pair[] | undefined) => {
    if (!pairs) return;
    for (const p of pairs) {
      const d = lookup(p[1]);
      if (d) { p[1] = d[0]!; n++; }
    }
  };
  const fix = (e: Entry) => {
    const d = lookup(e[1]);
    if (d) {
      e[1] = d[0]!;
      n++;
      if (d.length > 1) {
        e[4] = e[4] ?? [];
        d.slice(1).forEach((u, i) => e[4]!.push([String(i + 2), u]));
      }
    }
    fixPairs(e[4]);
    fixPairs(e[5]);
  };
  for (const s of page.s) {
    s.e.forEach(fix);
    for (const b of s.b) b.e.forEach(fix);
  }
  return n;
}
