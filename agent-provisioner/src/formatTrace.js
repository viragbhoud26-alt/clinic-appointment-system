// Turns the raw trace array (as produced by agent.js) into a short,
// human-readable summary — used by the /why Telegram command so a developer
// can see WHAT the agent did without reading raw JSON.

function summarizeToolResult(name, result) {
  if (!result) return "(no result)";
  if (name === "check_cluster_usage" && result.ok) {
    return `used ${result.used.cpu}/${result.used.memory}, ${result.remaining.cpu}/${result.remaining.memory} remaining`;
  }
  if (name === "check_policy" && result.ok) {
    return `ceiling ${result.maxPerRequest.cpu}/${result.maxPerRequest.memory}, approval above ${result.requireApprovalAbove.cpu}/${result.requireApprovalAbove.memory}`;
  }
  if (name === "generate_manifest") {
    return result.wouldPassValidation ? "preview OK, would pass validation" : `preview flagged: ${result.validationDetail?.reason || "invalid"}`;
  }
  if (name === "apply_manifest") {
    if (result.applied) return `applied (${result.mode})`;
    if (result.needsApproval) return "needs human approval — not applied";
    return `rejected: ${result.reason || "unknown reason"}`;
  }
  if (name === "trigger_build") {
    return result.ok ? "build triggered" : `refused: ${result.reason || "unknown reason"}`;
  }
  return result.ok === false ? `failed: ${result.reason || result.detail || "unknown"}` : "ok";
}

function formatTraceForHumans(trace) {
  if (!trace || trace.length === 0) return "No reasoning trace recorded for this turn.";

  const lines = [];
  let step = 1;
  for (const entry of trace) {
    if (entry.type === "tool_call") {
      const inputSummary = Object.entries(entry.input || {})
        .map(([k, v]) => `${k}=${v}`)
        .join(" ");
      lines.push(`${step}. Called \`${entry.name}\`(${inputSummary}) → ${summarizeToolResult(entry.name, entry.result)}`);
      step++;
    } else if (entry.type === "reasoning" && entry.text) {
      lines.push(`_"${entry.text.trim()}"_`);
    }
  }
  return lines.length > 0 ? lines.join("\n") : "The agent replied directly with no tool calls this turn.";
}

module.exports = { formatTraceForHumans };
