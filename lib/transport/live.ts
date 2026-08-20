import { UPSTREAM_HOSTS } from "@/data/upstreams";

import type { Transport, TransportOutcome, TransportRequest } from "./types";

/**
 * The live transport. Real HTTP, to a compile-time allowlist, and nothing else.
 *
 * The status mapping is the whole point of this file, and it exists because the
 * three interesting failures are three different instructions to the caller:
 *
 *   429 → upstream_rate_limited   back off; Retry-After says how long
 *   501 → upstream_unconfigured   provision the upstream; retrying is pointless
 *   other non-2xx → upstream_error  the upstream is broken or moved
 *
 * Day 008 rate-limits to six requests a minute and Day 006 answers 501 when it
 * has no model key. Both are real, both are deliberate choices by those repos,
 * and flattening them into one `error: true` would delete the only part a caller
 * can act on.
 *
 * Status is classified **before** the body is read. Day 006's live deployment
 * answers `POST /api/brief` with `404 text/html`; parsing that as JSON first
 * would report a boundary violation, which would blame the payload for a routing
 * problem. A non-2xx is an upstream error whatever it is carrying.
 */
export function liveTransport(fetchImpl: typeof fetch = fetch): Transport {
  return {
    id: "live",
    send: async (request: TransportRequest): Promise<TransportOutcome> => {
      const host = UPSTREAM_HOSTS[request.upstream];
      // Not reachable from caller input — `upstream` is a CapabilityId-derived
      // key, not a string from a request body. The check is here so that a future
      // refactor which loosens that has to delete a line rather than merely
      // forget one.
      if (host === undefined) {
        return {
          ok: false,
          reason: "upstream_error",
          elapsed_ms: 0,
          detail: `no allowlisted host for '${request.upstream}'`,
        };
      }

      const started = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), request.budget_ms);

      try {
        const response = await fetchImpl(`${host}${request.path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(request.body),
          signal: controller.signal,
        });

        const elapsed_ms = Date.now() - started;

        if (!response.ok) {
          if (response.status === 429) {
            const header = response.headers.get("retry-after");
            const retry_after_s = header === null ? undefined : Number.parseInt(header, 10);
            return {
              ok: false,
              reason: "upstream_rate_limited",
              retry_after_s: Number.isFinite(retry_after_s) ? retry_after_s : undefined,
              elapsed_ms,
              detail: `${response.status} from ${request.upstream}`,
            };
          }
          if (response.status === 501) {
            return {
              ok: false,
              reason: "upstream_unconfigured",
              elapsed_ms,
              detail: `501 from ${request.upstream}`,
            };
          }
          return {
            ok: false,
            reason: "upstream_error",
            elapsed_ms,
            detail: `${response.status} from ${request.upstream}`,
          };
        }

        // A 2xx that is not JSON is a contract violation by the upstream, and the
        // capability's boundary schema is what says so — this returns the parsed
        // value or `undefined`, and `undefined` fails every boundary schema.
        const text = await response.text();
        let body: unknown;
        try {
          body = JSON.parse(text);
        } catch {
          body = undefined;
        }

        return { ok: true, body, elapsed_ms };
      } catch (error) {
        const elapsed_ms = Date.now() - started;
        const aborted = error instanceof Error && error.name === "AbortError";
        return {
          ok: false,
          reason: aborted ? "timeout" : "upstream_error",
          elapsed_ms,
          detail: aborted
            ? `abandoned after ${request.budget_ms}ms`
            : error instanceof Error
              ? error.message
              : "unknown transport failure",
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
