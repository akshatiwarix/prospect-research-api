# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Day 015 of a 100-day building challenge. `PLAN.md` is the contract — 26 settled
decisions, signed off before any code was written. It is not a suggestion and not
a starting point to improve on. If something here contradicts `PLAN.md`,
`PLAN.md` wins; if the code contradicts either, the code is wrong.

## What this repo is

An orchestration layer over five live sibling deployments (Days 005, 006, 007,
008, 013). It contains **no research logic** and **no model calls**. Its subject
is the response envelope: every value boxed with its provenance and state,
partial success as a first-class outcome, and coverage published rather than
hidden.

If you find yourself writing extraction, classification, scoring or synthesis
logic, stop — that belongs to a sibling repo that already shipped it.

## Commands

```bash
npm run dev        # dev server
npm run build      # production build — run before claiming done
npm test           # vitest run (globs lib/**/*.test.ts only)
npm run test:watch # watch mode
npm run sweep      # eight invariants, full cross-product, no network
npm run typecheck  # next typegen && tsc --noEmit
npm run lint       # eslint
npm run probe      # hit the five live siblings, print the real coverage matrix
```

Run a single test: `npx vitest run lib/envelope/box.test.ts`
Run a single test by name: `npx vitest run -t "omits value when unresolved"`

`npm run sweep` is not a slower `npm test`. It asserts invariants over the full
cross-product of roster × capability subset × deadline bucket, and it is the only
thing that can catch budget non-monotonicity. It must pass before any claim that
the build works.

## Architecture

Four layers, and the boundaries between them are load-bearing:

1. **`lib/envelope/`** — `Field<T>` boxes, the state and reason enums, document
   assembly, `completeness` derivation. Pure. Knows nothing about HTTP or
   upstreams.
2. **`lib/capabilities/`** — one provider per upstream, each declaring its
   binding shape and its boundary schema. Providers do not perform I/O; they
   describe a request and validate a response.
3. **`lib/transport/`** — the injectable seam. `fixture` reads committed
   responses with recorded latencies; `live` performs HTTP against a compile-time
   host allowlist. Every non-2xx, every unparseable body, and every rate-limit
   header is translated into a state/reason pair *here*, never above.
4. **`lib/scheduler/`** — one budget, the tier-0 slice, the single dependency
   edge, cascade accounting. Decides what runs and what becomes
   `not_attempted`.

`app/api/v1/research/` is thin: validate, schedule, serialise. Logic in a route
handler is a bug.

The one dependency edge is `identity → technographics`, because `techstack-icp`
needs a URL that only `domain-detective` produces. The other four capabilities
run regardless. Do not add edges that do not exist in the upstreams.

## Rules that the code must enforce structurally

**No naked values.** Every leaf in a response is a `Field<T>`. Not "mostly" — a
sweep invariant walks every document in the cross-product and fails on any bare
primitive. If a new field is convenient to add unboxed, that convenience is the
thing being prevented.

**`value` is omitted when state is not `resolved`. Never `null`.** Two encodings
of absence will eventually disagree.

**Five states, nine reasons, both closed enums, no free text.** `resolved`,
`unknown`, `absent`, `not_attempted`, `unavailable`. Reasons: `ok`, `deadline`,
`dependency_failed`, `unmapped`, `upstream_error`, `upstream_unconfigured`,
`upstream_rate_limited`, `boundary_violation`, `excluded_by_caller`. Adding a
tenth reason is a `PLAN.md` amendment, recorded in a commit, not a quiet edit.
Hand-written per-case explanation strings are banned — they drift.

**Bindings are authored, never inferred.** No string-similarity matching, no
fuzzy joins, no normalisation-then-compare between key spaces. `northwind`
(Day 013) and `northwind-freight` (Day 007) are different fictional companies. No
binding means `not_attempted/unmapped`, and that is a correct answer.

**`signals` bindings only for synthetic roster members.** Authoring observations
about identifiable real companies would be publishing fabricated factual claims
about third parties. This caps live coverage at 3-of-6 and that cap is
deliberate.

**Sibling repositories are not modified.** Including the one whose
`POST /api/brief` returns `404 text/html`. Adapting to upstreams as they are is
the job; fixing one to make the integration look better defeats the point.

**Boundary policy: tolerant read, strict require.** Unrecognised fields from an
upstream are ignored so additive upstream change cannot break this service. A
missing *required* field is `unavailable/boundary_violation` — never a throw,
never a smuggled `null`.

**The console gets no privileges.** It is a client of the published API. Every
field it renders must exist in `/api/schema`, asserted by sweep invariant 8. No
server-side shortcuts, no undocumented fields, no importing `lib/scheduler/`
into a component.

**HTTP status discipline.** `200` for any document this service produced,
including an all-`not_attempted` one. `4xx` only for caller error. `5xx` only
when this service itself failed. Do not "improve" this to `207` — the argument
against it is in `PLAN.md` and in the README.

## Banned vocabulary, repo-wide

`confidence`, `score`, `probability`, `accuracy`, `certainty` — in identifiers,
types, JSON keys, UI copy and comments. This service reports states and reasons.
A number implying calibrated belief would be unearned, and inherited from Days
007 and 014 for the same reason.

Also banned: `null` as a field value, `unclear` as an enum member, and
`fallback` as a verb describing what to do when an upstream fails. There is no
fallback; there is a state.

## Determinism

Determinism is guaranteed under the **fixture** transport only: same
`request_digest` ⇒ byte-identical document, excluding `budget` and `request_id`.
The live transport promises nothing of the kind, and the README says so. Do not
write a test that assumes live-transport stability, and do not weaken the
fixture invariant to accommodate one.

## Build discipline

Fifteen commits in the order given by `PLAN.md`, one per step, each pushed to
`main` immediately. The sweep (step 10) lands **before** the console (step 12);
if the day runs short, steps 12-13 shrink and step 10 never moves.

Feature-frozen at plan sign-off. The post-MVP list in `PLAN.md` — async jobs,
idempotency keys, caching, auth, batch input, a general DAG scheduler — stays
out. If one of them looks necessary mid-build, it is a finding to record, not a
feature to add.
