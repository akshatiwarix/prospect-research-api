"use client";

import { Mono } from "./ui";
import type { ResearchDocument } from "./types";

/**
 * Where the deadline went.
 *
 * Returning the accounting is what makes the deadline a contract rather than a
 * suggestion, and showing it is what makes the tier boundary legible: the bar
 * for tier 0 is capped at 40% of the budget, and everything after it is
 * competing for one shared remainder. A caller who sees `timeout` on one
 * capability and 4,000ms of tier-0 spend above it does not need the
 * documentation.
 */
export function BudgetLedger({ document }: { document: ResearchDocument }) {
  const { granted_ms, tier0_slice_ms, remaining_after_tier0_ms, elapsed_ms } = document.budget;
  const scale = Math.max(granted_ms, elapsed_ms, 1);

  const rows = Object.entries(document.capabilities)
    .filter(([, summary]) => summary.elapsed_ms !== undefined)
    .sort(([, left], [, right]) => (right.elapsed_ms ?? 0) - (left.elapsed_ms ?? 0));

  return (
    <div className="space-y-2 px-3 py-2">
      <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-[11px]">
        <dt className="text-neutral-500">granted</dt>
        <dd className="text-right">{granted_ms}ms</dd>
        <dt className="text-neutral-500">tier-0 slice</dt>
        <dd className="text-right">{tier0_slice_ms}ms</dd>
        <dt className="text-neutral-500">left after tier 0</dt>
        <dd className={`text-right ${remaining_after_tier0_ms < 0 ? "text-rose-600 dark:text-rose-400" : ""}`}>
          {remaining_after_tier0_ms}ms
        </dd>
        <dt className="text-neutral-500">spent</dt>
        <dd className="text-right">{elapsed_ms}ms</dd>
      </dl>

      {rows.length === 0 ? (
        <p className="text-[11px] text-neutral-500">Nothing was sent, so nothing was spent.</p>
      ) : (
        <ul className="space-y-1">
          {rows.map(([capability, summary]) => (
            <li key={capability}>
              <div className="flex items-baseline justify-between gap-2">
                <Mono className="text-neutral-500">{capability}</Mono>
                <Mono className="text-neutral-400">{summary.elapsed_ms}ms</Mono>
              </div>
              <div className="mt-0.5 h-1 rounded bg-neutral-500/10">
                <div
                  className={`h-1 rounded ${summary.reason === "ok" ? "bg-emerald-500/60" : "bg-rose-500/60"}`}
                  style={{ width: `${Math.min(100, ((summary.elapsed_ms ?? 0) / scale) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[11px] leading-snug text-neutral-500">
        Tier 0 is capped at 40% of the budget. Everything after it competes for one shared remainder, so the tier
        costs its slowest member.
      </p>
    </div>
  );
}
