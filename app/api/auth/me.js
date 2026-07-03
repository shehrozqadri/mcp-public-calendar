import { onRequestGet } from "../../functions/api/auth/me.js";
import { createHandler } from "../_adapter.js";

export default createHandler({
  GET: onRequestGet,
});
