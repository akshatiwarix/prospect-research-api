import { attributes } from "./attributes";
import { identity } from "./identity";
import { narrative } from "./narrative";
import { signals } from "./signals";
import { technographics } from "./technographics";
import { whyNow } from "./why-now";
import { CAPABILITY_IDS, erase, type AnyCapability, type CapabilityId } from "./types";

export * from "./types";
export { identity, resolvedDomain } from "./identity";
export { technographics } from "./technographics";
export { attributes, DERIVED_ATTRIBUTES } from "./attributes";
export { whyNow, whyNowBindingSchema } from "./why-now";
export { signals, signalsBindingSchema } from "./signals";
export { narrative } from "./narrative";

/**
 * The registry. Key order is the declaration order of `CAPABILITY_IDS`, and it is
 * the order everything downstream iterates in — the document's `fields`, the
 * console's columns, the coverage matrix. Deterministic serialisation depends on
 * it, so this is sorted by intent rather than by whatever `Object.keys` felt
 * like.
 */
export const CAPABILITIES: Record<CapabilityId, AnyCapability> = {
  identity: erase(identity),
  technographics: erase(technographics),
  attributes: erase(attributes),
  why_now: erase(whyNow),
  signals: erase(signals),
  narrative: erase(narrative),
};

export const CAPABILITY_LIST = CAPABILITY_IDS.map((id) => CAPABILITIES[id]);

/** Tier 0 first, then tier 1. The scheduler relies on this being total. */
export const TIER_0 = CAPABILITY_LIST.filter((capability) => capability.tier === 0);
export const TIER_1 = CAPABILITY_LIST.filter((capability) => capability.tier === 1);
