import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { getDashboard } from "../controllers/dashboard.controller";

const router = Router();

router.use(requireAuth);

router.get("/", asyncHandler(getDashboard));

export default router;
