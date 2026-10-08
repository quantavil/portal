import { createDecipheriv, pbkdf2Sync } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { codeBlocks, decodeBase64Destination, fetchText, unescapeHtml } from "./gateways";

/*
 * NSFW catalogue, build time only.
 *
 * Reality (ported from the owner's Python converter, NOT "just Base64 pointers"):
 *   1. https://rentry.org/NSFW-Checkpoint lists rotating, Base64-encoded pointers in <code> blocks and a
 *      public password "(PW: xxxx)".
 *   2. One pointer is a PrivateBin paste URL: https://paste.to/?id#<base58 key>. The key lives in the URL fragment.
 *   3. The paste is fetched as JSON and decrypted: PBKDF2-SHA256(key || password) -> AES-GCM, raw-deflate.
 *   4. The plaintext is FMHY-style markdown, parsed by the same parser as every other page.
 *
 * UNVERIFIED against the live hosts (rentry/paste.to are not reachable from the dev sandbox). The crypto is
 * covered by a round-trip test against an independent Python implementation (test/nsfw.test.ts).
 * Callers must treat any failure as non-fatal and keep the last good snapshot.
 */

const NSFW_CHECKPOINT = "https://rentry.org/NSFW-Checkpoint";
const PRIVATEBIN_HOSTS = new Set(["paste.to", "privatebin.net"]);
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function base58Decode(value: string): Buffer {
  let n = 0n;
  for (const ch of value) {
    const i = B58.indexOf(ch);
    if (i < 0) throw new Error("invalid base58 character");
    n = n * 58n + BigInt(i);
  }
  let hex = n.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  const raw = n === 0n ? Buffer.alloc(0) : Buffer.from(hex, "hex");
  const zeros = value.length - value.replace(/^1+/, "").length;
  return Buffer.concat([Buffer.alloc(zeros), raw]);
}

export type PrivateBinPayload = { ct: string; adata: [[string, string, number, number, number, string, string, string], ...unknown[]] };

export function decryptPrivateBin(payload: PrivateBinPayload, secret: string, password: string): string {
  const spec = payload.adata[0];
  const [ivB64, saltB64, iterations, keyBits, tagBits, algo, mode, compression] = spec;
  if (algo !== "aes" || mode !== "gcm") throw new Error(`unsupported cipher ${algo}/${mode}`);

  let secretBytes = base58Decode(secret);
  if (secretBytes.length < 32) secretBytes = Buffer.concat([Buffer.alloc(32 - secretBytes.length), secretBytes]);
  const key = pbkdf2Sync(Buffer.concat([secretBytes, Buffer.from(password, "utf8")]), Buffer.from(saltB64, "base64"), iterations, keyBits / 8, "sha256");

  const ct = Buffer.from(payload.ct, "base64");
  const tagLen = tagBits / 8;
  const decipher = createDecipheriv(`aes-${keyBits}-gcm` as "aes-256-gcm", key, Buffer.from(ivB64, "base64"), { authTagLength: tagLen });
  decipher.setAAD(Buffer.from(JSON.stringify(payload.adata)));
  decipher.setAuthTag(ct.subarray(ct.length - tagLen));
  let plain = Buffer.concat([decipher.update(ct.subarray(0, ct.length - tagLen)), decipher.final()]);
  if (compression === "zlib") plain = inflateRawSync(plain);
  const paste = (JSON.parse(plain.toString("utf8")) as { paste?: string }).paste;
  if (typeof paste !== "string") throw new Error("decrypted payload has no paste");
  return paste;
}

export function parseCheckpoint(html: string): { pasteUrl: string; password: string } {
  const destinations = codeBlocks(html)
    .map(decodeBase64Destination)
    .filter((d): d is string => !!d);

  // password: tolerate the value being wrapped in markup
  const text = unescapeHtml(html);
  const pw = /\(PW:\s*([^)<\s]+)\)/i.exec(text) ?? /\(PW:\s*([^)\s]+)\)/i.exec(text.replace(/<[^>]+>/g, ""));
  const password = pw ? pw[1]! : "";

  const pasteUrl = destinations.find((d) => {
    try {
      const u = new URL(d);
      return PRIVATEBIN_HOSTS.has(u.hostname) && u.hash.length > 1;
    } catch {
      return false;
    }
  });
  if (!pasteUrl) throw new Error("No decryptable NSFW catalogue backup was found");
  return { pasteUrl, password };
}

/** Full pipeline: checkpoint page -> PrivateBin paste -> decrypted markdown. */
export async function fetchNsfwMarkdown(checkpointUrl = NSFW_CHECKPOINT): Promise<string> {
  const html = await fetchText(checkpointUrl);
  const { pasteUrl, password } = parseCheckpoint(html);
  const u = new URL(pasteUrl);
  const secret = u.hash.slice(1);
  u.hash = "";
  const body = await fetchText(u.href, { headers: { "X-Requested-With": "JSONHttpRequest" } });
  return decryptPrivateBin(JSON.parse(body) as PrivateBinPayload, secret, password);
}
