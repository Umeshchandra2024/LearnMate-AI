import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { getProject, updateProject, deleteProject } from "../controllers/projects.controller";
import {
  listMaterialsForProject,
  uploadMaterial,
  upload,
} from "../controllers/materials.controller";
import { listConversations, createConversation } from "../controllers/conversations.controller";
import { createQuiz } from "../controllers/quizzes.controller";
import { getProjectMastery, listRecommendations } from "../controllers/mastery.controller";
import { getProjectAnalytics } from "../controllers/analytics.controller";

const router = Router();

router.use(requireAuth);

router.get("/:id", asyncHandler(getProject));
router.patch("/:id", asyncHandler(updateProject));
router.delete("/:id", asyncHandler(deleteProject));

router.get("/:projectId/materials", asyncHandler(listMaterialsForProject));
router.post("/:projectId/materials", upload.single("file"), asyncHandler(uploadMaterial));

router.get("/:projectId/conversations", asyncHandler(listConversations));
router.post("/:projectId/conversations", asyncHandler(createConversation));

router.post("/:projectId/quizzes", asyncHandler(createQuiz));

router.get("/:projectId/mastery", asyncHandler(getProjectMastery));
router.get("/:projectId/recommendations", asyncHandler(listRecommendations));
router.get("/:projectId/analytics", asyncHandler(getProjectAnalytics));

export default router;
