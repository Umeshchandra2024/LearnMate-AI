import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { getConversation, sendMessage } from "../controllers/conversations.controller";

const router = Router();

router.use(requireAuth);

router.get("/:id", asyncHandler(getConversation));
router.post("/:id/messages", asyncHandler(sendMessage));

export default router;
