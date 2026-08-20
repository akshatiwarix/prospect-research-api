import { DEPRECATIONS, jsonSchema, sunsetHeader } from "@/lib/schema";
import { CAPABILITIES, CAPABILITY_IDS } from "@/lib/capabilities";
import { UPSTREAM_ORIGIN } from "@/data/upstreams";

/**
 * `GET /api/schema` — the contract, generated from the same zod schemas the
 * research route validates with.
 *
 * Generated rather than written, which is the only version of "we publish our
 * schema" that means anything. A hand-maintained schema document is a second
 * source of truth, and a second source of truth for a contract is just a
 * changelog of the moment someone forgot.
 *
 * Also serves the capability catalogue — which upstream each capability calls,
 * which day shipped it, and what it contributes — because a caller deciding
 * whether to request `signals` needs to know it is Day 005's board engine before
 * they can reason about coverage at all.
 *
 * Keyless, uncached, unlimited. It is a serialisation of constants.
 */
export async function GET(): Promise<Response> {
  const sunset = DEPRECATIONS[0]?.sunset;

  return Response.json(
    {
      ...jsonSchema(),
      capabilities: CAPABILITY_IDS.map((id) => {
        const capability = CAPABILITIES[id];
        const origin = UPSTREAM_ORIGIN[capability.upstream];
        return {
          id,
          upstream: capability.upstream,
          shipped_by: `${origin.day} \`${origin.repo}\``,
          tier: capability.tier,
          depends_on: capability.dependsOn,
          contributes: capability.contributes,
        };
      }),
      deprecations: DEPRECATIONS,
    },
    {
      headers: {
        // RFC 8594. Announced here as well as in the body, because a client
        // generator reads the schema and a monitoring tool reads the headers, and
        // neither should have to read the other's channel.
        ...(sunset ? { sunset: sunsetHeader(sunset), deprecation: sunsetHeader(sunset) } : {}),
        "cache-control": "public, max-age=300",
      },
    },
  );
}
