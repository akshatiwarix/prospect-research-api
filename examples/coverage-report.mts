/**
 * Consumer #2, and the evidence that "reusable" is not just an adjective.
 *
 * The console is consumer #1. This is a second, independent one, and it imports
 * exactly one thing from this repository — `lib/client`, which is itself nothing
 * but `fetch` and the published types. It reads no fixture, no roster, no
 * scheduler. Everything it knows it learned from `GET /api/v1/directory` and
 * `POST /api/v1/research`.
 *
 * What it produces is the report a team would actually want before wiring this
 * into anything: for every company in the directory, how much of the requested
 * research came back, and *why* the rest did not. Notice that the answer is
 * computable at all — that is the whole argument. Against a conventional
 * enrichment API returning flat objects, "why is this field empty" is not a
 * question the response can answer, so a script like this cannot be written.
 *
 *   npm run example:coverage                       # against localhost:3000
 *   npm run example:coverage -- https://host live  # against a deployment, live
 */
import { createClient, type CapabilityId, type FieldReason } from "@/lib/client";

const [baseUrl = "http://localhost:3000", transport = "fixture"] = process.argv.slice(2);
const client = createClient({ baseUrl });

const directory = (await client.directory()) as {
  capabilities: Array<{ id: CapabilityId }>;
  companies: Array<{ canonical_id: string; bound_count: number }>;
};

const capabilities = directory.capabilities.map((capability) => capability.id);
const reasons = new Map<FieldReason, number>();
const rows: Array<{ company: string; completeness: string; resolved: number; total: number; spent: number }> = [];

console.log(`${directory.companies.length} companies, ${capabilities.length} capabilities, transport=${transport}\n`);

for (const company of directory.companies) {
  const document = await client.research({
    company: company.canonical_id,
    capabilities,
    transport: transport as "fixture" | "live",
  });

  let resolved = 0;
  let total = 0;

  for (const map of Object.values(document.fields)) {
    for (const box of Object.values(map)) {
      total += 1;
      if (box.state === "resolved") resolved += 1;
      reasons.set(box.reason, (reasons.get(box.reason) ?? 0) + 1);
    }
  }

  rows.push({
    company: company.canonical_id,
    completeness: document.completeness,
    resolved,
    total,
    spent: document.budget.elapsed_ms,
  });
}

console.log("company".padEnd(20), "completeness".padEnd(13), "resolved".padStart(9), "spent".padStart(8));
console.log("-".repeat(53));
for (const row of rows) {
  console.log(
    row.company.padEnd(20),
    row.completeness.padEnd(13),
    `${row.resolved}/${row.total}`.padStart(9),
    `${row.spent}ms`.padStart(8),
  );
}

console.log("\nWhy fields are not resolved — the question a flat enrichment response cannot answer:\n");
for (const [reason, count] of [...reasons].sort((left, right) => right[1] - left[1])) {
  console.log(`${String(count).padStart(6)}  ${reason}`);
}

const unmapped = reasons.get("unmapped") ?? 0;
const total = [...reasons.values()].reduce((sum, count) => sum + count, 0);
console.log(
  `\n${Math.round((unmapped / total) * 100)}% of all fields are unmapped — no binding exists for that company on ` +
    `that upstream. Retrying will never fix those, and a response that said only "null" would have had you retrying ` +
    `them forever.`,
);
