"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { isFromBundle, type ToBundle } from "@/lib/player-bridge";

export function Player({
  videoId,
  entryUrl,
  bundleOrigin,
  companionVideoUrl,
}: {
  videoId: string;
  entryUrl: string;
  bundleOrigin: string;
  companionVideoUrl: string | null;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [bundleReady, setBundleReady] = useState(false);
  const [playing, setPlaying] = useState(false);

  // `crossOriginBundle` means the bundle is hosted on a distinct origin and
  // the iframe uses `allow-same-origin` so postMessage carries a real origin.
  // Otherwise the iframe is an opaque origin and ev.origin === "null".
  const crossOriginBundle = Boolean(
    bundleOrigin && !bundleOrigin.startsWith("/") && safeOrigin(bundleOrigin) !== null,
  );

  const targetOrigin = useMemo(() => {
    if (!crossOriginBundle) return "*";
    const o = safeOrigin(bundleOrigin);
    return o ?? "*";
  }, [bundleOrigin, crossOriginBundle]);

  function postToBundle(msg: ToBundle) {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage(msg, targetOrigin);
  }

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      // Only trust the expected origin. Opaque-sandboxed iframes report "null".
      const expected = crossOriginBundle ? targetOrigin : "null";
      if (ev.origin !== expected) return;
      if (ev.source !== iframeRef.current?.contentWindow) return;
      if (!isFromBundle(ev.data)) return;
      switch (ev.data.type) {
        case "cd:ready":
          setBundleReady(true);
          break;
        case "cd:play":
          videoRef.current?.play().catch(() => {});
          setPlaying(true);
          break;
        case "cd:pause":
          videoRef.current?.pause();
          setPlaying(false);
          break;
        case "cd:seek":
          if (videoRef.current && Number.isFinite(ev.data.t)) {
            videoRef.current.currentTime = ev.data.t;
          }
          break;
        case "cd:ended":
          setPlaying(false);
          break;
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [targetOrigin, crossOriginBundle]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => postToBundle({ type: "cd:video:timeupdate", t: v.currentTime });
    const onPlay = () => postToBundle({ type: "cd:video:play" });
    const onPause = () => postToBundle({ type: "cd:video:pause" });
    const onSeek = () => postToBundle({ type: "cd:video:seek", t: v.currentTime });
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("seeked", onSeek);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("seeked", onSeek);
    };
    // bundleReady dep so the listeners re-bind if the iframe reloads
  }, [bundleReady, targetOrigin]);

  function togglePlay() {
    if (companionVideoUrl && videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.pause();
      }
      return;
    }
    // No companion video: just nudge the bundle.
    postToBundle(playing ? { type: "cd:video:pause" } : { type: "cd:video:play" });
    setPlaying((p) => !p);
  }

  function reload() {
    const f = iframeRef.current;
    if (!f) return;
    setBundleReady(false);
    setPlaying(false);
    f.src = f.src; // reload trick
  }

  return (
    <div className="w-full">
      <div className="relative aspect-video rounded-lg overflow-hidden bg-black shadow">
        <iframe
          ref={iframeRef}
          src={entryUrl}
          title={`bundle-${videoId}`}
          className="absolute inset-0 w-full h-full"
          sandbox={
            crossOriginBundle
              ? "allow-scripts allow-pointer-lock allow-same-origin"
              : "allow-scripts allow-pointer-lock"
          }
          allow="autoplay; fullscreen; microphone; xr-spatial-tracking"
        />
        {companionVideoUrl && (
          <video
            ref={videoRef}
            src={companionVideoUrl}
            playsInline
            preload="auto"
            className="hidden"
          />
        )}
      </div>
      <div className="mt-3 flex items-center gap-3 text-sm">
        <button
          onClick={togglePlay}
          className="rounded-full bg-ink text-white px-4 py-1.5"
        >
          {playing ? "Pause" : "Play"}
        </button>
        <button
          onClick={reload}
          className="rounded-full border border-black/15 px-4 py-1.5"
        >
          Restart
        </button>
        <span className="text-ink/60">
          {bundleReady ? "synced" : "standalone"}
          {companionVideoUrl ? " · companion video attached" : ""}
        </span>
      </div>
    </div>
  );
}

function safeOrigin(raw: string): string | null {
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}
