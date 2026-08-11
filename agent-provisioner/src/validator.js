const policy = require("./policy.json");
const { cpuToMillicores, memoryToMiB } = require("./resourceUnits");

function validateRequest(request) {
  const namespace = request.namespace || policy.defaultNamespace;
  const nsPolicy = policy.namespaces[namespace];

  if (!nsPolicy) {
    return {
      ok: false,
      reason: "UNKNOWN_NAMESPACE",
      detail: `Namespace '${namespace}' is not registered in policy.json. Known namespaces: ${Object.keys(policy.namespaces).join(", ")}`,
    };
  }

  const reqCpuM = cpuToMillicores(request.cpu);
  const reqMemMi = memoryToMiB(request.memory);

  if (Number.isNaN(reqCpuM) || Number.isNaN(reqMemMi)) {
    return {
      ok: false,
      reason: "UNPARSEABLE_QUANTITY",
      detail: `Could not parse cpu='${request.cpu}' or memory='${request.memory}'. Use K8s-style units (e.g. 500m, 512Mi).`,
    };
  }

  const maxCpuM = cpuToMillicores(policy.maxPerRequest.cpu);
  const maxMemMi = memoryToMiB(policy.maxPerRequest.memory);
  const totalCpuM = reqCpuM * request.replicas;
  const totalMemMi = reqMemMi * request.replicas;

  if (totalCpuM > maxCpuM) {
    return { ok: false, reason: "EXCEEDS_MAX_PER_REQUEST_CPU", detail: `Requested ${totalCpuM}m total CPU exceeds the per-request ceiling of ${maxCpuM}m.` };
  }
  if (totalMemMi > maxMemMi) {
    return { ok: false, reason: "EXCEEDS_MAX_PER_REQUEST_MEMORY", detail: `Requested ${totalMemMi.toFixed(0)}Mi total memory exceeds the per-request ceiling of ${maxMemMi}Mi.` };
  }
  if (request.replicas > policy.maxPerRequest.replicas) {
    return { ok: false, reason: "EXCEEDS_MAX_REPLICAS", detail: `${request.replicas} replicas exceeds the max of ${policy.maxPerRequest.replicas} per request.` };
  }

  const nsQuotaCpuM = cpuToMillicores(nsPolicy.quotaCpu);
  const nsQuotaMemMi = memoryToMiB(nsPolicy.quotaMemory);

  if (totalCpuM > nsQuotaCpuM) {
    return { ok: false, reason: "EXCEEDS_NAMESPACE_QUOTA_CPU", detail: `Requested total CPU exceeds namespace '${namespace}' quota of ${nsPolicy.quotaCpu}.` };
  }
  if (totalMemMi > nsQuotaMemMi) {
    return { ok: false, reason: "EXCEEDS_NAMESPACE_QUOTA_MEMORY", detail: `Requested total memory exceeds namespace '${namespace}' quota of ${nsPolicy.quotaMemory}.` };
  }

  const approvalCpuM = cpuToMillicores(policy.requireApprovalAbove.cpu);
  const approvalMemMi = memoryToMiB(policy.requireApprovalAbove.memory);
  const needsApproval = reqCpuM > approvalCpuM || reqMemMi > approvalMemMi;

  return { ok: true, needsApproval, resolvedNamespace: namespace };
}

module.exports = { validateRequest };
