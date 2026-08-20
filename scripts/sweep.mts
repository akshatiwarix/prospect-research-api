/**
 * The sweep. Eight invariants over the full cross-product, no network.
 *
 * This is not a slower `npm test`. Unit tests assert behaviour at points the
 * author thought of; the sweep asserts properties that must hold everywhere, and
 * two of them — budget monotonicity and the derivability of `completeness` — are
 * false in ways no single test case would catch. It runs before the console
 * exists, on purpose: Day 007's sweep found a real visibility bug before its UI
 * did, and debugging an envelope through pixels is a bad afternoon.
 *
 *   npm run sweep
 */
import {
  anyFieldSchema,
  collectFields,
  deriveCompleteness,
  findNakedValues,
  REASON_SENT,
  type FieldReason,
  type FieldState,
} from "@/lib/envelope";
import { CAPABILITIES, CAPABILITY_IDS, type CapabilityId } from "@/lib/capabilities";
import { fixtureTransport, virtualClock } from "@/lib/transport";
import { publishedFieldPaths, researchRequestSchema, researchResponseSchema } from "@/lib/schema";
import { research } from "@/lib/research";
import { FIXTURE_STORE, RECORDED_FIXTURES } from "@/data/fixtures";
import { ROSTER, rosterEntry } from "@/data/roster";
import { SCENARIOS, VOCABULARY_PROBES, probeStore, storeFor } from "@/data/scenarios";

const AS_OF = "2026-08-20";
const REQUEST_ID = "sweep";
const DEADLINES = [200, 600, 1500, 4000, 8000, 30000];

/** All 64 subsets. A capability's behaviour must not depend on its company. */
const SUBSETS: CapabilityId[][] = [];
for (let mask = 1; mask < 1 << CAPABILITY_IDS.length; mask += 1) {
  SUBSETS.push(CAPABILITY_IDS.filter((_, index) => (mask & (1 << index)) !== 0));
}

/**
 * The document's field tree is inferred from a schema whose leaves carry
 * refinements, so `z.infer` widens them to `{}` and every read needs a
 * narrowing. Doing that once, here, beats scattering casts through the
 * invariants — and the runtime shape is guaranteed by invariant 2, which
 * validates every box against `anyFieldSchema` before anything reads one.
 */
type Box = { state: FieldState; reason: FieldReason; value?: unknown; retry_after_s?: number };

function boxAt(fields: Record<string, Record<string, unknown>>, capability: string, key: string): Box | undefined {
  return fields[capability]?.[key] as Box | undefined;
}

const failures: string[] = [];
const fail = (invariant: string, detail: string) => failures.push(`[${invariant}] ${detail}`);

const transport = fixtureTransport(FIXTURE_STORE);
const states = new Map<string, number>();
let documents = 0;

const ask = (company: string, capabilities: CapabilityId[], deadline_ms: number) =>
  research(
    researchRequestSchema.parse({ company, capabilities, deadline_ms, as_of: AS_OF, transport: "fixture" }),
    { request_id: REQUEST_ID, transport, clock: virtualClock() },
  );

console.log(
  `Sweeping ${ROSTER.length} companies x ${SUBSETS.length} capability subsets x ${DEADLINES.length} deadlines ` +
    `= ${ROSTER.length * SUBSETS.length * DEADLINES.length} documents.\n`,
);

const published = new Set(publishedFieldPaths());

