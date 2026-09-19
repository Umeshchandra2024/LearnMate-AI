import { prisma, answerTutorQuestion } from "@asc/shared";

/**
 * Promotes scripts/eval-tutor.ts's hand-written Q/A set to a real automated test, per the
 * brief ("your Phase 2 eval set as real tests"). Same real infra as the eval script: real
 * retrieval, real Groq calls, no mocks, against the seeded Biology 101 test project. Half
 * the questions are answerable from that project's material; half are not, including one
 * deliberately biology-adjacent-but-out-of-scope question to check the Tutor is grounded in
 * what was actually retrieved, not just answering anything in the same general subject.
 */
const TEST_USER_EMAIL = "smoketest-1789727986@example.com";
const TEST_PROJECT_NAME = "Cell Biology Unit";

interface Case {
  question: string;
  expectSufficientEvidence: boolean;
}

// The seeded "Cell Biology Unit" material is a single short chunk. It states what
// photosynthesis is and who does it, the overall reaction, that mitochondria break down
// glucose in respiration, and how the two processes form a cycle — but it only *lists*
// chloroplast/chlorophyll/ATP as vocabulary and never says where photosynthesis happens or
// what ATP is. Answerable cases must stay within what it actually states: earlier versions
// asked about those unstated facts and failed consistently because the Tutor correctly
// declined (sufficientEvidence: false), i.e. the expectation was wrong, not the Tutor.
const ANSWERABLE_CASES: Case[] = [
  { question: "What is photosynthesis and which organisms perform it?", expectSufficientEvidence: true },
  { question: "What are the inputs and outputs of the overall photosynthesis reaction?", expectSufficientEvidence: true },
  { question: "Which organelle breaks down glucose using oxygen during cellular respiration?", expectSufficientEvidence: true },
  { question: "How are photosynthesis and cellular respiration related to each other?", expectSufficientEvidence: true },
];

const UNANSWERABLE_CASES: Case[] = [
  { question: "What is the capital of France?", expectSufficientEvidence: false },
  { question: "Explain how a car engine's four-stroke combustion cycle works.", expectSufficientEvidence: false },
  { question: "What year did World War II end?", expectSufficientEvidence: false },
  { question: "Describe the stages of meiosis in human reproduction.", expectSufficientEvidence: false },
];

describe("Tutor groundedness", () => {
  let userId: string;
  let projectId: string;

  beforeAll(async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    const project = await prisma.project.findFirstOrThrow({ where: { userId: user.id, name: TEST_PROJECT_NAME } });
    userId = user.id;
    projectId = project.id;

    const chunkCount = await prisma.chunk.count({ where: { projectId } });
    if (chunkCount === 0) {
      throw new Error(`Seeded project "${TEST_PROJECT_NAME}" has no processed Chunks — run the Phase 1 smoke test first.`);
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it.each(ANSWERABLE_CASES)(
    "answers with sufficientEvidence and a citation: $question",
    async ({ question, expectSufficientEvidence }) => {
      const answer = await answerTutorQuestion({ userId, projectId, question });
      expect(answer.sufficientEvidence).toBe(expectSufficientEvidence);
      expect(answer.citations.length).toBeGreaterThan(0);
    },
  );

  it.each(UNANSWERABLE_CASES)(
    "declines with insufficientEvidence and no citations: $question",
    async ({ question, expectSufficientEvidence }) => {
      const answer = await answerTutorQuestion({ userId, projectId, question });
      expect(answer.sufficientEvidence).toBe(expectSufficientEvidence);
      expect(answer.citations.length).toBe(0);
    },
  );
});
