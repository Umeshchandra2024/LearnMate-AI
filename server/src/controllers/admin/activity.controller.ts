import type { Request, Response } from "express";
import { z } from "zod";
import { prisma, Prisma } from "@asc/shared";

const PAGE_SIZE_DEFAULT = 50;
const PAGE_SIZE_MAX = 200;

const queryFilterSchema = z.object({
  userId: z.string().optional(),
  projectId: z.string().optional(),
  type: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  take: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE_DEFAULT),
  skip: z.coerce.number().int().min(0).default(0),
});

/**
 * Platform-wide activity feed, admin-only. Filterable and paginated — this table grows
 * without bound as the platform is used, so an unfiltered, unpaginated query here would be
 * exactly the "load unbounded history into memory" mistake the brief warns against.
 */
export async function listActivity(req: Request, res: Response) {
  const filters = queryFilterSchema.parse(req.query);

  const where: Prisma.ActivityEventWhereInput = {
    ...(filters.userId ? { userId: filters.userId } : {}),
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.from || filters.to
      ? { createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
      : {}),
  };

  const [events, total] = await Promise.all([
    prisma.activityEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: filters.take,
      skip: filters.skip,
      include: {
        user: { select: { id: true, email: true, name: true } },
        project: { select: { id: true, name: true } },
      },
    }),
    prisma.activityEvent.count({ where }),
  ]);

  res.json({ events, total, take: filters.take, skip: filters.skip });
}
