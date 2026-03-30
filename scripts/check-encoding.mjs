import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TARGETS = ['src', 'docs', 'supabase'];
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.md', '.sql', '.json']);
const IGNORE_DIRS = new Set(['node_modules', 'dist', '.git']);
const SUSPICIOUS_PATTERNS = [
  /Ã./,
  /Ä./,
  /á»./,
  /â€./,
  /Æ°/,
  /ChÆ°a rÃµ/,
];

async function walk(dir, files = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, files);
      continue;
    }

    if (EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }
  return files;
}

function findSuspiciousLines(content) {
  return content
    .split(/\r?\n/)
    .map((line, index) => ({ lineNumber: index + 1, line }))
    .filter(({ line }) => SUSPICIOUS_PATTERNS.some((pattern) => pattern.test(line)));
}

async function main() {
  const findings = [];

  for (const target of TARGETS) {
    const fullTarget = path.join(ROOT, target);
    try {
      await fs.access(fullTarget);
    } catch {
      continue;
    }

    const files = await walk(fullTarget);
    for (const file of files) {
      const content = await fs.readFile(file, 'utf8');
      const suspiciousLines = findSuspiciousLines(content);
      suspiciousLines.forEach(({ lineNumber, line }) => {
        findings.push({ file, lineNumber, line: line.trim() });
      });
    }
  }

  if (findings.length === 0) {
    console.log('Khong phat hien dau hieu loi ma hoa tieng Viet.');
    return;
  }

  console.error('Phat hien dau hieu loi ma hoa tieng Viet tai cac dong sau:');
  findings.forEach((item) => {
    console.error(`- ${path.relative(ROOT, item.file)}:${item.lineNumber}: ${item.line}`);
  });
  process.exitCode = 1;
}

main().catch((error) => {
  console.error('Khong the chay script kiem tra ma hoa:', error);
  process.exitCode = 1;
});
