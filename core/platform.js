// Платформа и правила (rules) из JSON-файлов версий Mojang.
const os = require('os');

function osName() {
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'darwin') return 'osx';
  return 'linux';
}

function mojangArch() {
  return process.arch === 'ia32' ? 'x86' : process.arch;
}

function archBits() {
  return ['x64', 'arm64'].includes(process.arch) ? '64' : '32';
}

function ruleMatches(rule, features) {
  if (rule.os) {
    if (rule.os.name && rule.os.name !== osName()) return false;
    if (rule.os.arch && rule.os.arch !== mojangArch()) return false;
    if (rule.os.version) {
      try {
        if (!new RegExp(rule.os.version).test(os.release())) return false;
      } catch {
        return false;
      }
    }
  }
  if (rule.features) {
    for (const [key, value] of Object.entries(rule.features)) {
      if (!!features[key] !== value) return false;
    }
  }
  return true;
}

// Последнее подходящее правило решает, разрешено ли (как в официальном лаунчере).
function isAllowed(rules, features = {}) {
  if (!rules || !rules.length) return true;
  let allowed = false;
  for (const rule of rules) {
    if (ruleMatches(rule, features)) allowed = rule.action === 'allow';
  }
  return allowed;
}

function javaPlatformKeys() {
  const a = process.arch;
  if (process.platform === 'win32') return [a === 'arm64' ? 'windows-arm64' : a === 'ia32' ? 'windows-x86' : 'windows-x64', 'windows-x64'];
  if (process.platform === 'darwin') return a === 'arm64' ? ['mac-os-arm64', 'mac-os'] : ['mac-os'];
  return [a === 'ia32' ? 'linux-i386' : 'linux'];
}

module.exports = { osName, archBits, isAllowed, javaPlatformKeys };
