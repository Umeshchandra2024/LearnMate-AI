import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * Chunk.embedding is a pgvector column mapped as Prisma `Unsupported("vector(384)")`,
 * which Prisma's generated client cannot read or write through normal create/update calls.
 * Writing (and similarity-searching, below) it requires raw SQL.
 */
export async function setChunkEmbedding(chunkId: string, embedding: number[]): Promise<void> {
  const vectorLiteral = `[${embedding.join(",")}]`;
  await prisma.$executeRaw`UPDATE "Chunk" SET embedding = ${vectorLiteral}::vector WHERE id = ${chunkId}`;
}

export interface SimilarChunk {
  id: string;
  content: string;
  pageNumber: number;
  materialId: string;
  materialTitle: string;
  similarity: number;
}

/**
 * Cosine-similarity search over Chunk.embedding, restricted to one project. The WHERE
 * clause is the entire isolation boundary here — callers MUST have already verified the
 * requesting user owns `projectId` (the same pattern proven in crossUserIsolation.test.ts)
 * before calling this, since this function trusts projectId completely.
 */
export async function searchSimilarChunks(
  projectId: string,
  queryEmbedding: number[],
  topK: number,
): Promise<SimilarChunk[]> {
  const vectorLiteral = `[${queryEmbedding.join(",")}]`;
  return prisma.$queryRaw<SimilarChunk[]>`
    SELECT
      c.id AS "id",
      c.content AS "content",
      c."pageNumber" AS "pageNumber",
      c."materialId" AS "materialId",
      m.title AS "materialTitle",
      1 - (c.embedding <=> ${vectorLiteral}::vector) AS "similarity"
    FROM "Chunk" c
    JOIN "Material" m ON m.id = c."materialId"
    WHERE c."projectId" = ${projectId} AND c.embedding IS NOT NULL
    ORDER BY c.embedding <=> ${vectorLiteral}::vector ASC
    LIMIT ${topK}
  `;
}

/** Caches a Concept's embedding (of its name+description) so it's computed at most once. */
export async function setConceptEmbedding(conceptId: string, embedding: number[]): Promise<void> {
  const vectorLiteral = `[${embedding.join(",")}]`;
  await prisma.$executeRaw`UPDATE "Concept" SET embedding = ${vectorLiteral}::vector WHERE id = ${conceptId}`;
}

/** Reads back a cached Concept embedding, or null if it hasn't been computed/cached yet. */
export async function getConceptEmbedding(conceptId: string): Promise<number[] | null> {
  const rows = await prisma.$queryRaw<{ embedding: string | null }[]>`
    SELECT embedding::text AS embedding FROM "Concept" WHERE id = ${conceptId}
  `;
  const raw = rows[0]?.embedding;
  if (!raw) return null;
  return raw
    .slice(1, -1)
    .split(",")
    .map((n) => Number(n));
}

export { Prisma };
