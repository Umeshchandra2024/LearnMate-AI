import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { getQuiz, generateNextQuestion, completeQuiz } from "../controllers/quizzes.controller";

const router = Router();

router.use(requireAuth);

router.get("/:id", asyncHandler(getQuiz));
router.post("/:id/questions", asyncHandler(generateNextQuestion));
router.post("/:id/complete", asyncHandler(completeQuiz));

export default router;
