import { describe, expect, it } from "vitest";

import { anyFieldSchema } from "@/lib/envelope";
import { CAPABILITIES, CAPABILITY_IDS, TIER_0, TIER_1, emptyFields } from "./index";
import { identity, resolvedDomain } from "./identity";
import { technographics } from "./technographics";
import { attributes } from "./attributes";
import { whyNow } from "./why-now";
import { signals } from "./signals";
import { narrative } from "./narrative";

describe("the registry", () => {
  it("covers every declared id exactly once, in declaration order", () => {
    expect(Object.keys(CAPABILITIES)).toEqual([...CAPABILITY_IDS]);
  });

  it("has exactly one tier-0 capability and one dependency edge", () => {
    expect(TIER_0.map((capability) => capability.id)).toEqual(["identity"]);
    const edges = [...TIER_0, ...TIER_1].flatMap((capability) =>
      capability.dependsOn.map((from) => `${from}->${capability.id}`),
    );
    expect(edges).toEqual(["identity->technographics"]);
  });

  it("produces the full key set on every unhappy path", () => {
    for (const capability of Object.values(CAPABILITIES)) {
      for (const reason of ["deadline", "dependency_failed", "unmapped", "excluded_by_caller"] as const) {
        expect(Object.keys(emptyFields(capability, reason)).sort()).toEqual([...capability.contributes].sort());
      }
      expect(Object.keys(emptyFields(capability, "upstream_error", { upstreamKey: "k" })).sort()).toEqual(
        [...capability.contributes].sort(),
      );
    }
  });

  it("refuses to build a sent-reason box without naming the key", () => {
    expect(() => emptyFields(CAPABILITIES.identity, "upstream_error")).toThrow(/name its key/);
  });
});

describe("identity", () => {
  const base = {
    entity: { id: "stripe", legalName: "Stripe, Inc.", country: "US", industry: "Payments", foundedYear: 2010, origin: "real" },
    capturedAt: "2026-08-20",
  };

  it("resolves a verified verdict from its `domain` key", () => {
    // The real shape, captured from the live deployment for "Datadog": a
    // verified verdict names one `domain` and carries no `survivors` at all.
    const fields = identity.toFields(
      { ...base, purposes: [{ purpose: "web", verdict: { state: "verified", domain: "stripe.com" } }] },
      "stripe",
    );
    expect(fields.domain).toMatchObject({ state: "resolved", value: "stripe.com", observed_at: "2026-08-20" });
    expect(resolvedDomain(fields)).toBe("stripe.com");
  });

  it("reports ambiguity as unknown rather than picking a survivor", () => {
    // This is the real live response for "Stripe": three survivors. Choosing one
    // would be the silent precedence Day 013 exists to refuse.
    const fields = identity.toFields(
      {
        ...base,
        purposes: [
          { purpose: "web", verdict: { state: "ambiguous", survivors: ["stripe.com", "stripeinc.net", "stripecorp.com"] } },
        ],
      },
      "stripe",
    );
    expect(fields.domain?.state).toBe("unknown");
    expect("value" in (fields.domain ?? {})).toBe(false);
    expect(resolvedDomain(fields)).toBeUndefined();
  });

  it("reports no surviving candidate as absent, which is a finding", () => {
    const fields = identity.toFields(
      { ...base, purposes: [{ purpose: "web", verdict: { state: "no_candidate_survives" } }] },
      "stripe",
    );
    expect(fields.domain?.state).toBe("absent");
  });

  it("tolerates a verdict state it has never seen", () => {
    const fields = identity.toFields(
      { ...base, purposes: [{ purpose: "web", verdict: { state: "some_future_state" } }] },
      "stripe",
    );
    expect(fields.domain?.state).toBe("unknown");
  });

  it("treats a verified verdict naming nothing as a contradiction, not a domain", () => {
    const fields = identity.toFields(
      { ...base, purposes: [{ purpose: "web", verdict: { state: "verified" } }] },
      "stripe",
    );
    expect(fields.domain?.state).toBe("unknown");
  });

  it("accepts a null entity as a real answer, not a broken one", () => {
    // The live response for a company Day 013 has never heard of: entity null,
    // matched empty, and an honest no_candidate_survives verdict. Calling that a
    // boundary violation would accuse a working upstream of breaking contract.
    const raw = {
      entity: null,
      purposes: [{ purpose: "web", verdict: { state: "no_candidate_survives" } }],
      capturedAt: "2026-08-20",
    };
    const parsed = CAPABILITIES.identity.parseBoundary(raw);
    expect(parsed.ok).toBe(true);

    const fields = identity.toFields(raw, "Tessellate");
    expect(fields.domain?.state).toBe("absent");
    expect(fields.legal_name?.state).toBe("unknown");
  });

  it("tolerates every verdict state the live corpus actually produces", () => {
    for (const state of ["succeeded_by", "different_entity", "under_posed"]) {
      const fields = identity.toFields({ ...base, purposes: [{ purpose: "web", verdict: { state } }] }, "q");
      expect(fields.domain?.state, state).toBe("unknown");
    }
  });

  it("ignores unrecognised upstream keys and requires the ones it reads", () => {
    const erased = CAPABILITIES.identity;
    const tolerant = erased.parseBoundary({ ...base, purposes: [], somethingNew: { deeply: "nested" } });
    expect(tolerant.ok).toBe(true);
    const strict = erased.parseBoundary({ entity: { id: "stripe" }, capturedAt: "2026-08-20" });
    expect(strict.ok).toBe(false);
  });
});

