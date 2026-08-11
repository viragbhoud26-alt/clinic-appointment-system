const { toGeminiFunctionDeclarations, executeTool } = require("../tools");

function getClient() {
  const { GoogleGenAI } = require("@google/genai");
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }); // reads GEMINI_API_KEY
}

function extractTextParts(content) {
  if (!content || !content.parts) return "";
  return content.parts.filter((p) => p.text).map((p) => p.text).join("\n");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The free tier's per-minute quota is easy to hit — each tool call is its own
// API request, so a single multi-tool-call conversation can burn 4-5 requests
// by itself. Retry with backoff rather than fail the whole conversation.
async function callWithRetry(client, params, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await client.models.generateContent(params);
    } catch (err) {
      const message = (err && err.message) || String(err);
      const isRateLimit = message.includes("RESOURCE_EXHAUSTED") || message.includes("rate limit");
      if (!isRateLimit || attempt === maxRetries) throw err;
      const waitMs = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
      console.warn(`[gemini] rate limited, retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})`);
      await sleep(waitMs);
    }
  }
}

async function runGeminiAgent(userMessage, systemPrompt, opts = {}) {
  const client = opts.client || getClient();
  const maxTurns = opts.maxTurns || 8;
  // Gemini model availability rotates unpredictably — even documented shutdown
  // dates have been reported wrong by other developers hitting early 404s.
  // If this model stops working, check https://ai.google.dev/gemini-api/docs/models
  // for the current stable name and update here (or pass opts.model).
  const model = opts.model || "gemini-3.6-flash";
  const functionDeclarations = toGeminiFunctionDeclarations();

  const contents = [...(opts.history || []), { role: "user", parts: [{ text: userMessage }] }];
  const trace = [];

  for (let turn = 0; turn < maxTurns; turn++) {
    let response;
    try {
      response = await callWithRetry(client, {
        model,
        contents,
        config: {
          systemInstruction: systemPrompt,
          tools: [{ functionDeclarations }],
        },
      });
    } catch (err) {
      const message = (err && err.message) || String(err);
      if (message.includes("NOT_FOUND") || message.includes("no longer available")) {
        throw new Error(
          `Gemini model '${model}' is unavailable. Google rotates model availability without much notice — ` +
            `check https://ai.google.dev/gemini-api/docs/models for the current stable model name, then set ` +
            `it via runAgent(msg, { model: "..." }) or update the default in src/providers/gemini.js. ` +
            `Original error: ${message}`
        );
      }
      throw err;
    }

    const modelContent = response.candidates && response.candidates[0] && response.candidates[0].content;
    const calls = response.functionCalls;

    if (!calls || calls.length === 0) {
      // Terminating turn: this text IS the final answer, already returned as
      // finalText below — do NOT also log it as a "reasoning" trace entry,
      // or /why ends up showing the conclusion twice (once as itself, once
      // mislabeled as "reasoning"). Only genuine intermediate commentary
      // (text alongside a tool call, handled below) belongs in the trace.
      const finalText = (response.text || extractTextParts(modelContent) || "").trim();
      contents.push(modelContent);
      return { finalText, trace, history: contents };
    }

    const reasoningText = extractTextParts(modelContent);
    if (reasoningText) trace.push({ type: "reasoning", text: reasoningText });

    // Echo the model's own turn (including its functionCall parts) back into
    // history before supplying results — Gemini's multi-turn contract, same
    // spirit as Anthropic's "assistant" echo but a different wire shape.
    contents.push(modelContent);

    const functionResponseParts = [];
    for (const call of calls) {
      let result;
      try {
        result = await executeTool(call.name, call.args);
      } catch (err) {
        result = { ok: false, reason: "TOOL_EXECUTION_ERROR", detail: err.message };
      }
      trace.push({ type: "tool_call", name: call.name, input: call.args, result });
      functionResponseParts.push({
        functionResponse: { name: call.name, response: result },
      });
    }

    contents.push({ role: "user", parts: functionResponseParts });
  }

  return { finalText: "(Agent hit its turn limit without reaching a final answer.)", trace, history: contents };
}

module.exports = { runGeminiAgent };
