// GET /api/courses - returns the static course catalog
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { json, error } from "../utils/response.js";
import { getUserFromRequest } from "../../server/session.js";

const courses = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "_courses.json"),
    "utf8"
  )
);

export async function onRequestGet({ request, env }) {
  try {
    await getUserFromRequest(request, env);
  } catch {
    return error("Not authenticated", 401);
  }
  return json(courses);
}