describe("technographics", () => {
  it("cannot build a request without a resolved domain", () => {
    expect(technographics.buildRequest(true, { as_of: "2026-08-20" })).toBeNull();
    expect(technographics.buildRequest(true, { as_of: "2026-08-20", domain: "stripe.com" })).toEqual({
      path: "/api/inspect",
      body: { url: "https://stripe.com", asOf: "2026-08-20" },
    });
  });

  it("calls an empty claim list unknown, never absent, when surfaces went unexamined", () => {
    // The real live response for datadoghq.com: two surfaces inspected, four not.
    const fields = technographics.toFields(
      {
        url: "https://datadoghq.com/",
        inspectedSurfaces: ["page_markup", "http_headers"],
        uninspectedSurfaces: ["DNS records", "Job posting", "Engineering blog", "Integrations directory"],
        claims: [],
      },
      "datadoghq.com",
    );
    expect(fields.technologies?.state).toBe("unknown");
  });
});

describe("attributes", () => {
  const parsed = {
    classification: {
      companyId: "tessellate",
      sourceTypes: ["about_press", "careers", "docs", "homepage", "pricing"],
      derivations: {
        segment: { state: "derived", value: "mid_market" },
        sales_motion: { state: "contested" },
        business_model: { state: "insufficient" },
        maturity: { state: "underdetermined" },
      },
    },
  };

  it("resolves only a derived attribute", () => {
    const fields = attributes.toFields(parsed, "tessellate");
    expect(fields.segment).toMatchObject({ state: "resolved", value: "mid_market" });
    expect(fields.sales_motion?.state).toBe("unknown");
    expect(fields.business_model?.state).toBe("unknown");
    expect(fields.maturity?.state).toBe("unknown");
  });

  it("preserves the upstream's richer vocabulary instead of paraphrasing it away", () => {
    const fields = attributes.toFields(parsed, "tessellate");
    expect(fields.derivation_states).toMatchObject({
      state: "resolved",
      value: { segment: "derived", sales_motion: "contested", business_model: "insufficient", maturity: "underdetermined" },
    });
  });

  it("keeps the key set stable when the upstream omits an attribute", () => {
    const fields = attributes.toFields(parsed, "tessellate");
    expect(fields.market_focus?.state).toBe("unknown");
    expect(Object.keys(fields).sort()).toEqual([...attributes.contributes].sort());
  });
});

