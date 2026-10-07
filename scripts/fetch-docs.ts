/** Download the upstream markdown pages into .cache/docs (used by `bun run build` and `bun test`). */
import { mkdir } from "node:fs/promises";
import { PAGES, RAW_BASE } from "../src/shared/pages";

export const DOCS_DIR = ".cache/docs";

export async function fetchDocs(dir = DOCS_DIR, log = console.log): Promise<void> {
  await mkdir(dir, { recursive: true });
  const queue = [...PAGES];
  let failed = 0;
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (let p = queue.shift(); p; p = queue.shift()) {
        try {
          const res = await fetch(RAW_BASE + p.k + ".md", { signal: AbortSignal.timeout(30_000) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          await Bun.write(`${dir}/${p.k}.md`, await res.text());
        } catch (e) {
          failed++;
          log(`  ! ${p.k}: ${(e as Error).message}`);
        }
      }
    }),
  );
  if (failed) throw new Error(`${failed} page(s) failed to download`);
  log(`Downloaded ${PAGES.length} pages to ${dir}`);
}

if (import.meta.main) await fetchDocs(process.argv[2] ?? DOCS_DIR);
