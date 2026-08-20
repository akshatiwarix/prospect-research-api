"use client";

import { useCallback, useEffect, useState } from "react";

import { BudgetLedger } from "./BudgetLedger";
import { CoverageMatrix } from "./CoverageMatrix";
import { DocumentView } from "./DocumentView";
import { Exports } from "./Exports";
import { Mono, Panel } from "./ui";
import type { Directory, ResearchDocument } from "./types";

/**
 * The console, which is a client of this API and nothing more.
 *
 * Every byte on screen arrived through `POST /api/v1/research`,
 * `GET /api/v1/directory` or `GET /api/schema`. Nothing is imported from `lib/`,
 * no server component pre-computes anything, and there is no request this page
 * can make that a `curl` cannot. That constraint is enforced from the outside by
 * sweep invariant 8, which fails if any rendered field path is absent from the
 * published schema — because "API-first" left to good intentions becomes a
 * README adjective within a day.
 *
 * Both transports are fetched for the same request, in parallel, and shown side
 * by side. The degradation is not hidden behind a toggle: it is the best
 * screenshot in the repo.
 */
export function Console() {
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [company, setCompany] = useState("tessellate");
  const [deadline, setDeadline] = useState(8000);
  // Empty until the directory arrives, then filled from it. A hardcoded list
  // here would be a second copy of the capability set, drifting the moment one is
  // added — and the endpoint that publishes it already exists for the matrix.
  const [selected, setSelected] = useState<string[]>([]);
  const [fixture, setFixture] = useState<ResearchDocument | null>(null);
  const [live, setLive] = useState<ResearchDocument | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);


  /**
   * `capabilities` is a parameter rather than only state because the first run
   * fires from inside the directory fetch, before `selected` has been committed.
   * Threading it explicitly beats a second effect that watches for state to
   * arrive and then calls setState — which is both a lint error and a race.
   */
  const run = useCallback(
    async (capabilities: string[] = selected) => {
      if (capabilities.length === 0) return;
      setRunning(true);
      setLiveError(null);

      const body = (transport: "fixture" | "live") => ({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ company, deadline_ms: deadline, capabilities, transport }),
      });

      // Fixture first and awaited separately, so the deterministic column paints
      // immediately rather than waiting on six live deployments.
      try {
        const response = await fetch("/api/v1/research", body("fixture"));
        setFixture(response.ok ? await response.json() : null);
      } catch {
        setFixture(null);
      }

      try {
        const response = await fetch("/api/v1/research", body("live"));
        if (response.ok) setLive(await response.json());
        else {
          setLive(null);
          setLiveError(`${response.status}`);
        }
      } catch (error) {
        setLive(null);
        setLiveError(error instanceof Error ? error.message : "request failed");
      }

      setRunning(false);
    },
    [company, deadline, selected],
  );

  useEffect(() => {
    void fetch("/api/v1/directory")
      .then((response) => response.json() as Promise<Directory>)
      .then((payload) => {
        const capabilities = payload.capabilities.map((capability) => capability.id);
        setDirectory(payload);
        setSelected(capabilities);
        // The first run, so the page is never empty. Later runs are deliberate —
        // hitting six live deployments on every slider tick would be rude to
        // services that rate-limit.
        void run(capabilities);
      })
      .catch(() => setDirectory(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (id: string) =>
    setSelected((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));

  return (
    <div className="mx-auto flex max-w-[110rem] flex-col gap-3 p-3">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="text-sm font-semibold">
          Prospect Research API
          <span className="ml-2 font-normal text-neutral-500">every value carries its state</span>
        </h1>
        <p className="text-[11px] text-neutral-500">
          Day 015 of 100. Orchestrates five live deployments — Days 005, 006, 007, 008, 013. No model, no API key.
        </p>
      </header>

      <div className="grid gap-3 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <Panel
            title="Request"
            subtitle="The console sends exactly what curl would. transport is a public parameter, not a server switch."
          >
            <div className="space-y-3 px-3 py-2">
              <label className="block">
                <span className="text-[10px] uppercase tracking-widest text-neutral-500">company</span>
                <input
                  value={company}
                  onChange={(event) => setCompany(event.target.value)}
                  className="mt-1 w-full rounded border border-neutral-300 bg-transparent px-2 py-1 font-mono text-[11px] dark:border-neutral-700"
                />
              </label>

              <label className="block">
                <span className="flex items-baseline justify-between text-[10px] uppercase tracking-widest text-neutral-500">
                  deadline_ms <Mono className="normal-case tracking-normal">{deadline}</Mono>
                </span>
                <input
                  type="range"
                  min={100}
                  max={30000}
                  step={100}
                  value={deadline}
                  onChange={(event) => setDeadline(Number(event.target.value))}
                  className="mt-1 w-full accent-sky-600"
                />
              </label>

              <fieldset>
                <legend className="text-[10px] uppercase tracking-widest text-neutral-500">capabilities</legend>
                <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5">
                  {(directory?.capabilities ?? []).map((capability) => (
                    <label
                      key={capability.id}
                      title={`${capability.shipped_by}${capability.depends_on.length > 0 ? ` — needs ${capability.depends_on.join(", ")}` : ""}`}
                      className="flex items-center gap-1.5"
                    >
                      <input
                        type="checkbox"
                        checked={selected.includes(capability.id)}
                        onChange={() => toggle(capability.id)}
                        className="accent-sky-600"
                      />
                      <Mono className="text-neutral-600 dark:text-neutral-300">{capability.id}</Mono>
                    </label>
                  ))}
                </div>
              </fieldset>

              <button
                onClick={() => void run()}
                disabled={running || selected.length === 0}
                className="w-full rounded bg-neutral-900 px-2 py-1.5 text-[11px] font-medium text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900"
              >
                {running ? "asking six upstreams…" : "research"}
              </button>
            </div>
          </Panel>

          {fixture && (
            <Panel title="Budget ledger" subtitle="Fixture transport, virtual clock — the latencies are recorded.">
              <BudgetLedger document={fixture} />
            </Panel>
          )}

          {live && (
            <Panel title="Budget ledger — live" subtitle="Real clock, real deployments, right now.">
              <BudgetLedger document={live} />
            </Panel>
          )}

          {fixture && (
            <Panel title="Exports" subtitle="The CSV is built by the API, not the browser — one format, one implementation.">
              <Exports
                document={fixture}
                request={{ company, deadline_ms: deadline, capabilities: selected, transport: "fixture" }}
              />
            </Panel>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div className="grid gap-3 xl:grid-cols-2">
            <Panel
              title="Fixture transport"
              subtitle="Recorded responses, plus authored ones where the network cannot answer. Deterministic."
            >
              {fixture ? (
                <DocumentView document={fixture} counterpart={live ?? undefined} label="fixture" />
              ) : (
                <p className="px-3 py-2 text-[11px] text-neutral-500">No document.</p>
              )}
            </Panel>

            <Panel
              title="Live transport"
              subtitle="Five public sibling deployments, allowlisted at compile time. Whatever they are doing today."
            >
              {live ? (
                <DocumentView document={live} counterpart={fixture ?? undefined} label="live" />
              ) : (
                <p className="px-3 py-2 text-[11px] text-neutral-500">
                  {liveError ? `The live request returned ${liveError}.` : "No document."}
                </p>
              )}
            </Panel>
          </div>

          {directory && (
            <Panel title="Coverage matrix" subtitle={directory.note}>
              <CoverageMatrix
                directory={directory}
                selected={company}
                onSelect={(canonicalId) => {
                  setCompany(canonicalId);
                }}
              />
            </Panel>
          )}
        </div>
      </div>

      <footer className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-neutral-500">
        <a className="underline decoration-dotted" href="/api/schema">
          /api/schema
        </a>
        <a className="underline decoration-dotted" href="/api/v1/directory">
          /api/v1/directory
        </a>
        <span>
          <Mono>POST /api/v1/research</Mono> · <Mono>POST /api/v1/research/stream</Mono>
        </span>
      </footer>
    </div>
  );
}
