import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { deflateRawSync, crc32 } from "node:zlib";
import { sanitizeEntryPath, safeExtractZip, ZipError } from "@/lib/zip";

describe("sanitizeEntryPath", () => {
  it("keeps clean relative paths", () => {
    expect(sanitizeEntryPath("index.html")).toBe("index.html");
    expect(sanitizeEntryPath("assets/img.png")).toBe("assets/img.png");
    expect(sanitizeEntryPath("a\\b\\c.js")).toBe("a/b/c.js");
  });
  it("rejects absolute paths", () => {
    expect(() => sanitizeEntryPath("/etc/passwd")).toThrow(ZipError);
    expect(() => sanitizeEntryPath("C:/Windows/System32/cmd.exe")).toThrow(ZipError);
  });
  it("rejects parent traversal", () => {
    expect(() => sanitizeEntryPath("../evil")).toThrow(ZipError);
    expect(() => sanitizeEntryPath("ok/../../evil")).toThrow(ZipError);
  });
  it("rejects NUL bytes", () => {
    expect(() => sanitizeEntryPath("a\0b")).toThrow(ZipError);
  });
});

// Minimal ZIP-writer for tests so we don't need a fixture binary in the repo.
function buildZip(entries: Array<{ name: string; data: Buffer; mode?: number }>): Buffer {
  const localChunks: Buffer[] = [];
  const centralChunks: Buffer[] = [];
  let offset = 0;

  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, "utf8");
    const compressed = deflateRawSync(e.data);
    const crc = crc32(e.data);

    // Local file header.
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    localChunks.push(local, nameBuf, compressed);

    // Central directory record.
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x031e, 4); // version made by (Unix)
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(e.data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    // external file attributes: Unix mode in high 16 bits.
    const mode = e.mode ?? 0o100644;
    central.writeUInt32LE((mode << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centralChunks.push(central, nameBuf);

    offset += local.length + nameBuf.length + compressed.length;
  }

  const centralOffset = offset;
  const centralSize = centralChunks.reduce((n, c) => n + c.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localChunks, ...centralChunks, end]);
}

describe("safeExtractZip", () => {
  let tmp: string;
  beforeAll(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ct-test-"));
  });
  afterAll(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  async function writeZip(name: string, buf: Buffer): Promise<string> {
    const p = path.join(tmp, name);
    await fs.writeFile(p, buf);
    return p;
  }

  it("extracts a normal bundle", async () => {
    const zip = await writeZip(
      "ok.zip",
      buildZip([
        { name: "index.html", data: Buffer.from("<html>hi</html>") },
        { name: "assets/a.png", data: Buffer.from("pngdata") },
      ]),
    );
    const dest = path.join(tmp, "out-ok");
    const result = await safeExtractZip(zip, dest);
    expect(result.entryHtml).toBe("index.html");
    expect(result.files).toHaveLength(2);
    expect(result.companionVideoPath).toBeNull();
  });

  it("picks the largest root-level video as the companion", async () => {
    const big = Buffer.alloc(1000, 0xaa);
    const small = Buffer.alloc(200, 0xbb);
    const zip = await writeZip(
      "video.zip",
      buildZip([
        { name: "index.html", data: Buffer.from("<html>x</html>") },
        { name: "clip.mp4", data: big },
        { name: "short.mp4", data: small },
      ]),
    );
    const dest = path.join(tmp, "out-video");
    const result = await safeExtractZip(zip, dest);
    expect(result.companionVideoPath).toBe("clip.mp4");
  });

  it("rejects path traversal entries", async () => {
    const zip = await writeZip(
      "evil.zip",
      buildZip([
        { name: "index.html", data: Buffer.from("<html></html>") },
        { name: "../../etc/passwd", data: Buffer.from("root:x:0:0::") },
      ]),
    );
    const dest = path.join(tmp, "out-evil");
    await expect(safeExtractZip(zip, dest)).rejects.toBeInstanceOf(ZipError);
  });

  it("rejects symlinks", async () => {
    const zip = await writeZip(
      "link.zip",
      buildZip([
        { name: "index.html", data: Buffer.from("<html></html>") },
        { name: "link", data: Buffer.from("/etc/passwd"), mode: 0o120777 },
      ]),
    );
    const dest = path.join(tmp, "out-link");
    await expect(safeExtractZip(zip, dest)).rejects.toBeInstanceOf(ZipError);
  });

  it("accepts .jsx and .tsx bundle sources", async () => {
    const zip = await writeZip(
      "jsx.zip",
      buildZip([
        { name: "index.html", data: Buffer.from("<html></html>") },
        { name: "animations.jsx", data: Buffer.from("export const A = () => <div/>") },
        { name: "types.tsx", data: Buffer.from("export const T: any = () => <div/>") },
      ]),
    );
    const dest = path.join(tmp, "out-jsx");
    const result = await safeExtractZip(zip, dest);
    const names = result.files.map((f) => f.relPath).sort();
    expect(names).toContain("animations.jsx");
    expect(names).toContain("types.tsx");
    const jsx = result.files.find((f) => f.relPath === "animations.jsx");
    expect(jsx?.contentType).toBe("text/javascript; charset=utf-8");
  });

  it("rejects disallowed file extensions", async () => {
    const zip = await writeZip(
      "sh.zip",
      buildZip([
        { name: "index.html", data: Buffer.from("<html></html>") },
        { name: "pwn.sh", data: Buffer.from("#!/bin/sh\nid\n") },
      ]),
    );
    const dest = path.join(tmp, "out-sh");
    await expect(safeExtractZip(zip, dest)).rejects.toBeInstanceOf(ZipError);
  });

  it("rejects archives without any HTML entry", async () => {
    const zip = await writeZip(
      "nohtml.zip",
      buildZip([{ name: "image.png", data: Buffer.from("x") }]),
    );
    const dest = path.join(tmp, "out-nohtml");
    await expect(safeExtractZip(zip, dest)).rejects.toBeInstanceOf(ZipError);
  });

  it("enforces uncompressed-size cap", async () => {
    const big = Buffer.alloc(1024 * 1024, 0x41); // 1 MB, highly compressible
    const zip = await writeZip(
      "big.zip",
      buildZip([
        { name: "index.html", data: Buffer.from("<html></html>") },
        { name: "big.json", data: big },
      ]),
    );
    const dest = path.join(tmp, "out-big");
    await expect(
      safeExtractZip(zip, dest, {
        maxEntries: 10,
        maxUncompressedBytes: 512 * 1024, // < size of big.json
        perFileMaxBytes: 2 * 1024 * 1024,
      }),
    ).rejects.toBeInstanceOf(ZipError);
  });
});
