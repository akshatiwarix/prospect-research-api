import { describe, expect, it } from "vitest";

import { deriveCompleteness, type CapabilitySummary } from "./document";

const ok = (): CapabilitySummary => ({ state: "resolved", reason: "ok", upstream_key: "k" });
const unknownOk = (): CapabilitySummary => ({ state: "unknown", reason: "ok", upstream_key: "k" });
const missed = (): CapabilitySummary => ({ state: "not_attempted", reason: "deadline" });
const excluded = (): CapabilitySummary => ({ state: "not_attempted", reason: "excluded_by_caller" });

describe("completeness", () => {
  it("is complete when every capability answered", () => {
    expect(deriveCompleteness({ a: ok(), b: ok() })).toBe("complete");
  });

  it("counts a capability that answered 'unknown' as having answered", () => {
    // The distinction the rule exists for: the upstream looked and there was
    // nothing there. Calling that incomplete would tell the caller to retry a
    // question that has already been answered.
    expect(deriveCompleteness({ a: ok(), b: unknownOk() })).toBe("complete");
  });

  it("is partial when some answered", () => {
    expect(deriveCompleteness({ a: ok(), b: missed() })).toBe("partial");
  });

  it("is none when nothing answered", () => {
    expect(deriveCompleteness({ a: missed(), b: missed() })).toBe("none");
  });

  it("ignores capabilities the caller excluded", () => {
    // Reporting the caller's own scope decision back as a shortfall would make
    // `complete` unreachable for anyone who uses the capabilities parameter.
    expect(deriveCompleteness({ a: ok(), b: excluded(), c: excluded() })).toBe("complete");
    expect(deriveCompleteness({ a: ok(), b: missed(), c: excluded() })).toBe("partial");
    expect(deriveCompleteness({ a: missed(), b: excluded() })).toBe("none");
  });

  it("is none when everything was excluded, since nothing was asked", () => {
    expect(deriveCompleteness({ a: excluded(), b: excluded() })).toBe("none");
  });

  it("is none for an empty capability set, not complete", () => {
    // A caller who excluded everything got nothing, and vacuous truth would be
    // the wrong headline.
    expect(deriveCompleteness({})).toBe("none");
  });
});
