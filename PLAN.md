# Day 015 — Prospect Research API — Implementation Plan

Day 015 of a 100-day building challenge. The concept is fixed by the master
backlog (`~/Desktop/100-days-portfolio-execution-plan.md`): *a reusable service
that returns structured prospect or account research from a company input.*
Portfolio angle: API design, structured outputs, reusable GTM infrastructure.

Every choice below came out of a decision-by-decision interview across four
rounds, plus one round of fact-finding against the live sibling deployments that
materially changed the design. The 26 settled decisions are recorded at the
bottom. Treat them as decided, not as open questions to relitigate mid-build.

**Time limit:** one day. Feature-frozen at plan sign-off.

---

## Problem

This is the most dangerous project on the 100-day list, and the danger is not
difficulty. It is that the obvious build has already shipped twice in this repo
series.

Day 006 `account-brief` turns a company into evidence-backed research. Day 014
`company-classifier` turns a company into structured attributes with source-typed
provenance. "A service that returns structured prospect research from a company
input" is, read literally, those two projects with a `POST` in front of them. If
Day 015 builds that, it is a reskin, and a reviewer who has read the other two
repos will know inside thirty seconds.

So read the portfolio angle instead of the brief. It does not say *research*. It
says **API design, structured outputs, reusable GTM infrastructure**. That is a
different subject, and it has a real and specific hard part.

**The hard part is that upstreams are unreliable, and every API pretends they are
not.** Enrichment APIs return a flat object of fields. A rep reads
`headcount: 340` and cannot tell whether that is a current observation, a
two-year-old cache, a vendor's estimate, or a default that got filled in because
the lookup timed out. The value and the story of how the value came to exist are
carried in the same JSON scalar, which means the story is not carried at all.

Four specific failures live inside that flat object, and all four are why this
repo exists.

**Absence is one word for four different things.** A field comes back empty. Did
the provider look and find nothing? Did it look and affirmatively determine there
is nothing to find? Did it never look, because the request budget ran out? Did it
try and get a 500? A caller's correct next action differs in all four cases —
retry, stop asking, raise the timeout, page someone — and a flat `null` collapses
them into a single shrug. Vendors ship the shrug because distinguishing the four
requires the API to admit it is a distributed system.

**Partial success has no representation, so it becomes a lie in one direction or
the other.** A request that resolved four of six capabilities is either returned
as a `200` that looks complete, or thrown away as a `500` that discards four
useful answers. Both are wrong. The first teaches the caller to trust
incompleteness; the second teaches its retry loop to hammer a service that is
working fine.

**Coverage is hidden because it is embarrassing.** No provider covers every
account. Every vendor knows which accounts it has and which it does not, and none
of them will show you the matrix, because the matrix is sparse and sparse looks
bad. So callers discover coverage empirically, one disappointing account at a
time, and build folklore instead of reading a table.

**Identifiers do not line up, and the join gets guessed.** Six providers, six
private key spaces, no shared identifier. Something has to map your account to
each provider's notion of it, and in practice that something is a fuzzy string
match nobody audits. A fuzzy join between key spaces is a machine for
confidently attaching one company's facts to another company's record.

So the interesting problems are:

- Can a response make it **structurally impossible** to read a value without
  reading its state, rather than merely providing the state somewhere nearby?
- Can partial success be a **first-class, well-typed outcome** with correct HTTP
  semantics, instead of a `200` that lies or a `500` that discards work?
- Can the four flavours of absence be kept **distinct all the way to the caller**,
  with a closed vocabulary that a test can assert by name?
- Can **coverage be published** as a matrix rather than discovered by
  disappointment?
- Can the join between key spaces be **authored and auditable** rather than
  inferred by string similarity?
- Can a deadline be a **contract** — with the budget accounting returned — rather
  than a timeout the caller guesses at?

That is an API-design problem with an integration-honesty precondition, and it is
what this project builds. The research itself is deliberately not the
contribution. It is bought wholesale from the fourteen services already shipped.

## Intended user

Primary: an engineer wiring account research into something that runs unattended
— a routing job, a scoring pipeline, a nightly enrichment sweep — who needs the
response to tell them what they can and cannot rely on, without reading a blog
post about it.

