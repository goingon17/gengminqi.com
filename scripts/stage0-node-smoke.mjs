import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const required = ["@vercel/functions", "ioredis", "jiff-mpc", "next", "react", "ws"];
const missing = required.filter((name) => !packageJson.dependencies?.[name]);

if (missing.length > 0) {
  console.error(`Missing dependencies: ${missing.join(", ")}`);
  process.exit(1);
}

console.log("Stage 0 package smoke check passed.");
