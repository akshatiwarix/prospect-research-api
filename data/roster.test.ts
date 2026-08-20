import { describe, expect, it } from "vitest";

import { CAPABILITIES, CAPABILITY_IDS } from "@/lib/capabilities";
import { fixtureTransport } from "@/lib/transport";
import { ROSTER, lookup, rosterEntry } from "./roster";
import { FIXTURE_STORE, RECORDED_FIXTURES, mergeFixtures } from "./fixtures";
import { AUTHORED_FIXTURES } from "./fixtures/authored";

describe("the directory", () => {
  it("has unique canonical ids", () => {
    const ids = ROSTER.map((entry) => entry.canonical_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("resolves a name, an id and an alias to the same entry", () => {
    expect(lookup("Stripe")).toMatchObject({ found: true, entry: { canonical_id: "stripe" } });
    expect(lookup("stripe")).toMatchObject({ found: true });
    expect(lookup("  STRIPE, INC. ")).toMatchObject({ found: true, matched_alias: "stripe, inc." });
  });

  it("misses rather than guessing", () => {
    // No stemming, no edit distance, no stripping of "Inc". A near-miss is a
    // miss, because research about the wrong company is worse than none.
    expect(lookup("Stripes")).toEqual({ found: false });
    expect(lookup("Strip")).toEqual({ found: false });
    expect(lookup("")).toEqual({ found: false });
  });

  it("keeps similar names apart", () => {
    // The exact pair a fuzzy join would merge: two different fictional companies
    // from two different upstream corpora.
    const northwind = lookup("Northwind");
    const freight = lookup("Northwind Freight");
    expect(northwind).toMatchObject({ found: true, entry: { canonical_id: "northwind" } });
    expect(freight).toMatchObject({ found: true, entry: { canonical_id: "northwind-freight" } });
    expect(rosterEntry("northwind")?.bindings.why_now).toBeUndefined();
    expect(rosterEntry("northwind-freight")?.bindings.identity).toBeUndefined();
  });

  it("only authors evidence about synthetic companies", () => {
    // The stated boundary: binding `signals` means shipping observations about a
    // company, and doing that for an identifiable real firm would be publishing
    // fabricated factual claims about a third party.
    for (const entry of ROSTER) {
      if (entry.origin !== "real") continue;
      expect(entry.bindings.signals, entry.canonical_id).toBeUndefined();
    }
  });

  it("has every binding parse against its capability's schema", () => {
    for (const entry of ROSTER) {
      for (const id of CAPABILITY_IDS) {
        const binding = entry.bindings[id];
        if (binding === undefined) continue;
        expect(() => CAPABILITIES[id].parseBinding(binding), `${entry.canonical_id}.${id}`).not.toThrow();
      }
    }
  });

  it("binds technographics wherever it binds identity, and nowhere else", () => {
    // The dependency edge is only meaningful if the dependent capability is
    // actually asked for. An identity binding without one would report
    // `unmapped` and never exercise the cascade.
    for (const entry of ROSTER) {
      expect(entry.bindings.technographics !== undefined, entry.canonical_id).toBe(
        entry.bindings.identity !== undefined,
      );
    }
  });
});

describe("the fixture store", () => {
  it("covers every binding the roster can actually reach", () => {
    // A missing fixture throws rather than degrading, so a hole here is a hole in
    // the sweep's coverage, not a runtime surprise.
    const keys = new Set(FIXTURE_STORE.map((record) => `${record.upstream}:${record.key}`));
    const missing: string[] = [];

    for (const entry of ROSTER) {
      for (const id of CAPABILITY_IDS) {
        const binding = entry.bindings[id];
        if (binding === undefined) continue;
        const capability = CAPABILITIES[id];
        const parsed = capability.parseBinding(binding);
        // technographics needs a domain, which only a scheduled run produces;
        // its coverage is asserted by the sweep instead.
        if (id === "technographics") continue;
        const key = capability.keyFor(parsed, { as_of: "2026-08-20" });
        if (!keys.has(`${capability.upstream}:${key}`)) missing.push(`${capability.upstream}:${key}`);
      }
    }

    expect(missing).toEqual([]);
  });

  it("builds without duplicates", () => {
    expect(() => fixtureTransport(FIXTURE_STORE)).not.toThrow();
  });

  it("lets recordings win over authored records", () => {
    // Both halves hold techstack_icp:northwind.example — a real 502 and an
    // authored success. If authored won, a careless addition here would replace
    // observed reality with a wish.
    const merged = mergeFixtures(RECORDED_FIXTURES, AUTHORED_FIXTURES);
    const record = merged.find((entry) => entry.upstream === "techstack_icp" && entry.key === "northwind.example");
    expect(record?.origin).toBe("recorded");
    expect(record?.failure?.reason).toBe("upstream_error");
  });

  it("labels every record with where it came from", () => {
    for (const record of FIXTURE_STORE) {
      expect(record.origin, `${record.upstream}:${record.key}`).toBeDefined();
    }
  });

  it("records exactly one of body or failure", () => {
    for (const record of FIXTURE_STORE) {
      expect((record.body === undefined) !== (record.failure === undefined)).toBe(true);
    }
  });
});