Secondary: whoever reads the repo to judge whether the author can design a
contract that survives its upstreams misbehaving, and whether they will publish a
sparse coverage matrix rather than hide it behind a curated demo.

Explicitly not served: anyone who wants better research. The upstream capabilities
are Days 006, 007, 008, 013 and 014, shipped and deployed. **Do not rebuild them
here.** Anyone who wants a fit score (Day 001 `icp-score`), a persona map (Day 004
`persona-mapper`), or anything CRM-shaped (Days 009, 010, 012) — those take a
second caller-supplied definition or a CRM export, which would turn one input into
a form, and they are other days' subject matter.

## The thesis

**The envelope is the product.** Three commitments, in order of how much they
constrain the code:

1. **No naked values.** Every leaf in the response is a box —
   `{ value?, state, reason, capability, upstream_key?, observed_at? }`. There is
   no path through the document that yields a scalar without its state attached.
   This is enforced by a sweep invariant that walks every response in the
   cross-product and fails on any bare primitive, not by review discipline.
2. **Absence is five states and nine reasons, closed.** `resolved`, `unknown`,
   `absent`, `not_attempted`, `unavailable`, crossed with a closed reason
   vocabulary. No free-text explanations anywhere — free text drifts and cannot be
   asserted by name.
3. **The world the service integrates with is reported as it is.** Coverage is a
   published matrix. A deadline is a returned budget ledger. An upstream that
   answers a `POST` with a `404` HTML page — which one of them does, today — is a
   named, tested scenario rather than an unhandled promise rejection.

## Intended MVP scope

One required input: a company name, resolved against this service's own canonical
directory. Six capabilities, one dependency edge, two transports, one versioned
schema, a console that is nothing but a client.

Out of scope and named so it stays out: async job submission, response caching,
idempotency keys, authentication, per-caller quotas, batch input, webhooks, any
capability requiring a second caller-supplied definition, and any modification to
a sibling repository.

## Stack

House stack, inherited unchanged: Next 16 (App Router), React 19, TypeScript,
zod v4, Tailwind v4, vitest, npm, Vercel.

**No model. No `@google/genai` dependency, no API key, zero LLM calls.** The
first day in this series that is keyless by construction rather than by fallback.
Every upstream already spends its own model quota inside its own repo; Day 015's
work is resolution order, budget arithmetic, boundary validation and envelope
construction, and none of that wants a model. If a reviewer expects an "AI
project" here, the answer is that the intelligence is upstream and the
engineering is the contract — which is what the portfolio angle claims.

## Upstreams, as they actually are

Probed live on 2026-08-20. This table is the design input, not an aspiration.

| capability | upstream | endpoint | binding shape | observed behaviour |
|---|---|---|---|---|
| `identity` | Day 013 `domain-detective` | `POST /api/resolve` | free-form `{ query }` | works; returns `verdict.state: "ambiguous"` for Stripe — contested identity is real |
| `technographics` | Day 008 `techstack-icp` | `POST /api/inspect` | `{ url, asOf }` — needs a resolved domain | works on real domains; **rate-limited to 6/min**; `.example` domains cannot be fetched |
| `attributes` | Day 014 `company-classifier` | `POST /api/classify` | `{ companyId }` — its own key space | works for its own 24 fictional companies only |
| `why_now` | Day 007 `why-now` | `POST /api/hypotheses` | `{ companyId, sellerId }` — two of its own keys | works for its own 12 fictional companies only |
| `signals` | Day 005 `signal-scout` | `POST /api/board` | full `{ accounts, observations, watchlist, as_of }` payload | works; the binding is a *request*, not an identifier |
| `narrative` | Day 006 `account-brief` | `POST /api/brief` | `{ company_id }` — its own key space | **returns `404 text/html`** on the live deployment |

Two facts from this table drove the design more than anything decided in the
interview rounds.

