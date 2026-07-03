import { onRequestPost } from "../../functions/api/auth/logout.js";
import { createHandler } from "../_adapter.js";

export default createHandler({
  POST: onRequestPost,
});
