import type { FieldReason, FieldState } from "@/lib/envelope";
import type { CapabilityId } from "@/lib/capabilities";
import type { FixtureRecord, FixtureStore } from "@/lib/transport";

import { FIXTURE_STORE, RECORDED_FIXTURES, mergeFixtures } from "./fixtures";

/**
 * Seven named scenarios, asserted by name.
 *
 * A test that says "some field should be unavailable" passes for the wrong
 * reason forever. These say *which* company, *which* capability, and *which*
 * state and reason — so when Day 013 changes its verdict for Stripe, scenario 2
 * fails and names itself instead of a count quietly moving.
 *
 * Five of the seven are **observed**: they assert what the live deployments
 * actually did when `scripts/record.mts` ran, and no override is involved. Two
 * are constructed, because no upstream currently misbehaves in the required way
 * and waiting for one to would be a strange test strategy. Which is which is
 * marked, because "this failure mode is real" and "this failure mode is
 * simulated" are different claims and collapsing them would be the sort of thing
 * this repo exists to object to.
 */

export type ScenarioExpectation = {
  capability: CapabilityId;
  /** A field key, or `undefined` to assert the capability summary itself. */
  path?: string;
  state: FieldState;
  reason: FieldReason;
};

export type Scenario = {
  id: string;
  title: string;
  /** What this scenario is evidence of. Printed in the console. */
  claim: string;
  provenance: "observed" | "constructed";
  company: string;
  deadline_ms?: number;
  capabilities?: readonly CapabilityId[];
  overrides?: readonly FixtureRecord[];
  expect: readonly ScenarioExpectation[];
};

export const SCENARIOS: readonly Scenario[] = [
  {
    id: "s1-tier0-timeout-cascade",
    title: "Tier 0 misses its slice, and the edge cascades",
    claim:
      "A capability that never ran says so with `dependency_failed` and names no upstream key, because naming one would imply an attempt that did not happen.",
    provenance: "constructed",
    company: "datadog",
    deadline_ms: 2000,
    // Day 013 answered Datadog in 1,015ms. Making it slow enough to blow an
    // 800ms tier-0 slice needs a number, not a broken upstream.
    overrides: [
      { upstream: "domain_detective", key: "Datadog", latency_ms: 9000, origin: "authored", body: {} },
    ],
    expect: [
      { capability: "identity", state: "unavailable", reason: "timeout" },
      { capability: "technographics", state: "not_attempted", reason: "dependency_failed" },
    ],
  },
  {
    id: "s2-contested-identity",
    title: "Three surviving domains is not a domain",
    claim:
      "Day 013 returns `ambiguous` for Stripe with three survivors. The domain is `unknown` and the dependent capability cascades — no precedence rule picks a winner.",
    provenance: "observed",
    company: "stripe",
    expect: [
      { capability: "identity", path: "domain", state: "unknown", reason: "ok" },
      { capability: "technographics", state: "not_attempted", reason: "dependency_failed" },
    ],
  },
  {
    id: "s3-upstream-error",
    title: "A real 404 from a real deployment",
    claim:
      "Day 006's `POST /api/brief` answers `404 text/html` today. Status is classified before the body is read, so this is `upstream_error` and not a boundary violation — the payload is not at fault for a routing problem.",
    provenance: "observed",
    company: "ledgerloop",
    // The recorded half only, so the authored healthy brief does not mask it.
    overrides: [],
    expect: [{ capability: "narrative", state: "unavailable", reason: "upstream_error" }],
  },
  {
    id: "s4-slow-but-inside-budget",
    title: "Slow, and therefore expensive, and therefore reported",
    claim:
      "Day 005 took 1,860ms for Loudwave Labs. It resolves, and the budget ledger shows what it cost — the point of returning the accounting rather than only the answer.",
    provenance: "observed",
    company: "loudwave-labs",
    expect: [{ capability: "signals", state: "resolved", reason: "ok" }],
  },
  {
    id: "s5-three-flavours-of-answer",
    title: "Absent, unknown and resolved in one document, none averaged",
    claim:
      "Tessellate is the one name two upstreams share. Day 013 has never heard of it, so its domain is `absent` — an affirmative finding — while its legal name is `unknown` for want of an entity, and Day 014 resolves all five attributes. Three different kinds of answer, side by side, none collapsed into the others.",
    provenance: "observed",
    company: "tessellate",
    expect: [
      { capability: "identity", path: "domain", state: "absent", reason: "ok" },
      { capability: "identity", path: "legal_name", state: "unknown", reason: "ok" },
      { capability: "attributes", path: "segment", state: "resolved", reason: "ok" },
      { capability: "technographics", state: "not_attempted", reason: "dependency_failed" },
      { capability: "signals", state: "not_attempted", reason: "unmapped" },
    ],
  },
  {
    id: "s6-boundary-violation",
    title: "A 200 that answered something else",
    claim:
      "A success status carrying a body the boundary schema rejects is `boundary_violation`, and the key is named because the request was sent. It is not a throw, and it does not take the other capabilities down with it.",
    provenance: "constructed",
    company: "meridianflow",
    overrides: [
      {
        upstream: "company_classifier",
        key: "meridianflow",
        latency_ms: 300,
        origin: "authored",
        body: { classification: { companyId: "meridianflow" } },
      },
    ],
    expect: [{ capability: "attributes", state: "unavailable", reason: "boundary_violation" }],
  },
  {
    id: "s7-html-from-a-json-endpoint",
    title: "HTML with a 200 on it",
    claim:
      "Day 006 serves HTML on a 404 today, which the status mapping catches. The nastier version — HTML behind a 200 — has to be caught by the boundary schema, and is.",
    provenance: "constructed",
    company: "cadence-freight",
    overrides: [
      {
        upstream: "account_brief",
        key: "c02",
        latency_ms: 150,
        origin: "authored",
        body: "<!DOCTYPE html><html><body>Not found</body></html>",
      },
    ],
    expect: [{ capability: "narrative", state: "unavailable", reason: "boundary_violation" }],
  },
];

/**
 * The store a scenario runs against.
 *
 * Overrides win, then recordings, then authored fills the rest. Scenario 3 passes
 * an empty override array on purpose: that is how it opts out of the authored
 * healthy brief and asserts against what the deployment really does.
 */
export function storeFor(scenario: Scenario): FixtureStore {
  return scenario.overrides === undefined
    ? FIXTURE_STORE
    : mergeFixtures(scenario.overrides, RECORDED_FIXTURES);
}

export function scenario(id: string): Scenario {
  const found = SCENARIOS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`no scenario '${id}'`);
  return found;
}
