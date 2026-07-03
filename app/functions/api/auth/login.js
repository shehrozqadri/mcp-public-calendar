// POST /api/auth/login
// Validates SPOC email against spocDetail collection, issues JWT cookie.

import { getDb } from "../../utils/mongo.js";
import { signJwt } from "../../utils/jwt.js";
import { json, error, buildCookie, rateLimit, getClientIp } from "../../utils/response.js";
import { resolveEnv, getConfigHint } from "../../../server/env.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function onRequestPost({ request, env }) {
  const config = resolveEnv(env);
  const configHint = getConfigHint(config);
  if (configHint) return error(configHint, 503);

  // Rate limit login attempts by IP: 10 attempts/minute
  const ip = getClientIp(request);
  if (!rateLimit(`login:${ip}`, 10, 60000)) {
    return error("Too many attempts. Please try again shortly.", 429);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return error("Invalid request body", 400);
  }

  const orgName = (body.organization_name || "").toString().trim();
  const customerName = (body.customer_name || "").toString().trim();
  const email = (body.email || "").toString().toLowerCase().trim();
  const spocEmail = (body.spoc_email || "").toString().toLowerCase().trim();

  if (!orgName || orgName.length > 300) return error("Invalid organization name", 400);
  if (!customerName || customerName.length > 200) return error("Invalid customer name", 400);
  if (!EMAIL_RE.test(email)) return error("Invalid email address", 400);
  if (!EMAIL_RE.test(spocEmail)) return error("Invalid SPOC email address", 400);

  try {
    const db = await getDb(config);
    const spoc = await db.collection("spocDetail").findOne({
      $or: [{ emp_email: spocEmail }, { empEmail: spocEmail }],
    });

    if (!spoc) {
      return error(
        "MongoDB SPOC email is not registered. Please contact your MongoDB representative.",
        401
      );
    }

    const spocId = String(spoc._id || spoc.ID || spoc.id || "unknown");
    const spocName = spoc.emp_name || spoc.empName || "Unknown";
    const spocRole = spoc.emp_role || spoc.empRole || "Unknown";

    // Audit trail (non-blocking on failure)
    try {
      await db.collection("customer_logins").insertOne({
        organization_name: orgName,
        customer_name: customerName,
        email,
        spoc: {
          spoc_id: spocId,
          emp_name: spocName,
          emp_email: spocEmail,
          emp_role: spocRole,
        },
        logged_in_at: new Date(),
        ip,
      });
    } catch (e) {
      console.warn("Failed to log customer login:", e?.message);
    }

    const token = await signJwt(
      {
        sub: spocId,
        email,
        org: orgName,
        name: customerName,
        type: "access",
      },
      config.JWT_SECRET,
      28800
    );

    return json(
      {
        organization_name: orgName,
        customer_name: customerName,
        email,
        spoc: { name: spocName, email: spocEmail, role: spocRole },
      },
      {
        headers: {
          "Set-Cookie": buildCookie("access_token", token, { maxAge: 28800 }),
        },
      }
    );
  } catch (e) {
    const errMsg = e?.message || String(e);
    const errName = e?.name || "Error";
    console.error("Login error:", errName, errMsg, e?.stack);

    // Return a diagnostic hint to help identify config issues (safe to expose - no secrets)
    let hint = getConfigHint(resolveEnv(env)) || "Service temporarily unavailable";
    if (hint === "Service temporarily unavailable" && (errName === "MongoServerSelectionError" || errMsg.includes("ENOTFOUND") || errMsg.includes("ETIMEDOUT"))) {
      hint = "Cannot reach MongoDB Atlas (network/allowlist issue)";
    } else if (errMsg.includes("Authentication failed") || errMsg.includes("bad auth")) {
      hint = "MongoDB credentials rejected";
    } else if (errMsg.includes("nodejs_compat") || errMsg.includes("net.Socket") || errMsg.includes("tls.TLSSocket")) {
      hint = "nodejs_compat flag not enabled";
    }
    return error(hint, 503);
  }
}

export async function onRequest() {
  return error("Method not allowed", 405);
}
