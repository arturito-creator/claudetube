"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Stage = "idle" | "initializing" | "uploading" | "finalizing";

export function UploadForm() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const title = String(form.get("title") ?? "").trim();
    const description = String(form.get("description") ?? "");
    const file = form.get("bundle");
    if (!(file instanceof File) || file.size === 0) {
      setError("Pick a .zip bundle.");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setError("Bundle must be a .zip.");
      return;
    }

    try {
      setStage("initializing");
      const initRes = await fetch("/api/upload/init", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, description, size: file.size }),
      });
      const init = await readJson(initRes);
      if (!initRes.ok) throw new Error(formatError(init, "init failed"));
      const { videoId, uploadUrl } = init as { videoId: string; uploadUrl: string };

      setStage("uploading");
      await putWithProgress(uploadUrl, file, (p) => setProgress(p));

      setStage("finalizing");
      const finRes = await fetch("/api/upload/finalize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ videoId, title, description }),
      });
      const fin = await readJson(finRes);
      if (!finRes.ok) throw new Error(formatError(fin, "finalize failed"));
      router.push((fin as { watchUrl: string }).watchUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStage("idle");
    }
  }

  const busy = stage !== "idle";
  const label =
    stage === "initializing"
      ? "Preparing…"
      : stage === "uploading"
        ? `Uploading… ${progress}%`
        : stage === "finalizing"
          ? "Processing bundle…"
          : "Publish";

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block">
        <span className="text-sm font-medium">Title</span>
        <input
          name="title"
          required
          maxLength={160}
          className="mt-1 w-full h-10 rounded-md border border-black/15 px-3"
          placeholder="e.g. Neon synthwave intro"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium">Description</span>
        <textarea
          name="description"
          maxLength={4000}
          rows={4}
          className="mt-1 w-full rounded-md border border-black/15 px-3 py-2"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium">Bundle (.zip)</span>
        <input
          type="file"
          name="bundle"
          accept=".zip,application/zip"
          required
          className="mt-1 block w-full text-sm"
        />
        <span className="block text-xs text-ink/60 mt-1">
          Max 200 MB compressed, 500 MB extracted. Must contain an index.html.
        </span>
      </label>

      {error && <p className="text-sm text-red-600 whitespace-pre-wrap">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="rounded-full bg-ink text-white px-5 py-2 disabled:opacity-50"
      >
        {label}
      </button>
    </form>
  );
}

async function readJson(res: Response): Promise<unknown> {
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    return res.json().catch(() => ({}));
  }
  // Vercel edge / R2 often returns plain text on errors.
  const text = await res.text().catch(() => "");
  return { error: text || `HTTP ${res.status}` };
}

function formatError(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const b = body as { error?: string; message?: string; code?: string };
    const parts = [b.error, b.code ? `(${b.code})` : "", b.message].filter(Boolean);
    if (parts.length) return parts.join(" ");
  }
  return fallback;
}

function putWithProgress(
  url: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.setRequestHeader("Content-Type", "application/zip");
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) {
        onProgress(Math.round((ev.loaded / ev.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      reject(
        new Error(
          `Upload to storage failed (${xhr.status}). ${xhr.responseText || ""}`.trim(),
        ),
      );
    };
    xhr.onerror = () =>
      reject(
        new Error(
          "Upload to storage failed — if this persists, check R2 bucket CORS (PUT from your app origin must be allowed).",
        ),
      );
    xhr.send(file);
  });
}
