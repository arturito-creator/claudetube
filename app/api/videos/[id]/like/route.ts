import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const { id: videoId } = await params;

  const existing = await prisma.like.findUnique({
    where: { userId_videoId: { userId, videoId } },
  });

  if (existing) {
    await prisma.$transaction([
      prisma.like.delete({
        where: { userId_videoId: { userId, videoId } },
      }),
      prisma.video.update({
        where: { id: videoId },
        data: { likeCount: { decrement: 1 } },
      }),
    ]);
    return NextResponse.json({ liked: false });
  }

  await prisma.$transaction([
    prisma.like.create({ data: { userId, videoId } }),
    prisma.video.update({
      where: { id: videoId },
      data: { likeCount: { increment: 1 } },
    }),
  ]);
  return NextResponse.json({ liked: true });
}
