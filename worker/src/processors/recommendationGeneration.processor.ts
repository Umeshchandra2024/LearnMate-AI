import type { Job } from "bullmq";
import { generateRecommendation, type RecommendationGenerationJobData } from "@asc/shared";

/**
 * Triggered by the mastery-update job when it detects a repeated-mistake pattern (see
 * masteryUpdate.processor.ts). Generates and persists one grounded Recommendation row.
 */
export async function processRecommendationGeneration(
  job: Job<RecommendationGenerationJobData>,
): Promise<void> {
  const { userId, projectId } = job.data;
  const recommendation = await generateRecommendation({ userId, projectId });
  console.log(
    `[recommendation-generation] created recommendation for user ${userId}, project ${projectId}: "${recommendation.action}"`,
  );
}
