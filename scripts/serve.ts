/** Tiny static server for dist/ (bun run dev [port]). Mimics host behaviour: no-cache html, immutable hashed files. */
import { extname, join, normalize } from "node:path";
const root = join(process.cwd(), "dist");
const port = Number(process.argv[2] ?? process.env.PORT ?? 8080);
const types: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".css": "text/css" };
Bun.serve({
  port,
  async fetch(req) {
    const path = new URL(req.url).pathname;
    const rel = normalize(path === "/" ? "/index.html" : path);
    if (rel.includes("..")) return new Response("bad path", { status: 400 });
    const f = Bun.file(join(root, rel));
    if (!(await f.exists())) return new Response("not found", { status: 404 });
    const hashed = /\.[a-z0-9]{8,10}\.(js|json)$/.test(rel);
    return new Response(f, { headers: { "content-type": types[extname(rel)] ?? "application/octet-stream", "cache-control": hashed ? "public, max-age=31536000, immutable" : "no-cache" } });
  },
});
console.log(`http://localhost:${port}`);
