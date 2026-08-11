const buildRegistry = require("./buildRegistry.json");

// fetchFn is injectable so this can be unit tested without a real GitHub
// token or network call — same dependency-injection pattern as
// checkClusterUsage's execFn.
async function defaultFetch(url, options) {
  const res = await fetch(url, options);
  return { status: res.status, ok: res.ok, text: await res.text() };
}

async function triggerBuild(service, fetchFn = defaultFetch) {
  const entry = buildRegistry.services[service];

  if (!entry) {
    return {
      ok: false,
      reason: "SERVICE_NOT_REGISTERED",
      detail: `'${service}' is not in the bounded build registry. Registered services: ${Object.keys(buildRegistry.services).join(", ") || "(none)"}. This is a closed list — ask a human to add it to buildRegistry.json first.`,
    };
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return { ok: false, reason: "MISSING_GITHUB_TOKEN", detail: "GITHUB_TOKEN is not set in the environment." };
  }

  const url = `https://api.github.com/repos/${entry.owner}/${entry.repo}/actions/workflows/${entry.workflowFile}/dispatches`;

  let response;
  try {
    response = await fetchFn(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: entry.ref }),
    });
  } catch (err) {
    return { ok: false, reason: "NETWORK_ERROR", detail: err.message };
  }

  // workflow_dispatch returns 204 No Content on success — it does NOT return
  // a run ID, so this is deliberately fire-and-forget. Polling for the run's
  // outcome would cost extra API calls against an already-tight rate limit
  // for very little benefit; the developer checks GitHub Actions directly,
  // same as they would for any other CI trigger.
  if (response.status === 204) {
    return {
      ok: true,
      triggered: true,
      service,
      detail: `Build triggered for '${service}' on ref '${entry.ref}'. Check https://github.com/${entry.owner}/${entry.repo}/actions for progress — this tool does not wait for or report the build's outcome.`,
    };
  }

  return {
    ok: false,
    reason: "GITHUB_API_ERROR",
    detail: `GitHub API returned ${response.status}: ${response.text}`,
  };
}

module.exports = { triggerBuild };
