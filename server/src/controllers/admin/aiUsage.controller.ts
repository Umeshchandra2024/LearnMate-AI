import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "@asc/shared";

const LOOKBACK_DAYS_DEFAULT = 30;
const FAILURES_LIMIT = 50;

const summaryQuerySchema = z.object({
  lookbackDays: z.coerce.number().int().min(1).max(365).default(LOOKBACK_DAYS_DEFAULT),
});

/**
 * Per-feature AI usage breakdown across the whole platform, admin-only. Grouped by
 * (feature, status) so e.g. "recommendation-generation" latency is its own visible row —
 * never folded into one undifferentiated total — and success/failure rate is directly
 * computable per feature from the two rows it produces (SUCCESS count vs FAILURE count).
 */
export async function getAiUsageSummary(req: Request, res: Response) {
  const { lookbackDays } = summaryQuerySchema.parse(req.query);
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  const rows = await prisma.aIUsageLog.groupBy({
    by: ["feature", "status"],
    where: { createdAt: { gte: since } },
    _count: { _all: true },
    _avg: { latencyMs: true },
    _sum: { inputTokens: true, outputTokens: true, estimatedCost: true },
  });

  // Reshape into one row per feature with SUCCESS/FAILURE counts side by side, so the
  // dashboard can show a success rate without the client having to do the join itself.
  const byFeature = new Map<
    string,
    { feature: string; successCount: number; failureCount: number; avgLatencyMs: number | null; totalInputTokens: number; totalOutputTokens: number; estimatedCost: number }
  >();

  for (const row of rows) {
    const existing = byFeature.get(row.feature) ?? {
      feature: row.feature,
      successCount: 0,
      failureCount: 0,
      avgLatencyMs: null,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      estimatedCost: 0,
    };
    if (row.status === "SUCCESS") existing.successCount = row._count._all;
    else existing.failureCount = row._count._all;
    // Latency/tokens/cost are only meaningful from successful calls in practice (failures
    // often have null token counts), but sum/avg across whichever rows have them.
    if (row._avg.latencyMs != null) {
      existing.avgLatencyMs = Math.round(row._avg.latencyMs);
    }
    existing.totalInputTokens += row._sum.inputTokens ?? 0;
    existing.totalOutputTokens += row._sum.outputTokens ?? 0;
    existing.estimatedCost += row._sum.estimatedCost ?? 0;
    byFeature.set(row.feature, existing);
  }

  const features = [...byFeature.values()]
    .map((f) => ({
      ...f,
      totalCalls: f.successCount + f.failureCount,
      successRate: f.successCount + f.failureCount > 0 ? f.successCount / (f.successCount + f.failureCount) : null,
    }))
    .sort((a, b) => b.totalCalls - a.totalCalls);

  res.json({ lookbackDays, features });
}

export async function listAiUsageFailures(req: Request, res: Response) {
  const failures = await prisma.aIUsageLog.findMany({
    where: { status: "FAILURE" },
    orderBy: { createdAt: "desc" },
    take: FAILURES_LIMIT,
    include: {
      user: { select: { id: true, email: true } },
      project: { select: { id: true, name: true } },
    },
  });
  res.json({ failures });
}
