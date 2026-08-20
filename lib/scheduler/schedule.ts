import {
  deriveCompleteness,
  type Budget,
  type CapabilitySummary,
} from "@/lib/envelope";
import {
  CAPABILITIES,
  CAPABILITY_IDS,
  TIER_1,
  emptyFields,
  resolvedDomain,
  type AnyCapability,
  type CapabilityContext,
  type CapabilityId,
  type FieldMap,
} from "@/lib/capabilities";
import type { Clock, Transport } from "@/lib/transport";

/**
 * The scheduler. One budget, one tier boundary, one dependency edge.
 *
 * The budget arithmetic is deliberately simple, and simple here is load-bearing
 * rather than lazy: sweep invariant 5 asserts that raising `deadline_ms` never
 * turns a resolved field into an unresolved one, and every clever scheduling
 * heuristic I sketched broke it. Weighted slices by historical latency broke it.
 * Reserving budget for the slowest tier-1 capability broke it. A scheduler that
 * is non-monotonic in its budget is broken in a way no single test case catches,
 * so the arithmetic stays boring on purpose.
 *
 *   tier0_slice     = min(0.4 x granted, 4000)
 *   remaining       = granted - (what tier 0 actually spent)
 *   every tier-1 capability is offered `remaining`
 *
 * Monotonicity survives the awkward case, which is a budget increase that flips
 * tier 0 from `timeout` to success: at the smaller budget tier 0 spent its whole
 * slice, leaving 0.6 x granted, and at the larger one it spent no more than that
 * slice, so the remainder can only have grown.
 *
 * `remaining` can go negative, and that is the only way the `deadline` reason is
 * reachable. Abandoning a request costs more than the budget it was abandoned at
 * — teardown is not instant — so a tier 0 that overshoots badly can leave nothing
 * for tier 1, and a tier-1 capability then reports `not_attempted/deadline`
 * rather than being sent a request with a negative budget. Without overshoot
 * there is no such case, and "never started" would be a member of a closed enum
 * that nothing could produce.
 *
 * "Concurrently" for tier 1 means every capability is offered the same remaining
 * budget and the tier costs the slowest of them — which is what real concurrency
 * costs, and which a virtual clock can represent exactly.
 */

export const TIER0_SLICE_FRACTION = 0.4;
export const TIER0_SLICE_CAP_MS = 4000;

export const DEFAULT_DEADLINE_MS = 8000;
export const MIN_DEADLINE_MS = 100;
export const MAX_DEADLINE_MS = 30000;

export type Bindings = Partial<Record<CapabilityId, unknown>>;

export type ScheduleInput = {
  bindings: Bindings;
  /** Capabilities the caller asked for. Anything absent is `excluded_by_caller`. */
  requested: readonly CapabilityId[];
  deadline_ms: number;
  as_of: string;
  transport: Transport;
  clock: Clock;
};

export type ScheduleResult = {
  fields: Record<CapabilityId, FieldMap>;
  capabilities: Record<CapabilityId, CapabilitySummary>;
  budget: Budget;
};

type Attempt = { fields: FieldMap; summary: CapabilitySummary };

export function tier0Slice(grantedMs: number): number {
  return Math.min(Math.floor(grantedMs * TIER0_SLICE_FRACTION), TIER0_SLICE_CAP_MS);
}

export async function schedule(input: ScheduleInput): Promise<ScheduleResult> {
  const granted = input.deadline_ms;
  const slice = tier0Slice(granted);
  const requested = new Set(input.requested);

  const fields = {} as Record<CapabilityId, FieldMap>;
  const capabilities = {} as Record<CapabilityId, CapabilitySummary>;

  // ── Tier 0 ───────────────────────────────────────────────────────────────
  const identityCapability = CAPABILITIES.identity;
  const identityAttempt = await attempt({
    capability: identityCapability,
    binding: input.bindings.identity,
    requested: requested.has("identity"),
    context: { as_of: input.as_of },
    budgetMs: slice,
    transport: input.transport,
  });

  fields.identity = identityAttempt.fields;
  capabilities.identity = identityAttempt.summary;

  const tier0Spent = identityAttempt.summary.elapsed_ms ?? 0;
  input.clock.advance(tier0Spent);
  const remaining = granted - tier0Spent;

  // The one edge. `resolvedDomain` returns undefined for every non-resolved
  // state, so an ambiguous verdict cascades exactly like an outage does — which
  // is correct: three candidate domains is not a URL to fetch.
  const context: CapabilityContext = {
    as_of: input.as_of,
    domain: resolvedDomain(identityAttempt.fields),
  };

  // ── Tier 1 ───────────────────────────────────────────────────────────────
  const attempts = await Promise.all(
    TIER_1.map((capability) =>
      attempt({
        capability,
        binding: input.bindings[capability.id],
        requested: requested.has(capability.id),
        context,
        budgetMs: remaining,
        transport: input.transport,
      }).then((result) => [capability.id, result] as const),
    ),
  );

  for (const [id, result] of attempts) {
    fields[id] = result.fields;
    capabilities[id] = result.summary;
  }

  const tier1Spent = attempts.reduce(
    (slowest, [, result]) => Math.max(slowest, result.summary.elapsed_ms ?? 0),
    0,
  );
  input.clock.advance(tier1Spent);

  return {
    fields: orderByDeclaration(fields),
    capabilities: orderByDeclaration(capabilities),
    budget: {
      granted_ms: granted,
      tier0_slice_ms: slice,
      remaining_after_tier0_ms: remaining,
      elapsed_ms: tier0Spent + tier1Spent,
    },
  };
}

