import type { FieldReason } from "@/lib/envelope";
import type { UpstreamId } from "@/data/upstreams";

/**
 * The seam. Everything above this line is pure; everything below it either
 * touches the network or reads a committed file, and nothing above needs to know
 * which.
 */

export const TRANSPORT_IDS = ["fixture", "live"] as const;
export type TransportId = (typeof TRANSPORT_IDS)[number];

/**
 * Reasons a transport can produce on its own. Note what is *not* here:
 * `boundary_violation` is not a transport verdict, because deciding whether a
 * body is well-formed requires the capability's schema, and `unmapped`,
 * `deadline`, `dependency_failed` and `excluded_by_caller` are all scheduler
 * decisions made before a transport is ever called.
 */
export type TransportFailure = Extract<
  FieldReason,
  "upstream_error" | "upstream_unconfigured" | "upstream_rate_limited" | "timeout"
>;

export type TransportOutcome =
  | { ok: true; body: unknown; elapsed_ms: number }
  | { ok: false; reason: TransportFailure; retry_after_s?: number; elapsed_ms: number; detail: string };

export type TransportRequest = {
  upstream: UpstreamId;
  path: string;
  body: unknown;
  /** The binding key, for fixture lookup and for the box's `upstream_key`. */
  upstreamKey: string;
  /** How long the scheduler is willing to wait. Enforced by the transport. */
  budget_ms: number;
};

export type Transport = {
  id: TransportId;
  send: (request: TransportRequest) => Promise<TransportOutcome>;
};

/**
 * Time, injected.
 *
 * The fixture transport reports the latency a response *was recorded with* rather
 * than actually sleeping for it, so the sweep can run tens of thousands of
 * scheduler decisions instantly and get byte-identical documents every time. That
 * only works if the scheduler asks a clock rather than calling `Date.now()`, so
 * it does. `Date.now()` appears nowhere in `lib/`.
 */
export type Clock = {
  now: () => number;
  /** Advances a virtual clock; a no-op on the real one. */
  advance: (ms: number) => void;
};

export function virtualClock(start = 0): Clock {
  let current = start;
  return {
    now: () => current,
    advance: (ms) => {
      current += ms;
    },
  };
}

export function realClock(): Clock {
  const start = Date.now();
  return {
    now: () => Date.now() - start,
    advance: () => {},
  };
}
