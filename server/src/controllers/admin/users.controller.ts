import type { Request, Response } from "express";
import { z } from "zod";
import { prisma, getMasteryOverview } from "@asc/shared";
import { HttpError } from "../../middleware/errorHandler";

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAX = 100;

const listQuerySchema = z.object({
  take: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE_DEFAULT),
  skip: z.coerce.number().int().min(0).default(0),
  search: z.string().optional(),
});

/**
 * Admin-only: lists every user on the platform. Unlike every other list endpoint in this
 * app, this one deliberately has NO userId filter — that's the entire point of an admin
 * view. Access control is `requireAdmin` on the route, not query scoping.
 */
export async function listUsers(req: Request, res: Response) {
  const { take, skip, search } = listQuerySchema.parse(req.query);

  const where = search
    ? { OR: [{ email: { contains: search, mode: "insensitive" as const } }, { name: { contains: search, mode: "insensitive" as const } }] }
    : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      skip,
      select: {
        id: true,
        email: true,
        name: true,
        isAdmin: true,
        createdAt: true,
        _count: { select: { spaces: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  res.json({ users, total, take, skip });
}

const RECENT_LIMIT = 20;

/**
 * Admin-only user detail: everything a support/ops admin would need to look into one
 * user's account — their Spaces/Projects, recent activity, recent quiz attempts, mastery
 * per project, and AI usage. Reuses the same shape/queries as the user-facing endpoints
 * (getMasteryOverview, etc.), just without a `userId: req.user.id` filter substituted for
 * the target user's id instead — the ownership check is `requireAdmin`, not query scoping.
 */
export async function getUserDetail(req: Request, res: Response) {
  const targetUserId = req.params.id;

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, email: true, name: true, isAdmin: true, createdAt: true },
  });
  if (!user) throw new HttpError(404, "User not found");

  const spaces = await prisma.space.findMany({
    where: { userId: targetUserId },
    orderBy: { updatedAt: "desc" },
    include: {
      projects: {
        orderBy: { updatedAt: "desc" },
        include: { _count: { select: { materials: true, concepts: true } } },
      },
    },
  });

  const [recentActivity, recentQuizAttempts, aiUsageByFeature] = await Promise.all([
    prisma.activityEvent.findMany({
      where: { userId: targetUserId },
      orderBy: { createdAt: "desc" },
      take: RECENT_LIMIT,
    }),
    prisma.quizAttempt.findMany({
      where: { userId: targetUserId },
      orderBy: { createdAt: "desc" },
      take: RECENT_LIMIT,
      include: { quizQuestion: { include: { concept: true } } },
    }),
    prisma.aIUsageLog.groupBy({
      by: ["feature"],
      where: { userId: targetUserId },
      _count: { _all: true },
      _avg: { latencyMs: true },
      _sum: { estimatedCost: true },
    }),
  ]);

  const masteryByProject = await Promise.all(
    spaces.flatMap((space) =>
      space.projects.map(async (project) => ({
        projectId: project.id,
        projectName: project.name,
        mastery: await getMasteryOverview(targetUserId, project.id),
      })),
    ),
  );

  res.json({
    user,
    spaces,
    recentActivity,
    recentQuizAttempts,
    masteryByProject,
    aiUsageByFeature: aiUsageByFeature.map((row) => ({
      feature: row.feature,
      count: row._count._all,
      avgLatencyMs: row._avg.latencyMs ? Math.round(row._avg.latencyMs) : null,
      estimatedCost: row._sum.estimatedCost ?? 0,
    })),
  });
}
