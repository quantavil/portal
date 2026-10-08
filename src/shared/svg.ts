/** Central static SVG art (never dataset). Pure strings: safe in Node (build) and browser. */
const wrap = (size: number, inner: string): string =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

export const searchSvg = (size: number): string =>
  wrap(size, '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>');

export const gearSvg = (size: number): string =>
  wrap(size, '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>');

export const keyboardSvg = (size: number): string =>
  wrap(size, '<rect x="3" y="7" width="18" height="11" rx="2"/><path d="M7 11h.01M11 11h.01M15 11h.01M17.5 11h.01M7 14.5h10"/>');

export const starSvg = (size: number): string =>
  wrap(size, '<path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-3-5.4 3 1.1-6L3.2 9.4l6.1-.8z"/>');

export const copySvg = (size: number): string =>
  wrap(size, '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>');

export const PIN_SVG = wrap(
  15,
  '<line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>',
);

export const backSvg = (size: number): string =>
  wrap(size, '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>');

export const arrowUpSvg = (size: number): string =>
  wrap(size, '<path d="m18 15-6-6-6 6"/>');

export const arrowDownSvg = (size: number): string =>
  wrap(size, '<path d="m6 9 6 6 6-6"/>');

export const yandexSvg = (size: number): string =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" aria-hidden="true"><path d="M15.5 2H8.2c-3.1 0-5.2 2-5.2 5.2 0 2.7 1.6 4.6 4.1 5.1L3 22h3.6l3.8-9h2.3v9h2.8V2zm-2.8 8.4h-4.3c-1.5 0-2.6-.9-2.6-2.5 0-1.6 1.1-2.5 2.6-2.5h4.3v5z"/></svg>`;

export const googleSvg = (size: number): string =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" aria-hidden="true"><path d="M21.35 11.1h-9.17v2.98h5.27c-.24 1.4-1.07 2.6-2.25 3.38v2.78h3.63c2.12-1.96 3.35-4.85 3.35-8.26 0-.6-.05-1.18-.16-1.74l-.67.86zM12.18 21c2.72 0 5-.9 6.67-2.45l-3.26-2.54c-.9.6-2.06.97-3.41.97-2.62 0-4.85-1.77-5.64-4.15H3.19v2.62C4.84 18.73 8.24 21 12.18 21zm-5.64-9c0-.64.11-1.26.31-1.85V7.53H3.19A9.97 9.97 0 0 0 2 12c0 1.61.39 3.14 1.19 4.47l3.66-2.85c-.2-.59-.31-1.21-.31-1.85zm5.64-6.38c1.48 0 2.81.51 3.86 1.51l2.9-2.9C17.18 2.55 14.89 1.62 12.18 1.62 8.24 1.62 4.84 3.89 3.19 7.15l3.66 2.84c.79-2.38 3.02-4.15 5.64-4.15z"/></svg>`;

export const googleAiSvg = (size: number): string =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" aria-hidden="true"><path d="m19 9 1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5zm7.5 5.5-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25L19 15z"/></svg>`;

export const duckDuckGoSvg = (size: number): string =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" aria-hidden="true"><path d="M12 2C6.5 2 2 6.5 2 12c0 3.2 1.5 6 3.8 7.8.2.2.5.2.7 0 .2-.2.2-.5 0-.7-2.1-1.6-3.5-4.2-3.5-7.1 0-4.9 4-9 9-9s9 4.1 9 9c0 2.9-1.4 5.5-3.5 7.1-.2.2-.2.5 0 .7.1.1.2.1.3.1.2 0 .3-.1.4-.2C20.5 18 22 15.2 22 12c0-5.5-4.5-10-10-10zm2 4c-1.7 0-3 1.3-3 3 0 .4.1.8.2 1.2-1.5.3-2.6 1.4-2.6 2.8 0 1 .5 1.8 1.4 2.3-.4.8-1.4 1.3-3 1.3v1.2c2.5 0 4-1 4.6-2.2.9.4 1.9.6 2.9.6 3.5 0 6-2.5 6-5.4C20.5 8.1 18 6 14 6zm-1 2.8c.4 0 .8.3.8.8s-.3.8-.8.8-.8-.3-.8-.8.4-.8.8-.8zm2.4 4.4c-1.2 0-2.2-.4-2.8-1 .6-.3 1.4-.6 2.8-.6 1.3 0 2.2.3 2.8.6-.6.6-1.6 1-2.8 1z"/></svg>`;

export const githubSvg = (size: number): string =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/></svg>`;

export const wikiSvg = (size: number): string =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5l4 14 4-10 4 10 4-14"/></svg>`;

export const redditSvg = (size: number): string =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" aria-hidden="true"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.703zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.095.324.324 0 0 0 0 .46c.928.927 2.455.992 2.947.992.492 0 2.019-.065 2.947-.992a.324.324 0 0 0-.46-.46c-.675.674-1.84.77-2.487.77-.647 0-1.812-.096-2.487-.77a.327.327 0 0 0-.229-.095z"/></svg>`;

export const dragHandleSvg = (size: number): string =>
  wrap(size, '<circle cx="9" cy="5" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="9" cy="19" r="1.2"/><circle cx="15" cy="5" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="15" cy="19" r="1.2"/>');

export const FAVICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#0f1620"/><circle cx="14" cy="14" r="6.5" fill="none" stroke="#e6edf5" stroke-width="2.6"/><path d="M19 19l6 6" stroke="#79a6ff" stroke-width="3" stroke-linecap="round"/></svg>';


