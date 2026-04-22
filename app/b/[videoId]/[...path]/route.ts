import { NextResponse } from "next/server";
import { getObjectStream } from "@/lib/storage";
import { sanitizeEntryPath } from "@/lib/zip";

export const runtime = "nodejs";

/**
 * Serves files from an uploaded bundle. Two important things happen here:
 *
 * 1. The response includes a strict CSP so even if the bundle is malicious,
 *    it can't exfiltrate cookies/localStorage from the app origin or navigate
 *    the parent frame.
 * 2. `X-Frame-Options` is omitted (we *want* framing) and CSP `frame-ancestors`
 *    is narrowed to the app origin.
 *
 * In production `BUNDLE_ORIGIN` should be a different host than `APP_ORIGIN`
 * so the iframe is a real origin-isolated sandbox. In dev we accept
 * same-origin and rely on `<iframe sandbox>`.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ videoId: string; path: string[] }> },
) {
  const { videoId, path: pathParts } = await ctx.params;
  if (!/^v_[a-f0-9]{16}$/.test(videoId)) {
    return new NextResponse("bad video id", { status: 400 });
  }

  let rel: string;
  try {
    rel = sanitizeEntryPath(pathParts.join("/"));
  } catch {
    return new NextResponse("bad path", { status: 400 });
  }

  const key = `bundles/${videoId}/${rel}`;
  try {
    const { stream, contentType, contentLength } = await getObjectStream(key);
    const headers = new Headers();
    if (contentType) headers.set("Content-Type", contentType);
    if (contentLength !== undefined) {
      headers.set("Content-Length", String(contentLength));
    }
    headers.set("Cache-Control", "public, max-age=3600, immutable");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "no-referrer");

    const appOrigin = process.env.APP_ORIGIN || "http://localhost:3000";
    headers.set(
      "Content-Security-Policy",
      [
        "default-src 'self' data: blob:",
        "img-src 'self' data: blob:",
        "media-src 'self' data: blob:",
        "style-src 'self' 'unsafe-inline'",
        // Claude Design bundles typically rely on inline <script> and shaders.
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
        "connect-src 'self'",
        "font-src 'self' data:",
        `frame-ancestors ${appOrigin}`,
        "base-uri 'none'",
        "form-action 'none'",
      ].join("; "),
    );

    return new NextResponse(stream as unknown as ReadableStream, {
      status: 200,
      headers,
    });
  } catch (err) {
    console.warn("bundle fetch failed", key, err);
    return new NextResponse("not found", { status: 404 });
  }
}
