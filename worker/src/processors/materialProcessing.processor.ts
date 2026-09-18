import type { Job } from "bullmq";
import {
  prisma,
  generateEmbeddings,
  setChunkEmbedding,
  setConceptEmbedding,
  type MaterialProcessingJobData,
} from "@asc/shared";
import { downloadFile } from "../lib/download";
import {
  extractTextPerPage,
  renderPageToPng,
  hasSufficientText,
  CanvasUnavailableError,
  type PdfPageText,
} from "../lib/pdf";
import { ocrImageBuffer } from "../lib/ocr";
import { chunkPages } from "../lib/chunk";
import { extractConcepts } from "../lib/concepts";

/**
 * Processes one uploaded PDF end to end: extract text (falling back to OCR per page where
 * native text is too sparse), chunk it, embed the chunks, extract concepts, then atomically
 * swap in the new Chunks/Concepts for this material. The whole extraction pipeline runs
 * BEFORE the DB write so a retried/duplicated job never leaves partial state — the only
 * database mutation that matters for idempotency is the final delete-then-insert swap.
 */
export async function processMaterial(job: Job<MaterialProcessingJobData>): Promise<void> {
  const { materialId, projectId, userId } = job.data;

  const material = await prisma.material.findUnique({ where: { id: materialId } });
  if (!material) {
    // Material was deleted after the job was enqueued; nothing to do.
    return;
  }

  await prisma.material.update({
    where: { id: materialId },
    data: { status: "PROCESSING", errorMessage: null },
  });

  try {
    const pdfBuffer = await downloadFile(material.fileUrl);
    const nativePages = await extractTextPerPage(pdfBuffer);

    const resolvedPages: PdfPageText[] = [];
    for (const page of nativePages) {
      if (hasSufficientText(page.text)) {
        resolvedPages.push(page);
        continue;
      }
      // Per-page OCR fallback: a single PDF can mix native-text and scanned pages.
      try {
        const png = await renderPageToPng(pdfBuffer, page.pageNumber);
        const ocrText = await ocrImageBuffer(png);
        resolvedPages.push({ pageNumber: page.pageNumber, text: ocrText });
      } catch (ocrError) {
        if (ocrError instanceof CanvasUnavailableError) {
          // OCR isn't available in this environment (see lib/pdf.ts). Degrade gracefully:
          // keep whatever sparse native text this page had rather than failing the whole
          // material, so native-text PDFs (the common case) still process end to end.
          console.warn(
            `[material ${materialId}] OCR unavailable for page ${page.pageNumber}, keeping native text`,
          );
          resolvedPages.push(page);
        } else {
          throw ocrError;
        }
      }
    }

    const chunks = chunkPages(resolvedPages);
    if (chunks.length === 0) {
      throw new Error("No extractable text found in this document (native or OCR).");
    }

    // One batched call for all of this material's chunks, not one call per chunk.
    const embeddings = await generateEmbeddings(chunks.map((c) => c.content));

    const fullText = resolvedPages.map((p) => p.text).join("\n\n");
    const concepts = await extractConcepts({
      materialTitle: material.title,
      fullText,
      userId,
      projectId,
    });

    const { createdChunkIds, createdConcepts } = await prisma.$transaction(async (tx) => {
      // Idempotent swap: a retried job (or a duplicate delivery) re-derives everything above
      // from scratch and clears out whatever this material previously wrote before inserting.
      await tx.chunk.deleteMany({ where: { materialId } });
      await tx.concept.deleteMany({ where: { materialId } });

      const chunkIds: string[] = [];
      for (const chunk of chunks) {
        const created = await tx.chunk.create({
          data: {
            materialId,
            projectId,
            content: chunk.content,
            pageNumber: chunk.pageNumber,
            tokenCount: chunk.tokenCount,
          },
        });
        chunkIds.push(created.id);
      }

      const conceptRows: { id: string; name: string; description: string | null }[] = [];
      for (const concept of concepts) {
        const created = await tx.concept.create({
          data: {
            projectId,
            materialId,
            name: concept.name,
            description: concept.description,
          },
        });
        conceptRows.push(created);
      }

      return { createdChunkIds: chunkIds, createdConcepts: conceptRows };
    });

    // Vector writes go through raw SQL (Prisma can't target Unsupported columns) and happen
    // after the transaction commits since $transaction callbacks can't mix tx and $executeRaw
    // on the raw prisma client; each write is independently idempotent (same id, same value).
    for (let i = 0; i < createdChunkIds.length; i++) {
      await setChunkEmbedding(createdChunkIds[i], embeddings[i]);
    }

    // Cache each concept's embedding now (one batched call), so quiz question generation and
    // grading never have to re-embed the same never-changing concept text per question later.
    if (createdConcepts.length > 0) {
      const conceptEmbeddings = await generateEmbeddings(
        createdConcepts.map((c) => [c.name, c.description].filter(Boolean).join(": ")),
      );
      for (let i = 0; i < createdConcepts.length; i++) {
        await setConceptEmbedding(createdConcepts[i].id, conceptEmbeddings[i]);
      }
    }

    await prisma.material.update({
      where: { id: materialId },
      data: { status: "READY", pageCount: resolvedPages.length, errorMessage: null },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.material.update({
      where: { id: materialId },
      data: { status: "FAILED", errorMessage: message },
    });
    throw error; // rethrow so BullMQ counts this attempt as failed and applies retry/backoff
  }
}
