import type { Job } from "bullmq";
import { prisma, type MaterialProcessingJobData } from "@asc/shared";
import { processMaterial } from "../processors/materialProcessing.processor";

// Reuses the real, already-uploaded Phase 1 sample material rather than uploading a fresh
// one — this test cares about the processor's idempotency, not the upload path.
const SAMPLE_PDF_URL =
  "https://res.cloudinary.com/duo6fgjhq/image/upload/v1789728335/study-companion/cmu6tu1uo00001bambseskw4o/cmu6tu9bw00041bam6rgs60yr/1789728334014-sample-material.pdf";

/**
 * Simulates BullMQ retrying (or duplicate-delivering) a material-processing job — the real
 * scenario the delete-then-insert transaction in materialProcessing.processor.ts exists to
 * protect against. Runs the real pipeline (real embeddings, real concept extraction) twice
 * for the same materialId and asserts the second run doesn't leave duplicate Chunk/Concept
 * rows, per the brief's own idempotency test description.
 */
describe("material-processing job idempotency", () => {
  const suffix = Date.now();
  let userId: string;
  let projectId: string;
  let materialId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `idempotency-test-${suffix}@example.com`,
        name: "Idempotency Test",
        passwordHash: "not-a-real-hash-this-user-never-logs-in",
      },
    });
    userId = user.id;

    const space = await prisma.space.create({ data: { userId, name: "Idempotency Test Space" } });
    const project = await prisma.project.create({
      data: { spaceId: space.id, userId, name: "Idempotency Test Project" },
    });
    projectId = project.id;

    const material = await prisma.material.create({
      data: {
        projectId,
        userId,
        title: "sample-material.pdf",
        fileUrl: SAMPLE_PDF_URL,
        fileType: "application/pdf",
        status: "QUEUED",
      },
    });
    materialId = material.id;
  });

  afterAll(async () => {
    // Cascades: User -> Space -> Project -> Material -> Chunk/Concept.
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("running the same job twice does not duplicate Chunk/Concept rows", async () => {
    const job = { data: { materialId, projectId, userId } } as Job<MaterialProcessingJobData>;

    await processMaterial(job);
    const chunksAfterFirst = await prisma.chunk.count({ where: { materialId } });
    const conceptsAfterFirst = await prisma.concept.count({ where: { materialId } });
    expect(chunksAfterFirst).toBeGreaterThan(0);
    expect(conceptsAfterFirst).toBeGreaterThan(0);

    // Simulate a retry/duplicate delivery of the exact same job.
    await processMaterial(job);
    const chunksAfterSecond = await prisma.chunk.count({ where: { materialId } });
    const conceptsAfterSecond = await prisma.concept.count({ where: { materialId } });

    expect(chunksAfterSecond).toBe(chunksAfterFirst);
    expect(conceptsAfterSecond).toBe(conceptsAfterFirst);

    const material = await prisma.material.findUniqueOrThrow({ where: { id: materialId } });
    expect(material.status).toBe("READY");
  });
});
