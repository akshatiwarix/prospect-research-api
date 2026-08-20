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
 *   verified              → resolved  (the verdict names one `domain`)
 *   ambiguous             → unknown   (three `survivors` is not a domain)
 *   no_candidate_survives → absent    (an affirmative finding, not a shrug)
 *   succeeded_by          → unknown   (real: "Twitter" resolves to this)
 *   different_entity      → unknown   (real: "Delta Air Lines" does)
 *   under_posed           → unknown   (real: "HP" denotes two companies)
 *   anything else         → unknown   (tolerant read; see below)
 *
 * An unrecognised verdict state becomes `unknown` rather than a
 * `boundary_violation`. That asymmetry is deliberate and it is the tolerant-read
 * rule applied to enums: an upstream adding a *new* verdict is additive change
 * and must not break this service, whereas an upstream that stops sending
 * `purposes` at all has broken its contract and should say so loudly.
 */

/**
 * The verdict, and two things about it that only a real response tells you.
 *
 * A `verified` verdict carries `domain` — a single string, the answer. An
 * `ambiguous` one carries `survivors`, a list. They are different keys, not one
 * key with a different arity, and reading `survivors[0]` for a verified verdict
 * (which is what this file did until the corpus was probed) silently reports
 * `unknown` for every company that actually resolved. That bug survived a
 * hand-written fixture and died to a captured one.
 */
const verdictSchema = z.object({
  state: z.string().min(1),
  domain: z.string().optional(),
  survivors: z.array(z.string()).optional(),
});

const purposeSchema = z.object({
  purpose: z.string().min(1),
  verdict: verdictSchema,
});

/**
 * `entity` is nullable, and that nullability is a correct answer rather than a
 * broken one. Ask Day 013 about a company its corpus has never heard of and it
 * replies with `entity: null`, `matched: []` and a real verdict of
 * `no_candidate_survives`. Requiring `entity` here would report that as a
 * boundary violation — accusing a working upstream of breaking its contract
 * because it honestly said "I do not know this company".
 */
const identityBoundarySchema = z.object({
  entity: z
    .object({
      id: z.string().min(1),
      legalName: z.string().optional(),
      commonName: z.string().optional(),
      country: z.string().optional(),
      industry: z.string().optional(),
      foundedYear: z.number().int().optional(),
      origin: z.string().optional(),
    })
    .nullable(),
  purposes: z.array(purposeSchema),
  /**
   * Nullable, and for the same reason `entity` is. Ask about a company Day 013
   * has no dated snapshot for — "HP", which denotes two companies, or a name it
   * has never heard — and `capturedAt` comes back `null`. A resolution with no
   * capture date is a real answer; a box with no `observed_at` is how it is
   * reported.
   */
  capturedAt: z.string().min(1).nullable(),
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
    // `?? undefined` rather than passing the null through: `observed_at` is
    // omitted when there is no observation date, never nulled.
    const observedAt = parsed.capturedAt ?? undefined;
    const web = parsed.purposes.find((purpose) => purpose.purpose === "web");

    const entity = parsed.entity;

    return {
      domain: domainField(web?.verdict, upstreamKey, observedAt),
      legal_name: optional(entity?.legalName, upstreamKey, observedAt),
      country: optional(entity?.country, upstreamKey, observedAt),
      industry: optional(entity?.industry, upstreamKey, observedAt),
      founded_year: optional(entity?.foundedYear, upstreamKey, observedAt),
      origin: optional(entity?.origin, upstreamKey, observedAt),
    };
  },
};

function domainField(
  verdict: { state: string; domain?: string; survivors?: string[] } | undefined,
  upstreamKey: string,
  observedAt?: string,
): Field<unknown> {
  // No web purpose in the response at all: the upstream did not evaluate the
  // thing we asked about. Nothing was found and nothing was denied.
  if (!verdict) return unknown("identity", upstreamKey);

  if (verdict.state === "verified") {
    // `domain` first, because that is where a verified verdict puts its answer.
    // `survivors[0]` is the fallback for a shape that may not exist any more, and
    // a verified verdict with neither is the upstream contradicting itself —
    // reporting `unknown` beats inventing a domain.
    const only = verdict.domain ?? verdict.survivors?.[0];
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

function optional(value: unknown, upstreamKey: string, observedAt?: string): Field<unknown> {
  return value === undefined || value === null || value === ""
    ? unknown("identity", upstreamKey)
    : resolved("identity", value, upstreamKey, observedAt);
}

/** The resolved web domain, for the one dependency edge. */
export function resolvedDomain(fields: FieldMap): string | undefined {
  const box = fields.domain;
  return box?.state === "resolved" && typeof box.value === "string" ? box.value : undefined;
}
