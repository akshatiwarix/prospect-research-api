import { z } from "zod";

import { absent, resolved, unknown, type Field } from "@/lib/envelope";
import type { Capability, FieldMap } from "./types";

/**
 * `identity` — Day 013 `domain-detective`, `POST /api/resolve`.
 *
 * Tier 0, and the only capability that takes free-form input: its binding is the
 * query string itself, so it answers for any company its own corpus knows rather
 * than only for ones this repo has authored a key for.
 *
 * The interesting mapping is the verdict. `domain-detective` resolves per
 * *purpose* — web, email, parent — and returns a verdict per purpose whose state
 * is `verified`, `ambiguous`, `no_candidate_survives`, or something it added
 * after this was written. That maps onto three of our five states and it maps
 * cleanly, which is a relief and not a coincidence: Day 013 also refused to pick
 * a winner when the evidence did not.
 *
 *   verified              → resolved
 *   ambiguous             → unknown   (three survivors is not a domain)
 *   no_candidate_survives → absent    (an affirmative finding, not a shrug)
 *   anything else         → unknown   (tolerant read; see below)
 *
 * An unrecognised verdict state becomes `unknown` rather than a
 * `boundary_violation`. That asymmetry is deliberate and it is the tolerant-read
 * rule applied to enums: an upstream adding a *new* verdict is additive change
 * and must not break this service, whereas an upstream that stops sending
 * `purposes` at all has broken its contract and should say so loudly.
 */

const verdictSchema = z.object({
  state: z.string().min(1),
  survivors: z.array(z.string()).optional(),
});

const purposeSchema = z.object({
  purpose: z.string().min(1),
  verdict: verdictSchema,
});

const identityBoundarySchema = z.object({
  entity: z.object({
    id: z.string().min(1),
    legalName: z.string().optional(),
    commonName: z.string().optional(),
    country: z.string().optional(),
    industry: z.string().optional(),
    foundedYear: z.number().int().optional(),
    origin: z.string().optional(),
  }),
  purposes: z.array(purposeSchema),
  capturedAt: z.string().min(1),
});

export type IdentityParsed = z.infer<typeof identityBoundarySchema>;

const CONTRIBUTES = ["domain", "legal_name", "country", "industry", "founded_year", "origin"] as const;

export const identity: Capability<string, IdentityParsed> = {
  id: "identity",
  upstream: "domain_detective",
  tier: 0,
  dependsOn: [],
  contributes: CONTRIBUTES,
  bindingSchema: z.string().min(1).max(200),
  buildRequest: (query) => ({ path: "/api/resolve", body: { query } }),
  keyFor: (query) => query,
  boundarySchema: identityBoundarySchema,
  toFields: (parsed, upstreamKey): FieldMap => {
    const observedAt = parsed.capturedAt;
    const web = parsed.purposes.find((purpose) => purpose.purpose === "web");

    return {
      domain: domainField(web?.verdict, upstreamKey, observedAt),
      legal_name: optional(parsed.entity.legalName, upstreamKey, observedAt),
      country: optional(parsed.entity.country, upstreamKey, observedAt),
      industry: optional(parsed.entity.industry, upstreamKey, observedAt),
      founded_year: optional(parsed.entity.foundedYear, upstreamKey, observedAt),
      origin: optional(parsed.entity.origin, upstreamKey, observedAt),
    };
  },
};

function domainField(
  verdict: { state: string; survivors?: string[] } | undefined,
  upstreamKey: string,
  observedAt: string,
): Field<unknown> {
  // No web purpose in the response at all: the upstream did not evaluate the
  // thing we asked about. Nothing was found and nothing was denied.
  if (!verdict) return unknown("identity", upstreamKey);

  if (verdict.state === "verified") {
    const [only] = verdict.survivors ?? [];
    // A verdict of `verified` with no survivor is the upstream contradicting
    // itself. Reporting `unknown` is more honest than inventing a domain.
    return only === undefined
      ? unknown("identity", upstreamKey)
      : resolved("identity", only, upstreamKey, observedAt);
  }

  if (verdict.state === "no_candidate_survives") return absent("identity", upstreamKey);

  // `ambiguous`, `under_posed`, and whatever Day 013 adds next. Three surviving
  // domains is not a domain, and choosing one here would be exactly the silent
  // precedence Day 013 was built to refuse.
  return unknown("identity", upstreamKey);
}

function optional(value: unknown, upstreamKey: string, observedAt: string): Field<unknown> {
  return value === undefined || value === null || value === ""
    ? unknown("identity", upstreamKey)
    : resolved("identity", value, upstreamKey, observedAt);
}

/** The resolved web domain, for the one dependency edge. */
export function resolvedDomain(fields: FieldMap): string | undefined {
  const box = fields.domain;
  return box?.state === "resolved" && typeof box.value === "string" ? box.value : undefined;
}
