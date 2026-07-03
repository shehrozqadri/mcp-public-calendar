// GET /api/auth/me - returns the current authenticated user
import { getUserFromRequest } from "../../utils/jwt.js";
import { json, error } from "../../utils/response.js";

export async function onRequestGet({ request, env }) {
  try {
    const user = await getUserFromRequest(request, env);
    return json({
      organization_name: user.org,
      customer_name: user.name,
      email: user.email,
    });
  } catch {
    return error("Not authenticated", 401);
  }
}
