import loudwaveLabs from "./signals/loudwave-labs.json";
import northbeamSystems from "./signals/northbeam-systems.json";
import steadymarkHealth from "./signals/steadymark-health.json";

import type { CapabilityId } from "@/lib/capabilities";

/**
 * The canonical directory, and the honest answer to a question the interview got
 * wrong.
 *
 * The plan assumed one input could address six upstreams. It cannot. Probing the
 * five live deployments found **five disjoint fictional corpora**:
 *
 *   Day 013 `domain-detective`   12 real companies + 12 RFC 2606 synthetics
 *   Day 014 `company-classifier` Hollowlight, Meridianflow, Tessellate, …
 *   Day 007 `why-now`            Northwind Freight, Calder Health, Tessellate, …
 *   Day 005 `signal-scout`       Loudwave Labs, Northbeam Systems, …
 *   Day 006 `account-brief`      Ledgerloop, Cadence Freight, Tinbox Robotics, …
 *
 * Exactly one name appears in two of them: **Tessellate**. Every other company
 * on earth is known to at most one of these services.
 *
 * That is not a defect in the demo. It is the condition of every real GTM stack —
 * six vendors, six key spaces, no shared identifier — and the only dishonest
 * response available was to fuzzy-match across the corpora and pretend the
 * coverage was denser than it is. `northwind` (Day 013) and `northwind-freight`
 * (Day 007) are two different fictional companies with similar names; a
 * normalise-then-compare join would merge them and confidently attach one
 * company's timing hypotheses to another company's domain.
 *
 * So bindings are **authored, one at a time, per upstream**. There is no
 * string-similarity code in this repository. A company with no binding for an
 * upstream reports `not_attempted/unmapped` for every field that upstream would
 * have supplied, and the coverage matrix prints the sparsity rather than hiding
 * it.
 *
 * ## Why `signals` is bound only for synthetic companies
 *
 * Day 005's route takes observations *about a company* as input, so binding it
 * means this repo shipping evidence. For a fictional company that is authoring
 * consistent fiction, which every day in this series does. For Stripe or Siemens
 * it would be publishing fabricated factual claims about an identifiable third
 * party in a public repository. Day 013 drew exactly this line inside its own
 * corpus and this repo honours it: real companies get `unmapped` for `signals`,
 * and the reason is a stated boundary rather than an oversight.
 */

export type Bindings = Partial<Record<CapabilityId, unknown>>;

export type RosterEntry = {
  canonical_id: string;
  name: string;
  /** Lowercased at lookup; these are what a caller may type. */
  aliases: readonly string[];
  /**
   * Whether the company denotes an identifiable real firm. Governs whether this
   * repo is willing to author evidence about it.
   */
  origin: "real" | "synthetic";
  /** Which upstream corpora know this company, for the coverage matrix. */
  known_to: readonly string[];
  bindings: Bindings;
};

