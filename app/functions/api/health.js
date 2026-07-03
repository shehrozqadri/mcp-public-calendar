// GET /api/health - health check with configuration status
import { json } from "../utils/response.js";
import { getConfigStatus } from "../../server/env.js";

export async function onRequestGet({ env }) {
  const config = getConfigStatus(env);
  return json({
    status: config.ok ? "ok" : "degraded",
    config: config.configured,
    missing: config.missing,
    timestamp: new Date().toISOString(),
  });
}