**The sibling corpora are disjoint fictional company sets.** `company-classifier`
knows Hollowlight and Meridianflow. `why-now` knows Northwind Freight and Calder
Health. `signal-scout` knows Loudwave Labs and Northbeam Systems.
`domain-detective` knows twelve real companies and twelve RFC 2606 synthetics. The
only name appearing in two corpora is **Tessellate**. So "resolve a domain, fan
out to six providers, merge" — the design any orchestrator reaches for first —
cannot work, because no single company is addressable by more than a couple of
these services. That is not a flaw in the demo. It is the exact condition of every
real GTM stack, and reporting it is more valuable than engineering around it.

**One upstream returns HTML from a JSON endpoint.** `account-brief` is deployed
and serving its console at `200`, and its `POST /api/brief` route 404s with
`text/html`. This was not planned for; it was found. It is now scenario 7, and it
is the best argument in the repo for why boundary validation belongs at the
transport edge rather than in the consumer.

## Architecture

```
                    company name (the only required input)
                              │
                    ┌─────────▼──────────┐
                    │  canonical directory │  authored aliases → canonical id
                    └─────────┬──────────┘   miss ⇒ 404 unknown_company (caller error)
                              │
                    ┌─────────▼──────────┐
                    │      scheduler      │  one budget, tier slices, cascade accounting
                    └─────────┬──────────┘
                              │
        tier 0 ───────────────┴──────────────── tier 1 (concurrent)
          │                                       │
    ┌─────▼──────┐                    ┌───────────┼───────────┬──────────┬──────────┐
    │  identity  │                    │           │           │          │          │
    │ (Day 013)  │                attributes   why_now    signals   narrative      │
    └─────┬──────┘                 (Day 014)  (Day 007)  (Day 005)  (Day 006)      │
          │  resolved domain                                                        │
          └────────────────────────────► technographics (Day 008) ◄─────────────────┘
                                              one dependency edge
                              │
                    ┌─────────▼──────────┐
                    │  envelope builder   │  boxes every leaf, derives completeness
                    └─────────┬──────────┘
                              │
              POST /api/v1/research  ·  POST /api/v1/research/stream (SSE)
                              │
              ┌───────────────┼───────────────┐
          console        examples/         typed client
       (consumer 1)     (consumer 2)      (lib/client)
```

Every capability is a **provider** behind one injectable transport. Two transports
ship:

- **fixture** — committed responses with recorded per-capability latencies and
  recorded failures. Keyless, offline, deterministic. Drives every test and the
  healthy half of the console's dual view.
- **live** — real HTTP to a compile-time allowlist of the five sibling hosts. No
  user-supplied URL ever reaches it. This is the honest half of the dual view.

The transport is a documented request parameter, not a server secret, because the
console is not allowed to do anything a caller cannot (see *Decisions*, 3).

### The dependency edge, stated precisely

There is exactly **one** edge: `identity → technographics`, because
`techstack-icp` needs a URL and only `domain-detective` produces one. The other
four capabilities are bound by their own key spaces and do not need the resolved
domain, so they run regardless of whether identity resolved.

This is deliberately not overstated. A six-way cascade would be better material
and it would be fiction. The invariant the sweep asserts is the true one:
*identity unresolved ⇒ `technographics` is `not_attempted/dependency_failed`,
never `resolved`.*

## Data model

```ts
type FieldState =
  | "resolved"        // a value, and it means what it says
  | "unknown"         // capability ran, found nothing conclusive
  | "absent"          // capability ran, asserts the property does not exist
  | "not_attempted"   // never ran
  | "unavailable";    // ran, upstream failed

type FieldReason =
  | "ok"
  | "deadline"                 // budget exhausted before this capability ran
  | "dependency_failed"        // a prerequisite capability did not resolve
  | "unmapped"                 // no authored binding for this company × upstream
  | "upstream_error"           // non-2xx from upstream
  | "upstream_unconfigured"    // upstream reachable but not provisioned (e.g. 501 no key)
  | "upstream_rate_limited"    // 429; Retry-After propagated into the box
  | "boundary_violation"       // 2xx whose body failed the boundary schema
  | "excluded_by_caller";      // caller omitted this capability

type Field<T> = {
  value?: T;              // present iff state === "resolved". Never null.
  state: FieldState;
  reason: FieldReason;
  capability: CapabilityId;
  upstream_key?: string;  // the authored binding key actually used
  observed_at?: string;   // ISO date, from the upstream, never synthesised
  retry_after_s?: number; // only with upstream_rate_limited
};

type ResearchDocument = {
  schema_version: "1";
  request_id: string;        // per call, excluded from determinism comparison
  request_digest: string;    // stable hash over the canonicalised request
  company: { canonical_id: string; input: string; matched_alias?: string };
  completeness: "complete" | "partial" | "none";
  transport: "fixture" | "live";
  fields: { /* boxed leaves, grouped by capability */ };
  capabilities: Record<CapabilityId, {
    state: FieldState; reason: FieldReason; elapsed_ms?: number; upstream_key?: string;
  }>;
  budget: {
    granted_ms: number; tier0_slice_ms: number;
    remaining_after_tier0_ms: number; elapsed_ms: number;
  };
  deprecations: Array<{ path: string; replacement: string; sunset: string }>;
};
```

