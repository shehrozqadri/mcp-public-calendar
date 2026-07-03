import { MongoClient } from "mongodb";
import { resolveEnv } from "./env.js";
import { normalizeMongoUrl } from "./mongoUrl.js";

let cachedClient = null;
let cachedPromise = null;

export async function getMongoClient(rawEnv) {
  const env = resolveEnv(rawEnv);
  if (cachedClient) return cachedClient;

  if (!cachedPromise) {
    if (!env.MONGO_URL) throw new Error("MONGO_URL is not configured");

    const uri = normalizeMongoUrl(env.MONGO_URL);

    cachedPromise = MongoClient.connect(uri, {
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000,
      maxPoolSize: 3,
      minPoolSize: 0,
    })
      .then((client) => {
        cachedClient = client;
        return client;
      })
      .catch((err) => {
        cachedPromise = null;
        throw err;
      });
  }

  return cachedPromise;
}

export async function getDb(rawEnv) {
  const env = resolveEnv(rawEnv);
  const client = await getMongoClient(env);
  return client.db(env.DB_NAME);
}
