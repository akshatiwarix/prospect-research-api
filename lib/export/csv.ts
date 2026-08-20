import { collectFields } from "@/lib/envelope";
import type { ResearchResponse } from "@/lib/schema";

/**
 * One row per field, and this is the export that makes the envelope's verbosity
 * pay for itself.
 *
 * A conventional enrichment CSV is one row per company and one column per
 * attribute, which is exactly the shape that cannot carry a state. Pivoting to
 * one row per *field* means `state` and `reason` are ordinary columns, so a
 * spreadsheet user can filter to `reason = unmapped` and see their coverage gap,
 * or to `state = unknown` and see what nobody has looked at properly. That query
 * is impossible in the wide shape at any width.
 *
 * `value` is JSON for anything that is not a string, because a technology list
 * flattened into a cell with semicolons is a parsing problem handed to whoever
 * opens the file.
 */

export const CSV_COLUMNS = [
  "canonical_id",
  "path",
  "capability",
  "state",
  "reason",
  "value",
  "upstream_key",
  "observed_at",
  "retry_after_s",
] as const;

export function toCsv(document: ResearchResponse): string {
  const rows = collectFields(document.fields).map(({ path, field }) => [
    document.company.canonical_id,
    path,
    field.capability,
    field.state,
    field.reason,
    field.value === undefined ? "" : typeof field.value === "string" ? field.value : JSON.stringify(field.value),
    field.upstream_key ?? "",
    field.observed_at ?? "",
    field.retry_after_s === undefined ? "" : String(field.retry_after_s),
  ]);

  return [CSV_COLUMNS.join(","), ...rows.map((row) => row.map(escape).join(","))].join("\n");
}

/**
 * RFC 4180 quoting. Also quotes a leading `=`, `+`, `-` or `@`, because a cell
 * beginning with one of those is executed as a formula by every spreadsheet that
 * opens it, and this file is full of upstream-supplied strings.
 */
function escape(cell: string): string {
  const needsQuotes = /[",\n\r]/.test(cell);
  const isFormula = /^[=+\-@\t\r]/.test(cell);
  const body = cell.replace(/"/g, '""');
  if (isFormula) return `"'${body}"`;
  return needsQuotes ? `"${body}"` : body;
}
