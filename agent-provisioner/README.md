# AI Agent Provisioner — Weeks 1–3

Replaces the Week 0 Telegram bot's rigid `/provision service=x cpu=y ...`
command with a real AI agent: a developer describes what they need in
plain language, and the agent reasons about which tools to call, in what
order, before anything is provisioned.

**Week 1** — provider-agnostic tool-calling loop (Gemini default, Anthropic
also supported), with `apply_manifest` independently re-validating every
request against policy regardless of the agent's own conclusions.
**Week 2** — added `trigger_build`, a bounded-registry tool that can kick
off a GitHub Actions rebuild only for services listed in
`src/buildRegistry.json`. **Week 3** — added per-chat conversation memory
(`src/sessionStore.js`), a `/why` command that explains the agent's last
reasoning trace (`src/formatTrace.js`), and `/reset`.

**This is built and unit-tested (46/46 passing, `npm test`, no live API key
or cluster required)** — every piece that doesn't need live credentials is
proven offline; the actual end-to-end run (talking to an LLM for real,
applying to a real cluster, triggering a real GitHub Actions run) needs
your own credentials: `TELEGRAM_BOT_TOKEN`, `GEMINI_API_KEY` or
`ANTHROPIC_API_KEY`, and `GITHUB_TOKEN` (a **classic** PAT with `repo` +
`workflow` scopes — fine-grained tokens have been observed to fail on the
`workflow_dispatch` endpoint even with matching write permissions granted).
Set `LLM_PROVIDER=gemini` or `anthropic` to choose the backend (default
`gemini`). Session transcripts persist to `data/sessions/<chatId>.json` at
runtime — this directory is gitignored and created on first use.

## What's different from Week 0

| | Week 0 (Telegram bot) | Week 1 (AI agent) |
|---|---|---|
| Input | `/provision service=x cpu=250m memory=256Mi replicas=2` | "clinic-app needs more headroom, it's getting OOM-killed" |
| Interpretation | Regex parser | An LLM, reasoning over multiple tool calls |
| LLM backend | — | **Gemini (free tier) by default**, Anthropic also supported — see below |
| Safety | Validator runs once, on the parsed fields | Validator runs inside `apply_manifest`, **regardless of the agent's own conclusions** — defense in depth |
| New capability | — | `check_cluster_usage` — queries the REAL cluster for current usage, not just the configured policy ceiling (this directly closes the limitation named in Section 5.10 of your report) |

## Provider-agnostic by design

The tool *definitions* (`src/tools.js`) and all the governance logic
(`validator.js`, `checkClusterUsage.js`, `manifestGenerator.js`,
`k8sApply.js`) are shared and identical no matter which LLM is driving
the conversation. Only `src/providers/gemini.js` and
`src/providers/anthropic.js` differ — they exist purely to translate
each provider's own message format into calls against the same
`executeTool()` dispatcher. `src/agent.js` picks whichever one you've
configured via `LLM_PROVIDER`.

This matters for the report: it demonstrates the governance/safety
design is independent of any specific AI vendor — swapping the "brain"
doesn't touch the safety-critical code path at all, which is proven by
`test/agent.test.js` running the *same* defense-in-depth assertions
against both providers' mocked responses.

```bash
export LLM_PROVIDER=gemini      # default — free tier
export LLM_PROVIDER=anthropic   # requires ANTHROPIC_API_KEY, $5 trial only
```

## Step 1 — Run the tests (no credentials needed)

```bash
cd ~/agent-provisioner
npm install
npm test
```

Expect **22 passed** — 16 from Week 1's original build, plus 6 new ones
proving the Gemini path's loop mechanics (multi-turn tool calling, safe
termination, correct provider selection/rejection). None of this
requires any API key or a live cluster — every test uses a scripted fake
client.

## Step 2 — Get a free Gemini API key

1. Go to **https://aistudio.google.com**, sign in with any Google account
   — no credit card needed.
2. Click **Get API key** → **Create API key**.
3. Copy it.

Free tier as of writing: roughly 15 requests/minute, ~1,500 requests/day
on `gemini-2.5-flash` — comfortably enough for a month of development
and demoing. One thing worth knowing: Google's free-tier terms allow
using your inputs/outputs to improve their models — a privacy trade-off
that doesn't apply once you enable billing. Fine for this project, worth
knowing about.

## Step 3 — Run it live

