import { resolveEnv } from "./env.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64UrlEncode(input) {
  let str;
  if (input instanceof Uint8Array) {
    str = btoa(String.fromCharCode(...input));
  } else if (typeof input === "string") {
    str = btoa(input);
  } else {
    str = btoa(JSON.stringify(input));
  }
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = str.length % 4;
  if (pad) str += "=".repeat(4 - pad);
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function importKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function signJwt(payload, secret, expiresInSeconds = 28800) {
  if (!secret) throw new Error("JWT_SECRET is not configured");

  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, iat: now, exp: now + expiresInSeconds };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const key = await importKey(secret);
  const sigBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(signingInput));
  const signature = base64UrlEncode(new Uint8Array(sigBuffer));

  return `${signingInput}.${signature}`;
}

export async function verifyJwt(token, secret) {
  if (!secret) throw new Error("JWT_SECRET is not configured");
  if (!token || typeof token !== "string") throw new Error("Invalid token");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed token");

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const key = await importKey(secret);
  const signature = base64UrlDecode(encodedSignature);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    signature,
    encoder.encode(signingInput)
  );
  if (!valid) throw new Error("Invalid signature");

  const payload = JSON.parse(decoder.decode(base64UrlDecode(encodedPayload)));
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) throw new Error("Token expired");

  return payload;
}

export function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(";").forEach((c) => {
    const [name, ...rest] = c.trim().split("=");
    if (name) cookies[name] = decodeURIComponent(rest.join("="));
  });
  return cookies;
}

export async function getUserFromRequest(request, rawEnv) {
  const env = resolveEnv(rawEnv);
  const cookies = parseCookies(request.headers.get("Cookie"));
  const token = cookies["access_token"];
  if (!token) throw new Error("Not authenticated");
  return verifyJwt(token, env.JWT_SECRET);
}