`value` is **omitted**, never `null`, when state is not `resolved`. Absence is
carried by the state, and a `null` alongside a state is two encodings of the same
fact waiting to disagree.

### Bindings

A **binding** is how this service's canonical company becomes a particular
upstream's request. Not always an identifier: for `signals` it is a whole
`{ accounts, observations, watchlist, as_of }` payload; for `why_now` it is a
`{ companyId, sellerId }` pair; for `technographics` it is a URL computed at
runtime from tier 0.

Bindings are **authored, never inferred.** `domain-detective` knows `northwind`
and `why-now` knows `northwind-freight`; these are different fictional companies
with similar names, and a fuzzy join would merge them. No string-similarity
matching exists anywhere in this repo. No binding ⇒ that capability is
`not_attempted/unmapped`, per field, and the coverage matrix says so up front.

### Authored evidence has a legal boundary

`signal-scout`'s binding requires supplying observations *about a company*. For
the roster's fictional members that is authoring consistent fiction, which every
day in this series does. For the real companies in `domain-detective`'s corpus it
would be publishing fabricated factual claims about identifiable third parties.

So: **`signals` bindings are authored only for synthetic roster members.** Real
companies get `not_attempted/unmapped` for `signals`, and the reason is a stated
boundary rather than an oversight. This mirrors `domain-detective`'s own real/
synthetic split, and it is why live coverage tops out at 3-of-6.

## Main states and workflows

1. **Complete** — every requested capability resolved. Reachable under the fixture
   transport. `completeness: "complete"`.
2. **Partial** — the normal outcome, and the one the envelope exists for. Some
   fields resolved, others carrying a state and a reason.
   `completeness: "partial"`.
3. **None** — nothing resolved: the deadline was too tight, or every capability is
   unmapped. Still a `200`, still a well-formed document.
   `completeness: "none"`.
4. **Caller error** — the input name is not in the canonical directory, the body is
   malformed, `deadline_ms` is out of range. `4xx`, and the only place this service
   returns one.

### HTTP status discipline

`200` for **any document this service successfully produced**, including one where
every field is `not_attempted`. `4xx` for caller error only. `5xx` only when *this
service* failed to produce a document.

`207` is WebDAV multi-status and is routinely misapplied to mean "some of this
worked"; `206` means a byte range. And the substantive argument: an upstream being
down is not this service failing. A truthful report of a degraded world *is* the
successful outcome, and demoting it to `5xx` teaches every caller's retry loop
exactly the wrong lesson — to retry a service that is working correctly.

Some reviewers expect `207`. That objection is named here and in the README rather
than hedged around.

Partial success is signalled machine-readably twice: `completeness` in the body,
`X-Research-Completeness` in the headers.

### Budget

One knob: `deadline_ms`, default 8000, max 30000. Tier 0 gets a slice of
`min(0.4 × budget, 4000)`. Tier 1 runs concurrently against the remainder. A
capability that does not land inside the remaining budget is
`not_attempted/deadline` — not `unavailable`, because nothing failed; the caller's
budget was tight, and the fix is theirs.

No per-capability timeouts. Six timeout parameters is knob surface nobody sets
correctly. The `budget` block returns the full accounting, which is what makes the
deadline a contract rather than a suggestion.

## Implementation task order

