import { z } from "zod";

import { resolved, unknown, type Field } from "@/lib/envelope";
import type { Capability, FieldMap } from "./types";

/**
 * `narrative` — Day 006 `account-brief`, `POST /api/brief`.
 *
 * The upstream that made this project honest.
 *
 * At the time of writing, the live deployment serves its console at `200` and
 * answers `POST /api/brief` with **`404 text/html`**. That was not designed into
 * this plan; it was found by probing before writing any code, and it is now
 * scenario 7. It is also why boundary validation lives in the transport rather
 * than in the consumer: a capability that assumed it would be handed JSON would
 * throw on an HTML document, and a thrown parse error inside a fan-out is how one
 * broken upstream takes down five working ones.
 *
 * The upstream has a *second* interesting failure. Its route returns `501` when
 * no `GEMINI_API_KEY` is configured — a deliberate choice by Day 006, and exactly
 * what `upstream_unconfigured` was added for. Two different real failures, two
 * different reasons, one caller decision each: "the route moved, go look" versus
 * "provision the key". A flat `error: true` would have made them the same event.
 *
 * The fixture transport carries the success shape so the healthy document has a
 * brief in it. That the network currently cannot produce one is reported in the
 * coverage matrix rather than papered over.
 */

// Forwarded verbatim; see the note in `why-now.ts`.
const claimSchema = z.looseObject({
  id: z.string().optional(),
  text: z.string().optional(),
  document_id: z.string().optional(),
});

const sectionSchema = z.looseObject({
  section: z.string().min(1),
  questions: z.array(z.unknown()),
});

const narrativeBoundarySchema = z.object({
  brief: z.object({
    sections: z.array(sectionSchema),
    claims: z.array(claimSchema).optional(),
    conflicts: z.array(z.unknown()).optional(),
    coverage: z
      .object({
        routable: z.number().int().nonnegative(),
        answered: z.number().int().nonnegative(),
        total: z.number().int().nonnegative(),
      })
      .optional(),
    as_of: z.string().optional(),
    generated_at: z.string().optional(),
  }),
});

export type NarrativeParsed = z.infer<typeof narrativeBoundarySchema>;

const CONTRIBUTES = ["sections", "claims", "conflicts", "coverage"] as const;

export const narrative: Capability<string, NarrativeParsed> = {
  id: "narrative",
  upstream: "account_brief",
  tier: 1,
  dependsOn: [],
  contributes: CONTRIBUTES,
  bindingSchema: z.string().min(1),
  buildRequest: (companyId) => ({ path: "/api/brief", body: { company_id: companyId } }),
  keyFor: (companyId) => companyId,
  boundarySchema: narrativeBoundarySchema,
  toFields: (parsed, upstreamKey): FieldMap => {
    const brief = parsed.brief;
    const observedAt = brief.generated_at ?? brief.as_of;

    return {
      sections: nonEmpty(brief.sections, upstreamKey, observedAt),
      claims: nonEmpty(brief.claims, upstreamKey, observedAt),
      conflicts: listField(brief.conflicts, upstreamKey, observedAt),
      coverage: brief.coverage
        ? resolved("narrative", brief.coverage, upstreamKey, observedAt)
        : unknown("narrative", upstreamKey),
    };
  },
};

function nonEmpty(list: unknown[] | undefined, upstreamKey: string, observedAt?: string): Field<unknown> {
  return list && list.length > 0
    ? resolved("narrative", list, upstreamKey, observedAt)
    : unknown("narrative", upstreamKey);
}

/**
 * Conflicts are the one list where empty is a finding rather than a gap: Day 006
 * looks for source disagreement on every brief it builds, so an empty array means
 * it looked and the sources agreed. `resolved` with `[]` says that; `unknown`
 * would throw away a real answer.
 */
function listField(list: unknown[] | undefined, upstreamKey: string, observedAt?: string): Field<unknown> {
  return list === undefined
    ? unknown("narrative", upstreamKey)
    : resolved("narrative", list, upstreamKey, observedAt);
}
