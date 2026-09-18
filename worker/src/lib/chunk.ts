import type { PdfPageText } from "./pdf";

export interface TextChunk {
  pageNumber: number;
  content: string;
  tokenCount: number;
}

// ~1 token ≈ 0.75 English words, so ~500-800 tokens ≈ 375-600 words.
const TARGET_WORDS_PER_CHUNK = 550;

function estimateTokenCount(words: string[]): number {
  return Math.round(words.length / 0.75);
}

/**
 * Chunks each page's text independently (chunks never span pages, so every chunk keeps a
 * single, accurate page-number citation). A page longer than the target is split into
 * multiple chunks; short pages become one chunk each.
 */
export function chunkPages(pages: PdfPageText[]): TextChunk[] {
  const chunks: TextChunk[] = [];

  for (const page of pages) {
    if (!page.text) continue;
    const words = page.text.split(/\s+/).filter(Boolean);

    for (let i = 0; i < words.length; i += TARGET_WORDS_PER_CHUNK) {
      const slice = words.slice(i, i + TARGET_WORDS_PER_CHUNK);
      chunks.push({
        pageNumber: page.pageNumber,
        content: slice.join(" "),
        tokenCount: estimateTokenCount(slice),
      });
    }
  }

  return chunks;
}