```bash
export TELEGRAM_BOT_TOKEN="your Telegram bot token"
export GEMINI_API_KEY="your Gemini API key"
export LLM_PROVIDER=gemini        # or omit — it's the default
export APPLY_MODE=dryrun          # start safe, same as Week 0
export ALLOWED_USER_IDS=<your telegram id>
npm start
```

Message your bot in plain English:

```
clinic-app needs more headroom, it's been getting OOM-killed
```

Watch the terminal — every tool call the agent makes gets logged
(`[trace] ...`). This log is exactly what Week 3 (hardening + logging)
will build into a proper evidence trail for the report.

## Step 4 — go live against your real cluster

Same as Week 0:
```bash
export APPLY_MODE=live
npm start
```

## Using Anthropic instead (if you get credits later)

No code changes needed — just swap the provider and credentials:
```bash
export LLM_PROVIDER=anthropic
export ANTHROPIC_API_KEY="your key"
npm start
```

## Week 2 — bounded build triggering

A fifth tool, `trigger_build`, lets the agent kick off a GitHub Actions
rebuild — but **only** for services explicitly listed in
`src/buildRegistry.json`. The agent cannot build arbitrary source code,
supply a Dockerfile, or name a new service — if you ask it to build
something not on the list, it will tell you a human needs to add it
first, not attempt a workaround. This is the scoping boundary discussed
in Section 5.10 of the report, now actually implemented rather than
just described.

**I had to guess at two things in `buildRegistry.json` — please verify/fix:**

```json
{
  "clinic-app": {
    "owner": "viragbhoud26-alt",
    "repo": "clinic-appointment-system",
    "workflowFile": "ci.yml",     <-- I don't know your real filename
    "ref": "main"                  <-- confirm your default branch is called this
  }
}
```

Check your actual workflow filename:
```bash
ls ~/projects/clinic-appointment-system/.github/workflows/
```
Update `workflowFile` in `buildRegistry.json` to match exactly.

**Your existing CI workflow needs a `workflow_dispatch` trigger.** If it
was only ever triggered by `push`, add this to the top of the workflow
file (alongside, not instead of, your existing trigger):
```yaml
on:
  push:
    branches: [main]
  workflow_dispatch:      # <-- add this line if it's missing
```
Without this, GitHub will reject the dispatch call with a 404/422 even
with a valid token — the workflow simply won't accept being triggered
this way.

## Getting a GitHub token for this

1. GitHub → Settings → Developer settings → **Fine-grained personal
   access tokens** → Generate new token.
2. Scope it to **only** the `clinic-appointment-system` repository, not
   all repos.
3. Under Repository permissions, grant **Actions: Read and write** —
   nothing else. A token this narrowly scoped can trigger workflows and
   read their status, and that's it; it cannot read your code, push
   commits, or touch anything else.
4. Copy the token.

```bash
export GITHUB_TOKEN="your fine-grained token"
```

Test it in isolation first, without going through Telegram at all:
```bash
node -e "
require('./src/triggerBuild').triggerBuild('clinic-app').then(r => console.log(r));
"
```
Expect `{ ok: true, triggered: true, ... }`. If you get
`SERVICE_NOT_REGISTERED`, `MISSING_GITHUB_TOKEN`, or `GITHUB_API_ERROR`,
the message tells you exactly which of the steps above to revisit.

Once that works standalone, try it through the bot:
```
rebuild clinic-app
```

## Week 3 — conversation memory, durable logging, and /why

Three things that were flagged as gaps through Week 1 and 2 are now closed:

