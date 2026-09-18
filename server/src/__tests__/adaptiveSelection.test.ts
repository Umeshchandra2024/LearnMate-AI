import { prisma, scoreConcept, selectNextConcept } from "@asc/shared";

/**
 * Verifies the adaptive selection scoring function (scoreConcept/selectNextConcept) against
 * real seeded Mastery/QuizAttempt history — the same real-DB, no-mocks pattern as every
 * other test in this suite. Covers the exact three signals the brief calls out: an
 * unassessed concept should outrank a strong one, a weak concept with recent mistakes
 * should outrank a strong one, and selection should genuinely favor weak/unassessed
 * concepts over a strong one across repeated picks (allowing for the deliberate ~1-in-5
 * strong-concept review branch).
 */
describe("adaptive concept selection", () => {
  const suffix = Date.now();
  let userId: string;
  let projectId: string;
  let neverTouchedId: string; // Concept A: no history at all
  let strongRecentId: string; // Concept B: high mastery, practiced very recently
  let weakWithMistakesId: string; // Concept C: low mastery, recent mistakes

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email: `selection-test-${suffix}@example.com`, name: "Selection Test", passwordHash: "x" },
    });
    userId = user.id;
    const space = await prisma.space.create({ data: { userId, name: "Selection Test Space" } });
    const project = await prisma.project.create({
      data: { spaceId: space.id, userId, name: "Selection Test Project" },
    });
    projectId = project.id;

    const [neverTouched, strongRecent, weakWithMistakes] = await Promise.all([
      prisma.concept.create({ data: { projectId, name: "Never Touched Concept" } }),
      prisma.concept.create({ data: { projectId, name: "Strong Recent Concept" } }),
      prisma.concept.create({ data: { projectId, name: "Weak Mistake-Prone Concept" } }),
    ]);
    neverTouchedId = neverTouched.id;
    strongRecentId = strongRecent.id;
    weakWithMistakesId = weakWithMistakes.id;

    // Strong concept: a recent Mastery row at 90, and a recent correct QuizAttempt.
    await prisma.mastery.create({ data: { userId, projectId, conceptId: strongRecentId, score: 90, evidenceCount: 3 } });
    const strongQuiz = await prisma.quiz.create({ data: { projectId, userId } });
    const strongQuestion = await prisma.quizQuestion.create({
      data: { quizId: strongQuiz.id, conceptId: strongRecentId, type: "MCQ", difficulty: 1, prompt: "x", correctAnswer: "x" },
    });
    await prisma.quizAttempt.create({ data: { quizQuestionId: strongQuestion.id, userId, answer: "x", score: 100 } });

    // Weak concept: a low Mastery row, plus 2 recent low-scoring attempts (a real mistake pattern).
    await prisma.mastery.create({ data: { userId, projectId, conceptId: weakWithMistakesId, score: 20, evidenceCount: 2 } });
    const weakQuiz = await prisma.quiz.create({ data: { projectId, userId } });
    for (let i = 0; i < 2; i++) {
      const q = await prisma.quizQuestion.create({
        data: { quizId: weakQuiz.id, conceptId: weakWithMistakesId, type: "MCQ", difficulty: 1, prompt: "x", correctAnswer: "x" },
      });
      await prisma.quizAttempt.create({ data: { quizQuestionId: q.id, userId, answer: "wrong", score: 0 } });
    }
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } }); // cascades
    await prisma.$disconnect();
  });

  it("scores an unassessed concept higher than a strong, recently-practiced one", async () => {
    const neverTouched = await prisma.concept.findUniqueOrThrow({ where: { id: neverTouchedId } });
    const strongRecent = await prisma.concept.findUniqueOrThrow({ where: { id: strongRecentId } });

    const [neverTouchedScore, strongRecentScore] = await Promise.all([
      scoreConcept(userId, projectId, neverTouched),
      scoreConcept(userId, projectId, strongRecent),
    ]);

    expect(neverTouchedScore.score).toBeGreaterThan(strongRecentScore.score);
    expect(neverTouchedScore.latestMasteryScore).toBeNull();
    expect(strongRecentScore.latestMasteryScore).toBe(90);
  });

  it("scores a weak concept with recent mistakes higher than a strong one", async () => {
    const strongRecent = await prisma.concept.findUniqueOrThrow({ where: { id: strongRecentId } });
    const weakWithMistakes = await prisma.concept.findUniqueOrThrow({ where: { id: weakWithMistakesId } });

    const [strongRecentScore, weakScore] = await Promise.all([
      scoreConcept(userId, projectId, strongRecent),
      scoreConcept(userId, projectId, weakWithMistakes),
    ]);

    expect(weakScore.score).toBeGreaterThan(strongRecentScore.score);
    expect(weakScore.recentMistakeCount).toBe(2);
  });

  it("selectNextConcept genuinely favors weak/unassessed concepts over a strong one across repeated picks", async () => {
    const picks: string[] = [];
    for (let i = 0; i < 20; i++) {
      const { concept } = await selectNextConcept(userId, projectId);
      picks.push(concept.id);
    }

    const strongPickCount = picks.filter((id) => id === strongRecentId).length;
    // The 1-in-5 strong-concept-review branch means the strong concept CAN be picked
    // occasionally (~20% expected) — but it must never dominate the way it would if the
    // scoring itself were broken (e.g. always picking the highest-score concept ignoring
    // the review branch, or the review branch firing far more than its own probability).
    expect(strongPickCount).toBeLessThan(12); // well above the ~4/20 expected, generous margin
    expect(picks.some((id) => id === neverTouchedId || id === weakWithMistakesId)).toBe(true);
  });
});
