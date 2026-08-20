/**
 * The typed client.
 *
 * Deliberately thin, and deliberately dependency-free: `fetch`, the published
 * types, and nothing else. A client that wrapped the states in helpers —
 * `isResolved()`, `valueOr(default)` — would be doing the caller a disservice,
 * because `valueOr` is precisely the function that throws away the distinction
 * this whole service exists to preserve. The states are the product; a client
 * whose job is to hide them is working against it.
 *
 * What it does provide is the one thing worth centralising: knowing that a `200`
 * can still be a degraded document, so `research()` resolves rather than throws
 * on partial success, and `unmapped` is not an error.
 */

export type FieldState = "resolved" | "unknown" | "absent" | "not_attempted" | "unavailable";

export type FieldReason =
  | "ok"
  | "deadline"
  | "dependency_failed"
  | "unmapped"
  | "upstream_error"
  | "upstream_unconfigured"
  | "upstream_rate_limited"
  | "timeout"
  | "boundary_violation"
  | "excluded_by_caller";

export type Field<T = unknown> = {
  value?: T;
  state: FieldState;
  reason: FieldReason;
  capability: string;
  upstream_key?: string;
  observed_at?: string;
  retry_after_s?: number;
};

export type CapabilityId = "identity" | "technographics" | "attributes" | "why_now" | "signals" | "narrative";

export type ResearchDocument = {
  schema_version: string;
  request_id: string;
  request_digest: string;
  company: { canonical_id: string; input: string; matched_alias?: string };
  completeness: "complete" | "partial" | "none";
  transport: "fixture" | "live";
  fields: Record<CapabilityId, Record<string, Field>>;
  capabilities: Record<CapabilityId, { state: FieldState; reason: FieldReason; elapsed_ms?: number; upstream_key?: string }>;
  budget: { granted_ms: number; tier0_slice_ms: number; remaining_after_tier0_ms: number; elapsed_ms: number };
  deprecations: Array<{ path: string; replacement: string; sunset: string }>;
};

export type ResearchInput = {
  company: string;
  deadline_ms?: number;
  capabilities?: CapabilityId[];
  transport?: "fixture" | "live";
  as_of?: string;
};

export class ResearchError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export type ClientOptions = { baseUrl?: string; fetch?: typeof fetch };

export function createClient(options: ClientOptions = {}) {
  const baseUrl = (options.baseUrl ?? "").replace(/\/$/, "");
  const doFetch = options.fetch ?? fetch;

  const post = async (path: string, input: ResearchInput) => {
    const response = await doFetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      // Only a caller error or a genuine service failure gets here. A document
      // where nothing resolved is a 200, and the client must not turn it into an
      // exception — that would teach every consumer's retry loop to hammer a
      // service that is working correctly.
      const body: unknown = await response.json().catch(() => null);
      const message =
        body !== null && typeof body === "object" && "error" in body
          ? String((body as { error: unknown }).error)
          : `${response.status}`;
      throw new ResearchError(response.status, message);
    }

    return response;
  };

  return {
    /** The document. Resolves for `complete`, `partial` and `none` alike. */
    research: async (input: ResearchInput): Promise<ResearchDocument> =>
      (await post("/api/v1/research", input)).json() as Promise<ResearchDocument>,

    /** One row per field, as text. */
    csv: async (input: ResearchInput): Promise<string> => (await post("/api/v1/research/csv", input)).text(),

    /**
     * The document, streamed. Yields each capability as it settles and finally
     * the whole document — the same events the SSE route emits, parsed.
     */
    stream: async function* (
      input: ResearchInput,
    ): AsyncGenerator<
      | { type: "open"; company: ResearchDocument["company"]; request_digest: string }
      | { type: "capability"; capability: CapabilityId; state: FieldState; reason: FieldReason; elapsed_ms?: number }
      | { type: "document"; document: ResearchDocument }
      | { type: "error"; status: number; error: string }
    > {
      const response = await post("/api/v1/research/stream", input);
      const body = response.body;
      if (!body) return;

      const reader = body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += value;

        // SSE frames are separated by a blank line. Splitting on it and keeping
        // the remainder is the whole protocol; anything more is a library.
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          const event = /^event: (.*)$/m.exec(frame)?.[1];
          const data = /^data: (.*)$/m.exec(frame)?.[1];
          if (!event || !data) continue;
          // The payload is trusted to match the schema it was generated from —
          // it came out of this service's own zod-validated response. Casting
          // once here beats re-validating a contract we published.
          const payload = JSON.parse(data) as Record<string, unknown>;
          if (event === "document") yield { type: "document", document: payload as unknown as ResearchDocument };
          else if (event === "capability") yield { type: "capability", ...payload } as never;
          else if (event === "open") yield { type: "open", ...payload } as never;
          else if (event === "error") yield { type: "error", ...payload } as never;
        }
      }
    },

    schema: async (): Promise<unknown> => (await doFetch(`${baseUrl}/api/schema`)).json(),
    directory: async (): Promise<unknown> => (await doFetch(`${baseUrl}/api/v1/directory`)).json(),
  };
}

export type ResearchClient = ReturnType<typeof createClient>;