One commit per step, pushed to `main` immediately.

1. `docs: the plan — the envelope, five states, and the coverage matrix`
2. `docs: CLAUDE.md — boxed fields, closed reasons, banned vocabulary`
3. `chore: scaffold Next 16, no model dependency`
4. `feat: the envelope — boxed fields, five states, nine reasons`
5. `feat: capabilities, the dependency edge, upstream bindings`
6. `feat: the transports — fixture and the allowlisted live client`
7. `feat: the scheduler — one budget, tier slices, cascade accounting`
8. `feat: the roster, the binding directory, seven named scenarios`
9. `feat: v1 schema, /api/schema, one deprecated field with Sunset`
10. `test: the sweep — eight invariants over the full cross-product`
11. `feat: the routes — POST /api/v1/research and the SSE variant`
12. `feat: the console — coverage matrix, dual view, budget ledger`
13. `feat: exports and the typed client`
14. `feat: examples/ — the second consumer, public contract only`
15. `docs: README, plain-English guide, screenshots from the live deployment`

Steps 4-9 are the product. The sweep at 10 lands **before** the console at 12 —
Day 007's sweep caught a real visibility bug before its console existed, Day 014's
caught an ordering bug, and building UI first means debugging through pixels. If
the day runs short, 12-13 shrink. Never 10.

## Validation / test plan

`npm test` covers unit behaviour per module. `npm run sweep` asserts eight
invariants over the full cross-product of roster × capability subset × deadline
bucket × transport(fixture), with no network:

1. **No naked values.** Walk every response; fail on any primitive not inside a
   box.
2. **State/reason legality.** `resolved` never carries `deadline`;
   `not_attempted` never carries a `value`; `retry_after_s` appears only with
   `upstream_rate_limited`.
3. **The dependency edge holds.** Identity unresolved ⇒ `technographics` is
   `not_attempted/dependency_failed`, never resolved.
4. **Determinism.** Same `request_digest` ⇒ byte-identical document, excluding
   `budget` and `request_id`.
5. **Budget monotonicity.** Raising `deadline_ms` never turns a `resolved` field
   into a non-resolved one. This is the invariant that earns the script: a
   scheduler non-monotonic in its budget is broken in a way no single test case
   catches.
6. **`completeness` is derived.** It is recomputable from the field states and can
   never disagree with the body.
7. **Tolerant read, strict require.** Unrecognised upstream fields are ignored;
   a missing required upstream field yields `unavailable/boundary_violation` and
   never a throw.
8. **No privileged console.** Every field the console renders exists in
   `/api/schema`.

### The seven named scenarios

Asserted by name, not by shape:

1. **tier-0 timeout cascade** — identity misses its slice; `technographics`
   cascades.
2. **contested identity** — `domain-detective` returns `ambiguous`; the domain
   field is `unknown`, not a coin flip between survivors.
3. **upstream 500** — `unavailable/upstream_error`.
4. **slow but inside budget** — resolves; the budget ledger shows the cost.
5. **`absent` vs `unknown` for the same property** from two capabilities, both
   preserved, neither averaged.
6. **malformed 2xx body** — `unavailable/boundary_violation`.
7. **HTML from a JSON endpoint** — `account-brief`'s real `404 text/html`, caught
   at the transport edge. Found by probing, not invented.

Plus **forward compatibility**: an upstream fixture carrying extra unrecognised
fields must not break anything.

## Deployment plan

Vercel, keyless. No environment variables required for the fixture transport,
which is the default and drives the entire console demo. The live transport needs
no secrets either — the five sibling hosts are public and the allowlist is
compile-time data.

## README plan

Master-backlog structure. Load-bearing additions: the **coverage matrix** as a
real table with its sparsity visible; the fixture-vs-live dual screenshot; the
`207` objection stated and answered; the state × reason vocabulary as a reference
table; a curl example whose response is *partial*, not the happy path.

## Definition of done

- `npm test`, `npm run sweep`, `npm run typecheck`, `npm run build` all pass.
- Deployed on Vercel, working with no API key and no environment variables.
- `POST /api/v1/research` returns a fully boxed document under both transports.
- The SSE variant streams the same document progressively.
- `/api/schema` serves the v1 JSON Schema, generated from the route's own zod
  schemas, with the deprecated field flagged.
