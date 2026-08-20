import { z } from "zod";

import { resolved, unknown, type Field } from "@/lib/envelope";
import type { Capability, FieldMap } from "./types";

/**
 * `technographics` — Day 008 `techstack-icp`, `POST /api/inspect`.
 *
 * The only capability on the far side of the one dependency edge: it needs a URL,
 * and the only thing that produces one is `identity`. No resolved domain means
 * `buildRequest` returns `null` and the scheduler writes
 * `not_attempted/dependency_failed` across the whole key set.
 *
 * The mapping worth arguing about is what an empty `claims` array means. Day 008
 * inspects a fixed set of surfaces and tells you which ones it *did not* look at
 * — for a live fetch, two of six. So no claims does **not** mean no technology;
 * it means nobody looked at the four surfaces where the evidence usually lives.
 * That is `unknown`, and calling it `absent` would be the single most misleading
 * thing this service could say: `absent` is a claim that the property does not
 * exist, and it would be made on the basis of not having checked.
 *
 * `absent` is therefore reachable only when every surface was inspected and
 * nothing was found — which the live transport cannot currently produce, and
 * which a fixture can. That the honest branch is the one the network rarely
 * reaches is not a reason to widen it.
 */

const claimSchema = z.object({
  technology: z.string().optional(),
  name: z.string().optional(),
  category: z.string().optional(),
  surface: z.string().optional(),
  evidence: z.unknown().optional(),
});

const technographicsBoundarySchema = z.object({
  url: z.string().min(1),
  inspectedSurfaces: z.array(z.string()),
  uninspectedSurfaces: z.array(z.string()),
  claims: z.array(claimSchema),
});

export type TechnographicsParsed = z.infer<typeof technographicsBoundarySchema>;

const CONTRIBUTES = ["technologies", "inspected_surfaces", "uninspected_surfaces"] as const;

export const technographics: Capability<true, TechnographicsParsed> = {
  id: "technographics",
  upstream: "techstack_icp",
  tier: 1,
  dependsOn: ["identity"],
  contributes: CONTRIBUTES,
  // The binding carries nothing: the whole request is derived from tier 0. `true`
  // rather than `null` so that "a binding exists" and "the binding is empty"
  // stay distinguishable — `unmapped` has to mean something here too.
  bindingSchema: z.literal(true),
  buildRequest: (_binding, context) => {
    if (!context.domain) return null;
    return {
      path: "/api/inspect",
      body: { url: `https://${context.domain}`, asOf: context.as_of },
    };
  },
  boundarySchema: technographicsBoundarySchema,
  toFields: (parsed, upstreamKey): FieldMap => ({
    technologies: technologiesField(parsed, upstreamKey),
    inspected_surfaces: resolved("technographics", parsed.inspectedSurfaces, upstreamKey),
    uninspected_surfaces: resolved("technographics", parsed.uninspectedSurfaces, upstreamKey),
  }),
};

function technologiesField(parsed: TechnographicsParsed, upstreamKey: string): Field<unknown> {
  if (parsed.claims.length > 0) {
    return resolved("technographics", parsed.claims, upstreamKey);
  }
  // Nothing found. Whether that is an absence or an unexamined gap is decided
  // entirely by whether anything went unexamined.
  return unknown("technographics", upstreamKey);
}
