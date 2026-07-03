// GET /api/batches - returns training batches with optional filters
// Query params: status, location, track
import { getDb } from "../utils/mongo.js";
import { getUserFromRequest } from "../utils/jwt.js";
import { json, error } from "../utils/response.js";

function toIso(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function normalizeBatch(b) {
  const maxCapacity = b.maxCapacity ?? b.max_capacity ?? 0;
  const enrolled = b.enrolledCount ?? b.enrolled_count ?? 0;
  return {
    batch_id: String(b._id),
    batch_no: b.batchNo ?? b.batch_no ?? 0,
    training_name: b.trainingName ?? b.training_name ?? "",
    track: b.track ?? "",
    start_date: toIso(b.startDate ?? b.start_date),
    end_date: toIso(b.endDate ?? b.end_date),
    location: b.location ?? "",
    instructor: b.instructor ?? "",
    batch_type: b.batchType ?? b.batch_type ?? "",
    max_capacity: maxCapacity,
    enrolled_count: enrolled,
    available_seats: Math.max(0, maxCapacity - enrolled),
    status: b.status ?? "",
    nominations_closed: b.nominationsClosed ?? b.nominations_closed ?? false,
  };
}

export async function onRequestGet({ request, env }) {
  try {
    await getUserFromRequest(request, env);
  } catch {
    return error("Not authenticated", 401);
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const location = url.searchParams.get("location");
  const track = url.searchParams.get("track");

  const query = {};
  if (status) query.status = status;
  if (location && location !== "all") {
    if (location === "Others") {
      query.location = { $nin: ["Pune"] };
    } else {
      query.location = location;
    }
  }
  if (track && track !== "all") query.track = track;

  try {
    const db = await getDb(env);
    const docs = await db.collection("batches").find(query).limit(500).toArray();
    return json(docs.map(normalizeBatch));
  } catch (e) {
    console.error("Batches error:", e);
    return error("Failed to fetch batches", 503);
  }
}
