// GET /api/health - health check with configuration status
import { json } from "../utils/response.js";
import { getConfigStatus } from "../../server/env.js";
import { getDb } from "../../server/mongo.js";
import { getMongoUrlDiagnostics } from "../../server/mongoUrl.js";

export async function onRequestGet({ env }) {
  const config = getConfigStatus(env);
  const mongo = getMongoUrlDiagnostics(env?.MONGO_URL || process.env.MONGO_URL);

  let database = "unreachable";
  if (config.ok) {
    try {
      const db = await getDb(env);
      await db.command({ ping: 1 });
      database = "connected";
    } catch (error) {
      database = error?.message?.includes("bad auth") ||
        error?.message?.includes("Authentication failed")
        ? "auth_failed"
        : "unreachable";
    }
  }

  const ok = config.ok && database === "connected";

  return json({
    status: ok ? "ok" : "degraded",
    config: {
      ...config.configured,
      mongo_url: mongo.ok,
      database,
      mongo_host: mongo.host || null,
      mongo_user: mongo.username || null,
    },
    missing: config.missing,
    timestamp: new Date().toISOString(),
  });
}
