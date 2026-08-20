/**
 * The streaming consumer, in twenty lines.
 *
 * Prints each capability the moment it settles, then the completeness. Worth
 * running against the live transport, where the ordering is real: the unmapped
 * capabilities land instantly because nothing is sent, and the slow upstream
 * arrives a second and a half later.
 *
 *   npm run example:stream -- http://localhost:3000 datadog live
 */
import { createClient } from "@/lib/client";

const [baseUrl = "http://localhost:3000", company = "tessellate", transport = "fixture"] = process.argv.slice(2);
const client = createClient({ baseUrl });

for await (const event of client.stream({ company, transport: transport as "fixture" | "live" })) {
  if (event.type === "open") {
    console.log(`${event.company.canonical_id}  digest ${event.request_digest.slice(0, 12)}`);
  } else if (event.type === "capability") {
    const elapsed = event.elapsed_ms === undefined ? "" : ` ${event.elapsed_ms}ms`;
    console.log(`  ${event.capability.padEnd(16)} ${event.state}/${event.reason}${elapsed}`);
  } else if (event.type === "document") {
    console.log(`\n${event.document.completeness} — ${event.document.budget.elapsed_ms}ms of ${event.document.budget.granted_ms}ms`);
  } else {
    console.log(`error ${event.status}: ${event.error}`);
  }
}
