import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "@asc/shared";
import { HttpError } from "../middleware/errorHandler";

const createSpaceSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
});

const updateSpaceSchema = createSpaceSchema.partial();

export async function listSpaces(req: Request, res: Response) {
  const spaces = await prisma.space.findMany({
    where: { userId: req.user!.id },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { projects: true } } },
  });
  res.json({ spaces });
}

export async function createSpace(req: Request, res: Response) {
  const data = createSpaceSchema.parse(req.body);
  const space = await prisma.space.create({
    data: { ...data, userId: req.user!.id },
  });
  res.status(201).json({ space });
}

export async function getSpace(req: Request, res: Response) {
  const space = await prisma.space.findFirst({
    where: { id: req.params.id, userId: req.user!.id },
    include: { projects: { orderBy: { updatedAt: "desc" } } },
  });
  // 404, not 403: never confirm that a space belonging to another user exists.
  if (!space) throw new HttpError(404, "Space not found");
  res.json({ space });
}

export async function updateSpace(req: Request, res: Response) {
  const data = updateSpaceSchema.parse(req.body);
  const existing = await prisma.space.findFirst({
    where: { id: req.params.id, userId: req.user!.id },
  });
  if (!existing) throw new HttpError(404, "Space not found");

  const space = await prisma.space.update({ where: { id: existing.id }, data });
  res.json({ space });
}

export async function deleteSpace(req: Request, res: Response) {
  const existing = await prisma.space.findFirst({
    where: { id: req.params.id, userId: req.user!.id },
  });
  if (!existing) throw new HttpError(404, "Space not found");

  await prisma.space.delete({ where: { id: existing.id } });
  res.status(204).send();
}
