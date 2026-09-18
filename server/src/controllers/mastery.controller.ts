import type { Request, Response } from "express";
import { prisma, getMasteryOverview } from "@asc/shared";
import { HttpError } from "../middleware/errorHandler";

async function assertOwnsProject(projectId: string, userId: string) {
  const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
  if (!project) throw new HttpError(404, "Project not found");
  return project;
}

export async function getProjectMastery(req: Request, res: Response) {
  await assertOwnsProject(req.params.projectId, req.user!.id);
  const overview = await getMasteryOverview(req.user!.id, req.params.projectId);
  res.json({ mastery: overview });
}

export async function listRecommendations(req: Request, res: Response) {
  await assertOwnsProject(req.params.projectId, req.user!.id);
  const recommendations = await prisma.recommendation.findMany({
    where: { projectId: req.params.projectId, userId: req.user!.id, dismissed: false },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  res.json({ recommendations });
}
