import { existsSync } from "node:fs";
import { parsePage } from "../src/shared/parse";
import type { Entry, PageData } from "../src/shared/types";

export const DOCS = process.env.FMHY_DOCS ?? ".cache/docs";
export const hasDocs = existsSync(`${DOCS}/video.md`);

export function flat(p: PageData): Entry[] {
  return p.s.flatMap((s) => [...s.e, ...s.b.flatMap((b) => b.e)]);
}

/** Parse a snippet that lives inside one section. */
export function parseLines(...lines: string[]) {
  return parsePage("t", "T", ["# ► S", "", ...lines].join("\n"));
}
