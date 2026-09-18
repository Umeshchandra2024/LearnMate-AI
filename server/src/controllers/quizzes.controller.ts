import type { Request, Response } from "express";
import { z } from "zod";
import {
  prisma,
  Prisma,
  selectNextConcept,
  generateQuizQuestionContent,
  gradeOpenAnswer,
  computeUpdatedMasteryScore,
  enqueueMasteryUpdate,
} from "@asc/shared";
import { HttpError } from "../middleware/errorHandler";

async function assertOwnsProject(projectId: string, userId: string) {
  const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
  if (!project) throw new HttpError(404, "Project not found");
  return project;
}

async function assertOwnsQuiz(quizId: string, userId: string) {
  const quiz = await prisma.quiz.findFirst({ where: { id: quizId, userId } });
  if (!quiz) throw new HttpError(404, "Quiz not found");
  return quiz;
}

/** Strips correctAnswer before sending a question to the client, so it can't be inspected. */
function toPublicQuestion<T extends { correctAnswer: string }>(question: T) {
  const { correctAnswer, ...rest } = question;
  return rest;
}

export async function createQuiz(req: Request, res: Response) {
  const project = await assertOwnsProject(req.params.projectId, req.user!.id);
  const quiz = await prisma.quiz.create({
    data: { projectId: project.id, userId: req.user!.id },
  });
  res.status(201).json({ quiz });
}

export async function getQuiz(req: Request, res: Response) {
  const quiz = await prisma.quiz.findFirst({
    where: { id: req.params.id, userId: req.user!.id },
    include: {
      questions: {
        orderBy: { createdAt: "asc" },
        include: { concept: true, attempts: true },
      },
    },
  });
  if (!quiz) throw new HttpError(404, "Quiz not found");

  res.json({
    quiz: {
      ...quiz,
      questions: quiz.questions.map((q) =>
        q.attempts.length > 0 ? q : toPublicQuestion(q),
      ),
    },
  });
}

export async function generateNextQuestion(req: Request, res: Response) {
  const quiz = await assertOwnsQuiz(req.params.id, req.user!.id);
  if (quiz.completedAt) throw new HttpError(400, "This quiz is already completed");

  const { concept } = await selectNextConcept(req.user!.id, quiz.projectId);
  const generated = await generateQuizQuestionContent({
    userId: req.user!.id,
    projectId: quiz.projectId,
    concept,
  });

  const question = await prisma.quizQuestion.create({
    data: {
      quizId: quiz.id,
      conceptId: concept.id,
      type: generated.type,
      difficulty: generated.difficulty,
      prompt: generated.prompt,
      options: generated.options,
      correctAnswer: generated.correctAnswer,
    },
    include: { concept: true },
  });

  res.status(201).json({ question: toPublicQuestion(question) });
}

const submitAttemptSchema = z.object({
  answer: z.string().min(1).max(4000),
});

export async function submitAttempt(req: Request, res: Response) {
  const { answer } = submitAttemptSchema.parse(req.body);
  const userId = req.user!.id;

  const question = await prisma.quizQuestion.findFirst({
    where: { id: req.params.id, quiz: { userId } },
    include: { concept: true, quiz: true },
  });
  if (!question) throw new HttpError(404, "Question not found");

  let score: number;
  let feedback: Prisma.InputJsonValue;

  if (question.type === "MCQ") {
    const correct = answer.trim().toLowerCase() === question.correctAnswer.trim().toLowerCase();
    score = correct ? 100 : 0;
    feedback = {
      correct,
      correctAnswer: question.correctAnswer,
      feedbackText: correct
        ? "Correct."
        : `Not quite. The correct answer was: ${question.correctAnswer}`,
    };
  } else {
    const grading = await gradeOpenAnswer({
      userId,
      projectId: question.quiz.projectId,
      userAnswer: answer,
      concept: question.concept,
    });
    score = grading.score;
    feedback = grading;
  }

  const attempt = await prisma.quizAttempt.create({
    data: { quizQuestionId: question.id, userId, answer, score, feedback },
  });

  res.status(201).json({ attempt, correctAnswer: question.correctAnswer });
}

export async function completeQuiz(req: Request, res: Response) {
  const quiz = await assertOwnsQuiz(req.params.id, req.user!.id);
  if (quiz.completedAt) throw new HttpError(400, "This quiz is already completed");

  const questions = await prisma.quizQuestion.findMany({
    where: { quizId: quiz.id },
    include: { attempts: true },
  });

  const scoresByConceptId = new Map<string, number[]>();
  for (const question of questions) {
    for (const attempt of question.attempts) {
      if (attempt.score === null) continue;
      const scores = scoresByConceptId.get(question.conceptId) ?? [];
      scores.push(attempt.score);
      scoresByConceptId.set(question.conceptId, scores);
    }
  }

  const masteryUpdates: { conceptId: string; newScore: number; evidenceCount: number }[] = [];

  for (const [conceptId, newScores] of scoresByConceptId) {
    const previous = await prisma.mastery.findFirst({
      where: { userId: req.user!.id, projectId: quiz.projectId, conceptId },
      orderBy: { createdAt: "desc" },
    });

    const newScore = computeUpdatedMasteryScore(previous?.score ?? null, newScores);
    const evidenceCount = (previous?.evidenceCount ?? 0) + newScores.length;

    await prisma.mastery.create({
      data: { userId: req.user!.id, projectId: quiz.projectId, conceptId, score: newScore, evidenceCount },
    });
    masteryUpdates.push({ conceptId, newScore, evidenceCount });
  }

  await prisma.quiz.update({ where: { id: quiz.id }, data: { completedAt: new Date() } });

  await prisma.activityEvent.create({
    data: {
      userId: req.user!.id,
      projectId: quiz.projectId,
      type: "quiz_completed",
      payload: { quizId: quiz.id, questionCount: questions.length, masteryUpdates },
    },
  });

  // Enqueue a mastery-update job per concept touched: each checks that concept's own recent
  // attempt history for a repeated-mistake pattern and, if found, triggers a recommendation.
  await Promise.all(
    masteryUpdates.map((m) =>
      enqueueMasteryUpdate({ userId: req.user!.id, projectId: quiz.projectId, conceptId: m.conceptId }),
    ),
  );

  res.json({ quiz: { ...quiz, completedAt: new Date() }, masteryUpdates });
}
