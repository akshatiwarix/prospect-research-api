import type { ReactNode } from "react";

import type { FieldReason, FieldState } from "@/lib/envelope";

/**
 * The five states carry the whole product, so they get the whole colour budget.
 * Everything else on screen is neutral — a console with nine colours and one
 * meaning has stopped being readable.
 *
 * The palette is chosen so the two kinds of nothing do not look alike. `unknown`
 * and `absent` are both empty and mean opposite things, so amber (we looked,
 * inconclusive) sits well away from slate (we looked, there is nothing). And
 * neither reads as red: an absence is not an error, and colouring it like one
 * would undo the argument the states exist to make.
 */
export const STATE_STYLE: Record<FieldState, { label: string; glyph: string; className: string }> = {
  resolved: {
    label: "resolved",
    glyph: "●",
    className: "bg-emerald-500/10 text-emerald-700 ring-emerald-600/25 dark:text-emerald-300 dark:ring-emerald-400/25",
  },
  unknown: {
    label: "unknown",
    glyph: "◐",
    className: "bg-amber-500/10 text-amber-800 ring-amber-600/30 dark:text-amber-300 dark:ring-amber-400/25",
  },
  absent: {
    label: "absent",
    glyph: "○",
    className: "bg-slate-500/10 text-slate-700 ring-slate-500/30 dark:text-slate-300 dark:ring-slate-400/25",
  },
  not_attempted: {
    label: "not attempted",
    glyph: "·",
    className: "bg-neutral-500/10 text-neutral-600 ring-neutral-500/25 dark:text-neutral-400 dark:ring-neutral-500/30",
  },
  unavailable: {
    label: "unavailable",
    glyph: "✕",
    className: "bg-rose-500/10 text-rose-700 ring-rose-600/25 dark:text-rose-300 dark:ring-rose-400/25",
  },
};

/**
 * What a caller should *do*. The reason is the actionable half of the pair and
 * the state is the summary half, so the reason gets a sentence rather than a
 * colour.
 */
export const REASON_ADVICE: Record<FieldReason, string> = {
  ok: "The capability ran and reported.",
  deadline: "Never started — the budget was gone. Raise deadline_ms.",
  dependency_failed: "A prerequisite did not resolve. Nothing was sent.",
  unmapped: "No authored binding for this company on this upstream. Retrying will not help.",
  upstream_error: "The upstream returned a non-2xx. It is broken or it moved.",
  upstream_unconfigured: "The upstream is reachable but not provisioned. Retrying will not help.",
  upstream_rate_limited: "Back off. Retry-After carries the upstream's own advice.",
  timeout: "Sent, then abandoned. This upstream is eating your budget.",
  boundary_violation: "A 2xx whose body failed the boundary schema. The upstream answered something else.",
  excluded_by_caller: "You did not ask for this capability.",
};

export function StateChip({ state, title }: { state: FieldState; title?: string }) {
  const style = STATE_STYLE[state];
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] tracking-tight ring-1 ring-inset ${style.className}`}
    >
      <span aria-hidden>{style.glyph}</span>
      {style.label}
    </span>
  );
}

export function Panel({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`flex min-w-0 flex-col rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950 ${className}`}
    >
      <header className="border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500 dark:text-neutral-400">
          {title}
        </h2>
        {subtitle !== undefined && (
          <p className="mt-0.5 text-[11px] leading-snug text-neutral-500 dark:text-neutral-500">{subtitle}</p>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </section>
  );
}

export function Mono({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`font-mono text-[11px] ${className}`}>{children}</span>;
}
