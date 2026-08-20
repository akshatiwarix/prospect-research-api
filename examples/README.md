# examples

Two independent consumers of the public contract. Between them and the console
they are the evidence for the word *reusable* in this project's brief — the
console is consumer #1, these are #2 and #3, and none of them can reach anything
a `curl` cannot.

Each imports exactly one thing from the repo: `lib/client`, which is `fetch` plus
the published types. No fixture, no roster, no scheduler.

```bash
npm run example:coverage                                      # localhost, fixture transport
npm run example:coverage -- https://your-deployment.app live  # a deployment, real upstreams
npm run example:stream   -- http://localhost:3000 datadog live
```

`coverage-report.mts` asks the directory what exists, researches every company in
it, and reports how much came back and **why the rest did not**. That the second
half is answerable at all is the point: against a flat enrichment response, "why
is this field empty" is not a question the payload can answer, so this script
could not be written.

`stream.mts` consumes the SSE route and prints each capability as it settles.
Worth running with `live`, where the ordering is real — the unmapped capabilities
land instantly because nothing is sent, and the slow upstream arrives a second
and a half later.