for (const entry of ROSTER) {
  for (const subset of SUBSETS) {
    // Invariant 5 needs the deadlines walked in order, per company and subset.
    let previouslyResolved = new Set<string>();

    for (const deadline of DEADLINES) {
      const document = await ask(entry.canonical_id, subset, deadline);
      documents += 1;

      // ── 1. No naked values ───────────────────────────────────────────────
      const naked = findNakedValues(document.fields);
      if (naked.length > 0) {
        fail("1 no-naked-values", `${entry.canonical_id} @${deadline}ms: ${naked[0]?.path}`);
      }

      const boxes = collectFields(document.fields);

      for (const { path, field } of boxes) {
        // ── 2. State/reason legality ───────────────────────────────────────
        const parsed = anyFieldSchema.safeParse(field);
        if (!parsed.success) {
          fail("2 legality", `${path}: ${field.state}/${field.reason} — ${parsed.error.issues[0]?.message}`);
        }
        if (REASON_SENT.has(field.reason) !== (field.upstream_key !== undefined)) {
          fail("2 legality", `${path}: upstream_key disagrees with reason '${field.reason}'`);
        }
        if (field.retry_after_s !== undefined && field.reason !== "upstream_rate_limited") {
          fail("2 legality", `${path}: retry_after_s under '${field.reason}'`);
        }

        // ── 8. Nothing outside the published schema ────────────────────────
        if (!published.has(path.replace(/^fields\./, "fields."))) {
          fail("8 published-only", `${path} is not in /api/schema`);
        }

        states.set(`${field.state}/${field.reason}`, (states.get(`${field.state}/${field.reason}`) ?? 0) + 1);
      }

      // ── 3. The dependency edge ───────────────────────────────────────────
      const technographics = document.capabilities.technographics;
      if (technographics?.reason === "ok") {
        const domain = boxAt(document.fields, "identity", "domain");
        if (domain?.state !== "resolved") {
          fail(
            "3 dependency-edge",
            `${entry.canonical_id} @${deadline}ms: technographics ran without a resolved domain`,
          );
        }
      }

      // ── 6. Completeness is derived ───────────────────────────────────────
      const derived = deriveCompleteness(document.capabilities);
      if (derived !== document.completeness) {
        fail("6 completeness", `${entry.canonical_id} @${deadline}ms: says ${document.completeness}, derives ${derived}`);
      }

      // The published response schema, which enforces both of the above again
      // from the outside.
      const shape = researchResponseSchema.safeParse(document);
      if (!shape.success) {
        fail("6 completeness", `${entry.canonical_id} @${deadline}ms: ${shape.error.issues[0]?.message}`);
      }

      // ── 5. Budget monotonicity ───────────────────────────────────────────
      const resolvedNow = new Set(
        boxes.filter(({ field }) => field.state === "resolved").map(({ path }) => path),
      );
      for (const path of previouslyResolved) {
        if (!resolvedNow.has(path)) {
          fail(
            "5 monotonicity",
            `${entry.canonical_id} [${subset.join("+")}]: ${path} un-resolved when the budget rose to ${deadline}ms`,
          );
        }
      }
      previouslyResolved = resolvedNow;
    }
  }
}

// ── 4. Determinism ───────────────────────────────────────────────────────────
// Same digest, byte-identical document, excluding the two fields the claim
// excludes. Run against a fresh transport each time so no memoisation inside the
// fixture store could be doing the work.
const strip = (document: object) =>
  JSON.stringify(Object.fromEntries(Object.entries(document).filter(([key]) => key !== "budget" && key !== "request_id")));

for (const entry of ROSTER) {
  const runs = await Promise.all(
    [0, 1, 2].map(() =>
      research(
        researchRequestSchema.parse({
          company: entry.canonical_id,
          deadline_ms: 8000,
          as_of: AS_OF,
          transport: "fixture",
        }),
        { request_id: REQUEST_ID, transport: fixtureTransport(FIXTURE_STORE), clock: virtualClock() },
      ),
    ),
  );

  const digests = new Set(runs.map((run) => run.request_digest));
  if (digests.size !== 1) fail("4 determinism", `${entry.canonical_id}: digest varies across identical requests`);

  const bodies = new Set(runs.map(strip));
  if (bodies.size !== 1) fail("4 determinism", `${entry.canonical_id}: document varies across identical requests`);

  const ledgers = new Set(runs.map((run) => JSON.stringify(run.budget)));
  if (ledgers.size !== 1) {
    fail("4 determinism", `${entry.canonical_id}: the budget ledger varies, which the virtual clock should prevent`);
  }
}

// ── 7. Tolerant read, strict require ─────────────────────────────────────────
for (const record of RECORDED_FIXTURES) {
  if (record.body === undefined) continue;
  const capability = Object.values(CAPABILITIES).find((candidate) => candidate.upstream === record.upstream);
  if (!capability) continue;

  const asIs = capability.parseBoundary(record.body);
  if (!asIs.ok) {
    fail("7 boundary", `${record.upstream}:${record.key} recorded body fails its own schema — ${asIs.issue}`);
    continue;
  }

  // Additive change must not break anything.
  const augmented = { ...(record.body as object), someFutureKey: { deeply: ["nested", 1, null] } };
  if (!capability.parseBoundary(augmented).ok) {
    fail("7 boundary", `${record.upstream}:${record.key} rejects an unrecognised key`);
  }

  // A missing required key must be reported, not tolerated. Dropping every key
  // in turn finds any that is declared required but not actually enforced.
  for (const key of Object.keys(record.body as object)) {
    const reduced = Object.fromEntries(Object.entries(record.body as object).filter(([name]) => name !== key));
    const outcome = capability.parseBoundary(reduced);
    if (outcome.ok) continue; // Optional. Fine.
    if (!outcome.issue.includes(key) && !outcome.issue.includes("body")) {
      fail("7 boundary", `${record.upstream}:${record.key} dropping '${key}' reported '${outcome.issue}'`);
    }
  }
}

