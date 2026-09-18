import type { Request, Response } from "express";
import { prisma, getMasteryOverview } from "@asc/shared";
import { HttpError } from "../middleware/errorHandler";

async function assertOwnsProject(projectId: string, userId: string) {
  const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
  if (!project) throw new HttpError(404, "Project not found");
  return project;
}

// Bounds on every query below — this endpoint must never load unbounded history into memory.
const LOOKBACK_DAYS = 30;
const ACTIVITY_MAX_ROWS = 500;
const QUIZ_ATTEMPT_MAX_ROWS = 200;

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function bucketByDay<T>(rows: T[], getDate: (row: T) => Date): { date: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = dayKey(getDate(row));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function getProjectAnalytics(req: Request, res: Response) {
  const project = await assertOwnsProject(req.params.projectId, req.user!.id);
  const userId = req.user!.id;
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const [activityEvents, quizAttempts, masteryOverview, aiUsageByFeature] = await Promise.all([
    prisma.activityEvent.findMany({
      where: { projectId: project.id, userId, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: ACTIVITY_MAX_ROWS,
      select: { type: true, createdAt: true },
    }),
    prisma.quizAttempt.findMany({
      where: { userId, quizQuestion: { quiz: { projectId: project.id } }, createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
      take: QUIZ_ATTEMPT_MAX_ROWS,
      select: { score: true, createdAt: true },
    }),
    getMasteryOverview(userId, project.id),
    prisma.aIUsageLog.groupBy({
      by: ["feature", "status"],
      where: { projectId: project.id, createdAt: { gte: since } },
      _count: { _all: true },
      _avg: { latencyMs: true },
      _sum: { inputTokens: true, outputTokens: true, estimatedCost: true },
    }),
  ]);

  res.json({
    lookbackDays: LOOKBACK_DAYS,
    activityOverTime: bucketByDay(activityEvents, (e) => e.createdAt),
    quizPerformance: quizAttempts
      .filter((a) => a.score !== null)
      .map((a) => ({ date: a.createdAt.toISOString(), score: a.score })),
    masteryDistribution: masteryOverview,
    aiUsage: aiUsageByFeature.map((row) => ({
      feature: row.feature,
      status: row.status,
      count: row._count._all,
      avgLatencyMs: row._avg.latencyMs ? Math.round(row._avg.latencyMs) : null,
      totalInputTokens: row._sum.inputTokens ?? 0,
      totalOutputTokens: row._sum.outputTokens ?? 0,
      estimatedCost: row._sum.estimatedCost ?? 0,
    })),
  });
}
