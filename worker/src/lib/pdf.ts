export interface PdfPageText {
  pageNumber: number;
  text: string;
}

export class CanvasUnavailableError extends Error {
  constructor() {
    super(
      "The 'canvas' native module is not installed/buildable in this environment, so " +
        "OCR rendering is unavailable. Install it (requires build tools) to enable OCR.",
    );
    this.name = "CanvasUnavailableError";
  }
}

// `canvas` has native bindings that require platform build tools (e.g. Visual Studio's
// "Desktop development with C++" workload on Windows). It's loaded lazily and optionally so
// the rest of the pipeline (native-text extraction, which covers the common case) keeps
// working in environments where it can't be installed — see OCR fallback in the processor.
async function loadCanvas() {
  try {
    return await import("canvas");
  } catch {
    throw new CanvasUnavailableError();
  }
}

// pdfjs-dist's legacy Node build is ESM-only and uses `import.meta.url`, which breaks under
// any CJS *require* of it. A plain `import(...)` isn't enough on its own here: compiling to
// CommonJS (our tsconfig's `module`) makes TypeScript downlevel dynamic `import()` into a
// `require()`-based shim, landing on the exact same failure. Routing the specifier through
// `new Function(...)` hides the `import()` call from TypeScript's compiler entirely (it's
// just a string at compile time), so it survives untouched to runtime as a real native
// dynamic import — which Node's CJS runtime *can* use to load an ESM module; it just can't
// `require()` one. This is what actually fixed the worker's Jest suite (see
// materialProcessingIdempotency.test.ts), not the plain `import()` alone.
const dynamicImport = new Function("specifier", "return import(specifier)") as (
  specifier: string,
) => Promise<typeof import("pdfjs-dist/legacy/build/pdf.mjs")>;

async function loadPdfJs() {
  return dynamicImport("pdfjs-dist/legacy/build/pdf.mjs");
}

/** Extracts native text content per page, without rendering (fast path). */
export async function extractTextPerPage(buffer: Buffer): Promise<PdfPageText[]> {
  const { getDocument } = await loadPdfJs();
  const doc = await getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages: PdfPageText[] = [];

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
    pages.push({ pageNumber, text: text.trim() });
  }

  return pages;
}

/** Renders a single page to a PNG buffer, used only as input to OCR for low-text pages. */
export async function renderPageToPng(buffer: Buffer, pageNumber: number): Promise<Buffer> {
  const { createCanvas } = await loadCanvas();
  const { getDocument } = await loadPdfJs();
  const doc = await getDocument({ data: new Uint8Array(buffer) }).promise;
  const page = await doc.getPage(pageNumber);

  const viewport = page.getViewport({ scale: 2 }); // higher scale improves OCR accuracy
  const canvas = createCanvas(viewport.width, viewport.height);
  const context = canvas.getContext("2d");

  await page.render({
    // `canvas` is an ambient `any`-typed module here (see loadCanvas), so no cast needed.
    canvasContext: context,
    viewport,
  }).promise;

  return canvas.toBuffer("image/png");
}

/** Heuristic: does this page have "enough" native text, or should it fall back to OCR? */
export function hasSufficientText(text: string): boolean {
  return text.replace(/\s/g, "").length > 20;
}
