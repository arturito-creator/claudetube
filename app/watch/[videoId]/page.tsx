import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { Player } from "@/components/Player";
import { bundleAssetUrl, bundleEntryUrl } from "@/lib/bundle-url";
import { LikeButton } from "@/components/LikeButton";

export const revalidate = 0;

export default async function WatchPage({
  params,
}: {
  params: Promise<{ videoId: string }>;
}) {
  const { videoId } = await params;
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    include: { owner: { select: { handle: true, name: true } } },
  });
  if (!video) notFound();

  // Fire-and-forget view count bump.
  prisma.video
    .update({
      where: { id: video.id },
      data: { viewCount: { increment: 1 } },
    })
    .catch(() => {});

  const session = await auth();
  let userLiked = false;
  if (session?.user?.id) {
    userLiked = !!(await prisma.like.findUnique({
      where: {
        userId_videoId: { userId: session.user.id, videoId: video.id },
      },
    }));
  }

  const entryUrl = bundleEntryUrl(video.id, video.entryHtml);
  const companionVideoUrl = video.companionVideoPath
    ? bundleAssetUrl(video.id, video.companionVideoPath)
    : null;

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-6">
      <div>
        <Player
          videoId={video.id}
          entryUrl={entryUrl}
          bundleOrigin={process.env.NEXT_PUBLIC_BUNDLE_ORIGIN || ""}
          companionVideoUrl={companionVideoUrl}
        />
        <h1 className="mt-4 text-xl font-semibold">{video.title}</h1>
        <div className="mt-2 flex items-center justify-between">
          <Link
            href={`/channel/${video.owner.handle}`}
            className="text-sm text-ink/80 hover:text-ink"
          >
            @{video.owner.handle}
            {video.owner.name ? ` · ${video.owner.name}` : ""}
          </Link>
          <LikeButton
            videoId={video.id}
            initialLiked={userLiked}
            initialCount={video.likeCount}
            authed={!!session?.user?.id}
          />
        </div>
        {video.description && (
          <p className="mt-4 whitespace-pre-wrap text-sm text-ink/80 bg-white border border-black/10 rounded-md p-4">
            {video.description}
          </p>
        )}
      </div>
      <aside className="text-sm text-ink/70 space-y-3">
        <div className="border border-black/10 rounded-md p-3 bg-white">
          <h2 className="font-medium text-ink mb-1">About this bundle</h2>
          <p>Entry: <code>{video.entryHtml}</code></p>
          {video.companionVideoPath && (
            <p>Companion: <code>{video.companionVideoPath}</code></p>
          )}
          <p className="mt-2 text-xs">
            Rendered live in a sandboxed iframe. No MP4 re-encoding —
            interactivity is preserved.
          </p>
        </div>
      </aside>
    </div>
  );
}
