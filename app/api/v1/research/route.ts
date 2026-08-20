import { randomUUID } from "node:crypto";

import { DEPRECATIONS, researchRequestSchema, sunsetHeader } from "@/lib/schema";
import { UnknownCompany, research } from "@/lib/research";
import { ROSTER } from "@/data/roster";

/**
 * `POST /api/v1/research` — the contract.
 *
 * ## Status discipline, which is the arguable part
 *
 * `200` for **any document this service successfully produced**, including one
 * where every single field is `not_attempted`. `4xx` only when the caller is
 * wrong. `5xx` only when this service itself failed to produce a document.
 *
 * `207` is the obvious objection and it is wrong twice over. It is WebDAV
 * multi-status, defined for a body of per-resource statuses, which this is not.
 * And more importantly it teaches the wrong lesson to the one audience that
 * matters: a retry loop. An upstream being down is not this service failing. A
 * truthful report of a degraded world *is* the successful outcome, and demoting
 * it to a non-2xx tells every client to retry a service that is working
 * perfectly — which, since four of the six upstreams are unmapped for most
 * companies, would mean retrying forever.
 *
 * `206` is a byte range. It is not available for borrowing.
 *
 * Partial success is signalled machine-readably twice — `completeness` in the
 * body and `X-Research-Completeness` in the headers — so a client can route on
 * it without parsing, and a proxy can log it.
 *
 * ## Why an unknown company is a 404 and not an empty document
 *
 * A directory miss means this service does not know which company the caller
 * means. Returning a document full of `unmapped` would be answering a question
 * nobody asked about a company that may not exist. The lookup is exact — no
 * stemming, no edit distance — so "Stripes" is a miss rather than a Stripe.
 *
 * Keyless and unrated. Every path through it is either a lookup in a bundled
 * directory or a call to a public sibling deployment.
 */
export async function POST(request: Request): Promise<Response> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "The request body is not JSON." }, { status: 400 });
  }

  const parsed = researchRequestSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return Response.json(
      {
        // The offending path verbatim, so a rejected request is fixable rather
        // than mysterious.
        error: issue ? `${issue.path.join(".") || "body"}: ${issue.message}` : "The body did not match the schema.",
      },
      { status: 400 },
    );
  }

  try {
    const document = await research(parsed.data, { request_id: randomUUID() });
    const sunset = DEPRECATIONS[0]?.sunset;

    return Response.json(document, {
      headers: {
        "x-research-completeness": document.completeness,
        ...(sunset ? { sunset: sunsetHeader(sunset), deprecation: sunsetHeader(sunset) } : {}),
        // Deliberately uncached. The live transport's answer changes with the
        // health of six deployments, and a cache header would invite a proxy to
        // serve a stale account of a world that has since recovered.
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof UnknownCompany) {
      return Response.json(
        {
          error: error.message,
          // A miss is actionable if the caller can see the directory.
          known_companies: ROSTER.map((entry) => entry.canonical_id),
        },
        { status: 404 },
      );
    }
    throw error;
  }
}
