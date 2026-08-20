import { describe, expect, it } from "vitest";

import { collectFields, deriveCompleteness, findNakedValues } from "@/lib/envelope";
import { CAPABILITY_IDS } from "@/lib/capabilities";
import { fixtureTransport, virtualClock, type FixtureStore } from "@/lib/transport";
import { schedule, tier0Slice, type Bindings } from "./schedule";

const IDENTITY_BODY = {
  entity: { id: "stripe", legalName: "Stripe, Inc.", country: "US", industry: "Payments", foundedYear: 2010, origin: "real" },
  purposes: [{ purpose: "web", verdict: { state: "verified", domain: "stripe.com" } }],
  capturedAt: "2026-08-20",
};

const TECH_BODY = {
  url: "https://stripe.com/",
  inspectedSurfaces: ["page_markup", "http_headers"],
  uninspectedSurfaces: ["DNS records"],
  claims: [{ technology: "Cloudflare", category: "cdn" }],
};

const store: FixtureStore = [
  { upstream: "domain_detective", key: "Stripe", latency_ms: 300, body: IDENTITY_BODY },
  { upstream: "techstack_icp", key: "stripe.com", latency_ms: 1200, body: TECH_BODY },
  {
    upstream: "domain_detective",
    key: "Slowpoke",
    latency_ms: 9000,
    body: IDENTITY_BODY,
  },
  {
    upstream: "account_brief",
    key: "tessellate",
    latency_ms: 150,
    failure: { reason: "upstream_error", detail: "404 text/html" },
  },
  { upstream: "company_classifier", key: "tessellate", latency_ms: 400, body: { notWhatWeAskedFor: true } },
];

const bindings: Bindings = {
  identity: "Stripe",
  technographics: true,
  attributes: "tessellate",
  narrative: "tessellate",
};

const run = (overrides: Partial<Parameters<typeof schedule>[0]> = {}) =>
  schedule({
    bindings,
    requested: CAPABILITY_IDS,
    deadline_ms: 8000,
    as_of: "2026-08-20",
    transport: fixtureTransport(store),
    clock: virtualClock(),
    ...overrides,
  });

describe("the tier-0 slice", () => {
  it("is 40% of the budget, capped at 4000ms", () => {
    expect(tier0Slice(8000)).toBe(3200);
    expect(tier0Slice(30000)).toBe(4000);
    expect(tier0Slice(1000)).toBe(400);
  });

  it("never decreases as the budget grows", () => {
    let previous = 0;
    for (let budget = 100; budget <= 30000; budget += 100) {
      const slice = tier0Slice(budget);
      expect(slice).toBeGreaterThanOrEqual(previous);
      previous = slice;
    }
  });
});

