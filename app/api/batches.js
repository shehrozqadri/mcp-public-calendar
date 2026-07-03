import { onRequestGet } from "../functions/api/batches.js";
import { createHandler } from "./_adapter.js";

export default createHandler({
  GET: onRequestGet,
});
