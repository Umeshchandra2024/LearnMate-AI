import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { submitAttempt } from "../controllers/quizzes.controller";

const router = Router();

router.use(requireAuth);

router.post("/:id/attempts", asyncHandler(submitAttempt));

export default router;
