import { prisma } from "@/lib/db";
import { VideoCard } from "@/components/VideoCard";

export const revalidate = 0;

export default async function HomePage() {
  const videos = await prisma.video.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { owner: { select: { handle: true } } },
  });

  if (videos.length === 0) {
    return (
      <div className="mt-16 text-center">
        <h1 className="text-2xl font-semibold">No animations yet</h1>
        <p className="mt-2 text-ink/60 max-w-md mx-auto">
          ClaudeTube hosts Claude Design HTML bundles so anyone can watch them
          live in the browser. Export a bundle from Claude Design and upload it
          here.
        </p>
        <a
          href="/upload"
          className="inline-block mt-6 rounded-full bg-ink text-white px-5 py-2"
        >
          Upload the first bundle
        </a>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Latest animations</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {videos.map((v) => (
          <VideoCard
            key={v.id}
            id={v.id}
            title={v.title}
            handle={v.owner.handle}
            thumbnailUrl={v.thumbnailKey ? `/thumb/${v.id}` : null}
            likeCount={v.likeCount}
            hasCompanionVideo={!!v.companionVideoPath}
          />
        ))}
      </div>
    </div>
  );
}
