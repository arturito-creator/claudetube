import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { safeExtractZip, ZipError } from "@/lib/zip";
import {
  deleteObject,
  getObjectBuffer,
  putDirectory,
} from "@/lib/storage";
import { slugify, randomSuffix } from "@/lib/slug";
import { bundleEntryUrl } from "@/lib/bundle-url";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  videoId: z.string().regex(/^v_[a-f0-9]{16}$/),
  title: z.string().min(1).max(160),
  description: z.string().max(4000).optional().default(""),
});

/**
 * Step 2 of the upload flow. The ZIP has already been PUT directly to R2 at
 * `pending/{userId}/{videoId}.zip`. This route downloads it, extracts with
 * the same hardened guards as the legacy single-shot route, promotes the
 * contents to `bundles/{videoId}/`, and inserts the Video row. Thumbnails
 * are skipped on Vercel because headless Chromium doesn't fit in a
 * serverless function bundle.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid request", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { videoId, title, description } = parsed.data;
  const pendingKey = `pending/${session.user.id}/${videoId}.zip`;

  const workRoot = await fs.mkdtemp(path.join(os.tmpdir(), "claudetube-"));
  const zipPath = path.join(workRoot, "upload.zip");
  const extractDir = path.join(workRoot, "bundle");

  try {
    const buf = await getObjectBuffer(pendingKey);
    await fs.writeFile(zipPath, buf);

    const extract = await safeExtractZip(zipPath, extractDir);

    const bundleKey = `bundles/${videoId}`;
    await putDirectory(
      extract.rootDir,
      bundleKey,
      extract.files.map((f) => ({
        relPath: f.relPath,
        absPath: f.absPath,
        contentType: f.contentType,
      })),
    );

    const slug = `${slugify(title)}-${randomSuffix()}`;
    const video = await prisma.video.create({
      data: {
        id: videoId,
        ownerId: session.user.id,
        title,
        description,
        slug,
        bundleKey,
        entryHtml: extract.entryHtml,
        companionVideoPath: extract.companionVideoPath,
        thumbnailKey: null,
      },
    });

    // Best-effort cleanup of the pending zip.
    deleteObject(pendingKey).catch(() => {});

    return NextResponse.json({
      id: video.id,
      slug: video.slug,
      watchUrl: `/watch/${video.id}`,
      entryUrl: bundleEntryUrl(video.id, video.entryHtml),
    });
  } catch (err) {
    if (err instanceof ZipError) {
      return NextResponse.json(
        { error: "invalid bundle", code: err.code, message: err.message },
        { status: 400 },
      );
    }
    console.error("finalize failed", err);
    return NextResponse.json(
      { error: "finalize failed", message: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  } finally {
    await fs.rm(workRoot, { recursive: true, force: true }).catch(() => {});
  }
}
