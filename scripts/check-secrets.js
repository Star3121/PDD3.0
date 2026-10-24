import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const trackedFiles = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)
  .filter((file) => !file.endsWith('package-lock.json'));

const assignmentPattern = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD)[A-Z0-9_]*)\s*=\s*([^\s#]+)/;
const jwtPattern = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/;
const safeValuePattern = /^(?:your(?:_|-)|(?:old|new)(?:_|-)|example|placeholder|change[_-]?me|xxx|<|\$\{|\*{3})/i;
const findings = [];

for (const file of trackedFiles) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }

  text.split(/\r?\n/).forEach((line, index) => {
    const assignment = line.match(assignmentPattern);
    const hasUnsafeAssignment = assignment &&
      assignment[2].length >= 8 &&
      !safeValuePattern.test(assignment[2]);

    if (hasUnsafeAssignment || jwtPattern.test(line)) {
      findings.push(`${file}:${index + 1}`);
    }
  });
}

if (findings.length > 0) {
  console.error('检测到疑似密钥（仅显示位置）:');
  findings.forEach((finding) => console.error(`- ${finding}`));
  process.exit(1);
}

console.log('密钥扫描通过：已跟踪文件中未发现明显凭证。');
