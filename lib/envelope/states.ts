/**
 * The two closed vocabularies, and the table that relates them.
 *
 * `PLAN.md` decision 9 fixes five states; decision 10 fixed nine reasons and
 * amendment A4 added a tenth, `timeout`.
 * What the interview did not settle, and what fell out of writing this file, is
 * that the two axes are **almost** one axis: eight of the nine reasons determine
 * the state completely. Only `ok` is ambiguous, and it is ambiguous in exactly
 * the way the repo cares about — a capability that ran to completion may have
 * found a value, found nothing conclusive, or affirmatively determined there is
 * nothing to find.
 *
 * That near-collapse is encoded here as data rather than left as a comment,
 * because it converts three separate review-time rules into one assertion:
 *
 *   - a state/reason pair is legal iff `REASON_STATES[reason]` contains it
 *   - a request was sent to an upstream iff `REASON_SENT.has(reason)`
 *   - a value may exist iff the state is `resolved`
 *
 * `field.ts` refuses to build a box that violates any of the three, so the wire
 * format cannot carry a contradiction even though it redundantly transmits both
 * axes. The redundancy is for the reader; the table is what makes it safe.
 */

export const FIELD_STATES = [
  /** A value, and it means what it says. */
  "resolved",
  /** The capability ran and found nothing conclusive. */
  "unknown",
  /** The capability ran and asserts the property does not exist. */
  "absent",
  /** The capability never ran. */
  "not_attempted",
  /** The capability ran and the upstream failed. */
  "unavailable",
] as const;

export type FieldState = (typeof FIELD_STATES)[number];

export const FIELD_REASONS = [
  /** The capability completed normally. Says nothing about what it found. */
  "ok",
  /** The request budget was exhausted before this capability could run. */
  "deadline",
  /** A prerequisite capability did not resolve. */
  "dependency_failed",
  /** No authored binding exists for this company on this upstream. */
  "unmapped",
  /** Non-2xx from the upstream. */
  "upstream_error",
  /** Upstream reachable but not provisioned — e.g. a 501 for a missing key. */
  "upstream_unconfigured",
  /** 429. `retry_after_s` carries the upstream's own advice. */
  "upstream_rate_limited",
  /**
   * The request was sent and we stopped waiting for it.
   *
   * Added at step 6 (amendment A4) because the transports exposed a hole the
   * interview did not: `deadline` means the scheduler never started a capability,
   * and by the `REASON_SENT` rule it carries no `upstream_key`. A request that
   * *was* sent and then abandoned mid-flight is a different fact, and it needs a
   * key, because knowing *which* upstream is eating the budget is the whole
   * diagnostic value. Same knob to turn, different thing to look at.
   */
  "timeout",
  /** A 2xx whose body failed the boundary schema. */
  "boundary_violation",
  /** The caller asked for this capability to be skipped. */
  "excluded_by_caller",
] as const;

export type FieldReason = (typeof FIELD_REASONS)[number];

/**
 * Which states each reason permits. Note the shape: one reason admits three
 * states, four admit only `not_attempted`, four admit only `unavailable`. The
 * partition is the point — there is no reason that can produce either an
 * absence or a failure depending on circumstance, because "your budget ran out"
 * and "their server broke" must never be expressible as the same fact.
 */
export const REASON_STATES = {
  ok: ["resolved", "unknown", "absent"],
  deadline: ["not_attempted"],
  dependency_failed: ["not_attempted"],
  unmapped: ["not_attempted"],
  excluded_by_caller: ["not_attempted"],
  upstream_error: ["unavailable"],
  upstream_unconfigured: ["unavailable"],
  upstream_rate_limited: ["unavailable"],
  timeout: ["unavailable"],
  boundary_violation: ["unavailable"],
} as const satisfies Record<FieldReason, readonly FieldState[]>;

/**
 * The reason subsets, derived from the table rather than restated beside it.
 *
 * Writing `Extract<FieldReason, "upstream_error" | ...>` by hand at each call
 * site is how the tenth reason came to be missing from four signatures the
 * moment it was added. These are computed, so adding an eleventh updates every
 * signature that uses them.
 */
type ReasonsFor<S extends FieldState> = {
  [R in FieldReason]: S extends (typeof REASON_STATES)[R][number] ? R : never;
}[FieldReason];

export type NotAttemptedReason = ReasonsFor<"not_attempted">;
export type UnavailableReason = ReasonsFor<"unavailable">;

/**
 * Reasons that imply a request actually left this process.
 *
 * This is what makes `upstream_key` checkable rather than decorative: if we
 * spoke to an upstream, we know which key we spoke about, and the box must say
 * so. If we did not speak to it, naming a key would imply an attempt that never
 * happened.
 */
export const REASON_SENT: ReadonlySet<FieldReason> = new Set<FieldReason>([
  "ok",
  "upstream_error",
  "upstream_unconfigured",
  "upstream_rate_limited",
  "timeout",
  "boundary_violation",
]);

/** `retry_after_s` is meaningless anywhere else, so it is legal nowhere else. */
export const REASON_ALLOWS_RETRY_AFTER: ReadonlySet<FieldReason> =
  new Set<FieldReason>(["upstream_rate_limited"]);

/**
 * `as const` above gives the table precise tuple types, which is what makes
 * `NotAttemptedReason` and `UnavailableReason` derivable. The cost is that
 * indexing it yields a union of tuples, so a read has to widen back to the array
 * type before asking a runtime question of it.
 */
function statesFor(reason: FieldReason): readonly FieldState[] {
  return REASON_STATES[reason];
}

export function isLegalPair(state: FieldState, reason: FieldReason): boolean {
  return statesFor(reason).includes(state);
}

/**
 * The state implied by a reason, when the reason implies exactly one. `ok`
 * returns `null` because the caller of this function cannot know what the
 * upstream found — only the capability's boundary parser does.
 */
export function impliedState(reason: FieldReason): FieldState | null {
  const states = statesFor(reason);
  return states.length === 1 ? (states[0] as FieldState) : null;
}
