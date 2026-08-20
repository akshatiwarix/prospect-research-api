import { createHash } from "node:crypto";

/**
 * The request digest, and the determinism claim it underwrites.
 *
 * Two requests with the same digest must produce byte-identical documents under
 * the fixture transport (sweep invariant 4, `budget` and `request_id`
 * excluded). That promise is only worth anything if the digest covers
 * *everything that can change the answer*, so `deadline_ms` is in it: a tighter
 * budget produces different states, and a digest that ignored the budget would
 * be asserting that two genuinely different documents are the same request.
 *
 * Key order is normalised because `{a,b}` and `{b,a}` are the same request, and
 * a caller's JSON serialiser is not something this service gets to control.
 */
export function canonicalise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalise);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, item]) => [key, canonicalise(item)]),
    );
  }
  return value;
}

export function requestDigest(request: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalise(request))).digest("hex").slice(0, 32);
}
