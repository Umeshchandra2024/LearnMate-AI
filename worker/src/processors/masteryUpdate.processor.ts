import type { Job } from "bullmq";
import { prisma, enqueueRecommendationGeneration, type MasteryUpdateJobData } from "@asc/shared";

const RECENT_ATTEMPTS_TO_CHECK = 5;
const MISTAKE_SCORE_THRESHOLD = 70;
const REPEATED_MISTAKE_COUNT = 2; // "same concept missed 2+ times recently"

/**
 * Runs after a quiz completion writes a Mastery row for one concept (see
 * quizzes.controller.ts). Checks whether the student has repeatedly missed this concept —
 * 2 or more of their last few attempts on it scoring below the mistake threshold — and, if
 * so, enqueues recommendation-generation. The recommendation job itself is still a stub
 * (Phase 4 will implement it); this only needs to confirm the pattern check fires and the
 * enqueue happens with a real, valid jobKey.
 */
export async function processMasteryUpdate(job: Job<MasteryUpdateJobData>): Promise<void> {
  const { userId, projectId, conceptId } = job.data;

  const recentAttempts = await prisma.quizAttempt.findMany({
    where: { userId, quizQuestion: { conceptId } },
    orderBy: { createdAt: "desc" },
    take: RECENT_ATTEMPTS_TO_CHECK,
  });

  const mistakeCount = recentAttempts.filter(
    (a) => a.score !== null && a.score < MISTAKE_SCORE_THRESHOLD,
  ).length;

  if (mistakeCount >= REPEATED_MISTAKE_COUNT) {
    console.log(
      `[mastery-update] repeated-mistake pattern on concept ${conceptId} for user ${userId} ` +
        `(${mistakeCount}/${recentAttempts.length} recent attempts below ${MISTAKE_SCORE_THRESHOLD}) — enqueuing recommendation-generation`,
    );
    await enqueueRecommendationGeneration({ userId, projectId });
  }
}
