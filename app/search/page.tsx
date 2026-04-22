import { prisma } from "@/lib/db";
import { VideoCard } from "@/components/VideoCard";
import { Prisma } from "@prisma/client";

export const revalidate = 0;

type SearchRow = {
  id: string;
  title: string;
  likeCount: number;
  thumbnailKey: string | null;
  companionVideoPath: string | null;
  handle: string;
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  if (!q) {
    return (
      <div className="mt-10 text-center text-ink/60">
        Type a query in the search box above.
      </div>
    );
  }

  // Use the tsvector column added by prisma/migrations/001_tsvector.sql.
  // Fall back to ILIKE if the column isn't present yet.
  let rows: SearchRow[] = [];
  try {
    rows = await prisma.$queryRaw<SearchRow[]>(Prisma.sql`
      SELECT v.id, v.title, v."likeCount", v."thumbnailKey",
             v."companionVideoPath", u.handle
      FROM "Video" v
      JOIN "User" u ON u.id = v."ownerId"
      WHERE v.search @@ plainto_tsquery('simple', ${q})
      ORDER BY ts_rank(v.search, plainto_tsquery('simple', ${q})) DESC,
               v."createdAt" DESC
      LIMIT 60
    `);
  } catch {
    rows = await prisma.$queryRaw<SearchRow[]>(Prisma.sql`
      SELECT v.id, v.title, v."likeCount", v."thumbnailKey",
             v."companionVideoPath", u.handle
      FROM "Video" v
      JOIN "User" u ON u.id = v."ownerId"
      WHERE v.title ILIKE ${"%" + q + "%"}
         OR v.description ILIKE ${"%" + q + "%"}
         OR u.handle ILIKE ${"%" + q + "%"}
      ORDER BY v."createdAt" DESC
      LIMIT 60
    `);
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">
        Results for “{q}” — {rows.length}
      </h1>
      {rows.length === 0 ? (
        <p className="text-ink/60">Nothing matched.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map((v) => (
            <VideoCard
              key={v.id}
              id={v.id}
              title={v.title}
              handle={v.handle}
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
