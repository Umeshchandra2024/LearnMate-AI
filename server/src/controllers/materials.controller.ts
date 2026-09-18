import type { Request, Response } from "express";
import multer from "multer";
import { prisma, enqueueMaterialProcessing } from "@asc/shared";
import { HttpError } from "../middleware/errorHandler";
import { uploadBuffer } from "../lib/cloudinary";

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      cb(new HttpError(400, "Only PDF files are supported"));
      return;
    }
    cb(null, true);
  },
});

async function assertOwnsProject(projectId: string, userId: string) {
  const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
  if (!project) throw new HttpError(404, "Project not found");
  return project;
}

export async function listMaterialsForProject(req: Request, res: Response) {
  await assertOwnsProject(req.params.projectId, req.user!.id);
  const materials = await prisma.material.findMany({
    where: { projectId: req.params.projectId, userId: req.user!.id },
    orderBy: { createdAt: "desc" },
  });
  res.json({ materials });
}

export async function uploadMaterial(req: Request, res: Response) {
  const project = await assertOwnsProject(req.params.projectId, req.user!.id);
  if (!req.file) throw new HttpError(400, "No file uploaded");

  const { url } = await uploadBuffer(req.file.buffer, {
    folder: `study-companion/${req.user!.id}/${project.id}`,
    filename: `${Date.now()}-${req.file.originalname.replace(/\.pdf$/i, "")}`,
  });

  const material = await prisma.material.create({
    data: {
      projectId: project.id,
      userId: req.user!.id,
      title: req.file.originalname,
      fileUrl: url,
      fileType: req.file.mimetype,
      status: "QUEUED",
    },
  });

  await enqueueMaterialProcessing({
    materialId: material.id,
    projectId: project.id,
    userId: req.user!.id,
  });

  res.status(201).json({ material });
}

export async function retryMaterial(req: Request, res: Response) {
  const material = await prisma.material.findFirst({
    where: { id: req.params.id, userId: req.user!.id },
  });
  if (!material) throw new HttpError(404, "Material not found");
  if (material.status !== "FAILED") {
    throw new HttpError(400, "Only failed materials can be retried");
  }

  await prisma.material.update({
    where: { id: material.id },
    data: { status: "QUEUED", errorMessage: null },
  });

  // Same jobKey (materialId-derived) as the original enqueue: if a stale job with that
  // id is still lingering as failed, BullMQ allows re-adding once it's no longer active.
  await enqueueMaterialProcessing({
    materialId: material.id,
    projectId: material.projectId,
    userId: material.userId,
  });

  res.json({ material });
}
