import type { Transport, TransportFailure, TransportOutcome, TransportRequest } from "./types";
import type { UpstreamId } from "@/data/upstreams";

/**
 * The fixture transport, and the determinism guarantee it underwrites.
 *
 * Two design choices matter here.
 *
 * **Latency is reported, not slept.** A recorded response says it took 1,340ms;
 * this returns that number immediately and lets the scheduler advance a virtual
 * clock by it. The sweep runs tens of thousands of scheduler decisions in under a
 * second and gets byte-identical documents every time, which is impossible if
 * timing comes from a real clock — and a determinism invariant that has to
 * tolerate jitter is not a determinism invariant.
 *
 * **The budget is still enforced.** A fixture whose recorded latency exceeds the
 * budget it was given returns `timeout`, exactly as the live transport would.
 * That is what makes the deadline behaviour testable at all: the slow-upstream
 * scenario is a number in a file rather than a `setTimeout` nobody wants to wait
 * for.
 */

export type FixtureRecord = {
  upstream: UpstreamId;
  /** The binding key this response was recorded for. */
  key: string;
  latency_ms: number;
  /** A recorded success body, or a recorded failure. Exactly one. */
  body?: unknown;
  failure?: { reason: TransportFailure; retry_after_s?: number; detail: string };
};

export type FixtureStore = readonly FixtureRecord[];

export class FixtureError extends Error {}

export function fixtureTransport(store: FixtureStore): Transport {
  const index = new Map<string, FixtureRecord>();
  for (const record of store) {
    const id = `${record.upstream}:${record.key}`;
    if (index.has(id)) throw new FixtureError(`duplicate fixture for ${id}`);
    if ((record.body === undefined) === (record.failure === undefined)) {
      throw new FixtureError(`fixture ${id} must record exactly one of body or failure`);
    }
    index.set(id, record);
  }

  return {
    id: "fixture",
    send: async (request: TransportRequest): Promise<TransportOutcome> => {
      const record = index.get(`${request.upstream}:${request.upstreamKey}`);

      // A missing fixture is a hole in *our* corpus, not an upstream failure.
      // Reporting it as `upstream_error` would be blaming a service we never
      // called, so it throws and the sweep fails loudly at authoring time.
      if (!record) {
        throw new FixtureError(
          `no fixture for ${request.upstream}:${request.upstreamKey} — the binding exists but the recording does not`,
        );
      }

      if (record.latency_ms > request.budget_ms) {
        return {
          ok: false,
          reason: "timeout",
          // The budget, not the recorded latency: we stopped waiting at the
          // budget, and claiming to have waited longer would misreport the
          // ledger.
          elapsed_ms: request.budget_ms,
          detail: `abandoned after ${request.budget_ms}ms (recorded latency ${record.latency_ms}ms)`,
        };
      }

      if (record.failure) {
        return {
          ok: false,
          reason: record.failure.reason,
          retry_after_s: record.failure.retry_after_s,
          elapsed_ms: record.latency_ms,
          detail: record.failure.detail,
        };
      }

      return { ok: true, body: record.body, elapsed_ms: record.latency_ms };
    },
  };
}
