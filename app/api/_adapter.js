// Bridge Vercel serverless handlers to shared API handlers
import "../server/loadEnv.js";
import { resolveEnv } from "../server/env.js";

function getAllowedOrigin(req) {
  const config = resolveEnv();
  return config.ALLOWED_ORIGIN || `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;
}

function applyCors(req, res) {
  const allowedOrigin = getAllowedOrigin(req);
  const origin = req.headers.origin;
  if (origin && origin === allowedOrigin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  }
}

function handleOptions(req, res) {
  const allowedOrigin = getAllowedOrigin(req);
  const origin = req.headers.origin;
  res.status(204);
  res.setHeader(
    "Access-Control-Allow-Origin",
    origin && origin === allowedOrigin ? origin : allowedOrigin
  );
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.end();
}

function buildRequest(req) {
  const protocol = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers.host;
  const url = `${protocol}://${host}${req.url}`;

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (!value) continue;
    if (Array.isArray(value)) {
      value.forEach((entry) => headers.append(key, entry));
    } else {
      headers.set(key, value);
    }
  }

  const init = { method: req.method, headers };

  if (req.method !== "GET" && req.method !== "HEAD" && req.body !== undefined) {
    init.body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
  }

  return new Request(url, init);
}

function getRuntimeEnv() {
  return resolveEnv({
    MONGO_URL: process.env.MONGO_URL,
    MONGODB_URI: process.env.MONGODB_URI,
    mongodb_uri: process.env.mongodb_uri,
    DB_NAME: process.env.DB_NAME,
    ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN,
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
  });
}

async function sendResponse(req, res, response) {
  applyCors(req, res);
  res.status(response.status);

  const setCookies = response.headers.getSetCookie?.() || [];
  if (setCookies.length > 0) {
    res.setHeader("Set-Cookie", setCookies);
  }

  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") return;
    res.setHeader(key, value);
  });

  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  res.send(await response.text());
}

export async function runHandler(handler, req, res) {
  if (req.method === "OPTIONS") {
    handleOptions(req, res);
    return;
  }

  const request = buildRequest(req);
  const response = await handler({ request, env: getRuntimeEnv() });
  await sendResponse(req, res, response);
}

export function createHandler(handlers) {
  return async function handler(req, res) {
    if (req.method === "OPTIONS") {
      handleOptions(req, res);
      return;
    }

    const methodHandler = handlers[req.method] || handlers.default;
    if (!methodHandler) {
      res.status(405).json({ detail: "Method not allowed" });
      return;
    }

    await runHandler(methodHandler, req, res);
  };
}
