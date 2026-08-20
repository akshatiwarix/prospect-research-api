import type { Deprecation } from "@/lib/envelope";

/**
 * The deprecated field, and why a one-day-old repository has one.
 *
 * Describing a deprecation policy costs nothing and proves nothing. A repo with
 * no history has nothing genuinely deprecated to point at, so the honest options
 * were to write a paragraph of policy nobody can check, or to rename one field
 * on purpose and carry the old name properly. This is the second.
 *
 * `fields.technographics.tech_stack` is the old name for
 * `fields.technographics.technologies`. It is still served, still fully boxed,
 * and shares the *same box object* as its replacement — so the two can never
 * drift into disagreeing, which is the failure mode of every alias maintained by
 * copying.
 *
 * It is announced three ways, because a caller might be reading any of them:
 *
 *   - `deprecations[]` in the body, for anyone parsing the document
 *   - `Sunset` response header (RFC 8594), for anyone watching headers
 *   - `deprecated: true` in the JSON Schema at `/api/schema`, for anyone
 *     generating a client
 *
 * The sunset date is a real commitment expressed in a repo that will not outlive
 * it, and that is a limitation stated in the README rather than hidden behind a
 * plausible-looking timestamp.
 */

export const DEPRECATIONS: readonly Deprecation[] = [
  {
    path: "fields.technographics.tech_stack",
    replacement: "fields.technographics.technologies",
    sunset: "2027-02-20",
  },
];

/** The old key, and the key it aliases. Applied after a capability builds fields. */
export const DEPRECATED_ALIASES: ReadonlyArray<{
  capability: "technographics";
  from: string;
  to: string;
}> = [{ capability: "technographics", from: "tech_stack", to: "technologies" }];

/** `Sunset` wants an IMF-fixdate, not an ISO date. */
export function sunsetHeader(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toUTCString();
}
