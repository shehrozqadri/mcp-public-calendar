// Load .env for local Node-based runtimes (Vercel dev, local API server).
// Cloudflare Pages injects bindings directly and does not use this file.

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(rootDir, ".env");

if (existsSync(envPath)) {
  const { config } = await import("dotenv");
  config({ path: envPath });
}
