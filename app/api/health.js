import { onRequestGet } from "../functions/api/health.js";
import { createHandler } from "./_adapter.js";

export default createHandler({
  GET: onRequestGet,
});
