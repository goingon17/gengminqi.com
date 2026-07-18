import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sensitivePatterns = [
  /POLY_PRIVATE_KEY\s*=/i,
  /POLY_API_SECRET\s*=/i,
  /POSTGRES_URL\s*=\s*["']?postgres/i,
  /REDIS_URL\s*=\s*["']?redis/i,
  /DATABASE_URL\s*=/i,
  /PRIVATE_KEY\s*=\s*["']?(0x)?[a-f0-9]{32,}/i,
];
const forbiddenLogPatterns = [
  /console\.(log|debug|info|warn|error)\([^)]*(ciphertext|signature|privateKey|secret|REDIS_URL|POSTGRES_URL)/i,
];
const ignoredDirs = new Set([".git", ".next", "node_modules", ".vercel"]);
const checkedExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".json", ".md"]);

const failures = [];
await walk(root);

if (failures.length) {
  for (const failure of failures) {
    console.error(failure);
  }
  process.exit(1);
}

console.log("Release checks passed.");

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (ignoredDirs.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath);
      continue;
    }

    if (!checkedExtensions.has(path.extname(entry.name))) {
      continue;
    }

    const text = await readFile(fullPath, "utf8");
    const relative = path.relative(root, fullPath);
    for (const pattern of sensitivePatterns) {
      if (pattern.test(text)) {
        failures.push(`${relative}: possible secret literal matched ${pattern}`);
      }
    }
    for (const pattern of forbiddenLogPatterns) {
      if (pattern.test(text)) {
        failures.push(`${relative}: sensitive value appears in logging`);
      }
    }
  }
}
