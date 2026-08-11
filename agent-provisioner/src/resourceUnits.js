// Converts Kubernetes-style resource strings into comparable numbers.
// CPU is normalized to millicores. Memory is normalized to MiB.

function cpuToMillicores(value) {
  if (value == null) return NaN;
  const str = String(value).trim();
  if (str.endsWith("m")) return parseFloat(str.slice(0, -1));
  const num = parseFloat(str);
  return Number.isNaN(num) ? NaN : num * 1000;
}

const MEMORY_UNITS = {
  Ki: 1 / 1024, Mi: 1, Gi: 1024, Ti: 1024 * 1024,
  K: 1 / 1024, M: 1, G: 1024, T: 1024 * 1024,
};

function memoryToMiB(value) {
  if (value == null) return NaN;
  const str = String(value).trim();
  const match = str.match(/^([\d.]+)\s*([A-Za-z]*)$/);
  if (!match) return NaN;
  const [, num, unit] = match;
  if (!unit) return parseFloat(num) / (1024 * 1024);
  const factor = MEMORY_UNITS[unit];
  return factor === undefined ? NaN : parseFloat(num) * factor;
}

function millicoresToCpuString(m) {
  return `${Math.round(m)}m`;
}

function mibToMemoryString(mi) {
  return `${Math.round(mi)}Mi`;
}

module.exports = { cpuToMillicores, memoryToMiB, millicoresToCpuString, mibToMemoryString };
