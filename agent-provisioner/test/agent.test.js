// ============================================================================
// HERMETIC TEST GUARD — must be the very first thing in this file, before ANY
// other require(). checkClusterUsage.js and k8sApply.js both do
// `const { execFile } = require("child_process")` at module-load time, which
// captures a local reference to whatever execFile is AT THAT MOMENT. Patching
// it here, before those modules are ever required below, means every module
// in this test run receives the safe stub instead of the real one.
//
// Why this matters: this suite scripts fake LLM clients that "decide" to
// call apply_manifest or check_cluster_usage — but tool EXECUTION always
// goes through the real executeTool() dispatcher, not a mock. Without this
// guard, if APPLY_MODE=live happened to be set in whatever shell runs
// `npm test` (e.g. leaked from an earlier `export` in a reused terminal —
// a pattern this project has hit repeatedly), the test suite could silently
// apply real manifests to a real cluster. This actually happened during
// development: an "api-service" deployment appeared on the live cluster
// with no live chat message ever having requested it — traced back to
// exactly this gap. Blocking execFile entirely, for the whole test run,
// closes the issue at its root rather than patching each vulnerable test
// individually.
const cp = require("child_process");
const realExecFile = cp.execFile;
cp.execFile = function stubbedExecFile(cmd, args, optsOrCb, cb) {
  const callback = typeof optsOrCb === "function" ? optsOrCb : cb;
  if (callback) {
    callback(new Error(`execFile('${cmd}') was stubbed out during tests — no real command was ever run. If a test needed a real result, it should inject a mock exec function instead (see checkClusterUsage's execFn parameter).`), "", "");
  }
};
// ============================================================================

const assert = require("assert");
const { checkClusterUsage } = require("../src/checkClusterUsage");
const { toolSchemas, executeTool } = require("../src/tools");
const { runAgent } = require("../src/agent");
const { triggerBuild } = require("../src/triggerBuild");
const { loadSession, saveSession, recordTurn, clearSession } = require("../src/sessionStore");
const { formatTraceForHumans } = require("../src/formatTrace");
const os = require("os");
const path = require("path");
const fs = require("fs");

let passed = 0;
function check(label, condition) {
  if (condition) { console.log(`\u2705 ${label}`); passed++; }
  else { console.log(`\u274c ${label}`); process.exitCode = 1; }
}

async function main() {
  // HERMETIC TEST GUARD: this suite scripts fake LLM clients that "decide"
  // to call apply_manifest — but tool EXECUTION always goes through the
  // real executeTool()/k8sApply.js, not a mock. If APPLY_MODE=live happens
  // to be set in whatever shell runs `npm test` (e.g. leaked from an
  // earlier `export` in a reused terminal — a pattern this project has hit
  // repeatedly), the test suite could silently apply real manifests to a
  // real cluster. That actually happened once during development (see
  // README/report: an "api-service" deployment appeared with no live chat
  // message ever having requested it). Tests must never depend on, or be
  // vulnerable to, whatever the ambient environment happens to contain —
  // force a safe value for the whole run, restore it afterward NO MATTER
  // WHAT (even if a test throws), via try/finally.
  const originalApplyMode = process.env.APPLY_MODE;
  process.env.APPLY_MODE = "dryrun";
  try {
    await runAllChecks();
  } finally {
    if (originalApplyMode === undefined) delete process.env.APPLY_MODE;
    else process.env.APPLY_MODE = originalApplyMode;
  }
}

