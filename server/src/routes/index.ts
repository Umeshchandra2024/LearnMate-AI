import { Router } from "express";
import authRoutes from "./auth.routes";
import spacesRoutes from "./spaces.routes";
import projectsRoutes from "./projects.routes";
import materialsRoutes from "./materials.routes";
import conversationsRoutes from "./conversations.routes";
import quizzesRoutes from "./quizzes.routes";
import quizQuestionsRoutes from "./quizQuestions.routes";
import dashboardRoutes from "./dashboard.routes";
import adminRoutes from "./admin.routes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/spaces", spacesRoutes);
router.use("/projects", projectsRoutes);
router.use("/materials", materialsRoutes);
router.use("/conversations", conversationsRoutes);
router.use("/quizzes", quizzesRoutes);
router.use("/quiz-questions", quizQuestionsRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/admin", adminRoutes);

export default router;
