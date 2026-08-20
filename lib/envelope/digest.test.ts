import { describe, expect, it } from "vitest";

import { canonicalise, requestDigest } from "./digest";

describe("the request digest", () => {
  it("ignores key order, because two serialisers are not two requests", () => {
    expect(requestDigest({ company: "stripe", deadline_ms: 8000 })).toBe(
      requestDigest({ deadline_ms: 8000, company: "stripe" }),
    );
  });

  it("covers the deadline, because the deadline changes the answer", () => {
    expect(requestDigest({ company: "stripe", deadline_ms: 8000 })).not.toBe(
      requestDigest({ company: "stripe", deadline_ms: 500 }),
    );
  });

  it("treats an explicitly-undefined key as absent", () => {
    expect(requestDigest({ company: "stripe", transport: undefined })).toBe(requestDigest({ company: "stripe" }));
  });

  it("does not confuse array order, which is meaningful", () => {
    expect(requestDigest({ capabilities: ["a", "b"] })).not.toBe(requestDigest({ capabilities: ["b", "a"] }));
  });

  it("canonicalises nested keys too", () => {
    expect(canonicalise({ b: 1, a: { d: 2, c: 3 } })).toEqual({ a: { c: 3, d: 2 }, b: 1 });
    expect(Object.keys(canonicalise({ b: 1, a: 2 }) as object)).toEqual(["a", "b"]);
  });
});
