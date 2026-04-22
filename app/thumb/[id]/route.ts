import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getObjectStream } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const v = await prisma.video.findUnique({
    where: { id },
    select: { thumbnailKey: true },
  });
  if (!v?.thumbnailKey) {
    return new NextResponse("no thumbnail", { status: 404 });
  }
  try {
    const { stream, contentType, contentLength } = await getObjectStream(v.thumbnailKey);
    const headers = new Headers();
    headers.set("Content-Type", contentType ?? "image/jpeg");
    if (contentLength !== undefined) headers.set("Content-Length", String(contentLength));
    headers.set("Cache-Control", "public, max-age=86400, immutable");
    return new NextResponse(stream as unknown as ReadableStream, { headers });
  } catch {
    return new NextResponse("not found", { status: 404 });
  }
}
