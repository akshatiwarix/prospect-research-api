# Prospect Research API — how it works (plain English)

No code in this document. If you buy or integrate enrichment data for a living,
this is the whole system.

---

## The thing that goes wrong

You have wired an enrichment provider into your CRM. A record comes back:

> headcount: 340 · industry: Payments · tech stack: (empty) · funding: (empty)

Two of those fields are filled and two are empty, and here is the problem: you
have no idea what the empty ones mean. There are at least four completely
different explanations, and they need four completely different responses from
you.

**One — they looked and there is genuinely nothing.** This company has no funding
to report. It is bootstrapped. The field is empty because the world is empty. If
you queue this account up to be re-enriched every month for a year, you will get
the same empty field twelve times and pay for it twelve times.

**Two — they looked and could not tell.** Maybe there were three candidate
answers and the provider would not guess. Maybe the source was ambiguous. There
*is* an answer out there; nobody has pinned it down. This one might be worth
another look, or worth a human.

**Three — they never looked.** Your request had a time limit and this lookup was
at the back of the queue when the clock ran out. Nothing is wrong with anything.
Ask again with a longer limit and you will probably get an answer.

**Four — they looked and it broke.** Their upstream returned a 500, or their
credentials expired, or the endpoint moved last Tuesday. Somebody needs to be
told, and it is not going to fix itself.

Retry. Stop asking. Raise the timeout. Page someone. Four different actions, and
the response gave you the same blank cell for all four.

That is the problem this project is about. Not "get better data" — *say what you
actually know*.

---

## What this service does instead

Every single value comes back in a small box with a label on it. There is no way
to read a value without also reading its label, because the value lives inside
the box.

The label has two parts. The first says what kind of answer this is:

- **resolved** — here is a value, and it means what it says
- **unknown** — we looked, we could not tell
- **absent** — we looked, and there is genuinely nothing here
- **not attempted** — we never looked
- **unavailable** — we looked and it broke

Those five are exactly the four cases from the top of this page, plus the happy
one. The distinction between **unknown** and **absent** is the one every vendor
throws away, and it is the difference between "worth another look" and "stop
paying to ask".

The second part says *why*, and this is the part you act on:

| why | what you should do |
|---|---|
| ok | Nothing. It ran and reported. |
| deadline | Your time limit was too short. Raise it. |
| dependency failed | Something it needed first did not work out. |
| unmapped | We have no way to ask that provider about this company. Retrying will *never* help. |
| upstream error | Their service returned an error. It is broken or it moved. |
| upstream unconfigured | Their service is up but not set up. Retrying is pointless. |
| rate limited | Back off. We pass along how long they told us to wait. |
| timeout | We asked, waited, and gave up. That provider is slow. |
| boundary violation | They replied successfully with something that was not the answer. |
| excluded by caller | You told us not to bother. |

Ten reasons, and they are a fixed list. Not a free-text message that changes
wording between releases — a fixed vocabulary you can write a rule against.

---

## What it is actually doing under the hood

This service does no research. It has no opinions about companies. It calls five
other services — all built earlier in this same 100-day run — and its entire job
is to be honest about what came back.

- One resolves a company name to a verified web domain.
- One inspects a domain and reports what technology it can see.
- One classifies a company into GTM attributes like segment and sales motion.
- One produces a timing argument: is there a reason to reach out *now*.
- One turns observations into scored signals.
- One writes an evidence-backed prose brief.

You ask for a company. It asks all six, in the right order, inside a time budget
you set, and hands you one document.

### The time budget is a promise, not a hope

You say how long you are willing to wait. The first provider — the one that
resolves the domain — gets at most 40% of that, because everything else may need
the domain it produces. The rest share what is left, all at once.

And the receipt comes back with the answer: how much you granted, how much the
first stage was allowed, what was left afterwards, and what each provider
actually cost you. So when one field says *timeout*, the ledger above it shows you
which provider ate the budget. You are not guessing.

### Sometimes one failure has to take another down with it

Exactly one provider depends on another: the tech-stack inspection needs a web
address, and only the domain resolver produces one. If the resolver comes back
with three plausible domains and refuses to pick — which it really does, for
Stripe — then there is no address to inspect, and the tech stack comes back as
**not attempted / dependency failed**.

Notice what it does *not* say. It does not name a provider it spoke to, because
it never spoke to one. It does not say "error", because nothing errored. It says
the true thing: this was skipped, and here is what it was waiting on.

---

## The uncomfortable part: coverage

Here is the number this project publishes that no vendor will:

**Of 26 companies, 13 can be answered by exactly one of the six providers, 12 by
two, and one by four. None by all six.**

That is not a broken demo. The six services were built on different days with
different made-up example companies, and their lists barely overlap — one single
company name appears in two of them.

And that is exactly what your real stack looks like. Six vendors. Six private
customer lists. No shared identifier. Vendor A knows about a third of your
accounts, vendor B knows a different third, and nobody will tell you which third
in advance. You find out one disappointing account at a time.

So this service publishes the table. Up front, on the front page, before you send
a single request. Every company, every provider, whether we can ask.

### Why it will not guess the join

One provider knows a company called **Northwind**. Another knows one called
**Northwind Freight**. They are different companies.

Almost every integration in the world would match those. Strip the punctuation,
lowercase it, compare, close enough. And then one company's hiring signals get
stapled to another company's website, and it looks completely fine, and somebody
calls the wrong firm about the wrong thing.

This service has no fuzzy matching anywhere in it. Every connection between a
company and a provider is written down by hand, one at a time. If a connection
does not exist, the answer is **unmapped** — which is a real answer, and an
honest one, and it tells you retrying will never help.

### Why it will not make up evidence about real companies

One of the six providers works differently: instead of looking a company up, it
takes observations *about* the company as input and turns them into signals. To
connect that provider, this service has to supply the observations.

For made-up companies, that is fine — writing fiction about fictional companies
is what the whole corpus is.

For Stripe or Siemens, it would mean publishing invented facts about a real,
identifiable company in a public repository. So it does not. Real companies come
back **unmapped** for that provider, and the reason is a decision, not an
oversight. It is also why a real company caps out at two of six.

---

## Two things worth knowing about the demo

**The left column is a rehearsal; the right column is real.** The console shows
the same request twice. The left side replays recorded responses — same answer
every time, useful for testing. The right side calls the five services live,
right now.

Where they disagree, the console says so. And they do disagree, in two specific
places: one provider's endpoint has moved and returns a "not found" page, and
some of the example domains are reserved by internet standard so that nothing can
ever fetch them. So the left column shows what a working answer looks like and
the right column shows today. Both are labelled. Neither is dressed up as the
other.

**Recording the real services found three genuine bugs.** Before writing any of
this, the plan assumed what the six providers' replies looked like. Then their
actual replies were captured and checked, and three assumptions were wrong — one
badly enough that *every company that successfully resolved a domain was being
reported as "unknown"*. A hand-written stand-in would have agreed with the bug
forever. That is why the test data here is recordings rather than inventions.

---

## What it will not do

It will not tell you a value is 87% likely to be right. There is no confidence
number anywhere in this project, and the words *confidence*, *score*,
*probability* and *accuracy* are banned from it. A number like that reads as
accuracy and it is not accuracy — it is a guess about a guess. You get a named
state and a named reason instead, both of which you can actually act on.

It will not average two providers that disagree. It will not fill a gap with a
default. It will not return an error because one of six providers is down — you
get the five that worked, plus an exact account of the sixth.

And when it cannot answer, it says which of the five kinds of "cannot" it is.
That is the whole product.
