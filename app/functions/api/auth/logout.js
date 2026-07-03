// POST /api/auth/logout - clears the session cookie
import { json, clearCookie } from "../../utils/response.js";

export async function onRequestPost() {
  const headers = new Headers();
  headers.append("Set-Cookie", clearCookie("user_id"));
  headers.append("Set-Cookie", clearCookie("access_token"));

  return json({ message: "Logged out successfully" }, { headers });
}
