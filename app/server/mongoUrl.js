import { resolveEnv } from "./env.js";

export function normalizeMongoUrl(rawUrl) {
  if (!rawUrl) return undefined;

  let url = String(rawUrl).trim();
  if (
    (url.startsWith('"') && url.endsWith('"')) ||
    (url.startsWith("'") && url.endsWith("'"))
  ) {
    url = url.slice(1, -1).trim();
  }

  if (!url.startsWith("mongodb://") && !url.startsWith("mongodb+srv://")) {
    throw new Error(
      "MONGO_URL must start with mongodb:// or mongodb+srv://"
    );
  }

  return url;
}

export function getMongoUrlDiagnostics(rawUrl) {
  try {
    const url = normalizeMongoUrl(rawUrl);
    const normalized = url
      .replace("mongodb+srv://", "https://")
      .replace("mongodb://", "http://");
    const parsed = new URL(normalized);

    return {
      ok: true,
      host: parsed.hostname,
      username: parsed.username || null,
      hasPassword: Boolean(parsed.password),
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
    };
  }
}
