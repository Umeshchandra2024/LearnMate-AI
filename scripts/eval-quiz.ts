import "dotenv/config";
import fs from "fs";
import path from "path";
import { prisma, gradeOpenAnswer } from "@asc/shared";

/**
 * Eval harness for OPEN-answer grading. Calls `gradeOpenAnswer` directly (the same function
 * the real /api/quiz-questions/:id/attempts route calls for OPEN questions) against the
 * seeded "Biology 101" test project — real retrieval, real Groq call, no mocks.
 *
 * The point isn't just "does a wrong answer get a low score" (a keyword matcher could fake
 * that) — it's whether the grading feedback's `missing` field names the SPECIFIC concept the
 * answer got wrong or left out, since the brief calls for feedback that explains what was
 * missing, not just a number. Each wrong-answer case asserts `missing` contains a term
 * matching what was actually wrong, not just that the score is low.
 */

const TEST_USER_EMAIL = "smoketest-1789727986@example.com";
const TEST_PROJECT_NAME = "Cell Biology Unit";

interface EvalCase {
  label: string;
  conceptName: string;
  userAnswer: string;
  expectLowScore: boolean;
  /** If set, at least one `missing` entry must match this (case-insensitive). */
  expectMissingMatch?: RegExp;
}

const CASES: EvalCase[] = [
  {
    label: "wrong organelle and wrong product",
    conceptName: "Cellular Respiration",
    userAnswer: "Cellular respiration happens in the nucleus and produces sugar as the main output.",
    expectLowScore: true,
    expectMissingMatch: /mitochondri|ATP/i,
  },
  {
    label: "confuses chlorophyll with an unrelated substance",
    conceptName: "Chlorophyll",
    userAnswer: "Chlorophyll is a type of sugar stored in plant roots that helps with digestion.",
    expectLowScore: true,
    expectMissingMatch: /light|chloroplast|pigment|photosynthesis/i,
  },
  {
    label: "correct, complete answer (sanity check)",
    conceptName: "Photosynthesis",
    userAnswer:
      "Photosynthesis is the process where plants, algae, and some bacteria use chlorophyll in " +
      "chloroplasts to convert light energy into chemical energy, combining carbon dioxide and " +
      "water to produce glucose and releasing oxygen as a byproduct.",
    expectLowScore: false,
  },
];

interface EvalResult extends EvalCase {
  actualScore: number;
  missing: string[];
  feedbackText: string;
  pass: boolean;
  error?: string;
}

async function main() {
  const user = await prisma.user.findUnique({ where: { email: TEST_USER_EMAIL } });
  if (!user) {
    throw new Error(
      `Test user "${TEST_USER_EMAIL}" not found. Run the Phase 1 upload smoke test first.`,
    );
  }

  const project = await prisma.project.findFirst({ where: { userId: user.id, name: TEST_PROJECT_NAME } });
  if (!project) {
    throw new Error(`Project "${TEST_PROJECT_NAME}" not found for test user ${TEST_USER_EMAIL}.`);
  }

  const results: EvalResult[] = [];

  for (const testCase of CASES) {
    try {
      const concept = await prisma.concept.findFirst({
        where: { projectId: project.id, name: testCase.conceptName },
      });
      if (!concept) throw new Error(`Concept "${testCase.conceptName}" not found in seeded project`);

      const grading = await gradeOpenAnswer({
        userId: user.id,
        projectId: project.id,
        userAnswer: testCase.userAnswer,
        concept,
      });

      const scoreOk = testCase.expectLowScore ? grading.score < 70 : grading.score >= 70;
      const missingOk =
        !testCase.expectMissingMatch ||
        grading.missing.some((m) => testCase.expectMissingMatch!.test(m));

      results.push({
        ...testCase,
        actualScore: grading.score,
        missing: grading.missing,
        feedbackText: grading.feedbackText,
        pass: scoreOk && missingOk,
      });
    } catch (error) {
      results.push({
        ...testCase,
        actualScore: -1,
        missing: [],
        feedbackText: "",
        pass: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  for (const r of results) {
    console.log(`[${r.pass ? "PASS" : "FAIL"}] ${r.label} (concept: ${r.conceptName})`);
    console.log(`       score=${r.actualScore} (expect low=${r.expectLowScore}), missing=${JSON.stringify(r.missing)}`);
    if (r.error) console.log(`       error: ${r.error}`);
    else console.log(`       feedback: ${r.feedbackText.slice(0, 120)}...`);
  }

  const passCount = results.filter((r) => r.pass).length;
  console.log(`\n${passCount}/${results.length} cases passed`);

  const outDir = path.resolve(__dirname, "eval-results");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "quiz-eval.json");
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
