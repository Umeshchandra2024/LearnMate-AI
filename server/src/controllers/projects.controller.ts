import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "@asc/shared";
import { HttpError } from "../middleware/errorHandler";

const createProjectSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  goal: z.string().max(2000).optional(),
});

const updateProjectSchema = createProjectSchema.partial();

/** Confirms the space belongs to the requesting user; throws 404 (not 403) otherwise. */
async function assertOwnsSpace(spaceId: string, userId: string) {
  const space = await prisma.space.findFirst({ where: { id: spaceId, userId } });
  if (!space) throw new HttpError(404, "Space not found");
  return space;
}

export async function listProjectsForSpace(req: Request, res: Response) {
  await assertOwnsSpace(req.params.spaceId, req.user!.id);
  const projects = await prisma.project.findMany({
    where: { spaceId: req.params.spaceId, userId: req.user!.id },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { materials: true } } },
  });
  res.json({ projects });
}

export async function createProject(req: Request, res: Response) {
  await assertOwnsSpace(req.params.spaceId, req.user!.id);
  const data = createProjectSchema.parse(req.body);
  const project = await prisma.project.create({
    data: { ...data, spaceId: req.params.spaceId, userId: req.user!.id },
  });
  res.status(201).json({ project });
}

export async function getProject(req: Request, res: Response) {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, userId: req.user!.id },
    include: {
      materials: { orderBy: { createdAt: "desc" } },
      space: { select: { id: true, name: true } },
    },
  });
  if (!project) throw new HttpError(404, "Project not found");
  res.json({ project });
}

export async function updateProject(req: Request, res: Response) {
  const data = updateProjectSchema.parse(req.body);
  const existing = await prisma.project.findFirst({
    where: { id: req.params.id, userId: req.user!.id },
  });
  if (!existing) throw new HttpError(404, "Project not found");

  const project = await prisma.project.update({ where: { id: existing.id }, data });
  res.json({ project });
}

export async function deleteProject(req: Request, res: Response) {
  const existing = await prisma.project.findFirst({
    where: { id: req.params.id, userId: req.user!.id },
  });
  if (!existing) throw new HttpError(404, "Project not found");

  await prisma.project.delete({ where: { id: existing.id } });
  res.status(204).send();
}
