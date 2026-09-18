import { Router } from "express";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import {
  getMaterialProcessingQueue,
  getMasteryUpdateQueue,
  getRecommendationGenerationQueue,
} from "@asc/shared";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { listUsers, getUserDetail } from "../controllers/admin/users.controller";
import { listActivity } from "../controllers/admin/activity.controller";
import { getAiUsageSummary, listAiUsageFailures } from "../controllers/admin/aiUsage.controller";
import { getEvalResults } from "../controllers/admin/evals.controller";

const router = Router();

// Every route below is admin-only, enforced server-side — this is the ONLY gate; there is
// no client-side check anywhere in this app that a route relies on for actual security.
router.use(requireAuth, requireAdmin);

router.get("/users", asyncHandler(listUsers));
router.get("/users/:id", asyncHandler(getUserDetail));
router.get("/activity", asyncHandler(listActivity));
router.get("/ai-usage", asyncHandler(getAiUsageSummary));
router.get("/ai-usage/failures", asyncHandler(listAiUsageFailures));
router.get("/evals", asyncHandler(getEvalResults));

// Bull Board: a full read-mostly UI for job health (recent runs, success/fail/retry counts
// per queue) — reused rather than hand-built per the brief's own preference. It isn't
// truly read-only (it ships retry/remove buttons), but everyone who can reach it has
// already passed requireAdmin above, so that's an acceptable tradeoff for an internal tool
// rather than wiring a second permission layer just to disable buttons only admins can see.
const bullBoardAdapter = new ExpressAdapter();
bullBoardAdapter.setBasePath("/api/admin/queues");
createBullBoard({
  queues: [
    new BullMQAdapter(getMaterialProcessingQueue()),
    new BullMQAdapter(getMasteryUpdateQueue()),
    new BullMQAdapter(getRecommendationGenerationQueue()),
  ],
  serverAdapter: bullBoardAdapter,
});
router.use("/queues", bullBoardAdapter.getRouter());

export default router;
