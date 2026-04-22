import Link from "next/link";

type VideoCardProps = {
  id: string;
  title: string;
  handle: string;
  thumbnailUrl: string | null;
  likeCount: number;
  hasCompanionVideo: boolean;
};

export function VideoCard({
  id,
  title,
  handle,
  thumbnailUrl,
  likeCount,
  hasCompanionVideo,
}: VideoCardProps) {
  return (
    <Link
      href={`/watch/${id}`}
      className="group block rounded-lg overflow-hidden border border-black/10 bg-white hover:shadow-md transition"
    >
      <div className="aspect-video bg-ink/5 relative">
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnailUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-ink/40 text-sm">
            animation
          </div>
        )}
        {hasCompanionVideo && (
          <span className="absolute bottom-2 right-2 text-[10px] uppercase tracking-wide bg-black/70 text-white px-1.5 py-0.5 rounded">
            +video
          </span>
        )}
      </div>
      <div className="p-3">
        <h3 className="font-medium text-sm line-clamp-2 group-hover:text-brand">
          {title}
        </h3>
        <p className="text-xs text-ink/60 mt-1">
          @{handle} · {likeCount} like{likeCount === 1 ? "" : "s"}
        </p>
      </div>
    </Link>
  );
}
