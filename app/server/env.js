// Platform-agnostic environment resolution.
// Works with Cloudflare bindings, Vercel/Node process.env, and local .env files.

const REQUIRED = ["MONGO_URL", "JWT_SECRET"];

function pick(source, key) {
  const value = source?.[key];
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  return trimmed || undefined;
}

export function resolveEnv(source = {}) {
  const fromProcess =
    typeof process !== "undefined" && process.env ? process.env : {};

  const raw = { ...fromProcess, ...source };

  return {
    MONGO_URL: pick(raw, "MONGO_URL"),
    DB_NAME: pick(raw, "DB_NAME") || "mcp-forge",
    JWT_SECRET: pick(raw, "JWT_SECRET"),
    ALLOWED_ORIGIN: pick(raw, "ALLOWED_ORIGIN"),
    NODE_ENV: pick(raw, "NODE_ENV") || pick(raw, "ENVIRONMENT") || "production",
  };
}

export function getMissingEnv(env) {
  return REQUIRED.filter((key) => !env[key]);
}

export function getConfigHint(env) {
  const missing = getMissingEnv(env);
  if (missing.length === 0) return null;
  return `Server misconfigured: missing ${missing.join(", ")}`;
}

export function getConfigStatus(env) {
  const resolved = resolveEnv(env);
  const missing = getMissingEnv(resolved);
  return {
    ok: missing.length === 0,
    missing,
    configured: {
      mongo: Boolean(resolved.MONGO_URL),
      jwt: Boolean(resolved.JWT_SECRET),
      db: resolved.DB_NAME,
      origin: Boolean(resolved.ALLOWED_ORIGIN),
    },
  };
}
