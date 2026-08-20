import { describe, expect, it } from "vitest";

import { FixtureError, fixtureTransport, liveTransport, realClock, virtualClock } from "./index";
import type { FixtureStore } from "./index";

const store: FixtureStore = [
  { upstream: "domain_detective", key: "stripe", latency_ms: 240, body: { entity: { id: "stripe" } } },
  { upstream: "techstack_icp", key: "slow.example", latency_ms: 9000, body: { url: "x" } },
  {
    upstream: "account_brief",
    key: "tessellate",
    latency_ms: 120,
    failure: { reason: "upstream_error", detail: "404 text/html" },
  },
  {
    upstream: "techstack_icp",
    key: "limited.example",
    latency_ms: 80,
    failure: { reason: "upstream_rate_limited", retry_after_s: 42, detail: "429" },
  },
];

const request = (upstream: FixtureStore[number]["upstream"], key: string, budget_ms = 8000) => ({
  upstream,
  path: "/api/x",
  body: {},
  upstreamKey: key,
  budget_ms,
});

describe("the fixture transport", () => {
  it("reports recorded latency instead of sleeping for it", async () => {
    const before = Date.now();
    const outcome = await fixtureTransport(store).send(request("techstack_icp", "slow.example", 20000));
    expect(outcome.elapsed_ms).toBe(9000);
    expect(Date.now() - before).toBeLessThan(500);
  });

  it("enforces the budget it was given", async () => {
    const outcome = await fixtureTransport(store).send(request("techstack_icp", "slow.example", 3000));
    expect(outcome).toMatchObject({ ok: false, reason: "timeout", elapsed_ms: 3000 });
  });

  it("replays a recorded failure with its retry advice", async () => {
    const outcome = await fixtureTransport(store).send(request("techstack_icp", "limited.example"));
    expect(outcome).toMatchObject({ ok: false, reason: "upstream_rate_limited", retry_after_s: 42 });
  });

  it("throws on a missing fixture rather than blaming an upstream it never called", async () => {
    await expect(fixtureTransport(store).send(request("why_now", "nobody"))).rejects.toThrow(FixtureError);
  });

  it("rejects a fixture recording both a body and a failure", () => {
    expect(() =>
      fixtureTransport([
        { upstream: "why_now", key: "k", latency_ms: 1, body: {}, failure: { reason: "upstream_error", detail: "x" } },
      ]),
    ).toThrow(/exactly one of body or failure/);
  });

  it("rejects duplicate fixtures, which would make lookup order load-bearing", () => {
    expect(() =>
      fixtureTransport([
        { upstream: "why_now", key: "k", latency_ms: 1, body: {} },
        { upstream: "why_now", key: "k", latency_ms: 2, body: {} },
      ]),
    ).toThrow(/duplicate fixture/);
  });
});

describe("the live transport's status mapping", () => {
  const send = (response: Response) =>
    liveTransport(async () => response).send(request("account_brief", "tessellate"));

  it("maps 429 to rate limiting and keeps Retry-After", async () => {
    const outcome = await send(new Response("{}", { status: 429, headers: { "retry-after": "30" } }));
    expect(outcome).toMatchObject({ ok: false, reason: "upstream_rate_limited", retry_after_s: 30 });
  });

  it("maps 501 to unconfigured, because retrying it is pointless", async () => {
    const outcome = await send(new Response(JSON.stringify({ error: "no key" }), { status: 501 }));
    expect(outcome).toMatchObject({ ok: false, reason: "upstream_unconfigured" });
  });

  it("maps an HTML 404 to upstream_error, not to a boundary violation", async () => {
    // Day 006's real live behaviour. Parsing first would blame the payload for
    // what is a routing problem.
    const outcome = await send(
      new Response("<!DOCTYPE html><html></html>", { status: 404, headers: { "content-type": "text/html" } }),
    );
    expect(outcome).toMatchObject({ ok: false, reason: "upstream_error" });
    expect((outcome as { detail: string }).detail).toContain("404");
  });

  it("passes a 2xx of unparseable JSON upward as undefined, for the boundary schema to reject", async () => {
    const outcome = await send(new Response("not json", { status: 200 }));
    expect(outcome).toMatchObject({ ok: true, body: undefined });
  });

  it("reports an aborted request as timeout rather than as an upstream fault", async () => {
    const transport = liveTransport(() => {
      const error = new Error("aborted");
      error.name = "AbortError";
      return Promise.reject(error);
    });
    const outcome = await transport.send(request("account_brief", "tessellate", 50));
    expect(outcome).toMatchObject({ ok: false, reason: "timeout" });
  });

  it("reports a network failure as an upstream error", async () => {
    const transport = liveTransport(() => Promise.reject(new Error("ECONNREFUSED")));
    const outcome = await transport.send(request("account_brief", "tessellate"));
    expect(outcome).toMatchObject({ ok: false, reason: "upstream_error", detail: "ECONNREFUSED" });
  });
});

describe("clocks", () => {
  it("advances virtually and monotonically", () => {
    const clock = virtualClock();
    expect(clock.now()).toBe(0);
    clock.advance(240);
    clock.advance(1000);
    expect(clock.now()).toBe(1240);
  });

  it("ignores advance on the real clock", () => {
    const clock = realClock();
    clock.advance(5000);
    expect(clock.now()).toBeLessThan(1000);
  });
});
