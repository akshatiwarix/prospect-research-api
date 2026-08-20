/**
 * Records the live upstreams into `data/fixtures/recorded.json`.
 *
 * Fixtures in this repo are **recordings**, not inventions, wherever a recording
 * is obtainable. That distinction is the difference between a test suite that
 * proves the boundary schemas match reality and one that proves they match my
 * memory of reality — and the `verified` verdict bug, where this code read
 * `survivors[0]` for a shape that carries `domain`, is exactly what the second
 * kind of suite happily ships.
 *
 * Every record carries `origin: "recorded"` and the date it was taken. Anything
 * the network cannot produce — Day 006's brief, which 404s — is authored
 * separately in `authored.ts` and says so.
 *
 * Day 008 rate-limits to six requests a minute, so technographics recording is
 * spaced out. This script takes a few minutes and is meant to.
 *
 *   npx vite-node -c vitest.config.mts scripts/record.mts
 */
import { writeFileSync } from "node:fs";

import { CAPABILITIES } from "@/lib/capabilities";
import { liveTransport } from "@/lib/transport";
import { ROSTER } from "@/data/roster";
import { UPSTREAM_HOSTS } from "@/data/upstreams";

const AS_OF = "2026-08-20";
const TECHNOGRAPHICS_SPACING_MS = 11_000;

type Recorded = {
  upstream: keyof typeof UPSTREAM_HOSTS;
  key: string;
  latency_ms: number;
  origin: "recorded";
  recorded_at: string;
  body?: unknown;
  failure?: { reason: string; retry_after_s?: number; detail: string };
};

const transport = liveTransport();
const out: Recorded[] = [];
const seen = new Set<string>();

async function record(
  capabilityId: keyof typeof CAPABILITIES,
  binding: unknown,
  context: { as_of: string; domain?: string },
): Promise<unknown> {
  const capability = CAPABILITIES[capabilityId];
  const parsed = capability.parseBinding(binding);
  const request = capability.buildRequest(parsed, context);
  if (!request) return undefined;

  const key = capability.keyFor(parsed, context);
  const id = `${capability.upstream}:${key}`;
  if (seen.has(id)) return undefined;
  seen.add(id);

  const outcome = await transport.send({
    upstream: capability.upstream,
    path: request.path,
    body: request.body,
    upstreamKey: key,
    budget_ms: 25_000,
  });

  const base = {
    upstream: capability.upstream,
    key,
    latency_ms: outcome.elapsed_ms,
    origin: "recorded" as const,
    recorded_at: AS_OF,
  };

  if (outcome.ok) {
    out.push({ ...base, body: outcome.body });
    const boundary = capability.parseBoundary(outcome.body);
    console.log(`  ok   ${id} ${outcome.elapsed_ms}ms ${boundary.ok ? "" : `(boundary: ${boundary.issue})`}`);
    return boundary.ok ? boundary.value : undefined;
  }

  out.push({
    ...base,
    failure: { reason: outcome.reason, retry_after_s: outcome.retry_after_s, detail: outcome.detail },
  });
  console.log(`  fail ${id} ${outcome.reason} — ${outcome.detail}`);
  return undefined;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

console.log(`Recording ${ROSTER.length} roster entries against the live deployments.\n`);

// Tier 0 first, so tier-1 technographics has a domain to ask about.
const domains = new Map<string, string>();
for (const entry of ROSTER) {
  if (entry.bindings.identity === undefined) continue;
  console.log(entry.canonical_id);
  const parsed = await record("identity", entry.bindings.identity, { as_of: AS_OF });
  if (parsed) {
    const fields = CAPABILITIES.identity.toFields(parsed, String(entry.bindings.identity));
    const box = fields.domain;
    if (box?.state === "resolved" && typeof box.value === "string") domains.set(entry.canonical_id, box.value);
  }
}

console.log("\nTier 1 (technographics is spaced for Day 008's six-per-minute limit).\n");
let first = true;
for (const entry of ROSTER) {
  const domain = domains.get(entry.canonical_id);
  if (entry.bindings.technographics === undefined || domain === undefined) continue;
  if (!first) await sleep(TECHNOGRAPHICS_SPACING_MS);
  first = false;
  console.log(`${entry.canonical_id} (${domain})`);
  await record("technographics", entry.bindings.technographics, { as_of: AS_OF, domain });
}

for (const entry of ROSTER) {
  for (const capabilityId of ["attributes", "why_now", "signals", "narrative"] as const) {
    const binding = entry.bindings[capabilityId];
    if (binding === undefined) continue;
    console.log(entry.canonical_id);
    await record(capabilityId, binding, { as_of: AS_OF });
  }
}

out.sort((left, right) => `${left.upstream}:${left.key}`.localeCompare(`${right.upstream}:${right.key}`));
writeFileSync("data/fixtures/recorded.json", `${JSON.stringify(out, null, 1)}\n`);
console.log(`\n${out.length} records written to data/fixtures/recorded.json`);
