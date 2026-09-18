import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import {
  listSpaces,
  createSpace,
  getSpace,
  updateSpace,
  deleteSpace,
} from "../controllers/spaces.controller";
import { listProjectsForSpace, createProject } from "../controllers/projects.controller";

const router = Router();

router.use(requireAuth);

router.get("/", asyncHandler(listSpaces));
router.post("/", asyncHandler(createSpace));
router.get("/:id", asyncHandler(getSpace));
router.patch("/:id", asyncHandler(updateSpace));
router.delete("/:id", asyncHandler(deleteSpace));

router.get("/:spaceId/projects", asyncHandler(listProjectsForSpace));
router.post("/:spaceId/projects", asyncHandler(createProject));

export default router;
