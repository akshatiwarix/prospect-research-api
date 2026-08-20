/**
 * Prints the coverage matrix by asking the live deployments, right now.
 *
 * This exists because the matrix in the README is a claim about the world and
 * claims about the world go stale. Running this is how a reader checks whether
 * the sparsity is still what the repo says it is.
 *
 *   npm run probe
 */
import { CAPABILITIES, CAPABILITY_IDS, resolvedDomain } from "@/lib/capabilities";
import { liveTransport } from "@/lib/transport";
import { ROSTER } from "@/data/roster";

const AS_OF = "2026-08-20";
const transport = liveTransport();

const symbols = { resolved: "●", unknown: "◐", absent: "○", unavailable: "✕", not_attempted: "·" };

console.log("Probing the live deployments. Day 008 rate-limits, so this is not fast.\n");

const header = ["company".padEnd(20), ...CAPABILITY_IDS.map((id) => id.slice(0, 6).padEnd(7))].join(" ");
console.log(header);
console.log("-".repeat(header.length));

const tally = new Map<string, number>();

for (const entry of ROSTER) {
  const cells: string[] = [];
  let domain: string | undefined;

  for (const id of CAPABILITY_IDS) {
    const capability = CAPABILITIES[id];
    const binding = entry.bindings[id];

    if (binding === undefined) {
      cells.push(symbols.not_attempted);
      tally.set("unmapped", (tally.get("unmapped") ?? 0) + 1);
      continue;
    }

    const parsed = capability.parseBinding(binding);
    const request = capability.buildRequest(parsed, { as_of: AS_OF, domain });
    if (request === null) {
      cells.push(symbols.not_attempted);
      tally.set("dependency_failed", (tally.get("dependency_failed") ?? 0) + 1);
      continue;
    }

    const key = capability.keyFor(parsed, { as_of: AS_OF, domain });
    const outcome = await transport.send({
      upstream: capability.upstream,
      path: request.path,
      body: request.body,
      upstreamKey: key,
      budget_ms: 25_000,
    });

    if (!outcome.ok) {
      cells.push(symbols.unavailable);
      tally.set(outcome.reason, (tally.get(outcome.reason) ?? 0) + 1);
      continue;
    }

    const boundary = capability.parseBoundary(outcome.body);
    if (!boundary.ok) {
      cells.push(symbols.unavailable);
      tally.set("boundary_violation", (tally.get("boundary_violation") ?? 0) + 1);
      continue;
    }

    const fields = capability.toFields(boundary.value, key);
    if (id === "identity") domain = resolvedDomain(fields);

    const states = Object.values(fields).map((box) => box.state);
    const cell = states.includes("resolved")
      ? symbols.resolved
      : states.includes("unknown")
        ? symbols.unknown
        : symbols.absent;
    cells.push(cell);
    tally.set("ok", (tally.get("ok") ?? 0) + 1);
  }

  console.log([entry.canonical_id.padEnd(20), ...cells.map((cell) => cell.padEnd(7))].join(" "));
}

console.log(`\n● resolved  ◐ unknown  ○ absent  ✕ unavailable  · not attempted\n`);
for (const [reason, count] of [...tally].sort((left, right) => right[1] - left[1])) {
  console.log(`${String(count).padStart(4)}  ${reason}`);
}
