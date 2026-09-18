import { InferenceClient } from "@huggingface/inference";
import { getEnv } from "./env";

let client: InferenceClient | undefined;

function getClient(): InferenceClient {
  if (client) return client;
  const env = getEnv();
  client = new InferenceClient(env.HUGGINGFACEHUB_API_TOKEN);
  return client;
}

const MAX_RETRIES = 2;
const DEFAULT_COLD_START_WAIT_MS = 12_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** True for a 503 "model is loading" response, which is retryable; false for anything else. */
function isColdStartError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /503/.test(message) || /currently loading/i.test(message) || /loading/i.test(message);
}

/** Pulls `estimated_time` (seconds) out of the HF error body/message when present. */
function extractEstimatedWaitMs(error: unknown): number | undefined {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/estimated_time["\s:]+(\d+(?:\.\d+)?)/i);
  if (!match) return undefined;
  return Math.ceil(parseFloat(match[1]) * 1000);
}

/** Never echoes the token: HF error messages don't include it, but this keeps that explicit. */
function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/hf_[a-zA-Z0-9]+/g, "[redacted]");
}

// A sentence-embedding model like bge-small should return one flat vector per input (batch x
// dim). Some feature-extraction endpoints instead return token-level embeddings (batch x
// tokens x dim) when the model has no built-in pooling head; mean-pool over tokens in that
// case so callers always get one vector per input text.
function normalizeToSentenceVectors(raw: unknown, expectedCount: number): number[][] {
  if (!Array.isArray(raw)) {
    throw new Error("Hugging Face embeddings response was not an array");
  }
  if (raw.length !== expectedCount) {
    throw new Error(
      `Hugging Face embeddings response had ${raw.length} vectors, expected ${expectedCount}`,
    );
  }

  return raw.map((item) => {
    if (Array.isArray(item) && typeof item[0] === "number") {
      return item as number[];
    }
    if (Array.isArray(item) && Array.isArray(item[0])) {
      // Token-level embeddings for one input: mean-pool across the token dimension.
      const tokens = item as number[][];
      const dim = tokens[0].length;
      const pooled = new Array(dim).fill(0);
      for (const token of tokens) {
        for (let i = 0; i < dim; i++) pooled[i] += token[i];
      }
      return pooled.map((sum) => sum / tokens.length);
    }
    throw new Error("Hugging Face embeddings response had an unrecognized vector shape");
  });
}

function validateDimensions(vectors: number[][], expectedDimensions: number): void {
  for (const [index, vector] of vectors.entries()) {
    if (vector.length !== expectedDimensions) {
      throw new Error(
        `Embedding at index ${index} has ${vector.length} dimensions, expected ${expectedDimensions}. ` +
          "Refusing to write a mismatched vector to the database.",
      );
    }
  }
}

/**
 * Generates embeddings for a batch of texts via the Hugging Face hosted Inference API
 * (never a local model). Retries once or twice on a 503 cold-start response, then throws.
 * Validates every returned vector has exactly EMBEDDINGS_DIMENSIONS dimensions before
 * returning, so a silent provider/model mismatch can never reach the pgvector column.
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const env = getEnv();

  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await getClient().featureExtraction({
        model: env.EMBEDDINGS_MODEL,
        inputs: texts,
      });

      const vectors = normalizeToSentenceVectors(result, texts.length);
      validateDimensions(vectors, env.EMBEDDINGS_DIMENSIONS);
      return vectors;
    } catch (error) {
      lastError = error;
      if (!isColdStartError(error) || attempt === MAX_RETRIES) {
        throw new Error(`Hugging Face embeddings request failed: ${describeError(error)}`, {
          cause: error,
        });
      }
      await sleep(extractEstimatedWaitMs(error) ?? DEFAULT_COLD_START_WAIT_MS);
    }
  }

  // Unreachable, but keeps TypeScript happy about the loop always returning/throwing.
  throw new Error(`Hugging Face embeddings request failed: ${describeError(lastError)}`);
}
