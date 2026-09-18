import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { quizzesApi } from "@/api/quizzes";
import { projectsApi } from "@/api/projects";
import type { MasteryUpdate, Project, QuizAttempt, QuizQuestion } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ApiError } from "@/api/client";

interface AnsweredQuestion {
  question: QuizQuestion;
  userAnswer: string;
  attempt: QuizAttempt;
  correctAnswer: string;
}

export function QuizPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = React.useState<Project | null>(null);
  const [quizId, setQuizId] = React.useState<string | null>(null);
  const [question, setQuestion] = React.useState<QuizQuestion | null>(null);
  const [answer, setAnswer] = React.useState("");
  const [lastAttempt, setLastAttempt] = React.useState<{
    attempt: QuizAttempt;
    correctAnswer: string;
  } | null>(null);
  const [history, setHistory] = React.useState<AnsweredQuestion[]>([]);
  const [masterySummary, setMasterySummary] = React.useState<MasteryUpdate[] | null>(null);
  const [loadingNext, setLoadingNext] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [finishing, setFinishing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!projectId) return;
    projectsApi.get(projectId).then((res) => setProject(res.project));
    startQuiz();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function startQuiz() {
    if (!projectId) return;
    setError(null);
    setMasterySummary(null);
    setHistory([]);
    const quiz = (await quizzesApi.create(projectId)).quiz;
    setQuizId(quiz.id);
    await loadNextQuestion(quiz.id);
  }

  async function loadNextQuestion(id: string) {
    setLoadingNext(true);
    setError(null);
    setLastAttempt(null);
    setAnswer("");
    try {
      const res = await quizzesApi.nextQuestion(id);
      setQuestion(res.question);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to generate a question");
    } finally {
      setLoadingNext(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!question || !answer.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await quizzesApi.submitAttempt(question.id, answer);
      setLastAttempt(res);
      setHistory((prev) => [
        ...prev,
        { question, userAnswer: answer, attempt: res.attempt, correctAnswer: res.correctAnswer },
      ]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to submit answer");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFinish() {
    if (!quizId) return;
    setFinishing(true);
    try {
      const res = await quizzesApi.complete(quizId);
      setMasterySummary(res.masteryUpdates);
      setQuestion(null);
    } finally {
      setFinishing(false);
    }
  }

  if (!project) return <p className="text-sm text-muted-foreground">Loading...</p>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link to={`/projects/${project.id}`} className="text-sm text-muted-foreground hover:underline">
          &larr; {project.name}
        </Link>
        <h1 className="text-2xl font-semibold">Quiz</h1>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {masterySummary ? (
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Quiz complete</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Answered {history.length} question{history.length === 1 ? "" : "s"}. Mastery updated for{" "}
                {masterySummary.length} concept{masterySummary.length === 1 ? "" : "s"}.
              </p>
              <Button onClick={startQuiz}>Start another quiz</Button>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-4">
            {history.map((item, index) => (
              <Card key={item.attempt.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Question {index + 1}</CardTitle>
                    <Badge variant="muted">{item.question.concept?.name ?? "Concept"}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <p className="text-sm">{item.question.prompt}</p>
                  <p className="text-sm text-muted-foreground">
                    <strong>Your answer:</strong> {item.userAnswer}
                  </p>
                  <FeedbackPanel attempt={item.attempt} correctAnswer={item.correctAnswer} />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : (
        <>
          {question && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Question {history.length + 1}</CardTitle>
                  <Badge variant="muted">Difficulty {question.difficulty}/5</Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <p className="text-sm">{question.prompt}</p>

                {!lastAttempt && (
                  <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                    {question.type === "MCQ" ? (
                      <div className="flex flex-col gap-2">
                        {question.options?.map((opt) => (
                          <label key={opt} className="flex items-center gap-2 text-sm">
                            <input
                              type="radio"
                              name="mcq-answer"
                              value={opt}
                              checked={answer === opt}
                              onChange={() => setAnswer(opt)}
                              disabled={submitting}
                            />
                            {opt}
                          </label>
                        ))}
                      </div>
                    ) : (
                      <textarea
                        className="min-h-[100px] w-full rounded-md border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary"
                        placeholder="Type your answer..."
                        value={answer}
                        onChange={(e) => setAnswer(e.target.value)}
                        disabled={submitting}
                      />
                    )}
                    <Button type="submit" disabled={submitting || !answer.trim()}>
                      {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {submitting ? "Grading..." : "Submit answer"}
                    </Button>
                  </form>
                )}

                {lastAttempt && (
                  <div className="flex flex-col gap-3">
                    <FeedbackPanel attempt={lastAttempt.attempt} correctAnswer={lastAttempt.correctAnswer} />
                    <div className="flex gap-2">
                      <Button
                        onClick={() => quizId && loadNextQuestion(quizId)}
                        disabled={loadingNext || finishing}
                      >
                        {loadingNext && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {loadingNext ? "Loading..." : "Next question"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleFinish}
                        disabled={loadingNext || finishing}
                      >
                        {finishing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {finishing ? "Finishing..." : "Finish quiz"}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {loadingNext && !question && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Generating your next question...
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FeedbackPanel({ attempt, correctAnswer }: { attempt: QuizAttempt; correctAnswer: string }) {
  const feedback = attempt.feedback;
  const isCorrectBoolean = typeof feedback?.correct === "boolean";

  return (
    <div className="rounded-md border border-border bg-muted/50 p-3 text-sm">
      <div className="mb-2 flex items-center gap-2">
        <Badge variant={(attempt.score ?? 0) >= 70 ? "success" : "warning"}>
          Score: {attempt.score ?? "N/A"}
        </Badge>
        {isCorrectBoolean && (
          <Badge variant={feedback?.correct ? "success" : "destructive"}>
            {feedback?.correct ? "Correct" : "Incorrect"}
          </Badge>
        )}
      </div>
      <p>{feedback?.feedbackText}</p>
      {feedback?.understood && feedback.understood.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          <strong>Understood:</strong> {feedback.understood.join(", ")}
        </p>
      )}
      {feedback?.missing && feedback.missing.length > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          <strong>Missing:</strong> {feedback.missing.join(", ")}
        </p>
      )}
      {!isCorrectBoolean && (
        <p className="mt-2 text-xs text-muted-foreground">
          <strong>Reference answer:</strong> {correctAnswer}
        </p>
      )}
    </div>
  );
}
