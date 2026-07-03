// POST /api/auth/logout - clears the JWT cookie
import { json, clearCookie } from "../../utils/response.js";

export async function onRequestPost() {
  return json(
    { message: "Logged out successfully" },
    { headers: { "Set-Cookie": clearCookie("access_token") } }
  );
}
