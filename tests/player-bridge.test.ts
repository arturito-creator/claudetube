import { describe, it, expect } from "vitest";
import { isFromBundle, isToBundle } from "@/lib/player-bridge";

describe("player-bridge", () => {
  it("recognizes bundle→parent messages", () => {
    expect(isFromBundle({ type: "cd:ready" })).toBe(true);
    expect(isFromBundle({ type: "cd:play" })).toBe(true);
    expect(isFromBundle({ type: "cd:pause" })).toBe(true);
    expect(isFromBundle({ type: "cd:seek", t: 1.5 })).toBe(true);
    expect(isFromBundle({ type: "cd:ended" })).toBe(true);
  });
  it("recognizes parent→bundle messages", () => {
    expect(isToBundle({ type: "cd:video:play" })).toBe(true);
    expect(isToBundle({ type: "cd:video:pause" })).toBe(true);
    expect(isToBundle({ type: "cd:video:timeupdate", t: 3 })).toBe(true);
    expect(isToBundle({ type: "cd:video:seek", t: 0 })).toBe(true);
  });
  it("rejects non-contract messages", () => {
    expect(isFromBundle(null)).toBe(false);
    expect(isFromBundle(undefined)).toBe(false);
    expect(isFromBundle("cd:ready")).toBe(false);
    expect(isFromBundle({ type: "random" })).toBe(false);
    expect(isToBundle({ type: "cd:ready" })).toBe(false);
  });
});
