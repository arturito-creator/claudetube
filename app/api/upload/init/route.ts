import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { presignPut } from "@/lib/storage";

export const runtime = "nodejs";

const metaSchema = z.object({
  title: z.string().min(1).max(160),
  description: z.string().max(4000).optional().default(""),
  size: z.number().int().positive().max(200 * 1024 * 1024),
});

/**
 * Step 1 of the upload flow. Authenticates the user, validates metadata, and
 * hands back a presigned PUT URL pointing to a per-user pending key in R2.
 * The client uploads the ZIP directly (bypassing Vercel's 4.5 MB body limit),
 * then calls `/api/upload/finalize` to extract and publish.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const parsed = metaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid metadata", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const videoId = `v_${randomBytes(8).toString("hex")}`;
  const pendingKey = `pending/${session.user.id}/${videoId}.zip`;
  const uploadUrl = await presignPut(pendingKey, {
    contentType: "application/zip",
    expiresSec: 15 * 60,
  });

  return NextResponse.json({
    videoId,
    uploadUrl,
    pendingKey,
    title: parsed.data.title,
    description: parsed.data.description,
  });
}
