"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function UploadForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const json = (await res.json()) as
        | { watchUrl: string }
        | { error: string; code?: string; message?: string };
      if (!res.ok) {
        const msg =
          "message" in json && json.message
            ? `${json.error}: ${json.message}`
            : "error" in json
              ? json.error
              : "upload failed";
        setError(msg);
        return;
      }
      if ("watchUrl" in json) router.push(json.watchUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "upload failed");
    } finally {
      setBusy(false);
    }
  }

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

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="rounded-full bg-ink text-white px-5 py-2 disabled:opacity-50"
      >
        {busy ? "Uploading…" : "Publish"}
      </button>
    </form>
  );
}
