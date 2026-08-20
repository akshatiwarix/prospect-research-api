import type { FixtureRecord } from "@/lib/transport";

/**
 * The fixtures the network cannot produce.
 *
 * Everything in `recorded.json` came off the wire. Everything here is written,
 * and it is written for exactly two reasons:
 *
 * **Day 006 `account-brief` answers `POST /api/brief` with `404 text/html`.**
 * The route is gone from the deployment. So the only way to show what a document
 * containing a brief looks like is to author the brief's shape — matching Day
 * 006's own `Brief` interface — and label it authored.
 *
 * **`.example` domains cannot be fetched, by design.** RFC 2606 reserved them so
 * that nothing resolves. Day 013's synthetic half resolves to them, Day 008
 * dutifully tries, and gets a 502. The healthy-world counterpart has to be
 * authored.
 *
 * These are the two places the fixture transport tells a story the live one
 * cannot, which is precisely what the console's side-by-side view is for.
 * Latencies are plausible rather than measured, and that is stated here rather
 * than implied by their precision — hence the round numbers.
 */

const brief = (sections: number, claims: number, conflicts: number) => ({
  brief: {
    sections: Array.from({ length: sections }, (_, index) => ({
      section: ["what_they_do", "how_they_sell", "recent_change"][index] ?? `section_${index}`,
      questions: [],
    })),
    claims: Array.from({ length: claims }, (_, index) => ({
      id: `cl-${index + 1}`,
      text: "An authored claim standing in for a gated one.",
      document_id: `doc-${index + 1}`,
    })),
    conflicts: Array.from({ length: conflicts }, (_, index) => ({ id: `cf-${index + 1}` })),
    coverage: { routable: 12, answered: sections * 3, total: 12 },
    as_of: "2026-08-20",
    generated_at: "2026-08-20",
  },
});

const inspection = (domain: string, technologies: readonly string[]) => ({
  url: `https://${domain}/`,
  inspectedSurfaces: ["page_markup", "http_headers"],
  uninspectedSurfaces: ["DNS records", "Job posting", "Engineering blog", "Integrations directory"],
  claims: technologies.map((technology) => ({ technology, surface: "page_markup" })),
});

export const AUTHORED_FIXTURES: readonly FixtureRecord[] = [
  // ── Day 006, whose route is gone ─────────────────────────────────────────
  {
    upstream: "account_brief",
    key: "c01",
    latency_ms: 2000,
    origin: "authored",
    body: brief(3, 6, 0),
  },
  {
    upstream: "account_brief",
    key: "c02",
    latency_ms: 2000,
    origin: "authored",
    // Day 006's `c02` is its conflict trap: the careers page says 200 people and
    // the funding announcement says 340. A brief for it that reported no
    // conflicts would be authoring a lie about a repo whose whole argument is
    // that conflicts get reported.
    body: brief(3, 5, 1),
  },
  {
    upstream: "account_brief",
    key: "c04",
    latency_ms: 2000,
    origin: "authored",
    body: brief(2, 4, 0),
  },

  // ── Day 008 against domains reserved to be unfetchable ───────────────────
  {
    upstream: "techstack_icp",
    key: "northwind.example",
    latency_ms: 1000,
    origin: "authored",
    body: inspection("northwind.example", ["Warehowse", "Podship"]),
  },
  {
    upstream: "techstack_icp",
    key: "contoso.example",
    latency_ms: 1000,
    origin: "authored",
    body: inspection("contoso.example", ["Terraflow"]),
  },
  {
    upstream: "techstack_icp",
    key: "fabrikam.example",
    latency_ms: 1000,
    origin: "authored",
    // Nothing found on the two surfaces that were looked at. Reported `unknown`
    // rather than `absent`, because four surfaces went unexamined.
    body: inspection("fabrikam.example", []),
  },
  {
    upstream: "techstack_icp",
    key: "tailspintoys.example",
    latency_ms: 1000,
    origin: "authored",
    body: inspection("tailspintoys.example", ["Pagelight", "Modelform", "Rivalytics"]),
  },
];
