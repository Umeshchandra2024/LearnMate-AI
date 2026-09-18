import type { Request, Response } from "express";
import { prisma, getMasteryOverview } from "@asc/shared";

// Bounded: the dashboard aggregates over the user's N most recently active projects, never
// their entire history — "recent enough to matter" beats loading everything into memory.
const DASHBOARD_PROJECT_LIMIT = 5;
const AREAS_NEEDING_ATTENTION_LIMIT = 5;

export async function getDashboard(req: Request, res: Response) {
  const userId = req.user!.id;

  const recentProjects = await prisma.project.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: DASHBOARD_PROJECT_LIMIT,
    include: { space: { select: { id: true, name: true } }, _count: { select: { materials: true } } },
  });

  const continueLearning = recentProjects[0] ?? null;

  const masteryByProject = await Promise.all(
    recentProjects.map(async (project) => ({
      project,
      concepts: await getMasteryOverview(userId, project.id),
    })),
  );

  const allConceptOverviews = masteryByProject.flatMap(({ project, concepts }) =>
    concepts.map((c) => ({ ...c, projectId: project.id, projectName: project.name })),
  );

  const assessedConcepts = allConceptOverviews.filter((c) => c.trend !== "insufficient-data");
  const overallProgress = {
    conceptsTracked: allConceptOverviews.length,
    conceptsAssessed: assessedConcepts.length,
    averageScore:
      assessedConcepts.length > 0
        ? Math.round(assessedConcepts.reduce((sum, c) => sum + c.latestScore, 0) / assessedConcepts.length)
        : null,
    improving: assessedConcepts.filter((c) => c.trend === "improving").length,
    needsAttention: assessedConcepts.filter((c) => c.trend === "needs-attention").length,
  };

  const areasNeedingAttention = allConceptOverviews
    .filter((c) => c.trend === "needs-attention")
    .sort((a, b) => a.latestScore - b.latestScore)
    .slice(0, AREAS_NEEDING_ATTENTION_LIMIT);

  const recommendations = await Promise.all(
    recentProjects.map((project) =>
      prisma.recommendation.findFirst({
        where: { projectId: project.id, userId, dismissed: false },
        orderBy: { createdAt: "desc" },
      }),
    ),
  );
  const recentRecommendations = recentProjects
    .map((project, i) => ({ project: { id: project.id, name: project.name }, recommendation: recommendations[i] }))
    .filter((r) => r.recommendation !== null);

  res.json({
    continueLearning,
    recentProjects,
    overallProgress,
    areasNeedingAttention,
    recentRecommendations,
  });
}