type AttemptInput = {
  capability: AnyCapability;
  binding: unknown;
  requested: boolean;
  context: CapabilityContext;
  budgetMs: number;
  transport: Transport;
};

/**
 * One capability, from "should this run at all" to a field map. The order of the
 * guards is the order the reasons are ranked in, and it is deliberate: a
 * capability the caller excluded is not also unmapped, and a capability with no
 * binding is not also out of budget. The first true thing is the reported thing.
 */
async function attempt(input: AttemptInput): Promise<Attempt> {
  const { capability } = input;

  if (!input.requested) {
    return unhappy(capability, "excluded_by_caller");
  }

  if (input.binding === undefined) {
    // No authored binding. Not an outage, not a timeout — this service has never
    // been told how to ask this upstream about this company.
    return unhappy(capability, "unmapped");
  }

  const binding = capability.parseBinding(input.binding);
  const request = capability.buildRequest(binding, input.context);

  if (request === null) {
    // The only capability that can land here is `technographics` without a
    // resolved domain.
    return unhappy(capability, "dependency_failed");
  }

  if (input.budgetMs <= 0) {
    // Never started. No key, because nothing was sent.
    return unhappy(capability, "deadline");
  }

  const upstreamKey = capability.keyFor(binding, input.context);
  const outcome = await input.transport.send({
    upstream: capability.upstream,
    path: request.path,
    body: request.body,
    upstreamKey,
    budget_ms: input.budgetMs,
  });

  if (!outcome.ok) {
    return {
      fields: emptyFields(capability, outcome.reason, {
        upstreamKey,
        retryAfterS: outcome.retry_after_s,
      }),
      summary: {
        state: "unavailable",
        reason: outcome.reason,
        elapsed_ms: outcome.elapsed_ms,
        upstream_key: upstreamKey,
      },
    };
  }

  const parsed = capability.parseBoundary(outcome.body);
  if (!parsed.ok) {
    // A 2xx we could not read. The upstream answered; it answered something else.
    return {
      fields: emptyFields(capability, "boundary_violation", { upstreamKey }),
      summary: {
        state: "unavailable",
        reason: "boundary_violation",
        elapsed_ms: outcome.elapsed_ms,
        upstream_key: upstreamKey,
      },
    };
  }

  return {
    fields: capability.toFields(parsed.value, upstreamKey),
    summary: {
      // The *capability* resolved. Whether its individual fields did is a
      // separate question the boxes answer for themselves — a capability that ran
      // and reported six `unknown`s did its job.
      state: "resolved",
      reason: "ok",
      elapsed_ms: outcome.elapsed_ms,
      upstream_key: upstreamKey,
    },
  };
}

function unhappy(
  capability: AnyCapability,
  reason: "excluded_by_caller" | "unmapped" | "dependency_failed" | "deadline",
): Attempt {
  return {
    fields: emptyFields(capability, reason),
    // No `elapsed_ms`: nothing was spent, and reporting a zero would put this
    // capability in the ledger as though it had been timed.
    summary: { state: "not_attempted", reason },
  };
}

/**
 * Key order is the declaration order in `CAPABILITY_IDS`, not insertion order.
 * `Promise.all` settles in argument order, but relying on that for the shape of a
 * serialised document is the kind of coupling that survives every test and then
 * changes when someone reorders a `.map`.
 */
function orderByDeclaration<T>(record: Record<CapabilityId, T>): Record<CapabilityId, T> {
  return Object.fromEntries(CAPABILITY_IDS.map((id) => [id, record[id]])) as Record<CapabilityId, T>;
}

/** Re-exported so callers do not have to reach into `lib/envelope` for it. */
export { deriveCompleteness };
