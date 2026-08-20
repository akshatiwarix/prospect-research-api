"use client";

import { useState } from "react";

import type { ResearchDocument } from "./types";

/**
 * Two exports, and the CSV goes back through the API rather than being built
 * here.
 *
 * The JSON is the document already in hand, so serialising it client-side is
 * honest. The CSV is not: building it in the browser would mean a second
 * implementation of the row shape, and two implementations of a format is how
 * the file a user downloads stops matching the file an integration receives. So
 * the button posts the same request body to `/api/v1/research/csv` and saves
 * what comes back.
 */
export function Exports({ document, request }: { document: ResearchDocument; request: object }) {
  const [busy, setBusy] = useState(false);

  const save = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-wrap gap-2 px-3 py-2">
      <button
        onClick={() =>
          save(
            new Blob([JSON.stringify(document, null, 2)], { type: "application/json" }),
            `${document.company.canonical_id}-research.json`,
          )
        }
        className="rounded border border-neutral-300 px-2 py-1 font-mono text-[10px] dark:border-neutral-700"
      >
        JSON audit
      </button>

      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const response = await fetch("/api/v1/research/csv", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(request),
            });
            if (response.ok) {
              save(new Blob([await response.text()], { type: "text/csv" }), `${document.company.canonical_id}-research.csv`);
            }
          } finally {
            setBusy(false);
          }
        }}
        className="rounded border border-neutral-300 px-2 py-1 font-mono text-[10px] disabled:opacity-40 dark:border-neutral-700"
      >
        {busy ? "building…" : "CSV — one row per field"}
      </button>

      <p className="w-full text-[11px] leading-snug text-neutral-500">
        The CSV is one row per field, with <code className="font-mono">state</code> and{" "}
        <code className="font-mono">reason</code> as ordinary columns — so filtering to{" "}
        <code className="font-mono">reason = unmapped</code> shows the coverage gap. A row-per-company sheet cannot
        express that at any width.
      </p>
    </div>
  );
}
