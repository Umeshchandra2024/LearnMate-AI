import { createWorker } from "tesseract.js";

/** Runs OCR on a single page image. Only called for pages that failed the native-text check. */
export async function ocrImageBuffer(imageBuffer: Buffer): Promise<string> {
  const worker = await createWorker("eng");
  try {
    const {
      data: { text },
    } = await worker.recognize(imageBuffer);
    return text.trim();
  } finally {
    await worker.terminate();
  }
}
