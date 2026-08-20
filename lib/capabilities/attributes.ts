import { z } from "zod";

import { resolved, unknown, type Field } from "@/lib/envelope";
import type { Capability, FieldMap } from "./types";

/**
 * `attributes` — Day 014 `company-classifier`, `POST /api/classify`.
 *
 * This capability forced a plan amendment, recorded here because it is the one
 * place where this repo's vocabulary is genuinely narrower than an upstream's.
 *
 * Day 014 reports each derived attribute in one of four terminal states:
 * `derived`, `contested`, `insufficient`, `underdetermined`. The distinctions are
 * the entire point of that repo — `contested` means the company really has two
 * answers, `underdetermined` means the taxonomy is ambiguous, and Day 014 exists
 * partly to argue that collapsing them is malpractice. Our five states have one
 * bucket for all three: `unknown`.
 *
 * Three ways out were available. Add a sixth state — rejected, decision 9 fixed
 * five and a state that means "ask a different service for detail" is not a
 * state. Map `contested` to `resolved` with one of the competing values —
 * rejected outright; that is the silent precedence both repos refuse. Or carry
 * the upstream's own vocabulary through verbatim in its own box.
 *
 * The third. `derivation_states` is a resolved field holding Day 014's
 * per-attribute state exactly as it sent it. So `fields.attributes.segment` is
 * honestly `unknown` — this service cannot give you a segment — while
 * `fields.attributes.derivation_states.value.segment` says `contested`, in Day
 * 014's words, and the caller who cares can go and read Day 014's own console.
 * Our envelope reports what it can offer; it does not paraphrase a richer
 * vocabulary into a poorer one and then pretend nothing was lost.
 */

const derivationSchema = z.object({
  state: z.string().min(1),
  attribute: z.string().optional(),
  value: z.string().optional(),
  ruleId: z.string().optional(),
  consumedIds: z.array(z.string()).optional(),
  sourceTypes: z.array(z.string()).optional(),
});

const attributesBoundarySchema = z.object({
  classification: z.object({
    companyId: z.string().min(1),
    sourceTypes: z.array(z.string()).optional(),
    derivations: z.record(z.string(), derivationSchema),
  }),
});

export type AttributesParsed = z.infer<typeof attributesBoundarySchema>;

/**
 * Day 014's five taxonomies, named explicitly rather than taken from whatever
 * keys happen to arrive. A stable key set means a caller destructuring
 * `fields.attributes.segment` keeps getting a box even if the upstream renames
 * something — it will be `unknown`, which is the truth, rather than absent from
 * the response, which would be a shape change.
 */
export const DERIVED_ATTRIBUTES = [
  "segment",
  "sales_motion",
  "business_model",
  "maturity",
  "market_focus",
] as const;

const CONTRIBUTES = [...DERIVED_ATTRIBUTES, "derivation_states", "source_types"] as const;

export const attributes: Capability<string, AttributesParsed> = {
  id: "attributes",
  upstream: "company_classifier",
  tier: 1,
  dependsOn: [],
  contributes: CONTRIBUTES,
  bindingSchema: z.string().min(1),
  buildRequest: (companyId) => ({ path: "/api/classify", body: { companyId } }),
  boundarySchema: attributesBoundarySchema,
  toFields: (parsed, upstreamKey): FieldMap => {
    const derivations = parsed.classification.derivations;

    const fields: FieldMap = {};
    for (const attribute of DERIVED_ATTRIBUTES) {
      fields[attribute] = attributeField(derivations[attribute], upstreamKey);
    }

    fields.derivation_states = resolved(
      "attributes",
      Object.fromEntries(Object.entries(derivations).map(([key, value]) => [key, value.state])),
      upstreamKey,
    );
    fields.source_types = parsed.classification.sourceTypes
      ? resolved("attributes", parsed.classification.sourceTypes, upstreamKey)
      : unknown("attributes", upstreamKey);

    return fields;
  },
};

function attributeField(
  derivation: { state: string; value?: string } | undefined,
  upstreamKey: string,
): Field<unknown> {
  if (!derivation) return unknown("attributes", upstreamKey);

  // Only `derived` yields a value. `contested`, `insufficient` and
  // `underdetermined` are all real answers from Day 014 and none of them is a
  // label; `derivation_states` is where they survive.
  if (derivation.state === "derived" && derivation.value !== undefined) {
    return resolved("attributes", derivation.value, upstreamKey);
  }
  return unknown("attributes", upstreamKey);
}
