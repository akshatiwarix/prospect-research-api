import { describe, expect, it } from "vitest";

import {
  EnvelopeError,
  absent,
  anyFieldSchema,
  field,
  notAttempted,
  resolved,
  unavailable,
  unknown,
} from "./field";
import { FIELD_REASONS, FIELD_STATES, REASON_SENT, REASON_STATES, isLegalPair } from "./states";

describe("the box", () => {
  it("omits value rather than nulling it", () => {
    const box = notAttempted("signals", "unmapped");
    expect("value" in box).toBe(false);
    expect(JSON.stringify(box)).not.toContain("null");
  });

  it("refuses a value on any state but resolved", () => {
    expect(() => field({ reason: "ok", state: "unknown", capability: "x", value: 1, upstream_key: "k" })).toThrow(
      EnvelopeError,
    );
  });

  it("refuses resolved without a value", () => {
    expect(() => field({ reason: "ok", state: "resolved", capability: "x", upstream_key: "k" })).toThrow(
      EnvelopeError,
    );
  });

  it("refuses null explicitly, since undefined is the encoding of absence", () => {
    expect(() =>
      field({ reason: "ok", state: "resolved", capability: "x", value: null, upstream_key: "k" }),
    ).toThrow(/null is not a value/);
  });

  it("derives the state for every reason that determines one", () => {
    for (const reason of FIELD_REASONS) {
      if (reason === "ok") continue;
      const box = field({ reason, capability: "x", ...(reasonSends(reason) ? { upstream_key: "k" } : {}) });
      expect(REASON_STATES[reason]).toContain(box.state);
    }
  });

  it("will not derive a state for ok, because ok does not determine one", () => {
    expect(() => field({ reason: "ok", capability: "x", upstream_key: "k" })).toThrow(/does not determine a state/);
  });

  it("requires an upstream key exactly when a request was sent", () => {
    expect(() => unavailableWithoutKey()).toThrow(/name the key/);
    expect(() => field({ reason: "unmapped", capability: "x", upstream_key: "k" })).toThrow(
      /implies an attempt that did not happen/,
    );
  });

  it("allows retry_after_s only under rate limiting", () => {
    expect(unavailable("t", "upstream_rate_limited", "k", 30).retry_after_s).toBe(30);
    expect(() => field({ reason: "upstream_error", capability: "t", upstream_key: "k", retry_after_s: 30 })).toThrow(
      /means nothing under reason/,
    );
  });

  it("allows an observation time only on a resolution", () => {
    expect(resolved("t", 1, "k", "2026-08-20").observed_at).toBe("2026-08-20");
    expect(() =>
      field({ reason: "ok", state: "unknown", capability: "t", upstream_key: "k", observed_at: "2026-08-20" }),
    ).toThrow(/only a resolved value has an observation time/);
  });

  it("rejects every illegal state/reason pair, exhaustively", () => {
    for (const state of FIELD_STATES) {
      for (const reason of FIELD_REASONS) {
        if (isLegalPair(state, reason)) continue;
        expect(() =>
          field({
            reason,
            state,
            capability: "x",
            ...(state === "resolved" ? { value: 1 } : {}),
            ...(reasonSends(reason) ? { upstream_key: "k" } : {}),
          }),
        ).toThrow(EnvelopeError);
      }
    }
  });
});

describe("the published box schema", () => {
  it("accepts every box the constructors can build", () => {
    const boxes = [
      resolved("a", "stripe.com", "stripe", "2026-08-20"),
      unknown("b", "stripe"),
      absent("c", "stripe"),
      notAttempted("d", "deadline"),
      notAttempted("e", "dependency_failed"),
      notAttempted("f", "unmapped"),
      notAttempted("g", "excluded_by_caller"),
      unavailable("h", "upstream_error", "k"),
      unavailable("i", "upstream_unconfigured", "k"),
      unavailable("j", "upstream_rate_limited", "k", 12),
      unavailable("k", "boundary_violation", "k"),
    ];
    for (const box of boxes) expect(anyFieldSchema.safeParse(box).success).toBe(true);
  });

  it("rejects a hand-built box that the constructor would have refused", () => {
    expect(
      anyFieldSchema.safeParse({ value: 1, state: "unknown", reason: "ok", capability: "x", upstream_key: "k" })
        .success,
    ).toBe(false);
    expect(anyFieldSchema.safeParse({ state: "not_attempted", reason: "deadline", capability: "x", upstream_key: "k" }).success).toBe(
      false,
    );
  });
});

// Reads the real set rather than restating it. A test carrying its own copy of
// the rule it is testing passes forever, including after the rule changes.
const reasonSends = (reason: (typeof FIELD_REASONS)[number]): boolean => REASON_SENT.has(reason);

function unavailableWithoutKey() {
  return field({ reason: "upstream_error", capability: "x" });
}