// ── The seven named scenarios ────────────────────────────────────────────────
console.log("Named scenarios\n");
for (const scenario of SCENARIOS) {
  const entry = rosterEntry(scenario.company);
  if (!entry) {
    fail("scenario", `${scenario.id}: no roster entry '${scenario.company}'`);
    continue;
  }

  const document = await research(
    researchRequestSchema.parse({
      company: entry.canonical_id,
      deadline_ms: scenario.deadline_ms ?? 8000,
      ...(scenario.capabilities ? { capabilities: scenario.capabilities } : {}),
      as_of: AS_OF,
      transport: "fixture",
    }),
    { request_id: REQUEST_ID, transport: fixtureTransport(storeFor(scenario)), clock: virtualClock() },
  );

  const problems: string[] = [];
  for (const expectation of scenario.expect) {
    const actual: Box | undefined = expectation.path
      ? boxAt(document.fields, expectation.capability, expectation.path)
      : document.capabilities[expectation.capability];

    if (!actual) {
      problems.push(`${expectation.capability}.${expectation.path ?? "*"} is missing`);
      continue;
    }
    if (actual.state !== expectation.state || actual.reason !== expectation.reason) {
      problems.push(
        `${expectation.capability}.${expectation.path ?? "*"}: got ${actual.state}/${actual.reason}, expected ${expectation.state}/${expectation.reason}`,
      );
    }
  }

  const mark = problems.length === 0 ? "ok  " : "FAIL";
  console.log(`  ${mark} ${scenario.id.padEnd(30)} ${scenario.provenance}`);
  for (const problem of problems) fail(`scenario ${scenario.id}`, problem);
}

// ── Vocabulary coverage ──────────────────────────────────────────────────────
// Proves every reason is producible. Kept separate from the named scenarios
// because "this failure mode is real" and "this failure mode is expressible" are
// different claims.
console.log("\nVocabulary probes\n");
const probedReasons = new Set<string>();
for (const probe of VOCABULARY_PROBES) {
  const document = await research(
    researchRequestSchema.parse({
      company: probe.company,
      deadline_ms: probe.deadline_ms ?? 8000,
      as_of: AS_OF,
      transport: "fixture",
    }),
    { request_id: REQUEST_ID, transport: fixtureTransport(probeStore(probe)), clock: virtualClock() },
  );

  const actual: Box | undefined = probe.expect.path
    ? boxAt(document.fields, probe.expect.capability, probe.expect.path)
    : document.capabilities[probe.expect.capability];

  const ok = actual?.state === probe.expect.state && actual?.reason === probe.expect.reason;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${probe.reason.padEnd(24)} via ${probe.company}`);
  if (!ok) {
    fail(
      `probe ${probe.reason}`,
      `${probe.expect.capability}: got ${actual?.state}/${actual?.reason}, expected ${probe.expect.state}/${probe.expect.reason}`,
    );
  } else {
    probedReasons.add(probe.reason);
  }

  // The rate-limit probe also has to prove Retry-After survives the trip.
  if (probe.reason === "upstream_rate_limited") {
    const box = boxAt(document.fields, probe.expect.capability, "segment");
    if (box?.retry_after_s !== 37) {
      fail("probe upstream_rate_limited", `Retry-After did not reach the box (got ${String(box?.retry_after_s)})`);
    }
  }
}

// ── Report ───────────────────────────────────────────────────────────────────
console.log(`\n${documents.toLocaleString()} documents. State/reason pairs observed:\n`);
for (const [pair, count] of [...states].sort((left, right) => right[1] - left[1])) {
  console.log(`${String(count).padStart(8)}  ${pair}`);
}

// A closed vocabulary whose members nothing produces is not a vocabulary. The
// sweep is the only thing broad enough to notice.
const observedReasons = new Set([...states.keys()].map((pair) => pair.split("/")[1]));
const unreachedInSweep: string[] = [];
const unreachedAnywhere: string[] = [];
for (const reason of [
  "ok",
  "deadline",
  "dependency_failed",
  "unmapped",
  "upstream_error",
  "upstream_rate_limited",
  "upstream_unconfigured",
  "timeout",
  "boundary_violation",
  "excluded_by_caller",
]) {
  if (!observedReasons.has(reason)) unreachedInSweep.push(reason);
  if (!observedReasons.has(reason) && !probedReasons.has(reason)) unreachedAnywhere.push(reason);
}
if (unreachedInSweep.length > 0) {
  console.log(
    `\nProduced by no document in the cross-product, and covered by a probe instead: ${unreachedInSweep.join(", ")}`,
  );
}
if (unreachedAnywhere.length > 0) {
  // A reason nothing can produce is a claim to handle a case that is unhandled.
  fail("vocabulary", `no document or probe produces: ${unreachedAnywhere.join(", ")}`);
}

console.log("");
if (failures.length > 0) {
  console.log(`${failures.length} invariant failures:\n`);
  for (const failure of failures.slice(0, 40)) console.log(`  ${failure}`);
  if (failures.length > 40) console.log(`  ... and ${failures.length - 40} more`);
  process.exit(1);
}
console.log("All eight invariants hold, and every named scenario matches.");