- Two independent consumers over the published contract: the console and
  `examples/`.
- `PLAN.md`, `CLAUDE.md`, `README.md`, `docs/plain-english-guide.md` committed.

## Commands

```bash
npm run dev        # dev server
npm run build      # production build — run before claiming done
npm test           # vitest run
npm run sweep      # eight invariants, full cross-product, no network
npm run typecheck  # next typegen && tsc --noEmit
npm run lint       # eslint
npm run probe      # hit the five live siblings, print the real coverage matrix
```

## Limitations, stated up front

- **Live coverage tops out at 3-of-6.** Because the sibling corpora are disjoint
  and authored evidence about real companies is off limits. The matrix is the
  deliverable; it is not going to get denser by trying harder.
- **The fixture transport's healthy world is authored.** It shows what a complete
  document looks like. It is not evidence that six providers would agree in
  reality.
- **Determinism is a fixture-transport guarantee only.** The live transport makes
  no such promise, and saying otherwise would be the exact species of lie this
  repo objects to.
- **No idempotency, no caching, no async jobs.** All three need durable storage,
  which was refused deliberately. Claiming idempotency without a store would be
  worse than not having it.
- **One dependency edge is a small graph.** The scheduler is honest about a
  two-tier world; it is not a general DAG executor, and pretending otherwise would
  be untested code.
- **The deprecated field is a demonstration.** A one-day-old repo has nothing
  genuinely deprecated, so one field was renamed on purpose to make the
  deprecation path real and testable. That is disclosed rather than implied.
- **Sibling repos are untouched.** Day 015 adapts to them as they are, including
  the one that 404s. Fixing an upstream to make the integration look better would
  defeat the point.

## Post-MVP, kept out of this build

Deliberately parked, not sneaked in later today: async job submission with a
durable store; `Idempotency-Key` and a response cache; a `?shape=flat` projection
for callers who accept the risk; authentication and per-caller quotas; batch
input; webhooks; a general DAG scheduler; a second schema version so migration is
demonstrated across two live versions rather than one deprecated field.

## Amendments made during the build

Recorded rather than folded in silently, so the plan stays readable as the
contract it was signed off as.

