import { onRequestPost, onRequest } from "../../functions/api/auth/login.js";
import { createHandler } from "../_adapter.js";

export default createHandler({
  POST: onRequestPost,
  default: onRequest,
});