describe("why_now", () => {
  it("distinguishes 'nothing survived' from 'nothing to reason about'", () => {
    const reasoned = whyNow.toFields(
      { companyId: "c", sellerId: "ledgerline", asOf: "2026-08-16", emitted: [], counts: { emitted: 0, defeated: 2 } },
      "c:ledgerline",
    );
    expect(reasoned.hypotheses?.state).toBe("absent");

    const empty = whyNow.toFields(
      { companyId: "c", sellerId: "ledgerline", asOf: "2026-08-16", emitted: [], counts: { emitted: 0 } },
      "c:ledgerline",
    );
    expect(empty.hypotheses?.state).toBe("unknown");
  });

  it("carries the as-of through as the observation time", () => {
    const fields = whyNow.toFields(
      { companyId: "c", sellerId: "s", asOf: "2026-08-16", emitted: [{ id: "h1" }], counts: { emitted: 1 } },
      "c:s",
    );
    expect(fields.hypotheses?.observed_at).toBe("2026-08-16");
  });
});

describe("signals", () => {
  const row = {
    account: { id: "a001", name: "Loudwave Labs", domain: "loudwave-labs.example" },
    families: [{ family: "market", points: 8, cap: 8, clipped: 0 }],
    signals: [{ key: "a001:product_launch:Mobile app", type: "product_launch", family: "market" }],
  };

  it("surfaces events and families but not the point total", () => {
    const fields = signals.toFields({ as_of: "2026-08-20", watchlist_name: "Growth motion", rows: [row] }, "a001");
    expect(Object.keys(fields).sort()).toEqual([...signals.contributes].sort());
    expect(JSON.stringify(fields)).not.toContain('"total"');
  });

  it("calls a missing row an absence, since we supplied the payload ourselves", () => {
    const fields = signals.toFields({ as_of: "2026-08-20", watchlist_name: "Growth motion", rows: [] }, "a001");
    expect(fields.signal_events?.state).toBe("absent");
  });
});

describe("narrative", () => {
  it("treats an empty conflict list as a finding and an empty section list as a gap", () => {
    const fields = narrative.toFields({ brief: { sections: [], conflicts: [], generated_at: "2026-08-20" } }, "x");
    expect(fields.conflicts).toMatchObject({ state: "resolved", value: [] });
    expect(fields.sections?.state).toBe("unknown");
  });

  it("rejects an HTML body at the boundary rather than throwing", () => {
    // The live deployment's actual behaviour: 404 text/html. The transport will
    // have already classified the status, but a 200 of HTML must land here.
    const result = CAPABILITIES.narrative.parseBoundary("<!DOCTYPE html><html></html>");
    expect(result.ok).toBe(false);
  });
});

describe("every capability", () => {
  it("emits only boxes that satisfy the published schema", () => {
    const samples: Array<Record<string, unknown>> = [
      identity.toFields(
        {
          entity: { id: "stripe", legalName: "Stripe, Inc." },
          purposes: [{ purpose: "web", verdict: { state: "verified", domain: "stripe.com" } }],
          capturedAt: "2026-08-20",
        },
        "stripe",
      ),
      technographics.toFields(
        { url: "https://x.example/", inspectedSurfaces: ["page_markup"], uninspectedSurfaces: [], claims: [] },
        "x.example",
      ),
      attributes.toFields(
        { classification: { companyId: "t", derivations: { segment: { state: "derived", value: "smb" } } } },
        "t",
      ),
      whyNow.toFields({ companyId: "c", sellerId: "s", asOf: "2026-08-16", emitted: [], counts: { emitted: 0 } }, "c:s"),
      signals.toFields({ as_of: "2026-08-20", watchlist_name: "w", rows: [] }, "a001"),
      narrative.toFields({ brief: { sections: [{ section: "s", questions: [] }] } }, "t"),
    ];

    for (const fields of samples) {
      for (const [key, box] of Object.entries(fields)) {
        const parsed = anyFieldSchema.safeParse(box);
        expect(parsed.success, `${key}: ${JSON.stringify(box)}`).toBe(true);
      }
    }
  });
});
