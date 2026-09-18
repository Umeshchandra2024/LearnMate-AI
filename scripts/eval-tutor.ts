import "dotenv/config";
import fs from "fs";
import path from "path";
import { prisma, answerTutorQuestion } from "@asc/shared";

/**
 * Eval harness for the Tutor's grounding behavior. Calls `answerTutorQuestion` directly
 * (the same function the real /api/conversations/:id/messages route calls) against the
 * "Biology 101" test project seeded during the Phase 1 smoke test — real retrieval, real
 * Groq call, real database. It intentionally skips HTTP and Conversation/Message rows,
 * since this is testing grounding behavior per question, not the conversation-history path.
 *
 * Half the questions are answerable from that project's material (a short passage on
 * photosynthesis and cellular respiration); half are not, including one that's plausible
 * biology but outside the material's actual scope, to test that the tutor is grounded in
 * what was retrieved rather than answering any biology question it can.
 */

const TEST_USER_EMAIL = "smoketest-1789727986@example.com";
const TEST_PROJECT_NAME = "Cell Biology Unit";

interface EvalCase {
  question: string;
  expectSufficientEvidence: boolean;
}

const CASES: EvalCase[] = [
  { question: "What is photosynthesis and where does it happen in the cell?", expectSufficientEvidence: true },
  { question: "What role does chlorophyll play in photosynthesis?", expectSufficientEvidence: true },
  { question: "What is ATP and which organelle produces it?", expectSufficientEvidence: true },
  { question: "How are photosynthesis and cellular respiration related to each other?", expectSufficientEvidence: true },
  { question: "What is the capital of France?", expectSufficientEvidence: false },
  { question: "Explain how a car engine's four-stroke combustion cycle works.", expectSufficientEvidence: false },
  { question: "What year did World War II end?", expectSufficientEvidence: false },
  { question: "Describe the stages of meiosis in human reproduction.", expectSufficientEvidence: false },
];

interface EvalResult extends EvalCase {
  actualSufficientEvidence: boolean;
  citationCount: number;
  answerPreview: string;
  pass: boolean;
  error?: string;
}

async function main() {
  const user = await prisma.user.findUnique({ where: { email: TEST_USER_EMAIL } });
  if (!user) {
    throw new Error(
      `Test user "${TEST_USER_EMAIL}" not found. Run the Phase 1 upload smoke test first ` +
        `(sign up this user, create a "${TEST_PROJECT_NAME}" project, and upload a material) ` +
        "before running this eval.",
    );
  }

  const project = await prisma.project.findFirst({
    where: { userId: user.id, name: TEST_PROJECT_NAME },
  });
  if (!project) {
    throw new Error(`Project "${TEST_PROJECT_NAME}" not found for test user ${TEST_USER_EMAIL}.`);
  }

  const chunkCount = await prisma.chunk.count({ where: { projectId: project.id } });
  if (chunkCount === 0) {
    throw new Error(`Project "${TEST_PROJECT_NAME}" has no processed Chunks to retrieve from.`);
  }

  const results: EvalResult[] = [];

  for (const testCase of CASES) {
    try {
      const answer = await answerTutorQuestion({
        userId: user.id,
        projectId: project.id,
        question: testCase.question,
      });

      const pass =
        answer.sufficientEvidence === testCase.expectSufficientEvidence &&
        (!testCase.expectSufficientEvidence || answer.citations.length > 0);

      results.push({
        ...testCase,
        actualSufficientEvidence: answer.sufficientEvidence,
        citationCount: answer.citations.length,
        answerPreview: answer.answer.slice(0, 100),
        pass,
      });
    } catch (error) {
      results.push({
        ...testCase,
        actualSufficientEvidence: false,
        citationCount: 0,
        answerPreview: "",
        pass: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  for (const r of results) {
    const status = r.pass ? "PASS" : "FAIL";
    console.log(`[${status}] "${r.question}"`);
    console.log(
      `       expected sufficientEvidence=${r.expectSufficientEvidence}, got=${r.actualSufficientEvidence}, citations=${r.citationCount}`,
    );
    if (r.error) console.log(`       error: ${r.error}`);
    else console.log(`       answer: ${r.answerPreview}...`);
  }

  const passCount = results.filter((r) => r.pass).length;
  console.log(`\n${passCount}/${results.length} cases passed`);

  const outDir = path.resolve(__dirname, "eval-results");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "tutor-eval.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify({ ranAt: new Date().toISOString(), passCount, total: results.length, results }, null, 2),
  );
  console.log(`Results written to ${outPath}`);

  await prisma.$disconnect();
  if (passCount !== results.length) process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
