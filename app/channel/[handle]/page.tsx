import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { VideoCard } from "@/components/VideoCard";

export const revalidate = 0;

export default async function ChannelPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const user = await prisma.user.findUnique({
    where: { handle },
    include: {
      videos: {
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!user) notFound();

  return (
    <div>
      <header className="flex items-center gap-4 mb-6">
        <div className="w-16 h-16 rounded-full bg-brand/20 grid place-items-center text-brand font-semibold text-xl">
          {user.handle.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <h1 className="text-2xl font-semibold">@{user.handle}</h1>
          {user.name && <p className="text-ink/70">{user.name}</p>}
          <p className="text-xs text-ink/60 mt-1">
            {user.videos.length} animation{user.videos.length === 1 ? "" : "s"}
          </p>
        </div>
      </header>

      {user.videos.length === 0 ? (
        <p className="text-ink/60">No uploads yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {user.videos.map((v) => (
            <VideoCard
              key={v.id}
              id={v.id}
              title={v.title}
              handle={user.handle}
              thumbnailUrl={v.thumbnailKey ? `/thumb/${v.id}` : null}
              likeCount={v.likeCount}
              hasCompanionVideo={!!v.companionVideoPath}
            />
          ))}
        </div>
      )}
    </div>
  );
}
