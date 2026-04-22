/**
 * postMessage contract between the parent ClaudeTube page and a sandboxed
 * Claude Design bundle iframe.
 *
 * Bundles opt in by emitting `cd:ready` once their scene is loaded. After
 * that, the parent forwards companion-video clock ticks and play/pause state
 * so animations can chase the video timeline. Bundles that never emit
 * `cd:ready` just play standalone — the parent still shows the companion
 * video (if any) uncoupled.
 */

export type FromBundle =
  | { type: "cd:ready"; duration?: number }
  | { type: "cd:play" }
  | { type: "cd:pause" }
  | { type: "cd:seek"; t: number }
  | { type: "cd:ended" };

export type ToBundle =
  | { type: "cd:video:play" }
  | { type: "cd:video:pause" }
  | { type: "cd:video:timeupdate"; t: number }
  | { type: "cd:video:seek"; t: number };

export const BRIDGE_VERSION = 1;

export function isFromBundle(msg: unknown): msg is FromBundle {
  if (!msg || typeof msg !== "object") return false;
  const t = (msg as { type?: unknown }).type;
  return (
    t === "cd:ready" ||
    t === "cd:play" ||
    t === "cd:pause" ||
    t === "cd:seek" ||
    t === "cd:ended"
  );
}

export function isToBundle(msg: unknown): msg is ToBundle {
  if (!msg || typeof msg !== "object") return false;
  const t = (msg as { type?: unknown }).type;
  return (
    t === "cd:video:play" ||
    t === "cd:video:pause" ||
    t === "cd:video:timeupdate" ||
    t === "cd:video:seek"
  );
}
