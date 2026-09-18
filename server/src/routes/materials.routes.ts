import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { retryMaterial } from "../controllers/materials.controller";

const router = Router();

router.use(requireAuth);

router.post("/:id/retry", asyncHandler(retryMaterial));

export default router;
