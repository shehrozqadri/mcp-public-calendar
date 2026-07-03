// GET /api/auth/me - returns the current user profile from MongoDB
import { getUserFromRequest, toProfileResponse } from "../../../server/session.js";
import { json, error } from "../../utils/response.js";

export async function onRequestGet({ request, env }) {
  try {
    const profile = await getUserFromRequest(request, env);
    return json(toProfileResponse(profile));
  } catch {
    return error("Not authenticated", 401);
  }
}
