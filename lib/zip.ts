import { createWriteStream, promises as fs } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import yauzl from "yauzl";

export type ExtractedFile = {
  relPath: string;
  absPath: string;
  size: number;
  contentType: string;
};

export type ExtractResult = {
  rootDir: string;
  files: ExtractedFile[];
  entryHtml: string;
  companionVideoPath: string | null;
  totalBytes: number;
};

export class ZipError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const DEFAULT_LIMITS = {
  maxEntries: Number(process.env.MAX_ENTRIES ?? 2000),
  maxUncompressedBytes: Number(process.env.MAX_EXTRACTED_BYTES ?? 500 * 1024 * 1024),
  perFileMaxBytes: 250 * 1024 * 1024,
};

const VIDEO_EXTS = new Set([".mp4", ".webm", ".mov", ".m4v"]);

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".m4v": "video/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
};

// Only file extensions listed here are allowed out of the zip. Anything else
// (`.sh`, `.exe`, `.php`, `.py`, etc.) is rejected — Claude Design bundles
// don't need them, and shipping executables to the bundle origin is risky.
const ALLOWED_EXTS = new Set(Object.keys(CONTENT_TYPES));

/** Normalize a zip entry path into a repo-relative POSIX path, or throw. */
export function sanitizeEntryPath(raw: string): string {
  if (!raw) throw new ZipError("EMPTY_PATH", "empty entry path");
  // Reject NULs — some archives abuse these.
  if (raw.includes("\0")) throw new ZipError("NUL_BYTE", "NUL byte in entry path");
  // Normalize to POSIX separators.
  const normalized = raw.replace(/\\/g, "/");
  if (normalized.startsWith("/")) {
    throw new ZipError("ABSOLUTE_PATH", `absolute path not allowed: ${raw}`);
  }
  if (/^[a-zA-Z]:\//.test(normalized)) {
    throw new ZipError("ABSOLUTE_PATH", `drive-letter path not allowed: ${raw}`);
  }
  const parts = normalized.split("/");
  if (parts.some((p) => p === "..")) {
    throw new ZipError("PATH_TRAVERSAL", `path traversal in entry: ${raw}`);
  }
  // Strip "." and empty segments.
  const clean = parts.filter((p) => p && p !== ".").join("/");
  if (!clean) throw new ZipError("EMPTY_PATH", "entry resolves to empty path");
  return clean;
}