async function runAllChecks() {

  // ---- checkClusterUsage: mocked kubectl output, no real cluster needed ----
  const fakePodsJson = JSON.stringify({
    items: [
      { status: { phase: "Running" }, spec: { containers: [{ resources: { requests: { cpu: "250m", memory: "256Mi" } } }] } },
      { status: { phase: "Running" }, spec: { containers: [{ resources: { requests: { cpu: "500m", memory: "512Mi" } } }] } },
      { status: { phase: "Succeeded" }, spec: { containers: [{ resources: { requests: { cpu: "9999m", memory: "9999Mi" } } }] } }, // must be excluded
    ],
  });
  const mockExec = async () => fakePodsJson;

  const usage = await checkClusterUsage("default", mockExec);
  check("checkClusterUsage sums only non-terminal pods", usage.ok && usage.used.cpu === "750m" && usage.used.memory === "768Mi");
  check("checkClusterUsage reports remaining headroom against quota", usage.remaining.cpu === "3250m");
  check("checkClusterUsage excludes Succeeded pods from the total", usage.podCount === 3 && usage.used.cpu !== "10249m");

  const usageBadNs = await checkClusterUsage("nonexistent-ns", mockExec);
  check("checkClusterUsage rejects unknown namespace", !usageBadNs.ok && usageBadNs.reason === "UNKNOWN_NAMESPACE");

  // ---- tools.js dispatcher ----
  const policyResult = await executeTool("check_policy", { namespace: "default" });
  check("check_policy tool returns namespace quota", policyResult.ok && policyResult.namespaceQuota.quotaCpu === "4000m");

  const previewResult = await executeTool("generate_manifest", { service: "clinic-app", cpu: "250m", memory: "256Mi", replicas: 2, namespace: "default" });
  check("generate_manifest tool is read-only and reports valid", previewResult.ok && previewResult.wouldPassValidation === true);
  check("generate_manifest tool produces a real manifest with correct values", previewResult.manifestPreview.includes('cpu: "250m"') && previewResult.manifestPreview.includes("replicas: 2"));

  const overQuotaPreview = await executeTool("generate_manifest", { service: "too-big", cpu: "1900m", memory: "500Mi", replicas: 5, namespace: "default" });
  check("generate_manifest tool correctly flags an over-ceiling request", overQuotaPreview.wouldPassValidation === false);

  // apply_manifest in dry-run mode (APPLY_MODE unset) — proves defense-in-depth:
  // even though generate_manifest above said "too-big" is invalid, apply_manifest
  // independently re-validates rather than trusting a prior tool call.
  const applyRejected = await executeTool("apply_manifest", { service: "too-big", cpu: "1900m", memory: "500Mi", replicas: 5, namespace: "default" });
  check("apply_manifest independently re-validates and rejects (defense in depth)", applyRejected.ok === false && applyRejected.applied === false);

  const applyNeedsApproval = await executeTool("apply_manifest", { service: "reporting-api", cpu: "1500m", memory: "1500Mi", replicas: 1, namespace: "default" });
  check("apply_manifest flags a high-value request for approval instead of applying", applyNeedsApproval.needsApproval === true && applyNeedsApproval.applied === false);

  // Force dry-run for this specific check regardless of the ambient shell's
  // APPLY_MODE — a stale `export APPLY_MODE=live` from an earlier session is
  // exactly the kind of "verify, don't assume" trap this project keeps
  // surfacing, and the test itself shouldn't be vulnerable to it.
  const prevApplyMode = process.env.APPLY_MODE;
  delete process.env.APPLY_MODE;
  const applyOk = await executeTool("apply_manifest", { service: "clinic-app", cpu: "250m", memory: "256Mi", replicas: 2, namespace: "default" });
  if (prevApplyMode === undefined) delete process.env.APPLY_MODE;
  else process.env.APPLY_MODE = prevApplyMode;
  check("apply_manifest dry-runs a valid request successfully", applyOk.ok === true && applyOk.mode === "dryrun");

  // ---- agent.js loop mechanics, with a FAKE Anthropic client (no API key needed) ----
  // Simulates: turn 1 the model calls check_cluster_usage, turn 2 it calls
  // apply_manifest, turn 3 it returns final text. Verifies the loop correctly
  // executes tools, feeds results back, and terminates on a text-only response.
  let callCount = 0;
  const fakeClient = {
    messages: {
      create: async ({ messages }) => {
        callCount++;
        if (callCount === 1) {
          return {
            stop_reason: "tool_use",
            content: [
              { type: "text", text: "Let me check current usage first." },
              { type: "tool_use", id: "call_1", name: "check_cluster_usage", input: { namespace: "default" } },
            ],
          };
        }
        if (callCount === 2) {
          return {
            stop_reason: "tool_use",
            content: [
              { type: "tool_use", id: "call_2", name: "apply_manifest", input: { service: "clinic-app", cpu: "250m", memory: "256Mi", replicas: 2, namespace: "default" } },
            ],
          };
        }
        return {
          stop_reason: "end_turn",
          content: [{ type: "text", text: "Done — provisioned clinic-app with 250m/256Mi x2 replicas." }],
        };
      },
    },
  };

  const agentResult = await runAgent("clinic-app needs a bit more headroom", { provider: "anthropic", client: fakeClient });
  check("agent loop executes multiple tool calls across turns", agentResult.trace.filter((t) => t.type === "tool_call").length === 2);
  check("agent loop terminates on a text-only response", agentResult.finalText.includes("provisioned clinic-app"));
  check("agent loop's trace captures the reasoning text too", agentResult.trace.some((t) => t.type === "reasoning"));

  // Turn-limit safety: a client that ALWAYS calls tools should not loop forever
  const infiniteClient = {
    messages: {
      create: async () => ({
        stop_reason: "tool_use",
        content: [{ type: "tool_use", id: "x", name: "check_policy", input: { namespace: "default" } }],
      }),
    },
  };
  const cappedResult = await runAgent("test", { provider: "anthropic", client: infiniteClient, maxTurns: 3 });
  check("agent loop respects maxTurns and terminates safely", cappedResult.trace.filter((t) => t.type === "tool_call").length === 3);

  // ---- Gemini provider path, with a FAKE client matching @google/genai's real response shape ----
  // Same scenario as the Anthropic test above, but through the Gemini wire format:
  // functionCalls array + candidates[0].content, instead of content blocks + stop_reason.
  let geminiCallCount = 0;
  const fakeGeminiClient = {
    models: {
      generateContent: async ({ contents }) => {
        geminiCallCount++;
        if (geminiCallCount === 1) {
          const call = { name: "check_cluster_usage", args: { namespace: "default" }, id: "call_1" };
          return {
            text: "Let me check current usage first.",
            functionCalls: [call],
            candidates: [{ content: { role: "model", parts: [{ text: "Let me check current usage first." }, { functionCall: call }] } }],
          };
        }
        if (geminiCallCount === 2) {
          const call = { name: "apply_manifest", args: { service: "clinic-app", cpu: "250m", memory: "256Mi", replicas: 2, namespace: "default" }, id: "call_2" };
          return {
            text: "",
            functionCalls: [call],
            candidates: [{ content: { role: "model", parts: [{ functionCall: call }] } }],
          };
        }
        return {
          text: "Done — provisioned clinic-app with 250m/256Mi x2 replicas.",
          functionCalls: undefined,
          candidates: [{ content: { role: "model", parts: [{ text: "Done — provisioned clinic-app with 250m/256Mi x2 replicas." }] } }],
        };
      },
    },
  };

  const geminiResult = await runAgent("clinic-app needs a bit more headroom", { provider: "gemini", client: fakeGeminiClient });
  check("Gemini path: agent loop executes multiple tool calls across turns", geminiResult.trace.filter((t) => t.type === "tool_call").length === 2);
  check("Gemini path: agent loop terminates on a text-only response", geminiResult.finalText.includes("provisioned clinic-app"));
  check("Gemini path: reports its own provider name", geminiResult.provider === "gemini");

  const geminiInfiniteClient = {
    models: {
      generateContent: async () => ({
        text: "",
        functionCalls: [{ name: "check_policy", args: { namespace: "default" }, id: "x" }],
        candidates: [{ content: { role: "model", parts: [{ functionCall: { name: "check_policy", args: { namespace: "default" } } }] } }],
      }),
    },
  };
  const geminiCapped = await runAgent("test", { provider: "gemini", client: geminiInfiniteClient, maxTurns: 3 });
  check("Gemini path: respects maxTurns and terminates safely", geminiCapped.trace.filter((t) => t.type === "tool_call").length === 3);

  // Provider selection defaults to gemini when unset, and rejects unknown providers
  check("runAgent defaults to provider 'gemini'", (await runAgent("x", { client: fakeGeminiClient })).provider === "gemini");
  let threw = false;
  try { await runAgent("x", { provider: "not-a-real-provider" }); } catch (e) { threw = true; }
  check("runAgent rejects an unknown provider rather than silently guessing", threw);

  // ---- Rate-limit retry: proves the free tier's RESOURCE_EXHAUSTED errors get
  // retried with backoff instead of failing the whole conversation ----
  let rateLimitAttempts = 0;
  const rateLimitedThenOkClient = {
    models: {
      generateContent: async () => {
        rateLimitAttempts++;
        if (rateLimitAttempts === 1) {
          throw new Error('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","message":"quota exceeded"}}');
        }
        return {
          text: "Recovered after retry.",
          functionCalls: undefined,
          candidates: [{ content: { role: "model", parts: [{ text: "Recovered after retry." }] } }],
        };
      },
    },
  };
  const retryResult = await runAgent("test", { provider: "gemini", client: rateLimitedThenOkClient });
  check("Gemini path: retries once on RESOURCE_EXHAUSTED and recovers", rateLimitAttempts === 2 && retryResult.finalText === "Recovered after retry.");

  // ---- Week 2: trigger_build, fully offline via a mocked GitHub API ----
  const originalGithubToken = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = "fake-token-for-tests";

  const mockFetchSuccess = async (url, options) => {
    check("trigger_build calls the exact expected GitHub API URL", url === "https://api.github.com/repos/viragbhoud26-alt/clinic-appointment-system/actions/workflows/ci.yml/dispatches");
    check("trigger_build sends the auth token as a Bearer header", options.headers.Authorization === "Bearer fake-token-for-tests");
    return { status: 204, ok: true, text: "" };
  };
  const buildResult = await triggerBuild("clinic-app", mockFetchSuccess);
  check("trigger_build succeeds for a registered service (204 from GitHub)", buildResult.ok === true && buildResult.triggered === true);

  const buildResultUnregistered = await triggerBuild("some-random-service-not-in-registry", mockFetchSuccess);
  check("trigger_build refuses a service that isn't on the bounded registry", buildResultUnregistered.ok === false && buildResultUnregistered.reason === "SERVICE_NOT_REGISTERED");

  const mockFetchFailure = async () => ({ status: 404, ok: false, text: '{"message":"Workflow not found"}' });
  const buildResultApiError = await triggerBuild("clinic-app", mockFetchFailure);
  check("trigger_build surfaces a real GitHub API error rather than pretending success", buildResultApiError.ok === false && buildResultApiError.reason === "GITHUB_API_ERROR");

  delete process.env.GITHUB_TOKEN;
  const buildResultNoToken = await triggerBuild("clinic-app", mockFetchSuccess);
  check("trigger_build refuses to attempt a call with no GITHUB_TOKEN set", buildResultNoToken.ok === false && buildResultNoToken.reason === "MISSING_GITHUB_TOKEN");

  if (originalGithubToken === undefined) delete process.env.GITHUB_TOKEN;
  else process.env.GITHUB_TOKEN = originalGithubToken;

  // Same check, but through the tool dispatcher (executeTool), proving the
  // agent-facing path also enforces the registry, not just the raw function.
  // This uses the REAL fetch against the REAL GitHub API (no injected mock) —
  // api.github.com is reachable from this environment, so a fake token
  // correctly comes back as a real 401 from GitHub itself, proving the tool
  // is genuinely wired end to end rather than stubbed out.
  process.env.GITHUB_TOKEN = "fake-token-for-tests";
  const dispatcherBuildResult = await executeTool("trigger_build", { service: "clinic-app" });
  check(
    "trigger_build is reachable and correctly wired through the tool dispatcher",
    dispatcherBuildResult.ok === false && dispatcherBuildResult.reason === "GITHUB_API_ERROR" && dispatcherBuildResult.detail.includes("401")
  );
  if (originalGithubToken === undefined) delete process.env.GITHUB_TOKEN;
  else process.env.GITHUB_TOKEN = originalGithubToken;

  check("all 5 tool schemas are present and well-formed", toolSchemas.length === 5 && toolSchemas.every((t) => t.name && t.input_schema));

  // ---- Week 3: sessionStore, fully offline via a temp directory ----
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "session-test-"));

  const emptySession = loadSession("chat123", tmpDir);
  check("loadSession returns an empty-but-valid session when none exists yet", emptySession.provider === null && emptySession.history.length === 0 && emptySession.turns.length === 0);

  const { session: afterTurn1 } = recordTurn(
    "chat123",
    { userMessage: "hello", finalText: "hi there", trace: [{ type: "reasoning", text: "greeting" }], history: [{ role: "user", parts: [{ text: "hello" }] }], provider: "gemini" },
    tmpDir
  );
  check("recordTurn persists a turn and updates stored history", afterTurn1.turns.length === 1 && afterTurn1.history.length === 1 && afterTurn1.provider === "gemini");

  const reloaded = loadSession("chat123", tmpDir);
  check("loadSession reads back exactly what recordTurn wrote (genuinely durable, not just in-memory)", reloaded.turns[0].userMessage === "hello" && reloaded.provider === "gemini");

  const { session: afterTurn2 } = recordTurn(
    "chat123",
    { userMessage: "follow up", finalText: "ok", trace: [], history: [{ role: "user", parts: [{ text: "hello" }] }, { role: "user", parts: [{ text: "follow up" }] }], provider: "gemini" },
    tmpDir
  );
  check("recordTurn appends to (not overwrites) the transcript across turns", afterTurn2.turns.length === 2);

  const { providerChanged } = recordTurn(
    "chat123",
    { userMessage: "switched providers", finalText: "ok", trace: [], history: [{ role: "user", content: "switched providers" }], provider: "anthropic" },
    tmpDir
  );
  check("recordTurn detects a provider switch and reports it", providerChanged === true);
  const afterProviderSwitch = loadSession("chat123", tmpDir);
  check("recordTurn resets the transcript on a provider switch (incompatible history formats)", afterProviderSwitch.turns.length === 1 && afterProviderSwitch.provider === "anthropic");

  check("clearSession removes an existing session and reports true", clearSession("chat123", tmpDir) === true);
  check("clearSession on an already-cleared chat reports false, not an error", clearSession("chat123", tmpDir) === false);
  const afterClear = loadSession("chat123", tmpDir);
  check("loadSession after clearSession returns a fresh empty session", afterClear.turns.length === 0);

  fs.rmSync(tmpDir, { recursive: true, force: true });

  // ---- Week 3: formatTraceForHumans (the /why command's core logic) ----
  const sampleTrace = [
    { type: "tool_call", name: "check_cluster_usage", input: { namespace: "default" }, result: { ok: true, used: { cpu: "250m", memory: "256Mi" }, remaining: { cpu: "3750m", memory: "7.5Gi" } } },
    { type: "reasoning", text: "Memory looks tight, bumping it." },
    { type: "tool_call", name: "apply_manifest", input: { service: "clinic-app", cpu: "250m", memory: "1Gi", replicas: "2", namespace: "default" }, result: { ok: true, applied: true, mode: "live" } },
  ];
  const formatted = formatTraceForHumans(sampleTrace);
  check("formatTraceForHumans summarizes tool calls readably, not as raw JSON", formatted.includes("check_cluster_usage") && !formatted.includes('"ok": true'));
  check("formatTraceForHumans includes the reasoning text", formatted.includes("Memory looks tight"));
  check("formatTraceForHumans handles an empty trace without crashing", formatTraceForHumans([]).length > 0);

  // ---- Week 3: ambiguous request handling (automated, was previously only verified live) ----
  // Simulates exactly what we saw live: the agent asks a clarifying question
  // instead of guessing, making NO tool calls at all.
  const ambiguousClient = {
    models: {
      generateContent: async () => ({
        text: "Which namespace is clinic-app deployed in?",
        functionCalls: undefined,
        candidates: [{ content: { role: "model", parts: [{ text: "Which namespace is clinic-app deployed in?" }] } }],
      }),
    },
  };
  const ambiguousResult = await runAgent("the API needs more power", { provider: "gemini", client: ambiguousClient });
  check("ambiguous request produces a clarifying question, not a guess", ambiguousResult.finalText.toLowerCase().includes("which"));
  check("ambiguous request makes NO tool calls (asks before acting)", ambiguousResult.trace.filter((t) => t.type === "tool_call").length === 0);

  // ---- Regression test: the final answer must NOT also appear as a
  // "reasoning" trace entry. Caught via live /why testing on Aug 10 — a
  // terminating turn's text was being logged both as finalText AND as a
  // duplicate "reasoning" entry, making /why show the conclusion twice.
  const noDuplicateClient = {
    models: {
      generateContent: async () => ({
        text: "All done, applied successfully.",
        functionCalls: undefined,
        candidates: [{ content: { role: "model", parts: [{ text: "All done, applied successfully." }] } }],
      }),
    },
  };
  const noDupResult = await runAgent("test", { provider: "gemini", client: noDuplicateClient });
  check(
    "final answer is not duplicated into the trace as a fake 'reasoning' step",
    noDupResult.trace.filter((t) => t.type === "reasoning" && t.text === noDupResult.finalText).length === 0
  );

  // ---- Week 3: conversation memory actually connects a follow-up to its question ----
  // Turn 1: ambiguous request -> clarifying question (same as above).
  // Turn 2: a SEPARATE runAgent call for "default", but WITH turn 1's history
  // passed in. The fake client for turn 2 asserts that the history it
  // receives actually contains turn 1's exchange — proving this isn't just
  // two independent calls that happen to work, but a genuinely connected
  // conversation.
  let turn2SawFullHistory = false;
  const turn2Client = {
    models: {
      generateContent: async ({ contents }) => {
        const historyText = JSON.stringify(contents);
        turn2SawFullHistory = historyText.includes("the API needs more power") && historyText.includes("Which namespace");
        return {
          text: "Got it — checked default namespace and applied the update.",
          functionCalls: [{ name: "apply_manifest", args: { service: "api-service", cpu: "250m", memory: "512Mi", replicas: 1, namespace: "default" }, id: "call_followup" }],
          candidates: [{ content: { role: "model", parts: [{ functionCall: { name: "apply_manifest", args: { service: "api-service", cpu: "250m", memory: "512Mi", replicas: 1, namespace: "default" } } }] } }],
        };
      },
    },
  };
  await runAgent("default", { provider: "gemini", client: turn2Client, history: ambiguousResult.history });
  check("conversation memory: turn 2 genuinely receives turn 1's exchange in its history", turn2SawFullHistory);

  console.log(`\n${passed} passed.`);
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
