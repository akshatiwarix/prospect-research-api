import { randomUUID } from "node:crypto";

import { researchRequestSchema } from "@/lib/schema";
import { UnknownCompany, research } from "@/lib/research";

/**
 * `POST /api/v1/research/stream` — the same document, arriving as it is built.
 *
 * Server-Sent Events on the Node runtime, which needs no special configuration
 * and no edge runtime. Three event types:
 *
 *   `open`        the canonical company and the request digest, before any I/O
 *   `capability`  one per capability as it settles, happy path or not
 *   `document`    the whole document, identical to what the non-streaming route
 *                 would have returned for the same request
 *
 * `capability` fires for `unmapped` and `dependency_failed` too. A stream that
 * only emitted successes would leave a client waiting for six events and
 * receiving two, with no way to tell "still working" from "never coming" — which
 * is the streaming version of exactly the ambiguity this whole repo is about.
 *
 * The terminal `document` is not a convenience. A client that assembled state
 * from the `capability` events alone would be reconstructing `completeness` and
 * the budget ledger itself, and two implementations of a derived value is one
 * too many.
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

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const document = await research(parsed.data, {
          request_id: randomUUID(),
          onOpen: (open) => send("open", open),
          onSettled: (id, summary) => send("capability", { capability: id, ...summary }),
        });

        send("document", document);
      } catch (error) {
        // A stream cannot retract its status code, so a failure that a
        // non-streaming caller would have seen as a 404 has to arrive as an
        // event. Naming that asymmetry is better than pretending SSE has the
        // same error surface as a plain response.
        send("error", {
          status: error instanceof UnknownCompany ? 404 : 500,
          error: error instanceof Error ? error.message : "unknown failure",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      connection: "keep-alive",
    },
  });
}
