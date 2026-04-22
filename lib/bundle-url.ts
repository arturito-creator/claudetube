/**
 * Build the URL used by the iframe to load a bundle.
 *
 * In production, `BUNDLE_ORIGIN` is a *different* origin from `APP_ORIGIN`
 * (e.g. https://bundles.claudetube.app) so the sandbox `<iframe>` is a real
 * security boundary. In dev we fall back to a same-origin path prefix so you
 * don't need wildcard DNS, and we rely on `sandbox=""` alone.
 */
export function bundleEntryUrl(videoId: string, entryHtml: string): string {
  const origin = process.env.BUNDLE_ORIGIN?.trim();
  const path = `/b/${videoId}/${entryHtml.replace(/^\/+/, "")}`;
  if (origin) return `${origin}${path}`;
  return path; // same-origin dev fallback
}

export function bundleAssetUrl(videoId: string, relPath: string): string {
  const origin = process.env.BUNDLE_ORIGIN?.trim();
  const path = `/b/${videoId}/${relPath.replace(/^\/+/, "")}`;
  if (origin) return `${origin}${path}`;
  return path;
}
