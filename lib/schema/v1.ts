import { z } from "zod";

import { anyFieldSchema, researchDocumentSchema } from "@/lib/envelope";
import { CAPABILITIES, CAPABILITY_IDS, type CapabilityId } from "@/lib/capabilities";
import { TRANSPORT_IDS } from "@/lib/transport";
import { DEFAULT_DEADLINE_MS, MAX_DEADLINE_MS, MIN_DEADLINE_MS } from "@/lib/scheduler";

import { DEPRECATED_ALIASES } from "./deprecations";

/**
 * The v1 contract, and the one place it is written down.
 *
 * The field tree is **generated** from each capability's `contributes` list
 * rather than restated here. That is what makes sweep invariant 8 — nothing the
 * console renders is outside the published schema — enforceable instead of
 * aspirational: there is no second list to forget to update, so a capability that
 * gains a field gains it in the schema, in the console's type, and in
 * `/api/schema` at the same instant.
 *
 * The deprecated alias is injected here too, so the schema advertises it as
 * `deprecated: true` without any capability needing to know it exists.
 */

export const SCHEMA_VERSION = "1" as const;

function fieldsSchemaFor(capability: CapabilityId) {
  const aliases = DEPRECATED_ALIASES.filter((alias) => alias.capability === capability);
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const key of CAPABILITIES[capability].contributes) {
    shape[key] = anyFieldSchema;
  }
  for (const alias of aliases) {
    shape[alias.from] = anyFieldSchema.meta({
      deprecated: true,
      description: `Deprecated: use \`${alias.to}\`. Served until the sunset date in \`deprecations\`.`,
    });
  }

  return z.object(shape);
}

export const fieldsSchema = z.object(
  Object.fromEntries(CAPABILITY_IDS.map((id) => [id, fieldsSchemaFor(id)])) as Record<
    CapabilityId,
    ReturnType<typeof fieldsSchemaFor>
  >,
);

export const researchResponseSchema = researchDocumentSchema(fieldsSchema);

export type ResearchResponse = z.infer<typeof researchResponseSchema>;

/**
 * The request. `transport` is public on purpose — the console is a client of this
 * API with no privileges, so anything it can ask for is in the contract. A hidden
 * server-side switch would let the demo look good while the contract stayed bad.
 */
export const researchRequestSchema = z.object({
  company: z.string().min(1).max(200),
  deadline_ms: z.number().int().min(MIN_DEADLINE_MS).max(MAX_DEADLINE_MS).default(DEFAULT_DEADLINE_MS),
  capabilities: z.array(z.enum(CAPABILITY_IDS)).min(1).optional(),
  transport: z.enum(TRANSPORT_IDS).default("fixture"),
  as_of: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .default("2026-08-20"),
});

export type ResearchRequest = z.infer<typeof researchRequestSchema>;

/** What `/api/schema` serves. Generated, never hand-maintained. */
export function jsonSchema() {
  return {
    schema_version: SCHEMA_VERSION,
    request: z.toJSONSchema(researchRequestSchema, { io: "input", unrepresentable: "any" }),
    response: z.toJSONSchema(researchResponseSchema, { io: "output", unrepresentable: "any" }),
  };
}

/**
 * Every published leaf path, which is what invariant 8 checks the console
 * against. Derived from the same shape the routes validate with, so the two
 * cannot disagree.
 */
export function publishedFieldPaths(): string[] {
  return CAPABILITY_IDS.flatMap((id) => {
    const keys = [
      ...CAPABILITIES[id].contributes,
      ...DEPRECATED_ALIASES.filter((alias) => alias.capability === id).map((alias) => alias.from),
    ];
    return keys.map((key) => `fields.${id}.${key}`);
  });
}