export const ROSTER: readonly RosterEntry[] = [
  // ── Real companies, from Day 013's real half ─────────────────────────────
  // `identity` and `technographics` only: they are the two capabilities that
  // need no authored evidence, which is why real companies cap at 2-of-6.
  {
    canonical_id: "stripe",
    name: "Stripe",
    aliases: ["stripe", "stripe inc", "stripe, inc."],
    origin: "real",
    known_to: ["domain_detective"],
    // Day 013 returns `ambiguous` here — three surviving domains. So this entry
    // is the live cascade: no resolved domain, `technographics` never runs.
    bindings: { identity: "Stripe", technographics: true },
  },
  {
    canonical_id: "datadog",
    name: "Datadog",
    aliases: ["datadog", "datadog inc", "datadoghq"],
    origin: "real",
    known_to: ["domain_detective"],
    bindings: { identity: "Datadog", technographics: true },
  },
  {
    canonical_id: "cloudflare",
    name: "Cloudflare",
    aliases: ["cloudflare", "cloudflare inc"],
    origin: "real",
    known_to: ["domain_detective"],
    bindings: { identity: "Cloudflare", technographics: true },
  },
  {
    canonical_id: "siemens",
    name: "Siemens",
    aliases: ["siemens", "siemens ag"],
    origin: "real",
    known_to: ["domain_detective"],
    bindings: { identity: "Siemens", technographics: true },
  },
  {
    canonical_id: "google",
    name: "Google",
    aliases: ["google", "google llc", "alphabet"],
    origin: "real",
    known_to: ["domain_detective"],
    bindings: { identity: "Google", technographics: true },
  },
  {
    canonical_id: "twitter",
    name: "Twitter",
    aliases: ["twitter", "x", "x corp"],
    origin: "real",
    known_to: ["domain_detective"],
    // Day 013 answers `succeeded_by`: the brand resolves to a successor domain
    // it will not assert as the answer. Another live cascade, different cause.
    bindings: { identity: "Twitter", technographics: true },
  },
  {
    canonical_id: "hp",
    name: "HP",
    aliases: ["hp", "hewlett packard", "hewlett-packard"],
    origin: "real",
    known_to: ["domain_detective"],
    // `under_posed`: "HP" denotes HP Inc. and HPE, and Day 013 refuses to guess.
    bindings: { identity: "HP", technographics: true },
  },
  {
    canonical_id: "delta-air-lines",
    name: "Delta Air Lines",
    aliases: ["delta air lines", "delta airlines", "delta"],
    origin: "real",
    known_to: ["domain_detective"],
    bindings: { identity: "Delta Air Lines", technographics: true },
  },

  // ── Day 013's synthetic half ─────────────────────────────────────────────
  // These resolve to `.example` domains, which exist to be unresolvable. Day 008
  // will therefore fail to fetch them, and that failure is real rather than
  // simulated: an `upstream_error` from a live service asked to inspect a host
  // RFC 2606 reserved so that it could not exist.
  {
    canonical_id: "northwind",
    name: "Northwind",
    aliases: ["northwind", "northwind traders"],
    origin: "synthetic",
    known_to: ["domain_detective"],
    bindings: { identity: "Northwind", technographics: true },
  },
  {
    canonical_id: "contoso",
    name: "Contoso",
    aliases: ["contoso", "contoso ltd"],
    origin: "synthetic",
    known_to: ["domain_detective"],
    bindings: { identity: "Contoso", technographics: true },
  },
  {
    canonical_id: "fabrikam",
    name: "Fabrikam",
    aliases: ["fabrikam", "fabrikam inc"],
    origin: "synthetic",
    known_to: ["domain_detective"],
    bindings: { identity: "Fabrikam", technographics: true },
  },
  {
    canonical_id: "tailspin-toys",
    name: "Tailspin Toys",
    aliases: ["tailspin toys", "tailspin"],
    origin: "synthetic",
    known_to: ["domain_detective"],
    bindings: { identity: "Tailspin Toys", technographics: true },
  },

  // ── The one company two upstreams both know ──────────────────────────────
  {
    canonical_id: "tessellate",
    name: "Tessellate",
    aliases: ["tessellate"],
    origin: "synthetic",
    known_to: ["company_classifier", "why_now"],
    // The densest entry in the roster, and it reaches 2-of-6. Day 013 has never
    // heard of it, so `identity` is `absent` and `technographics` cascades —
    // which makes the hero of the demo a company whose domain is unknown and
    // whose attributes and timing are fully resolved. That inversion is the
    // most honest single screenshot this repo can produce.
    bindings: {
      identity: "Tessellate",
      // Bound like every other identity-bound entry, and it still cascades:
      // Day 013 answers `no_candidate_survives`, so there is no domain to
      // inspect. `dependency_failed` rather than `unmapped` is the honest
      // reason — this service knows how to ask Day 008, it just has nothing to
      // ask about.
      technographics: true,
      attributes: "tessellate",
      why_now: { companyId: "tessellate", sellerId: "ledgerline" },
    },
  },

  // ── Day 014's corpus ─────────────────────────────────────────────────────
  {
    canonical_id: "hollowlight",
    name: "Hollowlight",
    aliases: ["hollowlight"],
    origin: "synthetic",
    known_to: ["company_classifier"],
    bindings: { attributes: "hollowlight" },
  },
  {
    canonical_id: "meridianflow",
    name: "Meridianflow",
    aliases: ["meridianflow"],
    origin: "synthetic",
    known_to: ["company_classifier"],
    bindings: { attributes: "meridianflow" },
  },
  {
    canonical_id: "parity-health",
    name: "Parity Health",
    aliases: ["parity health", "parity"],
    origin: "synthetic",
    known_to: ["company_classifier"],
    bindings: { attributes: "parity-health" },
  },
  {
    canonical_id: "sable-analytics",
    name: "Sable Analytics",
    aliases: ["sable analytics"],
    origin: "synthetic",
    known_to: ["company_classifier"],
    bindings: { attributes: "sable-analytics" },
  },

  // ── Day 007's corpus ─────────────────────────────────────────────────────
  // `sellerId` is part of the binding because Day 007's verdicts are
  // seller-dependent by design. The same company asked as a different seller is
  // a different, equally valid question — which is the clearest demonstration
  // that a binding is not an identifier.
  {
    canonical_id: "northwind-freight",
    name: "Northwind Freight",
    aliases: ["northwind freight"],
    origin: "synthetic",
    known_to: ["why_now"],
    bindings: { why_now: { companyId: "northwind-freight", sellerId: "ledgerline" } },
  },
  {
    canonical_id: "calder-health",
    name: "Calder Health",
    aliases: ["calder health"],
    origin: "synthetic",
    known_to: ["why_now"],
    bindings: { why_now: { companyId: "calder-health", sellerId: "northsignal" } },
  },
  {
    canonical_id: "vireo-labs",
    name: "Vireo Labs",
    aliases: ["vireo labs", "vireo"],
    origin: "synthetic",
    known_to: ["why_now"],
    bindings: { why_now: { companyId: "vireo-labs", sellerId: "vaultwright" } },
  },

  // ── Day 005's corpus ─────────────────────────────────────────────────────
  // The binding is the whole request payload, not an id — the general case that
  // "identifier reconciliation" turns out to be a special case of.
  {
    canonical_id: "loudwave-labs",
    name: "Loudwave Labs",
    aliases: ["loudwave labs", "loudwave"],
    origin: "synthetic",
    known_to: ["signal_scout"],
    bindings: { signals: loudwaveLabs },
  },
  {
    canonical_id: "northbeam-systems",
    name: "Northbeam Systems",
    aliases: ["northbeam systems", "northbeam"],
    origin: "synthetic",
    known_to: ["signal_scout"],
    bindings: { signals: northbeamSystems },
  },
  {
    canonical_id: "steadymark-health",
    name: "Steadymark Health",
    aliases: ["steadymark health", "steadymark"],
    origin: "synthetic",
    known_to: ["signal_scout"],
    bindings: { signals: steadymarkHealth },
  },

  // ── Day 006's corpus ─────────────────────────────────────────────────────
  // Bound, and expected to fail live: `POST /api/brief` answers 404 text/html on
  // the current deployment, and answers 501 where no model key is configured.
  // Both are reported as what they are.
  {
    canonical_id: "ledgerloop",
    name: "Ledgerloop",
    aliases: ["ledgerloop"],
    origin: "synthetic",
    known_to: ["account_brief"],
    bindings: { narrative: "c01" },
  },
  {
    canonical_id: "cadence-freight",
    name: "Cadence Freight",
    aliases: ["cadence freight", "cadence"],
    origin: "synthetic",
    known_to: ["account_brief"],
    bindings: { narrative: "c02" },
  },
  {
    canonical_id: "tinbox-robotics",
    name: "Tinbox Robotics",
    aliases: ["tinbox robotics", "tinbox"],
    origin: "synthetic",
    known_to: ["account_brief"],
    bindings: { narrative: "c04" },
  },
];

