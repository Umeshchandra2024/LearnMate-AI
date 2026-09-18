import { Queue, type JobsOptions } from "bullmq";
import { getRedisConnection } from "./redis";

export const QUEUE_NAMES = {
  materialProcessing: "material-processing",
  masteryUpdate: "mastery-update",
  recommendationGeneration: "recommendation-generation",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export interface MaterialProcessingJobData {
  materialId: string;
  projectId: string;
  userId: string;
}

export interface MasteryUpdateJobData {
  userId: string;
  projectId: string;
  conceptId: string;
}

export interface RecommendationGenerationJobData {
  userId: string;
  projectId: string;
}

const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5000 },
  removeOnComplete: { age: 24 * 3600, count: 1000 },
  removeOnFail: { age: 7 * 24 * 3600 },
};

let materialProcessingQueue: Queue<MaterialProcessingJobData> | undefined;
let masteryUpdateQueue: Queue<MasteryUpdateJobData> | undefined;
let recommendationGenerationQueue: Queue<RecommendationGenerationJobData> | undefined;

export function getMaterialProcessingQueue() {
  if (!materialProcessingQueue) {
    materialProcessingQueue = new Queue(QUEUE_NAMES.materialProcessing, {
      connection: getRedisConnection(),
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
  }
  return materialProcessingQueue;
}

export function getMasteryUpdateQueue() {
  if (!masteryUpdateQueue) {
    masteryUpdateQueue = new Queue(QUEUE_NAMES.masteryUpdate, {
      connection: getRedisConnection(),
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
  }
  return masteryUpdateQueue;
}

export function getRecommendationGenerationQueue() {
  if (!recommendationGenerationQueue) {
    recommendationGenerationQueue = new Queue(QUEUE_NAMES.recommendationGeneration, {
      connection: getRedisConnection(),
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
  }
  return recommendationGenerationQueue;
}

/**
 * Enqueues a material-processing job keyed by materialId. Passing the same jobKey as
 * BullMQ's jobId makes re-enqueuing (e.g. a user clicking "Retry") a no-op while the
 * original job is still active/waiting, instead of creating a duplicate. The processor
 * itself is additionally idempotent (delete-then-insert transaction) so a genuine retry
 * after failure still can't double-write state.
 */
// BullMQ job IDs may not contain ":" (it uses colons as a Redis key separator internally),
// so jobKeys below use "-" even though several of the pieces (cuids) are themselves
// colon-free — keeping the separator consistent avoids re-tripping this on a future field.
export async function enqueueMaterialProcessing(data: MaterialProcessingJobData) {
  const jobKey = `material-${data.materialId}`;
  return getMaterialProcessingQueue().add("process-material", data, { jobId: jobKey });
}

export async function enqueueMasteryUpdate(data: MasteryUpdateJobData) {
  const jobKey = `mastery-${data.userId}-${data.projectId}-${data.conceptId}-${Date.now()}`;
  return getMasteryUpdateQueue().add("update-mastery", data, { jobId: jobKey });
}

export async function enqueueRecommendationGeneration(data: RecommendationGenerationJobData) {
  // Deduped per user+project+day, NOT per user+project alone: a constant jobId would mean
  // BullMQ treats every future trigger as a duplicate of the very first job ever enqueued
  // for that project (jobIds are remembered as long as the completed job's removeOnComplete
  // retention keeps it around), so a repeated-mistake pattern detected next week would
  // silently no-op forever after the first recommendation. A day-scoped key still collapses
  // a burst of triggers (e.g. several quizzes completed in the same sitting) into one call,
  // while still allowing a fresh recommendation each subsequent day.
  const dayKey = new Date().toISOString().slice(0, 10);
  const jobKey = `recommendation-${data.userId}-${data.projectId}-${dayKey}`;
  return getRecommendationGenerationQueue().add("generate-recommendation", data, {
    jobId: jobKey,
  });
}
