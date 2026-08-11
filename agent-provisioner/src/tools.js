const policy = require("./policy.json");
const { validateRequest } = require("./validator");
const { generateManifest, writeManifest } = require("./manifestGenerator");
const { applyManifest } = require("./k8sApply");
const { checkClusterUsage } = require("./checkClusterUsage");
const { triggerBuild } = require("./triggerBuild");
const path = require("path");

const MANIFEST_OUT_DIR = path.join(__dirname, "..", "generated-manifests");

// ---- Tool definitions, PROVIDER-NEUTRAL. ----
// `parameters` is plain JSON Schema. Each provider adapter below converts
// this single source of truth into whatever wire format that provider's
// API expects — Anthropic's `input_schema` key, Gemini's
// `parametersJsonSchema` key. The governance logic (validateRequest,
// executeTool) never changes based on which LLM is calling it.
const toolDefinitions = [
  {
    name: "check_cluster_usage",
    description:
      "Query the REAL Kubernetes cluster for current resource usage in a namespace (sums requests across all non-terminal pods). Use this before deciding on a resource amount, to see how much headroom actually exists right now — not just the configured policy ceiling.",
    parameters: {
      type: "object",
      properties: { namespace: { type: "string", description: "Kubernetes namespace, e.g. 'default'" } },
      required: ["namespace"],
    },
  },
  {
    name: "check_policy",
    description:
      "Look up the governance policy for a namespace: per-request ceilings, namespace quota, and the threshold above which a request requires human approval rather than auto-provisioning.",
    parameters: {
      type: "object",
      properties: { namespace: { type: "string" } },
      required: ["namespace"],
    },
  },
  {
    name: "generate_manifest",
    description:
      "Preview the Kubernetes Deployment manifest that would be generated for a request, and check whether it would pass policy validation. This does NOT apply anything to the cluster — read-only preview only. Use this to sanity-check a plan before calling apply_manifest.",
    parameters: {
      type: "object",
      properties: {
        service: { type: "string", description: "Lowercase alphanumeric with hyphens, e.g. 'clinic-app'" },
        cpu: { type: "string", description: "e.g. '250m'" },
        memory: { type: "string", description: "e.g. '256Mi'" },
        replicas: { type: "integer" },
        namespace: { type: "string" },
      },
      required: ["service", "cpu", "memory", "replicas", "namespace"],
    },
  },
  {
    name: "apply_manifest",
    description:
      "Actually provision the requested resources on the real cluster. This tool independently re-validates the request against policy before doing anything — it does NOT trust that you already checked. If the request needs human approval it will NOT apply and will tell you so. This is the only tool that changes real infrastructure state.",
    parameters: {
      type: "object",
      properties: {
        service: { type: "string" },
        cpu: { type: "string" },
        memory: { type: "string" },
        replicas: { type: "integer" },
        namespace: { type: "string" },
      },
      required: ["service", "cpu", "memory", "replicas", "namespace"],
    },
  },
  {
    name: "trigger_build",
    description:
      "Trigger a GitHub Actions rebuild for a service. You may ONLY use this for services already on a fixed, human-curated allow-list — you cannot build arbitrary source code, supply a Dockerfile, or name a new service. If the developer asks to build/rebuild something not on the list, tell them it needs to be added to the registry by a human first; do not attempt a workaround. This does not wait for the build to finish — it triggers it and returns immediately; tell the developer to check GitHub Actions for the outcome.",
    parameters: {
      type: "object",
      properties: {
        service: { type: "string", description: "Must exactly match a name in the bounded build registry." },
      },
      required: ["service"],
    },
  },
];

// ---- Provider adapters: same tools, different wire format ----
function toAnthropicToolSchemas() {
  return toolDefinitions.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));
}

function toGeminiFunctionDeclarations() {
  return toolDefinitions.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.parameters }));
}

// Kept for backward compatibility with existing Anthropic-path code/tests.
const toolSchemas = toAnthropicToolSchemas();

// ---- Dispatcher: executes one tool call, always returns a plain JS object ----
async function executeTool(name, input) {
  switch (name) {
    case "check_cluster_usage": {
      return await checkClusterUsage(input.namespace);
    }

    case "check_policy": {
      const nsPolicy = policy.namespaces[input.namespace];
      if (!nsPolicy) {
        return { ok: false, reason: "UNKNOWN_NAMESPACE", detail: `Namespace '${input.namespace}' not in policy.json.` };
      }
      return {
        ok: true,
        namespace: input.namespace,
        namespaceQuota: nsPolicy,
        maxPerRequest: policy.maxPerRequest,
        requireApprovalAbove: policy.requireApprovalAbove,
      };
    }

    case "generate_manifest": {
      const validation = validateRequest(input);
      const manifestPreview = generateManifest(input, input.namespace);
      return { ok: true, wouldPassValidation: validation.ok, validationDetail: validation, manifestPreview };
    }

    case "apply_manifest": {
      // Defense in depth: re-validate here regardless of what generate_manifest
      // or the agent's own reasoning concluded earlier in the conversation.
      const validation = validateRequest(input);
      if (!validation.ok) {
        return { ok: false, applied: false, reason: validation.reason, detail: validation.detail };
      }
      if (validation.needsApproval) {
        return {
          ok: true,
          applied: false,
          needsApproval: true,
          detail: "Request exceeds the auto-approve threshold. Not applied — flagged for human approval.",
        };
      }
      const manifestPath = writeManifest(input, validation.resolvedNamespace, MANIFEST_OUT_DIR);
      const result = await applyManifest(manifestPath);
      return { ok: true, applied: result.applied, mode: result.mode, message: result.message };
    }

    case "trigger_build": {
      return await triggerBuild(input.service);
    }

    default:
      return { ok: false, reason: "UNKNOWN_TOOL", detail: `No such tool: ${name}` };
  }
}

module.exports = { toolDefinitions, toolSchemas, toAnthropicToolSchemas, toGeminiFunctionDeclarations, executeTool };