const BY_ALIAS = new Map<string, RosterEntry>();
for (const entry of ROSTER) {
  for (const alias of [entry.canonical_id, entry.name, ...entry.aliases]) {
    const key = alias.trim().toLowerCase();
    const existing = BY_ALIAS.get(key);
    if (existing && existing.canonical_id !== entry.canonical_id) {
      // Two companies claiming one alias is a directory bug, and it is the exact
      // bug a fuzzy join would introduce silently. Failing at import means it
      // cannot ship.
      throw new Error(`alias '${key}' is claimed by both ${existing.canonical_id} and ${entry.canonical_id}`);
    }
    BY_ALIAS.set(key, entry);
  }
}

export type Lookup =
  | { found: true; entry: RosterEntry; matched_alias?: string }
  | { found: false };

/**
 * Exact-match lookup over authored aliases, case- and whitespace-insensitive and
 * nothing else. No stemming, no edit distance, no stripping of "Inc". A miss is a
 * `4xx` telling the caller this service does not know the company — which is a
 * better answer than research about a company they did not ask about.
 */
export function lookup(input: string): Lookup {
  const key = input.trim().toLowerCase();
  const entry = BY_ALIAS.get(key);
  if (!entry) return { found: false };
  const canonical = entry.canonical_id.toLowerCase();
  return key === canonical || key === entry.name.trim().toLowerCase()
    ? { found: true, entry }
    : { found: true, entry, matched_alias: key };
}

export function rosterEntry(canonicalId: string): RosterEntry | undefined {
  return ROSTER.find((entry) => entry.canonical_id === canonicalId);
}
