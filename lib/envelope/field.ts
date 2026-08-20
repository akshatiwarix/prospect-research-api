import { z } from "zod";

import {
  FIELD_REASONS,
  FIELD_STATES,
  REASON_ALLOWS_RETRY_AFTER,
  REASON_SENT,
  impliedState,
  isLegalPair,
  type FieldReason,
  type FieldState,
} from "./states";

/**
 * The box. Every leaf of every response is one of these, and `walk.ts` proves it
 * for the whole cross-product rather than trusting that nobody added a shortcut.
 *
 * `value` is **optional and never `null`**. A `null` beside a state is two
 * encodings of the same fact, and two encodings of one fact is a disagreement
 * waiting for a slow afternoon. Absence lives in the state; the key is simply
 * not there.
 */
export type Field<T> = {
  value?: T;
  state: FieldState;
  reason: FieldReason;
  capability: string;
  upstream_key?: string;
  observed_at?: string;
  retry_after_s?: number;
};

/**
 * Everything a box needs that the box itself should not have to be told twice.
 * `state` is absent for the eight determined reasons — `field()` fills it from
 * the reason table, so a caller cannot pair `deadline` with `resolved` even by
 * accident, because there is no parameter in which to make the mistake.
 */
type FieldInput<T> = {
  reason: FieldReason;
  capability: string;
  /** Required only when the reason is `ok`, where three states are possible. */
  state?: FieldState;
  value?: T;
  upstream_key?: string;
  observed_at?: string;
  retry_after_s?: number;
};

export class EnvelopeError extends Error {}

/**
 * The only constructor. Every rule in `states.ts` is checked here, and a
 * violation throws rather than degrading — a malformed box is a bug in this
 * repo, not a fact about an upstream, and returning it would be reporting our
 * own defect as somebody else's outage.
 */
export function field<T>(input: FieldInput<T>): Field<T> {
  const { reason, capability } = input;

  const state = input.state ?? impliedOrThrow(reason);
  if (!isLegalPair(state, reason)) {
    throw new EnvelopeError(`${capability}: state '${state}' is illegal for reason '${reason}'`);
  }

  const hasValue = input.value !== undefined;
  if (hasValue && state !== "resolved") {
    throw new EnvelopeError(`${capability}: a value is only carried by 'resolved', not '${state}'`);
  }
  if (!hasValue && state === "resolved") {
    throw new EnvelopeError(`${capability}: 'resolved' without a value is not a resolution`);
  }
  if (input.value === null) {
    throw new EnvelopeError(`${capability}: null is not a value — omit the key and let the state speak`);
  }

  const sent = REASON_SENT.has(reason);
  if (sent && input.upstream_key === undefined) {
    throw new EnvelopeError(`${capability}: reason '${reason}' means a request was sent, so name the key it was sent about`);
  }
  if (!sent && input.upstream_key !== undefined) {
    throw new EnvelopeError(`${capability}: reason '${reason}' means nothing was sent, so naming a key implies an attempt that did not happen`);
  }

  if (input.observed_at !== undefined && state !== "resolved") {
    throw new EnvelopeError(`${capability}: only a resolved value has an observation time`);
  }
  if (input.retry_after_s !== undefined && !REASON_ALLOWS_RETRY_AFTER.has(reason)) {
    throw new EnvelopeError(`${capability}: retry_after_s means nothing under reason '${reason}'`);
  }

  // Built key-by-key so that undefined never becomes an explicit `"key": null`
  // once this crosses JSON.stringify. Spreading an undefined-valued key would
  // survive in the object and vanish in the serialisation, which is exactly the
  // kind of quiet asymmetry the determinism invariant would then catch three
  // hours later.
  const box: Field<T> = { state, reason, capability };
  if (hasValue) box.value = input.value;
  if (input.upstream_key !== undefined) box.upstream_key = input.upstream_key;
  if (input.observed_at !== undefined) box.observed_at = input.observed_at;
  if (input.retry_after_s !== undefined) box.retry_after_s = input.retry_after_s;
  return box;
}

/**
 * Deliberately delegates to `states.ts` rather than keeping a second table of
 * reason-to-state here. Two tables encoding one rule is the drift this repo
 * bans elsewhere for explanation strings; it is no more acceptable for enums.
 */
function impliedOrThrow(reason: FieldReason): FieldState {
  const state = impliedState(reason);
  if (state === null) {
    throw new EnvelopeError(
      "reason 'ok' does not determine a state — say whether the capability resolved, found nothing, or found absence",
    );
  }
  return state;
}

// ---------------------------------------------------------------------------
// Shorthands. Named after the outcome rather than the mechanism, because call
// sites read better as `notAttempted("signals", "unmapped")` than as a literal.
// ---------------------------------------------------------------------------

export function resolved<T>(
  capability: string,
  value: T,
  upstream_key: string,
  observed_at?: string,
): Field<T> {
  return field({ reason: "ok", state: "resolved", capability, value, upstream_key, observed_at });
}

export function unknown(capability: string, upstream_key: string): Field<never> {
  return field({ reason: "ok", state: "unknown", capability, upstream_key });
}

export function absent(capability: string, upstream_key: string): Field<never> {
  return field({ reason: "ok", state: "absent", capability, upstream_key });
}

export function notAttempted(
  capability: string,
  reason: Extract<FieldReason, "deadline" | "dependency_failed" | "unmapped" | "excluded_by_caller">,
): Field<never> {
  return field({ reason, capability });
}

export function unavailable(
  capability: string,
  reason: Extract<
    FieldReason,
    "upstream_error" | "upstream_unconfigured" | "upstream_rate_limited" | "boundary_violation"
  >,
  upstream_key: string,
  retry_after_s?: number,
): Field<never> {
  return field({ reason, capability, upstream_key, retry_after_s });
}

// ---------------------------------------------------------------------------
// The published shape. `/api/schema` serves this, so it is the single source of
// truth for the contract rather than a hand-maintained mirror of it.
// ---------------------------------------------------------------------------

export const fieldStateSchema = z.enum(FIELD_STATES);
export const fieldReasonSchema = z.enum(FIELD_REASONS);

export function fieldSchema<T extends z.ZodTypeAny>(value: T) {
  return z
    .object({
      value: value.optional(),
      state: fieldStateSchema,
      reason: fieldReasonSchema,
      capability: z.string().min(1),
      upstream_key: z.string().min(1).optional(),
      observed_at: z.string().min(1).optional(),
      retry_after_s: z.number().int().nonnegative().optional(),
    })
    .refine((box) => isLegalPair(box.state, box.reason), {
      message: "illegal state/reason pair",
    })
    .refine((box) => (box.value !== undefined) === (box.state === "resolved"), {
      message: "a value is carried by 'resolved' and by nothing else",
    })
    .refine((box) => REASON_SENT.has(box.reason) === (box.upstream_key !== undefined), {
      message: "upstream_key must be present exactly when a request was sent",
    });
}

/** The unparameterised box, for walkers and for the schema endpoint. */
export const anyFieldSchema = fieldSchema(z.unknown());
