import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { safeExtractZip, ZipError } from "@/lib/zip";
import { putDirectory, putBuffer } from "@/lib/storage";
import { captureThumbnail } from "@/lib/thumbnail";
import { slugify, randomSuffix } from "@/lib/slug";
import { bundleEntryUrl } from "@/lib/bundle-url";

export const runtime = "nodejs";
export const maxDuration = 120;

const metaSchema = z.object({
  title: z.string().min(1).max(160),
  description: z.string().max(4000).optional().default(""),
});

const MAX_ZIP_BYTES = Number(process.env.MAX_ZIP_BYTES ?? 200 * 1024 * 1024);

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const parsed = metaSchema.safeParse({
    title: form.get("title"),
    description: form.get("description") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid metadata", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const { title, description } = parsed.data;

  const file = form.get("bundle");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "bundle file required" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "bundle is empty" }, { status: 400 });
  }
  if (file.size > MAX_ZIP_BYTES) {
    return NextResponse.json(
      { error: `bundle exceeds ${MAX_ZIP_BYTES} bytes` },
      { status: 413 },
    );
  }
  if (!file.name.toLowerCase().endsWith(".zip")) {
    return NextResponse.json({ error: "bundle must be a .zip" }, { status: 400 });
  }

  const videoId = `v_${randomBytes(8).toString("hex")}`;
  const workRoot = await fs.mkdtemp(path.join(os.tmpdir(), "claudetube-"));
  const zipPath = path.join(workRoot, "upload.zip");
  const extractDir = path.join(workRoot, "bundle");

  try {
    const buf = Buffer.from(await file.arrayBuffer());
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

    // Capture thumbnail off the local extracted copy (no network round-trip).
    // We use a file:// URL so Chromium doesn't need S3 to be reachable.
    let thumbnailKey: string | null = null;
    try {
      const fileUrl = `file://${path.join(extract.rootDir, extract.entryHtml)}`;
      const jpeg = await captureThumbnail(fileUrl);
      thumbnailKey = `thumbnails/${videoId}.jpg`;
      await putBuffer(thumbnailKey, jpeg, "image/jpeg");
    } catch (err) {
      console.warn("thumbnail capture failed", err);
    }

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
        thumbnailKey,
      },
    });

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
    console.error("upload failed", err);
    return NextResponse.json({ error: "upload failed" }, { status: 500 });
  } finally {
    await fs.rm(workRoot, { recursive: true, force: true }).catch(() => {});
  }
}
