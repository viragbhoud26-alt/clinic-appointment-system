const { execFile } = require("child_process");

function applyManifest(filePath) {
  // Read fresh on every call, not cached at module-load time — a value frozen
  // at require() would be wrong for tests that need to control it per-call,
  // and wrong for any long-running process where this might need to change.
  const applyMode = process.env.APPLY_MODE || "dryrun";

  return new Promise((resolve) => {
    if (applyMode !== "live") {
      resolve({ applied: false, mode: "dryrun", message: `Dry-run (APPLY_MODE=${applyMode}). Manifest written to ${filePath}, not applied.` });
      return;
    }
    execFile("kubectl", ["apply", "-f", filePath], (error, stdout, stderr) => {
      if (error) resolve({ applied: false, mode: "live", message: stderr || error.message });
      else resolve({ applied: true, mode: "live", message: stdout.trim() });
    });
  });
}

module.exports = { applyManifest };
