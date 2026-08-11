const { toAnthropicToolSchemas, executeTool } = require("../tools");

function getClient() {
  const Anthropic = require("@anthropic-ai/sdk");
  return new Anthropic(); // reads ANTHROPIC_API_KEY from env
}

async function runAnthropicAgent(userMessage, systemPrompt, opts = {}) {
  const client = opts.client || getClient();
  const maxTurns = opts.maxTurns || 8;
  const model = opts.model || "claude-sonnet-5";
  const tools = toAnthropicToolSchemas();

  // opts.history carries the FULL prior message array (including any
  // tool_use/tool_result blocks), so the model can recall not just what was
  // said but what it actually found out via tools in earlier turns.
  const messages = [...(opts.history || []), { role: "user", content: userMessage }];
  const trace = [];

  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      system: systemPrompt,
      tools,
      messages,
    });

    const textBlocks = response.content.filter((b) => b.type === "text");
    const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");

    if (response.stop_reason !== "tool_use" || toolUseBlocks.length === 0) {
      // Terminating turn: don't ALSO log this text as a "reasoning" trace
      // entry — it's already returned as finalText below. Logging it twice
      // makes /why show the conclusion once as itself and once mislabeled
      // as "reasoning". See the identical fix in providers/gemini.js.
      messages.push({ role: "assistant", content: response.content });
      return { finalText: textBlocks.map((b) => b.text).join("\n").trim(), trace, history: messages };
    }

    for (const t of textBlocks) trace.push({ type: "reasoning", text: t.text });

    messages.push({ role: "assistant", content: response.content });

    const toolResults = [];
    for (const call of toolUseBlocks) {
      let result;
      try {
        result = await executeTool(call.name, call.input);
      } catch (err) {
        result = { ok: false, reason: "TOOL_EXECUTION_ERROR", detail: err.message };
      }
      trace.push({ type: "tool_call", name: call.name, input: call.input, result });
      toolResults.push({ type: "tool_result", tool_use_id: call.id, content: JSON.stringify(result) });
    }

    messages.push({ role: "user", content: toolResults });
  }

  return { finalText: "(Agent hit its turn limit without reaching a final answer.)", trace, history: messages };
}

module.exports = { runAnthropicAgent };