describe("the schedule", () => {
  it("keys fields and capabilities in declaration order, not settle order", async () => {
    const result = await run();
    expect(Object.keys(result.fields)).toEqual([...CAPABILITY_IDS]);
    expect(Object.keys(result.capabilities)).toEqual([...CAPABILITY_IDS]);
  });

  it("boxes every leaf", async () => {
    const result = await run();
    expect(findNakedValues(result.fields)).toEqual([]);
  });

  it("resolves tier 0 and passes its domain across the one edge", async () => {
    const result = await run();
    expect(result.fields.identity.domain).toMatchObject({ state: "resolved", value: "stripe.com" });
    expect(result.capabilities.technographics).toMatchObject({
      state: "resolved",
      reason: "ok",
      upstream_key: "stripe.com",
    });
  });

  it("cascades when tier 0 does not resolve a domain", async () => {
    const ambiguous: FixtureStore = [
      {
        upstream: "domain_detective",
        key: "Stripe",
        latency_ms: 300,
        body: {
          ...IDENTITY_BODY,
          purposes: [{ purpose: "web", verdict: { state: "ambiguous", survivors: ["stripe.com", "stripeinc.net"] } }],
        },
      },
      ...store.filter((record) => record.upstream !== "domain_detective"),
    ];
    const result = await run({ transport: fixtureTransport(ambiguous) });

    expect(result.fields.identity.domain?.state).toBe("unknown");
    expect(result.capabilities.technographics).toMatchObject({
      state: "not_attempted",
      reason: "dependency_failed",
    });
    // Not sent, therefore no key. Naming one would imply an attempt.
    expect(result.capabilities.technographics.upstream_key).toBeUndefined();
    expect(result.capabilities.technographics.elapsed_ms).toBeUndefined();
  });

  it("cascades identically when tier 0 was never requested", async () => {
    const result = await run({ requested: CAPABILITY_IDS.filter((id) => id !== "identity") });
    expect(result.capabilities.identity.reason).toBe("excluded_by_caller");
    expect(result.capabilities.technographics.reason).toBe("dependency_failed");
  });

  it("reports an unmapped capability without touching the network", async () => {
    const result = await run();
    expect(result.capabilities.signals).toMatchObject({ state: "not_attempted", reason: "unmapped" });
    expect(result.capabilities.why_now).toMatchObject({ state: "not_attempted", reason: "unmapped" });
  });

  it("reports a 2xx it could not read as a boundary violation, naming the key", async () => {
    const result = await run();
    expect(result.capabilities.attributes).toMatchObject({
      state: "unavailable",
      reason: "boundary_violation",
      upstream_key: "tessellate",
    });
    expect(Object.values(result.fields.attributes).every((box) => box.reason === "boundary_violation")).toBe(true);
  });

  it("reports a recorded upstream failure with its reason intact", async () => {
    const result = await run();
    expect(result.capabilities.narrative).toMatchObject({ state: "unavailable", reason: "upstream_error" });
  });

  it("spends the tier-0 slice and no more when tier 0 is too slow", async () => {
    const result = await run({ bindings: { ...bindings, identity: "Slowpoke" }, deadline_ms: 8000 });
    expect(result.capabilities.identity).toMatchObject({ reason: "timeout", upstream_key: "Slowpoke" });
    expect(result.budget.tier0_slice_ms).toBe(3200);
    expect(result.budget.remaining_after_tier0_ms).toBe(8000 - 3200);
    expect(result.capabilities.technographics.reason).toBe("dependency_failed");
  });

  it("times out tier 1 when a little budget remains, rather than calling it a deadline miss", async () => {
    // 250ms budget: tier 0 is abandoned at its 100ms slice, so 150ms remains —
    // enough to *start* the tier-1 requests, not enough for any to answer.
    const result = await run({ bindings: { ...bindings, identity: "Slowpoke" }, deadline_ms: 250 });
    expect(result.budget.remaining_after_tier0_ms).toBe(150);
    expect(result.capabilities.attributes).toMatchObject({
      state: "unavailable",
      reason: "timeout",
      upstream_key: "tessellate",
    });
  });

  it("reports deadline only when tier 0's overshoot leaves nothing at all", async () => {
    // The one path to "never started": abandoning tier 0 cost more than the
    // budget it was abandoned at, and the remainder went negative.
    const overshooting: FixtureStore = [
      { upstream: "domain_detective", key: "Slowpoke", latency_ms: 9000, overshoot_ms: 2000, body: IDENTITY_BODY },
      ...store.filter((record) => record.upstream !== "domain_detective"),
    ];
    const result = await run({
      bindings: { ...bindings, identity: "Slowpoke" },
      deadline_ms: 1000,
      transport: fixtureTransport(overshooting),
    });

    expect(result.budget.remaining_after_tier0_ms).toBeLessThan(0);
    expect(result.capabilities.attributes).toMatchObject({ state: "not_attempted", reason: "deadline" });
    // Nothing was sent, so nothing is named.
    expect(result.capabilities.attributes.upstream_key).toBeUndefined();
    expect(result.capabilities.narrative.reason).toBe("deadline");
  });

  it("charges the tier for its slowest member, which is what concurrency costs", async () => {
    const result = await run();
    // tier 0 spent 300; the slowest tier-1 was technographics at 1200.
    expect(result.budget.elapsed_ms).toBe(300 + 1200);
  });

  it("agrees with the completeness derived from its own summaries", async () => {
    const result = await run();
    expect(deriveCompleteness(result.capabilities)).toBe("partial");
  });

  it("gives every box the capability that produced it", async () => {
    const result = await run();
    for (const { path, field } of collectFields(result.fields)) {
      const [, capability] = path.split(".");
      expect(field.capability).toBe(capability);
    }
  });
});

describe("budget monotonicity", () => {
  it("never un-resolves a field as the budget grows", async () => {
    const slowStore: FixtureStore = [
      { upstream: "domain_detective", key: "Stripe", latency_ms: 2500, body: IDENTITY_BODY },
      { upstream: "techstack_icp", key: "stripe.com", latency_ms: 3000, body: TECH_BODY },
      { upstream: "company_classifier", key: "tessellate", latency_ms: 1500, body: { notWhatWeAskedFor: true } },
      {
        upstream: "account_brief",
        key: "tessellate",
        latency_ms: 5000,
        body: { brief: { sections: [{ section: "s", questions: [] }] } },
      },
    ];

    let previouslyResolved = new Set<string>();
    for (let budget = 200; budget <= 30000; budget += 200) {
      const result = await schedule({
        bindings,
        requested: CAPABILITY_IDS,
        deadline_ms: budget,
        as_of: "2026-08-20",
        transport: fixtureTransport(slowStore),
        clock: virtualClock(),
      });

      const resolvedNow = new Set(
        collectFields(result.fields)
          .filter(({ field }) => field.state === "resolved")
          .map(({ path }) => path),
      );

      for (const path of previouslyResolved) {
        expect(resolvedNow.has(path), `${path} un-resolved when the budget rose to ${budget}ms`).toBe(true);
      }
      previouslyResolved = resolvedNow;
    }
  });
});
