import { randomUUID } from "node:crypto";

import { researchRequestSchema } from "@/lib/schema";
import { UnknownCompany, research } from "@/lib/research";
import { toCsv } from "@/lib/export/csv";

/**
 * `POST /api/v1/research/csv` — the same document, one row per field.
 *
 * A separate path rather than content negotiation on the main route. `Accept`
 * negotiation is more elegant and it is also how a caller ends up with CSV
 * because a proxy rewrote a header, so the format lives in the URL where it is
 * visible in a log.
 *
 * The request body is identical to the JSON route's, which matters more than it
 * looks: a caller who wants both formats sends the same bytes twice, and the two
 * responses describe the same document rather than two independently-fetched
 * ones.
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
      { error: issue ? `${issue.path.join(".") || "body"}: ${issue.message}` : "The body did not match the schema." },
      { status: 400 },
    );
  }

  try {
    const document = await research(parsed.data, { request_id: randomUUID() });
    return new Response(toCsv(document), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${document.company.canonical_id}-research.csv"`,
        "x-research-completeness": document.completeness,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof UnknownCompany) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
