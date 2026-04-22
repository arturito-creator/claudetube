"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function LikeButton({
  videoId,
  initialLiked,
  initialCount,
  authed,
}: {
  videoId: string;
  initialLiked: boolean;
  initialCount: number;
  authed: boolean;
}) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [pending, start] = useTransition();
  const router = useRouter();

  function toggle() {
    if (!authed) {
      router.push("/signin");
      return;
    }
    // Optimistic
    setLiked((l) => !l);
    setCount((c) => c + (liked ? -1 : 1));
    start(async () => {
      const res = await fetch(`/api/videos/${videoId}/like`, { method: "POST" });
      if (!res.ok) {
        // Revert on failure.
        setLiked(initialLiked);
        setCount(initialCount);
      }
    });
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      className={
        "rounded-full px-4 py-1.5 text-sm border transition " +
        (liked
          ? "bg-brand/10 border-brand text-brand"
          : "border-black/15 hover:border-black/40")
      }
    >
      {liked ? "Liked" : "Like"} · {count}
    </button>
  );
}
