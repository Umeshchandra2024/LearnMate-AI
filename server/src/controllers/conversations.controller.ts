import type { Request, Response } from "express";
import { z } from "zod";
import { prisma, answerTutorQuestion, maybeUpdateConversationSummary } from "@asc/shared";
import { HttpError } from "../middleware/errorHandler";

async function assertOwnsProject(projectId: string, userId: string) {
  const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
  if (!project) throw new HttpError(404, "Project not found");
  return project;
}

async function assertOwnsConversation(conversationId: string, userId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
  });
  if (!conversation) throw new HttpError(404, "Conversation not found");
  return conversation;
}

export async function listConversations(req: Request, res: Response) {
  await assertOwnsProject(req.params.projectId, req.user!.id);
  const conversations = await prisma.conversation.findMany({
    where: { projectId: req.params.projectId, userId: req.user!.id },
    orderBy: { updatedAt: "desc" },
  });
  res.json({ conversations });
}

export async function createConversation(req: Request, res: Response) {
  const project = await assertOwnsProject(req.params.projectId, req.user!.id);
  const conversation = await prisma.conversation.create({
    data: { projectId: project.id, userId: req.user!.id },
  });
  res.status(201).json({ conversation });
}

export async function getConversation(req: Request, res: Response) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: req.params.id, userId: req.user!.id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!conversation) throw new HttpError(404, "Conversation not found");
  res.json({ conversation });
}

const sendMessageSchema = z.object({
  content: z.string().min(1).max(4000),
});

export async function sendMessage(req: Request, res: Response) {
  const { content } = sendMessageSchema.parse(req.body);
  const conversation = await assertOwnsConversation(req.params.id, req.user!.id);
  const userId = req.user!.id;

  const userMessage = await prisma.message.create({
    data: { conversationId: conversation.id, role: "USER", content },
  });

  const tutorAnswer = await answerTutorQuestion({
    userId,
    projectId: conversation.projectId,
    conversationId: conversation.id,
    question: content,
  });

  const assistantMessage = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: "ASSISTANT",
      content: tutorAnswer.answer,
      citations: tutorAnswer.citations,
      sufficientEvidence: tutorAnswer.sufficientEvidence,
    },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { updatedAt: new Date() },
  });

  await prisma.activityEvent.create({
    data: {
      userId,
      projectId: conversation.projectId,
      type: "tutor_message",
      payload: {
        conversationId: conversation.id,
        sufficientEvidence: tutorAnswer.sufficientEvidence,
        citationCount: tutorAnswer.citations.length,
      },
    },
  });

  // Fire-and-forget: don't make the user wait on a summary regeneration that only runs
  // every SUMMARY_UPDATE_INTERVAL messages anyway. A failure here shouldn't fail the request.
  maybeUpdateConversationSummary({
    conversationId: conversation.id,
    userId,
    projectId: conversation.projectId,
  }).catch((err) => console.error("Failed to update conversation summary", err));

  res.status(201).json({ userMessage, assistantMessage });
}
