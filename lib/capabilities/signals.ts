import { z } from "zod";

import { absent, resolved, type Field } from "@/lib/envelope";
import type { Capability, FieldMap } from "./types";

/**
 * `signals` — Day 005 `signal-scout`, `POST /api/board`.
 *
 * The binding here is not an identifier at all: Day 005's route takes the whole
 * `{ accounts, observations, watchlist, as_of }` payload, because it is a pure
 * engine over data the caller holds. So this repo's directory carries the payload
 * itself, which is the general case that "identifier reconciliation" turns out to
 * be a special case of. Naming the concept *binding* rather than *id mapping* was
 * the right call for exactly this upstream.
 *
 * Two things are deliberately not surfaced.
 *
 * The row's point total is dropped. Day 005 computes a 0–100 number and is
 * careful and honest about it, but a number implying calibrated belief is banned
 * repo-wide (Days 007 and 014 banned it for the same reason), and re-exporting
 * one through this envelope would launder it into a field that looks like this
 * service's own judgement. The events and their families come through; the
 * arithmetic stays at Day 005, where its rules are printed.
 *
 * The account's `fit` block is dropped for the same reason.
 *
 * The banned-vocabulary rule governs identifiers **this repo authors**. Upstream
 * payload quoted verbatim inside a box's `value` is a quotation, not an
 * assertion — which is why the words can still appear inside, say, a
 * `technologies` payload without this being a contradiction.
 */

// `looseObject`: signals are forwarded verbatim into a box, so a stripping
// schema would validate and then quietly delete half the payload.
const signalSchema = z.looseObject({
  key: z.string().min(1),
  type: z.string().min(1),
  family: z.string().optional(),
  subject: z.string().optional(),
  direction: z.string().optional(),
  anchor_at: z.string().optional(),
});

const familySchema = z.looseObject({
  family: z.string().min(1),
  points: z.number(),
  cap: z.number(),
  clipped: z.number().optional(),
});

const rowSchema = z.object({
  account: z.object({ id: z.string().min(1), name: z.string().optional(), domain: z.string().optional() }),
  families: z.array(familySchema),
  signals: z.array(signalSchema),
});

const signalsBoundarySchema = z.object({
  as_of: z.string().min(1),
  watchlist_name: z.string().min(1),
  rows: z.array(rowSchema),
});

export type SignalsParsed = z.infer<typeof signalsBoundarySchema>;

/**
 * The payload this service holds on the company's behalf. Kept as `unknown` for
 * the inner records: they are Day 005's schema, Day 005 validates them, and
 * restating that schema here would be a second copy to drift.
 */
export const signalsBindingSchema = z.object({
  accounts: z.array(z.unknown()).min(1),
  observations: z.array(z.unknown()),
  watchlist: z.unknown(),
});

export type SignalsBinding = z.infer<typeof signalsBindingSchema>;

const CONTRIBUTES = ["signal_events", "signal_families", "watchlist_name"] as const;

export const signals: Capability<SignalsBinding, SignalsParsed> = {
  id: "signals",
  upstream: "signal_scout",
  tier: 1,
  dependsOn: [],
  contributes: CONTRIBUTES,
  bindingSchema: signalsBindingSchema,
  buildRequest: (binding, context) => ({
    path: "/api/board",
    body: {
      accounts: binding.accounts,
      observations: binding.observations,
      watchlist: binding.watchlist,
      as_of: context.as_of,
    },
  }),
  // The account id buried in the payload. A binding that is a whole request
  // still has to name what it is about.
  keyFor: (binding) => {
    const [first] = binding.accounts;
    const id = (first as { id?: unknown } | undefined)?.id;
    return typeof id === "string" ? id : "unknown-account";
  },
  boundarySchema: signalsBoundarySchema,
  toFields: (parsed, upstreamKey): FieldMap => {
    const [row] = parsed.rows;

    // No row for a payload we supplied ourselves means the engine ran and found
    // the account uninteresting — an affirmative absence, not a lookup miss.
    if (!row) {
      return {
        signal_events: absent("signals", upstreamKey),
        signal_families: absent("signals", upstreamKey),
        watchlist_name: resolved("signals", parsed.watchlist_name, upstreamKey, parsed.as_of),
      };
    }

    return {
      signal_events: eventsField(row.signals, upstreamKey, parsed.as_of),
      signal_families: resolved("signals", row.families, upstreamKey, parsed.as_of),
      watchlist_name: resolved("signals", parsed.watchlist_name, upstreamKey, parsed.as_of),
    };
  },
};

function eventsField(
  events: SignalsParsed["rows"][number]["signals"],
  upstreamKey: string,
  asOf: string,
): Field<unknown> {
  return events.length > 0
    ? resolved("signals", events, upstreamKey, asOf)
    : absent("signals", upstreamKey);
}
