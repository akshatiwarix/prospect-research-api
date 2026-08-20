import { describe, expect, it } from "vitest";

import { findNakedValues } from "@/lib/envelope";
import { fixtureTransport, virtualClock } from "@/lib/transport";
import { jsonSchema, publishedFieldPaths, researchRequestSchema, researchResponseSchema } from "@/lib/schema";
import { FIXTURE_STORE } from "@/data/fixtures";
import { UnknownCompany, research } from "./research";

const REQUEST_ID = "fixed-for-tests";

const ask = (overrides: Partial<Parameters<typeof researchRequestSchema.parse>[0]> = {}) =>
  research(researchRequestSchema.parse({ company: "Tessellate", ...(overrides as object) }), {
    request_id: REQUEST_ID,
    transport: fixtureTransport(FIXTURE_STORE),
    clock: virtualClock(),
  });

describe("the document", () => {
  it("satisfies its own published schema", async () => {
    const parsed = researchResponseSchema.safeParse(await ask());
    expect(parsed.success ? null : JSON.stringify(parsed.error.issues.slice(0, 3))).toBeNull();
  });

  it("boxes every leaf of the field tree", async () => {
    expect(findNakedValues((await ask()).fields)).toEqual([]);
  });

  it("names the canonical company and the alias that matched", async () => {
    const document = await ask({ company: "  STRIPE, INC. " });
    expect(document.company).toEqual({
      canonical_id: "stripe",
      input: "  STRIPE, INC. ",
      matched_alias: "stripe, inc.",
    });
  });

  it("refuses an unknown company rather than researching a guess", async () => {
    await expect(ask({ company: "Stripes" })).rejects.toThrow(UnknownCompany);
  });

  it("digests the canonical company, not the string that was typed", async () => {
    // Two callers who spell Stripe differently asked the same question.
    const [a, b] = await Promise.all([ask({ company: "Stripe" }), ask({ company: "stripe, inc." })]);
    expect(a.request_digest).toBe(b.request_digest);
  });

  it("digests the deadline, because the deadline changes the answer", async () => {
    const [a, b] = await Promise.all([ask({ deadline_ms: 8000 }), ask({ deadline_ms: 900 })]);
    expect(a.request_digest).not.toBe(b.request_digest);
  });

  it("is byte-identical across runs, excluding the budget and the request id", async () => {
    const strip = (document: Awaited<ReturnType<typeof ask>>) => {
      const { budget: _budget, request_id: _id, ...rest } = document;
      return JSON.stringify(rest);
    };
    expect(strip(await ask())).toBe(strip(await ask()));
  });

  it("derives completeness rather than asserting it", async () => {
    // Ask only for what Tessellate is bound to, and the document is complete.
    const complete = await ask({ capabilities: ["attributes", "why_now"] });
    expect(complete.completeness).toBe("complete");

    // Ask for everything, and the unmapped capabilities make it partial.
    expect((await ask()).completeness).toBe("partial");

    // Ask only for what it is not bound to, and nothing answered.
    expect((await ask({ capabilities: ["signals"] })).completeness).toBe("none");
  });

  it("returns a well-formed document even when nothing resolved", async () => {
    const document = await ask({ capabilities: ["signals", "narrative"] });
    expect(document.completeness).toBe("none");
    expect(researchResponseSchema.safeParse(document).success).toBe(true);
    expect(document.capabilities.signals?.reason).toBe("unmapped");
  });
});

describe("the deprecated alias", () => {
  it("serves the old key as the same box as the new one", async () => {
    const document = await ask({ company: "Datadog" });
    const technographics = document.fields.technographics as Record<string, unknown>;
    expect(technographics.tech_stack).toBeDefined();
    // Same object, not a copy: they cannot drift into disagreeing.
    expect(technographics.tech_stack).toBe(technographics.technologies);
  });

  it("keeps the alias boxed on the unhappy path too", async () => {
    // Tessellate's technographics cascades, so the alias must alias a
    // `dependency_failed` box rather than vanishing.
    const document = await ask();
    const technographics = document.fields.technographics as Record<string, { reason: string }>;
    expect(technographics.tech_stack?.reason).toBe("dependency_failed");
  });

  it("announces itself in the body", async () => {
    const document = await ask();
    expect(document.deprecations).toEqual([
      {
        path: "fields.technographics.tech_stack",
        replacement: "fields.technographics.technologies",
        sunset: "2027-02-20",
      },
    ]);
  });
});

describe("the published schema", () => {
  it("marks the deprecated field deprecated", () => {
    const schema = jsonSchema();
    const technographics = (
      schema.response as unknown as {
        properties: { fields: { properties: { technographics: { properties: Record<string, { deprecated?: boolean }> } } } };
      }
    ).properties.fields.properties.technographics.properties;
    expect(technographics.tech_stack?.deprecated).toBe(true);
    expect(technographics.technologies?.deprecated).toBeUndefined();
  });

  it("publishes exactly the paths a document contains", async () => {
    const document = await ask();
    const actual = Object.entries(document.fields)
      .flatMap(([capability, map]) => Object.keys(map as object).map((key) => `fields.${capability}.${key}`))
      .sort();
    expect(actual).toEqual([...publishedFieldPaths()].sort());
  });

  it("defaults the request the way the contract says", () => {
    expect(researchRequestSchema.parse({ company: "Stripe" })).toEqual({
      company: "Stripe",
      deadline_ms: 8000,
      transport: "fixture",
      as_of: "2026-08-20",
    });
  });

  it("rejects a deadline outside the published range", () => {
    expect(researchRequestSchema.safeParse({ company: "Stripe", deadline_ms: 50 }).success).toBe(false);
    expect(researchRequestSchema.safeParse({ company: "Stripe", deadline_ms: 60000 }).success).toBe(false);
  });
});