function contentTypeFor(relPath: string): string {
  const ext = path.extname(relPath).toLowerCase();
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

function assertAllowedExt(relPath: string) {
  const ext = path.extname(relPath).toLowerCase();
  if (!ALLOWED_EXTS.has(ext)) {
    throw new ZipError("DISALLOWED_EXT", `file type not allowed: ${relPath}`);
  }
}

function isSymlink(externalFileAttributes: number): boolean {
  // Unix file mode lives in the high 16 bits of externalFileAttributes.
  const mode = (externalFileAttributes >>> 16) & 0xffff;
  // S_IFLNK = 0o120000
  return (mode & 0o170000) === 0o120000;
}

/**
 * Safely extract a ZIP from `zipPath` into `destDir`. Rejects archives that:
 *  - contain absolute paths, drive letters, `..`, or NUL bytes
 *  - contain symlinks (macOS zips sometimes include them — still unsafe)
 *  - would exceed entry count or uncompressed-size caps (zip-bomb guard)
 *  - contain disallowed file extensions
 *  - do not contain an `index.html` (or a manifest pointing to one)
 */
export async function safeExtractZip(
  zipPath: string,
  destDir: string,
  limits = DEFAULT_LIMITS,
): Promise<ExtractResult> {
  await fs.mkdir(destDir, { recursive: true });

  const zipfile = await new Promise<yauzl.ZipFile>((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, autoClose: true }, (err, z) => {
      if (err || !z) return reject(err ?? new Error("could not open zip"));
      resolve(z);
    });
  });

  const files: ExtractedFile[] = [];
  let totalBytes = 0;
  let entryCount = 0;

  await new Promise<void>((resolve, reject) => {
    // yauzl performs its own path validation before emitting `entry` and
    // raises plain Errors like "invalid relative path: ...". Map those to
    // our typed ZipError so callers can react uniformly.
    zipfile.on("error", (err: Error) => {
      if (err instanceof ZipError) return reject(err);
      const msg = err.message || String(err);
      if (/invalid relative path|invalid characters/i.test(msg)) {
        return reject(new ZipError("PATH_TRAVERSAL", msg));
      }
      return reject(err);
    });
    zipfile.on("end", resolve);
    zipfile.on("entry", (entry: yauzl.Entry) => {
      (async () => {
        entryCount++;
        if (entryCount > limits.maxEntries) {
          throw new ZipError("TOO_MANY_ENTRIES", `more than ${limits.maxEntries} entries`);
        }

        if (isSymlink(entry.externalFileAttributes)) {
          throw new ZipError("SYMLINK", `symlink not allowed: ${entry.fileName}`);
        }

        // Directory entries end in "/"; skip silently (dirs are created on file write).
        if (/\/$/.test(entry.fileName)) {
          zipfile.readEntry();
          return;
        }

        const rel = sanitizeEntryPath(entry.fileName);
        assertAllowedExt(rel);

        if (entry.uncompressedSize > limits.perFileMaxBytes) {
          throw new ZipError(
            "FILE_TOO_LARGE",
            `${rel} is ${entry.uncompressedSize}B > ${limits.perFileMaxBytes}B`,
          );
        }
        if (totalBytes + entry.uncompressedSize > limits.maxUncompressedBytes) {
          throw new ZipError(
            "BUNDLE_TOO_LARGE",
            `bundle exceeds ${limits.maxUncompressedBytes}B uncompressed`,
          );
        }

        const abs = path.join(destDir, rel);
        // Belt-and-suspenders: verify `abs` is still inside destDir.
        const relToDest = path.relative(destDir, abs);
        if (relToDest.startsWith("..") || path.isAbsolute(relToDest)) {
          throw new ZipError("PATH_TRAVERSAL", `resolved path escapes dest: ${rel}`);
        }

        await fs.mkdir(path.dirname(abs), { recursive: true });

        const read = await new Promise<NodeJS.ReadableStream>((res, rej) => {
          zipfile.openReadStream(entry, (err, s) => {
            if (err || !s) return rej(err ?? new Error("no stream"));
            res(s);
          });
        });

        // Enforce the per-file cap during streaming as a second line of defense
        // against lying headers.
        let written = 0;
        const counter = new (await import("node:stream")).Transform({
          transform(chunk, _enc, cb) {
            written += chunk.length;
            if (written > limits.perFileMaxBytes) {
              cb(new ZipError("FILE_TOO_LARGE_STREAM", `${rel} exceeded cap while streaming`));
              return;
            }
            cb(null, chunk);
          },
        });

        await pipeline(read, counter, createWriteStream(abs));
        totalBytes += written;

        files.push({
          relPath: rel,
          absPath: abs,
          size: written,
          contentType: contentTypeFor(rel),
        });

        zipfile.readEntry();
      })().catch((err) => {
        zipfile.removeAllListeners();
        reject(err);
      });
    });
    zipfile.readEntry();
  });

  // Pick the entry HTML. Prefer index.html at root; else a manifest pointer;
  // else the first HTML file.
  const entryHtml = await pickEntryHtml(destDir, files);
  const companionVideoPath = pickCompanionVideo(files);

  return { rootDir: destDir, files, entryHtml, companionVideoPath, totalBytes };
}

async function pickEntryHtml(destDir: string, files: ExtractedFile[]): Promise<string> {
  const rootIndex = files.find((f) => f.relPath === "index.html");
  if (rootIndex) return "index.html";

  const manifest = files.find((f) => f.relPath === "claudedesign.json");
  if (manifest) {
    try {
      const raw = await fs.readFile(manifest.absPath, "utf8");
      const json = JSON.parse(raw) as { entry?: string };
      if (json.entry && typeof json.entry === "string") {
        const clean = sanitizeEntryPath(json.entry);
        if (files.some((f) => f.relPath === clean)) return clean;
      }
    } catch {
      // fall through
    }
  }

  const anyHtml = files.find((f) => f.relPath.endsWith(".html"));
  if (anyHtml) return anyHtml.relPath;

  throw new ZipError("NO_ENTRY_HTML", "bundle has no .html entry point");
}

function pickCompanionVideo(files: ExtractedFile[]): string | null {
  // Prefer shortest top-level name, biggest file wins for ties.
  const videos = files
    .filter((f) => VIDEO_EXTS.has(path.extname(f.relPath).toLowerCase()))
    .sort((a, b) => {
      const da = a.relPath.split("/").length - b.relPath.split("/").length;
      if (da !== 0) return da;
      return b.size - a.size;
    });
  return videos[0]?.relPath ?? null;
}
