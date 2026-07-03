import { onRequestGet } from "../functions/api/courses.js";
import { createHandler } from "./_adapter.js";

export default createHandler({
  GET: onRequestGet,
});
