import { CAPABILITIES, CAPABILITY_IDS } from "@/lib/capabilities";
import { ROSTER } from "@/data/roster";
import { UPSTREAM_ORIGIN } from "@/data/upstreams";

/**
 * `GET /api/v1/directory` — the coverage matrix, published.
 *
 * Not in the original plan, and added for two reasons that turned out to be the
 * same reason.
 *
 * The console has to render the matrix, and the console is not allowed to read
 * `data/roster.ts` directly — it is a client of this API with no privileges, and
 * importing the directory into a component would make that a slogan. So the
 * matrix needs an endpoint.
 *
 * And a caller deciding whether to request `signals` needs exactly this before
 * they send a single research request. Coverage discovered one disappointing
 * account at a time is how every enrichment integration accumulates folklore;
 * publishing the sparse truth up front is the alternative, and it is cheap.
 *
 * `bound` is a boolean per capability rather than the binding itself. The
 * bindings contain whole request payloads — Day 005's observations run to
 * kilobytes — and more to the point they are this service's business, not the
 * caller's.
 */
export async function GET(): Promise<Response> {
  return Response.json(
    {
      capabilities: CAPABILITY_IDS.map((id) => ({
        id,
        upstream: CAPABILITIES[id].upstream,
        shipped_by: `${UPSTREAM_ORIGIN[CAPABILITIES[id].upstream].day} \`${UPSTREAM_ORIGIN[CAPABILITIES[id].upstream].repo}\``,
        tier: CAPABILITIES[id].tier,
        depends_on: CAPABILITIES[id].dependsOn,
      })),
      companies: ROSTER.map((entry) => ({
        canonical_id: entry.canonical_id,
        name: entry.name,
        origin: entry.origin,
        known_to: entry.known_to,
        bound: Object.fromEntries(CAPABILITY_IDS.map((id) => [id, entry.bindings[id] !== undefined])),
        // The count nobody publishes. 2-of-6 is the ceiling for a real company,
        // because binding the other four would mean authoring evidence about an
        // identifiable third party.
        bound_count: CAPABILITY_IDS.filter((id) => entry.bindings[id] !== undefined).length,
      })),
      note:
        "Coverage is sparse because the five upstream corpora are disjoint. Exactly one company name appears in two of them. This is the condition of a real GTM stack, not a gap in the demo.",
    },
    { headers: { "cache-control": "public, max-age=300" } },
  );
}
