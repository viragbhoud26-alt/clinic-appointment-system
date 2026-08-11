const { runAnthropicAgent } = require("./providers/anthropic");
const { runGeminiAgent } = require("./providers/gemini");

const SYSTEM_PROMPT = `You are a DevOps provisioning assistant. Developers describe what they need in plain language; you figure out a concrete, policy-compliant resource request and provision it.

Rules you must follow:
- Always check current cluster usage and policy before proposing an amount, when the request is vague (e.g. "give it more memory" — you decide a specific number, but check headroom first).
- Use generate_manifest to sanity-check a plan before calling apply_manifest — it's read-only and costs nothing.
- apply_manifest is the only tool that changes real infrastructure. It will independently re-validate and refuse anything against policy, regardless of what you concluded — treat a rejection from it as final, not a bug to work around.
- As soon as apply_manifest returns a result (applied, rejected, or needing approval), STOP calling tools and immediately reply with your summary. Do not re-check, re-verify, or call any further tools after apply_manifest has responded — you already have everything you need to answer.
- If apply_manifest reports needsApproval, tell the user clearly that a human needs to approve it. Do not attempt to reduce the request just to dodge approval unless the user explicitly asks you to try a smaller amount.
- If a request is ambiguous (which service? which namespace?), ask the user instead of guessing.
- trigger_build is ONLY for services on the bounded registry — if it returns SERVICE_NOT_REGISTERED, tell the user plainly that a human needs to add it first. Never suggest a workaround like generating a manifest for an unregistered image.
- trigger_build does not wait for the build to complete. After triggering, tell the user to check GitHub Actions themselves — do not claim the build succeeded or failed, you don't know yet.
- Always end with a short, plain-language summary of what happened and why.`;

/**
 * Runs the agent loop for one user message, on whichever provider is configured.
 * @param {string} userMessage
 * @param {object} opts
 * @param {"gemini"|"anthropic"} [opts.provider] - defaults to $LLM_PROVIDER, then "gemini"
 * @param {object} [opts.client] - injectable provider client (for testing without a real API key)
 * @param {Array} [opts.history] - prior conversation history, in the CURRENT provider's own wire
 *   format (as returned in a previous call's `history` field). Omit or pass [] to start fresh.
 * @param {number} [opts.maxTurns]
 * @param {string} [opts.model]
 * @returns {Promise<{finalText: string, trace: Array, provider: string, history: Array}>}
 */
async function runAgent(userMessage, opts = {}) {
  const provider = opts.provider || process.env.LLM_PROVIDER || "gemini";

  let result;
  if (provider === "anthropic") {
    result = await runAnthropicAgent(userMessage, SYSTEM_PROMPT, opts);
  } else if (provider === "gemini") {
    result = await runGeminiAgent(userMessage, SYSTEM_PROMPT, opts);
  } else {
    throw new Error(`Unknown LLM_PROVIDER '${provider}'. Use 'gemini' or 'anthropic'.`);
  }

  // result.history is the provider's own wire-format conversation history
  // (Anthropic content blocks, or Gemini contents/parts) — pass it back
  // unchanged as opts.history on the NEXT call to continue the conversation.
  // It is NOT portable between providers; a provider switch mid-conversation
  // must start a fresh history (see sessionStore's provider-mismatch check).
  return { ...result, provider };
}

module.exports = { runAgent, SYSTEM_PROMPT };
