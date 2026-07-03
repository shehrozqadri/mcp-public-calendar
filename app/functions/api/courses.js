// GET /api/courses - returns the static course catalog
// Content is bundled with the function to avoid an extra request.
import { json, error } from "../utils/response.js";
import { getUserFromRequest } from "../../server/session.js";
import courses from "./_courses.json";

export async function onRequestGet({ request, env }) {
  try {
    await getUserFromRequest(request, env);
  } catch {
    return error("Not authenticated", 401);
  }
  return json(courses);
}
