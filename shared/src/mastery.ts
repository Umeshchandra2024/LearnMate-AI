import { prisma } from "./prisma";

export const WEAK_MASTERY_THRESHOLD = 60;
export const MISTAKE_SCORE_THRESHOLD = 70;

/** Latest Mastery score per concept, filtered to weak ones, weakest first. Used by the Tutor's
 * learning-context block and by recommendation generation. */
export function getWeakConcepts(userId: string, projectId: string) {
  return prisma.mastery
    .findMany({
      where: { userId, projectId },
      orderBy: { createdAt: "desc" },
      distinct: ["conceptId"],
      include: { concept: true },
    })
    .then((rows) =>
      rows
        .filter((r) => r.score < WEAK_MASTERY_THRESHOLD)
        .sort((a, b) => a.score - b.score)
        .slice(0, 5),
    );
}

/** Recent low-scoring QuizAttempts for this project. Used by the Tutor and recommendations. */
export function getRecentMistakes(userId: string, projectId: string) {
  return prisma.quizAttempt.findMany({
    where: {
      userId,
      score: { lt: MISTAKE_SCORE_THRESHOLD },
      quizQuestion: { quiz: { projectId } },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { quizQuestion: { include: { concept: true } } },
  });
}

// ---------------------------------------------------------------------------
// Mastery overview + trend classification
// ---------------------------------------------------------------------------

export type MasteryTrend = "improving" | "stable" | "needs-attention" | "new" | "insufficient-data";

export interface ConceptMasteryOverview {
  conceptId: string;
  conceptName: string;
  latestScore: number;
  evidenceCount: number;
  trend: MasteryTrend;
}

// How many of the most-recent Mastery rows count as "recent" vs. "before that" when
// classifying a trend, at full strength. Lowered from 3 to 2 after real usage showed a
// 42-concept project realistically produces exactly 1 Mastery row per concept for most of a
// session — a fixed window of 3 (needing 4+ total rows before priorWindow is even
// non-empty) meant nearly every concept sat at "insufficient-data" forever in practice, even
// ones with real evidence. See classifyTrend's adaptive sizing below for the other half of
// this fix.
export const TREND_WINDOW_SIZE = 2;

// Minimum point difference between the recent-window average and the prior-window average
// to call it a real trend rather than noise. Mastery scores can swing several points between
// individual attempts even with no real change in understanding (see computeUpdatedMasteryScore's
// blending) — this threshold keeps small fluctuations classified as "stable".
export const TREND_SIGNIFICANCE_THRESHOLD = 5;

/**
 * Classifies a concept's trend from its Mastery scores (newest first). Exactly 0 rows is
 * "insufficient-data" (never assessed at all); exactly 1 row is "new" — a real, distinct
 * state from "no data", since there IS a score to show, just not yet a trend. From 2 rows
 * up, the window adapts: `halfSize = min(TREND_WINDOW_SIZE, floor(length/2))`, so 2 total
 * rows still yields a genuine (if noisy) 1-vs-1 comparison rather than refusing to
 * classify, scaling up to the full TREND_WINDOW_SIZE 2-vs-2 comparison once enough history
 * exists. A prototype can't assume deep per-concept history, especially across a large
 * concept pool — this keeps the classification honest at every data volume instead of
 * defaulting to "insufficient-data" until an unrealistic amount of history accumulates.
 */
export function classifyTrend(scoresNewestFirst: number[]): MasteryTrend {
  if (scoresNewestFirst.length === 0) return "insufficient-data";
  if (scoresNewestFirst.length === 1) return "new";

  const halfSize = Math.min(TREND_WINDOW_SIZE, Math.floor(scoresNewestFirst.length / 2));
  const recentWindow = scoresNewestFirst.slice(0, halfSize);
  const priorWindow = scoresNewestFirst.slice(halfSize, halfSize * 2);

  const avg = (nums: number[]) => nums.reduce((sum, n) => sum + n, 0) / nums.length;
  const diff = avg(recentWindow) - avg(priorWindow);

  if (diff >= TREND_SIGNIFICANCE_THRESHOLD) return "improving";
  if (diff <= -TREND_SIGNIFICANCE_THRESHOLD) return "needs-attention";
  return "stable";
}

/** Every concept in a project with its latest Mastery score and trend classification. */
export async function getMasteryOverview(
  userId: string,
  projectId: string,
): Promise<ConceptMasteryOverview[]> {
  const concepts = await prisma.concept.findMany({ where: { projectId } });

  return Promise.all(
    concepts.map(async (concept) => {
      const rows = await prisma.mastery.findMany({
        where: { userId, projectId, conceptId: concept.id },
        orderBy: { createdAt: "desc" },
        take: TREND_WINDOW_SIZE * 2,
      });

      return {
        conceptId: concept.id,
        conceptName: concept.name,
        latestScore: rows[0]?.score ?? 0,
        evidenceCount: rows[0]?.evidenceCount ?? 0,
        trend: classifyTrend(rows.map((r) => r.score)),
      };
    }),
  );
}
