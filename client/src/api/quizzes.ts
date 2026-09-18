import { api } from "./client";
import type { Quiz, QuizQuestion, QuizAttempt, MasteryUpdate } from "./types";

export const quizzesApi = {
  create: (projectId: string) => api.post<{ quiz: Quiz }>(`/projects/${projectId}/quizzes`),
  get: (id: string) => api.get<{ quiz: Quiz }>(`/quizzes/${id}`),
  nextQuestion: (quizId: string) =>
    api.post<{ question: QuizQuestion }>(`/quizzes/${quizId}/questions`),
  submitAttempt: (questionId: string, answer: string) =>
    api.post<{ attempt: QuizAttempt; correctAnswer: string }>(`/quiz-questions/${questionId}/attempts`, {
      answer,
    }),
  complete: (quizId: string) =>
    api.post<{ quiz: Quiz; masteryUpdates: MasteryUpdate[] }>(`/quizzes/${quizId}/complete`),
};
