import { z } from "zod";

import { field, notAttempted, unavailable, type Field } from "@/lib/envelope";
import type { FieldReason, NotAttemptedReason, UnavailableReason } from "@/lib/envelope";
import { REASON_SENT } from "@/lib/envelope";
import type { UpstreamId } from "@/data/upstreams";

export const CAPABILITY_IDS = [
  "identity",
  "technographics",
  "attributes",
  "why_now",
  "signals",
  "narrative",
] as const;

export type CapabilityId = (typeof CAPABILITY_IDS)[number];

export type FieldMap = Record<string, Field<unknown>>;

/** What tier 1 gets to know about what tier 0 found. */
export type CapabilityContext = {
  /** Present only when `identity` resolved a web domain. */
  domain?: string;
  /** The as-of date the whole request is evaluated at. Never `new Date()`. */
  as_of: string;
};

export type UpstreamRequest = {
  /** Path only. The host comes from the allowlist, never from a binding. */
  path: string;
  body: unknown;
};

/**
 * A capability describes a request and interprets a response. It performs no
 * I/O — that is the transport's job, and the separation is what lets every
 * boundary rule be tested without a network or a mock server.
 */
export type Capability<Binding = unknown, Parsed = unknown> = {
  id: CapabilityId;
  upstream: UpstreamId;
  tier: 0 | 1;
  dependsOn: readonly CapabilityId[];
  /**
   * The field keys this capability contributes, always all of them.
   *
   * A stable key set is a contract in its own right: a caller destructuring
   * `fields.attributes.segment` must not have that key vanish because an
   * upstream was down. The states change; the shape does not. `emptyFields`
   * below is generated from this list precisely so a capability cannot forget a
   * key on its unhappy path.
   */
  contributes: readonly string[];
  bindingSchema: z.ZodType<Binding>;
  /**
   * Returns `null` when the request cannot be constructed in this context — the
   * only case being `technographics` without a resolved domain, which the
   * scheduler turns into `dependency_failed`.
   */
  buildRequest: (binding: Binding, context: CapabilityContext) => UpstreamRequest | null;
  /**
   * Tolerant read, strict require: unrecognised upstream keys are stripped, and
   * a missing key that `toFields` actually needs fails here rather than
   * producing `undefined` three frames later.
   */
  boundarySchema: z.ZodType<Parsed>;
  toFields: (parsed: Parsed, upstreamKey: string) => FieldMap;
};

/**
 * The unhappy path, generated rather than written six times.
 *
 * Every capability's failure shape is "the same keys, one reason", so writing it
 * per capability would be six chances to drift from `contributes`.
 */
export function emptyFields(
  capability: Pick<Capability, "id" | "contributes">,
  reason: Exclude<FieldReason, "ok">,
  options: { upstreamKey?: string; retryAfterS?: number } = {},
): FieldMap {
  // Asks the real table rather than listing the four not-sent reasons here, so
  // adding a reason cannot leave this branch silently wrong.
  const notSent = !REASON_SENT.has(reason);

  if (!notSent && options.upstreamKey === undefined) {
    throw new Error(`${capability.id}: reason '${reason}' implies a request was sent, so name its key`);
  }

  const entries = capability.contributes.map((key) => {
    const box = notSent
      ? notAttempted(capability.id, reason as NotAttemptedReason)
      : unavailable(capability.id, reason as UnavailableReason, options.upstreamKey as string, options.retryAfterS);
    return [key, box] as const;
  });
  return Object.fromEntries(entries);
}

/** Re-exported so capability modules import one place. */
export { field };

/**
 * The generic-erased capability.
 *
 * A registry of `Capability<Binding, Parsed>` with six different type arguments
 * cannot be expressed as a homogeneous record, and the tempting fix —
 * `as unknown as Capability<never, never>` — throws away the one place the types
 * were doing work. So the generics are erased *once*, at `erase()`, where both
 * arguments are still known and the parse calls are still checked. Everything
 * downstream holds `AnyCapability` and gets `unknown` in and `FieldMap` out,
 * which is exactly the amount of type information a scheduler needs.
 */
export type AnyCapability = {
  id: CapabilityId;
  upstream: UpstreamId;
  tier: 0 | 1;
  dependsOn: readonly CapabilityId[];
  contributes: readonly string[];
  /** Throws on a malformed binding — that is a bug in our own directory. */
  parseBinding: (raw: unknown) => unknown;
  buildRequest: (binding: unknown, context: CapabilityContext) => UpstreamRequest | null;
  /**
   * Never throws. A `false` result is an upstream contract violation, which is a
   * fact about the world and belongs in a field's state, not in a stack trace.
   */
  parseBoundary: (raw: unknown) => { ok: true; value: unknown } | { ok: false; issue: string };
  toFields: (parsed: unknown, upstreamKey: string) => FieldMap;
};

export function erase<Binding, Parsed>(capability: Capability<Binding, Parsed>): AnyCapability {
  return {
    id: capability.id,
    upstream: capability.upstream,
    tier: capability.tier,
    dependsOn: capability.dependsOn,
    contributes: capability.contributes,
    parseBinding: (raw) => capability.bindingSchema.parse(raw),
    buildRequest: (binding, context) => capability.buildRequest(binding as Binding, context),
    parseBoundary: (raw) => {
      const parsed = capability.boundarySchema.safeParse(raw);
      if (parsed.success) return { ok: true, value: parsed.data };
      const first = parsed.error.issues[0];
      return {
        ok: false,
        issue: first ? `${first.path.join(".") || "body"}: ${first.message}` : "did not match the boundary schema",
      };
    },
    toFields: (parsed, upstreamKey) => capability.toFields(parsed as Parsed, upstreamKey),
  };
}
