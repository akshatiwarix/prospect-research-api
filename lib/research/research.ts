import { deriveCompleteness, requestDigest, type Field } from "@/lib/envelope";
import { CAPABILITY_IDS, type CapabilityId, type FieldMap } from "@/lib/capabilities";
import { fixtureTransport, liveTransport, realClock, virtualClock, type Clock, type Transport } from "@/lib/transport";
import { schedule, type ScheduleInput } from "@/lib/scheduler";
import { DEPRECATED_ALIASES, DEPRECATIONS, SCHEMA_VERSION, type ResearchRequest, type ResearchResponse } from "@/lib/schema";
import { FIXTURE_STORE } from "@/data/fixtures";
import { lookup } from "@/data/roster";

/**
 * The use case, in one function. Both routes and the console call this and
 * nothing else, which is how "the console has no privileges" stays true by
 * construction rather than by discipline.
 */

export class UnknownCompany extends Error {
  constructor(readonly input: string) {
    super(`This service has no directory entry for '${input}'.`);
  }
}

export type ResearchOptions = {
  /** Injected so the sweep can hold it constant; excluded from determinism. */
  request_id: string;
  transport?: Transport;
  clock?: Clock;
  /**
   * Fired once, as soon as the directory has resolved the company and the digest
   * is computable — before any upstream is touched. The streaming route needs
   * this to be genuinely first, so the digest is computed here rather than at the
   * end where it reads more naturally.
   */
  onOpen?: (open: { company: ResearchResponse["company"]; request_digest: string }) => void;
  /** Forwarded to the scheduler, for the streaming route. */
  onSettled?: ScheduleInput["onSettled"];
};

/**
 * The fixture transport gets a virtual clock and the live one gets a real clock.
 *
 * That pairing is not incidental. Fixture latencies are reported rather than
 * slept, so a real clock would read near-zero and the budget ledger would claim
 * a 1,860ms upstream cost nothing. A virtual clock advanced by the reported
 * latencies produces the ledger the caller would have seen if the same responses
 * had arrived over the wire.
 */
export function transportFor(id: ResearchRequest["transport"]): { transport: Transport; clock: Clock } {
  return id === "live"
    ? { transport: liveTransport(), clock: realClock() }
    : { transport: fixtureTransport(FIXTURE_STORE), clock: virtualClock() };
}

export async function research(
  request: ResearchRequest,
  options: ResearchOptions,
): Promise<ResearchResponse> {
  const found = lookup(request.company);
  if (!found.found) throw new UnknownCompany(request.company);

  const { transport, clock } = options.transport && options.clock
    ? { transport: options.transport, clock: options.clock }
    : transportFor(request.transport);

  const requested = request.capabilities ?? CAPABILITY_IDS;

  const company: ResearchResponse["company"] = {
    canonical_id: found.entry.canonical_id,
    input: request.company,
    ...(found.matched_alias ? { matched_alias: found.matched_alias } : {}),
  };

  // The digest covers the *canonical* request — the company as this service
  // understands it, not the string that was typed — plus every knob that can
  // change the answer. Two callers who spell Stripe differently asked the same
  // question and get the same digest. Computed before any I/O so the streaming
  // route can announce it first.
  const request_digest = requestDigest({
    company: found.entry.canonical_id,
    capabilities: [...requested].sort(),
    deadline_ms: request.deadline_ms,
    transport: request.transport,
    as_of: request.as_of,
  });

  options.onOpen?.({ company, request_digest });

  const result = await schedule({
    bindings: found.entry.bindings,
    requested,
    deadline_ms: request.deadline_ms,
    as_of: request.as_of,
    transport,
    clock,
    onSettled: options.onSettled,
  });

  const fields = withDeprecatedAliases(result.fields);

  return {
    schema_version: SCHEMA_VERSION,
    request_id: options.request_id,
    request_digest,
    company,
    completeness: deriveCompleteness(result.capabilities),
    transport: transport.id,
    fields,
    capabilities: result.capabilities,
    budget: result.budget,
    deprecations: [...DEPRECATIONS],
  } as ResearchResponse;
}

/**
 * Adds the deprecated key as a reference to the *same box object* its
 * replacement holds. Aliasing by reference rather than by copy means the pair
 * cannot drift into disagreeing — the failure mode of every alias maintained by
 * duplication.
 */
function withDeprecatedAliases(
  fields: Record<CapabilityId, FieldMap>,
): Record<CapabilityId, FieldMap> {
  const next = { ...fields };

  for (const alias of DEPRECATED_ALIASES) {
    const map = next[alias.capability];
    const box: Field<unknown> | undefined = map?.[alias.to];
    if (map && box) next[alias.capability] = { ...map, [alias.from]: box };
  }

  return next;
}