**A1 — `derivation_states`, added at step 5.** Day 014 reports each derived
attribute in one of four terminal states: `derived`, `contested`,
`insufficient`, `underdetermined`. Those distinctions are that repo's entire
argument, and this repo's five states have one bucket for three of them:
`unknown`. Adding a sixth state was rejected (decision 9 fixes five, and "ask
another service" is not a state); mapping `contested` onto `resolved` with one
of the competing values was rejected outright as the silent precedence both
repos refuse. So `fields.attributes.derivation_states` is a resolved box
carrying Day 014's own per-attribute vocabulary verbatim. Our envelope reports
what it can offer and quotes what it cannot, rather than paraphrasing a richer
vocabulary into a poorer one and pretending nothing was lost.

**A2 — tolerant read extends to enum values, clarified at step 5.** Decision 26
fixed tolerant-read/strict-require for *keys*. Enum values needed the same rule
and it was not stated: an unrecognised `verdict.state` from Day 013 becomes
`unknown`, not `boundary_violation`, because a new verdict is additive change.
A *missing* `purposes` array is still a violation. New values are tolerated;
absent structure is not.

**A3 — the banned vocabulary governs authored identifiers, not quotations.**
`signal-scout` returns `fit.score`, and a box's `value` may contain an upstream
payload using words this repo bans. Quoting an upstream inside a box is not
asserting it. What is banned is this repo *authoring* such an identifier — and
accordingly Day 005's point total and fit band are dropped rather than
re-exported as fields of ours, since re-exporting would launder another
service's arithmetic into something that looks like our own judgement.

## The 26 settled decisions

1. **Thesis:** the response envelope is the product; sibling composition is its
   material. Research quality rejected as Days 006 and 014's. Pure composition
   rejected as a mashup with nothing to fail.
2. **Capabilities are providers behind one injectable transport**, with a
   committed fixture transport and an allowlisted live transport. Vendoring
   sibling `lib/` code rejected — it makes every interesting failure a mock.
3. **Machine-first, and the console gets no privileges.** Enforced by sweep
   invariant 8, not by a README adjective. Consequently `transport` is a public
   request parameter.
4. **Compile-time host allowlist. No user-supplied URL reaches the network,
   ever.** A URL validator rejected: a validator is a promise, an allowlist is a
   fact.
5. **House stack inherited unchanged.** One day, feature-frozen, npm, Vercel, one
   commit per step pushed to `main`.
6. **Sync with a caller-declared deadline, plus an SSE variant. No job store.**
   Partial success needs a deadline, not durable storage. Async jobs are a
   different day.
7. **Six capabilities**, one required input. `icp-score` and `persona-mapper`
   excluded because they need a second caller-supplied definition, which turns one
   input into a form and re-opens Days 001 and 004.
8. **Every leaf is boxed. No naked primitive anywhere.** A provenance sidecar and
   per-section boxing both rejected: both make ignoring state the path of least
   resistance, which makes the contract advisory.
9. **Five states:** `resolved`, `unknown`, `absent`, `not_attempted`,
   `unavailable`. `unknown` vs `absent` is the distinction every vendor collapses;
   `not_attempted` vs `unavailable` is "your budget" vs "their outage".
10. **Nine reason codes, closed enum, no free text.** The sweep must be able to
    assert `unavailable/upstream_rate_limited` by name.
11. **`value` is omitted, never `null`, when state is not `resolved`.** Two
    encodings of absence would eventually disagree.
12. **One budget knob**, `deadline_ms`, default 8000, max 30000, tier-0 slice
    `min(0.4 × budget, 4000)`. Per-capability timeouts rejected as knob surface.
13. **The `budget` ledger is returned.** Publishing the accounting is what makes
    the deadline a contract.
14. **`200` for any document produced, including an all-`not_attempted` one.**
    `207` and `206` rejected on both specification and retry-semantics grounds; the
    objection is named in the README rather than hedged.
15. **Path version `/api/v1/`, `schema_version` echoed, JSON Schema at
    `/api/schema` generated from the routes' own zod schemas.** Media-type
    versioning rejected: correct in theory, and in practice every consumer forgets
    the `Accept` header and silently gets the wrong version.
16. **Deprecation is demonstrated, not described** — one renamed field, both names
    served and boxed, `Deprecation` and `Sunset` headers per RFC 8594, a
    `deprecations[]` array, and a test asserting the old name is *both* still
    served and still flagged.
17. **`request_digest` plus a determinism invariant under the fixture transport
    only.** Idempotency keys and response caches rejected — both need the store
    decision 6 refused, and claiming idempotency without one would be a lie.
18. **No model. No `@google/genai`. Zero LLM calls.** The intelligence is
    upstream; the engineering is the contract.
19. **Identifier disjointness is the subject, not an obstacle.** Retreating to
    fixtures-only, cutting to the two free-form upstreams, and fabricating the
    missing inputs were all rejected — the third outright, as manufacturing
    evidence.
20. **Bindings are authored request-constructors, never inferred.** No
    string-similarity matching exists in this repo. `northwind` and
    `northwind-freight` are different companies.
21. **`signals` bindings only for synthetic roster members.** Authoring
    observations about identifiable real companies would be publishing fabricated
    factual claims. This mirrors Day 013's own real/synthetic boundary and caps
    live coverage at 3-of-6.
22. **Sibling repositories are not modified.** Adapting to upstreams as they are —
    including the one returning `404 text/html` — is the entire job.
23. **The dependency edge is stated as the one edge it is:**
    `identity → technographics`. A six-way cascade would be better material and
    would be fiction.
24. **The console shows fixture and live side by side**, diffed, for the same
    company. The degradation is the best screenshot in the repo, not something to
    hide behind a toggle.
25. **Eight sweep invariants**, with budget monotonicity as the one that earns the
    script.
26. **Fifteen commits in the stated order, sweep before console.** Tolerant-read /
    strict-require at the boundary; unrecognised upstream fields ignored, missing
    required fields yield `boundary_violation`.
