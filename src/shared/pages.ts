/**
 * The link-list pages of FMHY, in upstream (single-page) order.
 *
 * Deliberately NOT included (verified against fmhy/edit/docs):
 *   unsafe.md        a list of sites to AVOID (malware). Indexing it would put bad sites in search results.
 *   beginners-guide  prose guide, not a link directory
 *   index, feedback, posts, startpage, sandbox   site chrome, no link lists
 *   posts/*, other/* blog posts and contributing docs
 * When FMHY adds a page, add one line here.
 */
export const PAGES: readonly { k: string; n: string }[] = [
  { k: "privacy", n: "Adblocking / Privacy" },
  { k: "ai", n: "Artificial Intelligence" },
  { k: "mobile", n: "Android / iOS" },
  { k: "audio", n: "Music / Podcasts / Radio" },
  { k: "developer-tools", n: "Developer Tools" },
  { k: "downloading", n: "Downloading" },
  { k: "educational", n: "Educational" },
  { k: "file-tools", n: "File Tools" },
  { k: "gaming-tools", n: "Gaming Tools" },
  { k: "gaming", n: "Gaming / Emulation" },
  { k: "image-tools", n: "Image Tools" },
  { k: "internet-tools", n: "Internet Tools" },
  { k: "linux-macos", n: "Linux / macOS" },
  { k: "misc", n: "Miscellaneous" },
  { k: "non-english", n: "Non-English" },
  { k: "reading", n: "Books / Comics / Manga" },
  { k: "social-media-tools", n: "Social Media Tools" },
  { k: "storage", n: "Storage" },
  { k: "system-tools", n: "System Tools" },
  { k: "text-tools", n: "Text Tools" },
  { k: "torrenting", n: "Torrenting" },
  { k: "video-tools", n: "Video Tools" },
  { k: "video", n: "Movies / TV / Anime" },
];

export const NSFW_KEY = "nsfw";
export const NSFW_TITLE = "NSFW";
export const RAW_BASE = "https://raw.githubusercontent.com/fmhy/edit/main/docs/";
