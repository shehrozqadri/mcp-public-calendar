import { ObjectId } from "mongodb";
import { getDb } from "./mongo.js";

export function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(";").forEach((c) => {
    const [name, ...rest] = c.trim().split("=");
    if (name) cookies[name] = decodeURIComponent(rest.join("="));
  });
  return cookies;
}

export function toProfileResponse(doc) {
  if (!doc) return null;
  return {
    organization_name: doc.organization_name,
    customer_name: doc.customer_name,
    email: doc.email,
    spoc: doc.spoc
      ? {
          name: doc.spoc.emp_name,
          email: doc.spoc.emp_email,
          role: doc.spoc.emp_role,
        }
      : undefined,
  };
}

export async function getUserFromRequest(request, rawEnv) {
  const cookies = parseCookies(request.headers.get("Cookie"));
  const userId = cookies.user_id;
  if (!userId) throw new Error("Not authenticated");

  let objectId;
  try {
    objectId = new ObjectId(userId);
  } catch {
    throw new Error("Not authenticated");
  }

  const db = await getDb(rawEnv);
  const profile = await db.collection("user_profiles").findOne({ _id: objectId });
  if (!profile) throw new Error("Not authenticated");

  return profile;
}

export async function upsertUserProfile(db, data) {
  const { organization_name, customer_name, email, spoc, ip } = data;
  const now = new Date();

  return db.collection("user_profiles").findOneAndUpdate(
    { email },
    {
      $set: {
        organization_name,
        customer_name,
        email,
        spoc,
        updated_at: now,
        last_login_at: now,
        last_ip: ip,
      },
      $setOnInsert: { created_at: now },
    },
    { upsert: true, returnDocument: "after" }
  );
}
