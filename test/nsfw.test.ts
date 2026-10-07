import { describe, expect, test } from "bun:test";
import { applyGateways, gatewayId } from "../src/shared/gateways";
import { parsePage } from "../src/shared/parse";
import { base58Decode, decryptPrivateBin, parseCheckpoint, type PrivateBinPayload } from "../src/build/nsfw";
import { decodeBase64Destination, parseGatewayMap } from "../src/build/gateways";
import { flat } from "./helpers";
import fx from "./fixtures/privatebin.json";

const b64 = (s: string) => Buffer.from(s).toString("base64");

describe("Base64 destination decoding (port of the Python converter)", () => {
  test("single layer", () => expect(decodeBase64Destination(b64("https://a.example/x"))).toBe("https://a.example/x"));
  test("nested layers and url-safe alphabet", () => {
    const inner = b64("https://paste.to/?abc#KEY?????>>");
    const url = b64(inner).replace(/\+/g, "-").replace(/\//g, "_");
    expect(decodeBase64Destination(url)).toBe("https://paste.to/?abc#KEY?????>>");
    expect(decodeBase64Destination(b64(b64("https://deep.example/")))).toBe("https://deep.example/");
  });
  test("whitespace tolerated; garbage and non-urls rejected", () => {
    expect(decodeBase64Destination(" " + b64("https://a.b/").slice(0, 8) + "\n" + b64("https://a.b/").slice(8))).toBe("https://a.b/");
    expect(decodeBase64Destination("not base64!!")).toBeNull();
    expect(decodeBase64Destination(b64("hello world"))).toBeNull();
    expect(decodeBase64Destination("")).toBeNull();
  });
});

describe("PrivateBin decryption (payload produced by an independent Python implementation)", () => {
  test("base58", () => {
    expect(base58Decode("2g").toString("hex")).toBe("61");
    expect(base58Decode("11").toString("hex")).toBe("0000");
    expect(() => base58Decode("0OIl")).toThrow();
  });
  test("round-trips the fixture", () => {
    expect(decryptPrivateBin(fx.payload as unknown as PrivateBinPayload, fx.secret, fx.password)).toBe(fx.expected);
  });
  test("wrong password or tampered ciphertext fails closed", () => {
    expect(() => decryptPrivateBin(fx.payload as unknown as PrivateBinPayload, fx.secret, "wrong")).toThrow();
    const bad = structuredClone(fx.payload) as unknown as PrivateBinPayload;
    bad.ct = Buffer.from(Buffer.from(bad.ct, "base64").map((b, i) => (i === 3 ? b ^ 1 : b))).toString("base64");
    expect(() => decryptPrivateBin(bad, fx.secret, fx.password)).toThrow();
  });
  test("decrypted markdown parses with the normal parser", () => {
    const r = parsePage("nsfw", "NSFW", fx.expected);
    expect(flat(r.page).map((e) => e[0])).toEqual(["Example Tube", "Another Site", "Comic Place"]);
    expect(flat(r.page)[1]![1]).toBe("https://another.example/path_(x)");
    expect(r.page.s.map((s) => s.n)).toEqual(["Adult Streaming", "Comics"]);
  });
});

describe("NSFW checkpoint page", () => {
  const paste = `https://paste.to/?abc123#${fx.secret}`;
  const html = `<html><body><p>Mirrors (PW: ${fx.password})</p>
    <code>${b64("https://example.com/other")}</code>
    <pre><code>${b64(paste)}</code></pre><code>junk!!</code></body></html>`;
  test("finds the paste url and password", () => expect(parseCheckpoint(html)).toEqual({ pasteUrl: paste, password: fx.password }));
  test("password wrapped in markup", () =>
    expect(parseCheckpoint(html.replace(`(PW: ${fx.password})`, `(PW: <b>${fx.password}</b>)`)).password).toBe(fx.password));
  test("throws a clear error when there is no paste url (non-fatal for the build)", () =>
    expect(() => parseCheckpoint("<code>" + b64("https://example.com/") + "</code>")).toThrow(/No decryptable/));
});

describe("Base64 gateways", () => {
  const html = `<h2 id="top">x</h2><h3 id="iptv-playlists">IPTV</h3><p><code>${b64("https://iptv.example/")}</code></p>
    <h3 id='hayase'>Hayase</h3><code>${b64("https://hayase.example/a")}</code><code>${b64("https://hayase.example/b")}</code><h3 id="empty">E</h3>`;
  test("parses ids and destinations", () =>
    expect(parseGatewayMap(html)).toEqual({ "iptv-playlists": ["https://iptv.example/"], hayase: ["https://hayase.example/a", "https://hayase.example/b"] }));
  test("throws when nothing decodes (non-fatal for the build)", () => expect(() => parseGatewayMap("<h3 id=a>x</h3>")).toThrow());
  test("gatewayId", () => {
    expect(gatewayId("https://rentry.co/FMHYB64#Hayase")).toBe("hayase");
    expect(gatewayId("https://rentry.org/FMHYB64#a-b")).toBe("a-b");
    expect(gatewayId("https://rentry.co/other#a")).toBeNull();
  });
  test("applyGateways resolves entries, extra destinations become mirrors, unknown ids stay", () => {
    const r = parsePage("t", "T", ["# ► S", "* [Hayase](https://rentry.co/FMHYB64#hayase) - x", "* [Unknown](https://rentry.co/FMHYB64#nope) - y", "* [Z](https://z.example) - z / [Guide](https://rentry.co/FMHYB64#iptv-playlists)"].join("\n"));
    const n = applyGateways(r.page, { hayase: ["https://hayase.example/a", "https://hayase.example/b"], "iptv-playlists": ["https://iptv.example/"] });
    const e = flat(r.page);
    expect(n).toBe(2);
    expect(e[0]![1]).toBe("https://hayase.example/a");
    expect(e[0]![4]).toEqual([["2", "https://hayase.example/b"]]);
    expect(e[1]![1]).toBe("https://rentry.co/FMHYB64#nope");
    expect(e[2]![5]).toEqual([["Guide", "https://iptv.example/"]]);
  });
});
