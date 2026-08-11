const { execFile } = require("child_process");
const { cpuToMillicores, memoryToMiB, millicoresToCpuString, mibToMemoryString } = require("./resourceUnits");
const policy = require("./policy.json");

// execFn is injectable so this can be unit tested without a real cluster
// (see test/agent.test.js) — same principle as dependency injection anywhere else.
function defaultExec(args) {
  return new Promise((resolve, reject) => {
    execFile("kubectl", args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr || error.message));
      else resolve(stdout);
    });
  });
}

async function checkClusterUsage(namespace, execFn = defaultExec) {
  const nsPolicy = policy.namespaces[namespace];
  if (!nsPolicy) {
    return { ok: false, reason: "UNKNOWN_NAMESPACE", detail: `Namespace '${namespace}' is not registered in policy.json.` };
  }

  let stdout;
  try {
    stdout = await execFn(["get", "pods", "-n", namespace, "-o", "json"]);
  } catch (err) {
    return { ok: false, reason: "KUBECTL_ERROR", detail: err.message };
  }

  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch (err) {
    return { ok: false, reason: "UNPARSEABLE_KUBECTL_OUTPUT", detail: err.message };
  }

  let totalCpuM = 0;
  let totalMemMi = 0;
  const pods = parsed.items || [];

  for (const pod of pods) {
    // Only count pods that are actually consuming the namespace's quota —
    // Succeeded/Failed pods don't hold resources.
    const phase = pod.status && pod.status.phase;
    if (phase === "Succeeded" || phase === "Failed") continue;

    const containers = (pod.spec && pod.spec.containers) || [];
    for (const c of containers) {
      const req = c.resources && c.resources.requests;
      if (!req) continue;
      if (req.cpu) totalCpuM += cpuToMillicores(req.cpu) || 0;
      if (req.memory) totalMemMi += memoryToMiB(req.memory) || 0;
    }
  }

  const quotaCpuM = cpuToMillicores(nsPolicy.quotaCpu);
  const quotaMemMi = memoryToMiB(nsPolicy.quotaMemory);

  return {
    ok: true,
    namespace,
    podCount: pods.length,
    used: { cpu: millicoresToCpuString(totalCpuM), memory: mibToMemoryString(totalMemMi) },
    quota: { cpu: nsPolicy.quotaCpu, memory: nsPolicy.quotaMemory },
    remaining: {
      cpu: millicoresToCpuString(Math.max(0, quotaCpuM - totalCpuM)),
      memory: mibToMemoryString(Math.max(0, quotaMemMi - totalMemMi)),
    },
  };
}

module.exports = { checkClusterUsage };
