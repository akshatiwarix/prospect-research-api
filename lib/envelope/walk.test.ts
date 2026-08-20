import { describe, expect, it } from "vitest";

import { collectFields, findNakedValues } from "./walk";
import { resolved, unknown } from "./field";

describe("the naked-value walker", () => {
  it("passes a fully boxed tree", () => {
    const fields = {
      identity: { domain: resolved("identity", "stripe.com", "stripe", "2026-08-20") },
      signals: { events: unknown("signals", "a001") },
    };
    expect(findNakedValues(fields)).toEqual([]);
  });

  it("catches the convenient shortcut", () => {
    const fields = { identity: { domain: "stripe.com" } };
    expect(findNakedValues(fields)).toEqual([{ path: "fields.identity.domain", value: "stripe.com" }]);
  });

  it("does not descend into a box's value", () => {
    // Upstream payloads are arbitrarily nested and are not going to pre-box
    // themselves. The box carries the state for everything beneath it.
    const fields = { tech: resolved("tech", { claims: [{ name: "Stripe", surfaces: ["page_markup"] }] }, "stripe") };
    expect(findNakedValues(fields)).toEqual([]);
  });

  it("walks arrays and reports indexed paths", () => {
    const fields = { list: [resolved("x", 1, "k"), "oops"] };
    expect(findNakedValues(fields)).toEqual([{ path: "fields.list[1]", value: "oops" }]);
  });

  it("collects every box with its path", () => {
    const fields = { a: resolved("a", 1, "k"), b: { c: unknown("b", "k") } };
    expect(collectFields(fields).map((entry) => entry.path)).toEqual(["fields.a", "fields.b.c"]);
  });
});
