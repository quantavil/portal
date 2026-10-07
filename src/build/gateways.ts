import type { GatewayMap } from "../shared/gateways";

export const GATEWAY_SOURCE = "https://rentry.co/FMHYB64";
export const UA = "fmhy-home-build/1.0 (+personal start page)";

/** Port of the owner's Python `decode_base64_destination`: up to 3 nested Base64 layers, URL-safe alphabet allowed. */
export function decodeBase64Destination(value: string): string | null {
  let candidate = value.replace(/\s+/g, "");
  for (let i = 0; i < 3; i++) {
    const norm = candidate.replace(/-/g, "+").replace(/_/g, "/");
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(norm)) return null;
    if (norm.replace(/=+$/, "").length % 4 === 1) return null;
    let decoded: string;
    try {
      const padded = norm + "=".repeat((4 - (norm.length % 4)) % 4);
      decoded = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(padded, "base64"));
    } catch {
      return null;
    }
    decoded = decoded.trim();
    if (/^https?:\/\//i.test(decoded)) return decoded;
    candidate = decoded;
  }
  return null;
}

export function unescapeHtml(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(+d))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Text of every <code> element, in document order. */
export function codeBlocks(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<code\b[^>]*>([\s\S]*?)<\/code>/gi)) {
    out.push(unescapeHtml(m[1]!.replace(/<[^>]+>/g, "")));
  }
  return out;
}

/**
 * Parse the rentry FMHYB64 page: headings carry ids, the <code> blocks after a heading are Base64 destinations.
 * Same contract as the Python `load_base64_mappings`. Throws if nothing decodable is found.
 */
export function parseGatewayMap(html: string): GatewayMap {
  const map: GatewayMap = {};
  let current: string | null = null;
  const re = /<h[1-6]\b[^>]*?\bid\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>|<code\b[^>]*>([\s\S]*?)<\/code>/gi;
  for (const m of html.matchAll(re)) {
    if (m[3] === undefined) {
      current = (m[1] ?? m[2] ?? "").toLowerCase();
    } else if (current) {
      const dest = decodeBase64Destination(unescapeHtml(m[3].replace(/<[^>]+>/g, "")));
      if (dest) (map[current] ??= []).push(dest);
    }
  }
  if (!Object.keys(map).length) throw new Error("No decodable FMHY Base64 mappings were found");
  return map;
}

export async function fetchText(url: string, init: RequestInit = {}): Promise<string> {
  const res = await fetch(url, {
    ...init,
    headers: { "User-Agent": UA, ...(init.headers as Record<string, string> | undefined) },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return (await res.text()).replace(/^\ufeff/, "");
}
