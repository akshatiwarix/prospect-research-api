"use client";

import { REASON_ADVICE, Mono, StateChip } from "./ui";
import type { Box, ResearchDocument } from "./types";

/**
 * One document, every field boxed, with the counterpart's state shown beside it
 * where the two transports disagree.
 *
 * The diff is the point of the side-by-side view. Fixtures are recordings, so
 * for most companies the two columns agree exactly — and the places they *do*
 * differ are precisely the two upstreams the network cannot currently serve:
 * Day 006, whose brief route 404s, and Day 013's `.example` domains, which RFC
 * 2606 reserved so that nothing could fetch them. So the diff is not decoration;
 * it is a list of what is broken today.
 */
export function DocumentView({
  document,
  counterpart,
  label,
}: {
  document: ResearchDocument;
  counterpart?: ResearchDocument;
  label: string;
}) {
  return (
    <div className="divide-y divide-neutral-100 dark:divide-neutral-900">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold">{label}</span>
          <span
            className={`rounded px-1.5 py-0.5 font-mono text-[10px] ring-1 ring-inset ${
              document.completeness === "complete"
                ? "bg-emerald-500/10 text-emerald-700 ring-emerald-600/25 dark:text-emerald-300"
                : document.completeness === "partial"
                  ? "bg-amber-500/10 text-amber-800 ring-amber-600/25 dark:text-amber-300"
                  : "bg-neutral-500/10 text-neutral-600 ring-neutral-500/25 dark:text-neutral-400"
            }`}
          >
            {document.completeness}
          </span>
        </div>
        <Mono className="text-neutral-400">{document.request_digest.slice(0, 12)}</Mono>
      </div>

      {Object.entries(document.fields).map(([capability, fields]) => {
        const summary = document.capabilities[capability];
        const other = counterpart?.capabilities[capability];
        const differs = other !== undefined && other.reason !== summary?.reason;

        return (
          <section key={capability}>
            <header className="flex items-center justify-between gap-2 bg-neutral-500/5 px-3 py-1.5">
              <Mono className="font-semibold">{capability}</Mono>
              <span className="flex items-center gap-1.5">
                {differs && (
                  <Mono
                    className="rounded bg-sky-500/10 px-1 text-sky-700 dark:text-sky-300"
                    // The whole reason for two columns.
                  >
                    differs: {other?.reason}
                  </Mono>
                )}
                {summary?.elapsed_ms !== undefined && (
                  <Mono className="text-neutral-400">{summary.elapsed_ms}ms</Mono>
                )}
                {summary && <StateChip state={summary.state} title={REASON_ADVICE[summary.reason]} />}
              </span>
            </header>

            {summary?.reason !== "ok" ? (
              <p className="px-3 py-2 text-[11px] leading-snug text-neutral-500">
                <Mono className="text-neutral-600 dark:text-neutral-300">{summary?.reason}</Mono>{" "}
                — {summary ? REASON_ADVICE[summary.reason] : ""}
                {summary?.upstream_key !== undefined && (
                  <>
                    {" "}
                    Asked about <Mono>{summary.upstream_key}</Mono>.
                  </>
                )}
              </p>
            ) : (
              <dl className="divide-y divide-neutral-100 dark:divide-neutral-900">
                {Object.entries(fields).map(([key, box]) => (
                  <FieldRow key={key} name={key} box={box} deprecated={isDeprecated(document, capability, key)} />
                ))}
              </dl>
            )}
          </section>
        );
      })}
    </div>
  );
}

function isDeprecated(document: ResearchDocument, capability: string, key: string): boolean {
  return document.deprecations.some((entry) => entry.path === `fields.${capability}.${key}`);
}

function FieldRow({ name, box, deprecated }: { name: string; box: Box; deprecated: boolean }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] items-start gap-2 px-3 py-1.5">
      <dt className="flex items-center gap-1">
        <Mono className={deprecated ? "text-neutral-400 line-through" : "text-neutral-500"}>{name}</Mono>
        {deprecated && (
          <span
            title="Deprecated. Aliases its replacement by reference, so the two cannot disagree."
            className="rounded bg-neutral-500/10 px-1 font-mono text-[9px] text-neutral-500"
          >
            deprecated
          </span>
        )}
      </dt>
      <dd className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <StateChip state={box.state} title={REASON_ADVICE[box.reason]} />
          {box.observed_at !== undefined && <Mono className="text-neutral-400">{box.observed_at}</Mono>}
          {box.retry_after_s !== undefined && (
            <Mono className="text-rose-600 dark:text-rose-400">retry after {box.retry_after_s}s</Mono>
          )}
        </div>
        {box.state === "resolved" && (
          <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded bg-neutral-500/5 p-1.5 font-mono text-[10px] leading-snug">
            {render(box.value)}
          </pre>
        )}
      </dd>
    </div>
  );
}

function render(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 1);
}
