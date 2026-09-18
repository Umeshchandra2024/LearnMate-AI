import "dotenv/config";
import { Worker } from "bullmq";
import { getRedisConnection, QUEUE_NAMES } from "@asc/shared";
import { processMaterial } from "./processors/materialProcessing.processor";
import { processMasteryUpdate } from "./processors/masteryUpdate.processor";
import { processRecommendationGeneration } from "./processors/recommendationGeneration.processor";

const connection = getRedisConnection();

const materialWorker = new Worker(QUEUE_NAMES.materialProcessing, processMaterial, {
  connection,
  concurrency: 2,
});

const masteryWorker = new Worker(QUEUE_NAMES.masteryUpdate, processMasteryUpdate, {
  connection,
  concurrency: 5,
});

const recommendationWorker = new Worker(
  QUEUE_NAMES.recommendationGeneration,
  processRecommendationGeneration,
  { connection, concurrency: 5 },
);

for (const worker of [materialWorker, masteryWorker, recommendationWorker]) {
  worker.on("completed", (job) => {
    console.log(`[${worker.name}] job ${job.id} completed`);
  });
  worker.on("failed", (job, err) => {
    console.error(`[${worker.name}] job ${job?.id} failed:`, err.message);
  });
}

console.log("Worker process started, listening for jobs...");

async function shutdown() {
  await Promise.all([materialWorker.close(), masteryWorker.close(), recommendationWorker.close()]);
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