**1. Conversation memory.** Every prior week required cramming everything
into one self-contained message, because each Telegram message started a
completely fresh `runAgent()` call. Now, `runAgent()` accepts an `opts.history`
array (the provider's own conversation format from the previous turn) and
returns an updated `history` in its result. `agentBot.js` loads each chat's
stored history before calling the agent and saves the updated history
afterward — so a clarifying question and its answer are now genuinely
connected turns in one conversation, not two unrelated messages.

Try it live:
```
clinic-app needs more headroom
```
(don't specify a namespace — let it ask)
```
default
```
This should now work as a real follow-up, without needing to repeat the
whole request in one message.

**2. Durable session storage.** `src/sessionStore.js` persists each chat's
full turn-by-turn transcript (not just the LLM-facing history) to
`data/sessions/<chatId>.json` — genuinely durable across bot restarts,
tested by reloading from disk in `test/agent.test.js`, not just kept
in memory. This is real evidence you can point to directly, not just
terminal scrollback that vanishes.

**3. `/why` — see the agent's reasoning on demand.** Send `/why` after any
response to get a readable (not raw-JSON) summary of exactly which tools
were called, with what inputs, and what each one returned. Every reply now
also ends with a one-line hint pointing at this.

**`/reset`** clears a chat's stored history if you want to start over
deliberately (e.g. after testing, or if a conversation went somewhere
you don't want to keep building on).

**A provider switch is handled safely, not silently.** Anthropic and
Gemini use incompatible history formats. If `LLM_PROVIDER` changes
between bot restarts, `agentBot.js` detects the mismatch and starts that
chat's history fresh rather than crashing trying to replay incompatible
data — logged clearly (`[session] provider changed...`) so it's visible,
not a silent behavior change.

**Ambiguous-request handling is now an automated test**, not just
something verified live once. `test/agent.test.js` scripts a fake client
that responds with a clarifying question and zero tool calls, and asserts
on both — closing the gap flagged at the end of Week 1 and 2.

## Known gaps for Week 4

- `trigger_build` is bounded to a fixed registry (currently just
  `clinic-app`) — adding more services requires a human editing
  `buildRegistry.json`, by design. Not a gap so much as a documented
  scope boundary, but worth deciding whether Week 4 needs more services
  registered.
- Session files in `data/sessions/` grow unboundedly and are never
  pruned. Fine at this project's scale (a month of testing), but worth
  a line in the report as a known limitation if scaled up.
- No multi-user awareness within a single chat — the allow-list gates
  who can talk to the bot at all, but conversation history is keyed
  purely by `chat.id`, not by which authorized user sent which message
  within a group chat.
- `/why` only shows the most recent turn — no way to look further back
  in a chat's history yet.

## A real bug in the test suite itself (worth knowing about)

Discovered Aug 10, during live testing: `kubectl get deployments -n
default` showed a deployment called `api-service` that no one had ever
requested in any real Telegram conversation — `0/1` ready, created ~27
minutes earlier.

Root cause: the test suite scripts fake LLM clients that "decide" to
call tools like `apply_manifest` — but tool *execution* always runs
through the real `executeTool()` dispatcher, not a mock. One test used
`"api-service"` as its mock service name. Because `APPLY_MODE=live` was
sitting in the shell's environment (leaked from an earlier `export` in
a reused terminal — a pattern this project has hit repeatedly), that
test's scripted `apply_manifest` call actually ran `kubectl apply`
against the real cluster during `npm test`.

**A test suite must never depend on, or be vulnerable to, whatever the
ambient shell happens to contain.** Fixed at the root rather than
patched per-test: `test/agent.test.js` now stubs out
`child_process.execFile` globally for the entire test run, before any
other module is required (so `checkClusterUsage.js` and `k8sApply.js`,
which capture their own reference to `execFile` at module-load time,
both receive the stub). Verified directly, not just assumed — the fix
was confirmed by temporarily instrumenting the stub to log every call
it intercepted, then running the exact dangerous scenario
(`APPLY_MODE=live npm test`) and counting real interceptions (2, both
read-only `check_cluster_usage` calls, zero mutating ones) before
removing the debug instrumentation.

## A real bug found via live testing (worth knowing about)

Live-tested Aug 7: a plain-English OOM-kill request resulted in the
Telegram reply **"(Agent hit its turn limit without reaching a final
answer.)"** — which reads like nothing happened. Checking the cluster
directly told a different story:

```bash
kubectl get deployment clinic-app -n default -o jsonpath='{.spec.template.spec.containers[0].resources}'
# {"limits":{"cpu":"500m","memory":"1Gi"}, ...}   <- vs. baseline 250m/256Mi
```

**The mutation had actually succeeded** — `apply_manifest` ran and
applied real changes — but the agent kept calling tools afterward and
ran out of its turn budget before it got around to writing a summary.
The side effect happened; only the *reply* failed. This is a strong
argument for the project's "verify, don't assume" theme applied to the
agent's own output: a failure message from the agent is not proof that
nothing happened — check the actual system state.

**Fix applied:** the system prompt now explicitly instructs the agent to
stop calling tools and reply immediately once `apply_manifest` returns
any result (applied, rejected, or needs-approval), and the turn budget
was raised from 6 to 8 as a safety margin. Not yet re-verified live —
do that before treating this as closed.

## Recommended: log to a file, not just the terminal

Terminal scrollback is unreliable for finding the `[trace]` output after
the fact. Run the bot piped through `tee` so everything is saved:

```bash
npm start 2>&1 | tee agent.log
```

Then pull any trace without relying on scrollback:
```bash
grep -A 5 "\[trace\]" agent.log | tail -50
```
