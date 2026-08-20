/**
 * The allowlist. Compile-time data, and the entire reason the SSRF argument that
 * Days 006 and 013 made still holds in a repo that talks to the network.
 *
 * A URL validator would be a promise. This is a fact: there is no code path in
 * this repo that turns caller input into a host. If a name is not in this
 * object, no request can be addressed to it.
 */
export const UPSTREAM_HOSTS = {
  domain_detective: "https://domain-detective-six.vercel.app",
  techstack_icp: "https://techstack-icp.vercel.app",
  company_classifier: "https://company-classifier-seven.vercel.app",
  why_now: "https://why-now.vercel.app",
  signal_scout: "https://signal-scout-weld.vercel.app",
  account_brief: "https://account-brief.vercel.app",
} as const;

export type UpstreamId = keyof typeof UPSTREAM_HOSTS;

/** Which day shipped each upstream. Printed in the console and the README. */
export const UPSTREAM_ORIGIN: Record<UpstreamId, { day: string; repo: string }> = {
  domain_detective: { day: "Day 013", repo: "domain-detective" },
  techstack_icp: { day: "Day 008", repo: "techstack-icp" },
  company_classifier: { day: "Day 014", repo: "company-classifier" },
  why_now: { day: "Day 007", repo: "why-now" },
  signal_scout: { day: "Day 005", repo: "signal-scout" },
  account_brief: { day: "Day 006", repo: "account-brief" },
};
