import { mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const targetDir = path.join(process.cwd(), "public", "vendor");
const target = path.join(targetDir, "jiff-client.js");

try {
  const packageRoot = path.dirname(require.resolve("jiff-mpc/package.json"));
  const source = path.join(packageRoot, "dist", "jiff-client.js");
  await mkdir(targetDir, { recursive: true });
  await copyFile(source, target);
  console.log("Copied JIFF browser bundle to public/vendor/jiff-client.js");
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown error";
  console.warn(`Skipping JIFF browser bundle copy: ${message}`);
}
