import { describe, expect, it } from "vitest";

import { fixtureTransport, virtualClock } from "@/lib/transport";
import { researchRequestSchema } from "@/lib/schema";
import { research } from "@/lib/research";
import { FIXTURE_STORE } from "@/data/fixtures";
import { CSV_COLUMNS, toCsv } from "./csv";

const ask = (company: string) =>
  research(researchRequestSchema.parse({ company }), {
    request_id: "test",
    transport: fixtureTransport(FIXTURE_STORE),
    clock: virtualClock(),
  });

describe("the CSV export", () => {
  it("emits one row per field, plus a header", async () => {
    const document = await ask("Tessellate");
    const lines = toCsv(document).split("\n");
    const fieldCount = Object.values(document.fields).reduce((total, map) => total + Object.keys(map).length, 0);
    expect(lines[0]).toBe(CSV_COLUMNS.join(","));
    expect(lines).toHaveLength(fieldCount + 1);
  });

  it("carries state and reason as ordinary columns", async () => {
    const csv = toCsv(await ask("Tessellate"));
    // The query the wide shape cannot answer at any width.
    const unmapped = csv.split("\n").filter((line) => line.includes(",unmapped,"));
    expect(unmapped.length).toBeGreaterThan(0);
  });

  it("leaves value empty for every non-resolved field", async () => {
    const document = await ask("Tessellate");
    const rows = toCsv(document).split("\n").slice(1);
    for (const row of rows) {
      const [, , , state] = row.split(",");
      const valueColumn = row.split(",")[5];
      if (state !== "resolved") expect(valueColumn, row).toBe("");
    }
  });

  it("quotes a value containing a comma or a quote", () => {
    // Direct, because no upstream in the corpus currently returns one and the
    // rule must hold when one does.
    const csv = toCsv({
      company: { canonical_id: "x", input: "x" },
      fields: {
        identity: {
          industry: { state: "resolved", reason: "ok", capability: "identity", value: 'Payments, "fintech"', upstream_key: "x" },
        },
      },
    } as unknown as Parameters<typeof toCsv>[0]);
    expect(csv).toContain('"Payments, ""fintech"""');
  });

  it("neutralises a cell a spreadsheet would execute", () => {
    // Upstream-supplied strings land in these cells, and a leading '=' is run as
    // a formula by every spreadsheet that opens the file.
    const csv = toCsv({
      company: { canonical_id: "x", input: "x" },
      fields: {
        identity: {
          legal_name: { state: "resolved", reason: "ok", capability: "identity", value: "=1+1", upstream_key: "x" },
        },
      },
    } as unknown as Parameters<typeof toCsv>[0]);
    expect(csv).toContain(`"'=1+1"`);
  });
});
