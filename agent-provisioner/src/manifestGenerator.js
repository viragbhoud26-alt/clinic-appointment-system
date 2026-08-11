const fs = require("fs");
const path = require("path");

const TEMPLATE_PATH = path.join(__dirname, "..", "templates", "deployment.yaml.tpl");
const DEFAULT_IMAGE_REGISTRY = process.env.DEFAULT_IMAGE_REGISTRY || null;

function resolveImage(service) {
  if (DEFAULT_IMAGE_REGISTRY) return `${DEFAULT_IMAGE_REGISTRY}:latest`;
  return `${service}:latest`;
}

function generateManifest(request, namespace) {
  const template = fs.readFileSync(TEMPLATE_PATH, "utf8");
  return template
    .replaceAll("{{SERVICE}}", request.service)
    .replaceAll("{{NAMESPACE}}", namespace)
    .replaceAll("{{REPLICAS}}", String(request.replicas))
    .replaceAll("{{CPU}}", request.cpu)
    .replaceAll("{{MEMORY}}", request.memory)
    .replaceAll("{{IMAGE}}", resolveImage(request.service));
}

function writeManifest(request, namespace, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const filePath = path.join(outDir, `${request.service}.yaml`);
  fs.writeFileSync(filePath, generateManifest(request, namespace));
  return filePath;
}

module.exports = { generateManifest, writeManifest };
