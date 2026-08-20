import type { Field } from "./field";

/**
 * The walker behind sweep invariant 1: *no naked values*.
 *
 * Scope matters and is easy to get wrong. The invariant applies to the field
 * tree, not to the whole document — `schema_version`, `request_id` and the
 * numbers in `budget` are envelope metadata, and boxing them would be cargo
 * cult. What must never appear unboxed is a claim *about the company*.
 *
 * So: descend through objects and arrays, and stop the moment a box is reached.
 * Whatever sits inside a box's `value` is raw upstream payload — a list of
 * technology claims, a nested verdict — and the box already carries the state
 * for all of it. Descending further would demand that upstreams pre-box their
 * own responses, which is not a thing this service can ask for.
 *
 * A primitive encountered *before* any box is the violation. That is the
 * shortcut this function exists to make impossible: someone adding
 * `fields.domain = "stripe.com"` because it is convenient, and nothing failing.
 */

export type NakedValue = {
  path: string;
  value: unknown;
};

export function isField(node: unknown): node is Field<unknown> {
  if (typeof node !== "object" || node === null || Array.isArray(node)) return false;
  const candidate = node as Record<string, unknown>;
  return (
    typeof candidate.state === "string" &&
    typeof candidate.reason === "string" &&
    typeof candidate.capability === "string"
  );
}

export function findNakedValues(fields: unknown, root = "fields"): NakedValue[] {
  const naked: NakedValue[] = [];

  const visit = (node: unknown, path: string): void => {
    if (isField(node)) return; // The box owns everything below it.

    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }

    if (typeof node === "object" && node !== null) {
      for (const [key, item] of Object.entries(node)) {
        visit(item, `${path}.${key}`);
      }
      return;
    }

    if (node === undefined) return; // An absent key is absence, not a claim.
    naked.push({ path, value: node });
  };

  visit(fields, root);
  return naked;
}

/** Every box in the tree, with its path. Used by the legality invariants. */
export function collectFields(fields: unknown, root = "fields"): Array<{ path: string; field: Field<unknown> }> {
  const found: Array<{ path: string; field: Field<unknown> }> = [];

  const visit = (node: unknown, path: string): void => {
    if (isField(node)) {
      found.push({ path, field: node });
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    if (typeof node === "object" && node !== null) {
      for (const [key, item] of Object.entries(node)) visit(item, `${path}.${key}`);
    }
  };

  visit(fields, root);
  return found;
}
